# Unified command mutation fence, version 1

Status: FROZEN_SOURCE_CONTRACT_NOT_IMPLEMENTED, 2026-10-22. Additive clarification of unified-command-decisions-v1.md section 2, not a rewritten formal inventory or qualification.

The reviewed proposal is tools/verify/box3d/mutation-guard-evidence-20261022-a/integration-design.md, SHA-256 e9d8e15281ccb50788cf9f1284786e2ab9ead25835f3428c2904bdde84f99be3. The standalone guard primitive and its 56 source controls are not engine write-site or world integration proof.

## Explicit temporary category restriction

During any active Box3D collection, final validation, command commit, or event-dispatch transaction, all calls to the original Node.addComponent in that Cocos realm reject at entry, before class-name resolution, user constructor properties, dependency recursion or constructor execution. This includes orphan and unrelated Nodes, UI/2D components, subclasses and user components. The compatibility restriction is deliberate and bounded to these transactions. It does not claim a physics-class-only filter. Outside such transactions, with no lease, original component construction behavior remains.

Each owner registers Node.prototype as an independent identity in the same private multi-owner lease registry. One owner cannot release another's prohibition. The key is not modified and carries no release authority. A new orphan is not assumed to belong to a known scene; guarding only existing bodies or scene roots is insufficient. Arbitrary direct constructors, overridden engine methods and private field edits are not sandboxed.

## Object-scoped early admission

Wire the reviewed primitive at the earliest public mutation points in Component.enabled/destroy, Node.active/destroy/destroyAllChildren, PhysicsMaterial scalar setters/setValues/destroy, Collider.material side-effecting getter/setter, and PhysicsSystem cached configuration setters/resetConfiguration/resetAccumulator. Existing native-first paths still require the actual owner transaction phase. Batch destruction copies and prechecks the full affected child list before the first destroy call, without promising rollback of arbitrary subsequent user lifecycle callbacks.

The actual world later owns leases over its bodies, components, Node ancestry, shared/default materials and PhysicsSystem. Shared objects may have multiple owner leases. Registration is before user callbacks; release is in finally on every exit. No global bypass, no native lock held as a fence and no native-cleanup claim follows from releasing a lease. Expected-pose writeback continues to use exact Node transform grants and immutable native-origin verification, not a blanket mutation exemption.

Pause/continuous disable, target disposal and actual native lifetime settlement remain separate owner obligations. Direct vector/internal aliases not passing an entry remain an explicit detection or unsupported-side-effect boundary; public-entry guards do not intercept arbitrary JavaScript memory writes.

## Qualification before activation

Import and exercise the actual engine entry points, not copied setter bodies. Verify unchanged cache/flags/arrays/material identity/listener bindings/accumulator and zero native or lifecycle callback effects at refusal. Include a protected later child, two owners sharing material, orphan/UI/2D component creation, constructor and requirement getter sentinels, and no-lease original behavior. Then qualify the actual World callback/validation/commit/release path against fresh schema-matched WASM. Until then no formal required cell is PASS.
