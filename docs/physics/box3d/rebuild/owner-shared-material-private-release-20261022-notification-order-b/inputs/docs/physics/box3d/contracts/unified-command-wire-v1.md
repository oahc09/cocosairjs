# Unified command wire, version 1

Status: **FROZEN_SOURCE_CONTRACT_NOT_IMPLEMENTED**, 2026-10-22. This specifies an additive internal binding protocol; it does not add public APIs or authorize a build. Public queue/ownership rules are the integrator-frozen [unified-command-decisions-v1.md](unified-command-decisions-v1.md), SHA-256 `56303d162e12346729c66461c1fa9976e69c941fb549804c7a110d1887c695d6`, preserved in source checkpoint `7a32f800e8dd971ac0331921bc56b1cfa54e542d` with additive `unified-command-api-v1.json` / `.d.ts`. This references the frozen decision, not its earlier d9ac6474 draft. Source/arithmetic review is [unified-command-design-20261022.md](../rebuild/unified-command-design-20261022.md), SHA-256 `f58f3b3ec8a412125807f0fbd1c8d073720043cf5d11c4842f1f14086ce0dd1b`.

Core remains `efca0c184d40fd6a82016983f1601c4d23965867`; staged patch chain remains `434fb89494867f515051d5ac0dfc0c694556ba1f0da9ac3fc895a27097b1c7c7`. No vendor edit is proposed. ABI version remains 1, with a **new schema hash** binding facade/runtime/manifest. Existing export signatures and layouts, including motion 18 input words / 61 output floats, body snapshot 29 floats, body state 49 floats and all contact/event/geometry rows, remain unchanged. This entry must not accept an old motion row as a new command packet.

## 1. Exact native entry and constants

Add exactly one product export, `_air_b3_command_batch`, backed by:

```c
int air_b3_command_batch(uint32_t world,
    const uint32_t* input, int inputWords,
    uint32_t* output, int outputCapacityWords, int apply);
```

`world` is the existing stored uint32 world ID. Pointers are internal C/WASM transport only; the facade never exposes them. `apply` is exactly 0 (pure validation) or 1 (validate and commit). There is no persisted native plan, prepare token, implicit step, retry cache or size-query export.

Exact constants, frozen for this version:

| Constant                                | Value                                     |
| --------------------------------------- | ----------------------------------------- |
| `AIR_B3_COMMAND_WIRE_VERSION`           | 1                                         |
| `AIR_B3_COMMAND_INPUT_MAGIC`            | `0x314D4355` (little-endian bytes `UCM1`) |
| `AIR_B3_COMMAND_OUTPUT_MAGIC`           | `0x31524355` (little-endian bytes `UCR1`) |
| `AIR_B3_COMMAND_HEADER_WORDS`           | 12                                        |
| `AIR_B3_COMMAND_BODY_INPUT_WORDS`       | 4                                         |
| `AIR_B3_COMMAND_OPERATION_WORDS`        | 16                                        |
| `AIR_B3_COMMAND_BODY_RESULT_WORDS`      | 160                                       |
| `AIR_B3_COMMAND_OPERATION_RESULT_WORDS` | 80                                        |
| `AIR_B3_COMMAND_MAX_BODIES`             | 4096                                      |
| `AIR_B3_COMMAND_MAX_OPERATIONS`         | 16384                                     |
| `AIR_B3_COMMAND_MAX_INPUT_WORDS`        | 278540                                    |
| `AIR_B3_COMMAND_MAX_OUTPUT_WORDS`       | 1966092                                   |

Every word is 4 bytes, little-endian. `u32` fields contain integers; `f32` fields contain IEEE-754 binary32 bit patterns. Use `memcpy`/bit-safe conversion, not aliasing-unsafe C casts between integer and float objects. Reserved/unused fields must be the zero **bit pattern**. Used finite floating-point fields may contain negative zero.

For B bodies and O operations, input has exactly `12 + 4*B + 16*O` words; nonempty output requires `12 + 160*B + 80*O` words. Maximum transport sizes are 1,114,160 input bytes and 7,864,368 output bytes. These are bounded resource limits, not a restriction on physical position/force units. All multiplication/addition and pointer-end calculations are checked before use, including on wasm32.

## 2. Input packet

### Header, word offsets 0–11

