# API coverage Wave 8 — Camera and MeshRenderer

Wave 8 adds Core evidence for the component-facing camera and mesh-renderer surfaces. Both examples also carry resource lifecycle contracts for the generated mesh and material they own.

## Scope and implementation

`camera-viewport-props` now checks 29 Camera units: projection and exposure enums, camera state properties, lifecycle callbacks, and `convertToUINode`. A disposable camera exercises destruction, while enabling/disabling the live camera covers those callbacks without a rendered disabled frame. The example reads the backend pipeline string through `Camera.camera`.

`meshrenderer-hooks` now checks 28 units: shadow modes and bias fields, mesh/model/morph state, lifecycle callbacks, geometry and directional-light hooks, and reflection-probe update methods. It uses a disabled scratch renderer for restore/destroy behavior and releases/recreates its generated mesh and material through `installAssetLifecycle`.

## Evidence

Both G1 browser probes passed. The targeted V1.1 run proved every newly claimed Camera and MeshRenderer API and passed their `resource-released` contracts. The canonical V1.1 run completed 140/140 PASS with 2 promotions, 0 demotions, and 3,604 verified, 172 attested, and 0 unproven API/example bindings.

The DevTools chain passed 5/5 with its runtime bundle boundary check. The Gallery artifact passed 213/213, with all 140 non-DevTools examples booting and 47 resource lifecycle contracts passing. Draco's `decoder-missing-observed` path and Meshopt's real decode both passed. The V1.2 matrix remains 39/39 across Chromium, Firefox, and WebKit. Strict specification validation passed 145/145; compliance had 0 fail / 1 documented Draco warning. Jest and test-inventory each passed 32 suites / 263 tests; typecheck, Prettier, API trace selftest, tarball consumer acceptance (575 exports), and 1,317 documentation-reference checks passed.

Wave 8 adds 57 verified units with 0 removals, all Core. Coverage is Core 624/963 (64.8%), Important 165/272 (60.7%), and Advanced 139/3,130 (4.4%), with zero stale evidence and zero schema gaps.

## Current release status

Stable examples remain 144/120, above the count gate. Release is still NOT MET: Core needs 339 more verified units. Important needs 80 more to reach 245/272 and has 107 unverified units without explicit status. Advanced needs 2,365 more to reach 2,504/3,130; uncovered is 2,991 and must reach zero, with documented-only capped at 626. Keep the 100%/90%/80% thresholds unchanged.

Next, continue through the larger uncovered Core math, lighting, and rendering classes with direct behavior probes and fresh API proofs.
