# AGENTS.md

Guidance for AI agents (and humans) working in this repository.

## What this repo is

**Cocos AIR** (Cocos Agent-first Interactive Runtime) is a standalone TypeScript runtime for interactive 3D web applications. It was extracted from the cocos4 Web engine so developers can create scenes with code and run them in a browser without Cocos Creator or its Editor asset pipeline. A typical application calls `createAirApp()`, builds a scene with the original Cocos `Scene`, `Node`, `Camera`, renderer, material, and animation APIs, then runs that scene through WebGL 2. Browser targets require WebGL 2; unsupported contexts reject startup with `WEBGL2_REQUIRED` (see [browser support policy](docs/webgl2-only.md)).

The runtime also supports direct glTF/GLB loading, including materials, skeletal animation, and supported extensions. The examples and manual teach those APIs. Separate development tools provide inspection, validation, and agent feedback; they are not part of the default runtime bundle. This repository is a Web engine and developer toolkit, not a Creator plugin, visual editor, or native-platform runtime.

Start with [README.md](README.md) for the current quick start and capability boundaries. [UPSTREAM.md](docs/UPSTREAM.md) records the engine source baseline and intentional differences from upstream.

## Repository layout

| Path | Purpose |
|---|---|
| `src/cocos/` | Extracted Cocos engine source. Keep upstream differences small and traceable. |
| `src/pal/`, `src/exports/` | Web platform adapters and build feature/export entry points. |
| `src/air/` | Cocos AIR's thin bootstrap, Code First helpers, built-in resources, and glTF integration. |
| `build/` | Generated ESM bundles, declarations, and separately shipped decoder assets. |
| `examples/` | Runnable applications, Gallery metadata, and example assets. |
| `docs/` | Getting-started material, engine analysis, API guidance, and verification records. |
| `docs/manual/` | Developer manual and its examples. |
| `tools/` | Build, development server, analysis, and verification tooling. `tools/debug/` contains optional development tools. |
| `tools/build/`, `tools/analyze/`, `tools/verify/` | Dependency vendoring and builds; dependency analysis and upstream group import; static gates and browser probes. Organize active tools by purpose, not release version. |
| `test/` | Smoke tests and fixtures. |
| `ai/` | Topic-based plans, execution ledgers, and prompts; see `ai/README.md`. These are not proof that a feature shipped. |

PAL uses the frozen public MIT source in `vendor/pal-source/`. `node tools/build/pal-source.cjs --check` performs read-only verification of source hashes, generated outputs, and copyright notices; `--write` explicitly rebuilds `src/pal/`. Do not reintroduce bytes from the retired `@cocos/engine-pal` package.

See [tools/README.md](tools/README.md) for tool entry points and [repository organization conventions](docs/reference/repository-layout.md) for directory and naming rules. New examples use `src/main.ts` by default; existing example IDs, upstream paths, and evidence schema identifiers remain stable references. Documentation and evidence filenames describe their purpose; path migrations must update producers, consumers, and embedded artifact paths together.

## Development workflow

The descriptions below cover the current 37 `scripts` in [package.json](package.json). Run them from the repository root, except for `baseline` as explained below. `npm test` is equivalent to `npm run test`; pass script arguments with `npm run <name> -- <args>`.

For initial development, install dependencies, generate the development bundle, and then start the server:

```bash
npm install
npm run build
npm run dev
```

### Built-in npm commands (not project scripts)

| Command | Purpose | Outputs and write behavior |
|---|---|---|
| `npm install` | Install project dependencies according to the dependency declarations. | Writes `node_modules/` and may update `package-lock.json` if dependency resolution changes; does not build the engine automatically. |
| `npm ci` | Install strictly from the existing lockfile, suitable for CI or reproducing the dependency environment. | Removes and recreates `node_modules/`; does not update the lockfile or build the engine. |
| `npm pack` | `prepack` prepares source-map-free release copies in `build/npm/` from existing local bundles, then packages the files listed in `package.json`. | Creates `cocosair.js-<version>.tgz` in the current directory by default; does not compile the engine. Run `npm run build:all` before packaging. Does not upload to a registry. |

### Daily development and formatting