| Word | Type | Meaning / exact admission                             |
| ---- | ---- | ----------------------------------------------------- |
| 0    | u32  | input magic                                           |
| 1    | u32  | wire version 1                                        |
| 2    | u32  | total words, equal to `inputWords` and derived length |
| 3    | u32  | B, at most 4096                                       |
| 4    | u32  | O, at most 16384                                      |
| 5    | u32  | body stride, exactly 4                                |
| 6    | u32  | operation stride, exactly 16                          |
| 7    | u32  | body section offset, exactly 12                       |
| 8    | u32  | operation section offset, exactly `12 + 4*B`          |
| 9    | f32  | positive fixed dt                                     |
| 10   | u32  | solver substeps, exactly 1, 2, 4 or 8                 |
| 11   | u32  | reserved 0                                            |

dt additionally uses m2 admission: `1/dt`, `2/dt`, `N/dt`, `h=dt/N` must be finite and h positive in actual float32 arithmetic. Admission does not multiply simulated time by N. The facade converts finite JS dt with fround before testing positivity.

### Distinct-body row, 4 words

| Offset | Type | Meaning                                                                                              |
| ------ | ---- | ---------------------------------------------------------------------------------------------------- |
| 0–1    | u32  | native body ID low/high via official Store/Load helpers                                              |
| 2      | f32  | managed requested total mass; finite positive, or exactly 0 for the existing internal unmanaged mode |
| 3      | u32  | reserved 0                                                                                           |

IDs are full-generation and must belong to the supplied world. Duplicate IDs reject; each table row must be referenced by at least one operation. Table order is first appearance in the canonical operation stream. The facade supplies mass from its private ownership record, never from public command data. Zero is the existing unmanaged admission convention, not a claim that a geometry-free dynamic body is ready to simulate. Native checks managed mass readiness before commit; AIR/facade must separately preflight **all world bodies** and step counters before a tick commit, not only this participant table.

### Operation row, 16 words

| Offset | Type    | Meaning                                                       |
| ------ | ------- | ------------------------------------------------------------- |
| 0      | u32     | body table index in `[0,B)`                                   |
| 1      | u32     | opcode 1–10 below                                             |
| 2      | u32     | opcode-specific flag bits below                               |
| 3–4    | u32     | sequence low/high; integer transport, never packed in float32 |
| 5–15   | f32/u32 | opcode payload; unused words are zero bits                    |

User sequence is an integer in `[1, 2^53-1]`, with high word at most `0x1fffff`. User sequences strictly increase in packet order; gaps are legal, duplicates or reversal reject. Packet order is the execution order. The native entry does not remember earlier packets: de-duplication/consumption belongs to the AIR owner. A second intentional raw call is not automatically idempotent.

Internal scene reset, idle-zero and protected cleanup-zero have sequence **0**, explicitly distinguished by flags. They do not allocate a user sequence, so exhausted user sequencing cannot obstruct cancellation or safety cleanup. Their packet index plus world/body/owner generation supplies internal receipt identity; zero is not a public submission ID. Internal flags are not public authority: only the private adapter can create those commands. The raw C API cannot authenticate a JavaScript target-handle lease and must not pretend otherwise.

### Opcodes, flags and payload

Flags: `LOCAL=1`, `PRESERVE_VELOCITY=2`, `WAKE=4`, `SCENE=8`, `IDLE_ZERO=16`, `CLEANUP_ZERO=32`. Every unlisted flag combination rejects.

| Opcode / name       | Allowed flags                                          | Used payload words                               | Body admission                                                              |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------- |
| 1 `FORCE`           | 0 or LOCAL                                             | 5–7 vector; 8–10 COM offset; 11–15 zero          | enabled dynamic                                                             |
| 2 `TORQUE`          | 0 or LOCAL                                             | 5–7 vector; 8–15 zero                            | enabled dynamic                                                             |
| 3 `LINEAR_IMPULSE`  | 0 or LOCAL                                             | 5–7 vector; 8–10 COM offset; 11–15 zero          | enabled dynamic                                                             |
| 4 `ANGULAR_IMPULSE` | 0 or LOCAL                                             | 5–7 vector; 8–15 zero                            | enabled dynamic                                                             |
| 5 `CLEAR_FORCES`    | 0                                                      | 5–15 zero                                        | any valid body; clear actual F/T without wake                               |
| 6 `CLEAR_VELOCITY`  | 0                                                      | 5–15 zero                                        | any valid body; clear actual v/w if state exists, without wake              |
| 7 `CLEAR_STATE`     | 0                                                      | 5–15 zero                                        | any valid body; both real clears, without wake                              |
| 8 `RESET`           | any subset of PRESERVE_VELOCITY/WAKE, optionally SCENE | 5–7 origin xyz; 8–11 quaternion xyzw; 12–15 zero | without SCENE: dynamic/kinematic, disabled allowed; with SCENE: static only |
| 9 `TARGET`          | 0                                                      | 5–7 origin xyz; 8–11 quaternion xyzw; 12–15 zero | enabled kinematic                                                           |
| 10 `PAIRED_CLEAR`   | 0, IDLE_ZERO or CLEANUP_ZERO, mutually exclusive       | 5–15 zero                                        | enabled kinematic                                                           |

