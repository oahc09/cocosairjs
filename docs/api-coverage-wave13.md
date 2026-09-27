# API coverage Wave 13 — Final Core APIs and trace fidelity

Wave 13 closes all 63 remaining required Core API units and improves per-API trace fidelity for namespace aliases and asynchronously parsed GLTF assets.

## Scope and implementation

The new stable probes cover 10 GLTF asset/loader/extension-registry units, 21 `math.bits` operations and constants, 3 `math.MathBase` units, 24 math namespace functions/constants, and 5 root runtime exports. The `gltf-asset-readonly` probe constructs and inspects a real asset; the loader registry probe exercises a real extension factory registration lifecycle. Math constants are read through the public namespace where the root ESM primitive binding cannot be observed directly.

The API trace now returns the canonical wrapped export for namespace aliases and records reads on the namespace member. For `GLTFLoader.parseAsync`, it instruments the resolved `GLTFAsset` before the example consumes its own fields. Async instrumentation is limited to that parser result so unrelated component methods keep their original behavior; the full example matrix caught and prevented a broader instance-hook regression in `collector-dodge` and `tween-basic`.

Against committed Wave 12 (`86042a5`), verified required Core units increased from 900 to 963: **63 added, 0 removed**. Important stayed at 165/272, while Advanced increased from 139 to 149 through 10 newly observable public units (`view`, `assetManager`, `input`, `dragonBones.AnimationCacheMode`, `geometry.intersect`, `Contact2DType`, `PhysicsGroup`, `profiler`, `screen`, and `macro`); Advanced removals were 0.

## Evidence

The canonical V1.1 browser run passed 140/140 with 0 promotions, 0 demotions, 4,020 verified API/example bindings, 72 attested, and 0 unproven. The V1.1 chain-face check passed for all 140 records on candidate `7f3b89f6ac076cbf`. DevTools passed 5/5 with the runtime bundle boundary passing; its proof total is 77 verified / 10 attested / 0 unproven. The packaged Gallery artifact passed 216/216 with 145 examples, 50 lifecycle contracts, and the packaged engine matching the live bundle.

Strict specification validation passed 145/145 frozen. Compliance has 0 failures and 1 documented Draco decoder-availability warning. `npm run verify:test-inventory` passed 32 suites / 265 tests; typecheck, Prettier, API trace self-test, `verify:file-map`, `verify:web-only`, and 1,319 documentation-reference checks passed. The refreshed V1.2 matrix passed 39/39 across Chromium, Firefox, and WebKit after the physics/video example changes. Its video contract retains direct P3 playback and P5 decoded-frame checks, and no longer requires the redundant final `currentTimeAdvanced` snapshot after the long fullscreen sequence.

## Coverage and release status

Coverage is Core **963/963 (100%)**, Important **165/272 (60.7%)**, and Advanced **149/3,130 (4.8%)**. There are no stale proofs or evidence schema gaps. Stable examples remain 144/120.

The V1.1 Release Gate remains **NOT READY**. Core passes. Important needs 80 more verified units to reach 245/272 and has 107 unverified units without an explicit status. Advanced needs 2,355 more verified units to reach 2,504/3,130; 2,981 units remain uncovered and must reach zero, while documented-only remains 0/626. Keep the 100%/90%/80% thresholds unchanged.

Next, close Important units in grouped feature waves, then establish a defensible user-facing Advanced denominator and produce evidence for the remaining required surface without weakening the release thresholds.
