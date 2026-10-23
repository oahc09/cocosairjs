/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Additive query evidence consumer. It does not qualify all queries or browser behavior.
 */
const assert = require('node:assert/strict');
const NATIVE_CHECKS = [
    'genericAll',
    'triggerContinuation',
    'insideZero',
    'halfOpenEndpoint',
    'unsigned32Filters',
    'capacityAlignmentCanaries',
    'worldLockGeneration',
    'coreBytesRestored',
];
const FACADE_CHECKS = [
    'triggerContinuationAndZero',
    'unsigned32AndDynamicMask',
    'halfOpenEndpoint',
    'copiedFrozenNonOwningIdsAndHeapGrowth',
    'noNativeForZeroInvalid',
    'cleanup',
];
function verifyQueryQualification({ native, wasm, identity, fixtureSha256, receipt }) {
    assert.equal(native.status, 'PASS');
    assert.equal(native.pointerBytes, 4);
    assert.deepEqual(native, receipt.queryContract, 'Query native raw/receipt mismatch');
    for (const check of NATIVE_CHECKS) assert.equal(native[check], true, `Native query: ${check}`);
    assert.equal(receipt.queryAdmission?.status, 'PASS_ADMISSION_NO_NATIVE_CALLS');
    assert.equal(receipt.queryAdmission?.nativeQueryCalls, 0);
    assert.equal(receipt.queryAdmission?.rejected, 21);
    assert.equal(wasm.status, 'PASS');
    assert.equal(wasm.error, undefined);
    assert.equal(wasm.cleanupError, undefined);
    for (const [key, value] of Object.entries(identity))
        assert.equal(wasm.identity?.[key], value, `Query identity: ${key}`);
    assert.equal(wasm.fixtureSha256, fixtureSha256, 'Query fixture input drift');
    assert.deepEqual(Object.keys(wasm.checks).sort(), [...FACADE_CHECKS].sort(), 'Exact query check inventory');
    for (const check of FACADE_CHECKS) assert.equal(wasm.checks[check], true, `Facade query: ${check}`);
    // Independent fixture geometry: centered inside box, then three boxes along +X.
    // Assert actual copied observations, not only producer summary booleans.
    const hits = wasm.observations?.rawHits;
    assert(Array.isArray(hits) && hits.length === 4, 'Four original native query observations');
    assert.equal(new Set(hits.map((hit) => `${hit.shape?.low}:${hit.shape?.high}`)).size, 4);
    const sorted = [...hits].sort((a, b) => a.fraction - b.fraction);
    for (let i = 0; i < 4; ++i) {
        const hit = sorted[i];
        assert([hit.shape?.low, hit.shape?.high].every((v) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff));
        assert(hit.shape.low !== 0 || hit.shape.high !== 0);
        assert(Number.isFinite(hit.fraction) && hit.fraction >= 0 && hit.fraction < 1);
        assert(Math.abs(hit.fraction - [0, 0.15, 0.35, 0.55][i]) < 1e-6);
        assert(Array.isArray(hit.point) && hit.point.length === 3 && hit.point.every(Number.isFinite));
        assert(Array.isArray(hit.normal) && hit.normal.length === 3 && hit.normal.every(Number.isFinite));
        assert(Math.abs(hit.point[0] - [0, 1.5, 3.5, 5.5][i]) < 1e-6);
        assert.deepEqual(hit.point.slice(1), [0, 0]);
        assert.deepEqual(hit.normal, i === 0 ? [0, 0, 0] : [-1, 0, 0]);
    }
    return Object.freeze({ scope: 'NARROW_QUERY_NATIVE_FACADE_ONLY', observations: 4 });
}
module.exports = { verifyQueryQualification };
