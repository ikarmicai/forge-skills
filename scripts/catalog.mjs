#!/usr/bin/env node
/**
 * The Forge skills catalog, kept by this repository instead of by each pull request.
 *
 *   node scripts/catalog.mjs build          rewrite skills-catalog.json from skills/<name>/SKILL.md, keeping the entries
 *                                           that point at other repositories as they are
 *   node scripts/catalog.mjs check <base>   check a pull request against <base> (a git ref): it adds or changes one skill
 *                                           folder under skills/ and nothing else, and that folder is a skill Forge can use
 *
 * A pull request never edits skills-catalog.json, so two of them never conflict. No dependencies: Node 20 or later.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const REPO = 'ikarmicai/forge-skills';
const CATALOG = 'skills-catalog.json';
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DESCRIPTION_MAX = 160;
const LIMITS = { files: 100, fileBytes: 2 * 1024 * 1024, totalBytes: 5 * 1024 * 1024 };
const LICENCE = /^(?:licen[cs]e|copying)(?:[.-][^/]*)?$/i;
const FORBIDDEN = /(^|\/)(\.git|node_modules)(\/|$)|(^|\/)\.env(\.[^/]*)?$|\.(pem|key|p12|pfx)$|(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/i;
const WINDOWS_BAD = /[<>:"|?*\\]|[ .]$|^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
// The same kinds of secret Forge refuses before it sends a skill; a second look, since a pull request can come from anywhere.
const SECRETS = [
  /gh[pousr]_[A-Za-z0-9]{36,}/,
  /github_pat_[A-Za-z0-9_]{60,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /xox[abpr]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

/** `name:` and `description:` at the top of a SKILL.md, read the way Forge reads them (quotes removed). */
export function frontmatter(text) {
  const fields = new Map();
  if (!text.startsWith('---')) return fields;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return fields;
  for (const line of text.slice(3, end).split(/\r?\n/)) {
    const t = line.trim();
    const colon = t.indexOf(':');
    if (!t || t.startsWith('#') || colon < 0) continue;
    let value = t.slice(colon + 1).trim();
    const quoted = value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
    value = quoted ? value.slice(1, -1) : value.replace(/\s+#.*$/, '').trim();
    fields.set(t.slice(0, colon).trim(), value);
  }
  return fields;
}

const titleCase = (name) => {
  const words = name.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function filesOf(dir, rel = '') {
  const out = [];
  for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isSymbolicLink()) out.push({ rel: r, link: true });
    else if (e.isDirectory()) out.push(...filesOf(dir, r));
    else if (e.isFile()) out.push({ rel: r, size: statSync(path.join(dir, r)).size });
  }
  return out;
}

/** Every reason the folder `skills/<name>` is not a skill this repository takes; empty when it is. */
export function folderProblems(root, name) {
  const dir = path.join(root, 'skills', name);
  const problems = [];
  if (!NAME.test(name) || name.length > 64) problems.push(`skills/${name}: the folder name must be lower case letters, digits and single hyphens, at most 64 characters.`);
  if (!existsSync(path.join(dir, 'SKILL.md'))) return [...problems, `skills/${name}: there is no SKILL.md.`];
  const files = filesOf(dir);
  if (files.length > LIMITS.files) problems.push(`skills/${name}: too many files (${files.length}; at most ${LIMITS.files}).`);
  let total = 0;
  for (const f of files) {
    if (f.link) {
      problems.push(`skills/${name}/${f.rel}: links are not allowed.`);
      continue;
    }
    total += f.size;
    if (f.size > LIMITS.fileBytes) problems.push(`skills/${name}/${f.rel}: larger than 2 MB.`);
    if (FORBIDDEN.test(f.rel)) problems.push(`skills/${name}/${f.rel}: version control, packages, keys and environment files do not belong in a skill.`);
    if (f.rel.split('/').some((p) => WINDOWS_BAD.test(p))) problems.push(`skills/${name}/${f.rel}: a name Windows cannot use.`);
    if (f.size <= LIMITS.fileBytes) {
      const text = readFileSync(path.join(dir, f.rel), 'latin1');
      if (SECRETS.some((re) => re.test(text))) problems.push(`skills/${name}/${f.rel}: looks like it holds a key or a password.`);
    }
  }
  if (total > LIMITS.totalBytes) problems.push(`skills/${name}: the files are larger than 5 MB together.`);
  const lower = new Map();
  for (const f of files) {
    const k = f.rel.toLowerCase();
    if (lower.has(k)) problems.push(`skills/${name}: ${f.rel} and ${lower.get(k)} differ only by case.`);
    lower.set(k, f.rel);
  }
  if (!files.some((f) => !f.rel.includes('/') && LICENCE.test(f.rel))) problems.push(`skills/${name}: there is no licence file (LICENSE) at the top of the folder.`);
  const fields = frontmatter(readFileSync(path.join(dir, 'SKILL.md'), 'utf8'));
  const named = fields.get('name') ?? '';
  const description = fields.get('description') ?? '';
  if (named !== name) problems.push(`skills/${name}/SKILL.md: its name is "${named}", but the folder is "${name}". They must match.`);
  if (!description.trim()) problems.push(`skills/${name}/SKILL.md: it needs a description.`);
  else if (description.length > DESCRIPTION_MAX) problems.push(`skills/${name}/SKILL.md: the description is over ${DESCRIPTION_MAX} characters.`);
  return problems;
}

