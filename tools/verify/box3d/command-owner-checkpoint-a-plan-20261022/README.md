# Checkpoint A: private World ownership and fence framework

Status: **READ-ONLY PROPOSAL; NOT PRODUCT IMPLEMENTATION**, 2026-10-22. This supplements, and does not overwrite, `command-queue-admission-handoff-20261022-b/world-integration-plan.md`. No product file, frozen contract, native input, or old evidence was changed. No build or physical test was run.

## 1. Admission supplement compatibility review

Reviewed `docs/physics/box3d/contracts/unified-admission-fence-v1.md`, SHA-256 `643ba65c50dcb05acb13c89d46455ac613cb8a92ce777e796db7e0b5d3cb2c91`.

There is **no semantic conflict** with the current queue or guard primitives:

- Queue `withSubmissionAdmission` holds its private read barrier across the reader and all returned body/command getters, preserves the first error by identity including falsy values, and locks collection failure. The owner can acquire a fence as the reader's first action and release it after the whole call, not after the reader returns.
- Mutation guard registration copies identities/rejection text and supports independent leases on one object. `Node.prototype` is a valid identity for the explicitly broadened ready-admission category restriction. Acquire from internal plain arrays and fixed descriptions, never caller iterators.
- Existing Node transform guards support nested grants from distinct covering leases and consume all matching permits before listeners. They do **not** yet expose pure grant-capacity preflight. Persistent-target activation therefore remains blocked exactly as the supplement says.
- Queue diagnostics are safe observations during admission. Actual native reads need a separate owner read admission; current `World.assertReady` alone cannot express it.
- No primitive currently installs these World leases. The supplement's current-schema WASM and engine-entry obligations remain unqualified.

Two important distinctions remain: a caught non-command configuration refusal alone does not latch a candidate; the same refusal thrown while admitting a command does latch it. Also, a refusal consumes no new command sequence, but previously accepted provisional submissions may leave legal sequence gaps when the candidate is discarded.

## 2. Exact proposed seven-file boundary

All paths in this section are relative to `src/air/physics/box3d/`.

1. **New `world-command-owner.ts`:** private identity registry, one private Queue, phase admissions, copied fence snapshots, temporary scope cleanup, and scalar-only diagnostics. No binding execution, global lookup, public helper, target producer, or native capability on returned diagnostics.
2. **`world.ts`:** construct the owner with actual System/generation; adopt successful SharedBodies; retain actual default-material identity separately from copied coefficients; route current config/read/step/cleanup paths through owner admissions; hold temporary leases through actual existing step/writeback. Preserve the existing one-native-step behavior. Do not yet invoke `applyCommandBatch` or collect user producers.
3. **`shared-body.ts`:** emit successful body adoption/retirement and actual component attachment notifications; provide private closure-only native identity/state access to the owner; expose already-copied scene ancestry to the owner without rereading public getters. Split `assertCommittedRead` from configuration admission. Keep native mutation-outcome handling and faulted cleanup.
4. **`registration.ts`:** inject the actual System identity through a trusted internal factory environment; preserve closure-owned World resolution. No feature activation. Missing required identity context rejects before selector mutation/native allocation rather than creating an unfenced owner.
5. **`rigid-body.ts`:** associate the real component with its adapter/shared body, finalize initialized/enabled metadata only after actual successful operations, and notify actual teardown. Keep ordinary force/impulse/clear behavior immediate in checkpoint A; there is no successful staged path yet.
6. **`box-sphere-shape.ts`:** associate the actual Collider, raw material identity and active geometry status; retain disabled Colliders/materials in ownership; assert configuration before candidate reads even on inactive paths. Record actual lifecycle success separately from adapter existence.
7. **`world-writeback.ts`:** allow a private exact-write authority supplied by the World scope. Keep existing immutable origin capture, parent-first order, expected local/world checks and final batch verification. Standalone internal callers may retain the current self-owned temporary guard fallback; the real owner path supplies its already-active union lease and must not register an uncomposed second lease.

These seven files can safely establish the framework and preserve current behavior. They cannot alone close material-clone identity notification, all upstream early-read guards, immediate System pause notification, or persistent counter preflight. Those are activation prerequisites, not permission to silently narrow the contract.

## 3. Proposed exact internal signatures

These are design declarations, not runtime API or package exports. A logical key is an empty frozen JS object whose ownership is established only by private registry membership, not by a cast or a visible brand.

