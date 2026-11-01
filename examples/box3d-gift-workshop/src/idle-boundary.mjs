/** Scene-bound idle orchestration. No private owner controls or implicit resume. */
export function createIdleBoundary(ops) {
    let terminal = 'pending';
    const finishTerminal = (reason = 'RESULT') => {
        if (!ops.isCurrent()) return { status: 'stale' };
        if (terminal !== 'pending') return { status: terminal };
        if (ops.isPaused()) {
            ops.clearPausedIntent(); // JS-only; an already paused owner cannot accept target-clear.
            return { status: 'deferred-paused' };
        }
        try {
            ops.stopTerminal();
            ops.flushTransport();
            ops.flushFlow();
            ops.flushDoor();
            terminal = 'settled'; // Only after every synchronous native cleanup succeeds.
        } catch (error) {
            terminal = 'failed';
            throw error;
        }
        ops.captureTerminal(reason);
        return { status: terminal };
    };
    return Object.freeze({
        // Used only by the recovery idle owner for its immediate penalty RESULT.
        finishTerminal,
        afterPhysics() {
            if (!ops.isCurrent()) return { status: 'stale' };
            if (ops.isRecoveryBusy()) return { status: 'recovery-owned' };
            if (ops.isTerminal()) return finishTerminal();
            if (ops.isPaused()) return { status: 'paused' };
            ops.flushTransport();
            ops.flushFlow();
            ops.flushDoor();
            return { status: 'flushed' };
        },
    });
}
