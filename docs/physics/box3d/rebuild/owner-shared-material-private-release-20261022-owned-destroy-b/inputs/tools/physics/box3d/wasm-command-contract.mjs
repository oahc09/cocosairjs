// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Real WASM only. Injection rows label failure mechanisms, never substitute physics.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { sha256 } from './verify-sources.mjs';
const dir = resolve(process.argv[2]),
    destination = resolve(dir, 'wasm-command-contract.raw.json');
const samples = resolve(dir, 'command-samples.raw.jsonl');
assert.ok(!existsSync(destination) && !existsSync(samples));
writeFileSync(samples, '');
const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json')));
const { default: factory } = await import(pathToFileURL(resolve(dir, 'box3d-st.mjs')));
const { createBox3DBinding } = await import(pathToFileURL(resolve(dir, 'facade.mjs')));
const wasmBinary = readFileSync(resolve(dir, 'box3d-st.wasm'));
const module = await factory({ wasmBinary }),
    second = await factory({ wasmBinary });
const api = createBox3DBinding(module, manifest),
    other = createBox3DBinding(second, manifest);
const report = {
    status: 'RUNNING',
    identity: api.identity,
    fixtureSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    checks: {},
    negatives: [],
    injectedMechanisms: [],
    observations: {},
    sampleCount: 0,
    nativeCommandInvocations: [],
};
// Observe every actual native invocation, including native refusals and injected delivery failures.
const rawCommandNative = module._air_b3_command_batch;
module._air_b3_command_batch = (...args) => {
    const input = Array.from(module.HEAPU32.slice(args[1] >>> 2, (args[1] >>> 2) + args[2]));
    const row = {
        index: report.nativeCommandInvocations.length,
        apply: args[5],
        inputWords: args[2],
        bodyCount: input[3],
        operationCount: input[4],
        input,
    };
    report.nativeCommandInvocations.push(row);
    try {
        const status = rawCommandNative(...args);
        row.nativeStatus = status;
        if (status === 0 && args[5] === 1 && input[4] > 0)
            row.actualOutput = Array.from(module.HEAPU32.slice(args[3] >>> 2, (args[3] >>> 2) + args[4]));
        return status;
    } catch (error) {
        row.throwMessage = error.message;
        throw error;
    }
};
const json = (v, pretty = false) =>
    JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x), pretty ? 2 : undefined);
const sample = (row) => {
    appendFileSync(samples, json(row) + '\n');
    ++report.sampleCount;
};
const pose = (position = [0, 0, 0], rotation = [0, 0, 0, 1]) => ({ position, rotation });
const cmd = (body, kind, sequence, fields = {}) => ({ body, kind, sequence, ...fields });
const apply = (world, commands) => api.applyCommandBatch(world, commands, 1 / 60, 4);
const errorOf = (action, outcome) => {
    let error;
    try {
        action();
    } catch (e) {
        error = e;
    }
    assert.ok(error, 'Expected rejection');
    assert.equal(error.mutationOutcome, outcome);
    if (outcome !== undefined) {
        const d = Object.getOwnPropertyDescriptor(error, 'mutationOutcome');
        assert.equal(d.writable, false);
        assert.equal(d.configurable, false);
    }
    return {
        code: error.code,
        message: error.message,
        nativeStatus: error.nativeStatus,
        mutationOutcome: error.mutationOutcome,
    };
};
const add = (a, b) => a.map((v, i) => v + b[i]),
    mul = (a, f) => a.map((v) => v * f);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const qm = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const rotate = (q, v) => qm(qm(q, [...v, 0]), [-q[0], -q[1], -q[2], q[3]]).slice(0, 3);