RESET without SCENE uses a positive user sequence. RESET with SCENE requires sequence 0. PAIRED_CLEAR with flags 0 is user target clear and needs a positive sequence; IDLE_ZERO/CLEANUP_ZERO require sequence 0. All other opcodes require positive user sequences. Target disposal of an already disabled/retyped/destroyed body is settled by the separately checked lifecycle path; this opcode must not return a fake successful kinematic clear for such a body.

The wire has no set-velocity, geometry, mass/type/lock mutation, producer registration, cancellation or step opcode. Those cannot be smuggled through reserved bits. Public cancellation changes the private queue before packing, not native state.

### Canonical stream, after AIR target reduction

The original accepted user log remains in AIR until commit/cancellation. This packet contains its reduced execution view, not discarded targets. All retained physical effects/resets/ordinary clears keep their original order. Native rejects a noncanonical packet rather than performing hidden target reduction:

- At most one of TARGET or PAIRED_CLEAR per body; it must follow every RESET/CLEAR_VELOCITY/CLEAR_STATE for that body. Thus earlier target replaced/cancelled by a later reset/clear must already be absent.
- TARGET may be followed by CLEAR_FORCES. FORCE/impulse with TARGET cannot pass the immutable body-type checks.
- IDLE_ZERO cannot coexist on its body with RESET, TARGET, another PAIRED_CLEAR, CLEAR_VELOCITY or CLEAR_STATE. CLEAR_FORCES alone is compatible with idle-zero.
- CLEANUP_ZERO must be the final operation for its body; no TARGET may coexist. Earlier retained reset/ordinary clears are allowed, but cannot overwrite protected zero afterward.
- Multiple resets and ordinary clears/effects remain allowed. No sorting by opcode, reassociation of sums or summation of impulses.
- B=0 iff O=0. Empty packet still has a valid 12-word header/dt/substeps. Nonempty packets may not carry unused body rows.

Teleport preserveVelocity=true therefore reaches RESET without an added idle-zero for that tick. A subsequent empty-intent tick emits IDLE_ZERO. An earlier never-committed target is not a velocity value that RESET can preserve.

## 3. Exact output packet

Output exists only on nonempty successful apply. Validate-only requires `output=NULL, outputCapacityWords=0` and never writes output. Empty apply also requires NULL/0 and returns OK without output or snapshot invalidation. For nonempty apply, capacity may exceed the exact derived length but must not exceed MAX_OUTPUT_WORDS; only the required words are written, and tail canaries remain unchanged.

### Output header, 12 words

| Word  | Type | Meaning                                                             |
| ----- | ---- | ------------------------------------------------------------------- |
| 0–1   | u32  | output magic, version 1                                             |
| 2     | u32  | exact written words `12 + 160*B + 80*O`                             |
| 3–4   | u32  | B, O                                                                |
| 5–6   | u32  | body-result stride 160, operation-result stride 80                  |
| 7     | u32  | body-results offset 12                                              |
| 8     | u32  | operation-results offset `12 + 160*B`                               |
| 9     | u32  | command commit completed, exactly 1; **not** a completed world step |
| 10–11 | u32  | reserved 0                                                          |

### Body result row, 160 words

Pose10 means origin xyz, rotation xyzw, world COM xyz. State49 means exactly the existing additive body-state field order; embedding it here does not change the old getter stride.

