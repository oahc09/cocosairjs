# T11 transform bridge contract and source review

Status: **DESIGN / NOT IMPLEMENTED / NOT RUN**, reviewed 2026-10-22 UTC.

This document preserves the T11 requirements and proposes the next narrow native/AIR boundary. It does not enable a transform API, qualify a new artifact, or mark T11 complete. No product source, original vendor file, l2 input, or l2 artifact was changed to prepare it. Existing l2 body/filter results are not transform results.

## 1. Authority and baseline

- Fixed official core: `erincatto/box3d@efca0c184d40fd6a82016983f1601c4d23965867`.
- Binding reference: `isaac-mason/box3d.js@5d5a3af049cccd9948b2b55bac4342414af0ef64`.
- Current ABI: `1`, variant `st-simd`, float32 world positions (`BOX3D_DOUBLE_PRECISION=OFF`).
- Current l2 schema: `78fccc27f58503178fcc824473a0e30d42fa54f19e87bd9424b83a975d45b738`.
- Current staged patch chain: `434fb89494867f515051d5ac0dfc0c694556ba1f0da9ac3fc895a27097b1c7c7`.
- Product baseline: `tools/physics/box3d/output/filter-wasm-{debug,release}-20261022-l2`.
- Requirements: `ai/plans/box3d-v1.2-reference.md`, §5.3 lines 229–242, §6.1–6.2 lines 246–270, T11 line 435, and C01–C12 / C11 subdivisions around lines 625–652.
- Frozen public names: `docs/physics/box3d/contracts/api-contract.json` and `decisions.md`. The older plan's suggested `docs/physics/box3d/api-contract.json` is not the actual contract location.

T11 includes basic multiple-collider COM/Node synchronization, target/teleport, before-step consumption, parent/scale, and its M2 test subdivisions. App-level target lifecycle remains T12; event delivery and complex lifecycle remain their M3 tasks. Those later obligations are not deleted by this document.

## 2. What the fixed native code actually does

The following references are to original vendor bytes, not an inferred API from another physics engine.

| Source                                                 | Observed behavior                                                                                                                                                                                       | Consequence                                                                                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `include/box3d/box3d.h:542–584`                        | Position is body **origin**; linear velocity is world COM velocity. SetTransform is a teleport; SetTargetTransform promises close, possibly inexact arrival.                                            | Do not expose COM as Node position or advertise an exact native target constraint.                                                                                    |
| `src/body.c:1142–1192`                                 | SetTransform writes origin/rotation, recomputes COM and world inverse inertia, resets `center0`/`rotation0`, recomputes shape AABBs, and moves a proxy if its fat AABB no longer contains the new AABB. | This is an instantaneous discontinuity and resets the CCD starting basis. It is not a swept trajectory.                                                               |
| Same function                                          | No velocity/force/torque clearing, wake call, immediate manifold regeneration, body-move event emission, or world step occurs in this function.                                                         | AIR must implement its explicit options; a successful pose write is not a completed step or new contact snapshot.                                                     |
| `src/body.c:1282–1352`                                 | Target returns without work for disabled/static bodies, nonpositive dt, or asleep bodies with `wake=false`. An asleep body can still return for small motion with `wake=true`.                          | A void return cannot establish target consumption. Validate type/enabled state and define target wake policy before mutation.                                         |
| `src/body.c:1309–1330`                                 | Target computes COM displacement / dt and first-order quaternion-difference angular velocity, choosing the shorter quaternion hemisphere.                                                               | Nonzero local COM couples a rotation target to COM translation. Arbitrary rotation does not arrive exactly after integration.                                         |
| `src/body.c:1350–1351`                                 | Target writes both velocities directly.                                                                                                                                                                 | It bypasses the immediate lock-axis behavior already promised by the body bridge.                                                                                     |
| `src/solver.c:66–108,175–218`                          | Awake states, including kinematic states, receive damping, world-axis lock projection, linear/angular speed caps, and position integration.                                                             | A target velocity can be damped, projected, or capped before producing motion. Kinematic zero inverse mass removes gravity/force acceleration, not this damping path. |
| `src/math_internal.h:201–216`; `src/solver.c:723–755`  | Rotation uses normalized first-order integration each substep; final origin is recomputed from integrated COM and rotated local COM.                                                                    | Target orientation error also contributes to body-origin position error when local COM is nonzero.                                                                    |
| `include/box3d/constants.h:70`; `src/solver.c:179–211` | Angular cap uses `B3_MAX_ROTATION = 0.25*pi` divided by full dt, except allow-fast-rotation states; linear cap uses the world's configured maximum.                                                     | A finite large target is not automatically reachable. Do not disable caps to obtain a fixture PASS.                                                                   |
| `src/physics_world.c:1038–1179`                        | Step clears/rebuilds event buffers; pairs precede narrow phase, solve follows, sensor overlap runs afterward.                                                                                           | Teleport/target setters must not manufacture enter/exit/contact events or call a hidden extra step.                                                                   |
| `src/physics_world.c:584–735`; `src/contact.c:734–879` | Awake-contact updates can recycle cached manifolds; generated anchors are adjusted to COM-relative values.                                                                                              | Next-step contact data need not be freshly generated at the final pose. Preserve the existing explicit geometry epoch.                                                |
| `src/body.c:2087–2118`                                 | SetAwake performs island operations; setting false is not a harmless way to “preserve current sleep state.”                                                                                             | `wake=false` means do not request wake, not force the body/island to sleep.                                                                                           |

