# T10 first AIR source checkpoint

Status: SOURCE_ONLY_MOCK_CONTROL. This is not native/component acceptance, complete T10/T11, browser evidence, or permission to activate the public feature.

## Source and ownership

The world owns one shared body per actual Cocos Node. Native world/body capabilities remain private ECMAScript fields. The IRigidBody implementation forwards actual bridge operations with candidate setter values, not uncommitted component caches. Cocos types 1/2/4 map explicitly to native 2/0/1. The constructor owns a real native body immediately and cleans it if initialization fails; last reference releases it, and world destruction invalidates every outstanding reference without a second destroy.

The fixed control allowlist excludes capability-returning APIs at runtime, not only in TypeScript. `impl` is copied descriptive metadata. This source does not add a public raw body/token escape hatch.

## Step and scene boundary

Owned bodies have a read-only geometry/scene preflight before the world's stepping state, attempted-step count, or native call. Enabled dynamic mass-pending bodies reject recoverably. Post-step copied transforms use the body origin (first three values), not COM (last three). Actual Node world-position/rotation setters retain other dirty flags. A copy/Node-sync failure remains inside the existing post-native fault latch, preventing replay of a completed step.

Runtime external pose, parent and scale changes explicitly reject pending T11 pose/target support. Initial nonpositive scale rejects. This checkpoint has not qualified initial transformed-parent shear, body enable/disable with colliders, or mass/shape ownership transitions.

## Deliberately incomplete

The existing registration remains unchanged, with unsupported component constructors. Component binding admission requires the real body controls AND the proposed real shape-filter bridge. Current k3 is not a qualified input for this checkpoint and lacks that filter bridge. No successful component path is registered. Group/mask writes remain explicit unsupported until the shape-owner transaction is implemented. Box/Sphere adapters, collider ownership, filter effects, inherited/explicit material effects, and actual public component fixtures are the next source/native stage.

The configuration seam must read the actual PhysicsSystem collision matrix and sleep threshold. It is not a second matrix/System or accumulator. Presence of bridge method names is only fail-closed admission, never proof of implementation or physics correctness.

## Checks and evidence

The focused TypeScript closure includes the actual world, shared-body and IRigidBody source. Thirteen new tests execute that source with explicitly mocked native and Node objects, covering control/ownership only. The existing 34 world-control mocks remain a regression subset. Neither suite creates real physics. The snapshot and receipt retain all six owned source/tool inputs and exact commands/output.

Before this frozen run, an exploratory typecheck failed TS2352 for the generic union function cast. The cast was made explicit through unknown without changing dispatch semantics; the independent runtime allowlist prevents arbitrary method injection. That exploratory invocation was captured by the task tool transcript, not an archived raw evidence file. The frozen reruns below are separate current results, not a relabelled earlier pass.