```ts
type LogicalBodyKey = object;
type ComponentKind = 'rigid-body' | 'collider';
type OwnerPhase =
    | 'idle' | 'admission' | 'collecting' | 'validating'
    | 'committing' | 'solving' | 'writeback' | 'dispatch'
    | 'closing' | 'faulted' | 'closed';

interface Box3DWorldOwnerEnvironment {
    // Trusted integration closure, captured once; not caller-provided app config.
    // Called during original World construction, not during command admission.
    readonly physicsSystem: () => PhysicsSystem;
}

function createBox3DWorldAdapter(
    selector: IPhysicsSelector,
    components: Box3DComponentConfiguration | undefined,
    qualification: Box3DWritebackQualification | undefined,
    ownerEnvironment: Box3DWorldOwnerEnvironment,
): Box3DWorldAdapter;

interface OwnedBodySeed {
    readonly node: Node;
    readonly ancestry: readonly Node[]; // Copied from existing raw scene baseline.
    readonly preflight: () => void;
    readonly readCommitted: () => Readonly<Box3DBodyState>;
    readonly resolveNative: () => Box3DId;
}

interface OwnedComponentSeed {
    readonly adapter: object;
    readonly component: RigidBody | Collider;
    readonly kind: ComponentKind;
    readonly material: PhysicsMaterial | null;
}

interface OwnerFenceScope {
    // Internal closure capability, never supplied to application callbacks.
    advance(next: 'validating' | 'committing' | 'solving' | 'writeback'): void;
    write(
        node: Node,
        operation: 'setWorldPosition' | 'setWorldRotation',
        expected: readonly number[],
        perform: () => void,
    ): void;
    dispose(): void;
}

class Box3DWorldCommandOwner {
    constructor(generation: number, system: PhysicsSystem);
    adoptBody(seed: OwnedBodySeed): LogicalBodyKey;
    attachComponent(body: LogicalBodyKey, seed: OwnedComponentSeed): void;
    completeComponent(adapter: object, enabled: boolean): void;
    commitComponentEnabled(adapter: object, enabled: boolean): void;
    commitColliderMaterialIdentity(adapter: object, material: PhysicsMaterial | null): void;
    commitDefaultMaterialIdentity(material: PhysicsMaterial): void;
    releaseComponentAfterCleanup(adapter: object): void;
    retireBodyAfterDestroy(body: LogicalBodyKey): void;

    assertCommittedRead(operation: string): void;
    assertConfiguration(operation: string, allowPaused: boolean): void;
    beginStep(): OwnerFenceScope;
    beginDispatch(): OwnerFenceScope;
    fault(error: unknown): void;
    closeAfterWorldTeardown(): void;
    diagnostics(): Readonly<{
        phase: OwnerPhase;
        paused: boolean;
        bodies: number;
        components: number;
        materials: number;
        activeTemporaryScopes: number;
        stagedCommandsSupported: false; // Checkpoint A only.
    }>;
}

interface Box3DExactWriteAuthority {
    write: OwnerFenceScope['write'];
}
function writebackSceneBatch(
    bodies: readonly Box3DWritebackBody[],
    assertWorldOwners: () => void,
    authority?: Box3DExactWriteAuthority,
): void;
```

The fourth factory argument is an **explicit internal signature change**, preserving the first three argument positions. Old fixtures must not be silently promoted: new fixtures supply the actual System identity; omission rejects. Existing saved fixture sources/evidence remain untouched. This parameter is not added to AIR app options or package exports. The actual Cocos construction path assigns `_instance` before `constructDefaultWorld` (`physics-system.ts:929–935`), so the trusted factory closure can return the real System without constructing another System or scene. The binding to `system.physicsWorld` becomes checkable after original construction completes, before command activation.

`OwnedBodySeed.resolveNative` is passed through an owner callback invoked inside the SharedBody constructor after successful allocation; it is stored only in the owner's private map. Do not add a SharedBody token getter or place this callback on `impl`. The independent wire mapper can later receive a one-call resolver closure during an owned validating phase. It never receives the map or lifetime authority.

Scopes use private object identity and one-shot closure state, not a publicly writable numeric phase. `advance` validates ownership, the exact allowed transition, and that the scope is current. A stale/foreign scope cannot release another scope. Empty-body Worlds still fence System and `Node.prototype`; skip only the empty transform registry call, whose existing primitive rejects empty registration.

