Derived from tools/build/build.cjs, src/cc.config.json, docs/reference/web-features.md, docs/reference/owner-decisions.md, AGENTS.md (as of 2026-10-07).

## Feature-unit accounting (facts read from disk)

- Declared feature units: `src/cc.config.json` `features` block (lines 3-282) declares 33 units.
- Default build set: `tools/build/build.cjs:24-44` (`AIR_FEATURES` array) selects 26 of them.
- `npm run build`, `build:min` and `build:system` pass this set to ccbuild (`tools/build/build.cjs:97`).

Default 26 units (`tools/build/build.cjs:24-44`): `air`, `base`, `gfx-webgl2`, `gfx-empty`, `3d`, `animation`, `skeletal-animation`, `primitive`, `tween`, `custom-pipeline`, `legacy-pipeline`, `profiler`, `video`, `webview`, `2d`, `physics-2d-framework`, `particle-2d`, `tiled-map`, `ui`, `spine-3.8`, `spine-4.2`, `dragon-bones`, `physics-2d-box2d`, `physics-builtin`, `physics-cannon`, `custom-pipeline-post-process`.

The 7 declared-but-unselected units:

| Unit                    | Declared at              | Documented reason                                                                                                                              |
| ----------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `marionette`            | `src/cc.config.json:59`  | decision-packet row 5, recommendation (b): pose graph stays out of the default set, variant-buildable (`docs/reference/owner-decisions.md:41`) |
| `procedural-animation`  | `src/cc.config.json:65`  | same decision row as `marionette`                                                                                                              |
| `physics-2d-builtin`    | `src/cc.config.json:134` | 2D default backend is box2d; one backend per graph, others via variants (`tools/build/build.cjs:31,36-37`)                                     |
| `audio`                 | `src/cc.config.json:253` | not in the default selection list (`tools/build/build.cjs:24-44`) although the aggregate re-exports `./audio` (`src/exports/air.ts:40`)        |
| `physics-ammo`          | `src/cc.config.json:258` | wasm/native-asset backends are variant-build territory (`tools/build/build.cjs:36-37`, `docs/reference/web-features.md:13`)                    |
| `physics-physx`         | `src/cc.config.json:267` | same                                                                                                                                           |
| `physics-2d-box2d-wasm` | `src/cc.config.json:276` | same                                                                                                                                           |

Membership facts only: a unit in the default list is not proof its user surface is reachable, and a unit absent from the list is not the same claim as "symbol missing from the declarations". Check the three layers separately - source export (present in the entry `.d.ts`), default-bundle reachable (exported and wired through the default aggregate), browser-verified (executed PASS against the current candidate). Worked example: `custom-pipeline-post-process` is in the default list (`tools/build/build.cjs:43`), yet post-process is unreachable at the user surface in the current shipping posture; decision-packet row 6 (D11/LV12-17, `docs/reference/owner-decisions.md:42`) carries recommendation (b): variant-build-level evidence only (a bloom/fxaa/color-grading switch comparison under a variant build). That recommendation was approved in bulk by the r46 approval record (`docs/reference/owner-decisions.md:108-121`, which signs row 5 and row 6 as option (b)); the per-row approval cell in the decision table itself is blank because approvals were recorded as one batch section, not per row.

## Environment-variable semantics (tools/build/build.cjs)

| Variable            | Effect                                                                                                                                                                                                                     | Source                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `AIR_FEATURES`      | Comma-separated list overrides the default 26-unit set (`FEATURES`, line 48; used at line 97). Same name also selects the dependency-analysis feature set in `tools/analyze/dep-graph.cjs` (`tools/build/build.cjs:46-47`) | `tools/build/build.cjs:48,97`                                 |
| `AIR_OUT_DIR`       | Redirects all outputs of the run to that directory; default is `build/` (`OUT`, line 51)                                                                                                                                   | `tools/build/build.cjs:51`                                    |
| `SOURCE_DATE_EPOCH` | Pins `AIR_BUILD_DATE` only; the build counter is not pinned                                                                                                                                                                | `tools/build/build.cjs:80`, `AGENTS.md` build-scripts section |

## Variant-build rules

- A run is a variant when `AIR_FEATURES` is set or `AIR_OUT_DIR` points elsewhere (`tools/build/build.cjs:52`); the log marks it `[variant]` (line 147).
- Variants do not share the default ESM incremental cache (cache path requires `!VARIANT`, `tools/build/build.cjs:103`) and do not write the default-only module-format markers `build/package.json` and `build/gltf-decoders/package.json` (`tools/build/build.cjs:152-162`).
- A variant with `AIR_FEATURES` but without `AIR_OUT_DIR` still overwrites the tracked default bundle in `build/` (`OUT` default, `tools/build/build.cjs:51,117`) - redirect output to keep the default candidate intact.
- Unknown feature names fail the build up front (`tools/build/build.cjs:57-64`): ccbuild silently ignores units missing from `src/cc.config.json` and produces byte-identical default output, so the guard rejects them with an explicit message instead.
- Variants do not auto-update default release files or run evidence; a variant candidate and the default candidate are different fingerprint identities (`docs/reference/web-features.md:15`, `AGENTS.md` `verify:port-candidate` section).

## Commands that read the feature surface

| Command                          | Checks                                                                         | Source                                           |
| -------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ |
| `npm run verify:web-only`        | Runtime dependency closure stays Web-only                                      | `docs/reference/web-features.md:18`              |
| `npm run verify:feature-exports` | Capability names, feature units, aggregate exports, default bundle composition | `docs/reference/web-features.md:19`, `AGENTS.md` |
| `npm run verify:custom-exports`  | Custom pipeline / post-process sources and default boundaries                  | `docs/reference/web-features.md:20`              |
| `npm run verify:wasm-backends`   | WASM backend source closures and registration boundaries                       | `docs/reference/web-features.md:21`              |

`npm run analyze` rewrites the reachability manifest from the same `AIR_FEATURES` environment variable (`docs/reference/web-features.md:15`, `AGENTS.md` inventories section).
