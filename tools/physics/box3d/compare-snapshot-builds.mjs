// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Read-only comparisons of fresh real-WASM outputs; writes only a new report directory.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, sha256 } from './verify-sources.mjs';

const [debugDir, releaseDir, debugGrowthDir, releaseGrowthDir, out] = process.argv.slice(2).map((p) => resolve(p));
assert.ok(!existsSync(out), 'Select a fresh report directory');
mkdirSync(out, { recursive: true });
const report = {
    schemaVersion: 1,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    command: ['node', 'tools/physics/box3d/compare-snapshot-builds.mjs', ...process.argv.slice(2)],
    runnerSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    scope: 'Exact finite Debug/Release copied-event and raw-manifold comparison; not C21 epoch qualification or G1',
    checks: [],
    evidence: [],
};
const read = (dir, name) => {
    const path = resolve(dir, name),
        bytes = readFileSync(path);
    report.evidence.push({ path: relative(root, path), bytes: bytes.length, sha256: sha256(bytes) });
    return JSON.parse(bytes);
};
const add = (a, b) => a.map((x, i) => x + b[i]);
const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
try {
    const a = read(debugDir, 'build-receipt.json'),
        b = read(releaseDir, 'build-receipt.json');
    assert.equal(a.status, 'PASS');
    assert.equal(b.status, 'PASS');
    assert.deepEqual(a.inputHashes, b.inputHashes);
    assert.deepEqual(a.identity, b.identity);
    for (const input of a.inputHashes) assert.equal(sha256(readFileSync(resolve(root, input.path))), input.sha256);
    for (const dir of [debugDir, releaseDir]) {
        const manifest = read(dir, 'manifest.json');
        for (const artifact of manifest.artifacts) {
            const bytes = readFileSync(resolve(dir, artifact.path));
            assert.equal(bytes.length, artifact.bytes);
            assert.equal(sha256(bytes), artifact.sha256);
        }
        assert.equal(read(dir, 'artifact-audit.raw.json').status, 'PASS');
    }
    report.checks.push('Both real builds retain identical current input hashes; every artifact hash verifies');
    const x = read(debugDir, 'wasm-snapshot-contract.raw.json'),
        y = read(releaseDir, 'wasm-snapshot-contract.raw.json');
    assert.equal(x.status, 'PASS');
    assert.equal(y.status, 'PASS');
    for (const field of ['identity', 'scope', 'limitations', 'checks', 'observations', 'diagnostics'])
        assert.deepEqual(x[field], y[field], field);
    report.checks.push(
        'All seven snapshot groups and every copied contact/sensor/sleep/rotation diagnostic match exactly',
    );
    const gx = read(debugGrowthDir, 'contact-growth.raw.json'),
        gy = read(releaseGrowthDir, 'contact-growth.raw.json');
    assert.equal(gx.status, 'PASS');
    assert.equal(gy.status, 'PASS');
    assert.equal(gx.inputs.fixture, gy.inputs.fixture);
    assert.equal(
        gx.inputs.fixture,
        sha256(readFileSync(resolve(root, 'tools/physics/box3d/wasm-contact-growth-contract.mjs'))),
    );
    assert.equal(gx.inputs.manifest, sha256(readFileSync(resolve(debugDir, 'manifest.json'))));
    assert.equal(gy.inputs.manifest, sha256(readFileSync(resolve(releaseDir, 'manifest.json'))));
    for (const field of ['identity', 'copiedSnapshot', 'destructionSnapshot'])
        assert.deepEqual(gx[field], gy[field], field);
    for (const g of [gx, gy]) {
        assert.equal(g.heapGrowth.length, 2);
        for (const event of g.heapGrowth) {
            assert.ok(event.beforeBytes > 0 && event.afterBytes > event.beforeBytes);
            assert.equal(event.snapshotUnchanged, true);
            assert.equal(event.nativeContactStillValid, true);
        }
    }
    report.checks.push(
        'Live contact/body/sensor copied data survives two actual grows; destruction outputs match exactly',
    );
    report.memoryObservations = { debug: gx.heapGrowth, release: gy.heapGrowth };
    report.anchorDiagnostics = {
        status: 'OBSERVATION_ONLY_UNRESOLVED_EPOCH',
        interpretation:
            'COM-plus-native-anchor hypotheses below are not valid world-point outputs. Coincidence gaps and quaternion changes expose the ambiguity; no residual threshold establishes the hidden generation/cached pose, CCD path, or C21 correctness.',
        samples: [],
    };
    for (const snapshot of x.diagnostics.rotatingEccentricRawContacts) {
        for (const c of snapshot.contactsOfOwnedBodies)
            for (const m of c.manifolds)
                for (const p of m.points) {
                    const preA = add(c.prePoseA.slice(7, 10), p.anchorA),
                        preB = add(c.prePoseB.slice(7, 10), p.anchorB);
                    const postA = add(c.postPoseA.slice(7, 10), p.anchorA),
                        postB = add(c.postPoseB.slice(7, 10), p.anchorB);
                    report.anchorDiagnostics.samples.push({
                        stepIndex: snapshot.stepIndex,
                        contactId: c.contactId,
                        preCOMPlusAnchorA: preA,
                        preCOMPlusAnchorB: preB,
                        postCOMPlusAnchorA: postA,
                        postCOMPlusAnchorB: postB,
                        preHypothesisCoincidenceGap: distance(preA, preB),
                        postHypothesisCoincidenceGap: distance(postA, postB),
                        bodyBQuaternionChordDelta: distance(c.prePoseB.slice(3, 7), c.postPoseB.slice(3, 7)),
                        bodyBOriginCOMDistance: distance(c.postPoseB.slice(0, 3), c.postPoseB.slice(7, 10)),
                        nativeSeparation: p.separation,
                        nativeBaseSeparation: p.baseSeparation,
                        persisted: p.persisted,
                    });
                }
    }
    assert.ok(report.anchorDiagnostics.samples.length >= 12);
    for (const field of [
        'preHypothesisCoincidenceGap',
        'postHypothesisCoincidenceGap',
        'bodyBQuaternionChordDelta',
        'bodyBOriginCOMDistance',
    ]) {
        const values = report.anchorDiagnostics.samples.map((s) => s[field]);
        report.anchorDiagnostics[field + 'Range'] = [Math.min(...values), Math.max(...values)];
    }
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = { message: error.message, stack: error.stack };
    process.exitCode = 1;
} finally {
    report.completedAt = new Date().toISOString();
    writeFileSync(resolve(out, 'snapshot-comparison.raw.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, output: relative(root, out), error: report.error?.message }));
}
