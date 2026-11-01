/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Actual source lifecycle controls only. No native physics is executed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url),
    ts = require('typescript'),
    root = process.cwd();
const output = path.resolve(process.argv[2] ?? 'tools/verify/box3d/command-producers-evidence-20261022-a');
await mkdir(output);
const sources = [
    'src/air/physics/box3d/command-producers.ts',
    'src/air/physics/box3d/command-queue.ts',
    'tools/verify/box3d/command-producers-control.mjs',
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hashes = async () => Object.fromEntries(await Promise.all(sources.map(async (p) => [p, sha(await readFile(p))])));
const before = await hashes(),
    startedAt = new Date().toISOString();
const load = async (file) => {
    const compiled = ts.transpileModule(await readFile(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    });
    return import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
};
const { Box3DCommandQueue: Queue } = await load(sources[1]);
const { Box3DCommandProducers: Producers } = await load(sources[0]);
const rows = [];
const test = (name, run) => {
    try {
        run();
        rows.push({ name, status: 'PASS_PURE_SOURCE_CONTROL' });
    } catch (e) {
        rows.push({ name, status: 'FAIL', error: String(e), stack: e?.stack });
    }
};
const reject = (fn) => assert.throws(fn);
const v = (x = 1, y = 2, z = 3) => ({ x, y, z });
const setup = (qualification) => {
    const q = new Queue({ generation: 17 }),
        a = {},
        b = {},
        valid = new Set([a, b]),
        state = { fault: false, calls: 0 };
    q.registerBody(a);
    q.registerBody(b);
    const owner = {
        assertConfiguration() {
            if (state.fault) throw Error('explicit owner fault');
        },
        validateContinuousBody(body) {
            if (!valid.has(body)) throw Error('explicit invalid logical body');
        },
        submit(body, command) {
            state.calls++;
            return q.submit(body, command);
        },
    };
    const p = new Producers(owner, qualification);
    const collect = () => {
        const lease = p.snapshot();
        try {
            return q.collect(1 / 60, 4, lease.callbacks);
        } finally {
            lease.dispose();
        }
    };
    return { p, q, a, b, valid, state, collect };
};
const kinds = (c) => c.operations.map((r) => r.command.kind);
const committedMock = (q, c) => {
    q.beginCommit(c);
    q.finishCommit(c, 'committed');
    q.completeTick(c);
};

test('defaults copy zeros and emit no wake-capable command', () => {
    const s = setup();
    const h = s.p.registerContinuous(s.a, {});
    assert(h.enabled && !h.disposed);
    const c = s.collect();
    assert.deepEqual(kinds(c), []);
    assert.equal(s.state.calls, 0);
    assert(Object.isFrozen(h));
});
test('stable mixed roster preserves prequeue, hook and force-then-torque order', () => {
    const s = setup();
    s.q.submit(s.b, { kind: 'impulse', vector: v() });
    s.p.registerBeforeStep(() => {
        s.q.submit(s.a, { kind: 'clear-forces' });
    });
    s.p.registerContinuous(s.b, { force: v(), torque: v(3), relativePoint: v(4), space: 'local' });
    s.p.registerBeforeStep(() => {
        s.q.submit(s.a, { kind: 'clear-state' });
    });
    const c = s.collect();
    assert.deepEqual(kinds(c), ['impulse', 'clear-forces', 'force', 'torque', 'clear-state']);
    assert.equal(c.original[2].command.space, 'local');
    assert.deepEqual(c.original[2].command.relativePoint, v(4));
});
test('copied descriptor cannot be changed by alias mutations', () => {
    const s = setup(),
        descriptor = { force: v(), torque: v(5), relativePoint: v(6), space: 'local' };
    s.p.registerContinuous(s.a, descriptor);
    descriptor.force.x = 999;
    descriptor.torque.y = 999;
    descriptor.relativePoint.z = 999;
    descriptor.space = 'world';
    const c = s.collect();
    assert.deepEqual(c.operations[0].command.vector, v());
    assert.equal(c.operations[0].command.space, 'local');
    assert.deepEqual(c.operations[1].command.vector, v(5));
});
test('descriptor update is full replacement including omitted defaults', () => {
    const s = setup(),
        h = s.p.registerContinuous(s.a, { force: v(), torque: v(5), relativePoint: v(6), space: 'local' });
    h.update({ torque: v(7) });
    const c = s.collect();
    assert.deepEqual(kinds(c), ['torque']);
    assert.equal(c.operations[0].command.space, 'world');
    s.q.rejectCandidate(c);
    h.update({});
    assert.equal(s.collect().operations.length, 0);
});
for (const descriptor of [
    null,
    0,
    { force: null },
    { torque: v(Infinity) },
    { relativePoint: v(NaN) },
    { space: null },
    { space: 'screen' },
])
    test(`invalid complete replacement ${JSON.stringify(descriptor)} preserves previous and enable state`, () => {
        const s = setup(),
            h = s.p.registerContinuous(s.a, { force: v() });
        reject(() => h.update(descriptor));
        assert.equal(h.enabled, true);
        assert.deepEqual(s.collect().operations[0].command.vector, v());
    });
for (const options of [null, true, { enabled: null }, { enabled: 0 }, { enabled: 'true' }])
    test(`strict options ${JSON.stringify(options)} leave no producer`, () => {
        const s = setup();
        reject(() => s.p.registerBeforeStep(() => {}, options));
        assert.equal(s.p.diagnostics().liveProducers, 0);
    });
test('options copied once; getter count and descriptor fields each read once', () => {
    const s = setup(),
        counts = {},
        get = (name, value) => ({
            get() {
                counts[name] = (counts[name] ?? 0) + 1;
                return value;
            },
            enumerable: true,
        });
    const descriptor = {},
        options = {};
    for (const [name, value] of Object.entries({ force: v(), torque: v(), relativePoint: v(), space: 'local' }))
        Object.defineProperty(descriptor, name, get(name, value));
    Object.defineProperty(options, 'enabled', get('enabled', false));
    s.p.registerContinuous(s.a, descriptor, options);
    assert.deepEqual(counts, { force: 1, torque: 1, relativePoint: 1, space: 1, enabled: 1 });
    assert.equal(s.collect().operations.length, 0);
});
for (const nested of ['register', 'pause', 'close', 'snapshot', 'retire'])
    test(`caught nested ${nested} in descriptor getter aborts outer without changing existing roster`, () => {
        const s = setup(),
            h = s.p.registerContinuous(s.a, { force: v() });
        const action = {
            register: () => s.p.registerBeforeStep(() => {}),
            pause: () => s.p.pause(),
            close: () => s.p.close(),
            snapshot: () => s.p.snapshot(),
            retire: () => s.p.retireBody(s.a),
        }[nested];
        reject(() =>
            h.update({
                get force() {
                    try {
                        action();
                    } catch {}
                    return v(9);
                },
            }),
        );
        assert.equal(s.p.diagnostics().liveProducers, 1);
        assert.equal(h.disposed, false);
        assert.deepEqual(s.collect().operations[0].command.vector, v());
    });
for (const thrown of [undefined, null, 0, ''])
    test(`falsy descriptor getter throw ${String(thrown)} preserves old descriptor`, () => {
        const s = setup(),
            h = s.p.registerContinuous(s.a, { force: v() });
        reject(() =>
            h.update({
                get force() {
                    throw thrown;
                },
            }),
        );
        assert.deepEqual(s.collect().operations[0].command.vector, v());
    });
test('disabled entry preserves stable order after explicit re-enable', () => {
    const s = setup(),
        first = s.p.registerContinuous(s.a, { torque: v() }, { enabled: false });
    s.p.registerContinuous(s.b, { force: v() });
    first.enable();
    first.enable();
    assert.deepEqual(kinds(s.collect()), ['torque', 'force']);
});
test('disable and disposal are idempotent while eligible; metadata remains readable', () => {
    const s = setup(),
        h = s.p.registerContinuous(s.a, { force: v() });
    h.disable();
    h.disable();
    assert(!h.enabled);
    h.dispose();
    h.dispose();
    h.disable();
    assert(h.disposed);
    assert(!h.enabled);
    reject(() => h.enable());
    reject(() => h.update({}));
    assert.equal(s.p.diagnostics().liveProducers, 0);
});
test('pause keeps hook configuration, disables continuous and requires explicit re-enable', () => {
    const s = setup();
    let calls = 0;
    const hook = s.p.registerBeforeStep(() => {
            calls++;
        }),
        force = s.p.registerContinuous(s.a, { force: v() });
    s.p.pause();
    assert(hook.enabled);
    assert(!force.enabled);
    reject(() => s.p.snapshot());
    reject(() => force.enable());
    reject(() => force.update({}));
    s.p.resume();
    const c = s.collect();
    assert.equal(calls, 1);
    assert.equal(c.operations.length, 0);
    s.q.rejectCandidate(c);
    force.enable();
    assert.equal(s.collect().operations.length, 1);
});
test('paused cleanup disable/dispose allowed, registration refused', () => {
    const s = setup(),
        h = s.p.registerBeforeStep(() => {});
    s.p.pause();
    h.disable();
    h.dispose();
    reject(() => s.p.registerBeforeStep(() => {}));
    assert(h.disposed);
});
test('body invalidated before snapshot refuses before any hook invocation', () => {
    const s = setup();
    let called = false;
    s.p.registerBeforeStep(() => {
        called = true;
    });
    s.p.registerContinuous(s.a, { force: v() });
    s.valid.delete(s.a);
    reject(() => s.collect());
    assert.equal(called, false);
    assert.equal(s.p.diagnostics().collecting, false);
    assert.equal(s.state.calls, 0);
});
test('invalid enable/update cannot change disabled descriptor', () => {
    const s = setup(),
        h = s.p.registerContinuous(s.a, { force: v() }, { enabled: false });
    s.valid.delete(s.a);
    reject(() => h.enable());
    reject(() => h.update({ torque: v() }));
    assert(!h.enabled);
    s.valid.add(s.a);
    h.enable();
    assert.deepEqual(kinds(s.collect()), ['force']);
});
test('retire body disposes only bound continuous entries and never resurrects', () => {
    const s = setup(),
        h = s.p.registerContinuous(s.a, { force: v() }),
        other = s.p.registerContinuous(s.b, { torque: v() }),
        hook = s.p.registerBeforeStep(() => {});
    s.p.retireBody(s.a);
    assert(h.disposed);
    assert(!other.disposed && !hook.disposed);
    reject(() => h.enable());
    assert.deepEqual(kinds(s.collect()), ['torque']);
});
for (const mutation of ['enable', 'disable', 'dispose', 'update', 'register', 'pause', 'close', 'retire'])
    test(`snapshot lease fences ${mutation} before change`, () => {
        const s = setup(),
            h = s.p.registerContinuous(s.a, { force: v() });
        const lease = s.p.snapshot();
        const action = {
            enable: () => h.enable(),
            disable: () => h.disable(),
            dispose: () => h.dispose(),
            update: () => h.update({}),
            register: () => s.p.registerBeforeStep(() => {}),
            pause: () => s.p.pause(),
            close: () => s.p.close(),
            retire: () => s.p.retireBody(s.a),
        }[mutation];
        reject(action);
        assert(h.enabled && !h.disposed);
        assert.equal(s.p.diagnostics().liveProducers, 1);
        lease.dispose();
        lease.dispose();
        h.disable();
    });
test('stale roster entry refuses and stale disposal cannot release a later roster', () => {
    const s = setup();
    s.p.registerBeforeStep(() => {});
    const a = s.p.snapshot();
    a.dispose();
    const b = s.p.snapshot();
    a.dispose();
    assert(s.p.diagnostics().collecting);
    reject(() => a.callbacks[0]({}));
    b.dispose();
    assert(!s.p.diagnostics().collecting);
});
test('roster callback is one-shot within its explicit owner lease', () => {
    const s = setup();
    let calls = 0;
    s.p.registerBeforeStep(() => {
        calls++;
    });
    const lease = s.p.snapshot();
    lease.callbacks[0]({});
    reject(() => lease.callbacks[0]({}));
    assert.equal(calls, 1);
    lease.dispose();
});
for (const result of [1, null, {}, Promise.resolve()])
    test(`hook result ${String(result)} passes through for queue rejection, provisional discarded`, () => {
        const s = setup();
        s.q.submit(s.a, { kind: 'impulse', vector: v() });
        const pending = s.q.diagnostics().pending;
        s.p.registerContinuous(s.a, { force: v() });
        s.p.registerBeforeStep(() => result);
        reject(() => s.collect());
        assert.equal(s.q.diagnostics().pending, pending);
        assert.equal(s.q.diagnostics().provisionalCount, 0);
        assert(!s.p.diagnostics().collecting);
    });
test('hook throw releases lease via owner finally and no internal replay', () => {
    const s = setup();
    let calls = 0;
    s.p.registerBeforeStep(() => {
        calls++;
        throw Error('explicit callback failure');
    });
    reject(() => s.collect());
    assert.equal(calls, 1);
    assert(!s.p.diagnostics().collecting);
    reject(() => s.collect());
    assert.equal(calls, 2);
});
test('copied retained callback context is historical and continuous repeats per explicit logical tick', () => {
    const s = setup();
    const contexts = [];
    s.p.registerBeforeStep((c) => {
        contexts.push(c);
    });
    s.p.registerContinuous(s.a, { force: v() });
    committedMock(s.q, s.collect());
    committedMock(s.q, s.collect());
    assert.equal(contexts[0].tickIndex, 1);
    assert.equal(contexts[1].tickIndex, 2);
    assert(Object.isFrozen(contexts[0]));
    assert.equal(s.state.calls, 2);
});
test('no implicit producer on diagnostics, registration or queue-only empty tick', () => {
    const s = setup();
    let calls = 0;
    s.p.registerBeforeStep(() => {
        calls++;
    });
    s.p.diagnostics();
    assert.equal(calls, 0);
    const c = s.q.collect(1 / 60, 4);
    assert.equal(calls, 0);
    s.q.rejectCandidate(c);
});
test('registration exhaustion does not reuse retired order or block disposal', () => {
    const s = setup({ registrationLimit: 1 }),
        h = s.p.registerBeforeStep(() => {});
    h.dispose();
    reject(() => s.p.registerBeforeStep(() => {}));
    assert.equal(s.p.diagnostics().registrations, 1);
});
test('owner fault blocks public mutations but internal close still retires handles', () => {
    const s = setup(),
        h = s.p.registerContinuous(s.a, { force: v() });
    s.state.fault = true;
    reject(() => h.disable());
    reject(() => h.dispose());
    assert(!h.disposed);
    s.p.close();
    assert(h.disposed);
    assert(!h.enabled);
    h.dispose();
    reject(() => h.enable());
});
test('separate owner registries do not affect each other on close', () => {
    const a = setup(),
        b = setup();
    const ah = a.p.registerContinuous(a.a, { force: v() }),
        bh = b.p.registerContinuous(b.a, { force: v() });
    a.p.close();
    assert(ah.disposed);
    assert(!bh.disposed);
    assert.equal(b.collect().operations.length, 1);
});
for (const value of [0, -1, 1.5, null, Infinity])
    test(`invalid qualification limit ${value}`, () => reject(() => setup({ registrationLimit: value })));

for (const operation of ['close', 'pause', 'retireBody', 'registerBeforeStep', 'snapshot'])
    test(`caught internal owner admission reentry ${operation} cannot alter outer registry`, () => {
        let registry;
        const body = {};
        const owner = {
            assertConfiguration() {
                try {
                    if (operation === 'retireBody') registry.retireBody(body);
                    else if (operation === 'registerBeforeStep') registry.registerBeforeStep(() => {});
                    else registry[operation]();
                } catch {}
            },
            validateContinuousBody() {},
            submit() {
                return 0;
            },
        };
        registry = new Producers(owner);
        reject(() => registry.registerBeforeStep(() => {}));
        assert.deepEqual(registry.diagnostics(), {
            closed: false,
            paused: false,
            collecting: false,
            registrations: 0,
            liveProducers: 0,
            enabledProducers: 0,
        });
    });
test('caught forbidden configuration leaves candidate valid but configuration unchanged, unlike rejected command submission', () => {
    const s = setup(),
        h = s.p.registerContinuous(s.a, { force: v() });
    s.p.registerBeforeStep(() => {
        try {
            h.update({ torque: v(9) });
        } catch {}
    });
    const c = s.collect();
    assert.deepEqual(kinds(c), ['force']);
    assert.equal(s.q.diagnostics().phase, 'validating');
    s.q.rejectCandidate(c);
    assert.deepEqual(kinds(s.collect()), ['force']);
});

const commands = [];
for (const [name, args] of [
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
    [
        'format',
        ['node_modules/prettier/bin/prettier.cjs', '--ignore-path', '/dev/null', '--check', sources[0], sources[2]],
    ],
]) {
    const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
    await writeFile(path.join(output, `${name}.stdout.log`), r.stdout ?? '');
    await writeFile(path.join(output, `${name}.stderr.log`), r.stderr ?? '');
    commands.push({
        name,
        executable: process.execPath,
        args,
        exitCode: r.status,
        signal: r.signal,
        error: r.error ? String(r.error) : null,
    });
}
const after = await hashes(),
    raw =
        JSON.stringify(
            {
                scope: 'Actual queue and producer TypeScript source, no native calls; mock committed notifications only for logical state controls.',
                rows,
            },
            null,
            2,
        ) + '\n';
await writeFile(path.join(output, 'controls.raw.json'), raw);
const ok =
    rows.every((r) => r.status === 'PASS_PURE_SOURCE_CONTROL') &&
    commands.every((r) => r.exitCode === 0) &&
    JSON.stringify(before) === JSON.stringify(after);
const receipt = {
    status: ok ? 'PASS_PURE_SOURCE_CONTROLS_NOT_PHYSICS' : 'FAIL',
    startedAt,
    completedAt: new Date().toISOString(),
    sourceHashesBefore: before,
    sourceHashesAfter: after,
    tests: rows.length,
    passed: rows.filter((r) => r.status === 'PASS_PURE_SOURCE_CONTROL').length,
    rawSha256: sha(raw),
    commands,
};
await writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
if (!ok)
    for (const file of sources) {
        const dest = path.join(output, 'inputs', file);
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, await readFile(file));
    }
console.log(JSON.stringify(receipt));
process.exitCode = ok ? 0 : 1;
