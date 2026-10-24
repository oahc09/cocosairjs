# EX01 · Box3D rigidbody playground

Status: **IN_PROGRESS**. This is the original EX01 from `ai/plans/box3d-v1.2-reference.md` §12, not a replacement MVP or a reduced acceptance contract. Source implementation is not runtime, browser, physics-correctness, or full-EX01 evidence.

## Visible scene and interaction

The scene uses the normal `cocosair` main entry, `createAirApp({ physics: 'box3d' })`, original Cocos `Scene`, `Node`, `Camera`, `DirectionalLight`, `MeshRenderer`, `RigidBody`, `BoxCollider`, `SphereCollider`, `CapsuleCollider`, `MeshCollider` (convex Hull), and `PhysicsMaterial`. It contains exactly 100 individual dynamic brick bodies, a static ground box, a procedural grid, and selectable mint sphere/capsule/tetrahedral Hull projectiles. Every simulated visual uses the corresponding node's real native pose writeback. No fallback solver, substitute animation, native pointer, test adapter registration, separate RAF, or direct physics step is used.

- Initial load automatically starts the ordinary engine loop's physics after a short introduction, allows wall settlement, and fires one sphere then one capsule with two actual public `RigidBody.applyImpulse` commands. `?demo=0` disables this presentation schedule. This schedule is not a deterministic native-tick/replay proof.
- Start/pause uses `PhysicsSystem.enable`; rendering remains live. Impulses are submitted once after the spawned component's activation and are consumed by the canonical next fixed tick.
- Fire with the launch button or Space while no interactive control has focus. Each click creates the selected sphere, capsule or convex tetrahedral Hull and schedules one world-space impulse. Selection changes only future projectiles; existing bodies are not reshaped. Hull is now a true convex MeshCollider option over the exact visible tetrahedron POSITION data; the wall supplies the Box shape. A maximum of 12 retained projectiles bounds scene growth.
- Projectile mass changes existing and future projectiles. Friction and restitution change the single shared material on ground, wall and projectiles through real public setters. No rolling/spinning friction is requested.
- Picking/dragging is wired to the public `registerBox3DBeforeStep` main export and `PhysicsSystem.raycastClosest`. Fresh current-build native/browser evidence is still required for this scene. The visible scope is one dynamic, same-Node, center-zero BoxCollider/SphereCollider/CapsuleCollider only, with no compound/descendant collider. The hit/target is copied, the actual current shape transform supplies the picked point/COM, and each fixed-tick hook submits one bounded public `RigidBody.applyForce` with angular point damping. There is no render-frame force submission.
- Pointer-up, pointer cancellation, lost capture, Escape, blur, hidden document and the release button stop the spring without clearing velocity or inventing a release impulse. Pause, reset, projectile creation, parameter mutation and explicit close cancel before changing ownership. Disabling drag does not disable the real simulation. Selecting an object stops the auto-shot schedule.
- The close button disposes drag input before calling the existing public `app.close()`. The JSON export preserves the actual close receipt or rejection; receipt arrival is not equivalent to successful native cleanup or 100-cycle proof. Export/reload page controls survive scene event-listener cleanup. Page exit only cancels input synchronously and is not an awaited close proof. Scene `onDestroy` disposes the drag controller idempotently.
- Reset pauses physics, destroys only dynamic nodes through ordinary Cocos deferred destruction, waits for actual `isValid(node) === false`, then builds a new 100-brick wall. It preserves one app/world, the static ground and shared visual/material assets. It never changes a live body's pose or parentage. The real Director destroys queued nodes before `PhysicsSystem.postUpdate`.
- Export downloads JSON containing the fixed configuration/seed, current parameter values, copied observations, submitted commands, current poses, errors, source identity and runtime build constants. On demand it also hashes the served main JS bundle. That served-file hash is explicitly not proof of a browser's cached executed bytes or the WASM identity. Missing identity/readout fields stay missing.

## Diagnostics and limitations

Awake is read through the real `RigidBody.isAwake` API. “Displaced bricks” means distance from the original wall plane greater than 0.6 m or an absolute local-up/world-up dot product below 0.65. It is not an event/contact count. Minimum geometry Y uses the configured sphere radius, quaternion-rotated box support extent, capsule support extent (radius + cylinderHeight/2 × |rotated local-Y dot world-Y|), or the minimum Y of the four quaternion-transformed tetrahedron vertices, rather than center height alone. The capsule is centered and unit-scale: radius 0.42 m, cylinderHeight 1 m, total height 1.84 m. The existing primitive.capsule API receives total height; CapsuleCollider receives cylinderHeight and Y_AXIS separately. Its single symmetric shape keeps local COM at the origin, so the existing restricted spring point/COM assumptions also apply; no arbitrary-COM support is implied. Values below −0.15 m are recorded as an observation, not hidden. Render-frame and display-elapsed counters are explicitly not native ticks/time.

