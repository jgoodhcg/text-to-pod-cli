# Arbitrary Text Document Input

## Work Unit Summary
**Status:** Planned
**Problem/Intent:** Currently the CLI only accepts URLs as input, requiring web-accessible content. Users should be able to generate episodes from local text files, markdown documents, PDFs, or pasted text directly.
**Constraints:** Preserve existing URL-based workflow as default, reuse existing script generation pipeline stages, maintain CLI simplicity.
**Proposed Approach:** Add a `--file` or `--text` input mode that bypasses the metadata URL fetch and injects document content directly into the script generation context. Detect file type and extract plain text appropriately.
**Open Questions:** Should metadata (title, author, date) be inferred from document content or required via CLI flags? How to handle documents without natural discussion/comment context?

## Plan
- Add CLI flags for file input (`--file <path>`) and stdin/text input (`--text <content>`)
- Implement file type detection and text extraction (plain text, markdown, PDF)
- Create alternate metadata stage that derives title/summary from document content rather than URL fetch
- Adjust script prompts to handle content without comment threads gracefully
- Store source file path or hash in episode metadata for reference

## Milestones
- [ ] CLI flag parsing for `--file` and `--text` modes
- [ ] Plain text and markdown file reading
- [ ] PDF text extraction (optional dependency)
- [ ] Metadata inference from document content
- [ ] Script prompt adjustments for non-discussion content
- [ ] Documentation and examples

## Notes
- The browsing narration style may need adaptation for documents without community discussion context
- Could enable use cases like: newsletter digests, research paper summaries, book chapter discussions
- Consider whether to support drag-and-drop or clipboard input in future iterations

### Alternative: Supply Script Directly
- The existing `--stage` flag may already support skipping to audio generation with a pre-written script file
- Test whether supplying a script JSON and running from `audio` stage works end-to-end
- If viable, this provides a manual workaround without new code
- [ ] Verify: create episode record, place script.json manually, run `--stage audio` onwards