The signatures for material identity commits are intentionally not claims that all call sites are available within seven files; see section 6. During A they can capture initial identities and known normal paths, but activation remains blocked until clone/cache/listener transitions are fully covered.

## 4. Identity maintenance and actual lifecycle

| Event                             | Identity update and ordering                                                                                                                                                                                            | What must not be inferred                                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| World constructor                 | Create owner with copied generation and real System; native World remains owned by preparation. No temporary leases survive construction.                                                                               | A constructor-shaped mock is not actual System identity.                                                                                              |
| Successful SharedBody allocation  | Adopt one fresh logical key for this actual native allocation; copy existing Node/ancestry baseline; register key with the private Queue.                                                                               | Never adopt an allocation whose native return/copy failed. Ambiguous allocation remains terminal World cleanup responsibility.                        |
| Component initialization          | After acquisition/retain, attach the actual component and adapter as `initializing`; finalize only after attach/configuration succeeds. Include initializing records in guards; do not admit commands against them.     | An adapter reference is not the Component object that owns `_enabled` and deferred destruction.                                                       |
| Initialize failure                | Unregister the component after known cleanup; if native outcome/cleanup is uncertain, retain its owner record in faulted World until terminal cleanup.                                                                  | Do not erase ownership merely to make a failed initializer appear rolled back.                                                                        |
| Collider onEnable                 | Create actual geometry, then mark active. Its body/Node/component/material records already exist.                                                                                                                       | Component enabled state and native shape existence are separate.                                                                                      |
| Collider onDisable                | Remove actual geometry, then mark inactive; retain its component, Node/body reference and material asset in the fence set.                                                                                              | Disabled Collider material setters still mutate JS configuration and may later recreate geometry.                                                     |
| RigidBody onEnable/onDisable      | Update enabled metadata only after successful native transition, or explicit faulted cleanup-only detachment.                                                                                                           | `enableRigidBody(false)` can leave native body enabled when colliders remain (`shared-body.ts:418`). It does not prove protected-zero settlement.     |
| RigidBody destroy/type transition | Invalidate component-bound future handles only on proven lifecycle transition; preserve a still-owned SharedBody for remaining colliders.                                                                               | Converting to static or disabling a component is not destruction of the native allocation/logical key.                                                |
| Collider material replacement     | Keep material **asset identity** separate from copied friction/restitution. Finalize after actual cache/listener identity commit; keep both old/candidate identities or fault on uncertain partial listener transition. | Equal coefficients do not mean equal assets. An active native setter returning does not prove the later component cache/listener operation succeeded. |
| Default material                  | Retain the exact asset passed by actual System, in addition to native coefficients. Finalize after System cache/listener transition; keep default asset even with zero active inherited shapes.                         | A copied surface-material object cannot guard `PhysicsMaterial.friction` on the actual asset.                                                         |
| Last body reference destroyed     | Native destroy returns successfully, then retire queue key/closures/body ownership. Actual allocation cannot later reuse this JS key.                                                                                   | A future type change alone must not retire the logical allocation or make valid cancellation stale.                                                   |
| Faulted component teardown        | Remove only JS component references/listeners and reject normal operations; remaining native allocation belongs to unique World teardown.                                                                               | Do not replay uncertain per-body destroy/setter operations.                                                                                           |
| World teardown                    | Close temporary scopes and invalidate logical/handle state; destroy native World through its existing owner; clear records. Record failure separately if native destroy fails.                                          | Releasing guards or closing Queue is not proof of native resource zero.                                                                               |

Guard target snapshots include **all** initialized/initializing owned components, not just enabled ones; all owned body Nodes and baseline ancestors; every referenced material (shared assets deduplicated by object identity, not coefficient/id string); actual System; and `Node.prototype`. Each World gets independent leases even when materials/ancestors overlap. Material removal uses per-component references or counts, so replacing one Collider's asset cannot remove another Collider's protection.

Ancestry comes from the stored raw-local baseline. After leasing it, preflight verifies that the real parent/local chain still matches before reading caller arguments. A preexisting raw parent alias change rejects; do not discover a new ancestry by first flushing a public world getter and then bless it. The final pre-commit check repeats raw/local/world/ancestor verification.

## 5. Phase/read policy and lease-release matrix

Committed state/velocity/filter reads may run during idle, admission, collecting, validating, dispatch and writeback **after** the synchronous native call has returned. They read actual committed native state, not queued predictions. Reads reject while native apply/solve is in progress, on fault/closing/closed owners, or for stale bodies. Whether a bounds getter writes a caller-owned output does not make the physics state speculative; engine getters that mutate their own caches are classified separately.

