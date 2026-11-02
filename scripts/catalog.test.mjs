import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { buildCatalog, checkChange, frontmatter } from './catalog.mjs';

let root;
const put = (rel, text) => {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
};
const external = { name: 'frontend-design', displayName: 'Frontend design', description: 'Builds pages.', github: 'anthropics/skills/skills/frontend-design', tags: ['design'] };
const skill = (name, description = `${name} does a thing.`) => {
  put(`skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: ${description}\n---\nBody.\n`);
  put(`skills/${name}/LICENSE`, 'MIT License\n');
};

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'forge-skills-'));
  put('skills-catalog.json', `${JSON.stringify({ version: 1, skills: [external] }, null, 2)}\n`);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test('keeps the other entries first and as they are, then one entry per skill folder, by name', () => {
  skill('zebra-notes');
  skill('alpha-notes', "'Quoted: with a colon'");
  const { catalog, problems } = buildCatalog(root);
  assert.deepEqual(problems, []);
  assert.deepEqual(catalog.skills.map((s) => s.name), ['frontend-design', 'alpha-notes', 'zebra-notes']);
  assert.deepEqual(catalog.skills[0], external);
  assert.deepEqual(catalog.skills[1], { name: 'alpha-notes', displayName: 'Alpha notes', description: 'Quoted: with a colon', github: 'ikarmicai/forge-skills/skills/alpha-notes' });
});

test('a clean folder whose name another repository already has is refused', () => {
  skill('frontend-design');
  assert.match(checkChange(root, ['skills/frontend-design/SKILL.md']).join(' '), /already lists a skill called frontend-design from another repository/);
});

test('keeps a display name and tags set by hand, and follows SKILL.md for the description', () => {
  skill('pdf-notes', 'New words.');
  put('skills-catalog.json', JSON.stringify({ version: 1, skills: [external, { name: 'pdf-notes', displayName: 'PDF notes', description: 'Old.', github: 'ikarmicai/forge-skills/skills/pdf-notes', tags: ['pdf'] }] }));
  const got = buildCatalog(root).catalog.skills.find((s) => s.name === 'pdf-notes');
  assert.deepEqual(got, { name: 'pdf-notes', displayName: 'PDF notes', description: 'New words.', github: 'ikarmicai/forge-skills/skills/pdf-notes', tags: ['pdf'] });
});

test('drops an entry whose folder was removed, and leaves out a broken folder with a reason', () => {
  put('skills-catalog.json', JSON.stringify({ version: 1, skills: [{ name: 'gone', displayName: 'Gone', description: 'x', github: 'ikarmicai/forge-skills/skills/gone' }] }));
  put('skills/broken/SKILL.md', '---\nname: other\ndescription: x\n---\n');
  const { catalog, problems } = buildCatalog(root);
  assert.deepEqual(catalog.skills, []);
  assert.ok(problems.some((p) => p.includes('there is no licence file')));
  assert.ok(problems.some((p) => p.includes('its name is "other"')));
});

test('a pull request with one good skill folder passes', () => {
  skill('pdf-notes');
  assert.deepEqual(checkChange(root, ['skills/pdf-notes/SKILL.md', 'skills/pdf-notes/LICENSE']), []);
});

test('a pull request that touches the catalog, a workflow or two skills is refused', () => {
  skill('a-one');
  skill('b-two');
  const p = checkChange(root, ['skills-catalog.json', '.github/workflows/x.yml', 'skills/a-one/SKILL.md', 'skills/b-two/SKILL.md']);
  assert.ok(p.some((x) => x.includes('It also changes: skills-catalog.json, .github/workflows/x.yml')));
  assert.ok(p.some((x) => x.includes('One skill per pull request')));
});

test('a key, a .env file or a Windows name is refused', () => {
  skill('pdf-notes');
  put('skills/pdf-notes/notes.md', `token ghp_${'a'.repeat(36)}\n`);
  put('skills/pdf-notes/.env', 'X=1\n');
  // Windows cannot even create this name (it becomes a hidden stream), so that part runs where the workflow runs.
  if (process.platform !== 'win32') put('skills/pdf-notes/a:b.md', 'x\n');
  const p = checkChange(root, ['skills/pdf-notes/SKILL.md']).join(' ');
  assert.match(p, /notes\.md: looks like it holds a key/);
  assert.match(p, /\.env: version control, packages, keys/);
  if (process.platform !== 'win32') assert.match(p, /a:b\.md: a name Windows cannot use/);
});

test('reads frontmatter the way Forge does', () => {
  assert.equal(frontmatter('---\nname: a\ndescription: "x # y"\n---\n').get('description'), 'x # y');
  assert.equal(frontmatter('---\ndescription: x # comment\n---\n').get('description'), 'x');
});
