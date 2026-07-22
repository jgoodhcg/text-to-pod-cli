---
title: "HN Digest Episodes"
status: idea
description: "Let a local agentic tool (opencode/claude/codex) fetch, group, and script HN queue batches into multi-story digest episodes; the CLI handles audio onward."
tags: [area/pipeline, type/feature, tech/cli]
priority: medium
created: 2026-07-21
updated: 2026-07-21
effort: M
depends-on: []
---

# HN Digest Episodes

## Problem / Intent
The current pipeline turns each URL into its own episode. When a large batch of newly upvoted Hacker News items accumulates (tens to a hundred+), one episode per link is too granular and misses the interesting part: what the set of stories has in common. Instead of building grouping and multi-story script generation into the CLI, hand the URL batch to a local agentic tool (opencode, Claude Code, or Codex) that fetches the content itself, clusters the items into a few categories, and writes one longer digest script per category — per-headline segments in the existing scholarly voice plus synthesis of how the set relates as a whole. The CLI takes over from the audio stage.

## Constraints
- Build on the existing URL-file queue workflow (`hn-upvoted-page-snippet.js` export → queue file); no new capture surface.
- The agent brief must be tool-agnostic (readable by opencode/claude/codex), not baked into one vendor's config.
- Preserve the low-energy browsing voice; no punchy or clickbaity roundup tone.
- Keep the per-URL pipeline untouched; digest mode is a separate artifact flow, not new pipeline stages.
- The agent's output must satisfy the existing script artifact contract: `resources/episodes/<episodeId>/script.json` as `[{persona, text}]` segments, resumable via `--episode-dir <dir> --start-stage audio`.
- Merge/publish/feed need episode metadata (title, description, source key) that the metadata stage normally creates; the handoff must supply it without running that stage.

## Proposed Approach
1. **Document the artifact contract**: script.json schema, episode dir layout, and the minimal episode metadata fields merge/publish require. This is the stable interface between agent and CLI.
2. **Add a digest scaffold/import command** (e.g. `--digest-manifest <path>`): given a manifest of categories → member URLs → script file paths (+ title/description per episode), create episode dirs and SQLite records so `--start-stage audio` works end-to-end. Validate the manual workaround first: create record + dir, drop a hand-written script.json, run from `audio` with `--dry-run` (cross-reference `arbitrary-text-input.md` "Supply Script Directly").
3. **Write the agent brief** (e.g. `docs/digest-agent-brief.md` or a repo skill): given a queue file, fetch content per URL (thread page at minimum, article when accessible), cluster into a configurable number of categories, produce the manifest, then write each digest script with per-headline segments plus cross-set connective analysis, in the voice defined by the existing script prompts.
4. **Run the tail end with existing flags**: `bun run dev -- --episode-dir <dir> --start-stage audio` per digest episode; long scripts already chunk via `--max-script-chars`.

## Open Questions
- Does the agent write into the feed as the main show, or should digest episodes carry a distinct title prefix / separate feed?
- Dedupe semantics: do digest member URLs mark items "covered" for future single-URL runs (and vice versa)?
- Cost/quality knob for the agent: fetch full article content for every member, or allow thread-only segments for inaccessible pages?
- Should the manifest be human-editable before scripting (review categories, drop items) — and is that review in the brief or the scaffold command?
- Where does the brief live so all three tools pick it up naturally: `docs/`, a `.claude/skills/` entry, or AGENTS.md-adjacent?

## Notes
- The grouping step is free-form agent reasoning, so no new billed model calls are needed in the CLI itself — the agent replaces metadata/script stages for digest episodes only.
- Keep the manifest format simple (JSON or YAML): category title, summary, member URLs, per-episode script path.
- A sample hand-authored digest episode is the cheapest validation of the whole flow before any scaffold code lands.
- If the agent flow proves out, a future iteration could move grouping back into the CLI as an LLM stage; the artifact contract stays the same either way.
