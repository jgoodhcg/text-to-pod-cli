# text-to-pod-cli

text-to-pod-cli turns a single URL into a narrated podcast episode by walking through a five-stage pipeline:

1. **metadata** – normalises the URL, creates an episode ID, writes directory scaffolding, and calls OpenAI’s Responses API to extract a low-key title, summary, publication date, and related links. Results land in SQLite (`data/episodes.db`).
2. **script** – generates a structured, narrator-led episode with section hand-offs and summaries while Operator and Historian trade analysis. The script now spotlights key actors, their incentives, and representative community reactions using the saved metadata as prompt context, writing `script.json` to the episode directory.
3. **audio** – chunks the script, synthesises each chunk via the OpenAI `/audio/speech` endpoint, and stores MP3 slices under `resources/episodes/<episodeId>/audio/chunks/`.
4. **merge** – concatenates chunk MP3s with `ffmpeg` into `audio/episode.mp3`, automatically prepending/appending configured bumper tracks when present and re-encoding to 24 kHz mono MP3 so every segment shares the same playback profile.
5. **publish** – ingests the existing RSS feed (creating a default one if missing/forbidden), appends a calm-toned `<item>`, and (optionally) uploads both feed and episode audio to DigitalOcean Spaces using `s3cmd`.

Intro/outro bumpers default to `resources/intro.mp3`; override them with `--intro-bumper` / `--outro-bumper` or leave the files missing to skip them entirely.

All stage state (including OpenAI token counts, chunk metadata, feed paths) is tracked in the single `episodes` table; the episode directory only stores `script.json` and audio artifacts.

## Common Commands

```bash
# Run the full pipeline for a URL (creates new episode if hash not seen before)
npm start -- --url https://example.com/article

# Resume or rerun a specific stage for an existing episode
npm start -- --episode-dir 20251011-1757-f353a601 --run-stage script

# Force regeneration even if the URL hash exists (resets DB row and reruns from metadata)
npm start -- --url https://example.com/article --force

# Dry run an individual stage (logs actions without hitting external services)
npm start -- --episode-dir 20251011-1757-f353a601 --run-stage audio --dry-run

# Publish only, skipping uploads but previewing the RSS summary
npm start -- --episode-dir 20251011-1757-f353a601 --run-stage publish --no-publish

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
