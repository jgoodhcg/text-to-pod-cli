# AGENTS

Follows AGENT_BLUEPRINT.md

## Project Overview
A Node.js + TypeScript CLI that turns source URLs into scholarly podcast episodes using a multi-stage script pipeline, SQLite storage, and optional audio/publish tooling.

## Validation Commands

| Level | Command | When |
|-------|---------|------|
| 1 | (none configured) | Formatter/linter not set up |
| 2 | `npm run build` | After code changes |
| 3 | (none configured) | No unit tests set up |
| 4 | (none configured) | No E2E tests set up |

## Allowed Commands
- `npm run build` — Type-check and emit `dist/`
- `node dist/cli.js --help` — Verify CLI wiring after build
- `npm run dev -- --help` — Verify CLI wiring without build

## Require Confirmation
- Any command outside the allowed list
- Dependency installs or upgrades
- Network calls or anything that spends money
- Database writes, migrations, or data changes
- Publishing, deployment, or uploads
- Background processes or watchers
- Writing outside the repo boundary

## Never Run
- `npm start` or `npm run dev` with real URLs, live API calls, or `--run-stage publish`
- `s3cmd *` — uploads to Spaces
- `ffmpeg *` — mutates audio assets
- Destructive commands like `rm -rf` or deleting `data/episodes.db` or `resources/episodes/`

## Project-Specific Rules
- Work one step at a time: confirm understanding, make a focused change, then report results.
- Keep diffs minimal; avoid opportunistic refactors or formatting churn.
- Prefer `rg` for search and `apply_patch` for single-file edits.
- Ask before running commands outside the allowed verification list.
- When instructing users to publish, default to `npm run dev -- --run-stage publish ...` to avoid stale `dist/` builds.

## Key Files
- `src/` — TypeScript source
- `dist/` — compiled CLI output (generated)
- `data/` — SQLite database (runtime)
- `resources/` — audio/RSS assets (runtime)
- `roadmap/` — project planning system
- `AGENT_BLUEPRINT.md` — shared agent policy
