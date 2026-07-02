# text-to-pod-cli

text-to-pod-cli turns a single URL into a narrated podcast episode by walking through a five-stage pipeline:

1. **metadata** – normalises the URL, creates an episode ID (using local timezone), writes directory scaffolding, and calls the configured text provider to extract a low-key title, summary, publication date, and related links. Results land in SQLite (`data/episodes.db`).
2. **script** – generates a scholarly monologue using a multi-stage process:
   - **Stage 1**: Research & outline generation
   - **Stage 2**: Content generation
   - **Stage 3**: Refinement & polish
   - **Stage 4**: Quality validation
   - **Stage 5**: Description notes extraction
   The script features a single "scholar" persona with a measured, thoughtful tone inspired by works like Children of Ash and Elm, The Silk Roads, and Against the Grain. Results are written to `script.json` in the episode directory.
3. **audio** – chunks the script, synthesises each chunk via the configured speech provider using the scholar voice, and stores MP3 slices under `resources/episodes/<episodeId>/audio/chunks/`.
4. **merge** – concatenates chunk MP3s with `ffmpeg` into `audio/episode.mp3`, automatically prepending/appending configured bumper tracks when present and re-encoding to 24 kHz mono MP3 so every segment shares the same playback profile.
5. **publish** – ingests the existing RSS feed (creating a default one if missing/forbidden), appends a calm-toned `<item>` with enhanced episode descriptions showing the multi-stage generation process, and (optionally) uploads both feed and episode audio to DigitalOcean Spaces using `s3cmd`.

Intro/outro bumpers default to `resources/intro.mp3`; override them with `--intro-bumper` / `--outro-bumper` or leave the files missing to skip them entirely.

When running publish commands, prefer `bun run dev -- --run-stage publish ...` so the latest TypeScript changes are used without relying on stale `dist/` output.

All stage state (including chunk metadata, feed paths, and multi-stage generation details) is tracked in the single `episodes` table through Bun's native SQLite module; the episode directory only stores `script.json` and audio artifacts.

## Common Commands

```bash
# Run the full pipeline for a URL (creates new episode if hash not seen before)
bun run dev -- --url https://example.com/article

# Resume or rerun a specific stage for an existing episode
bun run dev -- --episode-dir 20251022-1430-f353a601 --run-stage script

# Force regeneration even if the URL hash exists (resets DB row and reruns from metadata)
bun run dev -- --url https://example.com/article --force

# Dry run an individual stage (logs actions without hitting external services)
bun run dev -- --episode-dir 20251022-1430-f353a601 --run-stage audio --dry-run

# Process a URL file, continuing through per-URL failures and reporting them at the end
bun run dev -- --url-file hn-upvoted-batch-20260605-1.txt --publish

# Force rerun a completed stage (clears cached status)
bun run dev -- --episode-dir 20251022-1430-f353a601 --run-stage script --force

# Publish only, skipping uploads but previewing the RSS summary
bun run dev -- --episode-dir 20251022-1430-f353a601 --run-stage publish --no-publish

# Customize models for multi-stage script generation
bun run dev -- --url https://example.com/article \
  --script-outline-model anthropic/claude-sonnet-4.6 \
  --script-content-model anthropic/claude-opus-4.8-fast \
  --script-refinement-model google/gemini-3.1-pro-preview \
  --script-description-model z-ai/glm-5.1

# Use direct OpenAI instead of OpenRouter
bun run dev -- --url https://example.com/article \
  --text-provider openai \
  --audio-provider openai \
  --metadata-model gpt-5.5 \
  --tts-model gpt-4o-mini-tts \
  --scholar-voice echo

# Customize scholar voice
bun run dev -- --url https://example.com/article --scholar-voice alloy

# Publish to a different Spaces bucket/prefix/artwork
bun run dev -- --episode-dir <id> --run-stage publish \
  --spaces-origin https://mybucket.nyc3.digitaloceanspaces.com \
  --spaces-feed-key podcast/podcast.xml \
  --spaces-audio-prefix podcast/episodes \
  --spaces-cover-art-key podcast/podcast-cover-art.png
```

