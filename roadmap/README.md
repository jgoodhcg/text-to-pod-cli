# Roadmap System

This project uses the roadmap system defined in `AGENT_BLUEPRINT.md`.

## Structure
- `roadmap/index.md`: Project overview and directory of work units.
- `roadmap/_template.md`: Starting point for new work unit files.
- `roadmap/*.md`: Individual work units (each with YAML frontmatter).
- `roadmap/archived/`: Completed or dropped work units.

## Rules
- `roadmap/index.md` existence identifies a compatible project.
- Every work unit file must begin with valid YAML frontmatter.
- Status lives in frontmatter, not in prose.
- Small ideas can live as bullets in `index.md`; promote to files when they need detail.
- When a work unit reaches `done` or `dropped`, move it to `archived/`.
- Update the `updated` field whenever you modify a work unit.
- Use consistent tag prefixes: `area/`, `type/`, `tech/`.
