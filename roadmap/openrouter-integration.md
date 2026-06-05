---
title: "OpenRouter Integration"
status: planned
description: "Replace direct OpenAI API calls with OpenRouter for flexible model access"
tags: [infrastructure, api, models]
priority: medium
created: 2026-03-15
updated: 2026-06-02
---

# OpenRouter Integration

## Problem / Intent
Currently the CLI uses OpenAI's SDK directly for metadata extraction, script
generation, and speech synthesis. OpenRouter would provide model flexibility for
the text-generation stages while preserving direct OpenAI access for speech.

## Constraints
- Must maintain compatibility with existing model options in CLI
- OpenRouter's Responses API and server-side web search are currently beta
- Metadata and script stages depend on OpenAI Responses API `web_search`
- OpenRouter's web-search tool shape differs from OpenAI's native `web_search`;
  provider-specific request construction is required
- Need to handle model name mapping (e.g., `openai/gpt-4o` vs `gpt-4o`)
- Audio/TTS must continue using direct OpenAI access
- Existing OpenAI behavior must remain available as the default until the
  OpenRouter path is validated

## Proposed Approach
1. Add `OPENROUTER_API_KEY` environment variable support alongside `OPENAI_API_KEY`
2. Add CLI flag `--provider openai|openrouter` (default: openai for backward compat)
3. Add a provider adapter for metadata and script Responses API requests
4. Preserve OpenAI's native `{ type: "web_search" }` tool request
5. Map OpenRouter requests to its documented web-search server tool shape
6. Configure the OpenAI SDK with OpenRouter's base URL and API key only inside
   the OpenRouter text-generation adapter
7. Accept OpenRouter model slugs such as `openai/gpt-5.5`, while preserving
   direct OpenAI model slugs such as `gpt-5.5`
8. Keep audio synthesis on direct OpenAI using `gpt-4o-mini-tts`
9. Add a dry-run or metadata-only verification path for both providers before
   changing any defaults

## Acceptance Criteria
- `--provider openai` retains the current metadata, script, and TTS behavior
- `--provider openrouter` can complete metadata and script generation with web
  search using an OpenRouter model slug
- `--provider openrouter` still sends TTS requests directly to OpenAI
- RSS metadata records the actual provider and model used for each stage
- README setup documents both API keys and the mixed-provider TTS behavior

## Open Questions
- After validation, should OpenRouter become the default for text generation?
- How to handle model selection UI/help text for OpenRouter's larger model catalog?
- Should we support custom base URLs for self-hosted or alternative providers?

## Notes
- Files affected: `src/config.ts`, `src/context.ts`, `src/types.ts`,
  `src/stages/script.ts`, `src/stages/metadata.ts`, `src/stages/audio.ts`,
  `src/stages/publish.ts`, `src/cli.ts`, `README.md`
- OpenRouter Responses docs: https://openrouter.ai/docs/api/reference/responses/overview
- OpenRouter web-search docs: https://openrouter.ai/docs/guides/features/server-tools/web-search
