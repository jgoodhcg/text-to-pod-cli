# Convert to Bun

## Work Unit Summary
**Status:** Planned
**Problem/Intent:** Replace Node.js runtime with Bun for improved startup time, better performance, and simplified toolchain. Bun's native TypeScript support and faster package manager can significantly improve the development experience.
**Constraints:** Must maintain compatibility with existing dependencies (better-sqlite3, commander, fast-xml-parser), preserve all existing functionality, ensure SQLite database compatibility, keep API integrations working (OpenAI endpoints).
**Proposed Approach:** Migrate in phases - first ensure dependencies are Bun-compatible, update package.json scripts and runtime configuration, test all CLI commands, verify SQLite database operations, validate OpenAI API calls, and ensure ffmpeg/s3cmd integration still works.
**Open Questions:** Will better-sqlite3 require native compilation adjustments for Bun? Are there any Node.js-specific APIs in use that Bun doesn't support?

## Plan
- Audit dependencies for Bun compatibility
- Update package.json to use Bun instead of Node in scripts
- Replace any Node.js-specific APIs with Bun-compatible alternatives
- Update build process if needed (Bun may simplify TypeScript compilation)
- Test all CLI commands end-to-end
- Verify SQLite database read/write operations
- Validate OpenAI API integration
- Confirm ffmpeg and s3cmd subprocess calls work
- Update documentation and AGENTS.md references to Node → Bun
- Benchmark performance improvements

## Milestones
- [ ] Dependency compatibility audit
- [ ] Update package.json and scripts
- [ ] Replace Node.js-specific APIs
- [ ] Build process migration
- [ ] CLI commands functional testing
- [ ] SQLite database validation
- [ ] API integration testing
- [ ] External tool integration (ffmpeg, s3cmd)
- [ ] Documentation updates
- [ ] Performance benchmarking

## Notes
- Bun's native TypeScript support may eliminate the need for the dist/ build step in development
- Consider whether to keep the tsc build for production or use bun build instead
- The AGENTS.md file mentions Node 20+ requirement - this will need updating
- Watch mode performance should improve significantly with Bun's faster file watching
