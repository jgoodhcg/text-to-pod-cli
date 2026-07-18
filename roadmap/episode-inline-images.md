---
title: "Inline Show-Notes Images"
status: idea
description: "Capture images from the source URL and embed them in episode show notes / RSS description."
tags: [area/artwork, area/publish, type/feature, tech/scraping]
priority: medium
created: 2026-07-17
updated: 2026-07-17
effort: M
depends-on: []
---

# Inline Show-Notes Images

## Problem / Intent
Episode show notes are text-only. The source URL often contains informative figures, diagrams, screenshots, or an Open Graph image that would give listeners visual context. The metadata stage currently discards these; publishing embeds only the feed-level cover art, so every episode item shares one image and no source visuals surface.

## Constraints
- Must not block or slow the existing pipeline; image extraction should extend the metadata stage without new network round-trips beyond the existing fetch
- RSS `<description>` is HTML CDATA today (`buildHtmlDescription` in `src/stages/publish.ts`); inline `<img>` tags must remain valid RSS and render in major podcast clients
- Respect source licensing and attribution; hot-linking remote images is fragile, so prefer downloading and republishing to Spaces alongside audio
- Keep the scholarly, low-energy tone — no decorative images, only content-bearing figures
- Must not conflict with the separate `episode-artwork-replicate.md` work unit (generated cover art)

## Proposed Approach
1. In the metadata stage, extract candidate images from the fetched source: `<meta property="og:image">`, `<figure>`, `<img>` with meaningful `alt`, and article hero images
2. Store a small curated list (e.g., top 1–5) in the episode record alongside existing metadata
3. Download chosen images and upload to Spaces under `resources/episodes/<episode_id>/images/`, mirroring the audio asset flow
4. Extend `buildHtmlDescription` in `src/stages/publish.ts` to render an inline `<figure><img><figcaption>` block within the existing CDATA description
5. Add a `--max-inline-images <n>` CLI flag (default small, e.g., 3) and a `--no-inline-images` escape hatch
6. Keep feed-level `<itunes:image>` / cover art untouched so it still points at the generated/podcast cover

## Open Questions
- Should image selection be rule-based (og:image + first N figures) or scored by a lightweight LLM call against the script?
- How to handle source pages with no usable images — silently omit, or fall back to generated artwork?
- What size/format constraints (compress, resize, convert to a consistent format) before uploading to Spaces?
- Should captions be extracted from source `alt`/`<figcaption>`, or rewritten to fit the episode context?
- Do target podcast clients render `<img>` inside `<description>` CDATA reliably, or do we need `<itunes:image>` per-item as well?

## Notes
- Reuse the existing Spaces upload path used for audio and cover art in `src/stages/publish.ts`
- Coordinate with `episode-artwork-replicate.md`: this item covers source-derived content images, that item covers generated cover art — they are complementary
- Consider alt text as a minimal accessibility requirement for every embedded image
- Track source URL per image in episode metadata for licensing/credit traceability