const inverseRotate = (q, v) => rotate([-q[0], -q[1], -q[2], q[3]], v);
const near = (actual, expected, tolerance = 1e-3) => {
    assert.equal(actual.length, expected.length);
    actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= tolerance, `${v} != ${expected[i]}`));
};
function checkPlan(result) {
    for (const row of result.operations)
        for (const field of ['linearVelocity', 'angularVelocity', 'force', 'torque'])
            assert.deepEqual(row.actual[field], row.plan[field], `${row.kind} exact ${field}`);
    for (const row of result.bodies) {
        assert.deepEqual(row.actual.pose, row.plan.pose);
        assert.deepEqual(row.actual.worldCenter, row.plan.worldCenter);
        for (const field of ['linearVelocity', 'angularVelocity', 'force', 'torque'])
            assert.deepEqual(row.actual.state[field], row.plan[field]);
    }
}
try {
    assert.throws(
        () =>
            createBox3DBinding(module, {
                ...manifest,
                schemaSha256: '43df81eba981c9ab5751dbe5f807e660d46cac1a5e1b4936462d5afb57a24040',
            }),
        { code: 'AIR_E_BOX3D_ABI' },
    );
    report.checks.rejectsOldMotionSchema = true;
    const baseline = api.liveBytes(),
        baselineOther = other.liveBytes();
    const world = api.createWorld([0, 0, 0]),
        foreignWorld = api.createWorld([0, 0, 0]),
        moduleWorld = other.createWorld([0, 0, 0]);
    const dynamic = api.createBody(world, { type: 2 }),
        kinematic = api.createBody(world, { type: 1 }),
        staticBody = api.createBody(world, { type: 0 });
    api.createOffsetBox(dynamic, [0.2, -0.1, 0.3], [1, 0.5, 0.25], [0, Math.sin(0.3), 0, Math.cos(0.3)]);
    api.setBodyMass(world, dynamic, 2);
    api.createSphere(kinematic, 0.5);
    const foreign = api.createBody(foreignWorld, { type: 2 }),
        alien = other.createBody(moduleWorld, { type: 2 });
    api.step(world);
    const tokens = [dynamic, kinematic, staticBody];
    function observe() {
        const diagnostics = api.stepDiagnostics(world);
        return {
            states: tokens.map((b) => api.bodyState(world, b)),
            transforms: Array.from(api.bodyTransforms(world, tokens)),
            counts: api.worldCounts(world),
            memory: api.bridgeMemory(world),
            diagnostics,
            snapshot: diagnostics.snapshotAvailable ? api.readStepSnapshot(world) : null,
        };
    }
    function negative(name, action) {
        const before = observe();
        const error = errorOf(action, 'not-mutated');
        const after = observe();
        assert.deepEqual(after, before);
        report.negatives.push({ name, error });
        sample({ kind: 'rejection', name, error, before, after });
    }
    const good = cmd(dynamic, 'force', 1, { value: [1, 2, 3] });
    const invalid = [
        ['foreign-world', [good, cmd(foreign, 'force', 2, { value: [1, 0, 0] })]],
        ['foreign-module', [cmd(alien, 'clearForces', 1)]],
        ['forged-token', [cmd({ ...dynamic }, 'clearForces', 1)]],
        ['later-static-force', [good, cmd(staticBody, 'force', 2, { value: [1, 0, 0] })]],
        ['later-target-type', [good, cmd(dynamic, 'target', 2, { pose: pose() })]],
        ['NaN', [good, cmd(dynamic, 'torque', 2, { value: [NaN, 0, 0] })]],
        ['Infinity', [cmd(dynamic, 'force', 1, { value: [Infinity, 0, 0] })]],
        ['float32-overflow', [cmd(dynamic, 'force', 1, { value: [1e50, 0, 0] })]],
        [
            'accumulation-overflow',
            [cmd(dynamic, 'force', 1, { value: [3e38, 0, 0] }), cmd(dynamic, 'force', 2, { value: [3e38, 0, 0] })],
        ],
        ['sequence-duplicate', [good, { ...good }]],
        ['sequence-zero-user', [{ ...good, sequence: 0 }]],
        ['sequence-unsafe', [{ ...good, sequence: 2 ** 53 }]],
        ['sequence-reversal', [{ ...good, sequence: 2 }, good]],
        [
            'target-then-reset',
            [cmd(kinematic, 'target', 1, { pose: pose() }), cmd(kinematic, 'reset', 2, { pose: pose() })],
        ],
        [
            'target-then-clear-velocity',
            [cmd(kinematic, 'target', 1, { pose: pose() }), cmd(kinematic, 'clearVelocity', 2)],
        ],
        [
            'duplicate-target',
            [cmd(kinematic, 'target', 1, { pose: pose() }), cmd(kinematic, 'target', 2, { pose: pose() })],
        ],
        [
            'idle-with-reset',
            [cmd(kinematic, 'reset', 1, { pose: pose() }), cmd(kinematic, 'pairedClear', 0, { reason: 'idle' })],
        ],
        [
            'cleanup-not-last',
            [cmd(kinematic, 'pairedClear', 0, { reason: 'cleanup' }), cmd(kinematic, 'clearForces', 1)],
        ],
        ['zero-quaternion', [cmd(dynamic, 'reset', 1, { pose: pose([0, 0, 0], [0, 0, 0, 0]) })]],
        ['bad-quaternion', [cmd(dynamic, 'reset', 1, { pose: pose([0, 0, 0], [0, NaN, 0, 1]) })]],
        ['scene-dynamic', [cmd(dynamic, 'reset', 0, { mode: 'scene', pose: pose() })]],
        ['public-static', [cmd(staticBody, 'reset', 1, { pose: pose() })]],
        ['unknown-opcode', [cmd(dynamic, 'unrecognized', 1)]],
        ['unused-offset', [cmd(dynamic, 'torque', 1, { value: [0, 0, 0], offset: [1, 0, 0] })]],
    ];
    for (const [name, commands] of invalid) negative(name, () => apply(world, commands));
    for (const [kind, key] of [
        ['force', 'space'],
        ['force', 'offset'],
        ['reset', 'mode'],
        ['reset', 'wake'],
        ['reset', 'preserveVelocity'],
    ]) {
        const fields = kind === 'reset' ? { pose: pose() } : { value: [1, 0, 0] };
        negative(`explicit-null-${key}`, () => apply(world, [cmd(dynamic, kind, 1, { ...fields, [key]: null })]));
    }
    for (const value of [0, 1, 'false'])
        negative(`strict-wake-${value}`, () => apply(world, [cmd(dynamic, 'reset', 1, { pose: pose(), wake: value })]));
    for (const dt of [0, -1, 1e-50, NaN, Infinity, 1e-40])
        negative(`dt-${dt}`, () => api.applyCommandBatch(world, [good], dt, 4));
    for (const n of [0, 3, 16, '4']) negative(`substeps-${n}`, () => api.applyCommandBatch(world, [good], 1 / 60, n));
    const native = module._air_b3_command_batch;
    let calls = 0;
    module._air_b3_command_batch = (...args) => {
        ++calls;
        return native(...args);
    };
    try {
        const reentrant = cmd(dynamic, 'force', 1, { value: [1, 0, 0] });
        // cmd spreads fields, so define the accessor on the actual submitted object.
        Object.defineProperty(reentrant, 'value', {
            enumerable: true,
            get() {
                try {
                    api.clearBodyForces(world, dynamic);
                } catch {}
                return [1, 0, 0];
            },
        });
        negative('caught-reentry', () => apply(world, [reentrant]));
        assert.equal(calls, 0);
        const originalControl = module._air_b3_body_control;
        let controlCalls = 0;
        module._air_b3_body_control = (...args) => {
            ++controlCalls;
            return originalControl(...args);
        };
        try {
            negative('caught-reentry-no-native-control', () => apply(world, [reentrant]));
            assert.equal(controlCalls, 0);
        } finally {
            module._air_b3_body_control = originalControl;
        }
        const allNativeCalls = [];
        negative('caught-reentry-zero-all-native-exports', () => {
            const originals = new Map();
            for (const key of Object.keys(module))
                if (key.startsWith('_') && typeof module[key] === 'function') {
                    originals.set(key, module[key]);
                    module[key] = (...args) => {
                        allNativeCalls.push(key);
                        return originals.get(key)(...args);
                    };
                }
            try {
                return apply(world, [reentrant]);
            } finally {
                for (const [key, original] of originals) module[key] = original;
                assert.deepEqual(allNativeCalls, []);
            }
        });
        sample({ kind: 'caught-reentry-zero-native-calls', allNativeCalls });
        const readCounts = {};
        const once = (name, value) => ({
            enumerable: true,
            get() {
                readCounts[name] = (readCounts[name] ?? 0) + 1;
                assert.equal(readCounts[name], 1, name);
                return value;
            },
        });
        const vector = {
            length: 3,
            0: 1,
            1: 2,
            2: 3,
            [Symbol.iterator]() {
                throw Error('Do not iterate user vector');
            },
        };
        const fields = { body: dynamic, kind: 'force', sequence: 1, value: vector, space: 'world', offset: [0, 0, 0] };
        const single = {};
        for (const [key, value] of Object.entries(fields)) Object.defineProperty(single, key, once(key, value));
        const list = [single];
        list.map = () => {
            throw Error('Do not call user map');
        };
        list[Symbol.iterator] = () => {
            throw Error('Do not call user iterator');
        };
        const before = observe();
        api.validateCommandBatch(world, list, 1 / 60, 4);
        assert.deepEqual(observe(), before);
        assert.equal(calls, 1);
        sample({ kind: 'single-read', readCounts, before, after: observe() });
        const poseReads = {};
        const observeOnce = (key, value) => ({
            enumerable: true,
            get() {
                poseReads[key] = (poseReads[key] ?? 0) + 1;
                assert.equal(poseReads[key], 1, key);
                return value;
            },
        });
        const indexed = (prefix, values) => {
            const v = {
                [Symbol.iterator]() {
                    throw Error('No caller iterator');
                },
            };
            Object.defineProperty(v, 'length', observeOnce(`${prefix}.length`, values.length));
            values.forEach((x, i) => Object.defineProperty(v, i, observeOnce(`${prefix}.${i}`, x)));
            return v;
        };
        const copiedPose = {};
        Object.defineProperty(copiedPose, 'position', observeOnce('position', indexed('p', [1, 2, 3])));
        Object.defineProperty(copiedPose, 'rotation', observeOnce('rotation', indexed('q', [0, 0, 0, 2])));
        const resetFields = {
                body: dynamic,
                kind: 'reset',
                sequence: 1,
                pose: copiedPose,
                mode: 'teleport',
                preserveVelocity: false,
                wake: true,
            },
            resetOnce = {};
        for (const [key, value] of Object.entries(resetFields))
            Object.defineProperty(resetOnce, key, observeOnce(`command.${key}`, value));
        api.validateCommandBatch(world, [resetOnce], 1 / 60, 4);
        assert.deepEqual(observe(), before);
        assert.equal(calls, 2);
        sample({ kind: 'pose-single-read', poseReads, before, after: observe() });
    } finally {
        module._air_b3_command_batch = native;
    }
    report.checks.singleReadStrictAdmission = true;
    const initial = observe();
    api.validateCommandBatch(world, [good], 1 / 60, 4);
    assert.deepEqual(observe(), initial);
    assert.deepEqual(apply(world, []), { bodies: [], operations: [], executedOperationCount: 0 });
    assert.deepEqual(observe(), initial);
    report.checks.validationAndEmptyPreserveSnapshot = true;
    negative('target-native-speed-cap', () =>
        apply(world, [good, cmd(kinematic, 'target', 2, { pose: pose([10000, 0, 0]) })]),
    );
    assert.equal(report.negatives.at(-1).error.nativeStatus, 12);
    api.setBodyMotionFactors(world, kinematic, [0, 1, 1], [1, 1, 1]);
    negative('target-native-lock-conflict', () =>
        apply(world, [good, cmd(kinematic, 'target', 2, { pose: pose([0.01, 0, 0]) })]),
    );
    assert.equal(report.negatives.at(-1).error.nativeStatus, 11);
    api.setBodyMotionFactors(world, kinematic, [1, 1, 1], [1, 1, 1]);

    const pending = api.createBody(world, { type: 2 });
    api.setBodyMass(world, pending, 2);
    const pendingBefore = api.bodyState(world, pending),
        pendingDiagnostic = api.stepDiagnostics(world);
    const pendingError = errorOf(() => apply(world, [good, cmd(pending, 'clearForces', 2)]), 'not-mutated');
    assert.equal(pendingError.nativeStatus, 10);
    assert.deepEqual(api.bodyState(world, pending), pendingBefore);
    assert.deepEqual(api.stepDiagnostics(world), pendingDiagnostic);
    api.createSphere(pending, 0.2);
    const recovered = apply(world, [cmd(pending, 'force', 1, { value: [1, 0, 0] })]);
    checkPlan(recovered);
    sample({ kind: 'mass-pending-recovery', pendingBefore, pendingError, recovered });
    api.destroyBody(pending);
    report.checks.pendingRecovery = true;

    // Independent analytic box inertia in its local rotated basis, not the native plan.
    const mass = 2,
        half = [1, 0.5, 0.25],
        center = [0.2, -0.1, 0.3],
        shapeQ = [0, Math.sin(0.3), 0, Math.cos(0.3)];
    const diagonal = [
        (mass / 3) * (half[1] ** 2 + half[2] ** 2),
        (mass / 3) * (half[0] ** 2 + half[2] ** 2),
        (mass / 3) * (half[0] ** 2 + half[1] ** 2),
    ];
    let retained;
    for (let scene = 0; scene < 32; ++scene) {
        const angle = scene * 0.09,
            q = [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)],
            origin = [scene * 0.03, 0.1, -0.2];
        const F = [1 + scene * 0.02, -2, 3],
            T = [0.2, 0.3, -0.1],
            J = [0.4, -0.2, 0.1],
            A = [0.02, -0.03, 0.01],
            r = [0.3, 0.2, -0.1];
        const commands = [
            cmd(dynamic, 'clearState', 1),
            cmd(dynamic, 'reset', 2, { pose: pose(origin, q) }),
            cmd(dynamic, 'force', 3, { value: F, offset: r, space: 'local' }),
            cmd(dynamic, 'torque', 4, { value: T, space: 'local' }),
            cmd(dynamic, 'linearImpulse', 5, { value: J, offset: r, space: 'local' }),
            cmd(dynamic, 'angularImpulse', 6, { value: A, space: 'local' }),
        ];
        const diagnostic = api.stepDiagnostics(world),
            result = apply(world, commands);
        checkPlan(result);
        assert.equal(api.stepDiagnostics(world).nativeStepIndex, diagnostic.nativeStepIndex);
        const inverseInertia = (v) =>
            rotate(
                q,
                rotate(
                    shapeQ,
                    inverseRotate(shapeQ, inverseRotate(q, v)).map((x, i) => x / diagonal[i]),
                ),
            );
        const worldJ = rotate(q, J),
            worldR = rotate(q, r);
        const expected = {
            linearVelocity: mul(worldJ, 1 / mass),
            angularVelocity: add(inverseInertia(cross(worldR, worldJ)), inverseInertia(rotate(q, A))),
            force: rotate(q, F),
            torque: add(cross(worldR, rotate(q, F)), rotate(q, T)),
            worldCenter: add(origin, rotate(q, center)),
        };
        for (const field of ['linearVelocity', 'angularVelocity', 'force', 'torque', 'worldCenter'])
            near(result.bodies[0].actual.state[field], expected[field]);
        sample({
            kind: 'analytic-box',
            scene,
            fixture: { mass, half, center, shapeRotation: shapeQ },
            commands,
            expected,
            result,
        });
        if (!retained) retained = result;
        api.step(world);
    }
    report.checks.orderedAnalyticArithmetic = true;
    const forceOrder = apply(world, [
        cmd(dynamic, 'clearState', 1),
        cmd(dynamic, 'force', 2, { value: [3e38, 0, 0] }),
        cmd(dynamic, 'clearForces', 3),
        cmd(dynamic, 'force', 4, { value: [3e38, 0, 0] }),
        cmd(dynamic, 'clearForces', 5),
    ]);
    checkPlan(forceOrder);
    assert.deepEqual(forceOrder.bodies[0].actual.state.force, [0, 0, 0]);
    sample({ kind: 'clear-prevents-later-force-overflow', result: forceOrder });

    const retainedBytes = json(retained);
    assert.ok(Object.isFrozen(retained.operations[0].actual.pose.position));
    assert.throws(() => {
        retained.operations[0].actual.pose.position[0] = 999;
    }, TypeError);
    api.setBodyMotionFactors(world, dynamic, [0, 1, 1], [1, 0, 1]);
    const locked = apply(world, [
        cmd(dynamic, 'clearState', 1),
        cmd(dynamic, 'linearImpulse', 2, { value: [10000, 1, 2], offset: [0.2, -0.1, 0.3] }),
        cmd(dynamic, 'angularImpulse', 3, { value: [1, 2, 3], space: 'local' }),
    ]);
    checkPlan(locked);
    assert.equal(locked.bodies[0].actual.state.linearVelocity[0], 0);
    assert.equal(locked.bodies[0].actual.state.angularVelocity[1], 0);
    sample({ kind: 'locked-impulses', result: locked });
    report.checks.immediateLocks = true;
    const targetResult = apply(world, [
        cmd(kinematic, 'reset', 1, { pose: pose([2, 0, 0]) }),
        cmd(kinematic, 'target', 2, { pose: pose([2.01, 0, 0]) }),
        cmd(kinematic, 'clearForces', 3),
    ]);
    checkPlan(targetResult);
    assert.equal(targetResult.bodies[0].actual.pose.position[0], 2);
    assert.ok(targetResult.bodies[0].actual.state.linearVelocity[0] > 0);
    sample({ kind: 'target-is-velocity-not-arrival', result: targetResult });
    const preserved = apply(world, [
        cmd(kinematic, 'reset', 4, { pose: pose([3, 0, 0]), preserveVelocity: true, wake: false }),
    ]);
    assert.deepEqual(
        preserved.bodies[0].actual.state.linearVelocity,
        targetResult.bodies[0].actual.state.linearVelocity,
    );
    const idle = apply(world, [cmd(kinematic, 'pairedClear', 0, { reason: 'idle' })]);
    checkPlan(idle);
    assert.deepEqual(idle.bodies[0].actual.state.linearVelocity, [0, 0, 0]);
    const cleanup = apply(world, [
        cmd(kinematic, 'clearState', Number.MAX_SAFE_INTEGER),
        cmd(kinematic, 'pairedClear', 0, { reason: 'cleanup' }),
    ]);
    checkPlan(cleanup);
    sample({ kind: 'preserve-idle-cleanup', preserved, idle, cleanup });
    report.checks.targetReductionBoundaries = true;
    api.setBodyEnabled(world, dynamic, false);
    const disabled = apply(world, [cmd(dynamic, 'reset', 1, { pose: pose([7, 0, 0]) }), cmd(dynamic, 'clearState', 2)]);
    checkPlan(disabled);
    assert.equal(disabled.bodies[0].actual.state.enabled, false);
    api.setBodyEnabled(world, dynamic, true);
    apply(world, [cmd(staticBody, 'reset', 0, { mode: 'scene', pose: pose([0, -4, 0]) })]);
    report.checks.disabledAndStaticReset = true;
    // Wrapper failures occur after real native work. No fixture reports these as spontaneous native faults.
    api.step(world);
    const beforeUnknown = observe();
    module._air_b3_command_batch = (...args) => {
        const status = native(...args);
        assert.equal(status, 0);
        throw Error('injected validation delivery throw');
    };
    try {
        const error = errorOf(() => api.validateCommandBatch(world, [good], 1 / 60, 4), undefined);
        assert.deepEqual(observe(), beforeUnknown);
        report.injectedMechanisms.push({ kind: 'real validation then delivery throw', error });
    } finally {
        module._air_b3_command_batch = native;
    }
    for (const mechanism of [
        'corrupt-copy',
        'unknown-status',
        'delivery-throw',
        'corrupt-actions',
        'inconsistent-com',
    ]) {
        api.step(world);
        const step = api.stepDiagnostics(world).nativeStepIndex;
        calls = 0;
        module._air_b3_command_batch = (...args) => {
            const status = native(...args);
            assert.equal(status, 0);
            ++calls;
            if (mechanism === 'corrupt-copy') {
                module.HEAPU32[args[3] >>> 2] = 0;
                return status;
            }
            if (mechanism === 'corrupt-actions') {
                const start = args[3] >>> 2,
                    operationStart = module.HEAPU32[start + 8];
                module.HEAPU32[start + operationStart + 5] = 16;
                return status;
            }
            if (mechanism === 'inconsistent-com') {
                module.HEAPF32[(args[3] >>> 2) + 12 + 92] += 1;
                return status;
            }
            if (mechanism === 'unknown-status') return 77;
            throw Error('injected committed export throw');
        };
        let error;
        try {
            error = errorOf(
                () =>
                    apply(world, [
                        mechanism === 'corrupt-actions'
                            ? cmd(kinematic, 'clearForces', 1)
                            : cmd(kinematic, 'reset', 1, { pose: pose([9, 0, 0]) }),
                    ]),
                ['corrupt-copy', 'corrupt-actions', 'inconsistent-com'].includes(mechanism) ? 'committed' : undefined,
            );
        } finally {
            module._air_b3_command_batch = native;
        }
        assert.equal(calls, 1);
        assert.equal(api.bodyTransforms(world, [kinematic])[0], 9);
        assert.equal(api.stepDiagnostics(world).nativeStepIndex, step);
        assert.equal(api.stepDiagnostics(world).snapshotAvailable, false);
        report.injectedMechanisms.push({
            kind: `real commit then injected ${mechanism}`,
            error,
            calls,
            actual: api.bodyState(world, kinematic),
            diagnostics: api.stepDiagnostics(world),
        });
    }
    report.checks.mutationPhasesNoReplay = true;
    const sleepWorld = api.createWorld([0, -10, 0]),
        floor = api.createBody(sleepWorld, { type: 0, position: [0, -1, 0] });
    api.createBox(floor, [4, 0.5, 4]);
    const lower = api.createBody(sleepWorld, { type: 2, position: [0, 0, 0] }),
        upper = api.createBody(sleepWorld, { type: 2, position: [0, 1.01, 0] });
    api.createSphere(lower, 0.5);
    api.createSphere(upper, 0.5);
    for (let tick = 0; tick < 600; ++tick) api.step(sleepWorld);
    const sleepBefore = [api.bodyState(sleepWorld, lower), api.bodyState(sleepWorld, upper)];
    assert.ok(sleepBefore.every((s) => s.sleeping && !s.awake));
    const wake = api.applyCommandBatch(sleepWorld, [cmd(lower, 'force', 1, { value: [0, 0, 0] })], 1 / 60, 4);
    const sleepAfter = [api.bodyState(sleepWorld, lower), api.bodyState(sleepWorld, upper)];
    assert.ok(sleepAfter.every((s) => s.awake));
    checkPlan(wake);
    sample({ kind: 'real-contact-island-wake', ticks: 600, before: sleepBefore, result: wake, after: sleepAfter });
    api.destroyWorld(sleepWorld);
    report.checks.realSleepingIslandWake = true;

    // Force heap growth inside successful native delivery; parser must acquire a fresh HEAP view.
    const oldBuffer = module.HEAPU8.buffer;
    let growthPointer;
    module._air_b3_command_batch = (...args) => {
        const status = native(...args);
        growthPointer = module._malloc(module.HEAPU8.byteLength + 65536);
        assert.ok(growthPointer);
        return status;
    };
    try {
        const grown = apply(world, [cmd(kinematic, 'clearState', 1)]);
        checkPlan(grown);
        assert.notEqual(module.HEAPU8.buffer, oldBuffer);
        sample({ kind: 'growth-result', result: grown });
    } finally {
        module._air_b3_command_batch = native;
        if (growthPointer) module._free(growthPointer);
    }
    assert.equal(json(retained), retainedBytes);
    report.checks.growthAndImmutableCopies = true;
    const reuse = [];
    for (let i = 0; i < 128; ++i) {
        const body = api.createBody(world, { type: 2 });
        api.createSphere(body, 0.2);
        const result = apply(world, [cmd(body, 'force', 1, { value: [1, 0, 0] })]);
        api.destroyBody(body);
        const replacement = api.createBody(world, { type: 2 });
        api.createSphere(replacement, 0.2);
        assert.equal(body.high, replacement.high);
        assert.notEqual(body.low, replacement.low);
        const before = api.bodyState(world, replacement);
        const error = errorOf(() => apply(world, [cmd(body, 'clearState', 1)]), 'not-mutated');
        assert.deepEqual(api.bodyState(world, replacement), before);
        reuse.push({ old: body, replacement, error });
        sample({ kind: 'id-reuse', index: i, result, replacement, before, error });
        api.destroyBody(replacement);
    }
    report.observations.idCycles = reuse;
    report.checks.fullGenerationReuse = true;
    assert.equal(json(retained), retainedBytes);
    api.destroyWorld(world);
    api.destroyWorld(foreignWorld);
    other.destroyWorld(moduleWorld);
    assert.equal(api.liveBytes(), baseline);
    assert.equal(other.liveBytes(), baselineOther);
    assert.equal(api.bridgeMemory().liveBytes, 0n);
    assert.equal(other.bridgeMemory().liveBytes, 0n);
    assert.equal(json(retained), retainedBytes);
    report.checks.cleanupAndModuleIsolation = true;
    assert.equal(report.negatives.length, 47);
    assert.equal(report.sampleCount, 217);
    assert.equal(report.nativeCommandInvocations.length, 198);
    const invocationSummary = {
        total: report.nativeCommandInvocations.length,
        validation: report.nativeCommandInvocations.filter((r) => r.apply === 0).length,
        committed: report.nativeCommandInvocations.filter(
            (r) => r.apply === 1 && r.operationCount > 0 && r.nativeStatus === 0,
        ).length,
        empty: report.nativeCommandInvocations.filter(
            (r) => r.apply === 1 && r.operationCount === 0 && r.nativeStatus === 0,
        ).length,
        refused: report.nativeCommandInvocations.filter((r) => r.nativeStatus !== 0).length,
    };
    assert.deepEqual(invocationSummary, { total: 198, validation: 4, committed: 176, empty: 1, refused: 17 });
    report.observations.invocationSummary = invocationSummary;
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = { message: error.message, stack: error.stack };
    process.exitCode = 1;
} finally {
    for (const binding of [api, other])
        try {
            binding.dispose();
        } catch (error) {
            report.status = 'FAIL';
            report.cleanupError = error.stack;
            process.exitCode = 1;
        }
    const bytes = readFileSync(samples);
    report.samplesArtifact = {
        path: 'command-samples.raw.jsonl',
        bytes: bytes.length,
        sha256: sha256(bytes),
        records: report.sampleCount,
    };
    writeFileSync(destination, json(report, true) + '\n');
    console.log(
        json({
            status: report.status,
            checks: report.checks,
            samples: report.sampleCount,
            error: report.error?.message,
        }),
    );
}
