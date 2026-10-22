# T10 body adapter implementation intake

Status: source review and work split only, not a body/component implementation or acceptance result. The exact reviewed files are bound by inputs.json. No component or native input was modified by this intake.

## Native contract gaps

The current j2 foundation owns real worlds, creates bodies and box/sphere shapes, reads a 29-float body snapshot, sets linear velocity and applies a center impulse. It does not yet satisfy IRigidBody. The pinned core public API supplies body type, enabled state, linear/angular velocity, force/torque/offset impulses, damping, gravity scale, sleep controls, bullet and six motion locks, and mass data. These need explicit validated wire functions and immutable owned facade results. Preserve existing 29-float and prior snapshot layouts; append schema-bound functions instead of reinterpreting old buffers. Native readback, failed-input nonmutation and real trajectory/rotation fixtures are required.

The pinned public header has no body clear-forces or sleep-progress getter. Do not fill clearForces with a no-op or infer isSleepy from a guessed speed. An explicit reviewed private-core bridge may read the actual body sleep timer and clear the body's accumulated force/torque while unlocked, with generation/world validation and layout provenance. Define and test the sleep-progress semantics before claiming that method. Original vendor files must remain unchanged. Clearing accumulated force is not undoing an already applied impulse.

Mass means total component body mass, not per-shape density. Apply mass/inertia coherently across enabled box/sphere shapes, preserve the body-origin/COM distinction, and support a body created before its first collider. Validate all numeric fields before native changes. Axis factors accept only 0/1; native damping remains c in [0,1], using 1/(1+h*c), not Cannon's pow mapping. Gravity scale is 1/0 and must not clear existing velocity.

## Extracted component transaction hazard

The actual pinned RigidBody setters write component caches before calling the wrapper: type, mass, allowSleep, both damping values, useGravity, both factors and group. Vec3 factors copy into the live cached object before native validation. A throwing adapter alone therefore cannot satisfy C36-SETTER-ROLLBACK. Before implementation, add real-component RED fixtures for non-finite, invalid enum/bool, nonbinary factor and invalid native transitions; then introduce the narrow Box3D-only commit-after-native path. Preserve existing mass normalization and all other backend behavior. Review setter dependencies before moving calls, since an adapter that reads the component's old cache would otherwise commit the wrong configuration. Record every intentional extracted-source change in the file map and UPSTREAM.md.

## Ownership and qualification split

1. Native/facade owner: append body controls and box/sphere metadata contracts, exact full-ID ownership, validation, host/WASM fixtures, native memory/layout audit and source-bound artifacts. Do not change AIR world or component source concurrently.
2. AIR owner: world-scoped shared-body ownership, Node/body-origin synchronization, lifecycle, material registration, actual RigidBody/BoxCollider/SphereCollider adapters, and narrow component transaction changes. Use actual source modules and native WASM. Do not introduce another Scene, RAF or accumulator.
3. Integrator: contract/dependency review, original source mapping, invalid-input RED retention, strict staging update after new schema, checkpoint recovery and remote readback.

T09 coexistence remains in progress. Its existing low-level source fixture does not prove public RigidBody/collider behavior. Public kinematic target/teleport and complex compound behavior belong to the following T11 contract; no private handle may escape to the example API. Keep unsupported query, constraints and complex shapes explicit until independently implemented and qualified.
