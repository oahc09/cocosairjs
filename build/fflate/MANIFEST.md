# fflate asset (SPZ decompression dependency)

`fflate` is **never** a `package.json` dependency and is **never** resolved from `node_modules`.
It ships as standalone third-party build assets in this directory (included verbatim by
`npm pack` through the package `files` field), exactly like `build/gltf-decoders/`.

Consumption: `tools/build/spark-runtime-tree.cjs` resolves the bare specifier at **build time**
(rollup alias `^fflate$` -> this directory's `esm/browser.js`). The two bare `from "fflate"` imports
in the frozen vendored Spark tree (`vendor/spark/src/SplatLoader.ts` -> `unzipSync`,
`vendor/spark/src/utils.ts` -> `Gunzip`) are left **byte-identical**; no generator rewrites them.
This manifest only lands the asset; the wiring lives in that build tool.

## Provenance

Source: `npm pack fflate@0.8.2` (github.com/101arrowz/fflate) - exit 0, tarball `fflate-0.8.2.tgz`,
168507 bytes, SHA-256 `61fd5061e2fc8e5e3e3129f7f2fec7bd78a313e1bf4becbf1cc1cc9998d141dc`
(kept in the gitignored `output/spark-deps/`, regenerate with
`npm pack fflate@0.8.2 --pack-destination output/spark-deps`). License: MIT
(verbatim upstream `LICENSE`, copyright line: `Copyright (c) 2023 Arjun Barrett`).

No upstream file was reformatted, bundled, or minified - per-file SHA-256 below is identical to
the same path inside the tarball.

## Landed files

| file | bytes | sha256 |
|---|---|---|
| esm/browser.js | 89198 | 8cc1f687e0159e977addb6b85e274dbd11e622cf151f4fcb7b85d49622ea43e7 |
| esm/browser.d.ts | 50889 | a409cb812a758508ca4f687af6e1403538e325566bba01fa3d2ed4a564b771ad |
| LICENSE | 1069 | 805f6cb28bb8b6d3a0badd83c93bccd9671fa01a3b4b92b7042b0743325ac243 |

`esm/browser.js` is the ESM entry for bare `"fflate"` under bundler/browser conditions: the
package `exports` map resolves `.` -> `import` -> `./esm/browser.js`. It is fully self-contained
(zero `import`/`require` statements; its worker threads are inlined via `Blob` +
`URL.createObjectURL`), so no sibling module had to be landed. Loads cleanly under Node:
`import('file:///.../build/fflate/esm/browser.js')` exports 49 names including `unzipSync` and
`Gunzip`. `esm/browser.d.ts` is the matching types file from the same `exports` branch.

## Dropped upstream files (exports-map justification)

- `lib/*.cjs`, `lib/*.cts` - CommonJS only; reached exclusively via the `require` conditions of
  the `exports` map, which a rewritten ESM import never takes.
- `umd/index.js` - only reachable via the non-resolution `unpkg`/`jsdelivr` fields.
- `esm/index.mjs` + `esm/index.d.mts` - the **Node**-conditional ESM entry (`exports["."].node.import`);
  it imports the built-in `module` API and would break browser/cocos bundles. Runtime target is
  browser, so the browser entry is landed instead. Note the package ships no `esm/index.js`;
  `esm/browser.js` is its ESM entry for this project's consumption path.
- `CHANGELOG.md`, `README.md` - documentation, not runtime imports.
- `lib/node-worker.cjs` / `lib/worker.cjs` - Node/worker shims for the `lib/` CJS builds only.

## Serving / MIME

- The dev server and static staging serve `esm/browser.js` as `text/javascript` (same rule as
  `build/gltf-decoders/`).

## Package module scope

Local packaging metadata (MIT, cocosair.js): keeps the ESM entry loadable as an ES module by
Node's resolver when opened through a `file://` specifier. It is not upstream content.

| file | bytes | sha256 |
|---|---|---|
| package.json | 23 | 3ca9d4afd21425087cf31893b8f9f63c81b0b8408db5e343ca76e5f8aa26ab9a |
