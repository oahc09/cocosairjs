import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdleBoundary } from '../src/idle-boundary.mjs';
function fixture() {
    const state = { current: true, paused: false, recoveryBusy: false, terminal: true, fail: false };
    const calls = [];
    const native = (name) => () => {
        if (state.paused) throw Error('paused guard');
        calls.push(name);
    };
    const boundary = createIdleBoundary({
        isCurrent: () => state.current,
        isPaused: () => state.paused,
        isRecoveryBusy: () => state.recoveryBusy,
        isTerminal: () => state.terminal,
        clearPausedIntent: () => calls.push('js-clear-only'),
        stopTerminal: () => {
            native('target-clear')();
            if (state.fail) throw Error('true clear failure');
            calls.push('auto-off');
        },
        flushTransport: native('fixed'),
        flushFlow: native('flow'),
        flushDoor: native('door'),
        captureTerminal: (reason) => {
            calls.push(`capture:${reason}`);
            state.paused = true;
        },
    });
    return { state, calls, boundary };
}
test('two queued terminal callbacks do native cleanup once, including after replay pause', () => {
    const f = fixture();
    assert.equal(f.boundary.afterPhysics().status, 'settled');
    assert.equal(f.boundary.afterPhysics().status, 'settled');
    assert.deepEqual(f.calls, ['target-clear', 'auto-off', 'fixed', 'flow', 'door', 'capture:RESULT']);
});
test('old scene, reset or close callback cannot touch any owner', () => {
    for (const cause of ['reset', 'close', 'new-scene']) {
        const f = fixture();
        f.state.current = false;
        assert.equal(f.boundary.afterPhysics().status, 'stale', cause);
        assert.deepEqual(f.calls, []);
    }
});
test('recovery owns entire idle block, not only flow', () => {
    for (const terminal of [false, true]) {
        const f = fixture();
        f.state.terminal = terminal;
        f.state.recoveryBusy = true;
        assert.equal(f.boundary.afterPhysics().status, 'recovery-owned');
        assert.deepEqual(f.calls, []);
    }
});
test('paused unsettled terminal only clears JS and defers, never enables native', () => {
    const f = fixture();
    f.state.paused = true;
    assert.equal(f.boundary.afterPhysics().status, 'deferred-paused');
    assert.deepEqual(f.calls, ['js-clear-only']);
    f.state.paused = false;
    assert.equal(f.boundary.afterPhysics().status, 'settled');
});
test('normal paused callback never flushes native', () => {
    const f = fixture();
    f.state.paused = true;
    f.state.terminal = false;
    assert.equal(f.boundary.afterPhysics().status, 'paused');
    assert.deepEqual(f.calls, []);
});
test('real native cleanup failure is exposed and never marked settled or captured', () => {
    const f = fixture();
    f.state.fail = true;
    assert.throws(() => f.boundary.afterPhysics(), /true clear failure/);
    assert.equal(f.boundary.afterPhysics().status, 'failed');
    assert.deepEqual(f.calls, ['target-clear']);
});
test('direct 300/299 penalty terminal shares same latch without restoring or another step', () => {
    for (const balance of [300, 299]) {
        const f = fixture();
        f.state.recoveryBusy = true;
        assert.equal(f.boundary.finishTerminal('RECOVERY_PENALTY_RESULT').status, 'settled', String(balance));
        f.state.recoveryBusy = false;
        assert.equal(f.boundary.afterPhysics().status, 'settled');
        assert.deepEqual(f.calls, [
            'target-clear',
            'auto-off',
            'fixed',
            'flow',
            'door',
            'capture:RECOVERY_PENALTY_RESULT',
        ]);
    }
});
test('301 recovery block N does not flush; N+1 terminal settles once', () => {
    const f = fixture();
    f.state.recoveryBusy = true;
    f.state.terminal = false;
    f.boundary.afterPhysics();
    assert.deepEqual(f.calls, []);
    f.state.recoveryBusy = false;
    f.state.terminal = true;
    f.boundary.afterPhysics();
    f.boundary.afterPhysics();
    assert.equal(f.calls.filter((x) => x === 'target-clear').length, 1);
});

test('mechanism replacement retires old queued boundary and new door flushes normally', () => {
    const calls = [];
    let door = { generation: 1 },
        current;
    function install() {
        const ownDoor = door;
        const b = createIdleBoundary({
            isCurrent: () => current === b && ownDoor === door,
            isPaused: () => false,
            isRecoveryBusy: () => false,
            isTerminal: () => false,
            clearPausedIntent: () => {},
            stopTerminal: () => {},
            flushTransport: () => calls.push('fixed'),
            flushFlow: () => calls.push('flow'),
            flushDoor: () => calls.push(`door:${ownDoor.generation}`),
            captureTerminal: () => {},
        });
        current = b;
        return b;
    }
    const old = install();
    door = { generation: 2 };
    const fresh = install();
    assert.equal(old.afterPhysics().status, 'stale');
    assert.deepEqual(calls, []);
    assert.equal(fresh.afterPhysics().status, 'flushed');
    assert.deepEqual(calls, ['fixed', 'flow', 'door:2']);
});
