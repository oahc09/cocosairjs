# Box3D M0 contract decisions

Contract version: `box3d-rebuild-contract-1`. This freezes implementation targets from v1.2 and makes one formerly undefined measurement explicit. It does not certify implementation, ABI coverage, WASM, a browser, G0 or G1. The machine-readable public-spec map was extracted from the actual pinned Cocos interfaces, not invented from remembered method names.

## Baseline and isolation

CocosAIR source is pinned to main `b573be0741db9e2a13d38ce7e65870b97a1f5fbc`; its only additional mainline change after the v1.2 `02261af` baseline is the Box2D acceptance/CI merge recorded in the preserved commit metadata. Core and binding versions remain fixed by v1.2. New native code is a narrow explicit C17 wire ABI, not a claim that the complete community embind facade has been migrated.

The actual current bootstrap prepares Box2D before its game.init try/catch. T03/T08 must extend the transaction boundary to include the selected 2D prepare followed by selected 3D prepare. A 2D failure must start no 3D work; a 3D failure must release acquired 2D resources; game.init failure releases both. PRE only selects already prepared descriptors. Current app.close releases the scene then Box2D; Box3D needs a separate app-owned teardown hook and independent failed/pending receipts. No shared 2D/3D module state or second scene/RAF/accumulator is permitted. Existing admission, default builtin/Cannon and permanently closed app semantics remain unchanged.

## Public movement and defaults

Adopt v1.2 names `createKinematicTarget`, `teleportRigidBody`, and `getPhysicsBackendInfo`. A kinematic target handle is exclusive per valid body. The last command sequence before a fixed tick wins; an event-callback command applies only to the next tick. No next target means zero target-mode velocity. clear cancels pending movement but retains ownership; dispose releases it. Body disable/type change/scene generation loss/app.close invalidates it; pause cancels pending intent and rejects new intent until resumed. Direct node/velocity writes conflict while target ownership is active. Teleport is the explicit reset path, defaulting preserveVelocity=false and wake=true, and cancels queued targets. No normal EX09 shipment may call reset/teleport on merchandise.

Use one b3World_Step per existing fixed tick with solverSubSteps in 1/2/4/8 (default 4). Keep existing catch-up rules. Before-step persistent force handles are separate from one-shot applyForce/applyImpulse commands; ConstantForce remains frame-submitted and is not advertised as tick-equivalent across frame rates.

## Numeric and material policy

Use m/kg/s/rad internally; public Cocos hinge degrees and degrees/second convert at the adapter boundary. Body node pose is body origin, not COM. Point offsets for force/impulse are world offsets relative to COM; local offsets rotate but do not get rescaled or translated twice.

Box3D damping adopts the exact v1.2 coefficient mapping: finite c in [0,1], no hidden Cannon compatibility transform. Each native substep h uses 1/(1+h*c). c=1 is finite damping, not velocity clear. Runtime gravityScale is 1/0 without clearing velocity. Axis factors accept only 0 or 1. Public component normalization of mass/size remains, while non-finite values and invalid raw binding values fail before native mutation. Shared material and geometry setters use validate/prepare/commit and revert component readback on rejection.

Core defaults were read at the fixed source: friction uses sqrt(frictionA*frictionB); restitution uses max(restitutionA,restitutionB). These defaults are adopted for Box3D and documented as backend semantics. C32 fixtures choose both surfaces deliberately. Rolling resistance is not blindly equated to Cocos rollingFriction; nonzero unsupported rolling/spinning values are rejected until an explicit dimensionally reviewed mapping and numerical tests exist. Default zero remains valid. This is not an excuse to change the other backend.

## Geometry, query and events

Keep v1.2 shape/scale/cooking restrictions. Mesh/heightfield/baked compound are static-only, including when disabled. Pending mesh and convex changes must be validated transactionally. Cylinder/cone are deterministic 32-segment hull approximations; the cone has one tip, not a tiny top cap. Dynamic bodies can assemble body then collider, but cannot simulate indefinitely with no valid geometry.

Query all sorts by distance then stable logical collider ID, deduplicates per collider and shares the same filtered collection as closest. Filtering a nearest trigger must continue to farther solids. Normalize copied inputs, never mutate caller data; preserve defined zero-distance hits and the [0,maxDistance) interval. Capsule height means cylinder length. Fixed-orientation translation sweep is not rotational sweep. Mesh winding governs one-sided queries; no fabricated interior volume or back-face guarantee.

Events use complete native IDs internally and stable logical IDs publicly. Copy before callbacks; defer destructive/rebuild/filter actions to a safe point. Native manifold anchors and COM/origin/rotation must come from the same validated snapshot, never blindly from the post-step scene pose. The exact low-level sampling rule remains a T07 proof obligation. Moving sensors lack generic continuous scanning; limited fast-solid→sensor hits are retained without inventing stay events. All native capacity/flags/filter limits remain observable.

## C16 measurement clarification, not historical recovery

The old report's 20mm sustained-penetration statement had no original duration definition. New versioned acceptance therefore uses:

- The original fixture, gravity, speed, dt=1/60, solverSubSteps=4 and 600 completed ticks must be recovered or reconstructed with a new fixture identity before execution. Do not silently change them to make a failure disappear.
- At each completed fixed tick, independently compute sphere-versus-finite-triangle penetration from that same post-step sphere and triangle geometry. Native cached manifold separation is not an independent post-step measurement.
- Sampled peak criterion: every retained fixed-tick penetration sample is at most 0.05m. This does not prove a bound at unobserved substeps or at arbitrary continuous instants.
- Sustained criterion: fail if at least seven consecutive completed fixed-tick samples exceed 0.02m and the first-to-last sample timestamp span is at least 0.1s. At 60Hz this is seven endpoints spanning six intervals. Six endpoints alone span only 5/60s and do not establish 100ms.
- Preserve all 600 samples, endpoint times, triangle IDs/geometry, independent-validator version and negative controls. Finite-triangle edges, vertices and degenerate geometry must not be replaced by an infinite plane.
- This is new contract `C16-DURATION-1`, not a recovered old definition and not a reason to promote any old C16 PASS. A missing original fixture remains a separate blocker.

## Gate and inventory integrity

The initial 91 parent categories remain NOT_RUN. Required fixed subcases are explicitly inventoried but still need environment/variant expansion and fixture-specific review. Native GCC diagnostics do not fill any Node-WASM or browser cell. Actual device/OS/browser versions, three first-use human participants and toolchain digest are not fabricated. The existing 861-cell historical count is not a current denominator. G0 remains NOT_RUN until the full inventory, business fixture configuration and build/distribution contract are reviewed and frozen.

After every meaningful checkpoint, retain source/inputs/test tools in Git and build/raw artifacts with portable manifests. No Git bundle is considered a persisted backup until it is read back from Library and restored into an independent checkout. Remote commits use the true upstream parent chain, never the local partial-snapshot root.
