---
title: "OpenRouter Integration"
status: done
description: "Replace direct OpenAI API calls with OpenRouter for flexible model access"
tags: [infrastructure, api, models]
priority: medium
created: 2026-03-15
updated: 2026-06-05
---

# OpenRouter Integration

## Problem / Intent
The CLI previously used direct OpenAI API calls for metadata extraction, script
generation, and speech synthesis. OpenRouter is now the default provider for
both text generation and speech, with direct OpenAI still available through
provider flags.

## Constraints
- Must maintain compatibility with existing model options in CLI
- Metadata and outline generation require web grounding
- OpenRouter web grounding uses the `openrouter:web_fetch` server tool
- Need to handle model name mapping (e.g., `openai/gpt-4o` vs `gpt-4o`)
- OpenRouter TTS requires provider model slugs such as
  `microsoft/mai-voice-2`
- OpenRouter TTS voice IDs are model-specific, so default audio rotation should
  use `{ model, voice }` presets rather than independent model and voice pools
- Existing direct OpenAI behavior must remain available for fallback
- Default text models can rotate through small stage-specific OpenRouter pools,
  while explicit CLI model flags pin a single model

## Proposed Approach
1. Add `OPENROUTER_API_KEY` environment variable support alongside `OPENAI_API_KEY`.
2. Add provider flags for text and audio: `--text-provider openai|openrouter`
   and `--audio-provider openai|openrouter`.
3. Add a provider adapter for metadata and script model calls.
4. Preserve OpenAI's native Responses API `{ type: "web_search" }` request.
5. Map OpenRouter research requests to Chat Completions with the
   `openrouter:web_fetch` server tool; content, refinement, and description
   passes consume the generated artifacts without web tools.
6. Configure OpenAI SDK audio calls with OpenRouter's base URL for OpenRouter TTS.
7. Accept OpenRouter model slugs such as `google/gemini-3.5-flash`, while
   preserving direct OpenAI model slugs such as `gpt-5.5`.
8. Default text and audio providers to OpenRouter.
9. Select default text models randomly from small per-stage pools so repeated
   generation can compare model behavior without manual flag changes.
10. Select audio from provider-specific `{ model, voice }` preset pools,
    preserving explicit `--tts-model` and `--scholar-voice` overrides.

## Acceptance Criteria
- `--text-provider openai` retains direct OpenAI metadata and script behavior
- `--text-provider openrouter` can complete metadata and script generation with web
  search using an OpenRouter model slug
- `--audio-provider openai` retains direct OpenAI TTS behavior
- `--audio-provider openrouter` sends TTS through OpenRouter's OpenAI-compatible
  speech endpoint
- RSS metadata records the actual provider and model used for each stage
- README setup documents both API keys and provider flags
- README documents the default per-stage model pools
- README documents provider-specific voice pools

## Open Questions
- How to handle model selection UI/help text for OpenRouter's larger model catalog?
- Should we support custom base URLs for self-hosted or alternative providers?

## Notes
- Files affected: `src/config.ts`, `src/context.ts`, `src/types.ts`,
  `src/stages/script.ts`, `src/stages/metadata.ts`, `src/stages/audio.ts`,
  `src/stages/publish.ts`, `src/cli.ts`, `README.md`
- OpenRouter Responses docs: https://openrouter.ai/docs/api/reference/responses/overview
- OpenRouter web-fetch docs: https://openrouter.ai/docs/guides/features/server-tools/web-fetch
- OpenRouter TTS docs: https://openrouter.ai/docs/guides/overview/multimodal/tts
- Validated OpenRouter speech presets on 2026-06-05. Accepted MP3 presets:
  `microsoft/mai-voice-2` + `en-US-Harper:MAI-Voice-2`,
  `hexgrad/kokoro-82m` + `af_heart` / `af_bella` / `am_adam`,
  `canopylabs/orpheus-3b-0.1-ft` + `tara` / `leo`,
  `zyphra/zonos-v0.1-transformer` + `american_female`,
  `zyphra/zonos-v0.1-hybrid` + `american_male`, and
  `sesame/csm-1b` + `default`.
- Excluded from defaults for now: `x-ai/grok-voice-tts-1.0` and
  `mistralai/voxtral-mini-tts-2603` returned account privacy/routing 404s;
  `google/gemini-3.1-flash-tts-preview` required `response_format="pcm"`,
  while the current merge pipeline expects MP3 chunk files.
- Validated MAI-Voice-2 English candidate voices on 2026-06-05. Only
  `en-US-Harper:MAI-Voice-2` accepted; `en-US-Ava`, `en-US-Andrew`,
  `en-US-Brian`, `en-US-Emma`, `en-US-Jenny`, `en-US-Guy`, and `en-US-Davis`
  returned provider 400 errors when suffixed with `:MAI-Voice-2`.
