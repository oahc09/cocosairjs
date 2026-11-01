/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Produce a fresh exact lock only from the independent runner's successful raw receipts.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const [sourceArg, evidenceArg] = process.argv.slice(2);
assert(sourceArg && evidenceArg, 'Usage: node ex09-admit.mjs SOURCE_ROOT QUALIFICATION_ATTEMPT_DIR');
const root = resolve(sourceArg),
    evidence = resolve(evidenceArg),
    sha = (b) => createHash('sha256').update(b).digest('hex');
const bytes = readFileSync(join(evidence, 'qualification-map.json')),
    map = JSON.parse(bytes);
assert.equal(map.schema, 'box3d-ex09-integration-20261031-qualification-v1');
assert.equal(map.status, 'PASS_LIMITED_NODE_ST');
assert.equal(map.businessStatus, 'NOT_RUN');
const expected = {
    query: 'PASS_LIMITED_PRODUCTION_QUERY_TARGET_SUPPORT',
    'fixed-healthy': 'PASS_LIMITED_PUBLIC_FIXED',
    'fixed-fault': 'PASS_EXPECTED_PUBLIC_FIXED_FAULT',
    'fixed-reentry': 'PASS_EXPECTED_PUBLIC_FIXED_FAULT',
};
assert.deepEqual(map.reports.map((r) => r.id).sort(), Object.keys(expected).sort());
for (const row of map.reports) {
    const rawBytes = readFileSync(join(evidence, row.id, 'consumer.raw.json')),
        raw = JSON.parse(rawBytes);
    assert.equal(sha(rawBytes), row.rawSha256);
    assert.equal(row.exitCode, 0);
    assert.equal(raw.status, expected[row.id]);
    assert(raw.inputsUnchanged);
    assert(raw.checks.length > 0 && raw.checks.every((c) => c.pass === true));
}
assert.equal(sha(readFileSync(join(evidence, 'inputs-lock.json'))), map.inputLockSha256);
for (const k of ['committedQueries', 'committedRay', 'kinematicTarget', 'fixedAtIdle', 'boxSupportDeparture'])
    assert.equal(map.qualification[k], true);
for (const k of ['runtimeSha256', 'manifestSha256']) assert.match(map[k], /^[a-f0-9]{64}$/);
assert(Number.isSafeInteger(map.runtimeBuildNumber));
const mapPath = 'tools/verify/box3d/integration-20261031/ex09-qualification-map.json';
const lock = {
    schemaVersion: 1,
    candidateId: 'integration-20261031',
    status: 'READY_FOR_VERIFICATION',
    expectedBuild: map.runtimeBuildNumber,
    runtimeSha256: map.runtimeSha256,
    manifestSha256: map.manifestSha256,
    businessStatus: 'NOT_RUN',
    qualification: map.qualification,
    qualificationEvidence: { mapPath, mapSha256: sha(bytes), inputLockSha256: map.inputLockSha256 },
    scope: map.scope,
    remaining: [
        'Current selected door geometry and browser three-order business flow are separately tested, not inherited from these Node fixtures.',
        'Full EX09, mobile/Safari, MT and original G0-G8 gates remain unqualified by this lock.',
    ],
};
writeFileSync(join(root, mapPath), bytes, { flag: 'wx' });
writeFileSync(
    join(root, 'examples/box3d-gift-workshop/transport-candidate-integration-20261031-lock.json'),
    JSON.stringify(lock, null, 2) + '\n',
    { flag: 'wx' },
);
console.log(JSON.stringify(lock, null, 2));