| Offset  | Type | Meaning                                                                  |
| ------- | ---- | ------------------------------------------------------------------------ |
| 0–1     | u32  | full body ID low/high                                                    |
| 2       | u32  | executed operation count for this body                                   |
| 3       | u32  | reserved 0                                                               |
| 4–13    | f32  | actual before Pose10                                                     |
| 14–62   | f32  | actual before State49                                                    |
| 63–72   | f32  | shadow final Pose10, **prediction**, not reached target pose             |
| 73–75   | f32  | shadow final linear velocity                                             |
| 76–78   | f32  | shadow final angular velocity                                            |
| 79–81   | f32  | shadow final force                                                       |
| 82–84   | f32  | shadow final torque                                                      |
| 85–94   | f32  | actual after-commit Pose10                                               |
| 95–143  | f32  | actual after-commit State49                                              |
| 144–152 | f32  | shadow final world inverse inertia, column-major cx/cy/cz                |
| 153     | f32  | actual inverse mass used by the planner; no mass opcode changes it       |
| 154     | f32  | copied body table requested mass                                         |
| 155     | f32  | actual world maximum linear speed                                        |
| 156     | f32  | `B3_MAX_ROTATION/dt`, or +0 when fast rotation is allowed                |
| 157     | u32  | actual fast-rotation flag, 0/1                                           |
| 158–159 | u32  | sequence of the body's last operation; 0/0 for a last internal operation |

State49 relative offsets: 0 type (static=0, kinematic=1, dynamic=2); 1 enabled; 2 awake; 3 sleeping; 4 sleepy; 5 sleep enabled; 6 bullet; 7 sleepTime; 8 sleepVelocity; 9 sleepThreshold; 10–11 damping; 12 gravityScale; 13–15 v; 16–18 w; 19–21 F; 22–24 T; 25–27 linear factors; 28–30 angular factors; 31 actual mass; 32–34 local COM; 35–43 local inertia columns; 44–46 world COM; 47 massPending; 48 sensorMassFallback. Existing scalar booleans in this embedded float block remain exact 0/1 floats.

### Operation result row, 80 words

One row per executed packet operation, same order. Cancelled/superseded AIR entries have no native row and must be kept separately in the AIR receipt. Input payload plus output source labels distinguish requests, predictions and observations.

| Offset | Type | Meaning                                                                                                |
| ------ | ---- | ------------------------------------------------------------------------------------------------------ |
| 0–4    | u32  | copied body index, opcode, flags, sequence low/high                                                    |
| 5      | u32  | planner action bits defined below                                                                      |
| 6–7    | u32  | reserved 0                                                                                             |
| 8–17   | f32  | shadow pre-operation Pose10                                                                            |
| 18–20  | f32  | converted world vector for opcodes 1–4, otherwise zero                                                 |
| 21–23  | f32  | computed absolute native application point for 1/3, otherwise zero                                     |
| 24–26  | f32  | rounded `point - shadowCOM` for 1/3, otherwise zero                                                    |
| 27–29  | f32  | world torque/angular impulse: lever-arm cross vector for 1/3; converted vector for 2/4; otherwise zero |
| 30–32  | f32  | shadow post-operation v                                                                                |
| 33–35  | f32  | shadow post-operation w                                                                                |
| 36–38  | f32  | shadow post-operation F                                                                                |
| 39–41  | f32  | shadow post-operation T                                                                                |
| 42–44  | f32  | target/reset admitted linear lock residue, otherwise zero                                              |
| 45–47  | f32  | target/reset admitted angular lock residue, otherwise zero                                             |
| 48–50  | f32  | actual immediate post-operation v                                                                      |
| 51–53  | f32  | actual immediate post-operation w                                                                      |
| 54–56  | f32  | actual immediate post-operation F                                                                      |
| 57–59  | f32  | actual immediate post-operation T                                                                      |
| 60–61  | u32  | actual immediate awake/enabled, each 0/1                                                               |
| 62–63  | u32  | reserved 0                                                                                             |
| 64–73  | f32  | actual immediate post-operation Pose10                                                                 |
| 74–79  | u32  | reserved 0                                                                                             |

Planner action bits in word 5: bit 0 (`1`) means the core linear-impulse speed-clamp branch is selected; bit 1 (`2`) means a native wake request is scheduled; bit 2 (`4`) means six-axis immediate impulse velocity masking is scheduled; bit 3 (`8`) means TARGET plans an exactly stationary paired zero; bit 4 (`16`) means actual SetTransform reset is scheduled. No other bits. These are planned actions, **not** assertions that a sleeping island changed state. Ordinary zero force/impulse still requests wake exactly as the current bridge does; the continuous producer omits its own zero contributions before packing.

