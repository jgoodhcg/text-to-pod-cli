# Shared Agent Guidelines

## Workflow Preferences
- Work one step at a time: confirm understanding, make a focused change, then report results.
- Keep diffs minimal; avoid opportunistic refactors or formatting churn.
- Prefer `rg` for search and `apply_patch` for single-file edits.
- Ask before running commands outside the allowed verification list.
- When instructing users to publish, default to `npm run dev -- --run-stage publish ...` to avoid stale `dist/` builds.
- Never run:
  - `npm start` or `npm run dev` with real URLs, live API calls, or `--run-stage publish`.
  - `s3cmd`, `ffmpeg`, or any publish/upload commands without explicit user request.
  - Destructive commands like `rm -rf` or deleting `data/episodes.db` or `resources/episodes/`.

## Development Context
- Repo: Node.js + TypeScript CLI (`type: module`), built with `tsc`, run with `node` or `tsx`.
- Required tooling: Node 20+, `ffmpeg` for audio merge, `s3cmd` for publish.
- Key directories: `src/` (TS source), `dist/` (build output), `data/` (SQLite), `resources/` (audio/RSS assets), `roadmap/` (planning system).
- Generated files:
  - `dist/` (compiled CLI output).
  - `data/episodes.db` (runtime SQLite database).
  - `resources/episodes/<episodeId>/script.json` and `resources/episodes/<episodeId>/audio/`.
  - `resources/podcast.xml` or configured RSS feed path.

## Tech Stack
- Language/runtime: TypeScript on Node.js 20+ (ESM).
- CLI framework: `commander`.
- Storage: SQLite via `better-sqlite3`.
- External APIs: OpenAI Responses + TTS endpoints.
- Media + publish: `ffmpeg`, `s3cmd`, XML parsing with `fast-xml-parser`.

## Allowed Verification Commands
- Only run the commands listed below without asking.
- If a check needs network access or mutates runtime data, ask first.

| Command | Purpose |
| --- | --- |
| `npm run build` | Type-check and emit `dist/` |
| `node dist/cli.js --help` | Verify CLI wiring after build |
| `npm run dev -- --help` | Verify CLI wiring without build |

## User-Only Commands
- Run these only when the user explicitly requests them.
- Never run:
  - Commands that trigger live API usage, publishing, or uploads.
  - Commands that modify real episode data or audio assets.

| Command | Reason |
| --- | --- |
| `npm start -- --url ...` | Triggers live OpenAI calls and writes episode data |
| `npm run dev -- --url ...` | Same as above, plus edits runtime artifacts |
| `npm run dev -- --run-stage publish ...` | Publishes and uploads RSS/audio (preferred publish path) |
| `npm start -- --run-stage publish ...` | Publishes and uploads RSS/audio (discouraged if `dist/` is stale) |
| `s3cmd *` | Uploads to Spaces; user-controlled credentials |
| `ffmpeg *` | Mutates audio assets and should be user-directed |
