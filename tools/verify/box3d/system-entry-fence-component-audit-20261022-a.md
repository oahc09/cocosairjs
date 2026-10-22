# Box3D component early-entry audit (read-only)

Status: READ_ONLY_AUDIT_AND_PATCH_PLAN_NOT_IMPLEMENTED. No engine source was changed and no tests, SDK/native builds or external writes were run. Scope is only RigidBody, Collider, BoxCollider and SphereCollider, not constraints or other shapes. The adjacent JSON contains all 41 exact proposed sites, original line numbers, old behavior, operation strings, immutable source hashes and detailed controls.

## Recommended minimal patch

Stage A: 37 first-statement assertions and three imports, preserving existing headers, normalization and backend ordering:

- RigidBody: 14 property setters (group, type, mass, allowSleep, linearDamping, angularDamping, useGravity, linearFactor, angularFactor, sleepThreshold, useCCD, isStatic, isDynamic, isKinematic); 10 immediate configuration methods (wakeUp, sleep, setLinearVelocity, setAngularVelocity and six group/mask setters/adders/removers).
- Collider: sharedMaterial, isTrigger and center setters; worldBounds and boundingSphere getters; six group/mask mutation methods. Bounds getters allocate/update engine-owned caches, so they are not committed read-only getters.
- BoxCollider.size and SphereCollider.radius setters.

Insert each assertion before the current first statement, including same-value returns, DEBUG comparisons, Vec3.strictEquals, Math.abs, _isInitialized, shape/body lookup and super calls. Collider already imports the primitive; the other three files need the appropriate relative import. No backend-specific branch or global bypass is needed.

Stage B: four additional Collider assertions at on, off, once and removeAll before super. These stop listener/flag mutations before shape rejection, but do not by themselves complete event-dispatch support. inherited targetOff delegates directly to removeAll and needs no extra wrapper.

## Critical exceptions and coordination

Do not add the generic component guard to applyForce, applyLocalForce, applyImpulse, applyLocalImpulse, applyTorque, applyLocalTorque, clearState, clearForces or clearVelocity. The frozen contract explicitly permits these nine staged commands inside hooks while the component is leased. Their adapter must enter queue admission before reading caller data, latch caught nested submission failures and hold the owner leases through full copy/enqueue. Coordinate this with the active World helper rather than touching its files.

Keep committed property, velocity and filter reads available. getLinearVelocity/getAngularVelocity write a caller-provided output, not an engine-owned cache. The existing Collider.material setter guard is already first; its getter guard correctly protects only the cloning/listener-changing branch.

Inherited Collider.emit is mutable: it changes invocation state, removes once/invalid-target callbacks through this.off and invokes listeners. Guarding off under a held component lease would reject legitimate internal once removal. A new emit entry guard would also reject owner dispatch. Therefore event dispatch needs a private, exact internal admission design, not a broad bypass or temporarily released leases. The runtime-mixed clear() method is another table-mutation path not present in typed IEventified and should be reported as an engine-private boundary, not silently claimed covered.

Current Box3D event-listener setup already mutates tables/flags before its unsupported T15 adapter rejects with no lease. Preserve and label that old behavior; this guard-only patch does not promise general listener rollback or event support.

## RED/GREEN controls

Use actual engine classes and Eventify. Preserve an original RED and run the identical fixture against GREEN. For each proposed site assert exact operation and unchanged values/identities for caches, flags, geometry, listeners, plus zero adapter calls. Include poison and caught nested numeric/vector/event-key accessors, same-value and uninitialized branches, independent shared leases, unrelated identities, release recovery and no-lease backend/order compatibility.

Bounds tests need both empty and previously populated caches. Event tests need real once/listener removal and dispatch, not mock callback tables. Read tests must prove committed getters remain available. Allowed command tests belong to owner/queue integration and must show successful leased staging with no native write, not blanket refusal.

No native, WASM, browser, trajectory or formal acceptance claim follows from this plan. Direct aliases, private calls and overrides remain outside public-entry protection. Source hashes and exact line locations are in the JSON.