Wake of one body can wake other bodies in its solver set. The final actual before/after flags and immediate operation observations report that reality; the planner must not fabricate an exact final sleep-state prediction for untouched peers. Bodies outside this packet can also wake through their island. No claim of isolated sleep mutation follows from a distinct-body table.

## 4. Pure planning and exact arithmetic order

Before mutation, validate every input row, wire region, identity, world lock, body type/enabled state, managed mass readiness, canonical order, allocation and derived calculation. For each body retain value copies of origin/q/COM, local and world inverse inertia, inverse mass, v/w/F/T, locks, damping, extents and cap flags. Apply and validate use the same planner; apply always replans from live native state. A validation PASS cannot be retained as a capability across later writes.

All vector/matrix arithmetic uses the fixed core's scalar float32 helper operation order under existing strict build flags. No reassociation, fast-math, double-precision accumulated sum, clamp reordering or reassociation of repeated impulses. Quaternion input normalization alone retains m2's scaled-double normalization followed by float32/native-unit validation.

1. **RESET:** normalize copied quaternion and validate world transform, derived COM, rotated inverse inertia, shape fat AABB/inflation using m2 checks. Update shadow origin/q; compute COM and inverse inertia as core `body.c:1155–1160` does. Preserve existing world F/T. Clear v/w unless PRESERVE; then run m2 lock-conflict/residue checks on paired v/w. Wake is requested only with WAKE on an enabled nonstatic body. Disabled reset stores real pose without enabling/waking. Static requires SCENE.
2. **TARGET:** derive target COM from local COM and target pose; use `invDt*(targetCOM-currentShadowCOM)`. Choose target quaternion hemisphere by dot, form quaternion component difference, multiply by current conjugate, scale vector by `2*invDt`. Check actual m2 damping/dt, step-delta and rotation intermediates. Before residue projection, reject nonzero target velocity at the native cap minus `8*FLT_EPSILON*max(1,cap)`; exact zero remains admissible even for tiny positive caps. Locked component magnitude >1e-6 rejects, admitted residue projects to zero and is recorded. A nonzero final target explicitly wakes and calls the real core target API; stationary target clears paired velocity without unnecessary wake. Shadow **pose remains current**, because setting target only writes velocities.
3. **FORCE / LINEAR_IMPULSE:** if LOCAL, rotate vector and offset by shadow q in that order. Compute absolute point `C + offset`, then the actual rounded difference `point - C`, then cross with world vector. Check each intermediate. No body-origin translation or Node scale on the offset; do not replace the rounded difference by the original requested offset.
4. **FORCE:** perform `F = b3Add(F,vector)`, then `T = b3Add(T,cross)`; check both sums before admitting the operation. Force and torque remain unmasked. **TORQUE:** rotate local vector if needed, then checked `T = b3Add(T,vector)`. Both use native wake=true.
5. **LINEAR_IMPULSE:** compute `v = b3MulAdd(v,invMass,J)` and finite length squared. If its length squared exceeds `maxLinearSpeed*maxLinearSpeed`, use exact `b3MulSV(maxLinearSpeed,b3Normalize(v))`; record the selected branch. Compute world angular delta `b3MulMV(IworldInverse,leverCrossJ)`, then `w = b3Add(w,delta)` with checked intermediates. Finally mask all six locked velocity components to zero, before planning the next command. Do not move the mask ahead of the core clamp.
6. **ANGULAR_IMPULSE:** rotate local input into world if LOCAL, then reproduce the core's separate `b3InvRotateVector(q,Jworld)`, `b3MulMV(IlocalInverse,localJ)`, `b3RotateVector(q,deltaLocal)`, `b3Add(w,deltaWorld)` operations. Check each; then apply the same immediate six-axis masks. The two local/world rotations cannot be algebraically cancelled. There is no immediate angular cap in this core API.
7. **CLEAR_FORCES / CLEAR_VELOCITY / CLEAR_STATE:** zero F/T, v/w, or both respectively, without wake. Static/sleeping/disabled bodies may lack a velocity state; actual getters report zero, and no state is created solely to clear it. **PAIRED_CLEAR:** enabled kinematic only, both v/w zero without wake; reasons remain distinct via flags.

Use actual cap value and validate finite positive linear cap and safe cap arithmetic where required, as m2 already does. Ordinary impulse clamping is not converted into target-style cap rejection. Finite command arithmetic does not certify all subsequent contact/gyro/CCD solver intermediates; no extra step or hidden simulation is run by this entry.

