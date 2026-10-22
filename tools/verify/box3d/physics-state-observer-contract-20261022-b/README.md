# B0 revised ticket lifetime, before source repair

Supersedes only the B0-a begin/open timing. B0-a remains frozen.

`begin(target, operation)` now returns a **created** ticket without executing any observer callback or snapshot reader. It freezes the complete roster and allocates sequence identity. `prepare(reader)` opens every owner barrier first, then reads/copies before and candidate, then runs every pure preflight. Thus a throwing open still leaves the caller holding the actual ticket: original falsy errors are rethrown unchanged, while final diagnostics expose subsequent fail/dispose errors. No global history, error decoration, or public object field is needed.

State: created -> prepared -> committed, or failed/cancelled. All entered opens, including a throwing open, receive exactly one cleanup attempt. A ticket cancelled before prepare opens nothing. Registry mutations on its reserved target are rejected and latch failure until ticket cleanup. There is no engine barrier between begin and prepare; integration must call prepare before reading any arbitrary before/candidate field, not perform unguarded work between these methods.

Final diagnostics separate actualRead (not-requested/copied/failed), cleanupCompletedOwners, and cleanupUnresolvedOwners. disposed denotes terminal ticket bookkeeping, not proof that every owner released its barrier. Cleanup failure is not retried blindly; integration owns unresolved cleanup. commitCompleted counts complete JS observer commits, never native completion.

Required new RED: two opens entered, second throws undefined/null/0, both disposal callbacks throw distinct values. begin must have returned a ticket; prepare throws the exact first value; no snapshot getter runs; final ticket diagnostics retain both cleanup errors and unresolved count 2. The original implementation's begin throws before returning a ticket, which is a real B0 source diagnostic gap, not a native engine defect.

The prior diagnostic-field omission source/tsc failure and fixture cross-attempt error-identity mistake remain separate evidence. Explicit formatting of the new src/cocos file must bypass the repository's broad source-ignore using a scoped empty ignore path; default Prettier runs that skipped it are not source-format qualification.