| Command | Purpose | Outputs and write behavior |
|---|---|---|
| `npm run dev` | Start the local example server at `http://127.0.0.1:7454/` with `starter` by default; supports `-- --example hello-cube --port 7454`. Engine/AIR source changes trigger a rebuild and reload; example, manual, and debug-tool changes trigger a reload only. | Runs a persistent HTTP server; compiles example TS into memory on request, without generating a static site. Source changes refresh `build/cocosair.module.js` and its map. Startup does not guarantee that the bundle exists or is current; run `build` first. |
| `npm run typecheck` | Use the root `tsconfig.json` and its exclusion list to check TypeScript in `src/`; does not cover all examples or tools. | Uses `noEmit: true`; outputs diagnostics and an exit code, without generating JS or `.d.ts` files. |
| `npm test` | Run Jest tests in `test/smoke/*.test.ts` using jsdom + HEADLESS; use `npm test -- --runInBand` for serial execution. | Outputs test reports and creates test temporary files/caches; does not build release bundles or replace browser visual verification. |
| `npm run format` | Use Prettier to format the examples, manual examples, selected tools, and workflow documents explicitly listed in `package.json`, respecting `.prettierignore`. | **Rewrites** matching source files and documents in place; does not format the entire repository. Upstream `src/` is excluded, and embedded Markdown code is preserved according to the existing configuration. |
| `npm run format:check` | Check formatting over the same scope as `format`. | Outputs results and an exit code; does not rewrite files or generate report files. |

### Builds and the upstream baseline

| Command | Purpose | Main outputs and write behavior |
|---|---|---|
| `npm run build` | Build the unminified Web ESM runtime with the default feature set. | Writes `build/cocosair.module.js` and `build/cocosair.module.js.map`; refreshes the module-format markers described below and may update the incremental cache. Does not update the minified bundle or type declarations. |
| `npm run build:min` | Build the minified ESM version of the same runtime. | Writes `build/cocosair.module.min.js` and `build/cocosair.module.min.js.map`; refreshes module-format markers. Does not update the unminified bundle or type declarations. |
| `npm run build:dts` | Bundle engine declarations and convert them into SDK declarations that npm consumers can import directly. | Writes `build/cocosair.module.d.ts`; may leave intermediate `build/.dts-tmp-*` and `build/.dts-before-bundle-*` directories. Does not generate runtime JS. |
| `npm run build:all` | Sequentially build unminified ESM, minified ESM, and declarations, prepare source-map-free release copies in `build/npm/`, then check the bundles for built-in resources. | Generates local development JS + maps, `.d.ts`, release JS copies in `build/npm/`, and module-format markers; outputs check results to the terminal. **Does not** generate a `.tgz`, build a static Gallery, recapture browser evidence, or publish. |
| `npm run prepack` | Prepare npm release copies from existing local bundles; called automatically by `npm pack`. | Writes source-map-free JS copies to `build/npm/`; does not compile the engine or upload the package. |
| `npm run build:system` | Build SystemJS modules for applications requiring that loading format. | Writes `build/cc.js` and `build/cc.js.map`, and refreshes module-format markers. This is not the default npm ESM entry and is not included in `build:all`. |
| `npm run baseline` | Build the historical upstream cocos4 Web baseline using SystemJS chunks, excluding features that require unavailable native/external assets. | Writes `bin/dev/cc-baseline/` inside the **current engine directory**. The script reads `cwd/cc.config.json` directly, which does not exist at the AIR repository root, so running this npm script directly here fails. Invoke this repository's `tools/baseline/build-baseline.cjs` from the upstream cocos4 root instead. |

Default `build`, `build:min`, and `build:system` runs write `build/package.json` (`type: module`) and `build/gltf-decoders/package.json` (`type: commonjs`). The latter only declares the module format of existing decoder files; it **does not download or generate decoder JS/WASM assets**. The build script supports `AIR_FEATURES` to override the feature set and `AIR_OUT_DIR` to redirect output. These variants neither refresh default release-side files nor share the default ESM incremental cache. `build:dts` is independent and does not follow `AIR_OUT_DIR`.

### Inventories, resource registration, and report generation

These commands write repository content; a name containing `verify` does not necessarily indicate a read-only operation.