Backend identity uses `physicsWorld.impl`. The example-only `backend-observation.ts` consumer runtime-checks the existing Box3D `diagnostics()` and `getNativeCounts()` methods. This is a **backend-specific copied snapshot, not a stable/general IPhysicsWorld API**. `nativeStep` comes only from `diagnostics().native.nativeStepIndex` when `nativeObservationCurrent` is true at a ready/idle boundary. Contacts comes only from the real guarded `getNativeCounts().contacts`; it is a native count, not public collision events. Missing/malformed/throwing values remain unavailable; a genuine native zero is preserved and never fabricated. Bigint live bytes become a decimal string for JSON. The byte value is the copied world counter (native b3World_GetCounters().byteCount), not JS, GPU, WASM heap capacity, or total process memory; the UI appends a B unit without inventing a memory metric.

The underlying copied diagnostics cache may survive fault/close, but this current consumer first reads `world.impl`, whose guard can throw at those boundaries. Therefore this consumer can return unavailable without preserving the cached step after fault/close; it does not prove closed-world diagnostics are readable. Native counts cannot be read after close. The consumer is stricter than the underlying guard: it calls `getNativeCounts()` only for world `ready`, owner `idle` and non-committing command phase. Closed/faulted/in-flight state skips the native count call entirely. Cached step identity is separately exported as historical, not shown as current. A single read failure is caught and reported without retry, stepping or mutation. Only whitelisted copied scalar fields are retained; no world, handle or private field escapes.

`componentEventsSupported` and `debugPresented` stay false, as returned by the current source. Unexpected capability flags do not promote support. Public collider contact/trigger events are not subscribed because the current Box3D adapter rejects them. A grid is not native collider debug drawing.

The source assets and capability wiring must be committed and backed up before execution. Run this example only with the actual optional `physics-box3d` main bundle and its exact verified native assets after that checkpoint. The default non-Box3D bundle is expected to fail clearly rather than switch backends. Build date/number are display identity, not source SHA. `AIR_REVISION` is an AIR version integer, not a Git revision.

## Original acceptance, unchanged

Exact original global requirement:

> 每个示例必须具有独立场景目标、可操作 UI、自动演示路径、重置、debug 显示和结果导出。所有示例附固定配置/seed、至少 15 秒真实运行录像、关键截图、数值断言、关联测试 ID 与 source/build fingerprint。编译成功和静态截图都不足以证明行为通过。

Exact original EX01 row:

> EX01 `box3d-rigidbody-playground` | 100块砖墙，sphere/capsule/box/hull；拾取拖拽、投掷、质量/摩擦/恢复调节；awake/contacts/step面板；线程模式由重载后的配置选择 | 墙可击倒且不穿地；拾取命中与可视位置一致；100次增删资源恢复；关联C05–C15/C20/C26/C32–C34

Exact original visual/UI requirement:

> 示例 UI 只展示用户需要决策的状态。构建 digest 等维护数据可以放诊断展开区，不能把普通操作流程变成工具参数面板。允许画面质量适度简化，但碰撞体与视觉尺寸、光照和相机必须足够清楚，便于判断穿透与运动问题。

`original-requirements.json` retains a concrete checklist. All runtime acceptance remains unverified. Missing capabilities are explicit unfinished original requirements: current-Hull-build browser validation and Hull picking/dragging, current-build validation of restricted raycast picking/fixed-tick dragging/release momentum, arbitrary COM/compound-body dragging and throwing, public contact events, MT/auto selection, 100-cycle resource recovery, numerical acceptance assertions, real 15-second video, screenshots, replay and full source/native build fingerprint binding. A box/sphere/capsule/Hull source integration alone never completes EX01.

## Capsule source-only checks

`node tools/verify/box3d/ex01-capsule-scene.test.cjs` checks the shared capsule dimensions/support-extent helper, mesh/collider source wiring, restricted drag guards, lifecycle/resource-cap source paths, and unchanged NOT_RUN acceptance scope. It does not load a native solver, create an engine scene, draw a frame, or establish collision/picking correctness. The fixed demo order is sphere then capsule. All real browser/formal checks remain NOT_RUN.

## Earlier source-only review performed

