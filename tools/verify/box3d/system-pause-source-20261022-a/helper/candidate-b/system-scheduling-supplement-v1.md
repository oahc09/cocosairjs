# B2 observed automatic-scheduling supplement

Status: **LEAD_FROZEN_DESIGN, CANDIDATE_ONLY, NOT INTEGRATED OR QUALIFIED**.

The lead froze this additive decision on 2026-10-22 after receiving the original-source pause RED evidence. It supplements, but does not rewrite, `unified-owner-lifecycle-decisions-v1.md`. This file is outside the product tree.

For a registered Box3D System owner, automatic fixed-tick admission requires the actual private enable and autoSimulation flags to remain true and the owner disposition to remain executable. Recheck at automatic entry, immediately after BEFORE_PHYSICS and before every actual tick.

- autoSimulation=false in BEFORE_PHYSICS immediately prevents subsequent automatic ticks in that frame. Already-added accumulated time is retained. Normal AFTER_PHYSICS still fires.
- autoSimulation=false at an idle boundary between completed ticks prevents later automatic ticks. Completed ticks remain charged, and unspent backlog remains.
- autoSimulation=false does not pause the owner, clear commands or target movement, revoke grants, disable continuous handles or reset the accumulator. Explicit manual step remains available when enable=true and the owner is ready.
- Protected collection, solve, writeback, dispatch and control transitions still reject scheduling changes at their earliest mutation guard, including same-value writes. There is no mid-transaction bypass.
- Explicit manual steps retain their original separate accumulator semantics. They do not reset or drain automatic backlog or emit the automatic BEFORE/AFTER event cycle.
- Subsequent frames in manual mode add no automatic deltaTime. Returning to auto mode retains the existing backlog; resetAccumulator remains a distinct explicit operation.
- Final current flags after a BEFORE dispatch determine eligibility. A false-to-true autoSimulation pair clears no accepted input, unlike an enable pause followed by resume.
- Unobserved and other-backend paths preserve their prior behavior. No extra RAF, clock, accumulator or public owner bypass is introduced.

This decision does not close application/background pause, manual-clock lifecycle, producer/target integration, persistent grants, or T12. All 2,128 formal required cells remain NOT_RUN, and staged/unified support remains false.
