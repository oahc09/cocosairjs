/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Actual-source finite mapper controls only. No native/WASM execution, World integration or physics evidence.
// Creates one NEW evidence directory, copies exact inputs first, and never overwrites an existing attempt.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url),
    ts = require('typescript'),
    root = process.cwd();
const output = path.resolve(process.argv[2] ?? 'tools/verify/box3d/command-wire-evidence-20261022-a');
await mkdir(output);
const sources = [
    'src/air/physics/box3d/command-wire.ts',
    'src/air/physics/box3d/command-queue.ts',
    'src/air/physics/box3d/binding/facade.d.mts',
    'tools/verify/box3d/command-wire-control.mjs',
];
const contracts = [
    'docs/physics/box3d/contracts/unified-command-decisions-v1.md',
    'docs/physics/box3d/contracts/unified-command-wire-v1.md',
    'docs/physics/box3d/contracts/unified-mutation-fence-v1.md',
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const startedAt = new Date().toISOString(),
    inputBytes = new Map(),
    sourceHashesBefore = {};
const save = (name, bytes) => writeFile(path.join(output, name), bytes, { flag: 'wx' });
for (const file of [...sources, ...contracts]) {
    const bytes = await readFile(file);
    inputBytes.set(file, bytes);
    sourceHashesBefore[file] = sha(bytes);
    const copy = path.join(output, 'inputs', file);
    await mkdir(path.dirname(copy), { recursive: true });
    await writeFile(copy, bytes, { flag: 'wx' });
}
await save('source-before.json', `${JSON.stringify(sourceHashesBefore, null, 2)}\n`);
const load = async (file) => {
    const compiled = ts.transpileModule(inputBytes.get(file).toString('utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    });
    return import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
};
const bridge = await load(sources[0]),
    { mapCommandCandidate: map } = bridge,
    { Box3DCommandQueue: Queue } = await load(sources[1]);
const rows = [];
const test = (name, run) => {
    try {
        const observed = run();
        rows.push({ name, status: 'PASS_PURE_SOURCE_CONTROL', observed: observed ?? null });
    } catch (error) {
        rows.push({ name, status: 'FAIL', error: String(error), stack: error?.stack });
    }
};
const v = (x = 1, y = 2, z = 3) => ({ x, y, z });
const p = (x = 1) => ({ position: v(x, 0, -0), rotation: { x: 0, y: 0, z: 0, w: 2 } });
// These are deliberate opaque JS sentinels, not genuine binding/native capabilities.
const token = () =>
    Object.defineProperties(
        {},
        {
            low: { get: () => assert.fail('mapper must not read token.low') },
            high: { get: () => assert.fail('mapper must not read token.high') },
        },
    );
const setup = () => {
    const q = new Queue({ generation: 31 }),
        a = {},
        b = {},
        ta = token(),
        tb = token(),
        bodyTokens = new Map([
            [a, ta],
            [b, tb],
        ]);
    q.registerBody(a);
    q.registerBody(b);
    return { q, a, b, ta, tb, bodyTokens };
};
const collect = (s, producers = []) => s.q.collect(1 / 60, 4, producers);
const mapped = (s, c = collect(s)) => map(c, s.bodyTokens);
const effect = (kind = 'force', fields = {}) => ({ kind, vector: v(), ...fields });
const replacement = (candidate, index, changes) =>
    Object.freeze({
        ...candidate,
        operations: Object.freeze(
            candidate.operations.map((record, i) => (i === index ? Object.freeze({ ...record, ...changes }) : record)),
        ),
    });
const badCommand = (candidate, changes) =>
    replacement(candidate, 0, {
        command: Object.freeze({ ...candidate.operations[0].command, ...changes }),
    });
const rejectedUnchanged = (s, candidate, run, pattern = /Box3D command wire:/) => {
    const before = s.q.diagnostics(),
        entries = [...s.bodyTokens],
        original = candidate.original,
        operations = candidate.operations;
    assert.throws(run, pattern);
    assert.deepEqual(s.q.diagnostics(), before);
    assert.equal(candidate.original, original);
    assert.equal(candidate.operations, operations);
    assert.deepEqual([...s.bodyTokens], entries);
};
const mappedKinds = (commands) => commands.map((command) => command.kind);

test('only one internal runtime export and only type imports', () => {
    assert.deepEqual(Object.keys(bridge), ['mapCommandCandidate']);
    const source = ts.createSourceFile(sources[0], inputBytes.get(sources[0]).toString(), ts.ScriptTarget.ES2022);
    const imports = source.statements.filter(ts.isImportDeclaration);
    assert.equal(imports.length, 2);
    for (const statement of imports) assert.equal(statement.importClause?.isTypeOnly, true);
});
test('empty candidate produces a fresh frozen empty array without map lookup', () => {
    const s = setup(),
        c = collect(s);
    const noLookup = { get: () => assert.fail('empty candidate must not resolve bodies') };
    const output = map(c, noLookup);
    assert.deepEqual(output, []);
    assert(Object.isFrozen(output));
    assert.notEqual(output, c.operations);
    assert.notEqual(map(c, noLookup), output);
    assert.equal(s.q.diagnostics().phase, 'validating');
});
for (const [kind, wireKind, offset] of [
    ['force', 'force', true],
    ['torque', 'torque', false],
    ['impulse', 'linearImpulse', true],
    ['angular-impulse', 'angularImpulse', false],
])
    for (const space of ['world', 'local'])
        test(`${kind} ${space} preserves values, offset and token identity`, () => {
            const s = setup();
            s.q.submit(
                s.a,
                effect(kind, { vector: v(-0, 1 / 3, Number.MAX_VALUE), relativePoint: v(9, -4, 1), space }),
            );
            const c = collect(s),
                [out] = mapped(s, c),
                record = c.operations[0];
            assert.equal(out.kind, wireKind);
            assert.equal(out.body, s.ta);
            assert.equal(out.sequence, 1);
            assert.equal(out.space, space);
            assert.deepEqual(out.value, [-0, 1 / 3, Number.MAX_VALUE]);
            assert(Object.is(out.value[0], -0));
            assert(Object.isFrozen(out) && Object.isFrozen(out.value));
            assert.notEqual(out.value, record.command.vector);
            assert.equal(Object.hasOwn(out, 'offset'), offset);
            if (offset) {
                assert.deepEqual(out.offset, [9, -4, 1]);
                assert(Object.isFrozen(out.offset));
            }
            assert.equal(Object.isFrozen(s.ta), false);
        });
for (const kind of ['force', 'torque', 'impulse', 'angular-impulse'])
    test(`${kind} queue defaults remain explicit`, () => {
        const s = setup();
        s.q.submit(s.a, effect(kind));
        const [out] = mapped(s);
        assert.equal(out.space, 'world');
        if (kind === 'force' || kind === 'impulse') assert.deepEqual(out.offset, [0, 0, 0]);
        else assert.equal(Object.hasOwn(out, 'offset'), false);
    });
for (const [kind, wireKind] of [
    ['clear-forces', 'clearForces'],
    ['clear-velocity', 'clearVelocity'],
    ['clear-state', 'clearState'],
])
    test(`${kind} has no invented vector, reason or wake fields`, () => {
        const s = setup();
        s.q.submit(s.a, { kind });
        const [out] = mapped(s);
        assert.deepEqual(out, { body: s.ta, sequence: 1, kind: wireKind });
        assert(Object.isFrozen(out));
    });
for (const preserveVelocity of [false, true])
    for (const wake of [false, true])
        test(`teleport preserves explicit booleans preserve=${preserveVelocity} wake=${wake}`, () => {
            const s = setup();
            s.q.submit(s.a, { kind: 'teleport', pose: p(), preserveVelocity, wake });
            const [out] = mapped(s);
            assert.equal(out.kind, 'reset');
            assert.equal(out.mode, 'teleport');
            assert.equal(out.sequence, 1);
            assert.equal(out.preserveVelocity, preserveVelocity);
            assert.equal(out.wake, wake);
            assert.deepEqual(out.pose, { position: [1, 0, -0], rotation: [0, 0, 0, 2] });
            for (const value of [out, out.pose, out.pose.position, out.pose.rotation]) assert(Object.isFrozen(value));
            return { facadeFlagInputsOnly: { preserveVelocity, wake, mode: out.mode }, nativeExecution: 'NOT_RUN' };
        });
test('teleport defaults come from copied queue booleans, not truthy mapper fallback', () => {
    const s = setup();
    s.q.submit(s.a, { kind: 'teleport', pose: p() });
    const [out] = mapped(s);
    assert.equal(out.preserveVelocity, false);
    assert.equal(out.wake, true);
});
test('target copies pose, leaves quaternion unnormalized and has no reset-only fields', () => {
    const s = setup();
    s.q.acquireTarget(s.a);
    s.q.submit(s.a, { kind: 'target', pose: p(Number.MAX_VALUE) });
    const c = collect(s),
        [out] = mapped(s, c);
    assert.deepEqual(out, {
        body: s.ta,
        sequence: 1,
        kind: 'target',
        pose: { position: [Number.MAX_VALUE, 0, -0], rotation: [0, 0, 0, 2] },
    });
    assert.notEqual(out.pose, c.operations[0].command.pose);
    for (const value of [out.pose, out.pose.position, out.pose.rotation]) assert(Object.isFrozen(value));
});
for (const producer of [false, true])
    test(`target clear ${producer ? 'producer' : 'user'} keeps positive sequence and user reason`, () => {
        const s = setup();
        s.q.acquireTarget(s.a);
        if (!producer) s.q.submit(s.a, { kind: 'target-clear' });
        const c = collect(
            s,
            producer
                ? [
                      () => {
                          s.q.submit(s.a, { kind: 'target-clear' });
                      },
                  ]
                : [],
        );
        const [out] = mapped(s, c);
        assert.deepEqual(out, { body: s.ta, sequence: 1, kind: 'pairedClear', reason: 'user' });
        assert.equal(c.operations[0].source, producer ? 'producer' : 'user');
    });
for (const cleanup of [false, true])
    test(`${cleanup ? 'protected cleanup' : 'idle'} maps null to zero with exact reason`, () => {
        const s = setup();
        s.q.acquireTarget(s.a);
        if (cleanup) s.q.revokeTarget(s.a);
        const c = collect(s),
            [out] = mapped(s, c);
        assert.equal(c.operations[0].sequence, null);
        assert.deepEqual(out, { body: s.ta, sequence: 0, kind: 'pairedClear', reason: cleanup ? 'cleanup' : 'idle' });
    });
test('sequence gaps and mixed producer order remain unchanged across bodies', () => {
    const s = setup();
    s.q.submit(s.a, effect('force'));
    s.q.submit(s.b, effect('torque'));
    s.q.cancelPending(s.a);
    s.q.submit(s.a, { kind: 'teleport', pose: p() });
    const c = collect(s, [
        () => {
            s.q.submit(s.b, effect('impulse'));
            s.q.submit(s.a, effect('angular-impulse'));
        },
    ]);
    const output = mapped(s, c);
    assert.deepEqual(mappedKinds(output), ['torque', 'reset', 'linearImpulse', 'angularImpulse']);
    assert.deepEqual(
        output.map((row) => row.sequence),
        [2, 3, 4, 5],
    );
    assert.deepEqual(
        output.map((row) => row.body),
        [s.tb, s.ta, s.tb, s.ta],
    );
    assert.equal(output.length, c.operations.length);
});
test('already reduced targets are not resurrected from original accepted records', () => {
    const s = setup();
    s.q.acquireTarget(s.a);
    s.q.submit(s.a, { kind: 'target', pose: p(1) });
    s.q.submit(s.a, { kind: 'target', pose: p(2) });
    s.q.submit(s.a, { kind: 'clear-forces' });
    const c = collect(s),
        before = s.q.diagnostics(),
        output = mapped(s, c);
    assert.equal(c.original.length, 3);
    assert.equal(c.operations.length, 2);
    assert.deepEqual(mappedKinds(output), ['target', 'clearForces']);
    assert.deepEqual(
        output.map((r) => r.sequence),
        [2, 3],
    );
    assert.equal(output[0].pose.position[0], 2);
    assert.deepEqual(s.q.diagnostics(), before);
});
test('target then preserve teleport maps reset only; no manufactured idle zero', () => {
    const s = setup();
    s.q.acquireTarget(s.a);
    s.q.submit(s.a, { kind: 'target', pose: p(1) });
    s.q.submit(s.a, { kind: 'teleport', pose: p(2), preserveVelocity: true });
    const output = mapped(s);
    assert.deepEqual(mappedKinds(output), ['reset']);
    assert.equal(output[0].sequence, 2);
    assert.equal(output[0].preserveVelocity, true);
});
test('reset then target keeps copied basis requests in original order', () => {
    const s = setup();
    s.q.acquireTarget(s.a);
    s.q.submit(s.a, { kind: 'teleport', pose: p(1) });
    s.q.submit(s.a, { kind: 'target', pose: p(2) });
    const output = mapped(s);
    assert.deepEqual(mappedKinds(output), ['reset', 'target']);
    assert.deepEqual(
        output.map((r) => r.pose.position[0]),
        [1, 2],
    );
});
for (const clear of ['clear-velocity', 'clear-state'])
    test(`ordinary ${clear} survives before later target`, () => {
        const s = setup();
        s.q.acquireTarget(s.a);
        s.q.submit(s.a, { kind: 'target', pose: p(1) });
        s.q.submit(s.a, { kind: clear });
        s.q.submit(s.a, { kind: 'target', pose: p(2) });
        const output = mapped(s);
        assert.deepEqual(
            output.map((r) => r.sequence),
            [2, 3],
        );
        assert.equal(output[1].kind, 'target');
    });
test('protected clear remains final after retained reset/ordinary clear', () => {
    const s = setup();
    s.q.acquireTarget(s.a);
    s.q.submit(s.a, { kind: 'teleport', pose: p(), preserveVelocity: true });
    s.q.submit(s.a, { kind: 'clear-state' });
    s.q.revokeTarget(s.a);
    const output = mapped(s);
    assert.deepEqual(mappedKinds(output), ['reset', 'clearState', 'pairedClear']);
    assert.deepEqual(
        output.map((r) => r.sequence),
        [1, 2, 0],
    );
    assert.equal(output[2].reason, 'cleanup');
});
test('clearForces plus no target intent retains idle clear and ordinary positive sequence', () => {
    const s = setup();
    s.q.acquireTarget(s.a);
    s.q.submit(s.a, { kind: 'clear-forces' });
    assert.deepEqual(
        mapped(s).map((r) => [r.kind, r.sequence]),
        [
            ['clearForces', 1],
            ['pairedClear', 0],
        ],
    );
});
test('repeated mapping does not retire, commit or mutate queue/map/token and copies arrays afresh', () => {
    const s = setup();
    s.q.submit(s.a, effect());
    const c = collect(s),
        before = s.q.diagnostics(),
        a = mapped(s, c),
        b = mapped(s, c);
    assert.deepEqual(a, b);
    assert.notEqual(a, b);
    assert.notEqual(a[0], b[0]);
    assert.notEqual(a[0].value, b[0].value);
    assert.notEqual(a[0].offset, b[0].offset);
    assert.equal(a[0].body, b[0].body);
    assert.deepEqual(s.q.diagnostics(), before);
    assert.equal(s.bodyTokens.get(s.a), s.ta);
    assert.equal(Object.isFrozen(s.ta), false);
    for (const mutate of [
        () => a.push({}),
        () => {
            a[0].value[0] = 99;
        },
        () => {
            a[0].offset[0] = 99;
        },
        () => {
            a[0].sequence = 99;
        },
    ])
        assert.throws(mutate, TypeError);
});
test('mapper does not read original accepted records', () => {
    const s = setup();
    s.q.submit(s.a, effect());
    const c = collect(s);
    const view = Object.freeze({
        generation: c.generation,
        context: c.context,
        operations: c.operations,
        get original() {
            assert.fail('mapper must not reduce or inspect accepted original log');
        },
    });
    assert.equal(mapped(s, view).length, 1);
});
for (const entry of [undefined, null, 1, 'token', () => {}])
    test(`missing/non-object mapped capability ${String(entry)} rejects whole view`, () => {
        const s = setup();
        s.q.submit(s.a, effect());
        s.q.submit(s.b, effect('torque'));
        if (entry === undefined) s.bodyTokens.delete(s.b);
        else s.bodyTokens.set(s.b, entry);
        const c = collect(s);
        rejectedUnchanged(s, c, () => mapped(s, c));
    });
test('two logical identities sharing a capability reject rather than merge', () => {
    const s = setup();
    s.q.submit(s.a, effect());
    s.q.submit(s.b, effect('torque'));
    s.bodyTokens.set(s.b, s.ta);
    const c = collect(s);
    rejectedUnchanged(s, c, () => mapped(s, c), /different logical bodies/);
});
test('changed repeated logical mapping rejects; custom map is not a sandbox', () => {
    const s = setup();
    s.q.submit(s.a, effect());
    s.q.submit(s.a, effect('torque'));
    const c = collect(s);
    let count = 0;
    rejectedUnchanged(s, c, () => map(c, { get: () => (++count === 1 ? s.ta : s.tb) }), /mapping changed/);
    assert.equal(count, 2);
});
for (const changes of [{ generation: 32 }, { tickIndex: 2 }, { body: {} }, { body: null }])
    test(`mismatched copied record ${JSON.stringify(changes)} rejects`, () => {
        const s = setup();
        s.q.submit(s.a, effect());
        const c = replacement(collect(s), 0, changes);
        rejectedUnchanged(s, c, () => mapped(s, c));
    });
for (const sequence of [null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1'])
    test(`invalid positive sequence ${String(sequence)} rejects`, () => {
        const s = setup();
        s.q.submit(s.a, effect());
        const c = replacement(collect(s), 0, { sequence });
        rejectedUnchanged(s, c, () => mapped(s, c));
    });
for (const sequence of [1, 2])
    test(`${sequence === 1 ? 'reversed' : 'duplicate'} sequence rejects`, () => {
        const s = setup();
        s.q.submit(s.a, effect());
        s.q.submit(s.a, effect('torque'));
        let c = replacement(collect(s), 0, { sequence: 2 });
        c = replacement(c, 1, { sequence });
        rejectedUnchanged(s, c, () => mapped(s, c));
    });
test('maximum safe positive sequence is preserved exactly', () => {
    const s = setup();
    s.q.submit(s.a, effect());
    const c = replacement(collect(s), 0, { sequence: Number.MAX_SAFE_INTEGER });
    assert.equal(mapped(s, c)[0].sequence, Number.MAX_SAFE_INTEGER);
});
for (const source of ['idle', 'protected'])
    for (const changes of [{ sequence: 0 }, { sequence: 1 }, { command: Object.freeze({ kind: 'clear-state' }) }])
        test(`${source} rejects invalid internal null/target-clear pairing ${JSON.stringify(changes)}`, () => {
            const s = setup();
            s.q.acquireTarget(s.a);
            const c = replacement(collect(s), 0, { source, ...changes });
            rejectedUnchanged(s, c, () => mapped(s, c));
        });
test('internal sequence zero never resets the increasing positive sequence comparison', () => {
    const s = setup();
    s.q.acquireTarget(s.a);
    s.q.submit(s.b, effect());
    s.q.submit(s.b, effect('torque'));
    const real = collect(s),
        [first, second, idle] = real.operations;
    const interleaved = Object.freeze({ ...real, operations: Object.freeze([first, idle, second]) });
    assert.deepEqual(
        mapped(s, interleaved).map((r) => r.sequence),
        [1, 0, 2],
    );
    const backwards = replacement(interleaved, 2, { sequence: 1 });
    rejectedUnchanged(s, backwards, () => mapped(s, backwards));
});
for (const source of ['scene', 'cleanup', 'unknown', null])
    test(`unsupported source ${source} cannot manufacture internal flags`, () => {
        const s = setup();
        s.q.submit(s.a, effect());
        const c = replacement(collect(s), 0, { source });
        rejectedUnchanged(s, c, () => mapped(s, c));
    });
for (const field of ['preserveVelocity', 'wake'])
    for (const value of [undefined, null, 0, 1, 'false'])
        test(`copied teleport ${field}=${String(value)} rejects without fallback`, () => {
            const s = setup();
            s.q.submit(s.a, { kind: 'teleport', pose: p() });
            const c = badCommand(collect(s), { [field]: value });
            rejectedUnchanged(s, c, () => mapped(s, c));
        });
for (const value of [undefined, null, 'WORLD', 0])
    test(`copied space ${String(value)} rejects without fallback`, () => {
        const s = setup();
        s.q.submit(s.a, effect());
        const c = badCommand(collect(s), { space: value });
        rejectedUnchanged(s, c, () => mapped(s, c));
    });
for (const field of ['vector', 'relativePoint'])
    for (const value of [undefined, null, v(NaN), v(Infinity), v('1')])
        test(`copied ${field} ${JSON.stringify(value)} is rejected if malformed`, () => {
            const s = setup();
            s.q.submit(s.a, effect());
            const c = badCommand(collect(s), { [field]: value });
            rejectedUnchanged(s, c, () => mapped(s, c));
        });
test('unknown kind rejects instead of silently skipping a row', () => {
    const s = setup();
    s.q.submit(s.a, effect());
    const c = badCommand(collect(s), { kind: 'scene-reset' });
    rejectedUnchanged(s, c, () => mapped(s, c), /unknown copied command/);
});
for (const changes of [{ generation: 0 }, { generation: 1.5 }, { context: { tickIndex: 0 } }])
    test(`invalid candidate metadata ${JSON.stringify(changes)} rejects`, () => {
        const s = setup(),
            c = Object.freeze({ ...collect(s), ...changes });
        rejectedUnchanged(s, c, () => mapped(s, c));
    });
test('shape-valid swapped map and stale candidate are explicitly NOT authenticated by mapper', () => {
    const s = setup();
    s.q.submit(s.a, effect());
    const c = collect(s);
    s.q.rejectCandidate(c);
    const swapped = new Map([
        [s.a, s.tb],
        [s.b, s.ta],
    ]);
    assert.equal(map(c, swapped)[0].body, s.tb);
    assert.equal(s.q.diagnostics().phase, 'ready');
    return { ownerMustAuthenticateCandidateAndActualBodyToken: true, nativeExecution: 'NOT_RUN' };
});
test('semantic flag inputs agree with frozen wire reason and sequence requirements', () => {
    const text = inputBytes.get(contracts[1]).toString();
    for (const value of ['LOCAL=1', 'PRESERVE_VELOCITY=2', 'WAKE=4', 'SCENE=8', 'IDLE_ZERO=16', 'CLEANUP_ZERO=32'])
        assert(text.includes(value));
    assert(text.includes('PAIRED_CLEAR with flags 0 is user target clear and needs a positive sequence'));
    assert(text.includes('IDLE_ZERO/CLEANUP_ZERO require sequence 0'));
    return { basis: 'Frozen contract plus actual mapper semantic output controls; no native flag-packing execution.' };
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
            '--moduleResolution',
            'bundler',
            '--skipLibCheck',
            '--noEmit',
            sources[0],
            sources[1],
        ],
    ],
    [
        'format',
        ['node_modules/prettier/bin/prettier.cjs', '--ignore-path', '/dev/null', '--check', sources[0], sources[3]],
    ],
]) {
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
    await save(`${name}.stdout.log`, result.stdout ?? '');
    await save(`${name}.stderr.log`, result.stderr ?? '');
    commands.push({
        name,
        executable: process.execPath,
        args,
        exitCode: result.status,
        signal: result.signal,
        error: result.error ? String(result.error) : null,
    });
}
const sourceHashesAfter = {};
for (const file of [...sources, ...contracts]) sourceHashesAfter[file] = sha(await readFile(file));
const raw = `${JSON.stringify({ scope: 'Actual TypeScript mapper and queue input source only. Opaque token sentinels are not native capabilities. Mutated fixtures test defensive checks, not candidate authentication. No World registration, native packing, WASM, solver, target lifetime or physics qualification.', rows }, null, 2)}\n`;
await save('controls.raw.json', raw);
const passed = rows.filter((row) => row.status === 'PASS_PURE_SOURCE_CONTROL').length;
const ok =
    passed === rows.length &&
    commands.every((command) => command.exitCode === 0) &&
    JSON.stringify(sourceHashesBefore) === JSON.stringify(sourceHashesAfter);
const receipt = {
    status: ok ? 'PASS_PURE_SOURCE_CONTROLS_NOT_PHYSICS' : 'FAIL',
    startedAt,
    completedAt: new Date().toISOString(),
    sourceHashesBefore,
    sourceHashesAfter,
    rawSha256: sha(raw),
    tests: rows.length,
    passed,
    commands,
    nativeQualification: 'NOT_RUN',
    wasmQualification: 'NOT_RUN',
    worldIntegration: 'NOT_IMPLEMENTED_BY_THIS_CHANGE',
};
await save('receipt.json', `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
process.exitCode = ok ? 0 : 1;
