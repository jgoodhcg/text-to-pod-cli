# Long-form digest episodes

Digest episodes combine several source URLs into one manually authored script. The
authoring format is JSONL so that revisions can operate on one stable segment at a
time while the existing audio and publishing stages continue to consume the
compiled `script.json` dialogue format.

## Import

Create a manifest and JSONL script, then validate them without importing:

```sh
bun run dev -- --digest-manifest path/to/digest/manifest.json --dry-run
```

Importing writes an episode directory and records both the digest and each member
source in SQLite:

```sh
bun run dev -- --digest-manifest path/to/digest/manifest.json
```

The importer refuses a digest when its slug or any source URL already belongs to
an episode. Once imported, normal URL lookup therefore treats every member source
as generated.

## Source ownership decision

A normalized source URL belongs to exactly one episode. This is an explicit
one-owner rule, not merely an implementation limitation:

- A source already covered by a digest cannot also have a standalone episode.
- Looking up a digest member resolves to the digest that owns it.
- Using `--force` with that member URL operates on the owning digest; it does not
  create a new standalone episode.
- To resume or regenerate the digest deliberately, prefer
  `--episode-dir DIGEST_EPISODE_ID` so the scope is visible in the command.
- Removing a source from a digest or moving it to a standalone episode requires
  an explicit future migration of both the manifest and database membership.

This keeps deduplication unambiguous and ensures one URL cannot silently produce
multiple feed episodes. Membership currently covers the URLs listed in the
manifest—normally HN thread URLs—not their linked article URLs unless those are
also recorded separately.

The episode directory contains:

- `script.authoring.jsonl`: the revision-friendly source script
- `script.json`: dialogue compiled for the audio stage
- `digest-manifest.json`: title, description, and source membership
- `voice-config.json`: persona-to-provider, model, voice, and instructions

Continue through the normal pipeline with the episode ID printed by the importer:

```sh
bun run dev -- --episode-dir EPISODE_ID --start-stage audio
```

Use `--run-stage audio` instead when only audio should be generated or resumed.

## JSONL segment contract

Each nonblank line is one JSON object:

```json
{"segment_id":"opening-01","chapter":"Opening","persona":"NARRATOR","text":"...","source_ids":[],"purpose":"Optional editing note"}
```

`segment_id` must be unique. `persona` must have an entry in the manifest audio
configuration. `source_ids` refer to manifest source IDs. Import requires every
manifest source to be cited by at least one segment.

The compiled script deliberately contains only `persona` and `text`, preserving
compatibility with the existing audio stage. Audio chunks never cross a persona
boundary. Their manifest records the text hash and complete voice configuration;
a rerun reuses every matching MP3 and resumes at the first missing or changed
chunk.

## Voice roles

The initial role assignment uses the highest-rated same-model voices currently in
the local evaluation database:

- `OPERATOR`: `fable`
- `HISTORIAN`: `echo`
- `NARRATOR`: `alloy`

Keeping all three on `gpt-4o-mini-tts` avoids audible changes in synthesis quality
while still giving the roles distinct timbres. A digest manifest can override any
provider, model, voice, or speaking instruction.
