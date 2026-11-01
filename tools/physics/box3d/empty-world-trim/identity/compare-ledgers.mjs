// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Validates retained native stdout; does not run or synthesize native measurements.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const configuration = JSON.parse(readFileSync(new URL('./profile.json', import.meta.url)));
const common = [
    'profile',
    'status',
    'checks',
    'identityMetadataLedgerBytes',
    'trimEnabled',
    'initialLedgerBytes',
    'moduleBeforeWorld',
    'moduleWithWorld',
    'moduleAfterClose',
];
function validate(record, control) {
    assert.deepEqual(Object.keys(record).sort(), [...common, ...(control ? [] : ['groups'])].sort());
    assert.equal(record.profile, control ? 'air-box3d-identity-base-control-v1' : configuration.id);
    assert.equal(record.status, 'PASS');
    assert.equal(record.trimEnabled, false);
    assert.equal(
        record.checks,
        control ? configuration.expectedControlAssertions : configuration.expectedNativeAssertions,
    );
    assert.equal(record.identityMetadataLedgerBytes, control ? 0 : configuration.identityMetadataLedgerBytes);
    for (const field of ['initialLedgerBytes', 'moduleBeforeWorld', 'moduleWithWorld', 'moduleAfterClose']) {
        assert.ok(Number.isSafeInteger(record[field]) && record[field] >= 0, field);
    }
    assert.ok(record.initialLedgerBytes > 0);
    assert.ok(record.moduleWithWorld > record.moduleBeforeWorld);
    assert.equal(record.moduleAfterClose, record.moduleBeforeWorld, 'Tracked core requests must return after close');
    if (!control) {
        assert.deepEqual(record.groups, configuration.expectedNativeGroups);
        assert.equal(
            Object.values(record.groups).reduce((sum, count) => sum + count, 0),
            record.checks,
        );
    }
}
export function compareLedgers(candidate, control) {
    validate(candidate, false);
    validate(control, true);
    const delta = candidate.initialLedgerBytes - control.initialLedgerBytes;
    assert.equal(delta, configuration.identityMetadataLedgerBytes, 'Actual same-toolchain initial ledger delta');
    return {
        status: 'PASS_IDENTITY_NATIVE_COMPARISON',
        checks: candidate.checks,
        controlChecks: control.checks,
        initialLedgerDelta: delta,
        moduleBytesComparedToLedger: false,
        trimEnabled: false,
        productionCompatible: false,
    };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    assert.equal(process.argv.length, 4, 'Usage: compare-ledgers.mjs CANDIDATE_STDOUT CONTROL_STDOUT');
    console.log(
        JSON.stringify(compareLedgers(...process.argv.slice(2).map((path) => JSON.parse(readFileSync(path, 'utf8'))))),
    );
}
