/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { verifyQueryQualification } = require('./box3d-query-qualification.cjs');
const directory = process.env.AIR_BOX3D_QUERY_ARTIFACT_DIR;
assert(directory, 'Set an actual current query artifact directory');
const json = (name) => JSON.parse(fs.readFileSync(path.join(directory, name)));
const manifest = json('manifest.json');
const identity = Object.fromEntries(
    ['coreSha', 'bindingBaseSha', 'patchChainSha256', 'abiVersion', 'variant', 'schemaSha256'].map((key) => [
        key,
        manifest[key],
    ]),
);
const root = process.env.AIR_BOX3D_QUERY_SOURCE_ROOT || path.resolve(__dirname, '../..');
const real = {
    native: json('native-query-contract.raw.json'),
    wasm: json('wasm-query-contract.raw.json'),
    receipt: json('build-receipt.json'),
    identity,
    fixtureSha256: createHash('sha256')
        .update(fs.readFileSync(path.join(root, 'tools/physics/box3d/wasm-query-contract.mjs')))
        .digest('hex'),
};
test('Actual query evidence passes the additive consumer, not a new physics run', () => {
    assert.equal(verifyQueryQualification(real).observations, 4);
});
for (const [name, edit] of [
    [
        'missing native check',
        (r) => {
            delete r.native.insideZero;
        },
    ],
    [
        'native failed',
        (r) => {
            r.native.status = 'FAIL';
        },
    ],
    [
        'not WASM32',
        (r) => {
            r.native.pointerBytes = 8;
        },
    ],
    [
        'missing facade check',
        (r) => {
            delete r.wasm.checks.cleanup;
        },
    ],
    [
        'false facade check',
        (r) => {
            r.wasm.checks.unsigned32AndDynamicMask = false;
        },
    ],
    [
        'extra facade check',
        (r) => {
            r.wasm.checks.fabricated = true;
        },
    ],
    [
        'wrong schema',
        (r) => {
            r.wasm.identity.schemaSha256 = '0'.repeat(64);
        },
    ],
    [
        'wrong source',
        (r) => {
            r.wasm.fixtureSha256 = '0'.repeat(64);
        },
    ],
    [
        'admission touched native',
        (r) => {
            r.receipt.queryAdmission.nativeQueryCalls = 1;
        },
    ],
    [
        'missing observation',
        (r) => {
            r.wasm.observations.rawHits.pop();
        },
    ],
    [
        'fabricated inside normal',
        (r) => {
            r.wasm.observations.rawHits[0].normal = [-1, 0, 0];
        },
    ],
    [
        'endpoint included',
        (r) => {
            r.wasm.observations.rawHits[3].fraction = 1;
        },
    ],
    [
        'nonfinite point',
        (r) => {
            r.wasm.observations.rawHits[1].point[0] = NaN;
        },
    ],
])
    test(`TAMPER CONTROL ONLY rejects ${name}`, () => {
        const candidate = structuredClone(real);
        edit(candidate);
        assert.throws(() => verifyQueryQualification(candidate));
    });