### Hacker News Upvoted Queue

For logged-in Hacker News upvoted pages, use `hn-upvoted-page-snippet.js` as a
browser-console helper. Open each upvoted page in the browser, paste the snippet
into DevTools Console, and paste the copied URLs into a local queue file.

The snippet extracts only the visible page. This keeps the workflow explicit and
avoids relying on authenticated scraping from the CLI.

```bash
bun run dev -- --url-file hn-upvoted-candidates.txt --dry-run
```

### Setup Notes

- Requires Bun 1.3+.
- Default generation uses OpenRouter and requires `OPENROUTER_API_KEY`.
- Direct OpenAI fallback uses `OPENAI_API_KEY` with `--text-provider openai` and/or `--audio-provider openai`.
- `bun run dev -- ...` loads `.secrets.env` when that file exists.
- Script generation retries malformed or failed generation substages once by
  default. Override with `--generation-retries <number>`.
- URL-file batches continue after per-URL failures by default and print a final
  failure report. Use `--stop-on-error` to restore fail-fast behavior.
- `s3cmd` must be configured (default config: `~/do-tor1.s3cfg`). Override with `--s3cfg <path>`.
- `ffmpeg` is used during the merge stage; ensure it’s on your `PATH`.

### Multi-Stage Script Generation

The script stage uses a sophisticated multi-stage process:

- **Outline Stage** (`--script-outline-model`): Research and create structured outline
- **Content Stage** (`--script-content-model`): Generate flowing scholarly monologue  
- **Refinement Stage** (`--script-refinement-model`): Polish and eliminate repetition
- **Description Stage** (`--script-description-model`): Extract compelling description notes
- **Evaluation Profile**: All prompts reference a public-safe interest profile so episodes stay aligned with our documented hooks, red flags, and life-lens perspectives.

Default generation uses OpenRouter:
- Text provider: `openrouter`
- Audio provider: `openrouter`
- Metadata, outline, content, refinement, and description models are selected
  randomly from small stage-specific pools unless overridden with a model flag.

Suggested default model pools:

| Stage | Pool | Rationale |
|-------|------|-----------|
| Metadata | `z-ai/glm-5.1`, `google/gemini-3.5-flash`, `qwen/qwen3.6-flash`, `google/gemma-4-31b-it` | Cheap factual extraction and page reading |
| Outline | `anthropic/claude-sonnet-4.6`, `google/gemini-3.1-pro-preview`, `z-ai/glm-5.1`, `qwen/qwen3.6-plus` | Strong source comprehension and structure |
| Content | `anthropic/claude-sonnet-4.6`, `anthropic/claude-opus-4.8-fast`, `google/gemini-3.1-pro-preview`, `qwen/qwen3.6-max-preview` | Higher-quality long-form script drafting |
| Refinement | `anthropic/claude-sonnet-4.6`, `google/gemini-3.1-pro-preview`, `z-ai/glm-5.1`, `qwen/qwen3.6-plus` | Concise polish and consistency checks |
| Description | `z-ai/glm-5.1`, `google/gemini-3.5-flash`, `qwen/qwen3.6-flash`, `google/gemma-4-31b-it` | Lower-cost summary and feed notes |

OpenRouter metadata and outline generation use the `openrouter:web_fetch` server
tool with automatic engine selection. OpenRouter fetches and extracts URL content
server-side; later script passes use the completed outline without web tools.

Audio synthesis also uses provider-specific preset pools unless `--tts-model`
or `--scholar-voice` is supplied. Presets pair model and voice because voice IDs
are model-specific.

