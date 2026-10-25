// CPU identity admission control with a deliberately fake identity module.
// This does not load WASM or prove any native behavior.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = existsSync(new URL('probe-source/', import.meta.url))
    ? new URL('probe-source/', import.meta.url)
    : new URL('../../../../', import.meta.url);
const { createBox3DBinding } = await import(new URL('src/air/physics/box3d/binding/facade.mjs', root));
const schema = createHash('sha256')
    .update(readFileSync(new URL('tools/physics/box3d/abi-schema.json', root)))
    .digest('hex');
const old = 'd0a917e85e800605295296ca0820fbcb54847ea5d00f6bfc296a3ce527243551';
function fixture(hash = schema, withProbe = true) {
    const expected = {
        coreSha: 'efca0c184d40fd6a82016983f1601c4d23965867',
        bindingBaseSha: '5d5a3af049cccd9948b2b55bac4342414af0ef64',
        patchChainSha256: '4c9d057fe6d7403f6f2c7672c4a7abe38041d845942540a6b5c5abbc6f4bc45c',
        abiVersion: 1,
        variant: 'st-simd',
        schemaSha256: hash,
    };
    const heap = new Uint8Array(4096);
    let cursor = 1,
        allocations = 0;
    const put = (s) => {
        const at = cursor,
            bytes = new TextEncoder().encode(s);
        heap.set(bytes, cursor);
        cursor += bytes.length + 1;
        return at;
    };
    const core = put(expected.coreSha),
        patch = put(expected.patchChainSha256),
        signature = put(hash);
    const module = {
        HEAPU8: heap,
        HEAPU32: new Uint32Array(heap.buffer),
        HEAPF32: new Float32Array(heap.buffer),
        _air_b3_core_sha: () => core,
        _air_b3_patch_chain_sha: () => patch,
        _air_b3_schema_sha: () => signature,
        _air_b3_abi_version: () => 1,
        _malloc: () => {
            allocations++;
            return 1024;
        },
        _free: () => {
            allocations--;
        },
    };
    if (withProbe)
        module._air_b3_mesh_lifetime_counters = () => {
            throw Error('identity test must not invoke native probe');
        };
    return { module, expected, allocations: () => allocations };
}
test('new facade admits exact new schema + new export before scratch construction', () => {
    const f = fixture(),
        api = createBox3DBinding(f.module, f.expected);
    assert.equal(api.identity.schemaSha256, schema);
    assert.equal(f.allocations(), 1);
    api.dispose();
    assert.equal(f.allocations(), 0);
});
test('new facade rejects old product identity before allocating or calling new probe', () => {
    const f = fixture(old, false);
    assert.throws(
        () => createBox3DBinding(f.module, f.expected),
        (e) => e.code === 'AIR_E_BOX3D_ABI',
    );
    assert.equal(f.allocations(), 0);
});
test('new schema claiming module without new export is rejected at construction', () => {
    const f = fixture(schema, false);
    assert.throws(
        () => createBox3DBinding(f.module, f.expected),
        (e) => e.code === 'AIR_E_BOX3D_ABI',
    );
    assert.equal(f.allocations(), 0);
});
