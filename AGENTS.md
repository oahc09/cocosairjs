# AGENTS.md

Guidance for AI agents (and humans) working in this repository.

## What this repo is

**Cocos AIR** (Cocos Agent-first Interactive Runtime) is a standalone TypeScript runtime for interactive 3D web applications. It was extracted from the cocos4 Web engine so developers can create scenes with code and run them in a browser without Cocos Creator or its Editor asset pipeline. A typical application calls `createAirApp()`, builds a scene with the original Cocos `Scene`, `Node`, `Camera`, renderer, material, and animation APIs, then runs that scene through WebGL 2. Browser targets require WebGL 2; unsupported contexts reject startup with `WEBGL2_REQUIRED` (see [browser support policy](docs/webgl2-only.md)).

The runtime also supports direct glTF/GLB loading, including materials, skeletal animation, and supported extensions. The examples and manual teach those APIs. Separate development tools provide inspection, validation, and agent feedback; they are not part of the default runtime bundle. This repository is a Web engine and developer toolkit, not a Creator plugin, visual editor, or native-platform runtime.

Start with [README.md](README.md) for the current quick start and capability boundaries. [UPSTREAM.md](docs/UPSTREAM.md) records the engine source baseline and intentional differences from upstream.

## Repository layout

| Path                                              | Purpose                                                                                                                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cocos/`                                      | Extracted Cocos engine source. Keep upstream differences small and traceable.                                                                                           |
| `src/pal/`, `src/exports/`                        | Web platform adapters and build feature/export entry points.                                                                                                            |
| `src/air/`                                        | Cocos AIR's thin bootstrap, Code First helpers, built-in resources, and glTF integration.                                                                               |
| `build/`                                          | Generated ESM bundles, declarations, and separately shipped decoder assets.                                                                                             |
| `examples/`                                       | Runnable applications, Gallery metadata, and example assets.                                                                                                            |
| `docs/`                                           | Getting-started material, engine analysis, API guidance, and verification records.                                                                                      |
| `docs/manual/`                                    | Developer manual and its examples.                                                                                                                                      |
| `tools/`                                          | Build, development server, analysis, and verification tooling. `tools/debug/` contains optional development tools.                                                      |
| `tools/build/`, `tools/analyze/`, `tools/verify/` | Dependency vendoring and builds; dependency analysis and upstream group import; static gates and browser probes. Organize active tools by purpose, not release version. |
| `test/`                                           | Smoke tests and fixtures.                                                                                                                                               |
| `ai/`                                             | Topic-based plans, execution ledgers, and prompts; see `ai/README.md`. These are not proof that a feature shipped.                                                      |

PAL uses the frozen public MIT source in `vendor/pal-source/`. `node tools/build/pal-source.cjs --check` performs read-only verification of source hashes, generated outputs, and copyright notices; `--write` explicitly rebuilds `src/pal/`. Do not reintroduce bytes from the retired `@cocos/engine-pal` package.

See [tools/README.md](tools/README.md) for tool entry points and [repository organization conventions](docs/reference/repository-layout.md) for directory and naming rules. New examples use a main.ts entry in their src directory by default; existing example IDs, upstream paths, and evidence schema identifiers remain stable references. Documentation and evidence filenames describe their purpose; path migrations must update producers, consumers, and embedded artifact paths together.

## Development workflow

Initial development installs dependencies, generates the development bundle, then starts the server:

```bash
npm install
npm run build
npm run dev
```

`package.json` currently defines 48 `scripts`; run them from the repository root, except `baseline` (it reads `cwd/cc.config.json`, which does not exist here — invoke `tools/baseline/build-baseline.cjs` from the upstream cocos4 root instead). `npm test` is equivalent to `npm run test`; pass arguments with `npm run <name> -- <args>`. `docs/reference/npm-scripts.md` is the authoritative per-script catalogue of purpose, outputs, and **write behavior** — read the entry (or the script header) before running anything unfamiliar, because a name containing `verify` does not necessarily indicate a read-only operation.

The rules below are the parts you must know before running scripts rather than looking up:

- **Formatting is authoritative in config, not here.** [.prettierrc.json](.prettierrc.json), [.editorconfig](.editorconfig), and [.prettierignore](.prettierignore) define the rules; do not introduce a competing style or edit the config to accommodate unformatted code. TypeScript/JavaScript use 4 spaces, single quotes, semicolons, and a 120-character print width, UTF-8 with LF and a final newline. Format every new or edited file in scope before delivery; for a focused change run `npx prettier --write <paths>` then `--check` the same paths. `npm run format:check` is the complete gate (also enforced by CI). Never reformat extracted `src/`, third-party assets, license originals, generated inventories, or evidence records, and never add ignore entries to bypass the gate. Format source **before** collecting evidence that fingerprints it — formatting changes source bytes even when behavior does not, and a relabelled stale fingerprint is not a current PASS.
- **Runtime builds stamp identity.** `build`, `build:min`, and `build:system` write `build/package.json` (`type: module`) and `build/gltf-decoders/package.json` (`type: commonjs`); the latter only declares the module format of existing decoder files and **does not download or generate decoder JS/WASM assets**. Runtime builds inject `AIR_BUILD_DATE` (`yyyyMMddHHmm`, Asia/Shanghai) and `AIR_BUILD_NUMBER` as a compilation counter starting at 1; each successful runtime JS build advances `tools/build/build-number.json`, and `build:all` compiles development and minified JS separately, **consuming two numbers**. Declaration builds and packaging do not increment it, and the counter survives cleanup of generated `build/`. `SOURCE_DATE_EPOCH` pins only the time, not the counter. The scripts support `AIR_FEATURES` and `AIR_OUT_DIR`; those variants neither refresh default release-side files nor share the default ESM incremental cache, and `build:dts` does not follow `AIR_OUT_DIR`.
- **Frozen generators must be location-independent.** Plugin namespace paths, generated comments, and source-map identities use repository-relative logical paths, never a checkout's absolute host path. Verify generated bytes in two different clean directories. A drift check must compare the actual on-disk JS, map, and declarations with fresh generated bytes, not only trust an ignored manifest from an earlier local build. Restoring a missing generator receipt on CI must keep all committed generated-source hashes unchanged; otherwise stop and regenerate/review the candidate explicitly.
- **Use the single main runtime entry.** Startup and experimental HTML texture APIs are exported by `cocosair.js`; builds no longer emit independent bootstrap/HTML JS or declaration files. `prepack` copies only the main unminified/minified JS without source maps to `build/npm/`. The npm `files` list includes AIR-specific `skills/`; no skills are installed into the host automatically.
- **Browser evidence needs real tooling.** The browser collectors require resolvable Playwright tooling and matching browser binaries; when Playwright is not a project dependency use the configured tooling environment or `NODE_PATH`. A successful `npm install` does not establish browser availability, and an existing `build/cocosair.module.js` is usually required. Ordinary viewing uses the native pacer; actions/assertions must pause it and advance via the single step clock. A matching GPU readback alone is not compositor presentation evidence, and `--mobile` initializes at a mobile viewport independently.
- **The main entry is browser-only but may be imported before a canvas exists.** Pass the selected canvas and optional pixelRatioCap to createAirApp: admission precedes globals, wrappers, PAL screen/input binding and engine initialization. There are no separate bootstrap/html-source package entries; the main entry is not SSR-compatible. Use `examples/starter/` for the minimal page structure. For model loading and decoder deployment, see [docs/gltf/gltf-runtime.md](docs/gltf/gltf-runtime.md) and [docs/gltf/gltf-decoder-deployment.md](docs/gltf/gltf-decoder-deployment.md).

When adding or changing an npm script, update `docs/reference/npm-scripts.md` with its purpose, output paths, and write behavior, and keep the script count above accurate.

## Working agreements

- **License headers on new source files.** Every new TypeScript file under `src/air/` starts with the project's MIT header block, using this copyright line as the first line after `/*`:

  ```
  Copyright (c) 2026-2027 oahc09@gmail.com
  ```

  Followed by the standard MIT permission and warranty text (copy the block verbatim from any existing `src/air/*.ts` file). Use this same line in any generator that emits TypeScript or declarations for `src/air/` — for example `tools/build/spark-runtime-tree.cjs` composes the `spark-runtime.d.ts` banner, so the header comes from the generator, not a hand edit. A generated file's declared bytes are hash-gated: after changing a generator banner, re-run the generator and its `--check` drift gate rather than editing the output.

  Do **not** touch headers on extracted upstream code. Files under `src/cocos/`, `src/pal/`, `src/exports/`, `src/external/`, and `src/extensions/` keep their upstream `Copyright (c) ... Xiamen Yaji Software Co., Ltd.` / `Chukong Technologies Inc.` lines — they are byte-tracked against the pinned baseline, and changing them breaks `verify:file-map`. `src/air/` is AIR-owned code and uses the line above.

- Treat the original Cocos engine API as the main public API. Add AIR-specific conveniences in `src/air/` where needed; avoid creating parallel `Scene`, `Node`, or material abstractions.
- Preserve the Web-only boundary. Keep Creator Editor, JSB, and native implementations out of the runtime dependency graph. The glTF decoders ship separately from the main bundle and are configured only when needed.
- Keep development inspection and agent tools separate from the default runtime package. A Gallery or example may opt into them explicitly.
- Before changing extracted engine files, read the relevant upstream mapping and record intentional differences in `docs/upstream-file-map.json` and [UPSTREAM.md](docs/UPSTREAM.md). Do not silently replace the pinned upstream baseline.
- Preserve unrelated local changes. Check the target file and Git status before editing; avoid resetting or cleaning another contributor's work.
- Use focused validation for the affected behavior. For visual or rendering changes, check the actual browser result; typecheck or a successful bundle alone does not establish visual correctness. Some verification scripts write evidence files, so inspect their effects before running them in a shared worktree.
- Keep claims about completion tied to the current code and verification evidence. A version plan, a passing subset, or a generated report from an older revision does not by itself establish release readiness. A report file's existence does not establish success in the current run — check the exit code, timestamp, completion/subset markers, and applicable fingerprints; do not run evidence-writing gates merely to learn what they mean.
- **Example evidence is a frozen, full-scope contract.** Follow [the fixed-snapshot campaign workflow](docs/reference/example-evidence-campaign.md): finish formatting, real dependency installation, fresh main/Spark builds and declarations, and dependency preflight before freezing. Collect bounded, physically closed attempts; retain every raw report, screenshot, response body, receipt, and failed retry. Any source, SDK, example, dependency, contract, or tool change invalidates resume and requires fresh evidence. Never edit fingerprints, reuse historical PASS rows, drop an ID/mode, lower status, or call a partial shard complete to clear a gate. Publish only a strictly validated complete live-manifest campaign through the constrained publisher: existing stable promotion fields may be refreshed from full results, while statuses, draft promotions, manifest time/revision, and all other fields stay unchanged. Its durable incomplete-publication guard is fail-closed and must not be removed to conceal interruption. Keep provenance portable inside the repository. CI validates committed evidence before building and collects new full evidence after building; the separate `requiresDevTools` examples cannot fill ordinary-browser coverage gaps.

- **Controlled example API claims require effect proofs.** If an API is reachable only through an example-owned test control, connect that real control in the collector and validate its time/state/render/resource effects from retained raw observations. Keep harness readbacks out of API execution counts, restore native pacing after controlled steps, and make the shared consumer reject missing or altered proof. A primary-session adapter does not establish a separate multi-browser acceptance matrix. Never satisfy coverage by deleting claims or making unverified harness calls.
