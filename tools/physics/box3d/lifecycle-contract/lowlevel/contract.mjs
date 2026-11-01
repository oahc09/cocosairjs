// CPU-only, fail-closed consumer. No WASM import or native execution at module load.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEBUG_SPEC, validateDebugSnapshot } from './debug-artifacts.mjs';

export const VERSION = 'box3d-c20-lowlevel-observed-subset-v3';
export const SCHEMA = 'ce98aca1a40c4999df838c1eaab2b08b0533c85adca9866eb48180c6190575d6';
export const CYCLES = 100;
export const BODIES = 50;
export const ORDERS = Object.freeze(['cache-first', 'cache-last', 'world-last']);
export const BUDGET = Object.freeze({ wallSeconds: 120, rssBytes: 1073741824, outputBytes: 16777216 });
export const LIMITS = Object.freeze({
    C20_LOWLEVEL: 'NOT_QUALIFIED',
    C20_APPLICATION: 'NOT_RUN',
    completeGlobalWorldCount: 'NOT_QUALIFIED_NO_EXPORTED_COMPLETE_GLOBAL_WORLD_COUNT',
    completeGlobalHandleCount: 'NOT_QUALIFIED_NO_EXPORTED_COMPLETE_GLOBAL_HANDLE_COUNT',
    allocatorFreeCounts: 'NOT_QUALIFIED_CORE_BYTES_AND_COMPLETED_MESH_DESTROYS_ARE_NOT_MALLOC_FREE_COUNTS',
    rawIdsAcrossWorlds: 'NOT_QUALIFIED_RAW_BODY_SHAPE_IDS_CAN_REVALIDATE_IN_ANOTHER_WORLD_LIFETIME',
    contacts: 'ZERO_CONTACT_LIFECYCLE_ONLY_NO_STEP_OR_EVENT_QUALIFICATION',
    bridgeShapeHandles: 'LAZY_DEBUG_SHAPE_CACHE_ONLY_NOT_ALL_NATIVE_OR_JS_HANDLES',
});
export const FIXTURES = Object.freeze([
    'contract.mjs',
    'native-cycles.mjs',
    'run-native.mjs',
    'oracle.mjs',
    'prepare-input-lock.mjs',
    'supervise.py',
    'verify-report.mjs',
    'contract.test.mjs',
    'cpu-fake.mjs',
    'README.md',
    'supervise.test.py',
    'debug-artifacts.mjs',
]);
export const SOURCES = Object.freeze([
    'tools/physics/box3d/abi-schema.json',
    'tools/physics/box3d/native/air_box3d.c',
    'tools/physics/box3d/native/world_bridge.c',
    'tools/physics/box3d/native/joint_bridge.c',
    'tools/physics/box3d/native/mesh_bridge.c',
    'tools/physics/box3d/native/filter_bridge.h',
    'src/air/physics/box3d/binding/facade.mjs',
    'tools/physics/box3d/terrain-contract/native-terrain-lifetime.mjs',
    'tools/physics/box3d/terrain-contract/run-native.mjs',
    'tools/physics/box3d/terrain-contract/oracle.mjs',
    'tools/physics/box3d/wasm-ownership-contract.mjs',
]);
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const json = (value) => JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? String(v) : v));
export const copy = (value) => JSON.parse(json(value));
const hashFiles = (dir, files) =>
    Object.fromEntries(
        files.map((name) => {
            const bytes = readFileSync(join(dir, name));
            return [name, { sha256: sha256(bytes), bytes: bytes.length }];
        }),
    );
