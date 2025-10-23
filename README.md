# text-to-pod-cli

text-to-pod-cli turns a single URL into a narrated podcast episode by walking through a five-stage pipeline:

1. **metadata** – normalises the URL, creates an episode ID (using local timezone), writes directory scaffolding, and calls OpenAI's Responses API to extract a low-key title, summary, publication date, and related links. Results land in SQLite (`data/episodes.db`).
2. **script** – generates a scholarly monologue using a multi-stage process:
   - **Stage 1**: Research & outline generation (gpt-4o-mini)
   - **Stage 2**: Content generation (gpt-4o) 
   - **Stage 3**: Refinement & polish (gpt-4.1)
   - **Stage 4**: Quality validation
   - **Stage 5**: Description notes extraction (gpt-4o-mini)
   The script features a single "scholar" persona with a measured, thoughtful tone inspired by works like Children of Ash and Elm, The Silk Roads, and Against the Grain. Results are written to `script.json` in the episode directory.
3. **audio** – chunks the script, synthesises each chunk via the OpenAI `/audio/speech` endpoint using the scholar voice, and stores MP3 slices under `resources/episodes/<episodeId>/audio/chunks/`.
4. **merge** – concatenates chunk MP3s with `ffmpeg` into `audio/episode.mp3`, automatically prepending/appending configured bumper tracks when present and re-encoding to 24 kHz mono MP3 so every segment shares the same playback profile.
5. **publish** – ingests the existing RSS feed (creating a default one if missing/forbidden), appends a calm-toned `<item>` with enhanced episode descriptions showing the multi-stage generation process, and (optionally) uploads both feed and episode audio to DigitalOcean Spaces using `s3cmd`.

Intro/outro bumpers default to `resources/intro.mp3`; override them with `--intro-bumper` / `--outro-bumper` or leave the files missing to skip them entirely.

All stage state (including chunk metadata, feed paths, and multi-stage generation details) is tracked in the single `episodes` table; the episode directory only stores `script.json` and audio artifacts.

## Common Commands

```bash
# Run the full pipeline for a URL (creates new episode if hash not seen before)
npm start -- --url https://example.com/article

# Resume or rerun a specific stage for an existing episode
npm start -- --episode-dir 20251022-1430-f353a601 --run-stage script

# Force regeneration even if the URL hash exists (resets DB row and reruns from metadata)
npm start -- --url https://example.com/article --force

# Dry run an individual stage (logs actions without hitting external services)
npm start -- --episode-dir 20251022-1430-f353a601 --run-stage audio --dry-run

# Publish only, skipping uploads but previewing the RSS summary
npm start -- --episode-dir 20251022-1430-f353a601 --run-stage publish --no-publish

# Customize models for multi-stage script generation
npm start -- --url https://example.com/article \
  --script-outline-model gpt-4o-mini \
  --script-content-model gpt-4o \
  --script-refinement-model gpt-4.1 \
  --script-description-model gpt-4o-mini

# Customize scholar voice
npm start -- --url https://example.com/article --scholar-voice alloy

# Publish to a different Spaces bucket/prefix/artwork
npm start -- --episode-dir <id> --run-stage publish \
  --spaces-origin https://mybucket.nyc3.digitaloceanspaces.com \
  --spaces-feed-key podcast/podcast.xml \
  --spaces-audio-prefix podcast/episodes \
  --spaces-cover-art-key podcast/podcast-cover-art.png
```

### Setup Notes

- Requires Node.js 20+ and an `OPENAI_API_KEY` environment variable.
- `s3cmd` must be configured (default config: `~/do-tor1.s3cfg`). Override with `--s3cfg <path>`.
- `ffmpeg` is used during the merge stage; ensure it’s on your `PATH`.

### Multi-Stage Script Generation

The script stage uses a sophisticated multi-stage process:

- **Outline Stage** (`--script-outline-model`): Research and create structured outline
- **Content Stage** (`--script-content-model`): Generate flowing scholarly monologue  
- **Refinement Stage** (`--script-refinement-model`): Polish and eliminate repetition
- **Description Stage** (`--script-description-model`): Extract compelling description notes

Default models are optimized for cost-effectiveness and quality:
- Outline: `gpt-4o-mini` (fast, affordable research)
- Content: `gpt-4o` (balanced quality generation)
- Refinement: `gpt-4.1` (premium quality polishing)
- Description: `gpt-4o-mini` (efficient metadata extraction)

### Voice Configuration

The system now uses a single "scholar" voice instead of multiple personas:
- `--scholar-voice`: Set the voice for the scholarly narration (default: "ash")
- Legacy voice options (`--operator-voice`, `--historian-voice`, `--narrator-voice`) are preserved for backward compatibility

### Episode Descriptions

Enhanced episode descriptions include:
- Original source URL and publication date
- Multi-stage generation stack showing all models used
- Extracted description notes highlighting what makes each episode unique
- Related links from metadata research
- Voice configuration details
