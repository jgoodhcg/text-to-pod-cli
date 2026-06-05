---
title: "Convert to Bun"
status: done
description: "Use Bun for local TypeScript execution while preserving tsc validation."
tags: [tech/runtime, type/migration]
priority: low
created: 2026-02-04
updated: 2026-06-05
effort: L
depends-on: []
---

# Convert to Bun

## Problem / Intent
Use Bun for local CLI execution and package scripts while preserving the
existing TypeScript build and dependency stack. This gives faster local startup
and native TypeScript execution without coupling the migration to a database
adapter rewrite.

## Constraints
Maintain compatibility with existing dependencies (`commander`,
`fast-xml-parser`, `openai`), preserve SQLite database compatibility, and keep
external process integration (`ffmpeg`, `s3cmd`) working.

## Proposed Approach
Update `package.json` scripts so `dev` and `start` run through Bun. Keep `tsc`
for `build` so type validation remains unchanged. Swap the database wrapper to
Bun's native `bun:sqlite` while preserving the repository API used by the rest
of the pipeline.

## Open Questions
Should a future follow-up remove now-unused Node-era dependencies such as
`better-sqlite3`, `tsx`, and `ts-node` from `package.json` and the lockfile?

## Notes
- Updated `package.json` to use Bun for `dev` and `start`.
- Kept `tsc` as the validation build command.
- Swapped the database wrapper from `better-sqlite3` to `bun:sqlite`.
- Verified `bun run build`.
- Verified `bun run dev -- --help`.
- Verified a provider dry-run against an existing episode.
- Updated README and `AGENTS.md` references to Bun.
- Deferred dependency and lockfile pruning.
