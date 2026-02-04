---
title: "Codebase Cleanup"
status: planned
description: "Remove unused code, legacy configuration, and dead paths to reduce maintenance burden."
tags: [area/maintenance, type/chore]
priority: medium
created: 2026-02-04
updated: 2026-02-04
effort: M
depends-on: []
---

# Codebase Cleanup

## Problem / Intent
Remove unused code, dead configuration, and legacy artifacts that have accumulated during development. Reduce maintenance burden and improve code clarity.

## Constraints
Do not break existing functionality and preserve useful comments and documentation.

## Proposed Approach
Audit each source file for unused exports, dead code paths, orphaned configuration values, and legacy patterns that are no longer used.

## Open Questions
None currently.

## Notes
- Audit `config.ts` for unused configuration values.
- Check for unused exports across all source files.
- Remove dead code paths and commented-out code.
- Clean up unused type definitions.
- Verify database schema columns are all used.
- Remove any orphaned prompt templates or legacy prompt versions.
- Run full pipeline test after cleanup to confirm nothing broke.

### Additional Context
- Token monitoring was recently removed but schema columns were preserved; verify if those columns should stay or go.
- The old single-stage `SCRIPT_SYSTEM`/`SCRIPT_USER` prompts may be unused now that multi-stage generation is in place.
