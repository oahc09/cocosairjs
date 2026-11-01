/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * One actual child process per retained staging rejection. Never creates valid output.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { stageBox3DAssets } = require('../../build/box3d-assets.cjs');
const [directory, target] = process.argv.slice(2);
(async () => {
    assert(directory && target && !fs.existsSync(target));
    let observed;
    try {
        await stageBox3DAssets({ features: ['physics-box3d'], outputDirectory: target, buildDirectory: directory });
    } catch (error) {
        observed = { name: error.name, code: error.code ?? null, message: error.message, stack: error.stack };
    }
    assert(observed, 'Expected staging rejection');
    assert.equal(fs.existsSync(target), false, 'Rejected input wrote output');
    console.log(JSON.stringify({ status: 'EXPECTED_REJECTION_NO_OUTPUT', error: observed, targetAbsent: true }));
})().catch((error) => {
    console.error(error.stack);
    process.exitCode = 1;
});