Official source links: [body operations](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/body.c#L1142), [solver](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/src/solver.c#L175), [public declarations](https://github.com/erincatto/box3d/blob/efca0c184d40fd6a82016983f1601c4d23965867/include/box3d/box3d.h#L542).

These are source findings, not new execution results. In particular, sleeping-pair refresh after moving a static body has not been qualified by this review.

## 3. Existing binding and AIR boundary

`binding/facade.mjs` currently has copied body readback, body controls, shape/filter controls, and post-step snapshots, but no body pose setter or target setter. Keep the 29-float legacy body snapshot, 10-float transform row (origin 3, quaternion 4, COM 3), 49-float body state, and existing event/contact strides unchanged.

`shared-body.ts:143–165,191–211,241–280` currently:

- Checks initial world-matrix shear and rejects nonpositive initial scale.
- Records Node world origin/rotation, parent object, and scale.
- Explicitly rejects subsequent external pose changes and parent/scale changes as unsupported T11 behavior.
- Writes post-step body **origin**, not COM, to Node; records its own result and does not clear Node dirty flags.

`world.ts:352–434` currently performs pure body preflight before entering its fault-latched step region, then invokes the binding step once, verifies diagnostics, copies the snapshot, and synchronizes body poses. It has no formal target before-step consumer. Its raw-event diagnostic clearing is not completed Cocos collision event delivery.

The next AIR implementation must replace explicit unsupported branches only when their real native path is ready. A TypeScript method, cached target, changed Node transform, or mock control test is not native support. The real component helper owns AIR files; the foundation worker owns native/facade changes. Agree on signatures before concurrent editing.

## 4. Public semantics that must remain intact

The frozen public signatures are:

```ts
createKinematicTarget(body: RigidBody): KinematicTargetHandle;
handle.setTarget(pose: { position: IVec3Like; rotation: IQuatLike }): void;
handle.clear(): void;
handle.dispose(): void;
teleportRigidBody(
    body: RigidBody,
    pose: { position: IVec3Like; rotation: IQuatLike },
    options?: { preserveVelocity?: boolean; wake?: boolean },
): void;
```

Defaults are `preserveVelocity=false`, `wake=true`. This document does not choose another public API or expose native handles. The formal before-step hook is required, but its exact public registration signature is not present in `api-contract.json`; freeze that signature with the integrator before implementation rather than inventing competing entries.

| Body/operation                                       | Immediate pose commit at an unlocked safe point                                                                                                                                                  | Target mode                                                                         | Ordinary velocity mode                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| Static                                               | Needed internally for scene-origin synchronization; public teleport remains dynamic/kinematic-only. No implied dynamic velocity or wake result.                                                  | Reject.                                                                             | Existing static rejection remains.              |
| Dynamic                                              | Public teleport is a reset, not transport. Default clears v/w and requests wake.                                                                                                                 | Reject even though native SetTargetTransform does not itself reject dynamic bodies. | Existing body/force/lock contract remains.      |
| Kinematic, enabled                                   | Public teleport is the explicit reset channel and cancels pending target.                                                                                                                        | One current handle per body, copied one-shot target, fixed-tick consumption.        | Permitted only without active target ownership. |
| Disabled                                             | No target may be consumed; disable revokes the handle. Native SetTransform can store a disabled pose, but public disabled-teleport policy needs an explicit decision, not a silent native no-op. | Reject/revoke as specified.                                                         | Existing disabled behavior remains.             |
| Wrong world/module, stale generation, destroyed body | Reject before mutation.                                                                                                                                                                          | Reject before enqueue/consume.                                                      | Reject under existing ownership contract.       |

`clear()` cancels unconsumed intent and zeroes target-owned v/w at the safe point but retains control ownership. `dispose()` additionally releases ownership and is idempotent. A subsequent tick without a new target zeroes target-owned velocity; it does not continue the previous velocity indefinitely. Type changes away from kinematic, disable, owner teardown, or generation loss revoke the handle. Teleport cancels pending intent but does not implicitly dispose the active handle. Pause cancels pending motion; paused submissions reject and resume needs a new submission.

Direct public velocity setters and direct Node pose changes conflict with an active handle and report `AIR_E_BOX3D_CONFIG`. The native/AIR last valid state must remain valid. Because a Node can already have been edited before preflight notices it, AIR needs a deliberate restoration/reentrancy policy; merely throwing while leaving the edited Node visible does not satisfy the stated component/native consistency requirement. Parent edits affect other children, so do not roll an entire parent back as an incidental physics fix.

## 5. Origin, COM, velocity, and reset options

Let `p` be body-origin world position, `R` body rotation, and `c` the local COM. Then world COM is `C = p + R*c`. Collider center is a separate local geometric offset, not the COM.

For a target origin/rotation `(p1,R1)`, the native target's linear velocity is `(p1 + R1*c - C0)/dt`, not `(p1-p0)/dt`. A rotation-only origin target with nonzero COM therefore generally requires COM translation. Current world COM plus an unrelated cached anchor is never a substitute for a generation-time contact point.

For teleport:

1. Validate/copy all inputs and derived quantities before any pose, velocity, wake, snapshot, or command mutation.
2. Set origin/rotation and associated real native COM/inertia/CCD basis at the safe point.
3. With `preserveVelocity=true`, preserve world **COM** linear velocity and world angular velocity. This does not promise origin-point velocity, angular momentum, kinetic energy, or a swept collision path is preserved after reorientation.
4. With `preserveVelocity=false`, set both v/w to zero without accidentally waking a sleeping body when `wake=false`.
5. With `wake=true`, request wake for a valid enabled moving body; with false, preserve its prior awake/asleep condition rather than forcibly sleeping it. Wake can affect an island; observe that in tests.
6. Cancel pending target only when the reset is admitted/committed. A pure rejected reset must not discard a previously valid target.
7. Return/read copied actual origin, rotation, COM, v/w and awake state. Do not synthesize readback from the request.

The frozen options do **not** say whether teleport clears accumulated force/torque. Source SetTransform leaves them intact. Proposed conservative default is to preserve existing accumulators and separately document it, but this is an **open integrator decision**, not a newly imposed public requirement. Test the chosen policy and force-on-next-tick behavior; do not quietly call `clearForces()` to simplify a reset fixture.

A sleeping body may have no awake state allocation. Use reviewed core access in the owned bridge only if the public setters cannot implement zero/preserve/wake options without side effects. Precheck the complete ID, world, lock and set index; never create a fake awake state or expose an internal pointer. Wake/reserve failure after mutation is not a rollback success.

## 6. Target arrival, locks, and numerical admission

### 6.1 Target velocity is not a transform write

The native angular formula is `w = 2/dt * vector((q1-q0)*conjugate(q0))`, after choosing equivalent target quaternion sign. Integration uses normalized Euler substeps, not the exact quaternion logarithm. Damping and speed caps additionally change arrival. With nonzero COM, orientation error also changes final origin even when COM translation reached its target.

Therefore a raw SetTargetTransform wrapper cannot claim arbitrary one-tick exact arrival. Before implementation, freeze a documented arrival/error policy and independent tolerances for orientation, origin and COM. Required cases include finite large rotations, nonzero damping, nonzero COM, near sleep threshold, cap boundaries and solver substeps 1/2/4/8. Do not silently restrict all targets to tiny angles/zero damping, reinterpret a failed target as success, disable caps, or correct the final pose with SetTransform.

Possible implementation decisions needing review:

- Use native approximate target velocity with explicit observed arrival limits, if consistent with the frozen “target” requirement and approved tests.
- Derive a velocity plan accounting for the actual integrator/damping, then qualify it independently. A log-map velocity alone is not proof of exact arrival under this integrator. No private solver changes are authorized by this document.

A tiny but nonzero submitted target should not disappear because native sleep threshold suppresses it. Proposed consumer behavior is a deliberate wake of an enabled target-owned kinematic body before applying its validated plan; exact no-motion targets need not wake it. Freeze this policy and retain real asleep/threshold=0/nonzero-threshold observations.

### 6.2 Locks are world velocity-component constraints

Do not bypass the established immediate lock-axis contract with direct native target assignment. All immediate returned v/w must have locked components zero. Force accumulators are not silently projected or cleared.

A requested pose may be unreachable under its active locks. Proposed admission is to reject an incompatible target plan before changing any body/queue state, rather than projecting it and claiming the requested target was reached. Whether numerical near-zero motion is considered compatible requires a versioned tolerance, not an ad hoc fixture epsilon. This is another pre-implementation decision. A COM-based target can conflict with a linear lock even when origin position is unchanged. Use rotated, off-center compound fixtures to reveal that distinction.

Locks constrain velocities, not absolute coordinates. An explicitly admitted teleport is a reset and may change a locked coordinate; its preserved/cleared v/w must still obey the existing velocity constraints. Do not reconstruct angular lock behavior with Euler-angle freezing.

### 6.3 Validation and overflow

- Position: finite numeric components, representable in the float32 ABI, with finite derived COM, rotated extents, shape AABBs and margins. Finite components alone do not prevent overflow in sums/products.
- Quaternion: public pose inputs are copied and normalized, as §5.3 requires. Reject NaN, Infinity, zero quaternion and unrepresentable normalized result. A max-component-scaled normalization can handle very large/small finite nonzero inputs without overflowing/underflowing the norm. Validate the final float32 quaternion with the actual core unit-length predicate.
- Do not use `b3NormalizeQuat` as an admission validator: `math_functions.h:512–524` returns identity for small norm. Do not silently turn an invalid zero rotation into identity.
- Native unit tolerance is `1 ± 20*FLT_EPSILON` (`math_functions.h:444–448`). Existing body creation has its own admission; do not assume its `1e-4` norm check is sufficient for the new SetTransform assertions or silently change old creation semantics as part of this document.
- Treat `q` and `-q` as the same orientation for dirty/target comparisons. Preserve a deterministic shortest-arc tie policy at 180 degrees and test both signs.
- dt is the actual admitted fixed dt, rounded once to float32. Reject zero after rounding, nonfinite reciprocal, invalid substep `h`/`inv_h`, unsafe target displacement/dt, velocity norms or derived cap calculations **before native invocation**. A valid double or positive subnormal float is not automatically safe for the core's reciprocal arithmetic.
- Boolean options are strict booleans, not truthiness (`0`, `1`, strings and `null` reject). Shape of input arrays/objects, full generation, world/module ownership, enabled/type eligibility and unlocked state are all checked before mutation.
- Command sequence, target generation and snapshot revision counters must reject exhaustion before increment; do not wrap into an old valid handle identity.

Every rejected case must preserve native pose/v/w/forces, ownership counts, last valid snapshot and step diagnostics. Failure injection must be labeled as an injected wrapper/copy failure, never a spontaneous core defect.

### 6.4 Recommended smallest verifiable strategy and proposed budgets

Lead direction for the next candidate is a **specified-tick motion intent**, not an unqualified exact-arrival promise: preserve native target math/damping, reject lock conflicts and over-cap plans explicitly, and prohibit SetTransform correction. Technical decisions can be made by the lead within v1.2; no extra user approval is implied by the open decisions below.

Recommended first implementation:

1. Purely plan from copied actual current pose/local COM, normalized requested pose, native damping/locks/caps, actual dt and substep count. Recheck the same owner/body/configuration at commit; do not reuse a plan after an intervening mass/type/shape/pose change.
2. Validate the computed **pre-damping** target v/w against lock/cap/finite limits. If it cannot fit, reject instead of allowing the solver to silently clip the motion intent. Do not alter user damping or allow-fast-rotation configuration. Validate derived arithmetic before using the void core API.
3. For a nonzero admitted motion, explicitly wake the enabled kinematic body, then apply the reviewed target formula in one bridge operation, with immediate world-lock projection for only an admitted numeric-zero residue. Clear target velocity with a separate paired-v/w operation, not two independently fallible public setters. Return actual copied pose and body state plus requested intent; arrival is measured only after the real step.
4. Keep the first qualification scene free of joints/contacts for a scalar prediction, then separately add real floor/payload contacts. Do not extrapolate a free-motion arrival equation to all future constrained/CCD configurations.

For an uncapped, unlocked, force-free kinematic body with a fixed rotation axis, let `N=substeps`, `h=dt/N`, `rL=1/(1+h*cL)` and `rA=1/(1+h*cA)`. With initial target velocities `v0,w0`, the independent prediction is:

- `C_end = C_start + h*v0*sum(rL^i, i=1..N)`.
- `theta_end = sum(2*atan(h*|w0|*rA^i/2), i=1..N)`, about the world axis of `w0`.
- For native target math, `|w0| = 2*sin(theta_requested/2)/dt` for shortest-arc angle in `[0,pi]`.
- `p_end = C_end - R_end*c`, not `p_start + dt*v0`.

This yields two separate reported errors: native-versus-independent-prediction error and requested-versus-observed arrival error. With no damping, angular shortfall is `theta_requested - 2*N*atan(sin(theta_requested/2)/N)`; it is a modeled approximation, not float roundoff. COM damping shortfall and the rotation-induced origin error are similarly reported. A useful conservative origin bound is COM shortfall plus `2*|c|*sin(angular_shortfall/2)`, plus the numerical comparison budget. Validate the assumptions using actual native state; do not use this equation to excuse an unexplained contact/solver difference.

Proposed **qualification** budgets for lead freezing, not currently established PASS thresholds:

| Quantity                                           | Candidate budget / admission rule                                                                                                                                                                                                                                                                        |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixture domain                                     | World origin components within ±32m, local COM norm ≤4m, supported finite sphere/box geometry; 600 ticks, dt=1/60, N=1/2/4/8, damping coefficients 0/.25/1. This bounds the initial oracle experiment, not the final product API.                                                                        |
| Teleport and per-step scalar predicted origin/COM  | Absolute Euclidean error ≤`1e-4m`, measured against retained actual pre-call float32 state. It is not a blanket desired-target arrival tolerance.                                                                                                                                                        |
| Native-vs-independent predicted orientation        | Shortest rotation angle ≤`1e-4rad`, using relative quaternion and `atan2`, not an unstable near-identity acos alone.                                                                                                                                                                                     |
| Actual target v/w versus independently planned v/w | Per-vector error ≤`5e-5 * max(1, norm(expected))`, m/s or rad/s respectively. Record absolute and relative errors separately.                                                                                                                                                                            |
| Locks                                              | Reject any requested locked component above `1e-6` m/s or rad/s before mutation; any accepted residue is explicitly zeroed and recorded. Actual immediate locked readback must be zero, with existing C12 measured tolerance ≤`1e-6`. Lead may choose exact-zero admission instead; freeze before tests. |
| Caps                                               | Compare against actual native cap with a conservative float32 arithmetic margin (candidate `8*FLT_EPSILON*max(1,cap)`). Reject a plan in/above the unsafe margin, do not clip it. Include just-below/at/above cases and retain native cap/fast-rotation flag.                                            |
| Desired arrival                                    | Report the analytic approximation/damping shortfall and measured error for each input; do not claim exact arrival. Freeze whether an additional user-facing maximum shortfall is required before declaring the public contract qualified.                                                                |

These numbers are proposals to be frozen before execution, not recovered historical thresholds. If baseline native behavior disagrees, retain the RED and resolve the formula/implementation/policy; do not enlarge a budget after seeing the error to obtain a PASS.

## 7. Safe-point transaction and diagnostics

Required order stays within the existing PhysicsSystem fixed tick:

1. Inspect scene changes and body assembly state without mutation.
2. Run the formal **per fixed tick** before-step hook, not a frame-level Director callback.
3. Merge copied commands for that tick by sequence; same-handle target is last-wins. Revalidate every affected owner/body/type/lock and all derived numeric plans.
4. Admit the whole tick's transform/control plan before starting native changes. Invalid later bodies must not leave earlier bodies moved. Allocate JS/wire result capacity before the apply region where possible.
5. Apply at the unlocked native safe point; call exactly one existing `b3World_Step(world, dt, solverSubSteps)`.
6. Copy native body/contact/sensor output immediately; update the adapter's own writeback epoch, then preserve the existing event/synchronization ordering. Later event callback commands belong to the next tick.

Preflight success is not a proof that arbitrary native allocation/trap failures can be rolled back. SetTransform may move broad-phase proxies and wake may migrate solver storage. Review required reservations; if a later native failure cannot be proven pre-mutation, invalidate current observations and fault rather than claim atomic rollback or retry the tick.

Keep phase diagnostics separate:

- A queue submission does not increment `nativeStepIndex` or pretend to read native target success.
- A committed pose/control write invalidates the current snapshot revision but does not increment the actual native step count.
- Known parameter/capability/ID/lock rejection before mutation may expose `mutationOutcome='not-mutated'`.
- A successful native write followed by readback/copy failure exposes `mutationOutcome='committed'` and invalidates current observations.
- A native throw/trap with unknown completion remains unknown; never infer phase solely from an error code. Existing disposed/reentrant outer guards also must not be advertised as universally annotated.
- If native step completed but snapshot copy failed, count the step once, retain `nativeCompleted=true`, set `snapshotAvailable=false`, and do not step again to “recover” the copy.
- Retained old snapshots remain byte-stable after mutation, next step, heap growth, body/shape destruction and slot reuse; they are not newly current snapshots.

The queue needs world/app generation plus full native body identity, not only a slot index. Pause/type/disable/teardown cancellation must not accidentally address a reused slot or cancel a persist body belonging to a different surviving scene owner.

AIR integration review adds these concrete constraints:

- `PhysicsSystem.step` directly invokes world.step (`physics-system.ts:462–463`), while `postUpdate` performs scene sync per tick and even on frames with no executable tick (`372–397`). Therefore world.step must ensure its own current pure synchronization preparation; syncSceneToPhysics must not consume a target merely because it was called.
- A before-step hook must collect/stage commands. If it immediately mutates force/native state and then throws, retrying would double-apply input. Freeze the staged transaction boundary and command admission before implementing the hook.
- Dispose must perform its target-owned zero-velocity action at the safe point **before** releasing control, or use a generation-checked cancellation that cannot clear later ordinary velocity input. No deferred old clear may overwrite a newly admitted velocity mode.
- Freeze same-tick teleport/target ordering by sequence: a proposed rule is that teleport cancels earlier pending target intent, while a later valid setTarget can define movement from the reset pose for that tick. The whole combined plan must be validated against the post-reset basis before committing either operation. This is not yet an implemented rule.

## 8. Contact, sensor, and geometry time

Teleport immediately changes native transform/AABB state; it does not make an immediate new contact/sensor event. Do not generate fake exit/enter pairs from Node movement or read an old native event array as a fresh event.

After a committed pose mutation:

- Invalidate facade/AIR **current** step snapshots and contact capabilities, while preserving the previously copied value.
- Fresh body transforms/debug draw may show the new pose. Their freshness does not certify contact geometry at that pose.
- New collision/sensor observations come from the next actual step. Sensor overlap is evaluated after solving; contact generation can be pre-solve, recycled, or retained while sleeping.
- Keep C21 generation origin/rotation/COM, revision and validity attached to their genuine cached geometry epoch. Never rewrite the epoch to teleport time, combine current COM with old anchors, or replace missing contact data with hit.point.
- Exercise both a large teleport out of the old fat AABB and a small move inside it. Exercise moved static geometry against an asleep dynamic body, awake dynamic/kinematic contacts, sensor enter/exit, and preserved-velocity CCD reset. An unrefreshed sleeping pair must be reported as such, not declared newly recomputed.

If correct static-pair refresh needs additional wake/proxy/contact invalidation, first retain the failing native fixture and design the narrow safe-point fix. Do not mutate original vendor bytes, blanket-wake every world as an unreviewed workaround, or expand geometry qualification to mesh/compound-native/heightfield without their own proof.

## 9. Node parent, signed scale, shear, and writeback

Core transforms contain only rigid origin/rotation. Scale is a shape/mass operation, not a value to pack into a quaternion or body pose wire.

Actual Node setters (`src/cocos/scene-graph/node.ts:493–525,2626–2712,2754+`) derive local position through the parent's inverse matrix, derive local rotation from parent rotation, and mark children dirty. `setParent` defaults `keepWorldTransform=false`. Parent motion can therefore change body world pose without a local child-property edit. A quaternion/worldScale pair alone does not prove that the full world matrix is shear-free.

Required synchronization plan:

1. Read the full world matrix and intended world origin/rotation before mutation. Detect nonfinite or degenerate basis and general shear using a frozen scale-relative orthogonality test; the existing initial test uses normalized dot tolerance `1e-6`, not a newly proven runtime tolerance.
2. Distinguish genuine external edits from the adapter's own physics writeback with its own epoch/last committed world pose. Do not clear `Node.hasChangedFlags`, suppress unrelated events, or write a render-interpolated pose into native state.
3. Static external pose edits need real safe-point origin synchronization. Dynamic edits must be recognized as a deliberate reset policy, not repeatedly uploaded every tick. Kinematic ordinary Node edits must not masquerade as continuous target motion; active-handle edits conflict. Exact non-handle Node-edit reset options need an integrator decision.
4. Validate both reparent modes and ancestor translation/rotation. Nonuniform parent scale plus child rotation can introduce shear even if each local transform is a valid TRS. Reject unsupported effective geometry before native mutation and define how the existing Node edit is restored or recovered without corrupting siblings.
5. A scale change prepares all affected same-body shapes and the new mass/COM/inertia before commit. Multi-collider updates must not partially replace geometry on validation failure. Preserve origin and the established world COM v/w convention during mass recomputation; do not shift Node to COM or promise momentum preservation.
6. Box dimensions use absolute scale; sphere radius uses the maximum absolute axis scale. Collider center follows the **signed full local-to-body transformation**. Mirrored asymmetric centers must not use absolute scale. Prove the decomposition against the actual matrix, including negative determinant cases; do not rely on a guessed worldScale sign convention.
7. Preserve material, sensor, filter, shape ownership and body references through replacement; stale old shape/contact IDs must reject. Current box half-extent minimum remains `0.001m`; do not enlarge arbitrary small dimensions to get a test through.

“Basic compound” here means several supported collider shapes on one body with aggregate mass/COM/inertia. It is not a claim that native compound assets, arbitrary hulls, mesh or heightfield gained support. Their future restrictions remain intact.

The AIR owner confirms that Node transform events are post-write and the existing dirty version is a frame version, not a mutation epoch (`node.ts:2000–2006` and the setter call order). A post-write listener alone cannot guarantee “reject and leave Node unchanged,” especially for parent transforms. A narrowly scoped pre-mutation guard or another proven transactional restoration mechanism needs separate integrator review and extracted-source provenance if Node changes are required. This document authorizes no Node change. Likewise, today's per-shape replacement calls are not a multi-shape atomic scale transaction.

## 10. Proposed narrow implementation boundary

Names below are **internal candidates for review**, not frozen public additions or existing exports:

```ts
type OriginPose = Readonly<{
    position: readonly [number, number, number];
    rotation: readonly [number, number, number, number];
}>;

// AIR guards public dynamic/kinematic teleport versus internal static scene sync.
setBodyOriginPose(world, body, pose: OriginPose,
    options: Readonly<{ preserveVelocity: boolean; wake: boolean }>): CopiedPoseState;

// Consumer-only, current fixed tick, enabled kinematic, no persistent native handle.
applyKinematicTarget(world, body, pose: OriginPose, fixedDt: number,
    solverSubSteps: number): CopiedTargetApplication;
```

The second result must distinguish the actual applied velocity from requested pose and from later observed arrival. Both return actual copied native state; neither returns a pointer or mutable HEAP view. AIR owns target lifetime/queue and conflict rules, while C repeats full-ID/world/lock/numeric/type checks. Static-specific handling and disabled policy must be explicit rather than ambiguous ignored options. Whole-tick planning may require a validated batch interface; two independently mutating scalar calls do not by themselves satisfy whole-batch rejection guarantees.

Add new exports/wires rather than silently stretching existing strides. Retain ABI1 if every old wire/meaning stays compatible, but regenerate schema, manifest, loader descriptor, runtime identity and static declarations together; reject stale/missing/forged schema combinations. The patch chain remains unchanged for bridge-only work. If private core behavior must change, require a separate strictly staged patch with base/before/after hashes and a new chain identity; original vendor remains untouched.

Expected later owned inputs include a transform bridge C/header, qualification C/JS, facade/declarations, export/schema/build/audit updates. Their exact new count and evidence inventory must be frozen with the assets-gate owner before any build, not guessed in this document. AIR Node/queue/public API work stays with its owner.

## 11. Required new execution and independent evidence

All rows below are **NOT RUN for T11**. Use new uniquely named outputs, retained input manifests, and real host Debug/Release plus fresh Node WASM Debug/Release. Retain original failures before fixes. Re-run all current ownership/body/filter/geometry/world qualification on the new identity; old l2 PASS is not reusable. Browser/G1 and historical ASan/LSan blockers remain separate.

| Requirement / test family           | Concrete fixture and independent checks                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C11-TELEPORT                        | Dynamic and kinematic, awake/asleep, default/each option combination, nonzero COM and rotated asymmetric body. Compare actual origin, COM, v/w, awake state, force accumulator policy and CCD basis. Exactly one reset, no hidden step. Static public rejection; explicitly decided disabled behavior.                                                                                     |
| C11-TARGET-CREATE                   | Wrong backend/type/world/module, uninitialized/stale body, duplicate handle, full-ID reuse. No native allocation or queue change on rejection.                                                                                                                                                                                                                                             |
| C11-TARGET-TICK-BASIC               | Same 600 fixed-tick target stream under 30/60/120Hz rendering with sufficient catch-up; last-command wins, actual dt, one step/tick, next empty tick zero v/w, no SetTransform transport. Include q/-q, 180-degree tie, substeps 1/2/4/8, damping, cap boundaries, locks, sleeping small target. Record requested and actual arrival without redefining tolerances after failure.          |
| C11-TARGET-LIFETIME-BASIC           | Clear retains ownership; dispose twice; disable/re-enable and type transition revoke; rejected command preserves earlier valid intent; teleport cancels pending intent but handle remains owned. Old generation never controls recycled body.                                                                                                                                              |
| C11-TARGET-TICK-EVENTS / APP / FULL | Preserve as later required subdivisions. Design queue now so event input affects next tick and pause/scene/persist ownership is representable; do not mark these later integration tests passed from low-level mocks.                                                                                                                                                                      |
| C01-TIME / C02 / C03                | Compare logical-tick state/event hashes, not render interpolation. `vx=1`, zero gravity, 60 fixed steps gives x≈1 within existing `1e-4` bound for substeps 1/4/8. Exercise 0.5s long frame, current accumulator retention and autosimulation behavior; no extra accumulator.                                                                                                              |
| C07 / C09                           | Independent two spheres radius .5 at offsets ±1, total mass 2: COM0, diagonal inertia .2/2.2/2.2. Add asymmetric offset/rotation and translate scene (10,2,3). Verify COM-relative world/local impulses and target COM motion without using native expected values.                                                                                                                        |
| C10 / C11 parent-scale              | Compare analytically transformed box corners and sphere centers/radii with native pose/debug geometry and Node matrix. Ancestor rotation/translation, both reparent modes, positive nonuniform and mirrored scale, signed collider center, shear and degenerate scale rejection/recovery. Verify old shapes cleaned and no next-tick reteleport from own writeback.                        |
| Locks / numeric negatives           | Rotated non-diagonal inertia and off-center target; six world-axis locks, preserved velocity, impossible target. NaN/Infinity/zero quaternion, extreme finite normalized quaternion, position/COM/AABB overflow, dt→0 in float32, reciprocal/substep overflow, strict bools, locked world, cross-world IDs. Compare before/after native state, copied snapshots, counters and queue state. |
| Contact and sensor timing           | Real sphere/floor and sphere/box contact, sensor enter/exit, sleeping pair, small fat-AABB-contained teleport and large teleport, actual post-step generation/recycle/CCD state. Keep every asserted geometry sample with basis and shape parameters for independent offline recomputation.                                                                                                |
| Ownership / failure phases          | At least 128 finite lifetime/reuse cycles, forced heap growth, repeated read, world destruction and two module/world isolation. Inject known precommit, post-native-copy and unknown native-call failures separately; verify mutationOutcome, snapshot invalidation, unchanged old copies and no repeated native step. Finite loops do not prove permanent ABA freedom.                    |

Independent oracle requirements:

- Do not generate expected geometry using debugDraw, the same facade conversion, or a round trip through native GetLocalPoint/GetWorldPoint. Those are useful observations, not independent proofs.
- Retain input local shape parameters, signed matrices, pre-call origin/COM/rotation, requested target, actual v/w, fixed dt/substeps and each sampled post-step pose. Recompute world sphere center/radius and box corners/finite faces with a separate scalar implementation.
- Compare contact points against the actual preserved generation basis and analytic finite geometry, not whichever pre/post COM gives the smallest error. Include edge/face domain checks and negative oracle controls.
- For free kinematic motion, retain the requested pose and independently integrate observed velocity using a separately implemented scalar recurrence, including actual damping/caps; also measure requested-to-observed arrival error. Reproducing native recurrence alone is not proof the public target arrived.
- Track native core bytes and bridge allocations separately; neither proves entire WASM heap or JS memory leak freedom. Preserve every raw sample that contributes to a maximum/error assertion.

## 12. Decisions before source checkpoint

1. Freeze target arrival/error policy under rotation, damping, speed caps and locks, including whether compensation is permitted. Preserve the original required scope.
2. Freeze tiny-target wake policy, disabled teleport admission, force/torque treatment, and direct Node-edit reset/rollback policy. Do not infer them from a void native API.
3. Freeze the per-fixed-tick before-step registration signature and whole-plan preflight/commit boundary with AIR. Specify counter exhaustion and recovery after rejected Node edits.
4. Freeze the new exact build inputs/evidence with staging/loader owners. Only then start a small source checkpoint and real serial builds.

Current T11 status remains **NOT IMPLEMENTED**. This review deliberately leaves unresolved semantics visible instead of promoting a partial wrapper into a completed transform contract.

## 13. Read-source identities

The following SHA-256 inventory identifies the read source snapshot used for this document. AIR files are under another worker's active ownership, so these hashes describe this review, not a request to freeze or overwrite that worker's files.

| Repository-relative source                         | SHA-256                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `ai/plans/box3d-v1.2-reference.md`                 | `17b4dcf0d8acbe0ed72f81ab4d3fc53c6a51f705d573699f0d50137e4bf00c46` |
| `docs/physics/box3d/contracts/api-contract.json`   | `0e53683159e025ecdf07ae495abcf54e902529b51c6938ce3717fab4dd6e7fc9` |
| `docs/physics/box3d/contracts/decisions.md`        | `36ab9d3f818ae8632f9f5be269cbd4bc739db088e6de7ed43dab39d5761f19a9` |
| `vendor/box3d/core/include/box3d/box3d.h`          | `3edb719e280ae09ff6fd225dbab6642ab7f5d68207aebd1a81a7d19827a22574` |
| `vendor/box3d/core/include/box3d/math_functions.h` | `c45f6e124eeca3cf6da4064aeb02492003e35d6597f151e69db9ad696aa1d2a1` |
| `vendor/box3d/core/include/box3d/constants.h`      | `a8a35f033995237520a3f0b6f5ea7a3102af219d2bce8b59895d4c4e32ab6a7b` |
| `vendor/box3d/core/src/body.c`                     | `7fef18daada158a278d99c742111671088fa625df310ea96255831c90bb8f40b` |
| `vendor/box3d/core/src/solver.c`                   | `de47e9af50e594e77b63cdea7c40c0e0236ff0ebdd9a8799f24f8dcfcd2042da` |
| `vendor/box3d/core/src/math_internal.h`            | `fdb736668ff4dd546a05eba465c957383e57f5e216decdf1ab6c6b59b41eeee1` |
| `vendor/box3d/core/src/math_functions.c`           | `082ffb9210244ee40390fcba9ce098a7846648f40a0db7dee5d360b97a693975` |
| `vendor/box3d/core/src/physics_world.c`            | `f96c0a3a11d3b9818ad81df8c44be26bf069a9f11335d7fbcbcbf0d45bcff454` |
| `vendor/box3d/core/src/contact.c`                  | `6d13719b6de73d8d2d2b5a7749fa1c4180480191b28afdd2e872aee6fedc9cbe` |
| `tools/physics/box3d/CMakeLists.txt`               | `528e96b93ad0d97c625eaf3e6d5f42a17e60f5195cf00dbed1e4bf409c52bc64` |
| `tools/physics/box3d/native/air_box3d.c`           | `28e6e26ff7d3dc3db3fa7a257510f96da90e04e1b677e8a84da23f0c3d145468` |
| `tools/physics/box3d/native/body_control.c`        | `9115c6e3fb89654042858e31819784c25c8e1ac3d09d3d7b7ad22f50789df0e9` |
| `tools/physics/box3d/native/geometry.c`            | `0dcb3f74fa2ee34fba5f716735cba2d83f07175db55d3e344d88e6fa55ab3825` |
| `tools/physics/box3d/patches/lock.json`            | `d6be04611f70223e21b1bcffc635088f49a5647739e97c2f9ce089091748ea77` |
| `src/air/physics/box3d/binding/facade.mjs`         | `fbf583f4aaf636e9c658bf9a0a9ca1b23efc755175cff102aa18f9342a0064e6` |
| `src/air/physics/box3d/binding/facade.d.mts`       | `44c8ec1a3808cf81772922d6f3af7787025cd61e5a9a1b037c33ce0142c5e262` |
| `src/air/physics/box3d/world-binding.ts`           | `aece3008837da8b55c77b969b2374c6a542b5debfa7cbffe5a8b2b41ffb78de0` |
| `src/air/physics/box3d/shared-body.ts`             | `b4e9665f0e688752de8689fcf992da95b50de45075a7e119161f2005995c3239` |
| `src/air/physics/box3d/world.ts`                   | `ec96866f6208ac987c1f0809b7259c526165df5ff8c5f081fd50ef54572beaee` |
| `src/air/physics/box3d/box-sphere-geometry.ts`     | `d492ee746f95ecb93466cbd1e96054280003e501e36408c6d7d65508fd1107c5` |
| `src/cocos/scene-graph/node.ts`                    | `385eabe981cf2c20c65211a488d03a702727e895029d3743193264cf9b500a2b` |
| `src/cocos/physics/framework/physics-system.ts`    | `e9bda693fa27efc373c4fe4cfdc9f5bc4a4a1d277ba0e8f43b6e28d165f58953` |