export function inspectInputs(runtime, source, fixture) {
    const assets = hashFiles(runtime, ['manifest.json', 'box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs', 'facade.d.mts']);
    const manifest = JSON.parse(readFileSync(join(runtime, 'manifest.json'), 'utf8'));
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.abiVersion, 1);
    assert.equal(manifest.variant, 'st-simd');
    assert.equal(manifest.schemaSha256, SCHEMA);
    assert.equal(manifest.coreSha, 'efca0c184d40fd6a82016983f1601c4d23965867');
    assert.equal(manifest.bindingBaseSha, '5d5a3af049cccd9948b2b55bac4342414af0ef64');
    assert.equal(manifest.patchChainSha256, '4c9d057fe6d7403f6f2c7672c4a7abe38041d845942540a6b5c5abbc6f4bc45c');
    for (const name of Object.keys(assets).filter((f) => f !== 'manifest.json')) {
        const declared = manifest.artifacts.filter((a) => a.path === name);
        assert.equal(declared.length, 1, `single manifest asset ${name}`);
        assert.equal(declared[0].sha256, assets[name].sha256, `manifest hash ${name}`);
        assert.equal(declared[0].bytes, assets[name].bytes, `manifest byte count ${name}`);
    }
    const debugCoreSources = hashFiles(runtime, [
        'staged-core/src/shape.c',
        'staged-core/src/physics_world.c',
        'staged-core/src/types.c',
        'staged-core/src/dynamic_tree.c',
    ]);
    const sources = hashFiles(source, SOURCES),
        fixtures = hashFiles(fixture, FIXTURES);
    assert.equal(sources[SOURCES[0]].sha256, SCHEMA, 'source ABI must match actual manifest schema');
    assert.equal(sources['src/air/physics/box3d/binding/facade.mjs'].sha256, assets['facade.mjs'].sha256);
    assert.equal(sources['tools/physics/box3d/terrain-contract/oracle.mjs'].sha256, fixtures['oracle.mjs'].sha256);
    const nodeBytes = readFileSync(process.execPath);
    return {
        version: VERSION,
        nodeVersion: process.version,
        nodeExecutable: { sha256: sha256(nodeBytes), bytes: nodeBytes.length },
        cycles: CYCLES,
        bodiesPerCycle: BODIES,
        orders: ORDERS,
        budget: BUDGET,
        limits: LIMITS,
        assets,
        sources,
        debugCoreSources,
        debugSpec: DEBUG_SPEC,
        fixtures,
    };
}
export function validateInputs(expected, actual) {
    assert.deepEqual(actual, expected, 'frozen input/fixture identity changed; use fresh reviewed version and lock');
}

