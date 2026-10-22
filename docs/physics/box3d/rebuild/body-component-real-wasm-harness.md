# Actual AIR / Cocos component / WASM collector

Run `node tools/verify/box3d/body-component-real-wasm.mjs <current-build-directory> <new-output-directory> [case]`. The output directory must not exist. The selected build must have a passing native build receipt, all recorded inputs must equal current files, artifact sizes/hashes must match, and its facade must equal the production facade. No historical fallback is allowed. Every attempt retains exact input copies, stdout/stderr, immutable native/app observations and a terminal receipt, including failures.

## Execution boundary

This is official Node, actual project Jest/JSDOM HEADLESS configuration and source TypeScript, not a browser, GPU, runtime bundle, Web deployment or broad release qualification. The fixture imports the actual base entry to establish its normal renderer namespace, then actual `createAirApp`, `game.init`, `Scene`, `Node`, `RigidBody`, Box/Sphere colliders and `PhysicsSystem`. Scene activation/destruction and component callbacks are not replaced. Simulation uses only actual `PhysicsSystem.step`; no second accumulator, Scene abstraction or RAF is introduced.

The Node ESM preload forwards the genuine generated module factory and production loader/facade. Its local transport serves exactly the manifest, generated module and WASM. Adapter registration with component constructors is internal to the fixture, with collision masks and sleep threshold read from the actual PhysicsSystem. The product's public feature stays inactive.

A recorder forwards each observed facade method's original `this`, arguments, result and exception. Observed body/world/shape capabilities are retained only in the fixture to read real native state, not added to the product API. Output is copied serializable data. Native pose, state, counts, debug primitives and allocation measurements are never fabricated. The ordinary container warning and absent 2D-backend PhysicsSystem2D diagnostic remain in raw stdout. This collector is not a new coexistence result.

## Cases and explicitly injected failures

- `lifecycle`: body-first and collider-first initialization, static collider-only body, multiple colliders sharing total mass, body-wide native filter batches, dynamic origin-to-Node trajectory, preserved unrelated Node dirty flags, controls, native debug, pending geometry recovery, disable/destroy and final resource closure.
- `invalid-initialization`: an actual RigidBody subclass supplies an invalid later serialized field after a valid mass candidate. The existing collider's native state and world observations must not change; removing the failed component permits a valid body to attach.
- `material-listener`: two actual colliders initially share one material, receive real EVENT_UPDATE changes, then stop receiving updates individually on destruction/replacement.
- `body-natural-rejection`: an actual static-body velocity write reaches the native unsupported path and returns status 8. The facade supplies immutable `not-mutated`; previous observations remain current and the next step succeeds.
- `body-pure`: a deliberately injected status 8 replaces one native mass call before it executes. This verifies only the failure-phase protocol, not a natural core rejection.
- `body-committed`: the real mass setter returns success; one subsequent native state read is deliberately made to throw ARGUMENT. The production facade, not the fixture, labels the error `committed`.
- `body-unknown`: the real native mass write succeeds but the wrapper deliberately throws before its return status reaches the facade. Native mass changes while facade `requestedMass` may remain old. The fixture does not repair it; the world must fault until destruction.
- `filter-committed`: the real native batch succeeds, then its copied typed-array read is deliberately made to throw. The real facade labels the failure committed.
- `body-lost-token` / `shape-lost-token`: actual allocation succeeds but the observed method throws before AIR receives the token. AIR must fault and defer the unreturned allocation to its sole world cleanup owner.

Every temporary native-export or copy-stage replacement is scoped to one admitted call and restored in `finally`. Injected failures are identified in raw observations. They are not alleged natural core defects. Faulted worlds must still reject ordinary setters/step, while real component destruction may release JavaScript references without replaying uncertain native mutations. The final app close must release the Scene and native owners, and both native core bytes and bridge caches must return to baseline.

## Claim boundaries

Each receipt applies only to its exact source/artifact hashes and selected case. Earlier d/e results remain historical when f changes Collider listener setup. There is no full T10/T11/C36/B3U01 claim. Runtime parent/scale/pose mutation, teleport/targets, component contact/trigger events and unimplemented component/query slots remain explicitly unsupported. Initial positive primitive scale is supported; mirrored/sheared transform qualification is not implied. Analytic collider bounds use copied native origin transforms; only world debug snapshots come from native drawing callbacks. Joint debug is unsupported and no debug presentation is claimed.

Material listeners use the ordinary nonthrowing EventTarget registration assumption. A material asset is already mutated when EVENT_UPDATE fires, so a rejected shared update is not a perfect multi-collider/asset rollback. Direct mutable Vec3 aliases can bypass public setters. Valid geometry replacement does not claim restoration of previous native contact history on a later failure.
