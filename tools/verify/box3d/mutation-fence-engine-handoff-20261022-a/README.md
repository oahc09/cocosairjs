# Opt-in mutation fence: finite actual-engine controls

The final immutable pair is **red-d / green-b**, with the same four collector inputs. The original five engine files yield 41 RED cases and five passing controls, with 126 failed checks out of 163. The patched five files yield **46/46 cases and 163/163 checks passing**. Format, TypeScript and Jest all exit zero for green-b; red-d has format/TypeScript zero and the expected Jest exit one. Both receipts bind 412 actually imported engine/setup sources before and after execution, and only the five authorized product files differ between them.

This is actual TypeScript engine source running through the existing Node/Jest/JSDOM setup, not a runtime bundle or browser. The real NodeActivator, ComponentScheduler, EventTarget and deferred-destroy queue are exercised. Physics-world and shape delegates are explicit call-count mocks. No native physics result, actual World transaction lease, producer/queue integration, public activation, T11 or C36 completion follows from this result.

## Product patch

Only 32 lines were added to five upstream files: five guard imports and 27 early assertions. No existing lines or copyright headers were removed or reformatted. The exact diff and before/after SHA values are in `../mutation-fence-engine-source-20261022-a/`. The current five product files were restored byte-for-byte after the original-source RED rerun, as recorded in `../mutation-fence-engine-restore-20261022-a/receipt.json`.

- Component: enabled and destroy before cache, scheduler, editor or deferred scheduling effects.
- Node: active/destroy; destroyAllChildren checks its receiver and the entire current child set before the first destroy call. Original iteration remains unchanged after admission.
- Node.addComponent: the frozen realm-wide category key is Node.prototype. This deliberately includes orphan, UI, 2D and custom components and checks before class-name resolution, requirement getters, dependency recursion or constructors. This is not a physics-only restriction.
- PhysicsMaterial: all four coefficients, setValues and destroy before coercion, fields, events, registry removal or deferred scheduling.
- Collider.material: the setter and only the side-effecting shared-material clone getter branch, before delegate/listener/asset/cache changes. The already-unshared getter remains a read.
- PhysicsSystem: enable, allowSleep, maxSubSteps, fixedTimeStep, gravity, sleepThreshold, autoSimulation, both debug setters, default-material replacement, resetConfiguration and resetAccumulator, before input reads or any writes/delegation.

The finite no-lease controls retain original cache and delegate behavior under builtin, cannon.js and box3d selector labels. These labels do not instantiate or qualify those native backends.

## Evidence and reproduction

Run from the repository root, using a **new nonexistent output directory**:

```sh
node tools/verify/box3d/mutation-fence-engine-control.mjs tools/verify/box3d/mutation-fence-engine-evidence-independent
```

Each output directory retains command argv, exit status, stdout/stderr, Jest JSON, raw per-check observations, source hashes and ten small source/tool snapshots. The actual imported source closure is hash-bound, not duplicated. The collector checks immutable observation consistency and rejects source drift. The original-source rerun temporarily installed only the five previously frozen originals and restored the saved patched files in finally, without Git operations or module stand-ins.

`handoff.json` contains exact owned-source SHA values, command outcomes, the loaded-source comparison, source-diff audit, scope and all prior attempt classifications. `owned-files.json` enumerates this work's exact source and evidence files, excluding itself.

## Retained earlier failures

No raw output was overwritten:

- red-a: 38 actual-source RED cases, four passing controls, one fixture failure from spying on a non-configurable re-export, plus missing Node ambient types.
- red-b: fixture spy corrected by observing the actual class registry; 41 RED/five PASS. Adding broad Node ambient types instead caused browser-engine global/timer type conflicts.
- red-c: narrow file-evidence plumbing declarations removed that type conflict; 41 RED/five PASS, but the recorder still retained mutable object references.
- green-a: historical reported 46/46 PASS is **not final immutable evidence**. Five retained raw checks changed later through teardown aliases. red-b/red-c each have one such pass-field/raw mismatch. The old records remain intact and are classified separately.
- green-b and red-d: actual and expected values are copied when each assertion is recorded. All 163 retained checks independently reproduce their pass/fail values; product and fixture identities match the stated comparison.

The existing setup warning `Cannot access game frame or container.` and asset-destruction debug output remain in the unmodified Jest logs. They do not establish a browser or renderer.

## Still required before owner activation

The actual World must register and finally release the right component, Node ancestry, shared/default material and System identities over its collection/validation/commit/event phases. Shared identities require independent owner leases. This patch does not implement pause/continuous retirement or native lifetime settlement. Batch admission does not promise rollback across later arbitrary lifecycle callbacks. Direct constructors, overrides, raw/private aliases and arbitrary JavaScript side effects are not sandboxed. Caught configuration refusal guarantees no such configuration mutation; it is not the distinct mandatory rejected-command-submission latch.

Parent-owned metadata must mark Component/PhysicsMaterial as modified and append the narrow opt-in-fence reason to Node, Collider and PhysicsSystem. No metadata files were edited by this worker.
