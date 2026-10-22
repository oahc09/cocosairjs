/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Pure participant controls only. No System/Box3D owner, native binding or WASM is executed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const candidate = path.join(root, 'box3d-pause-owner-candidate-20261022');
const repo = path.join(root, 'box3d-rebuild-20261022');
const ts = createRequire(path.join(repo, 'package.json'))('typescript');
const out = path.join(here, process.argv[2] ?? 'attempt-a');
await mkdir(out); // Never overwrite a previous attempt.
const sha = (s) => createHash('sha256').update(s).digest('hex');
const tracked = [
    path.join(candidate, 'command-queue.ts'),
    path.join(candidate, 'command-producers.ts'),
    path.join(candidate, 'before.json'),
    path.join(candidate, 'before/command-queue.ts'),
    path.join(candidate, 'before/command-producers.ts'),
    fileURLToPath(import.meta.url),
    path.join(repo, 'docs/physics/box3d/contracts/unified-owner-lifecycle-decisions-v1.md'),
    path.join(repo, 'docs/physics/box3d/contracts/unified-command-decisions-v1.md'),
];
const hashes = async () =>
    Object.fromEntries(await Promise.all(tracked.map(async (p) => [path.relative(root, p), sha(await readFile(p))])));
const before = await hashes(),
    startedAt = new Date().toISOString();
