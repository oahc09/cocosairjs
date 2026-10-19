# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-application](../../cocosair-application/SKILL.md) - `createAirApp` options and lifecycle that carry the `physics` field.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - component mount order and deferred `destroy()`, which colliders and the lazy world sync both depend on.
- [cocosair-verification](../../cocosair-verification/SKILL.md) - the browser-matrix contract rows behind the builtin boundary below.

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Pick the backend honestly, mount the framework components, and state what each backend actually simulates - no Creator asset bundle, no WASM artifacts, no parallel physics abstraction.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Calling createAirApp({}) and expecting gravity or stacking
- [HIGH] Setting only the collision group and losing every pair
- [MEDIUM] Asking for a WASM backend that is not shipped
- [MEDIUM] Reading 3D backend identity from the flat selector export

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Applies to physics in code-first Cocos AIR apps - choosing the 3D backend with createAirApp({ physics: 'builtin' | 'cannon' }) (default builtin), selectPhysicsBackend and the official last-registration-before-init rule, the query-only boundary of the builtin discrete collision detector (no gravity integration, no MeshCollider in the world, trigger events and raycasts still real), PhysicsSystem/RigidBody/Collider wiring and the bidirectional group-and-mask filter, error 9642 for default-physics-material (fatal on cannon, benign on builtin) and AIR's built-in material registration, and the pure-JS 2D box2d backend with PhysicsSystem2D, RigidBody2D, Collider2D, BoxCollider2D and the raycast/testPoint/testAABB queries. Use when dynamic bodies do not fall or stack, when triggers fire silently, when deciding between builtin and cannon, when 9642 appears in the console, or when asking whether ammo, physx or box2d-wasm ship (they do not).

### Keywords

Cocos AIR, cocosair.js, physics

## References

- [backend-selection.md](backend-selection.md) - the selector registry and event ordering, default normalization, zero-backend warn versus PHYSICS_NONE, the 9642 split and the built-in material registration, and why WASM backends are absent.
- [3d-contracts.md](3d-contracts.md) - PhysicsSystem singleton timing, mount and query API, filter semantics, the builtin query-only boundary item by item, and what cannon inverts.
- [2d-box2d.md](2d-box2d.md) - PhysicsSystem2D, deterministic stepping, rigid-body and collider components, shape set, joints, and the raycast/testPoint/testAABB queries.

## Canonical docs

- `docs/manual/physics-2d-and-3d.md` - open for the backend comparison table, the four event families and the five runnable physics examples.
- `docs/notes/physics-3d-notes.md` - open for the browser-measured builtin boundary, filter semantics, lazy sync and the cannon variant reversal.
- `docs/reference/api-stability.md` - open for which physics APIs are Stable versus Candidate and why (`docs/reference/api-stability.md:40-52`).
