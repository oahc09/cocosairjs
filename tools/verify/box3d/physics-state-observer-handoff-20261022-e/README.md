# B0 observer primitive: finite source-only checkpoint e

Implemented only the new private `src/cocos/physics/framework/physics-state-observer.ts` and new dedicated pure control runner. No existing Cocos/AIR product file, public barrel, native/facade input, World consumer or historical evidence was edited. Baseline for this narrow work was parent-provided `a9be35d`. This is **not native physics, real material propagation, World activation or complete command-transaction qualification**.

## Frozen result

- e: **76/76 pure actual-source observer controls**, strict module TypeScript check exit 0, explicit scoped Prettier check exit 0, source/runner/contracts before-and-after hashes identical.
- d has the same product source and same control behavior. e changes only the control's short SPDX header to the full 2026–2027 MIT header, after the parent's independent d run completed. e was rerun rather than inheriting d's result.
- New authoritative interface timing is contract-b: `begin(target, operation)` returns a created ticket without callback/snapshot execution; `prepare(reader)` establishes all entered owner barriers before reading before/candidate. Callers retain the ticket even if open throws, so final cleanup failures are reachable without replacing or decorating falsy original errors.

Product SHA256: `4cf40c4f1be0d407a402e95dcdb7a898b1942cb175f869f6367a41b18c2d1d2b`.

See `receipt.json` for current control/result hashes, exact attempt commands/statuses, and header-only identity check. `owned-files.json` inventories every file owned by this subtask except that manifest and the final receipt itself. Parent-owned independent lead evidence is intentionally excluded.

## What the primitive establishes

- Multi-owner target WeakMap registry with copied callback references, isolated frozen release leases and stable complete target roster. Actual guarded objects gain no public fields.
- Immutable operation context and detached/frozen typed snapshots. Material objects retain identity and are not frozen. Actual-cache commit is independently read, never inferred from candidate identity.
- Single-use ticket methods with exact receiver checks; cross-ticket/fake receiver/replay refusals; copied positive safe counter limit for explicit reduced-exhaustion qualification. Production default remains MAX_SAFE_INTEGER.
- No-observer begin immediately returns undefined without reading operation or snapshot fields. Registry reentry is rejected and latched, including swallowed getter/callback errors. This does not fence arbitrary engine/native writes; a future integrating owner must establish those barriers.
- All-owner pure preflight precedes recorded effects. Effects describe caller-observed JS callsite facts only; the module cannot authenticate a caller's cache provenance or claim a native outcome.
- First error identity is retained for undefined/null/0 as well as objects. Later observer/readback/cleanup errors remain in final diagnostics. Every entered open receives one cleanup attempt, including the open that threw. No cleanup attempt is blindly repeated after unknown outcome.
- `commitCompleted` and `committedOwners` concern trusted JS observer callback return, not native completion. `disposed` means ticket bookkeeping is terminal. `cleanupCompletedOwners` and `cleanupUnresolvedOwners` separately prevent failed cleanup from being reported as confirmed barrier release. Owners remain responsible for resolving their actual cleanup failure.

## Original failures retained, not relabeled

Each attempt resides in `tools/verify/box3d/physics-state-observer-evidence-20261022-<suffix>/`. Run command:

`node tools/verify/box3d/physics-state-observer-control.mjs tools/verify/box3d/physics-state-observer-evidence-20261022-<suffix>`

Each directory retains its exact copied inputs, `result.json`, `command.raw.txt`, `exit-code.txt`, and where applicable `format.raw.txt` / `tsc.raw.txt`.

| Suffix | Exit | Result                        | Attribution                                                                                                                 |
| ------ | ---- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| red    | 1    | missing source, zero controls | TDD availability RED only, explicitly **not an engine/native defect**                                                       |
| a      | 1    | 66/67 controls; tsc failed    | Fixture compared error identity across two different attempts; seven new source typing errors                               |
| b      | 1    | 71/73 controls; tsc failed    | New diagnostic fields omitted from result/initial state; two typing errors                                                  |
| c-red  | 1    | 71/76 controls; tsc failed    | Preserves b failures plus actual B0 begin/open failure losing the ticket and final cleanup diagnostics for undefined/null/0 |
| c      | 1    | 75/76 controls; tsc passed    | New cleanup-completed counter was not incremented; source bookkeeping defect                                                |
| d      | 0    | 76/76; format/tsc passed      | First finite green with reachable final diagnostics                                                                         |
| e      | 0    | 76/76; format/tsc passed      | Same behavior, full MIT control header                                                                                      |

Earlier a/b/c-red format commands used the repo default ignore list and skipped the new src/cocos file; their zero format exit is not source-format qualification. c/d/e explicitly use `--ignore-path /dev/null` on only the new source and runner. No existing extracted source was reformatted.

## Integration obligations deliberately not implemented

No Cocos callsite invokes this module yet. No actual owner registration, mutation fence, material native delegate authority, private subscription integrity, pause transition, queue consumer, target grant, listener dispatch or cache getter is wired by B0. Snapshot range support and strict actual Component/System identity remain owner-level responsibilities. Trusted callbacks must be synchronous and obey their preflight/cleanup contracts; this module is not a sandbox for arbitrary user callbacks, asynchronous effects or mutated built-ins.

The integrating callsite must obtain its ticket before entering a try/finally, invoke prepare before reading arbitrary snapshots, preserve the first thrown value, and inspect final diagnostics after cleanup. A created ticket reserves only registry roster identity, not actual engine mutation barriers, until prepare opens owners. Failed cleanup remains unresolved and must not be mistaken for safe transaction reactivation.

Parent's later lifecycle/pause decision document is not changed by this primitive. Existing material/pause design and both B0 contracts remain intact; contract-b replaces only the earlier begin/open timing and clarifies final cleanup accounting.
