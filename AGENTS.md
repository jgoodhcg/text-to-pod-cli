# AGENTS

Follows `AGENT_BLUEPRINT.md` (version: 2026-06-17)

## Project Overview

A Bun + TypeScript CLI that turns source URLs into scholarly podcast episodes using a staged pipeline: metadata extraction, script outline/content/refinement, audio synthesis, merge, and optional publish. Runtime state lives in SQLite and episode artifacts live under `resources/episodes/`.

## Stack

- Bun 1.3.x for local execution
- TypeScript with `tsc` for builds
- SQLite via Bun's `bun:sqlite`
- OpenRouter for metadata, script generation, and speech by default; direct OpenAI remains available via provider flags

## Environment

- Runtime: Bun
- Lockfile: `package-lock.json`
- Setup: `npm ci` or `bun install`

## Commit Trailer Template

Store a template, not concrete runtime values.

```text
Co-authored-by: [AI_PRODUCT_NAME] <[AI_PRODUCT_EMAIL]>
AI-Provider: [AI_PROVIDER]
AI-Product: [AI_PRODUCT_LINE]
AI-Model: [AI_MODEL]
```

Template rules:
- `AI_PRODUCT_LINE` must be one of: `codex|claude|gemini|opencode`.
- Determine `AI_PRODUCT_LINE` from the active runtime/tooling context at commit time.
- Determine `AI_PROVIDER` and `AI_MODEL` from runtime metadata at commit time.
- Resolve `AI_PRODUCT_NAME` and `AI_PRODUCT_EMAIL` from the model name using `AGENT_BLUEPRINT.md` section `[BP-WF-COMMIT]`.
- Fill this template at commit time; never persist filled runtime values in `AGENTS.md`.
- For multi-model attribution, follow `AGENT_BLUEPRINT.md` section `[BP-WF-COMMIT-MULTI]`.

## Validation Commands

| Level | Command | When |
|-------|---------|------|
| 1 | (none configured) | Formatter/linter not set up |
| 2 | `bun run build` | After code changes |
| 3 | (none configured) | No unit tests set up |
| 4 | (none configured) | No E2E tests set up |

## Execution Modes

Use one policy file for both paired local work and any future autonomous workflow runs. Shared repo rules always apply.

### Shared Rules

- `roadmap/` is the canonical planning surface.
- This repo currently uses named roadmap work units without numeric ID prefixes.
- Validation commands are defined above and applied when relevant.
- Keep changes minimal and scoped to the requested task or work unit.

### Runtime: Interactive Local

- Require user confirmation before `git commit`.
- Require user confirmation before installs, upgrades, network calls with external side effects, database writes, publishing, or actions outside the repo.
- It is acceptable to stop for clarification when scope is ambiguous.
- Allowed verification commands without extra confirmation:
  - `bun run build`
  - `bun dist/cli.js --help`
  - `bun run dev -- --help`

### Runtime: Autonomous Workflow

- No autonomous workflow is configured in this repo yet.
- If added later, the referenced `roadmap/` file must be the canonical brief and the workflow must follow `AGENT_BLUEPRINT.md` section `[BP-WF-AUTO]`.

## Never Run

- `bun run start` or `bun run dev` with real URLs, live API calls, or `--run-stage publish`
- `s3cmd *` — uploads to Spaces
- `ffmpeg *` — mutates audio assets
- Destructive commands like `rm -rf` or deleting `data/episodes.db` or `resources/episodes/`

## Project-Specific Rules

- Keep diffs minimal; avoid opportunistic refactors or formatting churn.
- Prefer `rg` for search and `apply_patch` for focused file edits.
- Ask before running commands outside the allowed verification list.
- Use `hn-upvoted-page-snippet.js` for manual browser-console export of visible Hacker News upvoted pages; do not commit exported content-link queue files unless explicitly requested.
- When instructing users to publish, default to `bun run dev -- --run-stage publish ...` to avoid stale `dist/` builds.
- For script-quality work, preserve the low-energy browsing voice and avoid introducing punchy or clickbaity tone.

## Decision Artifacts

- For high-impact or irreversible decisions, record structured comparisons in `.decisions/`.
- Treat any decision JSON in `.decisions/` as the authoritative record when present.

## References

- For shared policy and commit attribution rules, see `AGENT_BLUEPRINT.md`.
- For roadmap conventions, see `roadmap/README.md`.
- For OpenAI model updates, see https://developers.openai.com/api/docs/models/all

## Key Files

- `src/` — TypeScript source
- `src/config.ts` — models, prompt templates, and pipeline defaults
- `src/stages/` — stage implementations for metadata, script, audio, merge, and publish
- `data/` — SQLite database and runtime state
- `resources/` — generated episode assets and feed artifacts
- `roadmap/` — planning surface and work units
- `hn-upvoted-page-snippet.js` — browser-console helper for exporting visible HN upvoted pages into URL-file queues
- `AGENT_BLUEPRINT.md` — shared agent policy

## User Profile

See `.agent-profile.md` (git-ignored) for interaction preferences. Create or update it during project init or alignment work.