Configuration and lifecycle accept idle only, with an explicit `allowPaused` policy. Paused ordinary configuration may remain allowed where existing semantics permit; producer create/update/enable and cancellation require unpaused idle. No blanket relaxation of World readiness is allowed. Cleanup after fault is a separate private path, never a general configuration permit.

| Scope/outcome                               | Temporary leases                                                                                                                                                           | Other state                                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Ready command admission success/refusal     | Reader acquires mutation then transform lease from private arrays. Outer `finally` releases new transform then mutation lease. If second acquisition fails, release first. | Queue read guard covers acquisition refusal and complete returned-getter copy. No callback-owned lease handle.   |
| Submission during collection/dispatch       | Borrow existing active transaction scopes; acquire no duplicate scope unless coverage genuinely differs. Admission `finally` does not dispose borrowed scopes.             | Rejected command latches collection. A caught standalone configuration refusal does not automatically do so.     |
| Nested same-queue admission                 | Queue rejects before invoking reader.                                                                                                                                      | No new owner lease was acquired and no sequence allocated.                                                       |
| Step pure refusal                           | Release producer roster lease, temporary transform/mutation leases in outer `finally`; owner returns idle only after cleanup.                                              | Preserve prequeue/snapshot/native count. Raw JavaScript side effects are not rolled back or adopted.             |
| Step known success                          | Complete writeback verification/tick accounting, then release roster and temporary leases in `finally`.                                                                    | Persistent target guards, when later enabled, remain held.                                                       |
| Apply/step/writeback failure after mutation | Mark fault and established completion before releasing temporary leases.                                                                                                   | Known committed commands remain retired; unknown commands stay quarantined, never replayed.                      |
| Persistent target revoke/dispose            | Do not release its guard in any temporary scope's `finally`.                                                                                                               | Release only after proven paired-zero/lifecycle settlement, or terminal faulted World cleanup. Not enabled in A. |
| Teardown success/failure                    | Repeated-safe JS release of all owned temporary/persistent guards and producer leases; invalidate handles.                                                                 | Native destroy failure stays an explicit resource-cleanup failure, not a false `released/0 bytes` claim.         |

Checkpoint A has **no successful staged submission method or public hook registration**. If a future entry is accidentally reached before consumer installation, it explicitly rejects with unsupported/consumer-unavailable semantics; it must not accept a record that no step can consume. One Queue may mirror logical identity for later use, but its pending list remains empty in A. Ordinary immediate force behavior is historical/current A behavior, not the eventual unified API claim.

## 6. Required narrow seams before activation

### 6.1 Material identity notifications: a real seven-file limit

Actual `Collider.material` getter (`collider.ts:112–121`) replaces shared `_material` with a clone and changes listeners **without calling shape.setMaterial**. Therefore initial/adapter-setter tracking alone becomes stale even without malicious aliases. Guarding the old asset fails to protect the new clone. Calling that getter while building a fence is prohibited and cannot repair this.

The minimal semantic seam is a Box3D-only identity notification at successful material **cache/listener** commits, including clone getter, normal setter, and destruction. Suggested internal callback contract:

```ts
interface MaterialIdentityObserver {
    prepare(oldAsset: PhysicsMaterial | null, nextAsset: PhysicsMaterial | null): void;
    committed(actualAsset: PhysicsMaterial | null): void;
    failed(error: unknown): void; // Post-write ambiguity faults; not a fake rollback.
}
```

The actual adapter owns this observer; no native shape/capability is returned. How to expose it to the extracted Collider with no AIR runtime import needs separate approval: a narrow optional shape-interface hook or backend-neutral per-component private registry are candidates. This is **not implemented** by A. Default System material replacement has the same after-adapter cache/listener boundary (`physics-system.ts:235–250`); observe its actual commit too. Listener `on/off` exceptions cannot be represented as full rollback merely because native coefficients succeeded.

### 6.2 Earliest automatic-step guard

The minimal upstream change is `assertMutationAllowed(this, 'PhysicsSystem.postUpdate')` as the first method statement, before any `_subStepCount`, `_accumulator`, director event, or caller-controlled coercion. The already registered actual System lease then blocks recursion from admission/hooks/Node listeners. With no lease, the existing early returns and all other backends retain behavior. World still separately refuses recursive manual step; no second accumulator is added.

