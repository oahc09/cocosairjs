// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Real fixed-core WASM + copied facade query results. Not a browser/Cocos query qualification.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { sha256 } from './verify-sources.mjs';
const dir = resolve(process.argv[2]),
    dest = resolve(dir, 'wasm-query-contract.raw.json');
assert.ok(!existsSync(dest), 'Preserve previous query evidence');
const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json')));
const { default: factory } = await import(pathToFileURL(resolve(dir, 'box3d-st.mjs')));
const { createBox3DBinding } = await import(pathToFileURL(resolve(dir, 'facade.mjs')));
const module = await factory({ wasmBinary: readFileSync(resolve(dir, 'box3d-st.wasm')) });
const api = createBox3DBinding(module, manifest);
const report = {
    status: 'RUNNING',
    identity: api.identity,
    fixtureSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    checks: {},
    observations: {},
};
try {
    const before = api.liveBytes(),
        world = api.createWorld([0, 0, 0]),
        body = api.createBody(world, { type: 0 });
    const shapes = [
        api.createOffsetSphere(body, [0, 0, 0], 0.5, 1, true),
        api.createOffsetSphere(body, [2, 0, 0], 0.5, 1, true),
        api.createOffsetSphere(body, [4, 0, 0], 0.5),
        api.createOffsetSphere(body, [6, 0, 0], 0.5),
    ];
    const options = { group: -1, mask: -1, queryTrigger: false };
    const ray = (extra = {}, translation = [10, 0, 0]) =>
        api.rayAllRaw(world, [0, 0, 0], translation, { ...options, ...extra });
    const key = (id) => `${id.low}:${id.high}`;
    const hits = ray();
    assert.equal(hits.length, 2);
    assert.deepEqual(hits.map((h) => key(h.shape)).sort(), shapes.slice(2).map(key).sort());
    assert.deepEqual(
        hits.map((h) => Math.round(h.fraction * 100)).sort((a, b) => a - b),
        [35, 55],
    );
    const withTriggers = ray({ queryTrigger: true });
    assert.equal(withTriggers.length, 4);
    const inside = withTriggers.find((h) => key(h.shape) === key(shapes[0]));
    assert.equal(inside.fraction, 0);
    assert.deepEqual(inside.point, [0, 0, 0]);
    assert.deepEqual(inside.normal, [0, 0, 0]);
    report.checks.triggerContinuationAndZero = true;
    report.observations.rawHits = withTriggers;
    api.setShapeFilter(world, shapes[2], { group: 0x80000000, mask: 1 });
    const bit31 = ray({ group: 1, mask: 0x80000000 });
    assert.equal(bit31.length, 1);
    assert.equal(key(bit31[0].shape), key(shapes[2]));
    api.setShapeFilter(world, shapes[2], { group: 1, mask: -1 });
    assert.equal(ray().length, 2);
    report.checks.unsigned32AndDynamicMask = true;
    assert.equal(ray({}, [3.5, 0, 0]).length, 0);
    assert.equal(ray({}, [3.5 - 1e-4, 0, 0]).length, 0);
    assert.equal(ray({}, [3.5 + 1e-4, 0, 0]).length, 1);
    report.checks.halfOpenEndpoint = true;
    for (const item of [hits, hits[0], hits[0].shape, hits[0].point, hits[0].normal]) assert.ok(Object.isFrozen(item));
    assert.throws(
        () => api.destroyShape(hits[0].shape),
        (e) => e.code === 'AIR_E_BOX3D_DISPOSED',
    );
    const saved = JSON.stringify(hits),
        oldBuffer = module.HEAPU8.buffer;
    const ptr = module._malloc(oldBuffer.byteLength + 1024);
    assert.ok(ptr);
    assert.notEqual(module.HEAPU8.buffer, oldBuffer);
    module._free(ptr);
    api.destroyShape(shapes[2]);
    assert.equal(JSON.stringify(hits), saved);
    assert.equal(ray().length, 1);
    report.checks.copiedFrozenNonOwningIdsAndHeapGrowth = true;
    let calls = 0;
    const native = module._air_b3_ray_query;
    module._air_b3_ray_query = (...args) => {
        ++calls;
        return native(...args);
    };
    assert.deepEqual(ray({}, [0, 0, 0]), []);
    assert.deepEqual(ray({ mask: 0 }), []);
    assert.deepEqual(ray({ group: 0 }), []);
    assert.throws(
        () => ray({}, [Infinity, 0, 0]),
        (e) => e.code === 'AIR_E_BOX3D_ARGUMENT',
    );
    assert.equal(calls, 0);
    module._air_b3_ray_query = native;
    report.checks.noNativeForZeroInvalid = true;
    api.destroyWorld(world);
    assert.equal(api.liveBytes(), before);
    api.dispose();
    report.checks.cleanup = true;
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
} finally {
    writeFileSync(dest, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, output: dest }));
}
