/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Read-only analytic consumer. CPU parser tests are never native qualification.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CASES, CHECKS, TOLERANCE, verifySphereCapsuleSample } from './oracle.mjs';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const keys = (object, expected, label) => assert.deepEqual(Object.keys(object).sort(), [...expected].sort(), label);
export function verifySphereCapsuleQualification({ report, samplesText, identity, fixtureSha256, oracleSha256 }) {
    keys(
        report,
        [
            'profile',
            'status',
            'startedAt',
            'completedAt',
            'fixtureSha256',
            'oracleSha256',
            'tolerance',
            'scope',
            'checks',
            'observations',
            'cleanupErrors',
            'identity',
            'samplesArtifact',
            'validatedSamples',
            'lastCase',
            'lastSnapshot',
        ],
        'Exact sphere/capsule report schema',
    );
    assert.equal(report.profile, 'air-box3d-sphere-capsule-native-generation-v1');
    assert.equal(report.status, 'PASS');
    assert.equal(report.validatedSamples, 18);
    assert.deepEqual(report.lastCase, CASES.at(-1));
    assert(report.lastSnapshot && typeof report.lastSnapshot === 'object');
    assert.deepEqual(report.identity, identity, 'Complete producer manifest identity');
    for (const [actual, expected] of [
        [report.fixtureSha256, fixtureSha256],
        [report.oracleSha256, oracleSha256],
    ]) {
        assert.match(expected, /^[a-f0-9]{64}$/);
        assert.equal(actual, expected);
    }
    assert.deepEqual(report.tolerance, TOLERANCE);
    assert.equal(
        report.scope,
        '18 nondegenerate finite sphere/capsule generation cases; native WASM, not Cocos events or full T15/C21',
    );
    assert.deepEqual(report.cleanupErrors, []);
    assert.deepEqual(
        report.checks,
        CHECKS.map((name) => ({ name, result: 'PASS' })),
    );
    assert(Number.isFinite(Date.parse(report.startedAt)) && Number.isFinite(Date.parse(report.completedAt)));
    assert(Date.parse(report.completedAt) >= Date.parse(report.startedAt));
    assert.equal(typeof samplesText, 'string');
    assert(samplesText.endsWith('\n'), 'Complete JSONL final line');
    const lines = samplesText.slice(0, -1).split('\n');
    assert.equal(lines.length, 18);
    assert(
        lines.every((line) => line.length > 0),
        'No empty or ignored records',
    );
    assert.deepEqual(report.samplesArtifact, {
        path: 'sphere-capsule-samples.raw.jsonl',
        records: 18,
        bytes: Buffer.byteLength(samplesText),
        sha256: sha(samplesText),
    });
    const rows = lines.map((line) => JSON.parse(line));
    assert.deepEqual(
        rows.map((row) => row.caseId),
        CASES.map((row) => row.caseId),
        'Exact unique ordered 18 cases',
    );
    for (const row of rows) {
        keys(
            row,
            [
                'caseId',
                'axis',
                'region',
                'creationOrder',
                'contact',
                'independentPoseA',
                'independentPoseB',
                'shapeA',
                'shapeB',
            ],
            'Exact sample schema; no supplied expected oracle',
        );
        verifySphereCapsuleSample(row);
    }
    return {
        profile: report.profile,
        samples: 18,
        checks: [...CHECKS],
        samplesSha256: sha(samplesText),
        fixtureSha256,
        oracleSha256,
        fullT15: 'NOT_QUALIFIED',
        publicEvents: 'NOT_RUN_BY_THIS_NATIVE_CONSUMER',
    };
}
