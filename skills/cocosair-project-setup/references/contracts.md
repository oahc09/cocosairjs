Derived from the cocosair-project-setup skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Contracts

- Package name is `cocosair.js` (root `package.json` `name`), version `1.0.0`; toolchain requires Node `>=18.0.0`; browsers require WebGL 2 - failure rejects `createAirApp()` with `WEBGL2_REQUIRED`.
- Runtime is ESM only: no UMD/CJS build, no default export. The repo root `package.json` is `type: commonjs` for the toolchain; runtime files under `build/` are ESM because `build/package.json` says `type: module`.
- The sole package export is `.`: the full default browser engine, AIR startup and HTML texture helpers.
- Main may be imported before canvas creation. Pass canvas and pixelRatioCap through createAirApp; repeated equivalent options share one admission/initPromise. For lazy loading, dynamically import the main entry in the application.
- Existing GameDiv/Cocos3dGameContainer must belong to the selected canvas; startup fills missing wrappers and binds input once. Custom canvas IDs are retained. Main remains browser-only; there are no independent light package entries.
- Top-level `await` requires `<script type="module">`.
- Version literals differ: `AIR_VERSION` is `"1.0.0"` (SDK), `VERSION` is `"4.0.0"` (engine baseline). Do not mix them.
- The default candidate is built from 26 feature units declared in `src/cc.config.json`. Feature-set membership is not reachability: `custom-pipeline-post-process` is in the default list yet post-process sits at decision-packet row 6 (D11/LV12-17, `docs/reference/owner-decisions.md:42`), approved as recommendation (b) in the r46 approval record (`docs/reference/owner-decisions.md:108-121`): variant-build-level evidence only. State layers separately: source export / default-bundle reachable / browser-verified.
- Never hand-edit `build/` - regenerate: `build` -> `build:min` -> `build:dts`, or `build:all`. `npm run prepack` (run by `npm pack`) copies source-map-free runtime files to `build/npm/`, which is what `exports` targets.
