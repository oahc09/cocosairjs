// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Fresh real Hull WASM/facade. Explicit boundary fault injection is not a physics PASS.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const dir = resolve(process.argv[2]);
const destination = resolve(process.argv[3] ?? resolve(dir, 'wasm-hull-facade.raw.json'));
assert.ok(!existsSync(destination), 'Never overwrite a previous attempt');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const report = {
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    scope: 'Limited actual Hull WASM/facade plus separately labeled failure injection, not public Cocos/browser/C14/full Gate',
    fixtureSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
    checks: [],
    observations: {},
    formal2128And9Gates: 'NOT_RUN',
};
const save = () =>
    writeFileSync(
        destination,
        JSON.stringify(report, (_, value) => (typeof value === 'bigint' ? value.toString() : value), 2) + '\n',
    );
const pass = (name, category = 'REAL_WASM') => {
    report.checks.push({ name, category, status: 'PASS' });
    save();
};
const tetra = [0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4];
const near = (a, b) => assert.ok(Math.abs(a - b) <= 2e-5, `${a} != ${b}`);
const expectPhase = (operation, phase) => {
    let error;
    try {
        operation();
    } catch (caught) {
        error = caught;
    }
    assert.ok(error instanceof Error, 'Expected an original Error');
    assert.equal(error.mutationOutcome, phase);
    if (phase !== undefined) assert.equal(Object.getOwnPropertyDescriptor(error, 'mutationOutcome').writable, false);
    return { code: error.code, message: error.message, mutationOutcome: error.mutationOutcome ?? 'UNKNOWN' };
};
let api;
try {
    const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json')));
    report.identity = manifest;
    for (const artifact of manifest.artifacts) {
        const bytes = readFileSync(resolve(dir, artifact.path));
        assert.equal(bytes.length, artifact.bytes);
        assert.equal(hash(bytes), artifact.sha256);
    }
    const { default: factory } = await import(pathToFileURL(resolve(dir, 'box3d-st.mjs')));
    const { createBox3DBinding } = await import(pathToFileURL(resolve(dir, 'facade.mjs')));
    const module = await factory({ wasmBinary: readFileSync(resolve(dir, 'box3d-st.wasm')) });
    assert.equal(typeof module._air_b3_mass_hull_create, 'function');
    assert.equal(typeof module._air_b3_hull_validate, 'function');
    let mode = 'normal',
        throwReadback = false,
        destroyMode = 'normal',
        throwDestroyedState = false;
    const proxy = new Proxy(module, {
        get(target, key) {
            if (key === 'HEAPU32' && throwReadback) {
                throwReadback = false;
                throw new Error('injected ID readback failure after native success');
            }
            if (key === 'HEAPF32' && throwDestroyedState) {
                throwDestroyedState = false;
                throw new Error('injected body-state readback failure after native destruction');
            }
            if (key === '_air_b3_mass_shape_destroy' || key === '_air_b3_shape_destroy')
                return (...args) => {
                    if (typeof destroyMode === 'number') return destroyMode;
                    const status = target[key](...args);
                    if (status === 0 && destroyMode === 'readback') throwDestroyedState = true;
                    if (status === 0 && destroyMode === 'throw-after-native')
                        throw new Error('injected native boundary throw after actual destruction');
                    return status;
                };
            if (key === '_air_b3_mass_hull_create')
                return (...args) => {
                    if (typeof mode === 'number') return mode;
                    const status = target[key](...args);
                    if (status === 0 && mode === 'readback') throwReadback = true;
                    if (status === 0 && mode === 'throw-after-native')
                        throw new Error('injected native boundary throw after actual creation');
                    return status;
                };
            return target[key];
        },
    });
    api = createBox3DBinding(proxy, manifest);
    const globalBefore = api.liveBytes();
    const world = api.createWorld([0, 0, 0]);
    const body = api.createBody(world, { type: 2, enableSleep: false });
    const countsBefore = api.worldCounts(world),
        bridgeBefore = api.bridgeMemory(world);
    api.validateHull(world, tetra);
    assert.deepEqual(api.worldCounts(world), countsBefore);
    assert.deepEqual(api.bridgeMemory(world), bridgeBefore);
    pass('pure actual cook creates no body/shape and releases temporary allocations');
    const input = Float32Array.from(tetra);
    const shape = api.createHull(body, input);
    input.fill(300);
    const state = api.bodyState(world, body);
    near(state.mass, 4);
    [0.5, 0.75, 1].forEach((value, index) => near(state.localCenter[index], value));
    assert.ok(state.inertia.some((value, index) => ![0, 4, 8].includes(index) && Math.abs(value) > 1e-5));
    const options = { group: -1, mask: -1, queryTrigger: false };
    assert.deepEqual(api.rayAllRaw(world, [1.8, 2.8, -1], [0, 0, 6], options), []);
    const hits = api.rayAllRaw(world, [0.2, 0.3, -1], [0, 0, 6], options);
    assert.equal(hits.length, 1);
    assert.deepEqual(hits[0].shape, shape);
    near(hits[0].fraction, 1 / 6);
    report.observations.tetra = { state, hits, originalInput: tetra };
    pass('true non-box tetra mass, off-diagonal inertia, empty-box-corner miss and real ray hit; input copied');
    const snapshot = {
        counts: api.worldCounts(world),
        state: api.bodyState(world, body),
        bridge: api.bridgeMemory(world),
    };
    const invalid = [
        Array(12).fill(0),
        [0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0],
        [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0],
        [...tetra.slice(0, 11), NaN],
        [...tetra.slice(0, 11), Infinity],
    ];
    report.observations.invalid = [];
    for (const points of invalid) {
        report.observations.invalid.push(expectPhase(() => api.validateHull(world, points), 'not-mutated'));
        report.observations.invalid.push(expectPhase(() => api.createHull(body, points), 'not-mutated'));
        assert.deepEqual(api.worldCounts(world), snapshot.counts);
        assert.deepEqual(api.bodyState(world, body), snapshot.state);
        assert.deepEqual(api.bridgeMemory(world), snapshot.bridge);
    }
    pass('actual duplicate, line, plane and nonfinite rejections leave body/shape/state/live resources unchanged');
    const redundant = Array.from({ length: 256 }, (_, i) => tetra.slice((i % 4) * 3, (i % 4) * 3 + 3)).flat();
    api.validateHull(world, redundant);
    const second = api.createHull(body, redundant);
    api.destroyShape(second);
    pass('256 original points are accepted rather than silently capped at128');
    api.step(world, 1 / 60, 4);
    assert.equal(api.stepDiagnostics(world).snapshotAvailable, true);
    api.validateHull(world, tetra);
    assert.equal(api.stepDiagnostics(world).snapshotAvailable, true);
    pass('pure validation preserves a completed unmodified step snapshot');
    report.observations.injectedPrewrite = [];
    const beforeFault = api.worldCounts(world);
    for (const status of [1, 2, 4, 5, 8, 9]) {
        mode = status;
        report.observations.injectedPrewrite.push(expectPhase(() => api.createHull(body, tetra), 'not-mutated'));
        assert.deepEqual(api.worldCounts(world), beforeFault);
        assert.equal(api.stepDiagnostics(world).snapshotAvailable, true);
    }
    mode = 'normal';
    pass('known prewrite status classification', 'BOUNDARY_FAULT_INJECTION');
    mode = 'readback';
    report.observations.committedReadback = expectPhase(() => api.createHull(body, tetra), 'committed');
    mode = 'normal';
    assert.equal(api.worldCounts(world).counts[1], beforeFault.counts[1] + 1);
    assert.equal(api.stepDiagnostics(world).snapshotAvailable, false);
    pass(
        'actual successful native creation followed by injected ID readback failure is COMMITTED and invalidates snapshot',
        'REAL_NATIVE_PLUS_BOUNDARY_FAULT',
    );
    const beforeUnknown = api.worldCounts(world).counts[1];
    mode = 'throw-after-native';
    report.observations.unknown = expectPhase(() => api.createHull(body, tetra), undefined);
    mode = 'normal';
    assert.equal(api.worldCounts(world).counts[1], beforeUnknown + 1);
    assert.equal(api.stepDiagnostics(world).snapshotAvailable, false);
    pass(
        'injected native-boundary throw after real mutation remains UNKNOWN, never replayed',
        'REAL_NATIVE_PLUS_BOUNDARY_FAULT',
    );
    const removalTarget = api.createHull(body, tetra);
    api.step(world, 1 / 60, 4);
    const beforeRemoval = api.worldCounts(world).counts[1];
    destroyMode = 1;
    report.observations.removalPrewrite = expectPhase(() => api.destroyShape(removalTarget), 'not-mutated');
    destroyMode = 'normal';
    assert.equal(api.worldCounts(world).counts[1], beforeRemoval);
    assert.equal(api.stepDiagnostics(world).snapshotAvailable, true);
    pass('known destruction prewrite refusal leaves actual shape and snapshot intact', 'BOUNDARY_FAULT_INJECTION');
    destroyMode = 'readback';
    report.observations.removalCommitted = expectPhase(() => api.destroyShape(removalTarget), 'committed');
    destroyMode = 'normal';
    assert.equal(api.worldCounts(world).counts[1], beforeRemoval - 1);
    assert.equal(api.stepDiagnostics(world).snapshotAvailable, false);
    assert.throws(() => api.getShapeMaterial(world, removalTarget), { code: 'AIR_E_BOX3D_DISPOSED' });
    pass(
        'actual native destruction followed by body readback failure is COMMITTED and token is retired',
        'REAL_NATIVE_PLUS_BOUNDARY_FAULT',
    );
    const unknownRemoval = api.createHull(body, tetra);
    const beforeUnknownRemoval = api.worldCounts(world).counts[1];
    destroyMode = 'throw-after-native';
    report.observations.removalUnknown = expectPhase(() => api.destroyShape(unknownRemoval), undefined);
    destroyMode = 'normal';
    assert.equal(api.worldCounts(world).counts[1], beforeUnknownRemoval - 1);
    assert.equal(api.stepDiagnostics(world).snapshotAvailable, false);
    pass(
        'native-boundary throw after actual destruction is UNKNOWN and not replayed',
        'REAL_NATIVE_PLUS_BOUNDARY_FAULT',
    );
    api.destroyWorld(world);
    assert.equal(api.liveBytes(), globalBefore);
    api.dispose();
    api = undefined;
    pass('world teardown reclaims all real shapes including unreadable returned IDs');
    report.status = 'PASS_LIMITED_HULL_FACADE';
} catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
} finally {
    if (api) {
        try {
            api.dispose();
            report.failureCleanup = 'released';
        } catch (error) {
            report.failureCleanup = error.stack;
        }
    }
    report.finishedAt = new Date().toISOString();
    save();
    console.log(JSON.stringify({ status: report.status, checks: report.checks.length, destination }));
}
