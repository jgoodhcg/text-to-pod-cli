---
title: "OpenRouter Integration"
status: idea
description: "Replace direct OpenAI API calls with OpenRouter for flexible model access"
tags: [infrastructure, api, models]
priority: medium
created: 2026-03-15
updated: 2026-03-15
---

# OpenRouter Integration

## Problem / Intent
Currently the CLI uses OpenAI's SDK directly, locking users into OpenAI models and pricing. OpenRouter provides a unified API that supports multiple LLM providers (OpenAI, Anthropic, Google, Mistral, etc.) with consistent pricing and model selection flexibility.

## Constraints
- Must maintain compatibility with existing model options in CLI
- OpenRouter API is OpenAI-compatible, so SDK changes should be minimal
- Need to handle model name mapping (e.g., `openai/gpt-4o` vs `gpt-4o`)
- Audio/TTS may still require direct OpenAI access (OpenRouter doesn't support TTS)

## Proposed Approach
1. Add `OPENROUTER_API_KEY` environment variable support alongside `OPENAI_API_KEY`
2. Add CLI flag `--provider openai|openrouter` (default: openai for backward compat)
3. Configure OpenAI SDK to use OpenRouter base URL when provider is openrouter
4. Update model defaults to use OpenRouter model naming conventions
5. Keep TTS calls using direct OpenAI (or document limitation)

## Open Questions
- Should we default to OpenRouter or keep OpenAI as default?
- How to handle model selection UI/help text for OpenRouter's larger model catalog?
- Should we support custom base URLs for self-hosted or alternative providers?

## Notes
- Files affected: `src/config.ts`, `src/stages/script.ts`, `src/stages/metadata.ts`, `src/stages/audio.ts`, `src/cli.ts`
- OpenRouter docs: https://openrouter.ai/docs
