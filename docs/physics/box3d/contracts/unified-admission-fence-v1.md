# Unified command admission fence supplement, version 1

Status: FROZEN_SOURCE_CONTRACT_NOT_IMPLEMENTED, 2026-10-22. This is an additive owner-integration contract, not an edit to the frozen unified command, wire or mutation-fence v1 documents, the 50 native build inputs, or the formal required-cell inventory. Pure queue and wire-mapper controls do not establish this integration.

## Explicit ready-phase compatibility restriction

The mutation-fence v1 category restriction also applies during the synchronous admission of an individual Box3D command, including ordinary ready phase. The interval begins before owner resolution or caller-owned argument reads and ends only after the complete command copy and queue admission have returned or thrown. Throughout that interval, the original Node.addComponent rejects at entry for every Node in the Cocos realm, including unrelated, orphan, UI/2D and user-component construction. This is a deliberate short-lived category restriction, not a physics-class filter. Outside the interval and other declared transactions, with no lease, original behavior is retained.

The owner also fences the actual PhysicsSystem, referenced RigidBody and Collider components, body Nodes and raw ancestry, shared/default material assets, and Node transforms covered by those identities. It obtains these identities from already-held private owner records, not a side-effecting component getter or caller-provided iterator. Multiple owners remain independent. There is no global bypass, monkeypatch, native lock used as a JavaScript fence, or authority carried by an exposed token.

## Atomic owner admission

The public adapter enters queue.withSubmissionAdmission before owner validation or any original argument inspection that could reject. The reader's first owner action acquires or reuses the required private leases. This placement ensures a caught owner-admission refusal during collection poisons that candidate, even when the thrown value is undefined, null or zero. Preserve the first rejected-command value by identity; a later error must not replace it.

The reader returns only a logical body identity and original command input. Queue copying can still invoke getters after the reader returns, so the owner holds its temporary leases until the outer withSubmissionAdmission call returns or throws. Release newly acquired temporary leases in an outer finally on every path; do not release reused collection leases or persistent target leases there. Acquire no lease using untrusted data before the queue admission guard.

A refusal installs no record, advances no sequence, and does not change accepted prequeue or native state through an admitted engine entry. A caught nested queue operation must still reject the entire current admission. During collection it also invalidates the candidate and drops provisional records, without replaying callbacks. Queue code alone cannot guarantee the owner or native obligations.

## Reads, side effects and scope

Last-committed state and velocity reads remain available during callbacks. Configuration, lifecycle, recursive manual or automatic stepping, and mutable cache operations are distinct admissions and must reject before their first engine mutation or caller-controlled coercion. In particular, a World-only guard is too late for PhysicsSystem.postUpdate accumulator changes and for component setters that read input before reaching an adapter.

Direct JavaScript field aliases, arbitrary constructors, overridden methods and external side effects are not sandboxed and are not rolled back. Before accepting a candidate, the owner repeats raw local TRS, world pose and ancestor-basis checks against the original expected snapshots, not against a newly flushed cache. Detection must reject without adopting the changed state as a baseline. A native mutation already completed before a later readback or writeback error must be classified committed or unknown, quarantined as required, and never represented as not-mutated or replayed.

## Persistent protection and resource counters

Do not temporarily release a target transform lease to make writeback succeed. Compose distinct owner-held exact grants for the transaction lease and every target lease covering the written Node; invoke the actual setter once at the innermost grant. All grants must refer to the same copied expected value and be consumed before listener callbacks. Preserve post-setter expected local TRS, world pose, ancestor basis, and final whole-batch verification. Foreign ownership remains a refusal.

Before native mutation, prove sufficient capacity for every sequence/attempt/tick/native-step and exact-grant counter used by that transaction. World epoch headroom alone does not prove the capacity of a persistent lease that grants multiple writes per tick. Until a pure grant-capacity preflight or continuously protected renewal is implemented and controlled, persistent-target activation remains unavailable.

## Required integration evidence

Use actual World ownership, real engine entry points and current-schema WASM. Exercise ready argument getters, caught rejected commands, committed reads, nested stepping, later-child destruction, shared material owners, raw-alias/cache-flush attacks, success and failure cleanup, and target grant composition. Check cache/flags/listeners/constructors/native-call counters before and after refusal. Preserve exact inputs and original failed runs. Source controls, synthetic binding failures and finite Node WASM contracts must remain separately labeled; none change the 2128 formal cells from NOT_RUN.
