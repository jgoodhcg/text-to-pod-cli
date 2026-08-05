---
title: "HN Queue File Import"
status: done
description: "Allow batch episode generation from a local hn-queue.txt file containing Hacker News thread URLs or item IDs."
tags: [area/input, type/feature, tech/cli]
priority: medium
created: 2026-04-06
updated: 2026-04-23
effort: S
depends-on: []
---

# HN Queue File Import

## Problem / Intent
Hacker News favorites are not a good capture surface for "maybe later" podcast candidates. The CLI needs a lightweight personal queue format so interesting HN threads can be saved without polluting favorites or relying on authenticated scraping.

## Constraints
Keep the workflow local-first, avoid adding new external services, preserve existing URL-hash dedupe in SQLite, and keep the batch interface simple enough to manage by hand.

## Proposed Approach
Add a CLI input mode such as `--url-file <path>` or `--hn-queue <path>` that reads newline-delimited entries from a text file. Accept full Hacker News thread URLs and bare item IDs, normalize them to `https://news.ycombinator.com/item?id=<id>`, skip entries already present in the database, and run the existing pipeline sequentially for new items.

## Open Questions
Should the queue file support comments and blank lines? After successful processing, should entries remain in the file, be removed automatically, or be moved to a processed log? Should this import mode stay Hacker News-specific or generalize immediately into a broader URL queue file format?

## Notes
- Default filename could be `hn-queue.txt` at the repo root, with an override flag for custom paths.
- Dry-run mode should print the normalized thread URLs that would be processed without inserting episodes.
- Parsing should tolerate pasted URLs from HN, bare numeric item IDs, and surrounding whitespace.
- Dedupe should use the normalized conversation URL, not the external article URL.
- Sequential processing is safer than parallel runs because the existing pipeline is stateful and already designed around one episode at a time.
