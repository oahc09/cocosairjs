/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Pure wrapper/B0 controls only. No actual World integration or physical qualification.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { PhysicsSystemControlRegistry } = require(process.env.WRAPPER_COMPILED || './compile-c/compiled/physics-system-control.js');
const rows = [];
const caught = (fn) => {
    try { fn(); return { thrown: false }; }
    catch (error) { return { thrown: true, error }; }
};
function run(name, action) {
    const row = { name, status: 'RUNNING' };
    rows.push(row);
    try { action(); row.status = 'PASS_PURE_WRAPPER_ONLY'; }
    catch (error) { row.status = 'FAIL_PURE_WRAPPER_ONLY'; row.error = { name: error?.name, message: String(error), stack: error?.stack }; }
}
function fixture(overrides = {}, disposition = () => 'ready', initial = { enabled: true, autoSimulation: true }) {
    const registry = new PhysicsSystemControlRegistry();
    const target = {};
    const fields = { ...initial };
    const calls = [];
    let reads = 0;
    registry.installSource(target, () => { reads++; return { ...fields }; });
    const observer = {
        open(context) { calls.push(['open', context]); },
        preflight(context, before, candidate) { calls.push(['preflight', context, before, candidate]); },
        commit(context, actual) { calls.push(['commit', context, actual]); },
        fail(context, failure) { calls.push(['fail', context, failure]); },
        dispose(context) { calls.push(['dispose', context]); },
        ...overrides,
    };
    const lease = registry.register(target, observer, disposition);
    return { registry, target, fields, calls, lease, observer, reads: () => reads };
}
const snapshot = (fields) => ({ kind: 'system-control', ...fields });
function prepare(f, op = 'system-enable', changes = { enabled: false }) {
    const ticket = f.registry.begin(f.target, op);
    ticket.prepare(() => ({ before: snapshot(f.fields), candidate: snapshot({ ...f.fields, ...changes }) }));
    return ticket;
}
run('unobserved controls do not read source or validate operation', () => {
    const registry = new PhysicsSystemControlRegistry(), target = {};
    let calls = 0;
    registry.installSource(target, () => { calls++; throw new Error('unobserved reader must not execute'); });
    assert.equal(registry.begin(target, 'unrecognized-unobserved'), undefined);
    assert.equal(registry.disposition(target), undefined);
    registry.assertManualStep(target);
    assert.equal(calls, 0);
});
run('bootstrap reader uses closure without public getters, before registration or live binding', () => {
    const registry = new PhysicsSystemControlRegistry();
    const target = Object.defineProperty({}, 'enable', { get() { throw Error('public getter'); } });
    registry.installSource(target, () => ({ enabled: false, autoSimulation: true }));
    assert.deepEqual(registry.readState(target), { kind: 'system-control', enabled: false, autoSimulation: true });
    assert(Object.isFrozen(registry.readState(target)));
});
run('registration initial false pauses manual without opening owner or using selector', () => {
    const f = fixture({}, () => 'ready', { enabled: false, autoSimulation: true });
    assert.equal(f.lease.initialState.enabled, false);
    assert(Object.isFrozen(f.lease.initialState));
    assert.equal(f.calls.length, 0);
    assert.equal(f.registry.disposition(f.target), 'paused');
    assert(caught(() => f.registry.assertManualStep(f.target)).thrown);
});
for (const key of ['enabled', 'autoSimulation']) for (const value of [0, 1, null, undefined, {}])
    run(`strict observed ${key} rejects ${String(value)} before cache write and preserves terminal failure`, () => {
        const f = fixture();
        const ticket = f.registry.begin(f.target, key === 'enabled' ? 'system-enable' : 'system-auto-simulation');
        const failure = caught(() => ticket.prepare(() => ({ before: snapshot(f.fields), candidate: snapshot({ ...f.fields, [key]: value }) })));
        assert(failure.thrown);
        assert(failure.error instanceof TypeError);
        assert.equal(caught(() => ticket.fail(Error('secondary catch argument'))).error, failure.error);
        ticket.dispose();
        assert.equal(f.fields[key], true);
        assert.equal(f.calls.filter(v => v[0] === 'dispose').length, 1);
    });
run('normal cache-first commit records actual flags with one callback per phase', () => {
    const f = fixture();
    const ticket = prepare(f);
    f.fields.enabled = false;
    ticket.effect('cache-written');
    ticket.commit(() => snapshot(f.fields));
    ticket.dispose();
    assert.deepEqual(f.calls.map(v => v[0]), ['open', 'preflight', 'commit', 'dispose']);
    assert.equal(f.calls[2][2].enabled, false);
    assert.equal(ticket.diagnostics().commitCompleted, true);
    assert.equal(f.registry.disposition(f.target), 'paused');
});
run('autoSimulation false alone keeps explicit manual disposition ready', () => {
    const f = fixture();
    const ticket = prepare(f, 'system-auto-simulation', { autoSimulation: false });
    f.fields.autoSimulation = false;
    ticket.effect('cache-written');
    ticket.commit(() => snapshot(f.fields));
    assert.equal(f.registry.disposition(f.target), 'ready');
    f.registry.assertManualStep(f.target);
});
for (const phase of ['open', 'preflight', 'commit', 'dispose']) for (const error of [undefined, null, 0, false, ''])
    run(`${phase} falsy throw ${String(error)} retains first identity through catch/finally`, () => {
        let cleanups = 0;
        const f = fixture({ [phase]() { if (phase === 'dispose') cleanups++; throw error; },
            ...(phase === 'dispose' ? {} : { dispose() { cleanups++; } }) });
        const ticket = f.registry.begin(f.target, 'system-enable');
        const failure = caught(() => {
            ticket.prepare(() => ({ before: snapshot(f.fields), candidate: snapshot({ ...f.fields, enabled: false }) }));
            f.fields.enabled = false;
            ticket.effect('cache-written');
            ticket.commit(() => snapshot(f.fields));
        });
        assert.equal(failure.thrown, true);
        assert(Object.is(failure.error, error));
        const repeated = caught(() => ticket.fail(new Error('outer catch must not replace original')));
        assert.equal(repeated.thrown, true);
        assert(Object.is(repeated.error, error));
        ticket.dispose();
        assert.equal(cleanups, 1);
        assert.equal(ticket.diagnostics().hasFailure, true);
    });
