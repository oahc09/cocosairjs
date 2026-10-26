// Lossless raw debug output preservation and CPU validation; no WASM import/native calls.
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';
export const DEBUG_SPEC = Object.freeze({
    flags: 1,
    jointScale: 0,
    sphereBodies: 47,
    meshBodies: 3,
    sphereSegments: 24,
    meshTriangles: 8,
    handles: 47 + 3,
    primitives: 47 * 3 * 24 + 3 * 3 * 8,
    maxRawBytes: 2 * 1024 * 1024,
    maxGzipBytes: 96 * 1024,
    meaning: 'lazy debug-shape cache only; not complete native/global/JS handle count',
});
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function packDebugSnapshot(cycle, worldId, snapshot) {
    const raw = Buffer.from(JSON.stringify({ schema: 'box3d-c20-debug-snapshot-v1', cycle, worldId, snapshot }) + '\n');
    const gzip = gzipSync(raw, { level: 9 });
    return {
        gzip,
        metadata: {
            path: `debug/cycle-${String(cycle).padStart(3, '0')}.json.gz`,
            format: 'gzip-json-lossless-full-api-result',
            cycle,
            worldId,
            api: 'api.debugSnapshot',
            flags: DEBUG_SPEC.flags,
            jointScale: DEBUG_SPEC.jointScale,
            rawBytes: raw.length,
            rawSha256: hash(raw),
            gzipBytes: gzip.length,
            gzipSha256: hash(gzip),
            primitiveCount: snapshot.primitives.length,
        },
    };
}
export function writeDebugSnapshot(directory, cycle, worldId, snapshot) {
    const packed = packDebugSnapshot(cycle, worldId, snapshot);
    // Save complete raw output before checking size/content so a failed observation is retained.
    const fd = openSync(join(directory, packed.metadata.path), 'wx');
    try {
        writeFileSync(fd, packed.gzip);
        fsyncSync(fd);
    } finally {
        closeSync(fd);
    }
    return packed.metadata;
}
export function unpackDebugSnapshot(metadata, gzip) {
    assert.equal(metadata.path, `debug/cycle-${String(metadata.cycle).padStart(3, '0')}.json.gz`);
    assert.ok(Number.isInteger(metadata.cycle) && metadata.cycle >= 0 && metadata.cycle < 100);
    assert.equal(metadata.format, 'gzip-json-lossless-full-api-result');
    assert.equal(metadata.api, 'api.debugSnapshot');
    assert.equal(metadata.flags, 1);
    assert.equal(metadata.jointScale, 0);
    assert.ok(
        Number.isInteger(metadata.rawBytes) && metadata.rawBytes > 0 && metadata.rawBytes <= DEBUG_SPEC.maxRawBytes,
    );
    assert.ok(
        Number.isInteger(metadata.gzipBytes) && metadata.gzipBytes > 0 && metadata.gzipBytes <= DEBUG_SPEC.maxGzipBytes,
    );
    assert.equal(gzip.length, metadata.gzipBytes);
    assert.equal(hash(gzip), metadata.gzipSha256);
    const raw = gunzipSync(gzip, { maxOutputLength: DEBUG_SPEC.maxRawBytes });
    assert.equal(raw.length, metadata.rawBytes);
    assert.equal(hash(raw), metadata.rawSha256);
    const payload = JSON.parse(raw);
    assert.equal(payload.schema, 'box3d-c20-debug-snapshot-v1');
    assert.equal(payload.cycle, metadata.cycle);
    assert.equal(payload.worldId, metadata.worldId);
    assert.equal(payload.snapshot.primitives.length, metadata.primitiveCount);
    return payload;
}
export function readDebugSnapshot(directory, metadata) {
    // Validate the fixed relative name before any file read.
    assert.equal(metadata.path, `debug/cycle-${String(metadata.cycle).padStart(3, '0')}.json.gz`);
    assert.ok(Number.isInteger(metadata.cycle) && metadata.cycle >= 0 && metadata.cycle < 100);
    return unpackDebugSnapshot(metadata, readFileSync(join(directory, metadata.path)));
}
export function validateDebugSnapshot(snapshot) {
    assert.equal(snapshot.flags, 1);
    assert.equal(snapshot.jointScale, 0);
    assert.equal(snapshot.supportedFlags, 5);
    assert.equal(snapshot.primitives.length, DEBUG_SPEC.primitives, '47 spheres * 72 + 3 meshes * 24 lines');
    const byBody = Array(50).fill(0);
    for (const primitive of snapshot.primitives) {
        assert.equal(primitive.kind, 'line', 'flags=1 creates wireframe only, no AABB/event/joint claim');
        assert.ok(Number.isInteger(primitive.color) && primitive.color >= 0 && primitive.color <= 0xffffffff);
        for (const point of [primitive.from, primitive.to])
            assert.ok(Array.isArray(point) && point.length === 3 && point.every(Number.isFinite));
        const body = Math.round(primitive.from[0] / 20);
        assert.ok(body >= 0 && body < 50);
        const lower = body < 3 ? [body * 20, 0, 0] : [body * 20 - 0.5, 19.5, -0.5];
        const upper = body < 3 ? [body * 20 + 4, 8, 6] : [body * 20 + 0.5, 20.5, 0.5];
        for (const point of [primitive.from, primitive.to])
            for (let axis = 0; axis < 3; axis++)
                assert.ok(
                    point[axis] >= lower[axis] - 1e-4 && point[axis] <= upper[axis] + 1e-4,
                    'complete raw wire must belong to its predeclared distinct body bounds',
                );
        byBody[body]++;
    }
    assert.deepEqual(
        byBody,
        Array.from({ length: 50 }, (_, i) => (i < 3 ? 24 : 72)),
    );
    return { primitiveCount: snapshot.primitives.length, byBody };
}
