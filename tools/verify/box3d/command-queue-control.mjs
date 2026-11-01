/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Pure actual-source queue controls. Mock outcome notifications are NOT native physics evidence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.cwd();
const output = path.resolve(process.argv[2] ?? 'tools/verify/box3d/command-queue-evidence-20261022-a');
await mkdir(output); // Existing evidence is never overwritten.
const sources = ['src/air/physics/box3d/command-queue.ts', 'tools/verify/box3d/command-queue-control.mjs'];
const contracts = [
    'docs/physics/box3d/contracts/unified-command-decisions-v1.md',
    'docs/physics/box3d/contracts/unified-command-api-v1.json',
    'docs/physics/box3d/contracts/unified-command-api-v1.d.ts',
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hashes = async () =>
    Object.fromEntries(await Promise.all([...sources, ...contracts].map(async (p) => [p, sha(await readFile(p))])));
const before = await hashes();
const startedAt = new Date().toISOString();
const text = await readFile(sources[0], 'utf8');
const compiled = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { Box3DCommandQueue: Queue } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`
);
const rows = [];
const test = (name, run) => {
    try {
        const observed = run();
        rows.push({ name, status: 'PASS_PURE_QUEUE_CONTROL', observed: observed ?? null });
    } catch (error) {
        rows.push({ name, status: 'FAIL', error: String(error), stack: error?.stack ?? null });
    }
};
const v = (x = 1, y = 2, z = 3) => ({ x, y, z });
const p = (x = 1) => ({ position: v(x, 0, 0), rotation: { x: 0, y: 0, z: 0, w: 1 } });
const effect = (kind = 'impulse') => ({ kind, vector: v() });
const setup = (options = {}) => {
    const q = new Queue({ generation: 7, ...options });
    const a = {};
    const b = {};
    q.registerBody(a);
    q.registerBody(b);
    return { q, a, b };
};
const collect = (q, callbacks = []) => q.collect(1 / 60, 4, callbacks);
const kinds = (c) => c.operations.map((r) => r.command.kind);
const mockCommit = (q, c, complete = true) => {
    q.beginCommit(c);
    q.finishCommit(c, 'committed');
    if (complete) q.completeTick(c);
};
const rejects = (fn) => assert.throws(fn);

test('copies and deeply freezes numeric payloads, never retains input vectors', () => {
    const { q, a } = setup();
    const input = effect();
    input.relativePoint = v(8);
    const seq = q.submit(a, input);
    input.vector.x = 99;
    input.relativePoint.x = 99;
    const r = q.diagnostics().pending[0];
    assert.equal(seq, 1);
    assert.equal(r.command.vector.x, 1);
    assert.equal(r.command.relativePoint.x, 8);
    for (const x of [r, r.command, r.command.vector, r.command.relativePoint, q.diagnostics().pending])
        assert(Object.isFrozen(x));
    assert.equal(r.body, a);
    assert.equal(r.generation, 7);
    assert.equal(r.tickIndex, 1);
});
test('pose getters read once and copies are detached', () => {
    const { q, a } = setup();
    let reads = 0;
    const pose = p();
    Object.defineProperty(pose.position, 'x', {
        get() {
            reads++;
            return 4;
        },
    });
    q.submit(a, { kind: 'teleport', pose });
    assert.equal(reads, 1);
    const c = collect(q);
    assert.equal(c.operations[0].command.pose.position.x, 4);
    assert.equal(c.operations[0].command.preserveVelocity, false);
    assert.equal(c.operations[0].command.wake, true);
});
for (const bad of [NaN, Infinity, -Infinity, '1', null, undefined])
    test(`invalid coordinate ${String(bad)} preserves accepted queue and sequence`, () => {
        const { q, a } = setup();
        q.submit(a, effect());
        const before = q.diagnostics();
        rejects(() => q.submit(a, { kind: 'force', vector: { x: bad, y: 2, z: 3 } }));
        assert.equal(q.diagnostics().pending, before.pending);
        assert.equal(q.diagnostics().sequence, before.sequence);
    });
for (const bad of [0, 1, 'false', null])
    test(`strict teleport boolean ${String(bad)}`, () => {
        const { q, a } = setup();
        rejects(() => q.submit(a, { kind: 'teleport', pose: p(), wake: bad }));
        assert.equal(q.diagnostics().pending.length, 0);
    });
test('null space is not omitted default', () => {
    const { q, a } = setup();
    rejects(() => q.submit(a, { ...effect(), space: null }));
});
test('zero quaternion is rejected without enqueue', () => {
    const { q, a } = setup();
    const pose = p();
    pose.rotation.w = 0;
    rejects(() => q.submit(a, { kind: 'teleport', pose }));
});
test('input getter throw preserves exact prior queue', () => {
    const { q, a } = setup();
    q.submit(a, effect());
    const before = q.diagnostics();
    rejects(() =>
        q.submit(a, {
            kind: 'force',
            get vector() {
                throw Error('explicit getter injection');
            },
        }),
    );
    assert.equal(q.diagnostics().pending, before.pending);
});
for (const operation of ['submit', 'cancel', 'close', 'release', 'pause'])
    test(`caught nested ${operation} during getter aborts outer admission`, () => {
        const { q, a } = setup();
        q.submit(a, effect());
        const before = q.diagnostics();
        const nested = {
            submit: () => q.submit(a, effect()),
            cancel: () => q.cancelPending(a),
            close: () => q.close(),
            release: () => q.releaseBodyAfterTeardown(a),
            pause: () => q.pause(),
        }[operation];
        rejects(() =>
            q.submit(a, {
                kind: 'force',
                get vector() {
                    try {
                        nested();
                    } catch {}
                    return v();
                },
            }),
        );
        assert.equal(q.diagnostics().pending, before.pending);
        assert.equal(q.diagnostics().sequence, before.sequence);
        assert.equal(q.diagnostics().phase, 'ready');
    });
for (const thrown of [undefined, null, 0, ''])
    test(`caught falsy getter throw ${String(thrown)} latches candidate`, () => {
        const { q, a } = setup();
        q.submit(a, effect());
        const before = q.diagnostics().pending;
        rejects(() =>
            collect(q, [
                () => {
                    try {
                        q.submit(a, {
                            kind: 'force',
                            get vector() {
                                throw thrown;
                            },
                        });
                    } catch {}
                },
            ]),
        );
        assert.equal(q.diagnostics().pending, before);
        assert.equal(q.diagnostics().phase, 'ready');
    });
test('producer roster accessor nested admission is rejected before attempt', () => {
    const { q, a } = setup();
    const roster = [];
    Object.defineProperty(roster, 0, {
        get() {
            try {
                q.submit(a, effect());
            } catch {}
            return () => {};
        },
    });
    rejects(() => collect(q, roster));
    assert.equal(q.diagnostics().attemptId, 0);
    assert.equal(q.diagnostics().pending.length, 0);
});
test('prequeue precedes stable callback contributions and retained context is historical', () => {
    const { q, a, b } = setup();
    q.submit(a, effect('force'));
    const calls = [];
    let context;
    const second = (c) => {
        calls.push(2);
        assert.equal(c, context);
        q.submit(b, effect('torque'));
    };
    const roster = [
        (c) => {
            calls.push(1);
            context = c;
            roster[1] = () => {
                throw Error('must not run');
            };
            q.submit(a, effect());
        },
        second,
    ];
    const candidate = collect(q, roster);
    assert.deepEqual(calls, [1, 2]);
    assert.deepEqual(kinds(candidate), ['force', 'impulse', 'torque']);
    assert.deepEqual(
        candidate.original.map((r) => r.sequence),
        [1, 2, 3],
    );
    assert(Object.isFrozen(context));
    mockCommit(q, candidate);
    assert.equal(context.tickIndex, 1);
    assert.equal(context.attemptId, 1);
    assert.equal(q.diagnostics().tickIndex, 2);
});
test('throw discards all provisional but preserves prequeue and does not replay callbacks', () => {
    const { q, a } = setup();
    q.submit(a, effect());
    const pending = q.diagnostics().pending;
    let calls = 0;
    rejects(() =>
        collect(q, [
            () => {
                calls++;
                q.submit(a, effect('force'));
            },
            () => {
                throw Error('explicit callback');
            },
        ]),
    );
    assert.equal(q.diagnostics().pending, pending);
    assert.equal(q.diagnostics().completedTicks, 0);
    assert.equal(calls, 1);
    const c = collect(q);
    assert.equal(c.context.attemptId, 2);
    assert.equal(c.context.tickIndex, 1);
    assert.equal(c.original.length, 1);
    q.rejectCandidate(c);
    assert.equal(q.submit(a, effect()), 3);
});
for (const result of [1, null, {}, Promise.resolve()])
    test(`non-undefined callback result ${String(result)} aborts`, () => {
        const { q, a } = setup();
        q.submit(a, effect());
        const before = q.diagnostics().pending;
        rejects(() =>
            collect(q, [
                () => {
                    q.submit(a, effect());
                    return result;
                },
            ]),
        );
        assert.equal(q.diagnostics().pending, before);
        assert.equal(q.diagnostics().provisionalCount, 0);
    });
for (const rejected of ['input', 'getter', 'cancel', 'recursive-collect', 'close', 'foreign-body'])
    test(`caught callback ${rejected} latches whole candidate`, () => {
        const { q, a } = setup();
        q.submit(a, effect());
        const before = q.diagnostics().pending;
        let later = false;
        const operation = {
            input: () => q.submit(a, { kind: 'force', vector: v(NaN) }),
            getter: () =>
                q.submit(a, {
                    kind: 'force',
                    get vector() {
                        try {
                            q.cancelPending(a);
                        } catch {}
                        return v();
                    },
                }),
            cancel: () => q.cancelPending(a),
            'recursive-collect': () => collect(q),
            close: () => q.close(),
            'foreign-body': () => q.submit({}, effect()),
        }[rejected];
        rejects(() =>
            collect(q, [
                () => {
                    q.submit(a, effect());
                    try {
                        operation();
                    } catch {}
                },
                () => {
                    later = true;
                },
            ]),
        );
        assert.equal(q.diagnostics().pending, before);
        assert.equal(q.diagnostics().phase, 'ready');
        assert.equal(later, false);
    });
test('target reductions retain raw accepted records for exact cancellation count', () => {
    const { q, a } = setup();
    q.acquireTarget(a);
    q.submit(a, { kind: 'target', pose: p(1) });
    q.submit(a, { kind: 'target', pose: p(2) });
    const c = collect(q);
    assert.equal(c.original.length, 2);
    assert.equal(c.operations.length, 1);
    assert.equal(c.operations[0].command.pose.position.x, 2);
    q.rejectCandidate(c);
    assert.equal(q.cancelPending(a), 2);
    assert.equal(q.cancelPending(a), 0);
    assert.equal(q.diagnostics().sequence, 2);
    const idle = collect(q);
    assert.equal(idle.operations[0].source, 'idle');
});
for (const kind of ['clear-forces', 'clear-velocity', 'clear-state', 'target-clear'])
    test(`target then ${kind} exact reduction`, () => {
        const { q, a } = setup();
        q.acquireTarget(a);
        q.submit(a, { kind: 'target', pose: p() });
        q.submit(a, { kind });
        const c = collect(q);
        assert.deepEqual(kinds(c), kind === 'clear-forces' ? ['target', kind] : [kind]);
    });
test('later target replaces target-clear but never removes ordinary clear/reset', () => {
    const { q, a } = setup();
    q.acquireTarget(a);
    q.submit(a, { kind: 'target-clear' });
    q.submit(a, { kind: 'clear-state' });
    q.submit(a, { kind: 'teleport', pose: p(3) });
    q.submit(a, { kind: 'target', pose: p(4) });
    assert.deepEqual(kinds(collect(q)), ['clear-state', 'teleport', 'target']);
});
test('target then preserve teleport cancels only target and suppresses same-tick idle zero', () => {
    const { q, a } = setup();
    q.acquireTarget(a);
    q.submit(a, { kind: 'target', pose: p() });
    q.submit(a, { kind: 'teleport', pose: p(3), preserveVelocity: true });
    const c = collect(q);
    assert.deepEqual(kinds(c), ['teleport']);
    assert.equal(c.operations[0].command.preserveVelocity, true);
    mockCommit(q, c);
    const next = collect(q);
    assert.deepEqual(kinds(next), ['target-clear']);
    assert.equal(next.operations[0].source, 'idle');
});
test('impulse/reset/impulse and force/reset/force retain exact order and payload', () => {
    const { q, a, b } = setup();
    for (const body of [a, b]) {
        q.submit(body, effect(body === a ? 'impulse' : 'force'));
        q.submit(body, { kind: 'teleport', pose: p(8), preserveVelocity: false });
        q.submit(body, { ...effect(body === a ? 'impulse' : 'force'), space: 'local' });
    }
    assert.deepEqual(kinds(collect(q)), ['impulse', 'teleport', 'impulse', 'force', 'teleport', 'force']);
});
test('target plus effect refuses and latches callback without executing other-body prequeue', () => {
    const { q, a, b } = setup();
    q.acquireTarget(a);
    q.submit(b, effect());
    const before = q.diagnostics().pending;
    rejects(() =>
        collect(q, [
            () => {
                q.submit(a, { kind: 'target', pose: p() });
                try {
                    q.submit(a, effect('force'));
                } catch {}
            },
        ]),
    );
    assert.equal(q.diagnostics().pending, before);
});
test('effect queued before target ownership is rechecked without destructive reduction', () => {
    const { q, a } = setup();
    q.submit(a, effect());
    const before = q.diagnostics().pending;
    q.acquireTarget(a);
    rejects(() => collect(q));
    assert.equal(q.diagnostics().pending, before);
});
test('clear-forces alone cannot suppress an active-owner idle zero', () => {
    const { q, a } = setup();
    q.acquireTarget(a);
    q.submit(a, { kind: 'clear-forces' });
    const c = collect(q);
    assert.deepEqual(kinds(c), ['clear-forces', 'target-clear']);
    assert.equal(c.operations[1].source, 'idle');
});
test('revocation removes target records while protected zero survives cancellation and uses no sequence', () => {
    const { q, a } = setup({ counterLimit: 2 });
    q.acquireTarget(a);
    q.submit(a, { kind: 'target', pose: p() });
    q.submit(a, { kind: 'target', pose: p(2) });
    q.revokeTarget(a);
    assert.equal(q.diagnostics().pending.length, 0);
    assert.equal(q.cancelPending(a), 0);
    assert.equal(q.diagnostics().sequence, 2);
    assert.equal(q.diagnostics().protectedZeros, 1);
    rejects(() => q.submit(a, { kind: 'teleport', pose: p() }));
    rejects(() => q.acquireTarget(a));
    const c = collect(q);
    assert.equal(c.operations.length, 1);
    assert.equal(c.operations[0].source, 'protected');
    assert.equal(c.operations[0].sequence, null);
    mockCommit(q, c);
    assert.equal(q.diagnostics().protectedZeros, 0);
    q.acquireTarget(a);
});
test('protected zero follows retained reset and cannot be removed by ordinary user intent', () => {
    const { q, a } = setup();
    q.acquireTarget(a);
    q.submit(a, { kind: 'target', pose: p() });
    q.submit(a, { kind: 'teleport', pose: p() });
    q.revokeTarget(a);
    const c = collect(q);
    assert.deepEqual(kinds(c), ['teleport', 'target-clear']);
    assert.equal(c.operations[1].source, 'protected');
});
test('pure validation refusal and mock not-mutated retain prequeue, discard provisional', () => {
    const { q, a } = setup();
    q.submit(a, effect());
    const pending = q.diagnostics().pending;
    const c = collect(q, [
        () => {
            q.submit(a, effect());
        },
    ]);
    q.rejectCandidate(c);
    assert.equal(q.diagnostics().pending, pending);
    const retry = collect(q, [
        () => {
            q.submit(a, effect());
        },
    ]);
    q.beginCommit(retry);
    q.finishCommit(retry, 'not-mutated');
    assert.equal(q.diagnostics().pending, pending);
    assert.equal(q.diagnostics().completedTicks, 0);
    assert.equal(q.diagnostics().provisionalCount, 0);
});
test('known mock commit retires original records before tick completion', () => {
    const { q, a } = setup();
    q.submit(a, effect());
    const c = collect(q);
    mockCommit(q, c, false);
    assert.equal(q.diagnostics().pending.length, 0);
    assert.equal(q.diagnostics().completedTicks, 0);
    assert.equal(q.diagnostics().phase, 'awaiting-step');
    rejects(() => collect(q));
    q.completeTick(c);
    assert.equal(q.diagnostics().completedTicks, 1);
    rejects(() => q.completeTick(c));
    assert.equal(collect(q).operations.length, 0);
});
for (const nativeCompleted of [false, true])
    test(`known mock commit then failure completed=${nativeCompleted} never replays`, () => {
        const { q, a } = setup();
        q.submit(a, effect());
        const c = collect(q);
        mockCommit(q, c, false);
        q.faultAfterCommit(c, nativeCompleted);
        assert.equal(q.diagnostics().pending.length, 0);
        assert.equal(q.diagnostics().completedTicks, Number(nativeCompleted));
        assert.equal(q.diagnostics().phase, 'faulted');
        rejects(() => collect(q));
        rejects(() => q.cancelPending(a));
        q.close();
    });
test('mock unknown apply quarantines originals and forbids replay or cancellation', () => {
    const { q, a } = setup();
    q.submit(a, effect());
    const c = collect(q);
    q.beginCommit(c);
    q.finishCommit(c, 'unknown');
    assert.equal(q.diagnostics().quarantined, c);
    assert.equal(q.diagnostics().pending.length, 0);
    assert.equal(q.diagnostics().completedTicks, 0);
    rejects(() => q.cancelPending(a));
    rejects(() => collect(q));
    rejects(() => q.finishCommit(c, 'not-mutated'));
    q.close();
    assert.equal(q.diagnostics().quarantined, null);
});
test('foreign/forged/stale candidates refuse without disturbing live candidate', () => {
    const { q } = setup();
    const other = setup().q;
    const c = collect(q);
    const foreign = collect(other);
    for (const invalid of [foreign, { ...c }, null]) rejects(() => q.beginCommit(invalid));
    assert.equal(q.diagnostics().phase, 'validating');
    q.rejectCandidate(c);
    const fresh = collect(q);
    rejects(() => q.rejectCandidate(c));
    assert.equal(q.diagnostics().phase, 'validating');
    mockCommit(q, fresh);
});
test('pause clears pending user commands, retains protected zero, requires explicit resume', () => {
    const { q, a, b } = setup();
    q.acquireTarget(a);
    q.revokeTarget(a);
    q.submit(b, effect());
    q.pause();
    assert.equal(q.diagnostics().pending.length, 0);
    assert.equal(q.diagnostics().protectedZeros, 1);
    rejects(() => q.submit(b, effect()));
    rejects(() => collect(q));
    rejects(() => q.cancelPending(b));
    q.resume();
    assert.equal(collect(q).operations[0].source, 'protected');
});
test('logical teardown only clears its owned records and invalidates old identity', () => {
    const { q, a, b } = setup();
    q.submit(a, effect());
    q.submit(b, effect());
    q.releaseBodyAfterTeardown(a);
    assert.equal(q.diagnostics().pending.length, 1);
    assert.equal(q.diagnostics().pending[0].body, b);
    rejects(() => q.submit(a, effect()));
    rejects(() => q.registerBody(a));
});
test('sequence exhaustion does not block cancellation or protected obligation', () => {
    const { q, a } = setup({ counterLimit: 1 });
    q.submit(a, effect());
    rejects(() => q.submit(a, effect()));
    assert.equal(q.cancelPending(a), 1);
    q.acquireTarget(a);
    q.revokeTarget(a);
    const c = collect(q);
    assert.equal(c.operations[0].sequence, null);
});
test('tick exhaustion never emits unsafe next-tick index and rejects new submission', () => {
    const { q, a } = setup({ counterLimit: 1 });
    const c = collect(q);
    mockCommit(q, c);
    assert.equal(q.diagnostics().tickIndex, null);
    rejects(() => q.submit(a, effect()));
    rejects(() => collect(q));
    assert.equal(q.cancelPending(a), 0);
});
test('attempt exhaustion preserves unconsumed pending records and recovery cancellation', () => {
    const { q, a } = setup({ counterLimit: 1 });
    q.submit(a, effect());
    const c = collect(q);
    q.rejectCandidate(c);
    const pending = q.diagnostics().pending;
    rejects(() => collect(q));
    assert.equal(q.diagnostics().pending, pending);
    assert.equal(q.cancelPending(a), 1);
});
for (const options of [
    { generation: 0 },
    { generation: 1.5 },
    { generation: Number.MAX_SAFE_INTEGER + 1 },
    { generation: 1, counterLimit: null },
])
    test(`strict generation/qualification ${JSON.stringify(options)}`, () => rejects(() => new Queue(options)));
test('close is repeated-safe and cannot resurrect logical ownership', () => {
    const { q, a } = setup();
    q.close();
    q.close();
    rejects(() => q.registerBody(a));
    rejects(() => q.resume());
    assert.equal(q.diagnostics().phase, 'closed');
});
const capture = (fn) => {
    try {
        return { threw: false, value: fn() };
    } catch (error) {
        return { threw: true, error };
    }
};
const sameAccepted = (q, before) => {
    const after = q.diagnostics();
    assert.equal(after.pending, before.pending);
    assert.equal(after.sequence, before.sequence);
    assert.equal(after.phase, before.phase);
};
test('owner reader and returned body/command accessors read once with detached payload', () => {
    const { q, a } = setup();
    let reads = 0;
    const input = effect();
    const sequence = q.withSubmissionAdmission(() => {
        reads++;
        return {
            get body() {
                reads++;
                return a;
            },
            get command() {
                reads++;
                return input;
            },
        };
    });
    input.vector.x = 9;
    assert.equal(reads, 3);
    assert.equal(sequence, 1);
    assert.equal(q.diagnostics().pending[0].command.vector.x, 1);
});
for (const failure of [undefined, null, 0, '', Error('owner resolver injection')]) {
    test(`ready owner resolution throw ${String(failure)} preserves exact error and accepted state`, () => {
        const { q, a } = setup();
        q.submit(a, effect());
        const before = q.diagnostics();
        const result = capture(() =>
            q.withSubmissionAdmission(() => {
                throw failure;
            }),
        );
        assert.equal(result.threw, true);
        assert.equal(result.error, failure);
        sameAccepted(q, before);
        assert.equal(
            q.withSubmissionAdmission(() => ({ body: a, command: effect() })),
            2,
        );
    });
    test(`caught collection owner resolution throw ${String(failure)} discards provisional and retries next attempt`, () => {
        const { q, a } = setup();
        q.submit(a, effect());
        const before = q.diagnostics();
        let later = 0;
        const result = capture(() =>
            collect(q, [
                () => {
                    q.submit(a, effect());
                    const rejection = capture(() =>
                        q.withSubmissionAdmission(() => {
                            throw failure;
                        }),
                    );
                    assert.equal(rejection.threw, true);
                    assert.equal(rejection.error, failure);
                },
                () => {
                    later++;
                },
            ]),
        );
        assert.equal(result.threw, true);
        assert.equal(result.error, failure);
        assert.equal(later, 0);
        const after = q.diagnostics();
        assert.equal(after.pending, before.pending);
        assert.equal(after.sequence, 2); // Accepted provisional sequence is never reused.
        assert.equal(after.provisionalCount, 0);
        assert.equal(after.phase, 'ready');
        const retry = collect(q, [() => void q.withSubmissionAdmission(() => ({ body: a, command: effect() }))]);
        assert.equal(retry.context.tickIndex, 1);
        assert.equal(retry.context.attemptId, 2);
        assert.deepEqual(
            retry.original.map((r) => r.sequence),
            [1, 3],
        );
        q.rejectCandidate(retry);
        assert.equal(q.diagnostics().pending, before.pending);
    });
}
for (const at of ['resolver', 'body', 'command', 'vector'])
    for (const kind of ['valid', 'invalid'])
        test(`caught nested ${kind} submit from ${at} cannot enter admission or advance sequence`, () => {
            const { q, a } = setup();
            q.submit(a, effect());
            const before = q.diagnostics();
            let first;
            let nestedRead = false;
            const reenter = () => {
                const result = capture(() =>
                    q.withSubmissionAdmission(() => {
                        nestedRead = true;
                        return { body: kind === 'valid' ? a : {}, command: effect() };
                    }),
                );
                assert.equal(result.threw, true);
                first = result.error;
            };
            const result = capture(() =>
                q.withSubmissionAdmission(() => {
                    if (at === 'resolver') reenter();
                    return {
                        get body() {
                            if (at === 'body') reenter();
                            return a;
                        },
                        get command() {
                            if (at === 'command') reenter();
                            return {
                                kind: 'force',
                                get vector() {
                                    if (at === 'vector') reenter();
                                    return v();
                                },
                            };
                        },
                    };
                }),
            );
            assert.equal(result.threw, true);
            assert.equal(result.error, first);
            assert.equal(nestedRead, false);
            sameAccepted(q, before);
        });
for (const operation of ['cancel', 'close', 'release', 'pause', 'collect', 'register', 'acquire', 'revoke'])
    test(`owner resolver caught nested ${operation} cannot alter queue ownership`, () => {
        const { q, a } = setup();
        q.submit(a, effect());
        const before = q.diagnostics();
        const nested = {
            cancel: () => q.cancelPending(a),
            close: () => q.close(),
            release: () => q.releaseBodyAfterTeardown(a),
            pause: () => q.pause(),
            collect: () => collect(q),
            register: () => q.registerBody({}),
            acquire: () => q.acquireTarget(a),
            revoke: () => q.revokeTarget(a),
        }[operation];
        let first;
        const result = capture(() =>
            q.withSubmissionAdmission(() => {
                first = capture(nested).error;
                return { body: a, command: effect() };
            }),
        );
        assert.equal(result.threw, true);
        assert.equal(result.error, first);
        sameAccepted(q, before);
        assert.equal(q.diagnostics().bodies, before.bodies);
    });
test('owner getter nested submit then later throw preserves first rejection identity', () => {
    const { q, a } = setup();
    const before = q.diagnostics();
    let first;
    const later = Error('later owner failure');
    const result = capture(() =>
        q.withSubmissionAdmission(() => ({
            get body() {
                first = capture(() => q.submit(a, effect())).error;
                throw later;
            },
            command: effect(),
        })),
    );
    assert.equal(result.threw, true);
    assert.equal(result.error, first);
    assert.notEqual(result.error, later);
    sameAccepted(q, before);
});
test('ordinary submit shares admission and preserves first nested error over later vector throw', () => {
    const { q, a } = setup();
    let first;
    const later = Error('later vector failure');
    const result = capture(() =>
        q.submit(a, {
            kind: 'force',
            get vector() {
                first = capture(() => q.submit(a, effect())).error;
                throw later;
            },
        }),
    );
    assert.equal(result.threw, true);
    assert.equal(result.error, first);
    assert.equal(q.diagnostics().sequence, 0);
});
for (const first of [undefined, null, 0])
    test(`collection first owner error ${String(first)} survives later callback failure`, () => {
        const { q } = setup();
        const later = Error('later callback failure');
        const result = capture(() =>
            collect(q, [
                () => {
                    capture(() =>
                        q.withSubmissionAdmission(() => {
                            throw first;
                        }),
                    );
                    throw later;
                },
            ]),
        );
        assert.equal(result.threw, true);
        assert.equal(result.error, first);
        assert.equal(q.diagnostics().phase, 'ready');
    });
for (const invalid of [undefined, null, 0, {}, Promise.resolve({})])
    test(`invalid admission result ${String(invalid)} cannot append`, () => {
        const { q, a } = setup();
        q.submit(a, effect());
        const before = q.diagnostics();
        rejects(() => q.withSubmissionAdmission(() => invalid));
        sameAccepted(q, before);
    });
test('non-function admission reader latches a collection command refusal', () => {
    const { q } = setup();
    const result = capture(() => collect(q, [() => void capture(() => q.withSubmissionAdmission(null))]));
    assert.equal(result.threw, true);
    assert.equal(q.diagnostics().phase, 'ready');
});
test('foreign logical body refuses before evaluating returned command accessor', () => {
    const { q } = setup();
    let read = false;
    rejects(() =>
        q.withSubmissionAdmission(() => ({
            body: {},
            get command() {
                read = true;
                return effect();
            },
        })),
    );
    assert.equal(read, false);
});
test('ready admission diagnostics are read-only observations, not forbidden mutation', () => {
    const { q, a } = setup();
    const before = q.diagnostics();
    q.withSubmissionAdmission(() => {
        sameAccepted(q, before);
        return { body: a, command: effect() };
    });
    assert.equal(q.diagnostics().sequence, 1);
});
test('caught non-command configuration refusal does not automatically abort collection', () => {
    const { q, a } = setup();
    const candidate = collect(q, [
        () => {
            // Explicit owner configuration-refusal mock; it is not a rejected queue submission.
            capture(() => {
                throw Error('mock owner configuration fence refusal');
            });
            q.withSubmissionAdmission(() => ({ body: a, command: effect() }));
        },
    ]);
    assert.equal(candidate.original.length, 1);
    q.rejectCandidate(candidate);
});
test('admission is queue-local, not a global bypass or a rollback of arbitrary JavaScript', () => {
    const { q, a } = setup();
    const other = setup();
    let external = 0;
    rejects(() =>
        q.withSubmissionAdmission(() => {
            external++;
            other.q.submit(other.a, effect());
            throw Error('owner external side effect injection');
        }),
    );
    assert.equal(external, 1);
    assert.equal(other.q.diagnostics().pending.length, 1);
    assert.equal(q.diagnostics().pending.length, 0);
    assert.equal(
        q.withSubmissionAdmission(() => ({ body: a, command: effect() })),
        1,
    );
});
// Owner outcome labels below are synthetic metadata inputs, never evidence of native zero or teardown.
test('target acquisitions issue distinct frozen queue-local logical owner identities', () => {
    const { q, a, b } = setup();
    const first = q.acquireTarget(a);
    const second = q.acquireTarget(b);
    assert.equal(typeof first, 'object');
    assert.notEqual(first, null);
    assert(Object.isFrozen(first));
    assert.notEqual(first, a);
    assert.notEqual(first, second);
    assert.equal(q.settleTargetAfterCleanup(a, first, 'paired-zero'), true);
    const next = q.acquireTarget(a);
    assert.notEqual(next, first);
});
test('revoke removes only its original target-mode records and preserves ordered ordinary commands', () => {
    const { q, a, b } = setup();
    q.acquireTarget(a);
    q.acquireTarget(b);
    q.submit(a, { kind: 'target', pose: p(1) });
    q.submit(b, { kind: 'target', pose: p(2) });
    q.submit(a, { kind: 'clear-forces' });
    q.submit(a, { kind: 'target-clear' });
    q.submit(a, { kind: 'teleport', pose: p(3), preserveVelocity: true });
    q.submit(a, { kind: 'clear-velocity' });
    q.submit(a, { kind: 'clear-state' });
    q.submit(a, { kind: 'target', pose: p(4) });
    const before = q.diagnostics();
    const retained = before.pending.filter(
        (record) => record.body !== a || !['target', 'target-clear'].includes(record.command.kind),
    );
    q.revokeTarget(a);
    assert.deepEqual(q.diagnostics().pending, retained);
    assert.equal(before.pending.length, 8);
    assert.equal(q.diagnostics().sequence, before.sequence);
    assert.equal(q.diagnostics().protectedZeros, 1);
    const candidate = collect(q);
    assert.deepEqual(candidate.original, retained);
    assert.deepEqual(kinds(candidate), [
        'target',
        'clear-forces',
        'teleport',
        'clear-velocity',
        'clear-state',
        'target-clear',
    ]);
    assert.equal(candidate.operations.at(-1).source, 'protected');
    q.rejectCandidate(candidate);
    q.revokeTarget(a);
    assert.deepEqual(q.diagnostics().pending, retained);
    assert.equal(q.cancelPending(a), 4);
    assert.equal(q.diagnostics().protectedZeros, 1);
    assert.equal(q.diagnostics().pending[0].body, b);
});
test('settlement preserves every earlier same-body ordinary effect for independent revalidation', () => {
    const { q, a } = setup();
    for (const kind of ['force', 'torque', 'impulse', 'angular-impulse']) q.submit(a, effect(kind));
    const effects = q.diagnostics().pending;
    const owner = q.acquireTarget(a);
    q.submit(a, { kind: 'target', pose: p() });
    q.revokeTarget(a);
    assert.deepEqual(q.diagnostics().pending, effects);
    rejects(() => collect(q));
    assert.deepEqual(q.diagnostics().pending, effects);
    assert.equal(q.diagnostics().protectedZeros, 1);
    assert.equal(q.settleTargetAfterCleanup(a, owner, 'paired-zero'), true);
    const candidate = collect(q);
    assert.deepEqual(candidate.original, effects);
    assert.deepEqual(kinds(candidate), ['force', 'torque', 'impulse', 'angular-impulse']);
});
test('paused revoke creates a protected obligation without resuming or retiring the body', () => {
    const { q, a } = setup();
    const owner = q.acquireTarget(a);
    q.pause();
    q.revokeTarget(a);
    q.revokeTarget(a);
    assert.equal(q.diagnostics().phase, 'paused');
    assert.equal(q.diagnostics().protectedZeros, 1);
    assert.equal(q.diagnostics().bodies, 2);
    assert.equal(q.settleTargetAfterCleanup(a, owner, 'paired-zero'), true);
    assert.equal(q.diagnostics().phase, 'paused');
});
for (const protectedOwner of [false, true])
    for (const outcome of ['paired-zero', 'teardown'])
        test(`known mock ${outcome} settles ${protectedOwner ? 'protected' : 'active'} target without retiring live body`, () => {
            const { q, a, b } = setup();
            const owner = q.acquireTarget(a);
            q.submit(a, { kind: 'target', pose: p() });
            q.submit(b, effect());
            q.submit(a, { kind: 'target-clear' });
            q.submit(a, { kind: 'teleport', pose: p(3), preserveVelocity: true });
            q.submit(a, { kind: 'clear-forces' });
            q.submit(a, { kind: 'clear-velocity' });
            q.submit(a, { kind: 'clear-state' });
            if (protectedOwner) q.revokeTarget(a);
            const before = q.diagnostics();
            const retained = before.pending.filter(
                (record) => record.body !== a || !['target', 'target-clear'].includes(record.command.kind),
            );
            assert.equal(q.settleTargetAfterCleanup(a, owner, outcome), true);
            assert.deepEqual(q.diagnostics().pending, retained);
            assert.equal(q.diagnostics().bodies, before.bodies);
            assert.equal(q.diagnostics().sequence, before.sequence);
            assert.equal(q.diagnostics().protectedZeros, 0);
            const settled = q.diagnostics();
            assert.equal(q.settleTargetAfterCleanup(a, owner, outcome), false);
            assert.equal(q.diagnostics().pending, settled.pending);
            assert.equal(q.submit(a, effect()), before.sequence + 1);
            const candidate = collect(q);
            assert.equal(
                candidate.operations.some((record) => record.source === 'idle' || record.source === 'protected'),
                false,
            );
            assert.deepEqual(kinds(candidate), [
                'impulse',
                'teleport',
                'clear-forces',
                'clear-velocity',
                'clear-state',
                'impulse',
            ]);
            q.rejectCandidate(candidate);
            const next = q.acquireTarget(a);
            const nextPending = q.diagnostics().pending;
            rejects(() => q.settleTargetAfterCleanup(a, owner, outcome));
            assert.equal(q.diagnostics().pending, nextPending);
            rejects(() => q.acquireTarget(a));
            assert.equal(q.settleTargetAfterCleanup(a, next, outcome), true);
        });
for (const protectedOwner of [false, true])
    for (const outcome of ['paired-zero', 'teardown'])
        test(`paused mock ${outcome} settles ${protectedOwner ? 'protected' : 'active'} ownership but does not resume`, () => {
            const { q, a } = setup();
            const owner = q.acquireTarget(a);
            q.submit(a, { kind: 'target', pose: p() });
            if (protectedOwner) q.revokeTarget(a);
            q.pause();
            assert.equal(q.settleTargetAfterCleanup(a, owner, outcome), true);
            assert.equal(q.diagnostics().phase, 'paused');
            assert.equal(q.diagnostics().bodies, 2);
            rejects(() => q.submit(a, effect()));
            q.resume();
            assert.equal(collect(q).operations.length, 0);
        });
test('wrong-body, wrong-queue, forged, absent and stale owner settlement is nonmutating', () => {
    const { q, a, b } = setup();
    const owner = q.acquireTarget(a);
    const otherOwner = q.acquireTarget(b);
    const other = setup();
    const foreignOwner = other.q.acquireTarget(other.a);
    q.submit(a, { kind: 'target', pose: p() });
    const before = q.diagnostics();
    for (const invalid of [otherOwner, foreignOwner, {}, { ...owner }, undefined, null, a]) {
        rejects(() => q.settleTargetAfterCleanup(a, invalid, 'paired-zero'));
        sameAccepted(q, before);
    }
    rejects(() => q.settleTargetAfterCleanup({}, owner, 'teardown'));
    sameAccepted(q, before);
    q.releaseBodyAfterTeardown(a);
    rejects(() => q.settleTargetAfterCleanup(a, owner, 'teardown'));
    rejects(() => q.registerBody(a));
    q.registerBody({});
});
for (const outcome of ['unknown', 'not-mutated', 'committed', undefined, null, true, {}])
    test(`unsupported settlement outcome ${String(outcome)} retains protected ownership`, () => {
        const { q, a } = setup();
        const owner = q.acquireTarget(a);
        q.revokeTarget(a);
        const before = q.diagnostics();
        rejects(() => q.settleTargetAfterCleanup(a, owner, outcome));
        sameAccepted(q, before);
        assert.equal(q.diagnostics().protectedZeros, 1);
        rejects(() => q.acquireTarget(a));
    });
test('known mock protected commit settles once; late old token never clears a new acquisition', () => {
    const { q, a } = setup();
    const owner = q.acquireTarget(a);
    q.revokeTarget(a);
    const candidate = collect(q);
    mockCommit(q, candidate, false);
    assert.equal(q.diagnostics().protectedZeros, 0);
    rejects(() => q.settleTargetAfterCleanup(a, owner, 'paired-zero'));
    q.completeTick(candidate);
    assert.equal(q.settleTargetAfterCleanup(a, owner, 'paired-zero'), false);
    const next = q.acquireTarget(a);
    q.submit(a, { kind: 'target', pose: p(8) });
    const before = q.diagnostics();
    rejects(() => q.settleTargetAfterCleanup(a, owner, 'teardown'));
    sameAccepted(q, before);
    assert.equal(q.settleTargetAfterCleanup(a, next, 'paired-zero'), true);
});
test('mock unknown delivery keeps protected ownership and quarantined evidence until actual-teardown notification', () => {
    const { q, a } = setup();
    const owner = q.acquireTarget(a);
    q.revokeTarget(a);
    const candidate = collect(q);
    q.beginCommit(candidate);
    q.finishCommit(candidate, 'unknown');
    const before = q.diagnostics();
    for (const outcome of ['unknown', 'paired-zero']) {
        rejects(() => q.settleTargetAfterCleanup(a, owner, outcome));
        sameAccepted(q, before);
        assert.equal(q.diagnostics().protectedZeros, 1);
        assert.equal(q.diagnostics().quarantined, candidate);
    }
    assert.equal(q.settleTargetAfterCleanup(a, owner, 'teardown'), true);
    assert.equal(q.settleTargetAfterCleanup(a, owner, 'teardown'), false);
    assert.equal(q.diagnostics().phase, 'faulted');
    assert.equal(q.diagnostics().bodies, 2);
    assert.equal(q.diagnostics().quarantined, candidate);
    assert.equal(q.diagnostics().completedTicks, 0);
    rejects(() => q.acquireTarget(a));
    rejects(() => q.submit(a, effect()));
});
for (const nativeCompleted of [false, true])
    test(`mock committed active-target readback/step fault completed=${nativeCompleted} permits only teardown settlement`, () => {
        const { q, a } = setup();
        const owner = q.acquireTarget(a);
        const candidate = collect(q);
        mockCommit(q, candidate, false);
        q.faultAfterCommit(candidate, nativeCompleted);
        rejects(() => q.settleTargetAfterCleanup(a, owner, 'paired-zero'));
        assert.equal(q.settleTargetAfterCleanup(a, owner, 'teardown'), true);
        assert.equal(q.diagnostics().completedTicks, Number(nativeCompleted));
        assert.equal(q.diagnostics().phase, 'faulted');
    });
for (const phase of ['collecting', 'validating', 'committing', 'awaiting-step', 'closed'])
    test(`settlement refuses during ${phase} and cannot skip the candidate lifecycle`, () => {
        const { q, a } = setup();
        const owner = q.acquireTarget(a);
        q.submit(a, { kind: 'target', pose: p() });
        const attempt = () => q.settleTargetAfterCleanup(a, owner, 'paired-zero');
        if (phase === 'collecting') {
            const pending = q.diagnostics().pending;
            rejects(() => collect(q, [() => void capture(attempt)]));
            assert.equal(q.diagnostics().pending, pending);
            assert.equal(q.diagnostics().phase, 'ready');
            return;
        }
        if (phase === 'closed') {
            q.close();
            rejects(attempt);
            return;
        }
        const candidate = collect(q);
        if (phase === 'committing' || phase === 'awaiting-step') q.beginCommit(candidate);
        if (phase === 'awaiting-step') q.finishCommit(candidate, 'committed');
        const before = q.diagnostics();
        rejects(attempt);
        sameAccepted(q, before);
    });
test('prepared pause and caught nested input settlement refuse before changing ownership', () => {
    const { q, a } = setup();
    const owner = q.acquireTarget(a);
    q.submit(a, { kind: 'target', pose: p() });
    const before = q.diagnostics();
    const pause = q.preparePauseTransition(true);
    rejects(() => q.settleTargetAfterCleanup(a, owner, 'teardown'));
    assert.equal(q.diagnostics().pending, before.pending);
    pause.dispose();
    let first;
    const result = capture(() =>
        q.submit(a, {
            kind: 'target',
            get pose() {
                first = capture(() => q.settleTargetAfterCleanup(a, owner, 'paired-zero')).error;
                return p();
            },
        }),
    );
    assert.equal(result.threw, true);
    assert.equal(result.error, first);
    sameAccepted(q, before);
    assert.equal(q.settleTargetAfterCleanup(a, owner, 'paired-zero'), true);
});
for (const limit of ['sequence', 'attempt', 'tick'])
    test(`${limit} exhaustion cannot prevent target revocation or settlement`, () => {
        const { q, a } = setup({ counterLimit: 1 });
        const owner = q.acquireTarget(a);
        q.submit(a, { kind: 'target', pose: p() });
        if (limit !== 'sequence') {
            const candidate = collect(q);
            if (limit === 'tick') mockCommit(q, candidate);
            else q.rejectCandidate(candidate);
        }
        q.revokeTarget(a);
        assert.equal(q.diagnostics().pending.length, 0);
        assert.equal(q.diagnostics().protectedZeros, 1);
        assert.equal(q.settleTargetAfterCleanup(a, owner, 'paired-zero'), true);
        assert.equal(q.diagnostics().sequence, 1);
        assert.equal(q.diagnostics().bodies, 2);
    });
for (const operation of ['revoke', 'settle'])
    test(`injected replacement allocation failure during ${operation} retains accepted records and active owner`, () => {
        const { q, a } = setup();
        const owner = q.acquireTarget(a);
        q.submit(a, { kind: 'target', pose: p() });
        const before = q.diagnostics();
        const failure = Error('explicit replacement allocation injection');
        const freeze = Object.freeze;
        let result;
        try {
            Object.freeze = (value) => {
                if (Array.isArray(value)) throw failure;
                return freeze(value);
            };
            result = capture(() =>
                operation === 'revoke' ? q.revokeTarget(a) : q.settleTargetAfterCleanup(a, owner, 'paired-zero'),
            );
        } finally {
            Object.freeze = freeze;
        }
        assert.equal(result.threw, true);
        assert.equal(result.error, failure);
        sameAccepted(q, before);
        assert.equal(q.diagnostics().protectedZeros, 0);
        rejects(() => q.acquireTarget(a));
        assert.equal(q.settleTargetAfterCleanup(a, owner, 'paired-zero'), true);
    });

// Freshly reconstructed controls after the 22:49 transition. No historical raw is imported.
test('cancellation admission resolves once and publishes only its accepted identity', () => {
    const { q, a, b } = setup();
    q.submit(a, effect());
    q.submit(b, effect());
    let reads = 0;
    const sequence = q.diagnostics().sequence;
    assert.equal(
        q.withCancellationAdmission(() => {
            reads++;
            return a;
        }),
        1,
    );
    assert.equal(reads, 1);
    assert.equal(q.diagnostics().sequence, sequence);
    assert.equal(q.diagnostics().pending.length, 1);
    assert.equal(q.diagnostics().pending[0].body, b);
});
for (const failure of [undefined, null, 0, false])
    test(`cancellation preserves exact thrown ${String(failure)} and pending identity`, () => {
        const { q, a } = setup();
        q.submit(a, effect());
        const before = q.diagnostics();
        const observed = capture(() =>
            q.withCancellationAdmission(() => {
                throw failure;
            }),
        );
        assert.equal(observed.threw, true);
        assert.equal(observed.error, failure);
        sameAccepted(q, before);
    });
for (const nested of ['cancel', 'submit'])
    test(`caught nested ${nested} in cancellation reader poisons outer and preserves all pending`, () => {
        const { q, a } = setup();
        q.submit(a, effect());
        const before = q.diagnostics();
        rejects(() =>
            q.withCancellationAdmission(() => {
                try {
                    if (nested === 'cancel') q.cancelPending(a);
                    else q.submit(a, effect());
                } catch {}
                return a;
            }),
        );
        sameAccepted(q, before);
    });
test('caught cancellation from original pose getter rejects outer submission without consuming a sequence', () => {
    const { q, a } = setup();
    q.submit(a, effect());
    const before = q.diagnostics();
    const pose = p();
    Object.defineProperty(pose.position, 'x', {
        get() {
            try {
                q.withCancellationAdmission(() => a);
            } catch {}
            return 3;
        },
    });
    rejects(() => q.submit(a, { kind: 'teleport', pose }));
    sameAccepted(q, before);
});
test('caught cancellation during producer collection poisons candidate without visiting owner reader', () => {
    const { q, a } = setup();
    q.submit(a, effect());
    const before = q.diagnostics();
    let reads = 0;
    rejects(() =>
        collect(q, [
            () => {
                try {
                    q.withCancellationAdmission(() => {
                        reads++;
                        return a;
                    });
                } catch {}
            },
        ]),
    );
    assert.equal(reads, 0);
    sameAccepted(q, before);
    assert.equal(q.diagnostics().phase, 'ready');
});
test('unknown body and nonfunction cancellation retain immutable pending records', () => {
    const { q, a } = setup();
    q.submit(a, effect());
    const before = q.diagnostics();
    rejects(() => q.withCancellationAdmission(() => ({})));
    sameAccepted(q, before);
    rejects(() => q.withCancellationAdmission(undefined));
    sameAccepted(q, before);
});
test('cancellation at exhausted sequence counter allocates no counter and retains protected zero', () => {
    const { q, a } = setup({ counterLimit: 1 });
    const token = q.acquireTarget(a);
    q.submit(a, { kind: 'target', pose: p() });
    q.revokeTarget(a);
    assert.equal(
        q.withCancellationAdmission(() => a),
        0,
    );
    assert.equal(q.diagnostics().sequence, 1);
    assert.equal(q.diagnostics().protectedZeros, 1);
    assert.equal(q.settleTargetAfterCleanup(a, token, 'paired-zero'), true);
});
test('cancellation does not invoke resolver while a prepared pause reserves admission', () => {
    const { q, a } = setup();
    q.submit(a, effect());
    const before = q.diagnostics();
    const pause = q.preparePauseTransition(true);
    let reads = 0;
    rejects(() =>
        q.withCancellationAdmission(() => {
            reads++;
            return a;
        }),
    );
    assert.equal(reads, 0);
    sameAccepted(q, before);
    pause.dispose();
});

const checks = [
    [
        'tsc',
        [
            'node_modules/typescript/bin/tsc',
            '--strict',
            '--target',
            'ES2022',
            '--module',
            'ES2022',
            '--skipLibCheck',
            '--noEmit',
            sources[0],
        ],
    ],
    ['format', ['node_modules/prettier/bin/prettier.cjs', '--ignore-path', '/dev/null', '--check', ...sources]],
];
const commands = [];
for (const [name, args] of checks) {
    const child = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
    await writeFile(path.join(output, `${name}.stdout.log`), child.stdout ?? '');
    await writeFile(path.join(output, `${name}.stderr.log`), child.stderr ?? '');
    commands.push({
        name,
        executable: process.execPath,
        args,
        exitCode: child.status,
        signal: child.signal,
        error: child.error ? String(child.error) : null,
    });
}
const after = await hashes();
const raw = {
    scope: 'Actual TypeScript queue source; no native execution. All commit notifications are explicit mock control inputs, not physics evidence.',
    rows,
};
const rawBytes = `${JSON.stringify(raw, null, 2)}\n`;
await writeFile(path.join(output, 'controls.raw.json'), rawBytes);
const ok =
    rows.every((r) => r.status === 'PASS_PURE_QUEUE_CONTROL') &&
    commands.every((c) => c.exitCode === 0) &&
    JSON.stringify(before) === JSON.stringify(after);
const receipt = {
    status: ok ? 'PASS_PURE_SOURCE_CONTROLS_NOT_PHYSICS' : 'FAIL',
    startedAt,
    completedAt: new Date().toISOString(),
    sourceHashesBefore: before,
    sourceHashesAfter: after,
    rawSha256: sha(rawBytes),
    tests: rows.length,
    passed: rows.filter((r) => r.status === 'PASS_PURE_QUEUE_CONTROL').length,
    commands,
};
await writeFile(path.join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
process.exitCode = ok ? 0 : 1;
