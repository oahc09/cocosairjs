// Source-only assertions, NOT native execution or lifetime qualification.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
const root = existsSync(new URL('probe-source/', import.meta.url))
    ? new URL('probe-source/', import.meta.url)
    : new URL('../../../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
test('all three real destroy sites use one counted wrapper; rollback included', () => {
    const c = read('tools/physics/box3d/native/mesh_bridge.c');
    assert.equal((c.match(/b3DestroyMesh\(/g) || []).length, 1);
    assert.equal((c.match(/destroy_mesh_counted\(/g) || []).length, 4);
    assert.match(c, /b3DestroyMesh\(mesh\);\s*if \(mesh_destroys == UINT64_MAX\)/);
    assert.match(c, /if \(!mesh\) \{ status = AIR_B3_CREATION; goto done; \}\s*\+\+mesh_cooks;/);
    assert.match(c, /mesh_cooks == UINT64_MAX \|\| mesh_counter_overflow/);
});
test('fixed 4 uint32 wire, declared export, no WASM BigInt parameter or pointer leak', () => {
    const exports = JSON.parse(read('tools/physics/box3d/exports.json'));
    const schema = JSON.parse(read('tools/physics/box3d/abi-schema.json'));
    assert.equal(exports.filter((n) => n === '_air_b3_mesh_lifetime_counters').length, 1);
    assert.ok(schema.staticMeshResource.exports.includes('_air_b3_mesh_lifetime_counters'));
    assert.equal(schema.staticMeshResource.lifetimeCounterWords.length, 4);
    assert.match(
        read('src/air/physics/box3d/binding/facade.mjs'),
        /cooks: readU64\(output\), destroys: readU64\(output \+ 8\)/,
    );
});
