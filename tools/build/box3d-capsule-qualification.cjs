/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Additive real native Capsule evidence consumer. No browser or full-shape acceptance is inferred.
 */
const assert = require('node:assert/strict');
const NATIVE_CHECKS = [
    'allThreeAxes',
    'analyticMassAndImpulse',
    'exactZeroSphere',
    'shortPositiveRejectNoWrite',
    'finiteDerivedAndAutomaticMassPreflight',
    'commandAndMotion',
    'trueCapsuleDebugSurface',
    'sensorMassLifecycle',
    'debugAllocationFailures',
    'lifecycle128',
    'coreAndBridgeBytesRestored',
];
function verifyCapsuleQualification({ native, receipt }) {
    assert.equal(native.status, 'PASS', 'Native Capsule qualification did not pass');
    assert.equal(native.pointerBytes, 4, 'Capsule qualification must execute WASM32');
    assert.deepEqual(native, receipt.capsuleContract, 'Capsule native raw/receipt mismatch');
    assert.equal(native.negativeCases, 24, 'Exact Capsule no-write rejection inventory');
    for (const check of NATIVE_CHECKS) assert.equal(native[check], true, `Native Capsule: ${check}`);
}
module.exports = { verifyCapsuleQualification };
