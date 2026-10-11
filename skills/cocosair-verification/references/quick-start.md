Derived from the cocosair-verification skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

In a source checkout, select only the focused gates needed by the change. The following are available read-only gates, not a mandatory sequence; use verify:release only for release acceptance.

```bash
npm run typecheck
npm run verify:web-only
npm run verify:doc-refs
npm run verify:feature-exports
npm run verify:release
```

`typecheck`, `verify:web-only`, `verify:doc-refs` and `verify:feature-exports` emit terminal diagnostics plus an exit code only. `verify:release` recomputes the candidate fingerprint and prints `READY` or `NOT READY` with blockers; it reads existing evidence and rebuilds nothing. A package-consumer check can be pointed at a scratch path so it does not overwrite canonical reports:

```bash
node tools/verify/graphics-package.cjs --out=output/graphics-package.json
```

That collector runs `npm pack`, installs the tarball offline under `output/`, refreshes `build/npm/` through prepack, creates and cleans temporary consumers, and writes the requested new `--out` JSON. It needs a working npm CLI, development/minified bundles with source maps and declarations; see [gate-catalog.md](gate-catalog.md).