run('primary falsy plus cleanup throw retains primary and secondary independently', () => {
    const secondary = new Error('cleanup');
    const f = fixture({ preflight() { throw 0; }, dispose() { throw secondary; } });
    const ticket = f.registry.begin(f.target, 'system-enable');
    assert.equal(caught(() => ticket.prepare(() => ({ before: snapshot(f.fields), candidate: snapshot(f.fields) }))).error, 0);
    const d = ticket.diagnostics();
    assert.equal(d.error, 0);
    assert(d.secondaryErrors.includes(secondary));
    assert.equal(d.cleanupUnresolvedOwners, 1);
    assert.equal(d.cleanupCompletedOwners, 0);
});
run('observer callbacks copied once and duplicate owner registration leaves first installed', () => {
    const f = fixture();
    f.observer.open = () => { throw Error('late override'); };
    assert(caught(() => f.registry.register(f.target, f.observer, () => 'ready')).thrown);
    const ticket = prepare(f);
    ticket.dispose();
    assert.equal(f.calls[0][0], 'open');
    f.lease.dispose();
    f.lease.dispose();
    assert.equal(f.registry.disposition(f.target), undefined);
});
run('active control refuses manual before private source or owner disposition reads', () => {
    let dispositionReads = 0;
    const f = fixture({}, () => { dispositionReads++; return 'ready'; });
    const ticket = prepare(f), reads = f.reads();
    assert(caught(() => f.registry.assertManualStep(f.target)).thrown);
    assert.equal(f.reads(), reads);
    assert.equal(dispositionReads, 0);
    ticket.dispose();
});
run('caught nested execution admission latches failure without disposing ownership', () => {
    let nested = true, first;
    let f;
    f = fixture({}, () => {
        if (nested) first = caught(() => f.registry.begin(f.target, 'system-enable')).error;
        return 'ready';
    });
    const result = caught(() => f.registry.disposition(f.target));
    assert(result.thrown);
    assert.equal(result.error, first);
    nested = false;
    assert.equal(f.registry.disposition(f.target), 'ready');
});
for (const error of [undefined, null, 0, false, ''])
    run(`owner disposition fault ${String(error)} is not relabeled paused or absent`, () => {
        const f = fixture({}, () => { throw error; });
        const result = caught(() => f.registry.assertManualStep(f.target));
        assert(result.thrown);
        assert(Object.is(result.error, error));
    });
run('lease release attempted and caught in open fails outer admission without unregistering owner', () => {
    let f, nested;
    f = fixture({ open() { nested = caught(() => f.lease.dispose()).error; } });
    const ticket = f.registry.begin(f.target, 'system-enable');
    const result = caught(() => ticket.prepare(() => ({ before: snapshot(f.fields), candidate: snapshot(f.fields) })));
    assert(result.thrown);
    assert.equal(result.error, nested);
    assert.equal(f.registry.disposition(f.target), 'ready');
});
run('stale lease cannot remove replacement owner; fabricated ticket receiver has no effect', () => {
    const f = fixture();
    f.lease.dispose();
    const replacement = f.registry.register(f.target, f.observer, () => 'paused');
    f.lease.dispose();
    assert.equal(f.registry.disposition(f.target), 'paused');
    const ticket = f.registry.begin(f.target, 'system-enable');
    assert(caught(() => ticket.prepare.call({}, () => { throw Error('must not read'); })).thrown);
    ticket.dispose();
    replacement.dispose();
});
run('disposition callback receives no private Entry receiver', () => {
    let receiver = 'not-called';
    const f = fixture({}, function () { 'use strict'; receiver = this; return 'ready'; });
    assert.equal(f.registry.disposition(f.target), 'ready');
    assert.equal(receiver, undefined);
});
const artifacts = ['physics-system-control.ts', 'physics-state-observer.ts', 'physics-system.ts', 'wrapper-control.cjs'].map(name => {
    const bytes = fs.readFileSync(path.join(__dirname, name));
    return { path: name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
});
const result = { scope: 'Pure wrapper/B0 JS only; no actual owner, queues, producers, WASM or physics qualification.',
    status: rows.every(v => v.status === 'PASS_PURE_WRAPPER_ONLY') ? 'PASS_PURE_WRAPPER_ONLY' : 'FAIL_PURE_WRAPPER_ONLY',
    formalRequiredCells: { count: 2128, status: 'NOT_RUN' }, stagedCommandsSupported: false, unifiedTransactionsSupported: false,
    rows, artifacts };
fs.writeFileSync(path.join(__dirname, process.env.WRAPPER_RAW || 'wrapper-a.raw.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, total: rows.length, failed: rows.filter(v => v.status !== 'PASS_PURE_WRAPPER_ONLY') }));
if (result.status !== 'PASS_PURE_WRAPPER_ONLY') process.exitCode = 1;
