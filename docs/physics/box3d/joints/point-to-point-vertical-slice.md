# Box3D PointToPointConstraint: current-source vertical slice

**Newly authored 2026-10-25 from runtime source commit `b089d223aad1bb4be4a81f187eceb341510d766a`. This is not a recovered historical document and does not inherit historical qualification.** This path was not found in that commit. Preserve this new auxiliary document with the regression fixture commit, separately from the runtime producer commit.

Status at authoring: the implementation below exists in source. Build 223 ESM and declarations have completed, but the new same-version regression cohort, including these P2P cases, has **NOT_RUN**. A successful build, source inspection, syntax check or input freeze is not a numerical/lifecycle test result. No P2P physics was executed to write this document.

## Public contract and coordinates

Use the ordinary production main-entry exports, not the Box3D adapter, `constraint.impl`, private fields or native handles.

| Public member      | Current Box3D meaning and admission                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attachedBody`     | Read-only `RigidBody` on the constraint's Node; the Cocos base requires that component. It must be live and owned by this exact initialized physics world.                  |
| `connectedBody`    | Another distinct, live, same-world `RigidBody`, or `null` (default). No self-link, foreign/uninitialized body, destroyed/pending-destroy body or arbitrary object.          |
| `pivotA`, `pivotB` | `IVec3Like`, initially `(0, 0, 0)`. Each `x/y/z` must be a number finite both as a JS number and after float32 conversion. Body-scaled values must also fit finite float32. |
| `enableCollision`  | Exact boolean, default `true`; controls collision between connected bodies. This is not a global collision filter.                                                          |
| `enabled`          | Inherited component activity, initially enabled. Effective activity also depends on the Node hierarchy and normal Cocos lifecycle.                                          |
| `destroy()`        | Normal Cocos deferred destruction; not a direct native destroy API.                                                                                                         |

The physical constraint is a **spherical joint**: three positional constraints, three free rotational degrees of freedom. It is not a weld or a hinge. The bridge explicitly disables spring, motor, cone limit and twist limit. P2P exposes no angular axis, angular limit/motor/spring controls, break threshold, reaction force or reaction torque API. Native capabilities outside this bridge are not additional public P2P features.

For a real B, pivots are relative to each **body origin**, not its center of mass. The adapter multiplies each component by that body's admitted initial world scale, then submits float32 geometry. In the fixture's metre convention, world lengths/separations are metres, time is seconds, and copied body angular velocity is radians/second. There is no extra P2P pixel-to-metre conversion or P2P angle parameter. An independent world pivot is `bodyPosition + rotate(bodyQuaternion, initialScale * localPivot)`. Positive finite admitted scale is required; zero/negative scale and scaled overflow are not legal joint geometry. Do not recalculate the reference scale from a rotating Node's decomposed live world scale.

**Null B is special:** the adapter owns a static anchor body and captures A's current world pivot at safe native creation. Stored `pivotB` remains validated/publicly readable but is not used as the world-anchor coordinate. Thus `pivotB = new Vec3(...)` does not directly select an arbitrary world point when B is null. Either explicit pivot setter, even a same-value write, requests a new capture for null B. An unchanged synchronization or collision-only update does not recapture. Reconnecting to a real B revalidates the stored B pivot against that body's scale.

## Admission, commit and lifetime

1. Initialize the app/world and activate the body Node before adding/configuring the constraint. Do not rely on pivot setters before `onLoad` has installed its owner. The fixture uses active add, immediately disables, assigns all endpoints/pivots/collision policy, then enables, without yielding between these operations.
2. Public setters admit/copy the candidate before publishing public cache changes. Native writes wait for a safe world synchronization before the next native step. Only the final candidate is committed; ordinary component assembly must not create intermediate native joints or teleport bodies.
3. `joint.pivotA.x = ...` mutates the public Vec3 alias only: it does not submit new geometry. Assign `joint.pivotA = new Vec3(...)` (or explicitly reassign the alias) to submit. Collision-only changes must not accidentally submit aliases. Caller vector accessors are read once; failed admission must not publish a partial candidate.
4. Changing endpoint/geometry rebuilds the native lease safely. Disabling or inactive hierarchy detaches it; enabling validates and rebuilds. A null-B rebuild captures at that commit's pose, not a previously cached world pose.
5. Removal/type retirement of an endpoint detaches the old committed lease before its body retires. An orphan remains disconnected until a valid explicit endpoint request (including null) or valid re-enable recovers it. A pending reconnection to a different live B must survive removal of the old committed B.
6. Component destruction retires its joint before another native tick; attached Node destruction follows normal Director deferred-destroy order. Do not force a premature manual synchronization of a Node already marked for destruction.
7. Lease cleanup destroys the joint before its owned null-B anchor. App teardown closes world ownership. Post-close setters reject with `AIR_E_BOX3D_DISPOSED`; stale/destroyed getters are not guaranteed to remain usable. Reentrant requests and terminal-world requests are rejected by the world owner, not silently retried.

The copied readers `readBox3DConstraintState(joint)` and `readBox3DBodyMotion(body)`, and `registerBox3DBeforeStep(...)`, are **AIR extensions**, not additional Cocos P2P setters. Reads do not step or commit pending requests. Constraint snapshots expose requested/applied state, capture versions and copied native frames/separation, not mutable native capabilities. Counts/frames can support lifecycle observations but do not prove internal allocation accounting.

## Public API assembly example

This is a source-reviewed assembly fragment, not a new executed example. `sdk` is the ordinary `cocosair.module.js` namespace, and `scene` is already running under a successfully initialized `createAirApp({ physics: 'box3d', ... })` with matching ST assets. The caller owns the app and its one Game clock. All initial transforms precede entry into the running scene; no pose correction or second physics loop is introduced.

```js
function addWorldAnchoredPendulum(sdk, scene) {
    const { Node, RigidBody, BoxCollider, PointToPointConstraint, Vec3 } = sdk;
    const node = new Node('p2p-pendulum');
    node.setPosition(0, 3, 0);
    const body = node.addComponent(RigidBody);
    body.type = RigidBody.Type.DYNAMIC;
    body.mass = 1;
    body.useGravity = true;
    const collider = node.addComponent(BoxCollider);
    collider.size = new Vec3(0.5, 0.5, 0.5);
    scene.addChild(node); // Activate the body owner before constraint onLoad/setters.

    const joint = node.addComponent(PointToPointConstraint);
    joint.enabled = false;
    joint.connectedBody = null;
    joint.pivotA = new Vec3(0, 0.5, 0);
    joint.pivotB = new Vec3(0, 0, 0); // Stored value, not a world-point setter.
    joint.enableCollision = false;
    joint.enabled = true;
    return { node, body, joint }; // Next ordinary safe sync captures A's world pivot.
}
```

Use `joint.enabled = false` to release the constraint while retaining the body; use `joint.destroy()` or `node.destroy()` for normal deferred disposal. The owning app must eventually `await app.close()` and inspect its release receipt, including physics cleanup, even after an error. The current factory supplies close; older custom `AirApp` handles have an optional close type and are not the reproduction target. Do not retain snapshots as live views or use native IDs for business logic.

## Existing bounded cases and expected outcomes

The existing fixture directory is `tools/verify/box3d/public-point-to-point/`. These are specifications of its assertions, **not claims that they passed against build 223**.

| Entry                                | Positive result required                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Negative/failure expectations                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `consumer.mjs ... healthy`           | `PASS_LIMITED_PUBLIC_POINT_TO_POINT`: a gravity-loaded off-centre rotated/scaled null-B pendulum and a moving/rotating two-dynamic pair sampled for 600 ticks; both independent geometry error and copied native separation stay at most 0.02 m at every sampled tick. Separate COM-centred isotropic cubes rotate freely around X/Y/Z. Safe assembly, reconnection, collision callback staging, disable/free fall/re-enable, component/body retirement, copied-state stability and clean close are checked. | Reject NaN/infinity/float32 overflow/scaled overflow, self/non-body/dead/unowned B, nonboolean collision flags and reentrancy before cache/native-count/pose publication. Preserve thrown accessor error identity. Any ordinary physics, host or cleanup error is a failure; no intentional-fault exemption applies here. |
| `consumer.mjs ... intentional-fault` | `PASS_EXPECTED_PUBLIC_POINT_TO_POINT_FAULT`: a real sphere/box collision callback stages a public P2P pivot request, then throws a unique Error; the clock preserves that exact Error, and subsequent setters reject before publication.                                                                                                                                                                                                                                                                     | Only this separate process expects a failed close receipt with exactly one `game-clock-terminal` failure containing `AIR_E_BOX3D_WORLD_FAULTED`; physics preparation must still release without cleanup errors. An unrelated failure or swallowed/replaced Error is not success.                                          |

`thresholds.mjs` fixes `dt=1/60`, four solver substeps, 600 endurance ticks, 0.02 m separation, 0.0001 m capture error, and the separate rotation checks (90 ticks, angle at least 0.2 rad, axis alignment at least 0.99, initial angular speed at least 0.1 and retention 0.8–1.2). These are sampled endpoint bounds, not continuous-time guarantees; do not loosen them after a failure.

`run.mjs` additionally launches `legacy-consumer.mjs` in a third fresh Cannon process. That narrow setter/lifecycle baseline expects `PASS_LIMITED_CANNON_POINT_TO_POINT_LEGACY`, no Box3D asset acquisition, and normal cleanup. Its explicit read-only inspection of Cannon native objects is fixture-only, not permission for Box3D application code to inspect native handles. `tools/physics/box3d/native/p2p_contract.c` is a separate host/WASM bridge contract fixture with its own independent pivot oracle and rejection/purity checks; it is neither the public consumer nor evidence automatically inherited by it.

## Reproduction and evidence boundary

For the new cohort, use the separately reviewed, versioned manifest-aware cohort reader: keep `runtimeProducer` and `regressionFixtureCommit` separate, and freeze/run only after independent approval. Its concrete CLI/configuration must come from that preserved reader version; this document does not invent a fixture SHA or a command for an uncommitted candidate. The old fixture scripts remain references for their bounded assertions, not a build-223-compatible execution recipe. In particular, do not reuse an old `freeze-cohort ARTIFACTS PRODUCT_LOCK ...` invocation or launch a consumer directly to bypass new provenance checks. A reproducible run needs:

- The exact Node host and locked JSDOM dependencies, a complete source/dependency closure and a separately preserved fixture commit including this newly authored auxiliary document.
- Matching fresh `cocosair.module.js`, source map, successful build receipt and full source-input receipt; the runtime producer commit must remain distinct from the fixture commit. The original fixture rejects builds through 215; a newer build number alone is not proof of matching bytes.
- The complete corresponding `physics/box3d/st/` manifest, JS and WASM. Source/schema/facade/native exports must agree, including `air_b3_p2p_create`, `air_b3_p2p_configure` and `air_b3_p2p_state`; never mix an old WASM with a new ESM bundle.
- A fresh external frozen-input lock and fresh output directory. Preserve stdout, stderr, exits, raw observations and before/after input hashes for all cases, including failed attempts. Corrected inputs require new frozen bytes/attempts, not edited receipts.

The fixture's Node/JSDOM HEADLESS transport maps only the production loader's exact native-module HTTPS request to hash-locked local bytes; fetch serves only the locked manifest/JS/WASM with correct MIME types. It exercises that controlled production load path, not ordinary browser networking/rendering/shutdown. Each process uses one owned Game step clock. Teardown awaits `app.close()`, verifies all acquired physics owners were released and retained ownership is empty, then disposes host hooks/JSDOM. Do not replace that cleanup with direct native destruction.

The original v1.2 plan's T17 covers **PointToPoint, Hinge and Fixed**, public parameters/coordinates and safe disabled-configure-enable assembly; its angular motor/limit requirements are not extra P2P fields. T17 is larger than this slice. Live scale mutation/recreation, ordinary browser loading/graphics/shutdown, internal native allocation accounting, full T17, full EX09, the full 2,128-cell matrix and all nine formal Gates remain **NOT_RUN** for this new cohort. Neither this document nor a passing bounded subset can change those qualifications.

## Source references

Runtime paths below refer precisely to `b089d223aad1bb4be4a81f187eceb341510d766a`; fixture/plan references are separately preserved inputs, not a claim that this new document exists in that runtime commit.

- `src/cocos/physics/framework/components/constraints/point-to-point-constraint.ts`: public pivots/defaults/setters; `constraint.ts`: endpoints/collision/activity/destruction.
- `src/air/physics/box3d/point-to-point-constraint.ts`: candidate admission, scaled geometry, null-B recapture, lifecycle/commit and copied diagnostics.
- `src/air/physics/box3d/world.ts` (`validateFixedEndpoints`, `initialJointScale`, `createPointToPointLease`); `shared-body.ts` (`createPointToPointLease`): exact-world ownership, initial scale and native lease/anchor release.
- `src/air/physics/box3d/world-binding.ts` (`finiteFloat32`); `binding/facade.mjs` and `binding/facade.d.mts`: validation and copied P2P bridge state.
- `tools/physics/box3d/native/p2p_bridge.c:26–72`: frame creation/capture, spherical flags, collision configuration and copied separation. `p2p_contract.c`: independent native contract fixture.
- `src/air/box3d-controls.ts`, `src/air/index.ts`, `src/exports/physics-framework.ts`, `src/exports/air.ts`: AIR copied readers and ordinary production exports. `src/air/app.ts`: owned app lifecycle/close.
- `tools/verify/box3d/public-point-to-point/{consumer.mjs,legacy-consumer.mjs,thresholds.mjs,README.md,freeze-inputs.mjs,inputs.mjs,run.mjs}`: bounded oracles, admission, process separation and cleanup.
- Preserved plan: `tools/verify/box3d/collider-retirement-contract-review-20261022-a/inputs/ai/plans/box3d-v1.2-reference.md:331–337,451–453,552`: joint mapping, T17 scope and formal qualification ownership; not runtime completion evidence.
