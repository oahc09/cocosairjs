# Fresh public TerrainCollider runner

This closes the missing **executable host** for `../public-terrain.mjs`; it does not
replace its physical assertions, implement a physics engine, or turn CPU tests into physical
acceptance. Implementation/CPU preparation is not a native or public execution PASS.

## Host and boundaries

- Node HEADLESS/JSDOM, adapted from the existing
  `tools/verify/box3d/public-static-mesh/host.mjs`. Only DOM and exact frozen ST asset
  transport are adapted. No browser installation or browser launch is involved.
- Unmodified production `cocosair.module.js`, normal `createAirApp({ physics:
'box3d', renderMode: 3 })`, explicit ST asset directory and single-thread options.
  The actual public loader checks its embedded build descriptor against those assets.
- The project `createStepClock` stops native pacing and performs each `1 / 60` tick.
  Every AFTER_DRAW receipt is retained. There is no direct `physics.step`, replacement
  integration, synthetic body position, fake backend, or old runtime fallback.
- The existing fixture (with a copied-value observation callback) tests the uneven 3×3 terrain, six independent height rays,
  transformed/shared users, primitive sweep attribution, copied committed face data,
  static-only rejection, null/disable/enable/swap/out-of-order destroy, and a falling
  sphere with the unchanged 0.01 m tolerance and 12-step sustained-contact response.
- This is limited public Terrain evidence for C17. C19 remains
  `NOT_QUALIFIED_BY_PUBLIC_BEHAVIOR`: exact native destruction/cache lease proof must
  use the separate real `../run-native.mjs` fixture. No global matrix is updated.
  Browser, GPU, CSP, all-API, event, and full acceptance gates are NOT_RUN.

## Inputs and readiness

Requires Node with `module.registerHooks`, existing `jsdom` resolvable from the given
source root, and a separately authorized fresh same-product build. No dependency
installation or native build is performed by this runner.

SDK directory must contain `cocosair.module.js`, its map/declarations and
`package.json` with `type: module`. ST directory is the original ready build output,
not only its three shipped assets: `verifySTBuild` rechecks the real product's
artifact audit, native receipts and source identities; `consumer-ready.json` must
hash-match those receipts. No PASS is invented by merely spotting a manifest.
The reviewed Terrain schema is fixed to
`ce98aca1a40c4999df838c1eaab2b08b0533c85adca9866eb48180c6190575d6`.
Old schema, stale facade, missing native counter export, missing readiness, changed
inputs and missing records fail closed. Export inspection compiles WASM metadata
but does not instantiate it; freeze never imports the engine or steps physics.

The lock includes exact SDK/ST bytes, fixture bytes, and the current source tree
fingerprints. The producer commit is explicitly **caller-declared**, not deduced
from native ABI identity. Retain the separately reviewed ESM build/source receipt;
a source snapshot alone is not proof of the JS compiler's historical inputs.
Do not use historical SDK222/223 fingerprints or receipts for a new SDK.

After the final build, source formatting and authorization, from the repository root:

```sh
H=tools/physics/box3d/terrain-contract/public-harness
node "$H/freeze.mjs" SOURCE_ROOT SDK_DIR READY_ST_DIR BUILD_NUMBER JS_SHA256 PRODUCER_COMMIT NEW_LOCK.json
node "$H/run.mjs" --authorized-fresh-st SOURCE_ROOT SDK_DIR READY_ST_DIR NEW_LOCK.json NEW_ATTEMPT_DIR
```

All paths are explicit. The CLI execution flag is an accident guard, not permission.
Every output path must be new. Each terminal JSON and log is created once; the
observation JSONL is append-only during capture. Failed/timeout attempts are retained,
not overwritten or retried. Input-lock and fixture snapshots accompany the result.
Ray/sweep/drop samples are appended before their assertions, with primary and cleanup
failures retained separately. A failed cleanup cannot mask the primary assertion.
Before/after input verification, transport hashes, frames, public result, normal
`app.close()` ownership release and raw child exit status are all required.
The original clock lease remains held until app close so no extra pacer tick sneaks
in during shutdown. A killed process never qualifies as a normal close.

The bounded parent runs CPU controls (30 s) then the consumer (240 s); each child
has a SIGKILL deadline, retained raw status/signal/error, and nonzero failure exit.
This is a Node-process close boundary, not the browser campaign's ECHILD protocol.

## CPU controls only

```sh
node --test tools/physics/box3d/terrain-contract/{oracle,drop-oracle}.test.mjs \
  tools/physics/box3d/terrain-contract/public-harness/contract.test.mjs
```

The contract tests deliberately use fake identity/result metadata and a tiny inert
WASM export-table fixture that is never instantiated. They prove rejection logic,
not physics, readiness, native counters, or browser acceptance. A source-only syntax
check or CPU pass must always be reported with actual public/native execution
`NOT_RUN` until the authorized fresh assets are run successfully.