Test the actual original method using a `deltaTime` valueOf sentinel: when fenced, zero coercions, unchanged accumulator/substep count, zero director callbacks/world calls. Do not infer this from a World-only mock rejection.

### 6.3 Immediate System enable notification

Smallest explicit bridge proposal: add `setSimulationEnabled(enabled: boolean): void` to the internal Box3D World class, and use a narrow Box3D-only structural interface in the actual System setter. After the existing earliest mutation assertion, validate the Box3D boolean and invoke the actual world's method **before** `_enable` changes. Other backends keep their exact current setter. If the selected Box3D world lacks this owner method, reject rather than cache a successful transition. During startup, before a world exists, the constructor's actual System enable value seeds owner pause state.

Owner transition must precheck phase plus Queue/producer readiness, then apply pause/resume synchronously. Pause clears user pending commands and disables continuous handles; resume never reenables them. If an unexpected internal failure occurs after any change, fault rather than pretend recoverable unchanged state. This notification must not call native step. Queue and producer APIs alone do not provide a formally atomic multi-module pause transaction, so prove the chosen ordering with failure injection.

One decision still needs freezing: should explicit manual World.step while `System.enable=false` reject as paused? Existing Cocos manual `step` ignores enable. `autoSimulation=false` must remain manual mode rather than silently becoming pause. A enables no command consumer, so it must not silently decide either compatibility boundary.

### 6.4 Persistent exact-grant counter preflight

Minimal primitive extension, separately owned/upstream-reviewed:

```ts
interface NodeTransformGuardLease {
    assertWriteCapacity(requiredWrites: number): void;
    // Existing dispose/write unchanged.
}
// Internal qualification only: optional copied sequenceLimit >= 1, default MAX_SAFE_INTEGER.
```

The method is pure: require an active lease with no pending grant, strict nonnegative safe-integer count, and `requiredWrites <= limit - sequence`. It neither increments nor resets a counter and exposes no writable field. Existing `write` retains its own counter refusal. A reduced internal limit tests the real exhaustion branch; no claim of naturally exhausting MAX_SAFE_INTEGER.

Immediately before native commit, compute the complete planned write count per **distinct** lease from the frozen writable body list and lease coverage: two writes per written Node (position, rotation), including ancestor bodies covered by a descendant target lease. Validate every covering lease's capacity before any native mutation. Private scope ownership, stable roster and no externally shared lease capability ensure no unseen user grant can consume budget between this check and writeback. All known extra owned writes must be counted; otherwise qualification fails.

Composition remains nested exact grants over the transaction lease and every covering target lease, using one copied expected tuple and one actual setter. No guard is temporarily removed. Test limit 1 refusal before apply, limit 2 one successful position+rotation then next-tick pre-apply refusal, and multi-body/shared-ancestor coverage. Also retain malicious accessor/listener reentry and native-completion-on-writeback-failure controls.

### 6.5 Other concrete early-write gaps

RigidBody setters with equality/coercion before adapters; Collider center/isTrigger and Box/Sphere dimensions; inactive adapter material/config paths; and System query cache mutation remain separate early-entry work. In particular `raycast/sweep*` reset pools/results or update `raycastOptions` before reaching World (`physics-system.ts:546–550,569–571,691–695` and sibling methods). They are not committed-only getters merely because they sound like queries. Either install earliest System assertions for these exact methods before claiming the supplement's mutable-cache guarantee, or keep qualification blocked. Do not broaden a gate silently or treat current unsupported World queries as proof that their upstream caches were unchanged.

## 7. Source checkpoint and acceptance order

1. Review these private interfaces and identity transitions; approve the seven-file A window explicitly. Save formatted source checkpoint before tests.
2. Run focused actual-source owner/engine controls labeled as source/mock binding where applicable. Include no-body System/category fencing, real component rather than adapter identity, disabled collider/shared material counts, failed initializer cleanup, borrowed-vs-new lease release and no accepted staged record.
3. Approve and close the separately listed upstream seams. Actual material clone identity is a required RED before a fix; unsupported target counter/pause paths must not be exposed as successful APIs.
4. Only after source checkpoints and fresh current-schema WASM qualification, activate the internal command consumer, then actual ready-admission and callback fixtures. No public feature or formal required cell is activated by this plan.

The companion receipt binds reviewed source hashes and confirms read-only identity across this planning pass. It is not a test result.
