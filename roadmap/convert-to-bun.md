---
title: "Convert to Bun"
status: planned
description: "Evaluate migrating the runtime from Node.js to Bun for performance and tooling gains."
tags: [tech/runtime, type/migration]
priority: low
created: 2026-02-04
updated: 2026-02-04
effort: L
depends-on: []
---

# Convert to Bun

## Problem / Intent
Replace the Node.js runtime with Bun for improved startup time, better performance, and a simplified toolchain. Bun's native TypeScript support and faster package manager could improve the development experience.

## Constraints
Maintain compatibility with existing dependencies (`better-sqlite3`, `commander`, `fast-xml-parser`), preserve all existing functionality, ensure SQLite database compatibility, and keep API integrations working (OpenAI endpoints).

## Proposed Approach
Migrate in phases: first ensure dependencies are Bun-compatible, then update `package.json` scripts and runtime configuration. Replace `better-sqlite3` with Bun's native `bun:sqlite` for better performance and fewer dependencies. Test all CLI commands, verify SQLite database operations, validate OpenAI API calls, and ensure `ffmpeg`/`s3cmd` integration still works.

## Open Questions
Are there any Node.js-specific APIs in use that Bun does not support? Will the migration from `better-sqlite3` APIs to `bun:sqlite` APIs be 1:1 or require adapter logic?

## Notes
- Audit dependencies for Bun compatibility.
- Update `package.json` to use Bun instead of Node in scripts.
- Replace Node.js-specific APIs with Bun-compatible alternatives.
- Update the build process (Bun simplifies TypeScript compilation).
- Test all CLI commands end-to-end.
- Verify SQLite database read/write operations.
- Validate OpenAI API integration.
- Confirm `ffmpeg` and `s3cmd` subprocess calls work.
- Update documentation and `AGENTS.md` references to Node to Bun.
- Benchmark performance improvements.