### Commit and output collection

Allocate all plan/result scratch using tracked bridge temporary ownership before commit. Known preflight exits free it. No persistent plan or pointer escapes. Commit replays the planned core operations in packet order; private writes are limited to the already reviewed actual clears, velocity preservation and axis masks. Do not call the old per-command exported mutators in a recoverable-status loop after first mutation.

Core wake temporarily locks the world (`body.c:352–358`) and can relocate solver-set storage. Keep core unlocked at API entry, use ST/exclusive owner admission, and reacquire body/sim/state after every operation before observing or operating on them. No JavaScript callback runs between final admission and commit.

After each operation, capture actual v/w/F/T/pose/enabled/awake into already allocated internal result storage; after all operations capture final bodies. State49 capture must be nonallocating and not introduce a recoverable post-commit status branch: precomputed massPending/fallback metadata can be reused because no opcode changes geometry/mass/type. An unexpected actual nonfinite result is preserved in the committed output and rejected by the facade as a post-commit readback error, not returned as native ARGUMENT. A trap yields unknown completion.

Write caller output only after successful replay/observation. This guarantees unchanged output on every documented nonzero preflight return, not on arbitrary traps after commit starts. No command commit changes nativeStepIndex; the owner invokes the existing world step separately and exactly once when ready.

## 5. Region, status and phase rules

Input pointer must be nonnull, four-byte aligned, nonwrapping, and cover exactly the declared inputWords. For wasm32 both regions must lie within current heap size. For host C, the caller must supply valid allocated regions; address arithmetic/alignment checks cannot prove arbitrary host pointers readable. Input and output **declared capacity regions** must not overlap. Exact bounds are checked before reading payloads or allocating plans. Signed negative lengths reject as ARGUMENT; nonnegative inputWords below 12 or above MAX_INPUT_WORDS reject as CAPACITY before header reads.

Validation order is stable: valid/unlocked world; mode and signed lengths; inputWords limits; readable declared input region; magic/version/header total equal to inputWords; count bounds; strides/section offsets/reserved words; derived total length; dt/substeps; output mode/capacity/region/nonoverlap; body rows; operation rows/canonical order; scratch allocation; whole ordered arithmetic plan; commit if requested. Header total not equal to inputWords is ARGUMENT; a declared input length not equal to the length derived from admitted counts is CAPACITY. Count bounds precede offset calculations. Use the first error in that order; within tables use ascending row order. Allocator failure can therefore precede a derived-arithmetic failure, but cannot precede structural/identity checks. No error output pointer is added in v1; native return code plus retained command packet is the raw evidence.

No new numeric status is needed. Existing ABI1 values retain their meanings:

| Status                  | Meaning in this entry                                                                                                              | Facade code                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 0                       | pure validation success, empty apply success, or completed nonempty command commit, distinguished by mode/count                    | no error                                          |
| 1 INVALID               | bad world/full body generation/foreign world                                                                                       | `AIR_E_BOX3D_NATIVE`, with numeric nativeStatus 1 |
| 2 ARGUMENT              | invalid mode/header/stride/flags/payload/dt/sequence/order/duplicate/unused body/alignment/region; unsafe derived float arithmetic | `AIR_E_BOX3D_NATIVE`, nativeStatus 2              |
| 4 CAPACITY              | count/length exceeds fixed bounds, exact input length inconsistent with count, or nonempty output capacity insufficient            | `AIR_E_BOX3D_CAPACITY`, nativeStatus 4            |
| 5 ALLOCATION            | tracked plan/result allocation failed before commit                                                                                | `AIR_E_BOX3D_NATIVE`, nativeStatus 5              |
| 8 UNSUPPORTED           | valid object but unsupported body state/type/shape for this operation                                                              | `AIR_E_BOX3D_UNSUPPORTED`, nativeStatus 8         |
| 9 LOCKED                | valid native world is locked                                                                                                       | `AIR_E_BOX3D_LOCKED`, nativeStatus 9              |
| 10 MASS_PENDING         | managed enabled dynamic participant has no effective geometry                                                                      | `AIR_E_BOX3D_MASS_PENDING`, nativeStatus 10       |
| 11 MOTION_LOCK_CONFLICT | m2 reset/target velocity conflicts with lock                                                                                       | `AIR_E_BOX3D_CONFIG`, nativeStatus 11             |
| 12 MOTION_SPEED_CAP     | m2 nonzero target exceeds reviewed cap admission                                                                                   | `AIR_E_BOX3D_CONFIG`, nativeStatus 12             |

