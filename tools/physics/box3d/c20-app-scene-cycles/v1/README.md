# C20APP same-app scene cycles — v1

**Source/CPU preparation only. All real runtime/native/browser execution is NOT_RUN.**
This is a new fixture/profile. It does not edit or rerun the passed public Terrain
fixture and does not change the engine, SDK, raw reports, host or module factory.
A CLI execution flag is an accident guard, not user authorization.

## Frozen scope and objects

The original reference plan §10.3, B3-C20 (line 666 in the retained contract)
requires **100 low-level world + 50-body + asset cycles**, and separately **100
application scene changes**, with native counts/bytes returning to baseline;
the application may retain a legal empty world but may not rebuild closed apps.
The 50-body wording applies to the low-level lane, not an explicit application
minimum. This application profile voluntarily fixes **50 bodies + 50 shapes per
scene** to avoid an empty/trivial scene interpretation:

- Three static `RigidBody` + `TerrainCollider` users share one fresh 3×3 heightfield
  (nine vertices/eight triangles) and one actual cooked mesh resource/cache lease.
- A static Box trigger and dynamic Sphere visitor supply real public callbacks
  on both participants: one enter, at least two stays, one exit per scene.
- Two dynamic boxes participate in one actual `FixedConstraint`, following the
  existing public-fixed-joint disabled/configured/enabled sequence.
- Forty-three separated dynamic boxes complete the fifty-body/shape inventory.
- One shared public `PhysicsMaterial` is owned and destroyed by the scene session;
  material/session flags are auxiliary JS observations, not native counters.

The event pair is near x=0; joint boxes are at x=-20/-18; Terrain users are at
x=100/120/140; filler boxes start at x=200, z=20. Gravity is zero. The visitor
moves through the sensor at 6 m/s with fixed 1/60 s steps, pauses for two stay
steps, then exits. Terrain has no listener and cannot overlap the event pair.
This explicitly avoids unsupported Terrain/Hull event participants: a listener
on only the primitive side would **not** make a Terrain contact supported.

## Same app, same public clock, real release

`createAirApp` is invoked exactly once. Each iteration creates a distinct real
`Scene`, calls `app.run(scene)`, observes nonempty native state and real events,
then awaits `app.releaseScene()`. Exactly one `app.close()` is called in the
outer finally block, whether successful or failed. A failed loop never starts
another scene or creates a replacement app.

The first `app.run` and the one `createStepClock(...).begin()` occur in the same
synchronous turn, before any await. Its exclusive lease stays held through all
100 scenes and normal close. `AirAppImpl.releaseScene` (app.ts:212–278) pauses
application pacing and sets `_needsResume`; the next `run` resumes that reason
without releasing the manual lease. Game-clock control keeps application pause
and manual ownership distinct. The harness does not call `clock.end`, private
Director methods or a direct physics step, and never steps a released scene.
`app.close` installs terminal pacing and ends ownership through the real product.

Each callback records cycle ID, actual scene UUID, current session-token check,
actual session generation, full native sensor-pair IDs, logical pair, native
snapshot step and public collider identities. Session generation may restart at
1 for a newly allocated scope; the profile does not falsely call it a globally
increasing scene generation. Prior tokens, callback counts and retained copied
event payloads must remain stale/unchanged after release and later scenes.

## Exact measurement boundary and no warmed baseline

`PhysicsSystem.instance.physicsWorld.getNativeCounts()` is the actual Box3D
backend diagnostic (not a stable `IPhysicsWorld` interface). It reads native
`worldCounts`: bodies, shapes, contacts, joints and core live bytes. Bytes are
retained as an exact decimal bigint string, never a rounded JS Number.
`getStaticMeshResourceDiagnostics()` calls the actual native mesh-state endpoint
for cache leases, shape borrows, vertex/triangle counts and core mesh bytes;
`users` is separately understood as JS bookkeeping.

