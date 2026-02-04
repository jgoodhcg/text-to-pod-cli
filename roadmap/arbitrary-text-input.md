---
title: "Arbitrary Text Document Input"
status: planned
description: "Allow generating episodes from local files or pasted text instead of URLs."
tags: [area/input, type/feature, tech/cli]
priority: medium
created: 2026-02-04
updated: 2026-02-04
effort: M
depends-on: []
---

# Arbitrary Text Document Input

## Problem / Intent
Currently the CLI only accepts URLs as input, requiring web-accessible content. Users should be able to generate episodes from local text files, markdown documents, PDFs, or pasted text directly.

## Constraints
Preserve the existing URL-based workflow as default, reuse the existing script generation pipeline stages, and maintain CLI simplicity.

## Proposed Approach
Add a `--file` or `--text` input mode that bypasses the metadata URL fetch and injects document content directly into the script generation context. Detect file type and extract plain text appropriately.

## Open Questions
Should metadata (title, author, date) be inferred from document content or required via CLI flags? How should documents without natural discussion/comment context be handled?

## Notes
- Add CLI flags for file input (`--file <path>`) and stdin/text input (`--text <content>`).
- Implement file type detection and text extraction (plain text, markdown, PDF).
- Create an alternate metadata stage that derives title/summary from document content rather than URL fetch.
- Adjust script prompts to handle content without comment threads gracefully.
- Store source file path or hash in episode metadata for reference.

### Alternative: Supply Script Directly
- The existing `--stage` flag may already support skipping to audio generation with a pre-written script file.
- Test whether supplying a script JSON and running from `audio` stage works end-to-end.
- If viable, this provides a manual workaround without new code.
- Verify: create episode record, place `script.json` manually, run `--stage audio` onwards.
