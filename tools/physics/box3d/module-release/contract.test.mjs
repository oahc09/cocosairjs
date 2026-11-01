/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Actual decoder and source guards; fake native modules are NOT native/runtime evidence.
import test from 'node:test';
import { createBox3DBinding } from '../../../../src/air/physics/box3d/binding/facade.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
    captureModuleReleaseSnapshot as capture,
    verifyModuleReleased as verify,
    MODULE_RELEASE_WORDS,
} from '../../../../src/air/physics/box3d/binding/module-release.mjs';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const schemaBytes = read('../abi-schema.json');
const schema = JSON.parse(schemaBytes);
const expected = {
    coreSha: schema.coreSha,
    abiVersion: 1,
    variant: 'st-simd',
    schemaSha256: createHash('sha256').update(schemaBytes).digest('hex'),
    patchChainSha256: JSON.parse(read('../versions.lock.json')).patchLock.patchChainSha256,
};
function fake(overrides = {}) {
    let heap = new Uint8Array(8192),
        frees = 0;
    const module = {
        get HEAPU8() {
            return heap;
        },
        _air_b3_abi_version: () => 1,
        _air_b3_core_sha: () => 32,
        _air_b3_schema_sha: () => 128,
        _air_b3_patch_chain_sha: () => 256,
        _malloc: () => 1024,
        _free: () => {
            frees++;
        },
        _air_b3_module_release_snapshot_v1: (out, words) => {
            assert.equal(words, 38);
            const values = new Uint32Array(heap.buffer, out, 38);
            values.fill(0);
            values.set([1, 38, 17, 0]);
            values[6] = 128; // Nonzero allowed factory core baseline, not rewritten to zero.
            return 0;
        },
        ...overrides,
    };
    for (const [at, value] of [
        [32, expected.coreSha],
        [128, expected.schemaSha256],
        [256, expected.patchChainSha256],
    ])
        heap.set(new TextEncoder().encode(value + '\0'), at);
    return {
        module,
        get frees() {
            return frees;
        },
        grow() {
            const next = new Uint8Array(heap.length * 2);
            next.set(heap);
            heap = next;
        },
    };
}
test('actual decoder returns immutable detached current-module values, not a JS world map', () => {
    const f = fake(),
        value = capture(f.module, expected);
    assert.equal(value.core.trackedRequestedBytes, 128);
    assert.equal(verify(value, value), true);
    assert(Object.isFrozen(value) && Object.isFrozen(value.bridge) && Object.isFrozen(value.mesh));
    f.module.HEAPU8.fill(255, 1024);
    assert.equal(value.core.worlds, 0);
    assert.equal(f.frees, 1);
});
test('native growth uses fresh current heap view', () => {
    const f = fake(),
        original = f.module._air_b3_module_release_snapshot_v1;
    f.module._air_b3_module_release_snapshot_v1 = (...args) => {
        f.grow();
        return original(...args);
    };
    assert.equal(capture(f.module, expected).core.trackedRequestedBytes, 128);
    assert.equal(f.frees, 1);
});
for (const field of ['coreSha', 'schemaSha256', 'patchChainSha256', 'abiVersion', 'variant'])
    test(`wrong ${field} rejects before allocation`, () => {
        const f = fake();
        assert.throws(() => capture(f.module, { ...expected, [field]: 'old' }));
        assert.equal(f.frees, 0);
    });
for (const name of ['_air_b3_module_release_snapshot_v1', '_air_b3_core_sha', '_malloc', '_free'])
    test(`missing export ${name} fails closed`, () => {
        const f = fake();
        delete f.module[name];
        assert.throws(() => capture(f.module, expected));
        assert.equal(f.frees, 0);
    });
for (const status of [2, 4, 9, 13])
    test(`native status ${status} never returns partial snapshot`, () => {
        const f = fake({ _air_b3_module_release_snapshot_v1: () => status });
        assert.throws(
            () => capture(f.module, expected),
            (e) => e.nativeStatus === status,
        );
        assert.equal(f.frees, 1);
    });
for (const [word, value] of [
    [0, 2],
    [1, 37],
    [2, 16],
    [3, 1],
    [7, 0x200000],
])
    test(`bad header/u64 at ${word} fails`, () => {
        const f = fake(),
            original = f.module._air_b3_module_release_snapshot_v1;
        f.module._air_b3_module_release_snapshot_v1 = (out, n) => {
            original(out, n);
            new Uint32Array(f.module.HEAPU8.buffer, out, 38)[word] = value;
            return 0;
        };
        assert.throws(() => capture(f.module, expected));
        assert.equal(f.frees, 1);
    });
