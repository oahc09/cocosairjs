# Limited production-ESM static MeshCollider consumer

This is a Node HEADLESS/JSDOM public-API subset, not browser, GPU, presentation, or release acceptance. Full Gates and C16–C19 are NOT_RUN. Public Mesh collision/trigger events remain unqualified and rejected; exercising that rejection does not qualify the events.

The consumer imports the unchanged ordinary production `cocosair.module.js`, calls public `createAirApp`, uses the real production asset loader and real frozen single-threaded WASM, and advances through public `createStepClock`. It never registers a test adapter, accesses a private component shape or native handle, wraps native calls, replaces physics, or builds a test-only engine. The host adaptation is copied from `public-round-hull`: JSDOM supplies a headless DOM; exact asset URLs read and hash-check frozen manifest/module/WASM bytes; the Node `registerHooks` host resolver maps only the production loader's precise HTTPS module request to the unchanged local module. This does not establish browser transport or rendered output.

## Checks and limits

- A hand-authored two-submesh, four-triangle surface has an empty central gap. An independent scalar Möller–Trumbore oracle computes ray intersection points, distances, normals, and expected source-face indices without importing production geometry code. Every source face is sampled strictly inside its triangle, away from shared edges.
- Three public static MeshCollider components use the same authored Mesh. Ordinary PhysicsSystem rays establish collider identity and geometry; public before-step committed queries establish copied immutable submesh, primitive, and flattened source-face metadata. Authored bytes are then zeroed and all live borrowers must retain the admitted geometry.
- Unsupported second-submesh topology, duplicate oriented source indices, and an undersized nonzero triangle reject without changing cached public mesh identity, committed public body motion, or any of the three borrowers' rays. Duplicate indices are a source-intake rejection, not a native-cook call. The undersized triangle asserts the public native-error path, while actual native cook entry, `not-mutated`, exact resource counts, and core/bridge memory atomicity belong to the separate source/native fixture evidence. This consumer does not claim to observe those private internals.
- Existing static mesh bodies reject both dynamic and kinematic type changes. Already nonstatic bodies reject a static Mesh assignment while retaining null geometry and their earlier public motion state.
- Shared-source lifecycle checks include replacing one borrower, disabling and re-enabling another, destroying a third, detaching the replacement and last original, assigning fresh geometry after last release, and destroying all. Surviving public colliders must keep their exact ray geometry. This establishes observable shared-source lifecycle safety, not private cache-deduplication or precise lease counts.
- Positive nonuniform scale with offset center, reflected scale with preserved front-face normal, and 90-degree rotation are checked against the independent ray/face oracle. Two same-source, same-local-transform borrowers remain live for normal close.
- A real dynamic Sphere falls and rests on the scaled triangle mesh over 120 fixed steps. A separate real Sphere falls through the central gap. Tail stability and surface-height tolerances are explicit assertions, not fake samples or a box/convex approximation.
- `app.close()` must be idempotent and report released physics-preparation ownership with no cleanup failures. The result retains and reports the app's intentional shared runtime/scheduler/builtin/shared-asset cache list. It does not claim all shared resources were destroyed, all memory is zero, or all leaks were excluded.

## Freeze and run

Do not infer readiness from an existing directory or bundle. Wait for the build owner to identify a completed normal ESM and declaration build, exact JS hash, build number, producer commit, and corresponding real native assets. Format this entire fixture before freezing. The runtime directory must contain `cocosair.module.js`, its map, `cocosair.module.d.ts`, and `physics/box3d/st/{manifest.json,box3d-st.mjs,box3d-st.wasm}`.

```sh
Q=tools/verify/box3d/public-static-mesh
node "$Q/freeze.mjs" READY_RUNTIME BUILD_NUMBER EXACT_JS_SHA256 SOURCE_COMMIT NEW_LOCK_JSON LABEL
node "$Q/run.mjs" READY_RUNTIME NEW_LOCK_JSON NEW_ATTEMPT_DIRECTORY
```

The immutable lock fingerprints the runtime module/map/declarations, native manifest/module/WASM, source/native/patch trees, package identity, and every fixture source. Runtime package.json is hashed or its absence is asserted. The declared producer commit is separate from the current checkout identity. Never relabel source hashes as proof that a historical binary was built from the current checkout.

The runner preserves original stdout/stderr for both the independent oracle tests and production consumer, hashes each stream, and records unaltered exit status/signal/error with a four-minute per-process safety bound. It never retries or overwrites an earlier attempt. The consumer writes `consumer.raw.json`, retains the frozen input lock and every fixture source, and rechecks all frozen inputs and the lock after close. A source change requires a new lock and new attempt; retain failures unchanged. A process failure, signal, timeout, missing completion marker, changed frozen input, or failed assertion is not a PASS.