The staging task performed formatting, source parsing, full example consumer TypeScript checking against the existing ordinary stage46 declarations and isolated CPU tests of the read-only diagnostic consumer against explicit fixtures. These fixtures are not a native solver, engine simulation, browser run or physics evidence. No runtime build, native execution, browser or deployment has been performed by this staging task. Source checkpoint archives were uploaded to Library and actually downloaded/compared; source transfer is not runtime execution. A successful source/consumer check must not be renamed a visual/physics PASS. Prior source63 Firefox observations are separate historical evidence, not qualification of this Hull runtime. The runtime `.js` helper import follows the actual dev and focused server rule mapping sibling `.js` requests to `.ts` source.

## Next real verification after source checkpoint

1. Build through the normal optional feature path, retaining logs, exact source/native manifest hashes and artifact receipts. Do not test-register or weaken gates to enable the scene.
2. Open this exact page in a fresh actual browser. Confirm no console/page error, actual Box3D identity, visible wall/ground/light/camera alignment and all 100 independent dynamic nodes.
3. Capture at least 15 seconds of uninterrupted actual wall settlement, sphere and capsule impulse impacts, falling blocks and stable non-penetrating ground contacts. Retain source/build fingerprints and command/pose exports with compositor screenshots.
4. Exercise controls through real UI: real visible-hit alignment, drag at 30/60/120 Hz with the same fixed-tick inputs, finite force/COM-relative torque, momentum-preserving release, capture loss, blur/visibility, disable, Escape, explicit close receipt, pause/resume, one-shot Space/button launch for both shapes, accurate sphere/capsule counts, mass values, friction and restitution changes, reset during flight and after settlement. Check no live transform mutation or second step owner occurs.
5. Run and retain 100 create/destroy cycles against actual native resource counts, compare to the legitimate retained floor/world/material baseline, and verify close independently. Reset count UI is not leak evidence. Do not create repeatedly closed apps as a workaround.
6. Continue the missing original capabilities and their required numerical/effect checks; do not reduce the EX01 scope or promote it to complete on the box/sphere/capsule subset.

## Current source integration boundary

The capsule scene option requires the current CapsuleCollider-enabled Box3D registration, native capsule create/update/query binding, public `registerBox3DBeforeStep`, and native `PhysicsSystem.raycastClosest` route. Do not serve this page with an older bundle or a pre-capsule WASM asset. No test adapter, internal-world cast, synthetic ray or alternate physics backend is provided. Capsule source wiring does not establish native/browser behavior. The lead must refresh the derived source identity only after all source changes and the matching build are finalized.

The drag readout's tick/attempt identifies a submitted hook call, not successful native completion. Native completed step remains the separately guarded backend observation. All EX01 checks stay `NOT_RUN`; joints, component collision events and native debug presentation are not promoted.

## New Hull source candidate

The Hull option uses an actual convex MeshCollider over the exact rendered tetrahedron POSITION stream, never a box. New matching native/public/runtime/browser evidence is still required. Hull dragging is deliberately not admitted by the existing symmetric-primitive spring handler; no guessed arbitrary COM is used. All original EX01 requirements, including full shape interaction, 100 lifecycle cycles and recording, remain unchanged and incomplete.

## Limited actual Hull browser observation and metadata correction

The source74 runtime209 candidate was actually observed in Firefox158.0.1: ordinary start, wall settlement, one real tetrahedron launch/impact/rest, pause and normal close. This finite scope is LIMITED_BROWSER_OBSERVED, not full EX01. Source75 corrects the new delivery's stale runtime208/pre-Hull identity metadata without changing scene JS or native bytes. Original74 JSON/static bytes remain unchanged. Exact raw hashes, close retained resources, sampled minimumY and remaining limits are in `docs/physics/box3d/rebuild/hull-browser-observation-20261023.md`. Hull dragging remains unfinished and formal2128/nine Gates remain NOT_RUN.

## Native-COM drag candidate (source76, not yet qualified)

The new controller uses `readBox3DBodyMotion(RigidBody)` for actual committed native origin, world center of mass, COM/angular velocity and mass. It retains the picked point in native body-origin coordinates; shape scale is already baked into geometry, so no Node matrix or second scaling is applied. One public `applyForce` submission is made per before-step callback, and pointer release only retires future spring input. It is not a joint.

Hull and same-body compounds no longer need a centered-primitive COM assumption. The Compound projectile contains one RigidBody with an offset BoxCollider and SphereCollider plus exactly matching child visuals. A disabled/destroyed selected collider submits no further force. Pause/reset/parameter changes/close cancel the input. Current candidate native and browser validation remain PENDING; the historical stage74/75 observations and all formal NOT_RUN states retain their original scope.