test('reentrant capture rejected and guard retires after failure', () => {
    const f = fake(),
        original = f.module._air_b3_module_release_snapshot_v1;
    f.module._air_b3_module_release_snapshot_v1 = () => capture(f.module, expected);
    assert.throws(() => capture(f.module, expected), /Reentrant/);
    f.module._air_b3_module_release_snapshot_v1 = original;
    assert.equal(capture(f.module, expected).core.worlds, 0);
});
test('capture primary is preserved if scratch free also fails', () => {
    const primary = new Error('native read failed'),
        f = fake({
            _air_b3_module_release_snapshot_v1: () => {
                throw primary;
            },
            _free: () => {
                throw new Error('free failed');
            },
        });
    assert.throws(
        () => capture(f.module, expected),
        (e) => e === primary && /free failed/.test(e.observerCleanupError),
    );
    f.module._free = () => {};
    assert.throws(
        () => capture(f.module, expected),
        (e) => e === primary,
    );
});
test('successful read plus failed scratch cleanup cannot return verified snapshot', () => {
    const f = fake({
        _free: () => {
            throw new Error('free failed');
        },
    });
    assert.throws(() => capture(f.module, expected), /free failed/);
});
test('every registered native field is an independent terminal refusal, not an additive pseudo-total', () => {
    const baseline = capture(fake().module, expected);
    for (const group of ['core', 'bridge', 'mesh'])
        for (const field of Object.keys(baseline[group])) {
            const bad = structuredClone(baseline);
            bad[group][field]++;
            assert.throws(() => verify(baseline, bad), `${group}.${field}`);
            assert.throws(() => verify(bad, baseline), `unreset baseline ${group}.${field}`);
        }
});
test('malformed/partial/unknown copied group cannot verify', () => {
    const baseline = capture(fake().module, expected);
    for (const mutate of [
        (x) => delete x.mesh,
        (x) => delete x.mesh.leases,
        (x) => (x.mesh.leases = NaN),
        (x) => (x.mesh.leases = -1),
        (x) => (x.mesh.extra = 0),
        (x) => (x.extra = 0),
    ]) {
        const bad = structuredClone(baseline);
        mutate(bad);
        assert.throws(() => verify(baseline, bad));
    }
});
test('schema/export/source route stays exactly versioned and core/registry scoped', () => {
    assert.equal(MODULE_RELEASE_WORDS, 38);
    assert.equal(schema.moduleReleaseSnapshot.outputWords, 38);
    assert.equal(schema.moduleReleaseSnapshot.fieldsU64LoHi.length, 17);
    assert.equal(schema.memoryDiagnosticsV2.wireWords, 756);
    const exports = JSON.parse(read('../exports.json'));
    assert.equal(exports.filter((x) => x === '_air_b3_module_release_snapshot_v1').length, 1);
    const native = read('../native/module_release.c');
    assert.match(native, /b3GetWorldCount\(\)/);
    assert.match(native, /b3GetByteCount\(\)/);
    assert(native.indexOf('air_b3_mesh_global_snapshot') < native.indexOf('memcpy(out, staged'));
    assert.match(native, /capacityWords < AIR_B3_MODULE_RELEASE_WORDS/);
    for (const [path, chain, guard] of [
        ['../native/world_bridge.c', 'worlds', 'UINT64_MAX - value'],
        ['../native/mesh_bridge.c', 'resources', 'UINT64_MAX - value'],
    ]) {
        const text = read(path);
        assert(text.includes(`= ${chain};`));
        assert(text.includes(guard));
        assert(text.includes('memcpy(out, staged, sizeof(staged))'));
    }
});

test('actual native identity bytes cannot be replaced by expected descriptor', () => {
    const f = fake();
    f.module.HEAPU8[32] = 120;
    assert.throws(() => capture(f.module, expected), /Native module release identity mismatch/);
    assert.equal(f.frees, 0);
});
test('shared memory is never accepted by the exclusive ST observer', () => {
    const f = fake();
    const shared = new Uint8Array(new SharedArrayBuffer(8192));
    shared.set(f.module.HEAPU8);
    Object.defineProperty(f.module, 'HEAPU8', { get: () => shared });
    assert.throws(() => capture(f.module, expected), /Native module release identity mismatch/);
});
test('frozen primary error still wins over scratch cleanup failure', () => {
    const primary = Object.freeze(new Error('frozen native failure'));
    const f = fake({
        _air_b3_module_release_snapshot_v1: () => {
            throw primary;
        },
        _free: () => {
            throw new Error('cleanup');
        },
    });
    assert.throws(
        () => capture(f.module, expected),
        (error) => error === primary,
    );
});

test('actual disposed facade retires its private module reference without blocking loader terminal capture', () => {
    const f = fake({ _air_b3_mesh_lifetime_counters: () => 0 });
    const identity = { ...expected, bindingBaseSha: JSON.parse(read('../versions.lock.json')).bindingBase.commit };
    const baseline = capture(f.module, identity),
        api = createBox3DBinding(f.module, identity);
    api.dispose();
    api.dispose();
    assert.throws(() => api.liveBytes(), /disposed/);
    const terminal = capture(f.module, identity);
    assert.equal(verify(baseline, terminal), true);
    assert.equal(f.frees, 3);
    const source = read('../../../../src/air/physics/box3d/binding/facade.mjs');
    const dispose = source.slice(source.lastIndexOf('        dispose() {'));
    assert(dispose.indexOf('module._free(scratch)') < dispose.indexOf('disposed = true'));
    assert(dispose.indexOf('disposed = true') < dispose.indexOf('module = null'));
});