| Command | Purpose | Outputs and write behavior |
|---|---|---|
| `npm run analyze` | Analyze Web feature reachability, platform overrides, and upstream extraction relationships. | Rewrites `docs/extraction-manifest.json` and `docs/upstream-file-map.json` by default; writes the dependency graph to `build/reports/web-dependency-graph.json`. `OUT_DIR` redirects output, and `AIR_FEATURES` selects the feature set. |
| `npm run vendor:npm` | Copy runtime subsets from installed Box2D, Cannon, and DragonBones npm packages so the builder within `src/` can resolve the actual package layout. | Writes runtime files to `src/node_modules/@cocos/{box2d,cannon,dragonbones-js}/`, along with trimmed `package.json` files; appends missing registrations to `docs/upstream-file-map.json`. This is more than dependency installation. |
| `npm run gallery:manifest` | Aggregate Gallery display fields from `examples/<id>/example.json`. | Rewrites `examples/files.json`; does not compile examples, generate Gallery HTML, or produce browser evidence. |
| `npm run gallery:api` | Generate the public API inventory, classifications, and fingerprints from the AST of `build/cocosair.module.d.ts`. | Rewrites `docs/example-api-inventory.json`; requires current declarations and does not execute API cases. |
| `npm run capabilities` | Read the glTF extension support matrix in a real browser, then merge existing verification levels and model catalog information. | Rewrites `examples/gltf-catalog/capabilities.json`. Requires working Bash/Playwright CLI tooling (`PWCLI` can specify a wrapper) and a development server at `127.0.0.1:7462`, for example `npm run dev -- --port 7462` in another terminal. |
| `npm run verify:api-coverage` | Compute claimed/attested/verified coverage from the API inventory, example specifications, execution evidence, and fingerprints, and enforce coverage checks. | Rewrites `docs/api-coverage-report.json` by default, even when the gate fails; `-- --check` compares the existing report without rewriting it. Does not run browsers to fill evidence gaps. Passing a regression floor does not establish release readiness. |
| `npm run verify:v06-gate` | Aggregate existing Golden Reference, Catalog, Recipe, and other evidence to evaluate the V0.6 gate. | Rewrites `docs/evidence/v06-review-gate.json` and `build/reports/v06-final-gate.md`; does not rerun the evidence collectors automatically. The report may be marked `BLOCKED` on failure. |

### Static gates, tests, and package-consumer verification

| Command | Purpose | Outputs and write behavior |
|---|---|---|
| `npm run verify:web-only` | Rebuild the dependency graph in a temporary directory and check that the runtime closure excludes Native, MiniGame, and other platform implementations and unregistered external dependencies. | Outputs the result to the terminal and cleans up temporary analysis JSON; does not rewrite canonical dependency inventories in `docs/`. |
| `npm run verify:file-map` | Check extracted files, upstream originals, modification registrations, the manifest, and moduleOverrides for consistency. | Outputs results without default writes; requires accessible upstream cocos4 sources (`COCOS_UPSTREAM` can specify the path) and dependency packages. |
| `npm run verify:licenses` | Check third-party runtime license texts, package inclusion rules, and bundle fingerprints against default/variant capabilities. | Outputs results without a default report file; does not add missing licenses automatically. |
| `npm run verify:doc-refs` | Check local path references in the root README, top-level docs, and documentation topic directories, using the existing broken-link baseline to reject new broken links or stale baseline entries. | Outputs terminal JSON and an exit code by default; writes a report only when an output option is provided. Does not edit documents or check whether external URLs are reachable. |
| `npm run verify:wasm-backends` | Check WASM physics backend source closures, registrations, feature boundaries, and type-check exemption conditions. | Outputs results without a fixed artifact; source checks do not establish browser runtime behavior. |
| `npm run verify:custom-exports` | Check custom pipeline/post-process sources, aggregate exports, and default feature boundaries. | Outputs results without a fixed artifact; does not verify pixels. |
| `npm run verify:feature-exports` | Reconcile capability names, feature units, aggregate exports, and default bundle composition. | Outputs results without a fixed artifact. Some checks are skipped if the bundle is missing; inspect the reported scope. |
| `npm run verify:example-chain` | Check existing V1.1 evidence structure, per-item validators, completion markers, candidate consistency, and test consumers. | Outputs results without a fixed artifact or browser startup. Discloses mismatches between the current candidate and evidence; passing this gate alone does not establish evidence freshness. |
| `npm run verify:test-inventory` | Run Jest and compare suite/test names, execution status, and registered inventories to detect undiscovered or skipped tests. | Outputs terminal JSON by default; reads and deletes temporary `build/.test-inventory-<pid>.json`. Only explicit `-- --update` rewrites `docs/test-inventory.json`. |
| `npm run verify:benchmark` | Run `noEmit` type checks for benchmark tools, then regress compilation diagnostics, metric aggregation, isolation/timeouts, and Recipe catalog compilation. | Outputs terminal JSON and cleans up temporary work directories; does not generate benchmark score reports or run a full performance test. |
| `npm run verify:g3-tooling` | Regress nested-source fingerprints, development-server JS/TS resolution precedence, texture row orientation, and resource status/byte-count handling. | Outputs results; creates and cleans up test files in system temporary directories, without generating formal evidence JSON. |
| `npm run verify:decoders` | Check decoder files, licenses, manifest/hashes, and offline loading from the package. | Outputs terminal JSON; runs `npm pack`, creates temporary `.tgz` and `build/.tmp-pack-audit-*` files/directories, then cleans them up. Does not install or download missing decoders. |
| `npm run verify:consumer` | Package and install into an independent temporary project, then check actual `import()`, public APIs, consumer type checking, decoder files, and README links within the package. | Outputs terminal JSON; creates a local `.tgz` and temporary consumer project and cleans them up on normal completion. Does not build the engine being packaged. |
| `npm run verify:release` | Evaluate release readiness against the current candidate, declarations/API inventory, coverage, Gallery, and browser evidence, requiring a clean Git worktree. | Outputs `READY` / `NOT READY`, blockers, and an exit code only; does not rebuild, recapture evidence, package, or publish. Run after the relevant builds and evidence have been updated. |

