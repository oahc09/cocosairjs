// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Strict result parsing only. The supervisor must separately prove real execution,
// toolchain/source identity, bounded completion, physical close and no input drift.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const contract = () => JSON.parse(readFileSync(new URL('./native-contract.json', import.meta.url)));
export function compareResults(candidate, control) {
    const expected = contract();
    assert.deepEqual(
        Object.keys(control).sort(),
        ['profile', 'status', 'checks', 'initialLedgerBytes', 'trimEnabled'].sort(),
    );
    assert.deepEqual(
        Object.keys(candidate).sort(),
        [
            'profile',
            'status',
            'checks',
            'initialLedgerBytes',
            'creationCapacityLedgerBytes',
            'identityMetadataLedgerBytes',
            'fixedMetadataLedgerBytes',
            'trimEnabled',
            'sameWorldCycles',
            'moduleAfterClose',
            'groups',
        ].sort(),
    );
    assert.equal(control.profile, expected.controlProfile);
    assert.equal(candidate.profile, expected.profile);
    assert.equal(candidate.status, 'PASS');
    assert.equal(control.status, 'PASS');
    assert.equal(candidate.checks, expected.checks);
    assert.equal(control.checks, expected.controlChecks);
    assert.deepEqual(candidate.groups, expected.groups);
    assert.equal(
        Object.values(candidate.groups).reduce((sum, value) => sum + value, 0),
        candidate.checks,
    );
    assert.equal(candidate.trimEnabled, true);
    assert.equal(control.trimEnabled, false);
    assert.equal(candidate.sameWorldCycles, 100);
    assert.equal(candidate.creationCapacityLedgerBytes, 20);
    assert.equal(candidate.identityMetadataLedgerBytes, 36);
    assert.equal(candidate.fixedMetadataLedgerBytes, 56);
    assert.equal(candidate.moduleAfterClose, 0);
    for (const record of [candidate, control])
        assert.ok(Number.isSafeInteger(record.initialLedgerBytes) && record.initialLedgerBytes > 0);
    assert.equal(candidate.initialLedgerBytes - control.initialLedgerBytes, 20);
    return {
        status: 'PASS_STORAGE_RESULT_COMPARISON',
        checks: candidate.checks,
        controlChecks: control.checks,
        creationPolicyLedgerDelta: 20,
        sameWorldCoreCycles: 100,
        appC20Qualified: false,
        productionCompatible: false,
        worldAndModuleAccountingCombined: false,
    };
}
// Host fatal-allocation result only. WASM needs its own runtime abort proof;
// never relabel host SIGABRT qualification as Emscripten or APP evidence.
export function validateHostOOM(receipt) {
    assert.deepEqual(
        Object.keys(receipt).sort(),
        ['profile', 'exitCode', 'signal', 'stdout', 'stderr', 'physicalClose'].sort(),
    );
    assert.equal(receipt.profile, 'air-box3d-empty-storage-host-oom-v1');
    assert.equal(receipt.exitCode, null);
    assert.equal(receipt.signal, 'SIGABRT');
    assert.equal(receipt.stdout, '');
    assert.equal(receipt.physicalClose, 'ECHILD');
    assert.equal(typeof receipt.stderr, 'string');
    assert.ok(receipt.stderr.includes('STORAGE_OOM_ARMED\n'));
    assert.ok(/STORAGE_OOM_RETURN_NULL request=1 size=[1-9][0-9]* alignment=[1-9][0-9]*\n/.test(receipt.stderr));
    assert.ok(!/STORAGE_OOM_UNEXPECTED_RETURN|"status":"PASS"/.test(receipt.stderr));
    return { status: 'PASS_HOST_FATAL_OOM_RESULT', recoverableOOM: false };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    assert.equal(process.argv.length, 5, 'Usage: compare-results.mjs CANDIDATE_STDOUT CONTROL_STDOUT HOST_OOM_RECEIPT');
    const [candidate, control, oom] = process.argv.slice(2).map((path) => JSON.parse(readFileSync(path, 'utf8')));
    console.log(JSON.stringify({ ...compareResults(candidate, control), oom: validateHostOOM(oom) }));
}
