# verification gates and evidence triggers

For original references to the contracts below, see [Contracts](contracts.md). Source annotations refer to the AIR checkout.

## When to use what

- "did my source change break a contract" -> `npm run typecheck`, then `npm run verify:web-only` for the Web-only dependency boundary, then `npm test -- --runInBand` for logic and resource ownership (HEADLESS, so no pixel claims).
- "is a name reachable in the shipped default bundle" -> inspect its actual export and validate the import/bundler resolution for that entry and candidate. `verify:feature-exports` and `verify:custom-exports` are scoped structural checks, not general export-resolution proof; see [report-layers.md](report-layers.md).
- "will an npm consumer actually import it" -> `node tools/verify/graphics-package.cjs --out=<scratch.json>` or `npm run verify:consumer`; they pack and install offline and check real resolution and declaration consumption.
- "does it render correctly in a browser" -> the browser evidence collectors listed in [gate-catalog.md](gate-catalog.md); each needs Playwright tooling and matching browser binaries.
- "am I ready to release" -> `npm run verify:release`, and only after the relevant builds and evidence are current; it demands a clean worktree and aggregates existing evidence rather than recapturing it.
- "I need to know what a command does" -> read AGENTS.md's per-command table and [gate-catalog.md](gate-catalog.md); do not run a write gate to discover it.
