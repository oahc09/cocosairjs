# API coverage Wave 9 — Lighting Core APIs

Wave 9 closes 55 Core lighting API units across the `Light`, `SpotLight`, `DirectionalLight`, `PointLight`, and `SphereLight` families. It adds executable probes to the existing lighting examples and verifies one new resource lifecycle contract.

## Scope and implementation

`light-spot` covers the base `Light` state and lifecycle callbacks plus `SpotLight` flux, range, cone, and shadow properties. Its release/reacquire path detaches and destroys the generated floor and pedestal resources, then recreates and rebinds them. `light-two-directional` reads all 18 `DirectionalLight` illuminance, shadow, and CSM properties. `light-point` checks the PointLight constructor and photometric/range fields. `light-sphere` reads the SphereLight API from a detached probe; that probe does not participate in the rendered directional-light scene.

The additions are 5 PointLight, 7 SphereLight, 13 Light, 12 SpotLight, and 18 DirectionalLight units. Comparing the current coverage report with the committed Wave 8 report gives 55 added verified units and 0 removals, all Core.

## Evidence

The four focused lighting trials passed 4/4. The canonical V1.1 run passed 140/140 examples with 0 promoted, 0 demoted, 3,660 verified API/example bindings, 172 attested, 0 unproven, and candidate fingerprint `8746fc59b6aa0408`. DevTools passed 5/5 with the runtime bundle boundary check. The packaged Gallery passed 214/214; all 140 runnable examples booted, all 48 declared lifecycle contracts passed, the packaged engine matched the live bundle, and the artifact served all requests locally. V1.2 remains 39/39 across Chromium, Firefox, and WebKit on the unchanged engine bundle.

Strict specification validation passed 145/145. Compliance has 0 failures and 1 documented warning: `gltf-draco` cannot exercise a successful decode or release a decoded asset because the browser decoder glue is explicitly unavailable in the shipped set. The API trace self-test passed. Jest and test-inventory each passed 32 suites / 263 tests; typecheck, Prettier, package consumer acceptance (575 exports), V1.1 chain-face, and 1,317 documentation-reference checks passed. The inventory report has 0 stale example proofs and 0 evidence schema gaps; its five claims outside the engine inventory are the existing external `DevToolsSession.*` APIs.

## Coverage and release status

Coverage is Core 679/963 (70.5%), Important 165/272 (60.7%), and Advanced 139/3,130 (4.4%). Stable examples remain 144/120. The V1.1 Release Gate remains NOT MET: Core needs 284 more verified units; Important needs 80 more to reach 245/272 and still has 107 units without explicit status; Advanced needs 2,365 more to reach 2,504/3,130 and has 2,991 uncovered units that must reach zero, with documented-only capped at 626. Keep the 100%/90%/80% thresholds unchanged.

Next, continue with the remaining Core math surface, starting with the larger `Mat4`, `Vec4`, `Color`, `Quat`, `Vec2`, and `Mat3` groups. Then close smaller Core runtime classes before moving to Important and Advanced proof/status work.
