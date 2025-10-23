# Project Requirements

## Overview
Build a TypeScript/Node.js CLI that transforms a single URL into a narrated podcast episode. The pipeline runs as ordered stages, persists artifacts after every step for resumability, and publishes the finished episode (audio + RSS entry) to DigitalOcean Spaces.

## Tech Stack & Tooling
- Node.js 20+
- TypeScript + ts-node/tsx
- Package manager: pnpm (preferred) or npm
- OpenAI REST APIs (`/responses`, `/audio/speech`)
- External CLIs: `s3cmd`, `ffmpeg`
- Persistence: SQLite (single-table for episodes and stage state)

Environment variables:
- `OPENAI_API_KEY`
- Spaces credentials via `s3cmd` config (default `~/.s3cfg` or `--s3cfg` CLI flag)

## Episode Identity & Directory Layout
Episodes are identified by `episode-id = <yyyyMMdd>-<HHmm>-<hash8>`, where:

- `yyyyMMdd`: Local date at metadata stage start (supports chronological listing).
- `HHmm`: Local time (24h) at metadata stage start.
- `<hash8>`: first eight hex chars of SHA-1 hash of the normalized URL (lowercased host, default port stripped, trailing slash removed, sorted query params, fragments removed). Before creating a new episode, query SQLite for an existing row with the same hash; if found and `--force` is not provided, abort to avoid duplicate episodes.

Example directory:

```
resources/episodes/20241014-1530-9af0b3c2/
  script.json              # generated dialogue
  audio/
    chunks/
      001-operator.mp3
      002-historian.mp3
    episode.mp3
```

Only the script JSON and audio artifacts live on disk. All metadata, usage details, and stage tracking are persisted in SQLite; the database also records the path to the script file and audio directories.

## SQLite Persistence

- Database file: `data/episodes.db`.
- Single table `episodes` with one row per episode. No JSON columns; all metadata/state stored in scalar fields.
- Suggested schema (extend as needed, but remain single-table):

```sql
CREATE TABLE IF NOT EXISTS episodes (
  episode_id TEXT PRIMARY KEY,
  normalized_url TEXT NOT NULL,
  url_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  metadata_status TEXT NOT NULL DEFAULT 'pending',
  metadata_model TEXT,
  metadata_prompt_version TEXT,
  metadata_title TEXT,
  metadata_summary TEXT,
  metadata_published_at TEXT,
  metadata_related_links TEXT,
  metadata_input_tokens INTEGER,
  metadata_output_tokens INTEGER,

  script_status TEXT NOT NULL DEFAULT 'pending',
  script_model TEXT,
  script_file_path TEXT,
  script_segment_count INTEGER,
  script_input_tokens INTEGER,
  script_output_tokens INTEGER,

  audio_status TEXT NOT NULL DEFAULT 'pending',
  audio_chunks_dir TEXT,
  audio_chunk_count INTEGER,
  audio_voice_operator TEXT,
  audio_voice_historian TEXT,
  audio_total_duration_sec REAL,

  merge_status TEXT NOT NULL DEFAULT 'pending',
  merged_audio_path TEXT,
  merged_audio_duration_sec REAL,
  merged_audio_checksum TEXT,

  publish_status TEXT NOT NULL DEFAULT 'pending',
  publish_feed_local_path TEXT,
  publish_audio_remote_path TEXT,
  publish_feed_remote_path TEXT,
  publish_item_guid TEXT,
  publish_at TEXT
);
```

- `*_status` values: `pending`, `in-progress`, `completed`, `failed`.
- Rows are inserted during `metadata`. Later stages update columns with their results and bump `updated_at`.

## Stage Definitions
Ordered list: `metadata → script → audio → merge → publish`.

### `metadata`
- Preconditions: normalized URL hash must not already exist in `episodes` (unless `--force`).
- Actions:
  - Normalize URL, compute episode ID, create audio directory skeleton (`audio/chunks/`).
  - Insert row into SQLite with metadata status `in-progress`.
  - Call OpenAI `/responses` with metadata prompt.
  - Persist key fields into DB (`metadata_title`, `metadata_summary`, `metadata_published_at`, token counts, prompt/model info).
  - Mark `metadata_status = 'completed'`, update timestamps.

### `script`
- Preconditions: metadata stage marked `completed`.
- Actions:
  - Retrieve metadata fields from DB (title, summary, prompts, etc.) to build the script prompt.
  - Call OpenAI `/responses` with script prompt.
  - Write dialogue array to `script.json` (outside DB).
  - Update DB columns: `script_status`, `script_model`, `script_file_path`, `script_segment_count`, token usage counters, `updated_at`.

### Script Output Format

The script prompt must instruct the model to return an array of dialogue objects:

```json
[
  { "persona": "OPERATOR", "text": "Opening line..." },
  { "persona": "HISTORIAN", "text": "Response..." },
  { "persona": "OPERATOR", "text": "..." }
]
```

