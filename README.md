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

Open a pull request that adds one entry. Check that the folder exists and has a `SKILL.md` and a licence.
