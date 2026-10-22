// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Compares retained real physics independently from changed core allocation size and new metadata.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './verify-sources.mjs';
const [debug, release, baseline, out] = process.argv.slice(2).map((p) => resolve(p));
assert.ok(!existsSync(out));
mkdirSync(out, { recursive: true });
const report = { status: 'RUNNING', startedAt: new Date().toISOString(), checks: [], inputs: [] };
const read = (dir, file) => {
    const data = readFileSync(resolve(dir, file));
    report.inputs.push({ directory: dir.split('/').at(-1), path: file, sha256: sha256(data) });
    return JSON.parse(data);
};
function stripAllocation(value) {
    if (Array.isArray(value)) return value.map(stripAllocation);
    if (value && typeof value === 'object')
        return Object.fromEntries(
            Object.entries(value)
                .filter(([k]) => !['coreBytes', 'liveBytes', 'coreBytesAfter'].includes(k))
                .map(([k, v]) => [k, stripAllocation(v)]),
        );
    return value;
}
function stripExtension(value) {
    if (Array.isArray(value)) return value.map(stripExtension);
    if (value && typeof value === 'object')
        return Object.fromEntries(
            Object.entries(value)
                .filter(([k]) => !['geometry', 'geometryCounters'].includes(k))
                .map(([k, v]) => [k, stripExtension(v)]),
        );
    return value;
}
try {
    const dr = read(debug, 'build-receipt.json'),
        rr = read(release, 'build-receipt.json');
    assert.equal(dr.status, 'PASS');
    assert.equal(rr.status, 'PASS');
    assert.deepEqual(dr.inputHashes, rr.inputHashes);
    assert.deepEqual(dr.identity, rr.identity);
    assert.deepEqual(
        read(debug, 'native-geometry-contract.raw.json'),
        read(release, 'native-geometry-contract.raw.json'),
    );
    const d = read(debug, 'wasm-geometry-contract.raw.json'),
        r = read(release, 'wasm-geometry-contract.raw.json');
    assert.equal(d.status, 'PASS');
    assert.equal(r.status, 'PASS');
    assert.equal(d.fixtureSha256, r.fixtureSha256);
    assert.deepEqual(d.checks, r.checks);
    const { growth: debugGrowth, ...debugPhysics } = d.observations;
    const { growth: releaseGrowth, ...releasePhysics } = r.observations;
    assert.deepEqual(debugPhysics, releasePhysics);
    for (const growth of [debugGrowth, releaseGrowth]) {
        assert.equal(growth.length, 2);
        for (const event of growth) assert.ok(event.after > event.before && event.before > 0);
    }
    report.memoryGrowth = { debug: debugGrowth, release: releaseGrowth };
    assert.deepEqual(d.samples, r.samples);
    assert.deepEqual(d.samplesArtifact, r.samplesArtifact);
    const ds = readFileSync(resolve(debug, d.samplesArtifact.path)),
        rs = readFileSync(resolve(release, r.samplesArtifact.path));
    assert.deepEqual(ds, rs);
    assert.equal(sha256(ds), d.samplesArtifact.sha256);
    report.checks.push('exact-Debug-Release-native-geometry-and-all-617-analytic-samples');
    for (const directory of [debug, release]) {
        const base = read(baseline, 'wasm-contract.raw.json'),
            current = read(directory, 'wasm-contract.raw.json');
        assert.deepEqual(current.freefallTicks, base.freefallTicks);
        assert.equal(current.staleHandlesRejected, base.staleHandlesRejected);
        assert.equal(current.snapshotsCopied, base.snapshotsCopied);
        const bs = read(baseline, 'wasm-snapshot-contract.raw.json'),
            cs = read(directory, 'wasm-snapshot-contract.raw.json');
        assert.equal(cs.status, 'PASS');
        assert.deepEqual(cs.observations, bs.observations);
        assert.deepEqual(stripExtension(cs.diagnostics), bs.diagnostics);
        const bo = read(baseline, 'wasm-ownership-contract.raw.json'),
            co = read(directory, 'wasm-ownership-contract.raw.json');
        assert.equal(co.status, 'PASS');
        for (const operation of co.rejectedOperations) assert.deepEqual(operation.before, operation.after);
        for (const operation of bo.rejectedOperations) assert.deepEqual(operation.before, operation.after);
        assert.deepEqual(stripAllocation(co.rejectedOperations), stripAllocation(bo.rejectedOperations));
        report.allocationObservations ??= [];
        report.allocationObservations.push({
            build: directory.split('/').at(-1),
            oldCoreBytes: bo.rejectedOperations[0].before.coreBytes,
            newCoreBytes: co.rejectedOperations[0].before.coreBytes,
            oldWorldBytes: bo.rejectedOperations[0].before.worlds.map((w) => w.liveBytes),
            newWorldBytes: co.rejectedOperations[0].before.worlds.map((w) => w.liveBytes),
            invalidOperationsPreserveAllocationBytesWithinEachBuild: true,
        });
        for (const data of [co, bo]) {
            assert.equal(new Set(data.slotReuseCycles.map((c) => c.coreBytesAfter)).size, 1);
            assert.ok(data.worldLifetimeCycles.every((c) => c.coreBytesAfter === '0'));
            assert.deepEqual(data.observations.coreBytesAfter, ['0', '0']);
        }
        assert.deepEqual(stripAllocation(co.slotReuseCycles), stripAllocation(bo.slotReuseCycles));
        assert.deepEqual(stripAllocation(co.worldLifetimeCycles), stripAllocation(bo.worldLifetimeCycles));
        assert.deepEqual(stripAllocation(co.observations), stripAllocation(bo.observations));
        report.checks.push(
            `${directory.split('/').at(-1)}-matches-g-physics-all-old-raw-contact-sensor-observations-and-ownership`,
        );
    }
    report.scope =
        'Exact finite physics/ownership comparison; changed allocation sizes and newly added geometry metadata are not claimed identical to g. No universal equivalence.';
    report.identity = dr.identity;
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
} finally {
    report.completedAt = new Date().toISOString();
    writeFileSync(resolve(out, 'geometry-comparison.raw.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, checks: report.checks, error: report.error?.slice(0, 2000) }));
}