- personas must be uppercase `OPERATOR` / `HISTORIAN`.
- Objects may optionally include `notes` (ignored by chunking) but must at least contain `persona` and `text`.
- No additional metadata (timestamps, stage directions) should be emitted by the model.
- Validation: script stage must ensure array length > 0, persona values valid, text non-empty, and persona alternation encouraged (log warning if consecutive personas repeat unexpectedly).

### `audio`
- Preconditions: script stage `completed`; chunk directory exists (create if missing).
- Chunking:
  1. Iterate script entries in order.
  2. Accumulate consecutive lines for the same persona until persona switches or `max-script-chars` (default ~900) would be exceeded.
  3. When flushed, record chunk descriptor `{ index, persona, text, charCount }`.
- For each chunk:
  - Generate filename `audio/chunks/<index>-<persona>.mp3`.
  - Call OpenAI `/audio/speech` with persona voice; stream to disk.
  - Capture duration (API metadata or `ffprobe`).
- Update DB columns: `audio_status = 'completed'`, `audio_chunks_dir`, `audio_chunk_count`, `audio_voice_operator`, `audio_voice_historian`, `audio_total_duration_sec`, `updated_at`.

### `merge`
- Preconditions: audio stage `completed`; chunk files present.
- Actions:
  - Merge chunk files in order using `ffmpeg` into `audio/episode.mp3`.
  - Compute SHA-256 checksum and total duration (seconds).
  - Update DB: `merge_status = 'completed'`, `merged_audio_path`, `merged_audio_checksum`, `merged_audio_duration_sec`, `updated_at`.

### `publish`
- Preconditions: merge stage `completed`.
- Actions:
  - Download current RSS feed via `s3cmd` (unless `--dry-run`).
  - Ensure feed has no item referencing `episode_id`.
  - Append new `<item>` using metadata summary (title, summary) and publish `enclosure` pointing to final audio URL (based on configured bucket/prefix).
  - Upload merged audio (first) and updated feed (second) via `s3cmd`, unless `--dry-run`.
  - Update DB: `publish_status`, `publish_feed_local_path`, `publish_audio_remote_path`, `publish_feed_remote_path`, `publish_item_guid`, `publish_at`, `updated_at`.

## CLI Requirements
Executable `src/cli.ts` invoked via ts-node/tsx.

Supported options (long form canonical):
- `--url <string>`
- `--episode-dir <path>`
- `--output-root <path>` (default `resources/episodes`)
- `--start-stage <metadata|script|audio|merge|publish>`
- `--run-stage <stage>`
- `--metadata-model`, `--script-model`
- `--metadata-system-prompt`, `--metadata-prompt-template`
- `--script-system-prompt`, `--script-prompt-template`
- `--operator-voice`, `--historian-voice`
- `--max-script-chars <int>`
- `--s3cfg <path>`
- `--force`
- `--dry-run` (skip all external operations - OpenAI API, ffmpeg, s3cmd)
- `--no-publish` (run everything except final upload to DigitalOcean Spaces)
- `--help`, `--version`

CLI behavior:
- Require `--url` unless resuming (`--episode-dir`).
- Derive episode directory and insert DB row automatically when `--url` given.
- `--run-stage` executes only that stage (after validating prerequisites).
- `--start-stage` runs from the specified stage through `publish`.
- All stages log with `[stage]` prefix; errors contain recovery hints.

## Context Builder
`buildContext(options)` should construct an object with:
- Normalized CLI options
- Derived paths (episodeDir, metadataFile, scriptFile, chunksDir, mergedFile)
- Open SQLite connection (exported to stages)
- Prompt configuration for metadata/script
- Audio config (`maxChars`, persona voices)
- Publish config (bucket name, feed key, audio prefix, s3cfg path)
- OpenAI client base settings

Ensure directories exist (except output files) before stage execution.

## External Integrations
- OpenAI `/responses`: JSON payloads with instructions + prompt; include retry (up to 2) with delay.
- OpenAI `/audio/speech`: stream/buffer binary audio; supply voice `voice`, `format`, etc.
- `ffmpeg`: used via child process to concatenate audio chunks; capture stderr for diagnostics.
- `s3cmd`: invoked via child process for feed/audio upload/download; must honor `--dry-run` by skipping actual upload.

## Error Handling
- Wrap stage operations in transactions where appropriate (set status to `in-progress`, revert to `failed` on error).
- Validate JSON payloads before committing file paths to DB.
- Provide actionable error messages (e.g., “Missing script.json. Run `--start-stage script` first or rerun with `--url`.”).

## Testing
- Unit tests
  - URL normalization + hash generation
  - Chunking logic (persona switches, char limits)
  - SQLite repository operations (insert/update/query per stage)
- Integration tests with mocked OpenAI clients (simulate responses/audio payloads)
- Manual smoke test script covering full pipeline using stubbed endpoints

## Future Enhancements
- Fine-grained `--force` flags (per stage)
- Additional tables (e.g., audit trail) if single-table design proves limiting
- Additional persona voices/providers
- Enhanced RSS templating and show notes
- Improved diff output for `publish --dry-run`