/** The catalog: the entries that point elsewhere, as they are, and one entry per folder in skills/, sorted by name. */
export function buildCatalog(root) {
  const current = JSON.parse(readFileSync(path.join(root, CATALOG), 'utf8'));
  if (current.version !== 1 || !Array.isArray(current.skills)) throw new Error(`${CATALOG} is not a version 1 catalog.`);
  const ours = `${REPO}/skills/`;
  const external = current.skills.filter((s) => !String(s.github).startsWith(ours));
  const before = new Map(current.skills.filter((s) => String(s.github).startsWith(ours)).map((s) => [s.name, s]));
  const skillsDir = path.join(root, 'skills');
  const names = existsSync(skillsDir) ? readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
  const problems = [];
  const local = [];
  for (const name of names.sort()) {
    const p = folderProblems(root, name);
    if (p.length) {
      problems.push(...p);
      continue;
    }
    if (external.some((s) => s.name === name)) {
      problems.push(`skills/${name}: the catalog already lists a skill called ${name} from another repository.`);
      continue;
    }
    const fields = frontmatter(readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8'));
    // A display name or tags a maintainer set by hand are kept; the description always follows SKILL.md.
    const old = before.get(name);
    local.push({
      name,
      displayName: old?.displayName ?? titleCase(name),
      description: fields.get('description'),
      github: `${ours}${name}`,
      ...(old?.tags ? { tags: old.tags } : {}),
    });
  }
  // The entries that point elsewhere keep their order (a maintainer chose it); this repository's own follow, by name.
  return { catalog: { ...current, skills: [...external, ...local] }, problems };
}

/** The files a pull request changes, against `base`. */
function changedFiles(root, base) {
  const out = execFileSync('git', ['diff', '--name-only', '--no-renames', `${base}...HEAD`], { cwd: root, encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

/** Every reason the pull request is not one skill folder; empty when it is. */
export function checkChange(root, changed) {
  const problems = [];
  const outside = changed.filter((f) => !/^skills\/[^/]+\/.+/.test(f));
  if (outside.length) problems.push(`A pull request changes only one folder under skills/. It also changes: ${outside.slice(0, 5).join(', ')}.`);
  const folders = [...new Set(changed.filter((f) => f.startsWith('skills/')).map((f) => f.split('/')[1]))];
  if (folders.length > 1) problems.push(`One skill per pull request: this one changes ${folders.join(', ')}.`);
  for (const name of folders) {
    if (existsSync(path.join(root, 'skills', name))) problems.push(...folderProblems(root, name));
  }
  const { problems: catalogProblems } = buildCatalog(root);
  problems.push(...catalogProblems.filter((p) => folders.some((n) => p.startsWith(`skills/${n}`))));
  return [...new Set(problems)];
}

function main(argv) {
  const root = process.cwd();
  const [cmd, base] = argv;
  if (cmd === 'build') {
    const { catalog, problems } = buildCatalog(root);
    for (const p of problems) console.error(`left out: ${p}`);
    const text = `${JSON.stringify(catalog, null, 2)}\n`;
    if (readFileSync(path.join(root, CATALOG), 'utf8') === text) {
      console.log('The catalog is up to date.');
      return 0;
    }
    writeFileSync(path.join(root, CATALOG), text);
    console.log(`Wrote ${CATALOG}: ${catalog.skills.length} skills.`);
    return 0;
  }
  if (cmd === 'check' && base) {
    const problems = checkChange(root, changedFiles(root, base));
    for (const p of problems) console.error(`- ${p}`);
    if (problems.length) {
      console.error(`\nThis pull request cannot be merged yet (${problems.length} problem${problems.length === 1 ? '' : 's'}).`);
      return 1;
    }
    console.log('The skill folder is fine.');
    return 0;
  }
  console.error('Usage: node scripts/catalog.mjs build | check <base-ref>');
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('catalog.mjs')) process.exitCode = main(process.argv.slice(2));