// Exact stages and expected native counts; declared before the first native world exists.
export function stages(order) {
    assert.ok(ORDERS.includes(order));
    const row = (stage, bodies, shapes, joints, cache, borrows, cooked = 1, destroyed = 0) => ({
        stage,
        bodies,
        shapes,
        contacts: 0,
        joints,
        cache,
        borrows,
        cooked,
        destroyed,
    });
    const rows = [
        row('world-created', 0, 0, 0, null, null, 0),
        row('mesh-cooked', 0, 0, 0, 1, 0),
        row('mesh-retained', 0, 0, 0, 2, 0),
        row('extra-lease-released', 0, 0, 0, 1, 0),
        row('bodies-created', 50, 0, 0, 1, 0),
        row('shapes-borrowed', 50, 50, 0, 1, 3),
        row('joint-created', 50, 50, 1, 1, 3),
        row('debug-captured', 50, 50, 1, 1, 3),
    ];
    if (order === 'cache-first')
        rows.push(
            row('cache-released', 50, 50, 1, 0, 3),
            row('joint-destroyed', 50, 50, 0, 0, 3),
            row('first-borrow-released', 50, 49, 0, 0, 2),
            row('second-borrow-released', 50, 48, 0, 0, 1),
            row('last-borrow-released', 50, 47, 0, null, null, 1, 1),
            row('all-shapes-destroyed', 50, 0, 0, null, null, 1, 1),
            row('all-bodies-destroyed', 0, 0, 0, null, null, 1, 1),
        );
    if (order === 'cache-last')
        rows.push(
            row('joint-destroyed', 50, 50, 0, 1, 3),
            row('first-borrow-released', 50, 49, 0, 1, 2),
            row('second-borrow-released', 50, 48, 0, 1, 1),
            row('last-borrow-released', 50, 47, 0, 1, 0),
            row('all-shapes-destroyed', 50, 0, 0, 1, 0),
            row('all-bodies-destroyed', 0, 0, 0, 1, 0),
            row('cache-released', 0, 0, 0, null, null, 1, 1),
        );
    if (order === 'world-last')
        rows.push(
            row('cache-released', 50, 50, 1, 0, 3),
            row('first-borrow-released', 50, 49, 1, 0, 2),
            row('second-borrow-body-destroyed', 49, 48, 1, 0, 1),
        );
    rows.push(row('world-destroyed', null, null, null, null, null, 1, 1));
    let debugCreated = false;
    return rows.map((spec) => {
        if (spec.stage === 'debug-captured') debugCreated = true;
        return { ...spec, debugHandles: debugCreated ? (spec.shapes ?? 0) : 0 };
    });
}
const natural = (n) => assert.ok(Number.isSafeInteger(n) && n >= 0);
const bigintString = (s) => {
    assert.match(s, /^\d+$/);
    return BigInt(s);
};
export function validateGlobal(observation, baseline, equal = false) {
    bigintString(observation.coreBytes);
    assert.equal(observation.bridge.origin, 'module._air_b3_bridge_memory');
    assert.equal(observation.bridge.worldArgument, 0, 'empty JS map aggregation is not native global proof');
    bigintString(observation.bridge.liveBytes);
    for (const key of ['liveAllocations', 'shapeHandles', 'primitiveCapacity', 'capturedPrimitives'])
        natural(observation.bridge[key]);
    if (equal) {
        assert.equal(observation.coreBytes, baseline.coreBytes, 'core bytes must return to ORIGINAL baseline');
        assert.deepEqual(observation.bridge, baseline.bridge, 'native global bridge must return to ORIGINAL baseline');
    }
}
export function validateObservedSubset(events, report, expectedInputs, readDebugArtifact) {
    assert.equal(typeof readDebugArtifact, 'function', 'full raw debug output reader is mandatory');
    assert.equal(report.version, VERSION);
    validateInputs(expectedInputs, report.inputs);
    assert.deepEqual(report.limits, LIMITS, 'must retain all non-qualification statements');
    assert.equal(report.executionKind, 'ACTUAL_ST_WASM_SINGLE_MODULE');
    assert.equal(report.moduleInstances, 1);
    assert.equal(report.factoryCalls, 1);
    assert.equal(report.status, 'OBSERVED_NATIVE_SUBSET_PASS');
    assert.equal(report.lifecycleClosure.status, 'CLOSED');
    assert.equal(report.lifecycleClosure.apiDisposeCompleted, true);
    assert.deepEqual(report.lifecycleClosure.diagnosticScratch, { bytes: 120, allocations: 1, frees: 1 });
    assert.equal(events[0].kind, 'declaration');
    assert.equal(events[0].version, VERSION);
    assert.equal(events[0].cycles, 100);
    assert.equal(events[0].bodiesPerCycle, 50);
    assert.deepEqual(
        events[0].releaseOrders,
        Array.from({ length: 100 }, (_, i) => ORDERS[i % 3]),
    );
    assert.deepEqual(events[0].stageContracts, Object.fromEntries(ORDERS.map((o) => [o, stages(o)])));
    assert.deepEqual(events[0].limits, LIMITS);
    assert.deepEqual(events[0].debugSpec, DEBUG_SPEC);
    events.forEach((event, index) => assert.equal(event.sequence, index, 'missing/reordered raw row'));
    const expectedTimeline = ['declaration', 'input-identity', 'initial-baseline'];
    for (let cycle = 0; cycle < 100; ++cycle) {
        expectedTimeline.push('cycle-begin');
        for (const spec of stages(ORDERS[cycle % 3])) {
            expectedTimeline.push('stage');
            if (cycle > 0 && spec.stage === 'world-created') expectedTimeline.push('stale-token-cross-world');
            if (cycle > 0 && spec.stage === 'joint-created') expectedTimeline.push('stale-token-populated-world');
        }
    }
    expectedTimeline.push('post-dispose-observation', 'lifecycle-closed');
    assert.deepEqual(
        events.map((e) => e.kind),
        expectedTimeline,
        'complete chronological journal required',
    );
    assert.deepEqual(events[1].inputs, expectedInputs);
    assert.equal(events[1].inputLockSha256, report.inputLockSha256);
    for (const kind of ['stale-token-cross-world', 'stale-token-populated-world']) {
        const stale = events.filter((e) => e.kind === kind);
        assert.equal(stale.length, 99);
        stale.forEach((event, index) => {
            assert.equal(event.cycle, index + 1);
            assert.equal(event.rejected, 104);
            assert.equal(event.rawBodyRevalidation.length, 50);
            assert.ok(event.rawBodyRevalidation.every((value) => value === 0 || value === 1));
            if (kind === 'stale-token-populated-world') {
                assert.equal(event.rawShapeRevalidation.length, 50);
                assert.ok(event.rawShapeRevalidation.every((value) => value === 0 || value === 1));
            }
        });
    }
    const initial = events.filter((e) => e.kind === 'initial-baseline');
    assert.equal(initial.length, 1, 'no rebaselining or warmup absorption');
    const baseline = initial[0].observation;
    validateGlobal(baseline, baseline);
    assert.equal(baseline.bridge.liveBytes, '0');
    for (const key of ['liveAllocations', 'shapeHandles', 'primitiveCapacity', 'capturedPrimitives'])
        assert.equal(baseline.bridge[key], 0);
    const initialCooks = bigintString(baseline.meshCounters.cooks),
        initialDestroys = bigintString(baseline.meshCounters.destroys);
    const begins = events.filter((e) => e.kind === 'cycle-begin');
    assert.equal(begins.length, 100);
    const rows = events.filter((e) => e.kind === 'stage');
    let offset = 0;
    for (let cycle = 0; cycle < 100; ++cycle) {
        const order = ORDERS[cycle % 3],
            declared = stages(order);
        assert.equal(begins[cycle].cycle, cycle);
        assert.equal(begins[cycle].order, order);
        for (const spec of declared) {
            const row = rows[offset++];
            assert.ok(row, 'missing round/stage');
            assert.equal(row.cycle, cycle);
            assert.equal(row.order, order);
            assert.equal(row.stage, spec.stage);
            const o = row.observation;
            validateGlobal(o, baseline, spec.stage === 'world-destroyed');
            assert.equal(
                o.bridge.shapeHandles,
                spec.debugHandles,
                'lazy debug handles track exercised caches, never all core shapes',
            );
            assert.equal(o.bridge.primitiveCapacity, 0, 'api.debugSnapshot must release native copied wire');
            assert.equal(o.bridge.capturedPrimitives, 0);
            assert.equal(BigInt(o.meshCounters.cooks), initialCooks + BigInt(cycle + spec.cooked));
            assert.equal(BigInt(o.meshCounters.destroys), initialDestroys + BigInt(cycle + spec.destroyed));
            assert.ok(row.worldId > 0);
            if (spec.stage === 'world-destroyed') {
                assert.equal(o.worldValid, 0);
                assert.equal(o.nativeWorld, null, 'never invent post-destroy world counts');
                assert.equal(o.fixedJointStatus, 1);
                assert.equal(o.bodyValidity.length, 50);
                assert.equal(o.shapeValidity.length, 50);
                assert.ok(o.bodyValidity.every((v) => v === 0));
                assert.ok(o.shapeValidity.every((v) => v === 0));
                assert.equal(o.knownWorldValidity.length, cycle + 1);
                assert.ok(o.knownWorldValidity.every((v) => v === 0));
                assert.equal(row.disposedTokenRejections, 104);
            } else {
                assert.equal(o.worldValid, 1);
                assert.deepEqual(o.nativeWorld.counts, [spec.bodies, spec.shapes, spec.contacts, spec.joints]);
                bigintString(o.nativeWorld.coreBytes);
            }
            if (spec.cooked === 0) assert.equal(o.mesh, null);
            else if (spec.cache === null) assert.equal(o.mesh.status, 1);
            else {
                assert.equal(o.mesh.status, 0);
                assert.equal(o.mesh.cacheLeases, spec.cache);
                assert.equal(o.mesh.shapeBorrows, spec.borrows);
                assert.equal(o.mesh.vertexCount, 9);
                assert.equal(o.mesh.triangleCount, 8);
                assert.equal(o.mesh.worldId, row.worldId);
                natural(o.mesh.coreMeshBytes);
                assert.ok(o.mesh.coreMeshBytes > 0);
            }
            if (spec.stage === 'joint-created') {
                assert.equal(o.fixedJointStatus, 0, 'real native joint must exist');
                assert.equal(row.jointState.kind, 'fixed');
                assert.deepEqual(row.jointState.bodyA, row.ids.bodies[3]);
                assert.deepEqual(row.jointState.bodyB, row.ids.bodies[4]);
                assert.equal(row.ids.bodies.length, 50);
                assert.equal(row.ids.shapes.length, 50);
                assert.equal(new Set(row.ids.bodies.map(json)).size, 50);
                assert.equal(new Set(row.ids.shapes.map(json)).size, 50);
                assert.equal(o.bodyValidity.length, 50);
                assert.equal(o.shapeValidity.length, 50);
                assert.ok(o.bodyValidity.every((v) => v === 1));
                assert.ok(o.shapeValidity.every((v) => v === 1));
                assert.ok(BigInt(o.coreBytes) > BigInt(baseline.coreBytes), 'nonempty core allocation proof');
                assert.ok(o.bridge.liveAllocations > 0);
                assert.ok(BigInt(o.bridge.liveBytes) > 0n);
                assert.equal(o.bridge.shapeHandles, 0, 'native shape creation does not create lazy debug cache');
            }
            if (spec.stage === 'debug-captured') {
                assert.ok(o.bridge.shapeHandles > 0, 'actually exercised debug-handle subset must be nonempty');
                assert.equal(o.bridge.shapeHandles, DEBUG_SPEC.handles);
                assert.equal(row.debugArtifact.cycle, cycle);
                assert.equal(row.debugArtifact.worldId, row.worldId);
                assert.equal(row.debugArtifact.primitiveCount, DEBUG_SPEC.primitives);
            }
        }
    }
    assert.equal(offset, rows.length, 'unexpected extra round or stage');
    assert.equal(report.completedCycles, 100);
    assert.equal(report.createdBodies, 5000);
    assert.equal(report.createdWorlds, 100);
    assert.equal(report.completedDebugSnapshots, 100);
    const closed = events.filter((e) => e.kind === 'lifecycle-closed');
    assert.equal(closed.length, 1);
    validateGlobal(closed[0].observation, baseline, true);
    assert.deepEqual(closed[0].closure, report.lifecycleClosure);
    const post = events.at(-2);
    assert.equal(post.apiDisposeCompleted, true);
    validateGlobal(post.observation, baseline, true);
    assert.deepEqual(post.observation, closed[0].observation);
    for (const final of [post.observation, closed[0].observation]) {
        assert.equal(BigInt(final.meshCounters.cooks), initialCooks + 100n);
        assert.equal(BigInt(final.meshCounters.destroys), initialDestroys + 100n);
    }
    assert.equal(events.at(-1).kind, 'lifecycle-closed');
    assert.equal(events.filter((e) => e.kind === 'failure').length, 0);
    // Validate complete per-round lossless output only after structural fail-closed checks.
    for (const row of rows.filter((item) => item.stage === 'debug-captured')) {
        const payload = readDebugArtifact(row.debugArtifact);
        assert.equal(payload.cycle, row.cycle);
        assert.equal(payload.worldId, row.worldId);
        validateDebugSnapshot(payload.snapshot);
    }
    return { status: 'OBSERVED_NATIVE_SUBSET_PASS', cycles: 100, bodies: 5000, limits: LIMITS };
}
export function validatePhysicalClosure(closure) {
    assert.equal(closure.status, 'PHYSICALLY_CLOSED');
    assert.equal(closure.exitCode, 0);
    assert.equal(closure.signal, null);
    assert.equal(closure.waitpidECHILD, true);
    assert.deepEqual(closure.remainingProcessGroup, []);
    assert.equal(closure.subreaper, true);
    assert.equal(closure.waitpidScope, 'ALL_CHILDREN_-1');
    assert.deepEqual(closure.remainingDescendants, []);
    assert.deepEqual(closure.errors, []);
    assert.ok(Array.isArray(closure.rawWaitRows) && closure.rawWaitRows.length >= 1);
    assert.ok(
        Number.isFinite(closure.elapsedSeconds) &&
            closure.elapsedSeconds >= 0 &&
            closure.elapsedSeconds <= BUDGET.wallSeconds,
    );
    assert.ok(
        Number.isFinite(closure.peakSampledDescendantRSSBytes) &&
            closure.peakSampledDescendantRSSBytes >= 0 &&
            closure.peakSampledDescendantRSSBytes <= BUDGET.rssBytes,
    );
    assert.ok(
        Number.isSafeInteger(closure.retainedOutputBytes) &&
            closure.retainedOutputBytes > 0 &&
            closure.retainedOutputBytes <= BUDGET.outputBytes,
    );
    assert.equal(closure.closeBudgetSeconds, 4);
    assert.ok(Number.isFinite(closure.closeSeconds) && closure.closeSeconds >= 0 && closure.closeSeconds <= 4);
    assert.equal(closure.budgetViolation, null);
    assert.deepEqual(closure.budget, BUDGET);
}
