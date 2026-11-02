# Forge skills catalog

The list that **Browse catalog** shows on the Skills page of [IKarmic AI Forge](https://github.com/ikarmicai), and that `forge skill search` and `forge skill install` read. Forge fetches `skills-catalog.json` from this repository's `main` branch.

Each entry points at a folder with a `SKILL.md` in someone's public repository. This repository holds no skills of its own, only the list. Installing one is always a click or a command by the person using Forge.

## Format

```json
{
  "version": 1,
  "skills": [
    {
      "name": "frontend-design",
      "displayName": "Frontend design",
      "description": "One sentence of at most 160 characters, ending with a full stop.",
      "github": "owner/repo/path/to/skill-folder",
      "tags": ["design"]
    }
  ]
}
```

- `name`: lower case, letters, digits and hyphens. It is the skill's folder name.
- `github`: `owner/repo/folder`. The folder must hold a `SKILL.md`.
- Add only skills whose folder ships a licence file you have read.

## Adding a skill

**A skill of your own.** Put it in `skills/<name>/` in one pull request: a `SKILL.md` whose `name` is the folder name and whose `description` is one sentence of at most 160 characters, a licence file (`LICENSE`) at the top of the folder, and whatever scripts, references and assets the skill uses. Forge does this for you: Settings → Skills → Share, or `forge skill publish <name>`.

- Do not edit `skills-catalog.json`. After a merge, the *Build catalog* workflow adds the skill to it from its `SKILL.md`.
- One skill per pull request, and nothing outside its folder.
- No keys, passwords, `.env` files, `.git` or `node_modules`; at most 100 files, 2 MB a file and 5 MB in all; names that work on Windows too.
- The *Check skill* workflow checks all of this on every pull request, with the rules from `main`.

**A skill in someone else's repository.** Open a pull request that adds one entry to `skills-catalog.json`, pointing at a folder with a `SKILL.md` and a licence you have read. These entries are kept as they are by the workflow. (The check workflow refuses any change outside `skills/`, so a maintainer reviews and merges these by hand.)

## Maintainers

- `node scripts/catalog.mjs build` rebuilds the catalog locally; `node --test scripts/catalog.test.mjs` tests it.
- The *Build catalog* workflow pushes to `main` as `github-actions[bot]`. If `main` is protected, allow that bot to push, or the catalog stops being updated.
