# Box3D before-step API decision, version 1

Status: SOURCE_INTEGRATED_NOT_QUALIFIED. Frozen on 2026-10-23 over source50 `a9197dd`. No engine/browser/native build or deployment. No full EX01 acceptance or joint support is claimed. This freezes the first formal name for the unresolved before-step hook in v1.2 §5.3/§6.1 and motion-command-decisions-v1.md, not a claim it was previously frozen.

## Frozen contract

`registerBox3DBeforeStep(callback, { enabled?: boolean }): Box3DBeforeStepHandle`

- Main-entry export. Callback receives readonly `{ tickIndex, attemptId, fixedDt, solverSubSteps }`, copied/frozen by the existing command owner. Once per attempted **fixed tick**, not render update, Director BEFORE_PHYSICS, or native solver substep. No new loop, accumulator or scheduler.
- The current actual world must have the internally installed Box3D source. Other backends, missing optional feature, before-world initialization and a removed source reject with AIR_E_PHYSICS_BACKEND_UNAVAILABLE. An already retained source rejects after source removal with AIR_E_BOX3D_DISPOSED. Once registered, all handle admission/failure behavior comes directly from the existing owner.
- Default enabled=true; enabled=false registration is permitted only when the actual owner permits registration. `enabled`/`disposed`, `enable()`, `disable()`, `dispose()` are the exact original producer handle, not shadow state. Dispose is idempotent under the existing handle contract. No raw implementation/native handle is exposed.
- Callback synchronously returns undefined. The wrapper returns the callback result unchanged so the existing owner rejects Promise or other non-undefined results. Exceptions propagate to the original staged-batch error path. There is no catch/replay, immediate native force mutation, commit, or retry in this API.
- Callback can submit original public RigidBody force/impulse commands admitted by the current world owner. Hook/handle configuration and unrelated native geometry/material changes inside that callback remain fenced by the existing owner. No broader callback capability is added.
- Pause: no callbacks and no new registrations/enables while the owner is paused. Existing ordinary hook registrations retain enabled state across pause/resume, unlike internal continuous-force handles. This is actual existing behavior, not a promise to clear arbitrary callback closures. EX01 must explicitly cancel drag intent before its pause/reset/lifecycle actions and on blur/visibility loss.
- Owning world close calls the existing producer close, making retained handles disposed/disabled. The internal source lease must be removed in that same owned teardown, including initialization rollback. The public wrapper itself does not make a second handle registry or promise cleanup if integration omits this wiring.

The new public module imports the already-public PhysicsSystem and an inert WeakMap registry only. It imports no Box3D world/feature/native loader at runtime. Thus exposing the helper does not select or load Box3D and does not alter builtin/Cannon/default choice.

## Source integration and required verification

1. `src/air/physics/box3d/world.ts`: after the actual command owner/routing is successfully installed, retain the lease from `installBox3DBeforeStepSource(this, (callback, options) => this.registerCommandHook(callback, options))`. Store it as a private owned cleanup field. Do not install on a fixture world or from an example.
2. Dispose that lease in existing constructor failure rollback and world destruction cleanup. Producer owner close remains authoritative and should dispose registered handles before source removal. Preserve all existing native/world/module failure ownership. Registry removal alone is not native or producer cleanup proof.
3. `feature.ts` / `registration.ts` need no new scheduling or test adapter. Their existing ordinary factory creates this world; integrate the source at world ownership, not via a public cast. Do not force the optional feature into the default bundle.
4. `src/air/index.ts` candidate adds only the normal helper/type exports. No internal install/find function is publicly exported. Before promotion, freeze this name in api-contract.json and map fixed-tick/disable/dispose/pause/error cases to C01/C03/C06 and lifecycle checks. This candidate does not overwrite the old contract.
5. EX01 integration requirement: create `createSpringDrag(canvas, camera)` after run; call `.cancel()` BEFORE pause, reset, body/geometry edits and scene release; call `.dispose()` on controller/scene teardown. Set canvas `touch-action: none`. Keep the active control unreachable until formal `PhysicsSystem.raycastClosest` and the hook source are actually connected and freshly verified.

## Spring scope and physics

- Picking uses only `PhysicsSystem.raycastClosest`, immediately copies its pooled hitPoint, and binds the actual returned Collider/attached RigidBody. No `rayClosest` convenience, geometry stand-in query or private native access.
- First candidate accepts only the current EX01 dynamic, enabled, same-Node, single centered BoxCollider/SphereCollider with no additional descendant collider. Nonzero collider center, compound, unsupported shape and static/kinematic bodies are explicitly refused. It does not infer COM from renderer bounds and does not claim arbitrary-body COM support.
- Copy pointer target from a view-facing drag plane. This is cursor-plane projection, not a substitute collision query. Convert picked local point and actual zero-center geometry to world space with the body's current matrix, including scale/rotation.
- Every hook calculates `r = pickedWorldPoint - worldCOM`, point velocity `vCOM + omega × r`, and `F = k * boundedStretch - 2*zeta*sqrt(k*m) * pointVelocity`; clamp the force magnitude to maxForce. Public `applyForce(F, r)` executes exactly once per owner callback. The native owner consumes it for that fixed tick. `fixedDt` is not multiplied into force, and no frame delta or transform animation integrates motion.
- Pointer-up/cancel/lost capture stops future force and disposes the hook, preserving actual solved linear/angular momentum. It does not clear velocity or invent a release impulse. Invalid body/geometry stops or rejects rather than force an unrelated object.
- External pause paths not controlled by EX01 still require explicit intent-cancellation integration. Window blur/visibility is handled, but that is not proof that every external game.pause reason is covered.

## Verification boundary

Narrow source tests evaluate only the real proposed registry/public adapter and spring math with explicit mocked owner callbacks. They are not solver, engine, browser, raycast-hit, cross-Hz native determinism, cleanup, or EX01 evidence. Formal runtime tests must prove same fixed-tick inputs under 30/60/120 Hz, finite bounded force and COM-relative torque, true pick/visible alignment, release momentum, pause/reset/close cancellation and callback-failure no-partial-replay behavior after integration.

## Current integration boundary

The normal AIR export, actual world-owned source installation, constructor rollback and finally-based terminal removal are now source changes. No fixture-only registration is added to production. The previous unresolved sentence in motion-command-decisions-v1.md is historical; this supplement resolves only before-step registration, not the separate continuous-force public API. The 2128-cell and nine-Gate qualification remains NOT_RUN. Native/browser effect, handle lifetime and example input must still be verified against this new source generation.
