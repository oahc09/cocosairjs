# API coverage Wave 10 — Mat4, Vec4, and Color

Wave 10 adds 96 verified Core math API units across `Mat4`, `Vec4`, and `Color`, using the existing focused math examples.

## Scope and implementation

`math-mat4-basics` now exercises the remaining 34 required units: matrix constants and fields, constructors, clone/copy, rotations and composition, projection/view constructors, decomposition, and array conversion. `math-vec4-arithmetic` covers the remaining 32 units, including constants, static arithmetic and transforms, array conversion, and the four-component instance operations. `math-color-models` covers the remaining 30 units: color constants, constructors and channels, arithmetic, array/uint conversion, equality, and hex conversion.

The probes call the APIs with finite, non-degenerate inputs and fail the example if a new call throws. Comparing the current report with committed Wave 9 gives 96 added verified units and 0 removals, all Core.

## Evidence

The focused G1 and V1.1 trials passed 3/3. The canonical V1.1 run passed 140/140, with 3,756 verified API/example bindings, 172 attested, 0 unproven, and candidate fingerprint `8746fc59b6aa0408`. DevTools passed 5/5 with the runtime bundle boundary check. The packaged Gallery passed 214/214, including all 140 runnable examples and 48 lifecycle contracts; the packaged engine matched the live bundle. V1.2 remains 39/39 across Chromium, Firefox, and WebKit on the unchanged engine bundle.

Strict spec validation passed 145/145. Compliance has 0 failures and the documented Draco decoder-availability warning. The API trace self-test passed; the report has 0 stale proofs and 0 schema gaps. Jest and test-inventory each passed 32 suites / 263 tests. Typecheck, Prettier, 575-export package consumer acceptance, V1.1 chain-face, and 1,317 documentation-reference checks passed.

## Coverage and release status

Coverage is Core 775/963 (80.5%), Important 165/272 (60.7%), and Advanced 139/3,130 (4.4%). Stable examples remain 144/120. The V1.1 Release Gate remains NOT MET: Core needs 188 more verified units; Important needs 80 more to reach 245/272 and still has 107 units without explicit status; Advanced needs 2,365 more to reach 2,504/3,130 and has 2,991 uncovered units that must reach zero, with documented-only capped at 626. Keep the 100%/90%/80% thresholds unchanged.

Next, close the remaining Core math classes, starting with `Quat` (28 units), `Vec2` (24), and `Mat3` (16), then finish the remaining Core runtime classes before Important and Advanced proof/status work.
