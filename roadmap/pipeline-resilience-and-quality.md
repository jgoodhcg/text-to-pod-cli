---
title: "Pipeline Resilience and Script Quality"
status: active
description: "Add scraping fallbacks and strengthen script quality across the pipeline."
tags: [area/pipeline, type/quality, tech/scraping]
priority: high
created: 2026-02-04
updated: 2026-02-04
effort: L
depends-on: []
---

# Pipeline Resilience and Script Quality

## Problem / Intent
Reduce failures when models cannot access URLs and improve script authenticity by grounding more content in source material.

## Constraints
Keep dependencies lightweight, preserve the existing five-stage pipeline and ESM setup, and avoid breaking current CLI flags or episode storage.

## Proposed Approach
Add a content accessibility check and automatic scraping fallback with site-specific extraction patterns, then store scraped content alongside episode metadata. Update script prompts to require sourced analogies, remove artificial hook language, strengthen people/group identification, vary sentence rhythm, and end with concrete details.

## Open Questions
Which HTML parser is preferred, should fallback scraping be opt-in or default, and how should scraped content be persisted for reuse?

## Notes

### Recent Improvements
- Removed token monitoring from metadata and script stages while preserving schema columns.
- Cleaned token console output and fixed unused variable warnings.
- Retuned TTS delivery for a calmer, scholarly tone while preserving the existing voice and script content.

### Web Scraping Fallback System (High Priority)
- Goal: Enable content retrieval when AI APIs refuse to access URLs.
- Problem: LLMs often cannot access content due to bot detection, IP restrictions, or site policies.
- Solution: Automatic fallback to direct scraping with site-specific extraction patterns.
- Implementation details:
  - Content accessibility test before scraping to detect access failures.
  - Automatic fallback when the model reports restricted access.
  - Site-specific patterns:
    - Reddit: Extract post content plus comment threads via JSON API or HTML parsing.
    - Hacker News: Extract article content plus comment threads from predictable HTML.
    - Extensible system for new patterns via TLD identification.
  - Content processing:
    - Forum content includes both source post and comments.
    - General content focuses on main article body.
    - HTML cleaning strips ads, navigation, and boilerplate.
  - Storage and caching in the database and episode directory for reuse.
  - CLI options: `--test-scraping`, `--force-scraping`, `--no-scraping`; default to automatic fallback.
  - Technical approach favors a lightweight HTML parser (e.g., `node-html-parser`) and pattern-based extraction with DB tracking.

### Content Quality Improvements (High Priority)
- Goal: Improve engagement by grounding scripts in source material and removing artificial phrasing.
- Planned changes:
  - Require at least three sourced analogies or metaphors from the content or comments.
  - Remove LLM-generated hook language that sounds unnatural.
