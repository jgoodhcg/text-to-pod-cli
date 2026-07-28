# Drafting a long-form Hacker News digest script

This format should feel like browsing a related set of links with two thoughtful
companions. It is not a headline roundup and it is not a thesis-first essay that
uses links as decoration. The theme supplies a route through the sources; the
sources remain the episode's subject.

## Target

- Aim for 2,100–2,800 spoken words for a typical 15–20 minute episode.
- A deliberately expansive episode can reach roughly 3,900 words for 30 minutes.
- Budget meaningful treatment for every source. A small link can receive one
  compact turn, but no source should be reduced to its title.
- Preserve the quiet browsing voice. Avoid hooks, hype, staged disagreement,
  punch lines, and artificial host banter.

Runtime estimates are only estimates. Measure the finished audio because voices,
technical language, and pauses change the speaking rate.

## Research before prose

Make a source ledger before drafting. For every link, record:

1. The artifact: article, project, paper, announcement, demonstration, or thread.
2. The credited maker or author. Do not confuse the HN submitter with the maker.
3. The maker's concrete claim and the evidence offered for it.
4. Important qualifications in the source itself.
5. The shape of the HN response: practical reports, corrections, objections,
   side discussions, and unresolved questions.
6. The relationship to its neighbors: agreement, contradiction, shared
   constraint, different layer, or useful counterexample.

Treat comments as leads, not votes. Score and comment count establish attention,
not correctness or consensus. Verify factual claims against the linked artifact
when it is available. Attribute legal allegations, benchmark results, effect
sizes, and forward-looking claims precisely.

## Find the route

Write one sentence that describes the episode's listening question. It should be
open enough for the links to disagree with it.

Then arrange four to six chapters. Useful chapter movement includes:

- announcement → implementation → operational cost → evaluation;
- observation → model → inference → headline;
- individual tool → maintenance burden → ecosystem → institution;
- visible output → production process → selection → authorship;
- customer symptom → internal incentive → accumulated constraint → failure.

Do not sort only by publication time. Put neighboring links together because
one supplies a missing constraint, tests the previous claim, or solves the same
problem at another layer. Say that relationship in the transition.

## Voice roles

The roles are editorial functions, not theatrical characters.

- `NARRATOR` orients the listener, names chapter changes, and supplies breathing
  room. It should be the sparsest voice.
- `OPERATOR` explains mechanisms, artifacts, measurements, costs, and what a
  person would encounter when trying the thing.
- `HISTORIAN` interprets the HN response, supplies cautious precedent, and
  connects one link to another.

Do not manufacture dialogue. Consecutive turns should advance the inquiry rather
than restate each other. A persona change always creates an audio boundary, so
avoid changing speakers for a one-sentence interjection unless the pause helps.

## The source turn

A strong source turn usually performs four moves:

1. Identify what the item is and who made it.
2. Explain what it actually does, argues, or measures.
3. Describe how HN responded, including a useful objection or correction.
4. State why this item is next.

These moves can span multiple JSONL segments. Vary the emphasis: a project may
need more mechanism, a scientific paper more evidence hierarchy, and a personal
essay more attention to the author's stated experience.

Avoid phrases such as “HN loved it” or “the community agreed.” Prefer concrete
descriptions: commenters reproduced the setup, disputed the denominator,
compared electricity costs, questioned the license, or supplied an alternative.

## Opening and closing

The opening should identify the terrain and listening question in under a
minute. It need not tease every source.

The closing should report what changed after examining the set:

- which initial distinction became more important;
- where the links genuinely disagreed;
- which costs or assumptions moved into view;
- what practical reading habit the listener can carry forward.

Do not claim that every source proves the theme. Exceptions and unresolved
questions make the synthesis more credible.

## JSONL contract

Each physical line is one JSON object:

```json
{"segment_id":"runtime-03","chapter":"Operational cost","persona":"OPERATOR","text":"Spoken prose.","source_ids":["12345678"],"purpose":"Explain the measured bottleneck."}
```

Required fields:

- `segment_id`: unique and stable through revisions;
- `chapter`: human-readable structural label;
- `persona`: a configured role such as `NARRATOR`, `OPERATOR`, or `HISTORIAN`;
- `text`: only words intended to be spoken;
- `source_ids`: manifest IDs supporting the segment, or an empty array for pure
  orientation and synthesis.

`purpose` is optional and is not spoken. Use it to preserve editorial intent
during revision.

Every manifest source must appear in at least one `source_ids` array. Do not cite
a source merely to satisfy coverage; the spoken segment must genuinely address
it. A synthesis segment may cite several sources.

## First-draft prompt

The following brief is suitable for a model or a human drafting pass:

> Write a low-energy, long-form Hacker News browsing episode from the supplied
> source ledger and chapter route. Target 2,100–2,800 spoken words. Explore every
> link: identify the artifact and credited maker, explain the concrete claim or
> mechanism, summarize the useful shape of the HN response, and connect it to
> neighboring links. Keep source claims, commenter claims, and synthesis
> distinct. Use NARRATOR sparingly for orientation, OPERATOR for concrete
> mechanisms, and HISTORIAN for response and connection. Do not invent motives
> or consensus. Return one valid JSON object per line using the repository's
> JSONL contract.

Supply the source ledger and proposed chapter route after the brief. A title list
alone is not enough context for a factual script.

## Revision passes

1. **Coverage:** Every source is substantively represented exactly where its ID
   appears.
2. **Attribution:** Makers, institutions, study populations, allegations, and
   measurements are named accurately.
3. **Community response:** Comments are synthesized rather than copied, and a
   loud thread is not mistaken for consensus.
4. **Connection:** Each transition says why the next link belongs.
5. **Shape:** The episode develops; it does not reset to a new headline every
   minute.
6. **Voice:** Roles remain distinct but sound like one quiet program.
7. **Speech:** Expand abbreviations where helpful, remove visual-only language,
   and listen for awkward model names, URLs, equations, and punctuation.
8. **Runtime:** Count spoken words, then use actual synthesized duration for the
   final decision.

## Validation and handoff

Validate without importing:

```sh
bun run dev -- --digest-manifest path/to/digest/manifest.json --dry-run
```

After editorial approval, import the manifest so its member URLs become covered
in the database. Then continue with the ordinary audio pipeline as documented in
`docs/digest-workflow.md`.

Draft files do not mark URLs generated. Database membership begins only when a
validated digest is imported.