| Audio provider | Preset pool | Notes |
|----------------|-------------|-------|
| `openrouter` | `microsoft/mai-voice-2` + `en-US-Harper:MAI-Voice-2` | Expressive but higher-cost |
| `openrouter` | `hexgrad/kokoro-82m` + `af_heart`, `af_bella`, `am_adam` | Lowest-cost validated MP3 presets |
| `openrouter` | `canopylabs/orpheus-3b-0.1-ft` + `tara`, `leo` | Natural English narration candidates |
| `openrouter` | `zyphra/zonos-v0.1-transformer` + `american_female` | Validated MP3 preset |
| `openrouter` | `zyphra/zonos-v0.1-hybrid` + `american_male` | Validated MP3 preset |
| `openrouter` | `sesame/csm-1b` + `default` | Validated MP3 preset |
| `openai` | `gpt-4o-mini-tts` + `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer` | Direct OpenAI fallback presets |

Other OpenRouter speech models are not in the default MP3 pool yet:
`x-ai/grok-voice-tts-1.0` and `mistralai/voxtral-mini-tts-2603` were blocked by
the current OpenRouter account privacy/routing settings during smoke tests.
`google/gemini-3.1-flash-tts-preview` returned PCM-only output for the standard
speech endpoint, while this pipeline currently writes MP3 chunks for merging.

### Voice Configuration

The system now uses a single "scholar" voice instead of multiple personas:
- `--scholar-voice`: Set the voice for the scholarly narration. If omitted, the
  CLI selects a provider-specific audio preset.
- `--tts-model`: Set the speech model. If omitted, the CLI selects a
  provider-specific audio preset.
- Legacy voice options (`--operator-voice`, `--historian-voice`, `--narrator-voice`) are preserved for backward compatibility

### Episode Descriptions

Enhanced episode descriptions include:
- Original source URL and publication date
- Multi-stage generation stack showing all models used
- Extracted description notes highlighting what makes each episode unique
- Related links from metadata research
- Voice configuration details

## Prompt Iterations

### Phase 1: Two-Person Structure *(October 2025)*
Initial implementation used a JSON script structure with operator and historian personas. Scripts were broken into pieces and processed through TTS individually, then reassembled.

### Phase 2: Three-Person Addition *(Mid-October 2025)*
Added a narrator persona to the existing operator and historian structure. Script complexity increased to accommodate three distinct voices.

### Phase 3: Pipeline Implementation *(October 11, 2025)*
Built complete five-stage pipeline (metadata, script, audio, merge, publish) while maintaining multi-persona script approach. Prompts focused on creating natural conversation flow between voices.

### Phase 4: Single Scholar Persona *(October 22, 2025)*
Replaced multi-persona structure with single "scholar" voice. Persona inspired by historical non-fiction works including Children of Ash and Elm, The Silk Roads, and Against the Grain.

### Phase 5: Multi-Stage Script Generation *(October 22, 2025)*
Implemented five-stage script process:
- Stage 1: Research & outline (gpt-4o-mini)
- Stage 2: Content generation (gpt-4o)
- Stage 3: Refinement & polish (gpt-4.1)
- Stage 4: Quality validation
- Stage 5: Description notes extraction (gpt-4o-mini)

### Phase 6: Audio Tone Styling *(October 23, 2025)*
Added tonal guidance to TTS prompts for style and cadence control beyond voice selection.

### Phase 7: Evaluative Briefing Prompts *(October 29, 2025)*
- Metadata stage narrowed to neutral, evidence-only extraction (title, author, publication data, source type, related links) to keep later analysis unbiased.
- Outline stage now records community signals, creator intent, vibe descriptors, attribution notes, and life-lens impacts mapped to a public evaluation profile.
- Script, refinement, and description prompts were rewritten to deliver concise, attribution-heavy analysis that answers: what the source claims, who made it, how people are reacting, and how it might matter to the listener—without hype language or unsupported generalities.

### Phase 8: Internal Monologue Triage *(November 2025)*
Retuned outline, content, and refinement prompts for a first-person, low-energy narrator. Scripts now read like a firsthand walkthrough of the source, moving through a five-beat triage flow (headline assessment through deep read) with subtle closing sentences that keep momentum without calling out structure. Default voice shifted to `sage` to match the quieter delivery.