The first snapshot is taken **before the first scene**, with zero body/shape/
contact/joint counts and no tracked resource. Every release must match that exact
snapshot, including bytes. The first mismatch fails immediately and retains the
partial row, release receipt and all numeric observations. No warmup, baseline
reset, averaging, later-cycle overwrite or private world reconstruction is allowed.
A nonzero byte delta means **the strict baseline assertion is unmet**, not by
itself a diagnosis of an engine leak. Legal empty-world allocator/capacity
retention, if found, requires a separate source analysis and explicit contract
review; it cannot be silently converted into PASS by this fixture.

An empty resource-diagnostics list shows no tracked leases, not that every
untracked leaked native resource is absent. No app-exposed module-wide live-world,
all-handle, or post-close global-byte counter is available. Those fields remain
`NOT_QUALIFIED`; no JS map/ownedCount or zero from another low-level module fills
them. The unchanged host must hash to
`10205d33d67ca3002eb5860aef9047688873423d910964eebf5269b0ef5d367b`.
Module-factory replacement/instrumentation fails this profile's identity check.
The highest success label is `PASS_LIMITED_C20APP_OBSERVABLE_SUBSET`, never full
C20, I05, I06, C19, browser/GPU/CSP, or full-gate acceptance.

## Identity, evidence and execution budget

The explicit new input lock covers this exact v1 fixture, source inventory,
production SDK JS/map/declarations/package, and same-product ready ST artifacts.
The existing product readiness verifier is reused; export inspection compiles
WASM metadata but does not instantiate it. A caller-declared producer commit is
not inferred from ABI identity; retain the independent SDK build/source receipt.
Every attempt directory/terminal file is create-once, with append-only observation
JSONL. Inputs are checked before and after. Changed inputs, abnormal child exit,
timeout/SIGKILL, partial rows, missing real callbacks or failed cleanup cannot pass.
The outer close is attempted independently of the first failure and never masks it.

Failure-path boundary: if construction or `app.run` fails before a scene/material
is adopted by the active session, this v1 fixture does not qualify cleanup of
unattached scenes, nodes or materials. The outer `app.close()` is still attempted,
but its receipt alone cannot prove reclamation of those unowned objects. Such an
attempt remains overall **FAIL** and supplies neither resource-return-to-zero nor
failure-cleanup acceptance evidence. This limitation does not relax the normal
100-cycle path: every completed mounted scene must meet all release, material and
original-baseline assertions. Normal scene cleanup uses the real SDK ordering:
`scope.dispose()` queues ownership cleanup as a microtask; synchronous scene and
collider destruction runs first, then material cleanup, then the final SDK flush.

Predeclared bounded budget: CPU controls **30 s**; production consumer **300 s**;
100 scenes × at most (12 enter + 2 stay + 60 exit) = **7,400** public steps,
2,000 ms per individual step wait (within the stricter total wall deadline).
A typical path is about 60 steps/scene. The 300 s budget permits about 40 ms per
maximum-budget HEADLESS step, plus startup and hashing; this is a prospective
budget, **not measured throughput**. A timeout is a retained failed attempt,
not permission to silently enlarge the budget or rerun. No install/build/browser
launch, environment move or cloud task is included.

After independent root review, publication and explicit execution authorization:

```sh
H=tools/physics/box3d/c20-app-scene-cycles/v1
node "$H/freeze.mjs" SOURCE_ROOT SDK_DIR READY_ST_DIR BUILD_NUMBER JS_SHA256 PRODUCER_COMMIT NEW_LOCK.json
node "$H/run.mjs" --authorized-c20app-fresh-st SOURCE_ROOT SDK_DIR READY_ST_DIR NEW_LOCK.json NEW_ATTEMPT_DIR
```

Preparation CPU controls only:

```sh
node --test tools/physics/box3d/c20-app-scene-cycles/v1/contract.test.mjs
```

These controls use clearly synthetic metadata and a tiny fake diagnostic adapter.
They test rejection of too few/empty scenes, too few objects, missing joints/events,
nonzero resources/bytes, wrong clocks, stale generations, failed scene/app cleanup,
changed input and instrumentation identity. They never import the production SDK,
load physics, instantiate WASM, call a real native endpoint, or claim native PASS.