const loaded = {};
let Queue, Producers;
try {
    const beforeManifest = JSON.parse(await readFile(path.join(candidate, 'before.json'), 'utf8'));
    for (const name of ['command-queue.ts', 'command-producers.ts']) {
        assert.equal(
            sha(await readFile(path.join(candidate, 'before', name))),
            beforeManifest.find((e) => e.path.endsWith('/' + name)).sha256,
        );
    }
    const load = async (name) => {
        const source = await readFile(path.join(candidate, name), 'utf8');
        loaded[name] = sha(source);
        const result = ts.transpileModule(source, {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
            reportDiagnostics: true,
        });
        assert.deepEqual(
            (result.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error),
            [],
        );
        return import(`data:text/javascript;base64,${Buffer.from(result.outputText).toString('base64')}`);
    };
    Queue = (await load('command-queue.ts')).Box3DCommandQueue;
    Producers = (await load('command-producers.ts')).Box3DCommandProducers;
} catch (e) {
    await writeFile(
        path.join(out, 'setup-error.json'),
        JSON.stringify(
            { status: 'SETUP_ERROR_NOT_PRODUCT_RED', error: String(e), stack: e?.stack, before, loaded },
            null,
            2,
        ) + '\n',
    );
    throw e;
}
const rows = [];
const test = (name, fn) => {
    try {
        rows.push({ name, status: 'PASS_PURE_PARTICIPANT_CONTROL', observed: fn() ?? null });
    } catch (e) {
        rows.push({
            name,
            status: 'FAIL_CONTROL_ASSERTION',
            error: String(e),
            stack: e?.stack,
            actual: e?.actual,
            expected: e?.expected,
        });
    }
};
const caught = (fn) => {
    let didThrow = false,
        value;
    try {
        fn();
    } catch (e) {
        didThrow = true;
        value = e;
    }
    assert.equal(didThrow, true);
    return value;
};
const pose = { position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
const vector = { x: 2, y: 3, z: 4 };
function setup() {
    const q = new Queue({ generation: 37 });
    const body = {},
        active = {},
        protectedBody = {};
    for (const b of [body, active, protectedBody]) q.registerBody(b);
    const valid = new Set([body, active, protectedBody]);
    const state = { hookCalls: 0, configurationCalls: 0, submits: 0, injected: null };
    const p = new Producers({
        assertConfiguration(op, allowPaused) {
            state.configurationCalls++;
            if (state.injected) state.injected(op, allowPaused);
        },
        validateContinuousBody(b) {
            assert(valid.has(b));
        },
        submit(b, c) {
            state.submits++;
            return q.submit(b, c);
        },
    });
    const hook = p.registerBeforeStep(() => {
        state.hookCalls++;
        q.submit(body, { kind: 'clear-forces' });
    });
    const continuous = p.registerContinuous(body, { force: vector, torque: vector });
    q.acquireTarget(active);
    q.acquireTarget(protectedBody);
    q.revokeTarget(protectedBody);
    q.submit(body, { kind: 'impulse', vector });
    q.submit(active, { kind: 'target', pose });
    const collect = () => {
        const lease = p.snapshot();
        try {
            return q.collect(1 / 60, 4, lease.callbacks);
        } finally {
            lease.dispose();
        }
    };
    return { q, p, body, active, protectedBody, valid, state, hook, continuous, collect };
}
function accepted(s) {
    const { preparedControl, ...q } = s.q.diagnostics();
    const { preparedControl: ignored, ...p } = s.p.diagnostics();
    return { q, p, hook: [s.hook.enabled, s.hook.disposed], continuous: [s.continuous.enabled, s.continuous.disposed] };
}
function transitionBoth(s, paused) {
    let q, p;
    try {
        q = s.q.preparePauseTransition(paused);
        p = s.p.preparePauseTransition(paused);
        q.commit();
        p.commit();
    } finally {
        p?.dispose();
        q?.dispose();
    }
}
function rejectCandidate(q, c) {
    const observed = c.operations.map((r) => ({ source: r.source, kind: r.command.kind }));
    q.rejectCandidate(c);
    return observed;
}
for (const part of ['q', 'p']) {
    test(`${part}: cancel preparation preserves accepted state and references`, () => {
        const s = setup(),
            before = accepted(s),
            pending = s.q.diagnostics().pending;
        const t = s[part].preparePauseTransition(true);
        assert.equal(s[part].diagnostics().preparedControl, true);
        assert.deepEqual(accepted(s), before);
        t.dispose();
        t.dispose();
        assert.deepEqual(accepted(s), before);
        assert.equal(s.q.diagnostics().pending, pending);
        assert.deepEqual(t.diagnostics(), { paused: true, committed: false, disposed: true });
        return { pendingRetainedByIdentity: true, acceptedUnchanged: true };
    });
    for (const [label, bad] of [
        ['undefined', undefined],
        ['null', null],
        ['zero', 0],
        ['one', 1],
        ['string', 'false'],
        ['object', {}],
        ['boxed', new Boolean(false)],
        ['array', []],
        ['symbol', Symbol('false')],
    ]) {
        test(`${part}: strict pause boolean ${label} refuses without reservation`, () => {
            const s = setup(),
                before = accepted(s);
            caught(() => s[part].preparePauseTransition(bad));
            assert.deepEqual(accepted(s), before);
            assert.equal(s[part].diagnostics().preparedControl, false);
        });
    }
    test(`${part}: wrong receivers do not consume reservation`, () => {
        const s = setup(),
            t = s[part].preparePauseTransition(true);
        for (const receiver of [undefined, {}, Object.create(t)]) {
            caught(() => t.commit.call(receiver));
            caught(() => t.dispose.call(receiver));
            assert.deepEqual(t.diagnostics(), { paused: true, committed: false, disposed: false });
            assert.equal(s[part].diagnostics().preparedControl, true);
        }
        t.commit();
        caught(() => t.commit());
        assert.equal(t.diagnostics().committed, true);
        assert.equal(s[part].diagnostics().preparedControl, true);
        t.dispose();
        caught(() => t.commit());
        return { rejectedWrongReceivers: 6, rejectedConsumedCommit: true };
    });
    test(`${part}: stale dispose cannot release newer transition`, () => {
        const s = setup(),
            old = s[part].preparePauseTransition(true);
        old.dispose();
        const next = s[part].preparePauseTransition(false);
        old.dispose();
        caught(() => old.commit());
        assert.equal(s[part].diagnostics().preparedControl, true);
        next.commit();
        next.dispose();
    });
    test(`${part}: prototype method wrong receiver rejects before state access`, () => {
        caught(() => safelyExtract(part).call({}));
        function safelyExtract(part) {
            return (part === 'q' ? Queue : Producers).prototype.preparePauseTransition;
        }
    });
}
test('queue reservation excludes all public mutation before and after commit', () => {
    const s = setup(),
        q = s.q,
        t = q.preparePauseTransition(true);
    const fake = {};
    const actions = {
        register: () => q.registerBody({}),
        release: () => q.releaseBodyAfterTeardown(s.body),
        acquire: () => q.acquireTarget(s.body),
        revoke: () => q.revokeTarget(s.active),
        submit: () => q.submit(s.body, { kind: 'clear-state' }),
        withAdmission: () =>
            q.withSubmissionAdmission(() => {
                throw Error('reader must not run');
            }),
        cancel: () => q.cancelPending(s.body),
        collect: () => q.collect(1 / 60, 4),
        rejectCandidate: () => q.rejectCandidate(fake),
        beginCommit: () => q.beginCommit(fake),
        finishCommit: () => q.finishCommit(fake, 'committed'),
        complete: () => q.completeTick(fake),
        fault: () => q.faultAfterCommit(fake, false),
        prepare: () => q.preparePauseTransition(false),
        pause: () => q.pause(),
        resume: () => q.resume(),
        close: () => q.close(),
    };
    const check = () => {
        const before = q.diagnostics();
        for (const action of Object.values(actions)) caught(action);
        assert.deepEqual(q.diagnostics(), before);
    };
    check();
    t.commit();
    check();
    t.dispose();
    return { mutationsRejected: Object.keys(actions), phases: ['prepared', 'committed-before-dispose'] };
});
test('producer reservation excludes live handle and lifecycle mutation before and after commit', () => {
    const s = setup(),
        p = s.p,
        t = p.preparePauseTransition(true);
    const actions = {
        registerHook: () => p.registerBeforeStep(() => {}),
        registerContinuous: () => p.registerContinuous(s.body, {}),
        snapshot: () => p.snapshot(),
        prepare: () => p.preparePauseTransition(false),
        pause: () => p.pause(),
        resume: () => p.resume(),
        retire: () => p.retireBody(s.body),
        close: () => p.close(),
        hookEnable: () => s.hook.enable(),
        hookDisable: () => s.hook.disable(),
        hookDispose: () => s.hook.dispose(),
        continuousEnable: () => s.continuous.enable(),
        continuousDisable: () => s.continuous.disable(),
        continuousDispose: () => s.continuous.dispose(),
        continuousUpdate: () => s.continuous.update({}),
    };
    const check = () => {
        const before = accepted(s),
            calls = s.state.configurationCalls;
        for (const action of Object.values(actions)) caught(action);
        assert.deepEqual(accepted(s), before);
        assert.equal(s.state.configurationCalls, calls);
    };
    check();
    t.commit();
    check();
    t.dispose();
    return { mutationsRejected: Object.keys(actions), ownerNotCalled: true };
});
test('second prepare active-roster refusal leaves queue uncommitted and pending intact', () => {
    const s = setup(),
        lease = s.p.snapshot(),
        before = accepted(s),
        pending = s.q.diagnostics().pending;
    caught(() => transitionBoth(s, true));
    assert.deepEqual(accepted(s), before);
    assert.equal(s.q.diagnostics().pending, pending);
    assert.equal(s.q.diagnostics().preparedControl, false);
    assert.equal(s.p.diagnostics().preparedControl, false);
    lease.dispose();
    return { firstParticipantCommitted: false, queueReservationReleased: true };
});
for (const [label, thrown] of [
    ['undefined', undefined],
    ['null', null],
    ['false', false],
    ['zero', 0],
    ['empty', ''],
]) {
    test(`second prepare owner falsy ${label} retains exact error and both states`, () => {
        const s = setup(),
            before = accepted(s);
        s.state.injected = () => {
            throw thrown;
        };
        assert.equal(
            caught(() => transitionBoth(s, true)),
            thrown,
        );
        assert.deepEqual(accepted(s), before);
        assert.equal(s.q.diagnostics().preparedControl, false);
        assert.equal(s.p.diagnostics().preparedControl, false);
        s.state.injected = null;
        transitionBoth(s, true);
        assert.equal(s.q.diagnostics().phase, 'paused');
    });
}
test('reverse prepare order refusal releases producer reservation without disabling handles', () => {
    const s = setup(),
        candidate = s.q.collect(1 / 60, 4),
        before = accepted(s);
    let first;
    caught(() => {
        try {
            first = s.p.preparePauseTransition(true);
            s.q.preparePauseTransition(true);
        } finally {
            first?.dispose();
        }
    });
    assert.deepEqual(accepted(s), before);
    assert.equal(s.p.diagnostics().preparedControl, false);
    s.q.rejectCandidate(candidate);
});
test('caught producer reentry in owner prepare invalidates outer and cancels queue reservation', () => {
    const s = setup(),
        before = accepted(s);
    let nested;
    s.state.injected = () => {
        nested = caught(() => s.p.pause());
    };
    caught(() => transitionBoth(s, true));
    assert(nested);
    assert.deepEqual(accepted(s), before);
    assert.equal(s.q.diagnostics().preparedControl, false);
    assert.equal(s.p.diagnostics().preparedControl, false);
});
test('prepared commits invoke no owner validation or user callback', () => {
    const s = setup(),
        q = s.q.preparePauseTransition(true),
        p = s.p.preparePauseTransition(true);
    const calls = s.state.configurationCalls;
    s.state.injected = () => {
        throw Error('must not run during commit');
    };
    q.commit();
    p.commit();
    assert.equal(s.state.configurationCalls, calls);
    assert.equal(s.state.hookCalls, 0);
    assert.equal(s.state.submits, 0);
    p.dispose();
    q.dispose();
    assert.equal(s.q.diagnostics().phase, 'paused');
    assert.equal(s.p.diagnostics().paused, true);
});
test('explicit injected failure between commits retains truthful partial state, no invented rollback', () => {
    const s = setup(),
        q = s.q.preparePauseTransition(true),
        p = s.p.preparePauseTransition(true);
    const injected = { label: 'HARNESS_ONLY_AFTER_QUEUE_COMMIT' };
    assert.equal(
        caught(() => {
            try {
                q.commit();
                throw injected;
            } finally {
                p.dispose();
                q.dispose();
            }
        }),
        injected,
    );
    assert.equal(s.q.diagnostics().phase, 'paused');
    assert.equal(s.q.diagnostics().pending.length, 0);
    assert.equal(s.p.diagnostics().paused, false);
    assert.equal(s.continuous.enabled, true);
    return { queueCommitted: true, producerCommitted: false, ownerFaulting: 'NOT_TESTED_NO_ACTUAL_OWNER' };
});
test('paused registerBody admits configuration without target acquisition or submissions', () => {
    const s = setup();
    transitionBoth(s, true);
    const newBody = {};
    s.q.registerBody(newBody);
    assert.equal(s.q.diagnostics().bodies, 4);
    assert.equal(s.q.diagnostics().protectedZeros, 1);
    caught(() => s.q.registerBody(newBody));
    caught(() => s.q.acquireTarget(newBody));
    caught(() => s.q.submit(newBody, { kind: 'target', pose }));
    caught(() => s.q.submit(newBody, { kind: 'clear-state' }));
    caught(() => s.q.collect(1 / 60, 4));
    caught(() => s.q.cancelPending(newBody));
    transitionBoth(s, false);
    caught(() => s.q.submit(newBody, { kind: 'target', pose }));
    s.q.submit(newBody, { kind: 'impulse', vector });
    return { newBodyHasNoTargetGrant: true, bodies: 4, protectedZeros: 1 };
});
test('pause drops pending target movement but preserves logical grant and protected-zero obligation', () => {
    const s = setup(),
        before = s.q.diagnostics();
    transitionBoth(s, true);
    const d = s.q.diagnostics();
    assert.equal(d.pending.length, 0);
    assert.equal(d.sequence, before.sequence);
    assert.equal(d.completedTicks, 0);
    assert.equal(d.attemptId, 0);
    assert.equal(d.protectedZeros, 1);
    transitionBoth(s, false);
    const candidate = s.q.collect(1 / 60, 4);
    assert.deepEqual(
        candidate.operations.map((r) => [r.source, r.command.kind]),
        [
            ['idle', 'target-clear'],
            ['protected', 'target-clear'],
        ],
    );
    rejectCandidate(s.q, candidate);
    assert.equal(s.q.diagnostics().protectedZeros, 1);
    caught(() => s.q.acquireTarget(s.active));
    caught(() => s.q.acquireTarget(s.protectedBody));
    s.q.submit(s.active, { kind: 'target', pose });
    return { grant: 'LOGICAL_QUEUE_ONLY', nativeTargetGrant: 'NOT_INTEGRATED', protectedZerosPreserved: true };
});
test('canceling resume leaves paused state; committed resume preserves sequence/zero obligations', () => {
    const s = setup();
    transitionBoth(s, true);
    const before = accepted(s),
        q = s.q.preparePauseTransition(false),
        p = s.p.preparePauseTransition(false);
    p.dispose();
    q.dispose();
    assert.deepEqual(accepted(s), before);
    transitionBoth(s, false);
    assert.equal(s.q.diagnostics().sequence, before.q.sequence);
    assert.equal(s.q.diagnostics().protectedZeros, 1);
    assert.equal(s.continuous.enabled, false);
});
test('same-state resume in ready mode preserves accepted queue and continuous enabled metadata', () => {
    const s = setup(),
        before = accepted(s),
        pending = s.q.diagnostics().pending;
    transitionBoth(s, false);
    assert.deepEqual(accepted(s), before);
    assert.equal(s.q.diagnostics().pending, pending);
});
test('nonempty hooks resume in stable order, continuous remains disabled until explicit enable', () => {
    const s = setup();
    let tail = 0;
    const disabled = s.p.registerBeforeStep(
        () => {
            throw Error('disabled hook must not run');
        },
        { enabled: false },
    );
    s.p.registerBeforeStep(() => {
        tail++;
        s.q.submit(s.body, { kind: 'clear-state' });
    });
    transitionBoth(s, true);
    assert.equal(s.hook.enabled, true);
    assert.equal(s.continuous.enabled, false);
    assert.equal(disabled.enabled, false);
    caught(() => s.p.snapshot());
    assert.equal(s.state.hookCalls, 0);
    assert.equal(s.state.submits, 0);
    assert.equal(tail, 0);
    transitionBoth(s, false);
    const one = s.collect();
    assert.deepEqual(
        one.operations.map((r) => r.command.kind),
        ['clear-forces', 'clear-state', 'target-clear', 'target-clear'],
    );
    rejectCandidate(s.q, one);
    assert.equal(s.state.hookCalls, 1);
    assert.equal(tail, 1);
    assert.equal(s.state.submits, 0);
    s.continuous.enable();
    const two = s.collect();
    assert.deepEqual(
        two.operations.map((r) => r.command.kind),
        ['clear-forces', 'force', 'torque', 'clear-state', 'target-clear', 'target-clear'],
    );
    rejectCandidate(s.q, two);
    assert.equal(s.state.hookCalls, 2);
    assert.equal(tail, 2);
    assert.equal(s.state.submits, 2);
    return {
        pureRosterCallsOnly: true,
        pausedHookCalls: 0,
        resumedHookCalls: 2,
        continuousContributionsAfterExplicitEnable: 2,
    };
});
test('paused cleanup disable/dispose/retire remains possible while register/update/enable rejects', () => {
    const s = setup();
    transitionBoth(s, true);
    for (const fn of [
        () => s.p.registerBeforeStep(() => {}),
        () => s.p.registerContinuous(s.body, {}),
        () => s.continuous.update({}),
        () => s.continuous.enable(),
        () => s.hook.enable(),
    ])
        caught(fn);
    s.hook.disable();
    s.hook.dispose();
    s.p.retireBody(s.body);
    assert.equal(s.hook.disposed, true);
    assert.equal(s.continuous.disposed, true);
    assert.equal(s.p.diagnostics().liveProducers, 0);
    s.q.releaseBodyAfterTeardown(s.protectedBody);
    assert.equal(s.q.diagnostics().protectedZeros, 0);
    s.p.close();
    s.q.close();
    assert.equal(s.p.diagnostics().closed, true);
    assert.equal(s.q.diagnostics().phase, 'closed');
    return { teardownNotification: 'HARNESS_LOGICAL_ONLY_NOT_NATIVE_TEARDOWN_PROOF' };
});
test('stale roster cannot execute after pause and re-enable validation detects invalid body', () => {
    const s = setup(),
        old = s.p.snapshot();
    old.dispose();
    transitionBoth(s, true);
    transitionBoth(s, false);
    for (const cb of old.callbacks)
        caught(() => cb({ tickIndex: 1, attemptId: 1, fixedDt: 1 / 60, solverSubSteps: 4 }));
    s.valid.delete(s.body);
    caught(() => s.continuous.enable());
    assert.equal(s.continuous.enabled, false);
    assert.equal(s.state.hookCalls, 0);
    assert.equal(s.state.submits, 0);
});
for (const part of ['q', 'p'])
    test(`${part}: closed participant cannot prepare or resurrect`, () => {
        const s = setup();
        s[part].close();
        caught(() => s[part].preparePauseTransition(false));
        assert.equal(s[part].diagnostics().preparedControl, false);
    });
const after = await hashes();
const stable = JSON.stringify(before) === JSON.stringify(after);
const raw = {
    schema: 'box3d-pause-participant-review-v1',
    status:
        stable && rows.every((r) => r.status === 'PASS_PURE_PARTICIPANT_CONTROL')
            ? 'PASS_PURE_PARTICIPANT_CONTROLS'
            : 'FAIL_REVIEW',
    startedAt,
    endedAt: new Date().toISOString(),
    candidateLoadedSHA256: loaded,
    sourceBefore: before,
    sourceAfter: after,
    sourceStable: stable,
    counts: {
        total: rows.length,
        pass: rows.filter((r) => r.status === 'PASS_PURE_PARTICIPANT_CONTROL').length,
        fail: rows.filter((r) => r.status !== 'PASS_PURE_PARTICIPANT_CONTROL').length,
    },
    boundaries: {
        actualSystem: 'NOT_RUN',
        actualOwner: 'NOT_RUN',
        native: 'NOT_RUN',
        wasm: 'NOT_RUN',
        actualProducerConnection: 'NOT_INTEGRATED',
        formalCells: '2128_NOT_RUN',
        stagedCommandsSupported: false,
        unifiedTransactionsSupported: false,
    },
    rows,
};
await writeFile(path.join(out, 'controls.raw.json'), JSON.stringify(raw, null, 2) + '\n');
console.log(
    JSON.stringify({ status: raw.status, counts: raw.counts, sourceStable: stable, sourceSHA256: loaded }, null, 2),
);
for (const row of rows.filter((r) => r.status !== 'PASS_PURE_PARTICIPANT_CONTROL'))
    console.error(row.name + '\n' + row.stack);
process.exitCode = raw.status === 'PASS_PURE_PARTICIPANT_CONTROLS' ? 0 : 1;
