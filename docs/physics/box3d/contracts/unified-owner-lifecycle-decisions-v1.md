# Unified owner lifecycle decisions, version 1

Status: frozen implementation decisions, **not implemented or qualified**. Source baseline is local checkpoint 28, `a9be35d68f5cad1f18eca2be813f216dc04cdc4b`, remotely preserved as `aa6d9bb7cb5a31dc2094f6728da55afdc4d7cb7c`. This supplements the unchanged v1.2 contract and unified-command decisions; it does not replace their acceptance inventory or alter the 50 frozen N4 build inputs.

The source-backed design is `tools/verify/box3d/material-pause-seams-plan-20261022-a/README.md`. Its source identities belong to checkpoint 27. Stage A subsequently adds entry guards to four components without changing the System, material, queue or producer algorithms described there.

## 1. Physics enable and manual scheduling

For a registered Box3D command owner, `PhysicsSystem.enable=false` means an immediate physics-owner pause. Clear accepted user commands and pending target movement, suspend hook invocation and disable continuous handles. Preserve target ownership and protected paired-zero obligations. Resume restores eligibility, not previous user commands or automatically enabled continuous handles. Hook enabled configuration survives.

An explicit `PhysicsSystem.step` while this owner is paused must reject before queue consumption, caller-controlled command reads or native advancement. This is a deliberate Box3D-owned behavior difference: the frozen unobserved Cocos manual step ignores enable. Other backends and unobserved paths keep that original behavior. The supported manual scheduling mode is `enable=true` and `autoSimulation=false`, not a hidden paused-step exception.

`autoSimulation=false` changes scheduling only. It does not pause the owner, clear queues, revoke targets, disable producers or reset accumulated time. An explicit step must eventually use the same one-tick consumer as the automatic loop, without pretending to emit the entire automatic before/after event cycle. The existing rejection of extra Cannon-style accumulator arguments remains.

Configuration transitions require strict booleans on the observed Box3D path. Same-value writes still enter the earliest mutation guard before comparison. No-observer paths retain their original value/evaluation behavior.

## 2. Automatic loop and accumulated time

Keep the existing sole accumulator, fixed dt and maxSubSteps. The observed Box3D path rechecks owner pause immediately after BEFORE_PHYSICS and before each actual fixed tick. A pause in BEFORE_PHYSICS stops solver and queue consumption for that frame. Already-added accumulated time and remaining backlog are retained, never silently discarded or reset.

A successful tick alone decrements the accumulator and advances the substep count. A failed or refused tick does not pretend that a simulation interval completed. AFTER_PHYSICS retains its original normal-return behavior, including a nonthrowing pause in BEFORE_PHYSICS; a thrown callback still propagates through the original error path. Pausing during collection, solver, writeback or dispatch is an early reentrant refusal, not a partial pause.

Resuming does not reset time. Explicit resetAccumulator remains distinct. Disabled scene synchronization must be separately admitted as read/preflight-only work rather than accidentally re-enabling stepping or consuming pending commands. The actual engine fixture must pin this path before the pause seam is considered qualified.

## 3. Prepared transition and failure truthfulness

The queue and producers need one privately prepared transition. Validate all relevant phases and reserve changes before modifying the public enable cache or either owner subsystem. Calling the existing queue.pause and producer.pause consecutively without preparation is insufficient.

Commit performs only trusted prevalidated metadata changes and the original private System cache assignment, with no public callback or new event. If any unexpected error occurs after one change, retain the actual committed/partial facts, fault the owner and preserve the first error identity. Do not restore a guessed queue snapshot or replay previously accepted commands. Cleanup releases each temporary fence independently while target grants and unresolved native ownership remain truthful.

## 4. Game pause is not a substitute for a clock-mode contract

The existing createStepClock begins by calling game.pause and then deliberately drives director.tick. A bare game.isPaused read cannot decide whether physics commands are semantically paused. No owner implementation may automatically equate that field with command admission, nor add a second RAF/physics loop to work around it.

The System pause seam above is the immediate B2 scope. Full T12 application/background pause needs a separate explicit private lifecycle reason and manual-clock ownership integration. Ordinary application pause must ultimately clear input and suspend physics and business time; a deliberately owned manual test clock must remain executable without a public bypass flag. Until both paths are wired and tested, application pause and target lifetime acceptance remain NOT_RUN. Scene release and app.close are terminal ownership cleanup, not a resumable System toggle. Persist ownership cannot be revoked merely because an unrelated scene is released.

## 5. Material identity and commit boundary

Native coefficient input and actual PhysicsMaterial identity are separate facts. Only a successful original Collider/System cache-and-listener operation may commit the corresponding actual asset identity to the private owner roster. A cloning getter must notify its real returned clone without reading Collider.material as an ownership-discovery shortcut.

The owner barrier opens before any before/candidate reader, clone allocation, listener operation or native delegate. Internal native delegation requires one private exact-operation authority, never a temporary unregistration or phase reset to idle. All affected owners are preflighted before effects. Observer tickets report delegate entry/return, cache writes and listener progress as JavaScript facts, not inferred native atomicity.

Native success followed by JS listener/cache/readback failure faults the affected owner and retains committed facts. Unknown native mutation stays unknown. Retain old, candidate and actually observed identity references separately for cleanup; do not claim rollback from a candidate value or restored coefficient alone. A failure with undefined, null or zero is still a real primary failure. Shared-asset propagation and protected subscription integrity remain a later explicit boundary, not implied by clone notification.

## 6. Qualification boundary

Implement the private observer primitive first, then wire actual cache identity, then prepared System pause, then shared-asset/subscription integrity. Each increment retains its original failures and reruns the relevant actual-engine/current-WASM controls. Do not enable the unified consumer while material, pause, event-entry or persistent-target-grant requirements are unresolved.

Required controls include disabled manual step refusal before native calls, manual autoSimulation mode with no queue clearing, BEFORE_PHYSICS pause with preserved backlog, caught reentrant pause with no cache change, failure between prepared commits, clone allocation/listener failures, same-object and equal-id distinct-material cases, shared ownership and native-success/JS-failure cleanup. No design document, pure observer test or Node HEADLESS run changes the 2,128 formal required cells from NOT_RUN.
