# API coverage Wave 11 — Quat, Vec2, and Mat3

Wave 11 adds 68 verified Core math API units across `Quat`, `Vec2`, and `Mat3`, completing the remaining required inventory units for those three classes.

## Scope and implementation

`math-quat-applied` exercises 28 quaternion constants and operations, including construction, rotations, composition, conversion, and array output. `math-vec2-arithmetic` covers 24 Vec2 constants, static operations, transforms, string conversion, and arrays. `math-mat3-basics` covers 16 Mat3 constants, conversions, transforms, array operations, decomposition, and construction. The Mat3 probe uses the engine's linear component names (`m00` through `m08`) and checks that operations expected to produce matrices do not return null.

The focused G1 and V1.1 trials passed 3/3. Comparing the current report with committed Wave 10 gives 68 added verified units and 0 removals, all Core.

## Evidence

The canonical V1.1 run passed 140/140 examples with 0 promoted, 0 demoted, 3,824 verified API/example bindings, 172 attested, 0 unproven, and candidate fingerprint `8746fc59b6aa0408`. DevTools passed 5/5 with the runtime bundle boundary check. The packaged Gallery passed 214/214; all 140 runnable examples booted, all 48 lifecycle contracts passed, and the packaged engine matched the live bundle. V1.2 remains 39/39 across Chromium, Firefox, and WebKit on the unchanged engine bundle.

Strict spec validation passed 145/145. Compliance has 0 failures and the documented Draco decoder-availability warning. The API trace self-test passed; the report has 0 stale proofs and 0 evidence schema gaps. Jest and test-inventory each passed 32 suites / 263 tests. Typecheck, Prettier, 575-export package consumer acceptance, V1.1 chain-face, and 1,317 documentation-reference checks passed.

## Coverage and release status

Coverage is Core 843/963 (87.5%), Important 165/272 (60.7%), and Advanced 139/3,130 (4.4%). Stable examples remain 144/120. The V1.1 Release Gate remains NOT MET: Core needs 120 more verified units; Important needs 80 more to reach 245/272 and still has 107 units without explicit status; Advanced needs 2,365 more to reach 2,504/3,130 and has 2,991 uncovered units that must reach zero, with documented-only capped at 626. Keep the 100%/90%/80% thresholds unchanged.

Next, close the remaining 120 Core units across `Rect`, `Size`, `Mesh`, `Material`, `Layers`, `Scene`, `Input`, and GLTF runtime classes before moving to Important and Advanced proof/status work.
