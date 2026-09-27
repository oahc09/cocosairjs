# API coverage Wave 7 — Core Node and math surfaces

Wave 7 adds Core evidence for the scene graph and math value types. It also corrects one stale example claim and extends per-API tracing to instance-owned value-type fields and the renderer Camera object.

## Scope and implementation

The `node-hierarchy` example now checks 41 Node APIs against its isolated transform contract: hierarchy and state properties, Node enums, `attr`, dirty-state operations, system-event pause/resume, and the static `isNode`/dirty-flag utilities.

The `math-vec3-length-products` example checks 43 remaining Vec3 APIs: nine constants, static arithmetic and transform functions, and the x/y/z component fields. The probe verifies deterministic results for every operation; the random-vector check asserts its requested magnitude.

The API trace now wraps own data fields on instances when the inventory identifies a math value-type property. It records field reads on the separate `read` channel. For accessor-returned objects, it instruments registered fields on the returned instance as well; this makes `Camera.camera.pipeline` trace the actual render-layer Camera. The Camera example now reads that path and documents `pipeline` as a string that can be empty.

The Mat3/Mat4/Quat/Vec2 field examples now explicitly claim the corresponding math class so constructor instrumentation can attach to their own data fields. A stale `math.Mat4.m04` claim in the Mat3 example was corrected to the already exercised `math.Mat3.m04` unit.

## Evidence

The focused browser probes passed for the 41 Node checks and 43 Vec3 checks. Targeted V1.1 runs passed for Node, Vec3, Mat3/Mat4/Quat/Vec2 field examples, Camera, DragonBones, and GLTF asset handling; the Mat3 set was rerun after correcting its duplicate claim. The canonical V1.1 run completed 140/140 PASS with 1 promotion, 0 demotions, 3,547 verified, 173 attested, and 0 unproven API/example bindings. The API trace self-test passed.

DevTools passed 5/5 with the runtime bundle boundary check. The Gallery artifact passed 211/211, including the corrected Camera page, all 140 example boots, all 45 lifecycle checks, and decoder-state checks. The V1.2 browser matrix remains 39/39 across Chromium, Firefox, and WebKit. Specification validation passed 145/145; compliance had 0 fail / 1 documented Draco boundary warning. Jest passed 32 suites / 263 tests, and test-inventory passed 32/263. Typecheck, Prettier, tarball consumer acceptance (575 exports), and 1,317 documentation-reference checks passed.

Compared with committed Wave 6, the verified set gained 120 units with 0 removals: Core +119, Advanced +1. Important coverage did not change.

## Current release status

The refreshed coverage report has zero stale examples and zero evidence schema gaps. Core is 567/963 (58.9%), Important 165/272 (60.7%), and Advanced 139/3,130 (4.4%). Stable examples remain 144/120, above the count gate.

Release is still blocked. Core needs 396 more verified units. Important needs at least 80 more to reach 245/272, and its 107 remaining unverified units need explicit status. Advanced needs 2,365 more to reach 2,504/3,130; uncovered is 2,991 and must reach zero, with documented-only capped at 626. Keep the 100%/90%/80% thresholds unchanged.

The next wave should continue with the largest uncovered Core class groups, using real example behavior and current per-API proofs.