Statuses 3/6/7 remain defined for old exports but are not returned by this entry. Native symbols are not renamed. Specializing 4/8 into CAPACITY/UNSUPPORTED applies only to this new facade entry; it does not change old exports' generic nativeStatus behavior. The new facade operation annotates returned native status as readonly `nativeStatus`; this is diagnostic, not mutation-phase evidence. JS-side copying/ownership/range failures retain their established ARGUMENT/CAPACITY/DISPOSED/ABI codes and are explicitly identified as JS admission rather than a native status. Unknown numeric status is a protocol failure, not proof of no mutation.

Only the listed documented nonzero statuses from this reviewed entry establish `mutationOutcome='not-mutated'`, because every one occurs before commit/output writes. Do not reuse the existing generic assumption that **any** nonzero number proves no mutation. Nonempty apply status 0 establishes `'committed'` before copy; copy/header/finite/readback inconsistency then faults without replay. Apply export throw or unexpected status leaves outcome unknown, invalidates current observations and faults. Pure validation/empty-apply delivery throw does not itself establish a physics mutation or justify snapshot invalidation. Outer disposed/reentrant errors remain conservatively unannotated unless their exact pre-call phase is established.

## 6. Facade result and implementation handoff

New internal facade signatures are exactly:

```ts
validateCommandBatch(world: Box3DWorld, commands: readonly Box3DCommand[], dt: number, substeps: number): void;
applyCommandBatch(world: Box3DWorld, commands: readonly Box3DCommand[], dt: number, substeps: number): Box3DCommandBatchResult;
```

`Box3DCommand` is a discriminated internal union with owned `body`, safe-integer `sequence`, and kinds `force`, `torque`, `linearImpulse`, `angularImpulse`, `clearForces`, `clearVelocity`, `clearState`, `reset`, `target`, `pairedClear`. Vector operations use copied `value`, optional `offset` (only force/linearImpulse), and `space` default world. Reset uses m2 copied pose, mode teleport/scene, preserveVelocity=false and wake=true defaults. Target uses copied pose. PairedClear uses `reason: 'user' | 'idle' | 'cleanup'`. Internal sequence-zero rules above apply; public apps cannot manufacture internal capabilities. No target reduction is performed by this facade: it validates the canonical stream produced by AIR and native revalidates it.

Result is deeply frozen `{ bodies, operations, executedOperationCount }`. Body entries expose owned body token, `before:{pose,worldCenter,state}`, `plan:{pose,worldCenter,linearVelocity,angularVelocity,force,torque,inverseInertiaWorld,inverseMass,requestedMass,maximumLinearSpeed,maximumAngularSpeed,allowFastRotation}`, `actual:{pose,worldCenter,state}`, `executedOperationCount`, `lastSequence`. `maximumAngularSpeed` is null only for fast rotation. Operation entries expose the owned body token, kind/flags/sequence, planner action bits, `plan:{basisPose,basisWorldCenter,worldVector,applicationPoint,actualOffset,angularEffect,linearVelocity,angularVelocity,force,torque,linearLockResidue,angularLockResidue}`, and `actual:{pose,worldCenter,linearVelocity,angularVelocity,force,torque,awake,enabled}`. Here `actualOffset` is explicitly the planner's rounded point difference, not a separately sampled native geometry measurement. Empty result has empty arrays/count zero and leaves observations current.

Fresh views are acquired after any allocation/heap growth; arrays are copied immediately, not retained as HEAP views. The facade validates returned header/count/IDs/sequences/enum fields/reserved zeros and finite floats before exposing results. A failure after commit is committed even if zero result entries were delivered. Before/plan/actual fields must never be interchanged to manufacture agreement.

Integrator source review accepted this exact wire on 2026-10-22; no numeric layout/opcode/limit choice remains intentionally unspecified. The adjacent freeze receipt identifies the exact bytes. **The future implementation source inventory, compile-unit/evidence counts and schema hash are not known yet and must be separately frozen before compiling.** Native/C qualification must cover layout/canaries/capacity/region/malformed order and all float transitions; fresh WASM qualification must additionally cover facade identity/mutation phases/growth/immutable copied receipts and whole-stream no-mutation rejection. Existing m2 regressions must run anew. This design changes no product input, index or owned inventory and claims no runtime PASS.
