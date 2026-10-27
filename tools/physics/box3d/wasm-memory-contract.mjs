/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Future explicit build gate for the production WASM exports. Not the app/C20 host and not executed by CPU tests.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const dir = resolve(process.argv[2]);
const rawPath = resolve(dir, 'wasm-memory-contract.raw.json');
assert(!existsSync(rawPath), 'Preserve previous memory diagnostic evidence');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json')));
const { default: factory } = await import(pathToFileURL(resolve(dir, 'box3d-st.mjs')).href);
const { createBox3DBinding } = await import(pathToFileURL(resolve(dir, 'facade.mjs')).href);
const module = await factory({ wasmBinary: readFileSync(resolve(dir, 'box3d-st.wasm')) });
const api = createBox3DBinding(module, manifest);
const checks = {};
const check = (name, action) => {
    action();
    checks[name] = true;
};
const outputWords = 756,
    pointer = module._malloc((outputWords + 4) * 4);
assert(pointer && pointer % 4 === 0);
const pair = (at) => BigInt(module.HEAPU32[at >>> 2]) | (BigInt(module.HEAPU32[(at >>> 2) + 1]) << 32n);
const world = api.createWorld(),
    other = api.createWorld();
try {
    const initial = api.memoryDiagnostics(world);
    check('initialZeroStepSameWorld', () => {
        assert.equal(initial.identity.worldId, world.id);
        assert.equal(initial.identity.nativeStepIndex, 0n);
        assert.deepEqual(initial.liveCounts, { bodies: 0, shapes: 0, contacts: 0, joints: 0, islands: 0 });
    });
    check('exactLedgerSum', () => {
        assert.equal(initial.worldLedger.rows.length, 89);
        assert.equal(
            initial.worldLedger.rows.reduce((sum, row) => sum + row.bytes, 0n),
            initial.worldLedger.coreReportedBytes,
        );
    });
    check('moduleAndNativeGlobalScopes', () => {
        module._air_b3_live_bytes(pointer);
        assert.equal(initial.moduleCoreTrackedRequestedBytes, pair(pointer));
        assert.equal(module._air_b3_bridge_memory(0, pointer), 0);
        assert.equal(initial.nativeGlobalBridge.trackedBytes, pair(pointer));
        assert(initial.nativeGlobalBridge.trackedBytes > initial.nativeWorldBridge.trackedBytes);
        assert.equal(initial.nativeGlobalBridge.allocations, module.HEAPU32[(pointer >>> 2) + 2]);
    });
    check('readonlyRepeat', () => assert.deepEqual(api.memoryDiagnostics(world), initial));
    check('invalidAndShortNoPartial', () => {
        for (const [id, capacity, status] of [
            [0, outputWords, 1],
            [world.id, outputWords - 1, 4],
        ]) {
            module.HEAPU32.fill(0xa5a5a5a5, pointer >>> 2, (pointer >>> 2) + outputWords + 4);
            assert.equal(module._air_b3_world_memory_diagnostics_v2(id, pointer, capacity), status);
            assert(
                Array.from(module.HEAPU32.slice(pointer >>> 2, (pointer >>> 2) + outputWords + 4)).every(
                    (v) => v === 0xa5a5a5a5,
                ),
            );
        }
    });
    const body = api.createBody(world, { type: 2 });
    api.createSphere(body, 0.5, 1);
    const active = api.memoryDiagnostics(world);
    check('nonemptyCopiedImmutable', () => {
        assert.equal(active.liveCounts.bodies, 1);
        assert.equal(active.liveCounts.shapes, 1);
        assert.equal(
            active.worldLedger.rows.reduce((sum, row) => sum + row.bytes, 0n),
            active.worldLedger.coreReportedBytes,
        );
        assert.deepEqual(api.memoryDiagnostics(world), active);
        assert.throws(() => {
            active.worldLedger.rows[0].bytes = 0n;
        }, TypeError);
    });
    let stepped;
    check('postStepRebuildLedger', () => {
        api.step(world, 1 / 60, 1);
        stepped = api.memoryDiagnostics(world);
        assert.equal(stepped.identity.nativeStepIndex, 1n);
        const row = (name) => stepped.worldLedger.rows.find((entry) => entry.name === name);
        const scratchCapacity = row('tree.dynamic.leafIndices').capacity;
        assert(scratchCapacity > 0n, 'A real step must exercise nonzero tree rebuild scratch');
        for (const name of ['tree.dynamic.leafBoxes', 'tree.dynamic.binIndices']) {
            const entry = row(name);
            assert.equal(entry.count, null);
            assert.equal(entry.capacity, scratchCapacity);
            assert(entry.bytes > 0n, 'Core ledger estimates inactive scratch even without backing');
            assert.equal(
                entry.capacityMeaning,
                'Shared rebuildCapacity ledger estimate; backing is unallocated in pinned B3_TREE_HEURISTIC=0',
            );
        }
        assert.equal(stepped.worldLedger.classifiedBytes, stepped.worldLedger.coreReportedBytes);
        assert.deepEqual(api.memoryDiagnostics(world), stepped);
        assert.equal(active.identity.nativeStepIndex, 0n, 'Earlier copied observation remains immutable');
    });
    api.destroyBody(body);
    const released = api.memoryDiagnostics(world);
    check('releasedWorldNoWarmupOrBaselineRewrite', () => {
        assert.equal(released.liveCounts.bodies, 0);
        assert.equal(released.liveCounts.shapes, 0);
        assert.equal(released.identity.nativeStepIndex, 1n);
        assert.equal(released.worldLedger.classifiedBytes, released.worldLedger.coreReportedBytes);
        assert.equal(initial.liveCounts.bodies, 0);
    });
    check('releasedPostStepRetainedLedger', () => {
        for (const name of ['tree.dynamic.leafIndices', 'tree.dynamic.leafBoxes', 'tree.dynamic.binIndices']) {
            const before = stepped.worldLedger.rows.find((entry) => entry.name === name);
            const after = released.worldLedger.rows.find((entry) => entry.name === name);
            assert(before.capacity > 0n);
            assert.equal(after.capacity, before.capacity);
            assert.equal(after.bytes, before.bytes);
        }
        assert.equal(released.worldLedger.classifiedBytes, released.worldLedger.coreReportedBytes);
        assert.deepEqual(api.memoryDiagnostics(world), released);
    });
    check('afterCloseNotClaimed', () => assert(initial.unavailable.includes('after-app-close module observation')));
} finally {
    api.dispose();
    module._free(pointer);
}
const report = {
    schema: 'air-box3d-memory-wasm-contract-v2',
    status: 'PASS',
    identity: {
        coreSha: manifest.coreSha,
        schemaSha256: manifest.schemaSha256,
        patchChainSha256: manifest.patchChainSha256,
        abiVersion: manifest.abiVersion,
        variant: manifest.variant,
    },
    fixtureSha256: hash(readFileSync(new URL(import.meta.url))),
    checks,
    runtimeScope: 'Production WASM exports in an independent low-level fixture; not the C20 app host',
    controlledNativeBranches:
        'Locked/overflow/mismatch are covered separately by the labeled native unit fixture, not fabricated production observations',
    acceptancePassed: false,
};
writeFileSync(rawPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report));