### Browser evidence collection (writes reports or screenshots)

These commands require resolvable Playwright tooling and matching browser binaries. When Playwright is not a project dependency, use the configured tooling environment or `NODE_PATH`; successful `npm install` does not establish browser availability. An existing `build/cocosair.module.js` is usually required; see specific prerequisites below.

| Command | Purpose and prerequisites | Outputs and write behavior |
|---|---|---|
| `npm run verify:browser-matrix` | Run contract entries in Chromium, Firefox, and WebKit using `tools/verify/browser-matrix-contract.json`; requires the bundle, example assets, and browser binaries. The contract defines the scope, which is not equivalent to every Gallery example. | Rewrites `docs/evidence/browser-matrix/browser-matrix.json` by default; writes screenshots to `docs/evidence/browser-matrix/<id>/matrix-<engine>.png` (some also have `-before.png`). Subset runs are not full verification. `--out=` redirects JSON only; screenshots still use these directories. |
| `npm run verify:perf-lifecycle` | Use the generated static Gallery in `build/examples/` to verify repeated loading/instantiation/disposal and loading-time stability in Chromium. | Rewrites `docs/evidence/perf-lifecycle.json`; does not build the static Gallery. Unavailable memory measurements are recorded as unavailable. |
| `npm run verify:tarball-consumer` | Package temporarily and install offline into a new project, then run the installed package in Chromium to verify startup, APIs, pixels, source-map-free npm entries, local development source maps, and nested-path/CSP cases. | Rewrites `docs/evidence/tarball-browser-consumer.json`; `prepack` refreshes `build/npm/`, and temporary packages and consumer directories are cleaned up afterward. |
| `npm run verify:g3-dev` | Automatically start the development server and Chromium, then check module loading, component updates, and interaction in `starter`, `hello-cube`, and `scene-switch-reentry`. | Writes `docs/evidence/g3-dev-samples.json` on success and screenshots to `output/playwright/g3-<id>.png`; closes the server and browser afterward. |

A report file's existence does not establish success in the current run: check the exit code, timestamp, completion/subset markers, and applicable source/bundle/contract fingerprints. Do not run evidence-writing gates merely to learn command meanings. When adding or changing an npm script, update this section with its purpose, output paths, and write behavior.

The `#GameCanvas` element must exist before importing the engine in a browser page because the screen adapter initializes during module import. Use `examples/starter/` for the minimal page structure. For model loading and decoder deployment, see [docs/gltf/gltf-runtime.md](docs/gltf/gltf-runtime.md) and [docs/gltf/gltf-decoder-deployment.md](docs/gltf/gltf-decoder-deployment.md).

## Working agreements

- Treat the original Cocos engine API as the main public API. Add AIR-specific conveniences in `src/air/` where needed; avoid creating parallel `Scene`, `Node`, or material abstractions.
- Preserve the Web-only boundary. Keep Creator Editor, JSB, and native implementations out of the runtime dependency graph. The glTF decoders ship separately from the main bundle and are configured only when needed.
- Keep development inspection and agent tools separate from the default runtime package. A Gallery or example may opt into them explicitly.
- Before changing extracted engine files, read the relevant upstream mapping and record intentional differences in `docs/upstream-file-map.json` and [UPSTREAM.md](docs/UPSTREAM.md). Do not silently replace the pinned upstream baseline.
- Preserve unrelated local changes. Check the target file and Git status before editing; avoid resetting or cleaning another contributor's work.
- Use focused validation for the affected behavior. For visual or rendering changes, check the actual browser result; typecheck or a successful bundle alone does not establish visual correctness. Some verification scripts write evidence files, so inspect their effects before running them in a shared worktree.
- Keep claims about completion tied to the current code and verification evidence. A version plan, a passing subset, or a generated report from an older revision does not by itself establish release readiness.
