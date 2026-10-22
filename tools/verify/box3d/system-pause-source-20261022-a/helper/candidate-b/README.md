# B2 System/bridge candidate

This directory contains only a candidate against the verified original System/B0 source hashes of local checkpoint `4e1cb31336dee13c549d8ec94ab71e64072e93e2`. After pure validation, the lead opened a two-file landing window. Only physics-system-control.ts and physics-system.ts were copied into the product tree, with the old System SHA checked immediately before copying. Owner/World/queue/producers and committed evidence directories were not changed by this worker. No Git mutation, SDK build, native build or deployment was performed.

## Deliverables

- `physics-system-control.ts`: new private backend-neutral B0 adapter. No AIR imports, native authority or public barrel export.
- `physics-system.ts`: original actual System file plus minimal wiring. Not a whole source tree.
- `physics-system-control.patch`: portable new-file patch and System delta against the exact verified baseline.
- `system-scheduling-supplement-v1.md`: additive lead-frozen autoSimulation boundary decision. The existing historical lifecycle v1 file is unchanged.
- `physics-state-observer.ts` is only a read-only symlink to the original B0 source for the focused compiler; it is not part of the patch or a proposed B0 modification.

## Frozen private integration signatures

`installPhysicsSystemControlSource(target, source)` is called only in the original System constructor. `source` is a closure that reads `_enable` and `_autoSimulation` directly and returns those booleans. No public getter is used to initialize owner state.

`readPhysicsSystemControl(target)` returns a frozen `{kind:'system-control', enabled, autoSimulation}` copy for owner bootstrap before registration. It does not validate selector binding or register an owner. The original source must already be installed.

`registerPhysicsSystemControl(target, observer, dispositionReader)` returns a frozen lease with `initialState` and `dispose()`. `observer` implements the unchanged five B0 methods: open, preflight, commit, fail and dispose. `dispositionReader` returns only `ready` or `paused`; owner fault, closed state and live-binding mismatch must throw the owner's original error. Only one actual owner is registered per System. Registration copies callbacks and initial private flags without requiring the selector's world assignment to have finished.

`beginPhysicsSystemControl(target, 'system-enable'|'system-auto-simulation')` returns a wrapped PhysicsStateChangeTicket, or undefined when unobserved. The wrapper forwards B0 phases and diagnostics. Its fail method checks terminal/hasFailure first, preserving falsy original errors instead of replacing them with a second terminal-ticket error.

`getPhysicsSystemControlDisposition(target)` returns `ready`, `paused` or undefined for unobserved. It rejects during an open control ticket, reads actual private flags, and preserves owner exceptions. Actual enabled=false always yields paused. autoSimulation=false alone does not. Execution-admission callbacks cannot reenter bridge mutations and silently swallow the refusal. The callback receives no private Entry as its receiver.

`assertPhysicsSystemManualStep(target)` is a no-op if unobserved; it rejects paused state before System retrieves/steps a world. It preserves the owner's fault/closed/binding exception. The bridge's basic paused error is a plain Error, not a frozen new public Box3D error-code API.

## System wiring

Both setters retain the earliest mutation guard before lookup, value validation or comparison. Observed setters prepare before/candidate flags, write the original cache, report cache-written and commit the actual private flags. Their catch explicitly checks disposed/hasFailure, and finally disposes the temporary ticket. No-observer setter assignment is left intact.

Manual System.step calls bridge admission before the existing world access. postUpdate retains the same accumulator, fixed timestep, maxSubSteps, world tick/event sequence and successful-tick accounting. Observed control reads happen at entry, after BEFORE and before each actual tick. A normal post-BEFORE stop still emits AFTER and retains the added backlog. The new scheduling condition includes both enable and autoSimulation according to the additive supplement. No-observer branch behavior remains unchanged.

## Integration still owned by the lead

- Install the real World/owner registration and its independent teardown. Bootstrap disabled state through a prepared queue pause using the private initial flags, not by writing System again.
- Implement owner `system-control` fences and prepared queue coordination. open/disposition perform live System/world binding checks, not initial registration.
- Route direct World.step through owner execution admission, and retain explicitly allowed disabled scene preflight and paused component assembly behavior.
- Propagate post-effect and cleanup failure into truthful owner/world fault state. The bridge does not infer native outcome or perform queue rollback.
- Keep real producers NOT_INTEGRATED rather than constructing an empty mock owner solely to imply success. Preserve targets and protected-zero obligations through the future actual owner seam.
- Update upstream metadata, integrate and rerun actual-source/current-WASM controls in a separately identified checkpoint. This candidate's syntax/pure-wrapper controls cannot qualify real System behavior, queues, producer handles, native steps or T12.

## Validation and retained failures

Compiler attempt a failed on missing callback parameter annotations. Attempt b failed on missing imported type names. Their source snapshots and original logs are retained in `compile-a/` and `compile-b/`; the original root tsc logs are also retained. Wrapper attempt a could not load an unproduced JS module after compiler b failed. It is explicitly **SETUP_ERROR_NOT_PRODUCT_RED**, with zero product tests executed, and its source/logs are retained in `wrapper-a-setup/` and `wrapper-a.setup-error.json`.

Compiler c passed. Wrapper b passed 46 pure adapter/B0 controls. Its tested source snapshots are retained in `compile-c/`, and its exact test source is `wrapper-b.control.cjs`. A later narrow change prevents passing the private Entry as a callback receiver; compiler d and wrapper c validate the final candidate, including that receiver control. Final compiler d passed and wrapper c passed 47 controls. The System candidate also transpiled with zero syntax errors. Consult `candidate-receipt.json` for final status and source hashes; `landing-receipt.json` identifies the two copied product files. No actual System integration test was run while owner wiring remained pending. System transpilation is syntax-only, not full application type checking.

All results are pure JavaScript/source diagnostics, not WASM or physics qualification. All 2,128 formal required cells remain NOT_RUN; staged/unified API flags remain false; real producer/target integration and T12 remain open.
