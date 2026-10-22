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
        rows.push({ name, status: 'FAIL', error: String(error), stack: error.stack });
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
        rejects(() => q.submit(a, { kind: 'force', vector: v(bad) }));
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
test('protected zero survives cancellation, dominates target and uses no user sequence', () => {
    const { q, a } = setup({ counterLimit: 2 });
    q.acquireTarget(a);
    q.submit(a, { kind: 'target', pose: p() });
    q.submit(a, { kind: 'target', pose: p(2) });
    q.revokeTarget(a);
    assert.equal(q.cancelPending(a), 2);
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
