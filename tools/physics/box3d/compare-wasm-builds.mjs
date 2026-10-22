// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Compares two fresh real-WASM builds under identical source/lock inputs. Writes a new output directory.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, sha256 } from './verify-sources.mjs';

const [debugDir, releaseDir, out] = process.argv.slice(2).map((path) => resolve(path));
assert.ok(!existsSync(out), 'Preserve earlier comparison evidence; select a new output');
mkdirSync(out, { recursive: true });
const report = {
    schemaVersion: 1,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    command: [
        'node',
        'tools/physics/box3d/compare-wasm-builds.mjs',
        ...[debugDir, releaseDir, out].map((path) => relative(root, path)),
    ],
    runnerSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    scope: 'Exact equality of these finite Debug/Release Node fixtures; not cross-platform determinism or complete G1',
    checks: [],
    evidence: [],
};
const read = (dir, path) => {
    const bytes = readFileSync(resolve(dir, path));
    report.evidence.push({ path: relative(root, resolve(dir, path)), sha256: sha256(bytes), bytes: bytes.length });
    return JSON.parse(bytes);
};
try {
    const debug = read(debugDir, 'build-receipt.json');
    const release = read(releaseDir, 'build-receipt.json');
    assert.equal(debug.status, 'PASS');
    assert.equal(release.status, 'PASS');
    assert.equal(debug.mode, 'Debug');
    assert.equal(release.mode, 'Release');
    assert.deepEqual(debug.inputHashes, release.inputHashes);
    assert.deepEqual(debug.identity, release.identity);
    for (const input of debug.inputHashes)
        assert.equal(sha256(readFileSync(resolve(root, input.path))), input.sha256, input.path);
    report.checks.push('Both actual builds PASS under identical current source/lock input hashes');
    for (const dir of [debugDir, releaseDir]) {
        const manifest = read(dir, 'manifest.json');
        for (const artifact of manifest.artifacts) {
            const bytes = readFileSync(resolve(dir, artifact.path));
            assert.equal(bytes.length, artifact.bytes);
            assert.equal(sha256(bytes), artifact.sha256);
        }
        assert.equal(read(dir, 'artifact-audit.raw.json').status, 'PASS');
    }
    const physicsA = read(debugDir, 'wasm-contract.raw.json');
    const physicsB = read(releaseDir, 'wasm-contract.raw.json');
    assert.equal(physicsA.status, 'PASS');
    assert.equal(physicsB.status, 'PASS');
    // Debug assertion strings change static data size, so initial linear-memory
    // pages are an observation, not a physics equality requirement. Each memory
    // declaration is independently checked against its actual binary by the audit.
    const { memoryDeclaration: debugMemory, ...debugPhysics } = physicsA;
    const { memoryDeclaration: releaseMemory, ...releasePhysics } = physicsB;
    assert.equal(debugMemory.shared, false);
    assert.equal(releaseMemory.shared, false);
    assert.equal(debugMemory.maximumPages, releaseMemory.maximumPages);
    assert.deepEqual(debugPhysics, releasePhysics);
    report.checks.push('All 60 tick samples and base physics/heap-growth/snapshot contract fields match exactly');
    const ownershipA = read(debugDir, 'wasm-ownership-contract.raw.json');
    const ownershipB = read(releaseDir, 'wasm-ownership-contract.raw.json');
    assert.equal(ownershipA.status, 'PASS');
    assert.equal(ownershipB.status, 'PASS');
    for (const name of ['identity', 'rejectedOperations', 'slotReuseCycles', 'worldLifetimeCycles', 'observations'])
        assert.deepEqual(ownershipA[name], ownershipB[name], name);
    report.checks.push(
        'Every rejected-operation before/after state, sampled ID lifecycle and ownership observation matches exactly',
    );
    report.observations = {
        debugMemory,
        releaseMemory,
        lockSha256: debug.inputHashes.find((input) => input.path.endsWith('versions.lock.json')).sha256,
        freefallTicks: physicsA.freefallTicks.length,
        finalFreefallTick: physicsA.freefallTicks.at(-1),
        rejectedOperations: ownershipA.rejectedOperations.length,
        slotReuseCycles: ownershipA.slotReuseCycles.length,
        worldLifetimeCycles: ownershipA.worldLifetimeCycles.length,
        rawBodyIdRevalidatedAcrossWorldLifetimes: ownershipA.observations.rawBodyIdRevalidatedAcrossWorldLifetimes,
    };
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = { message: error.message, stack: error.stack };
    process.exitCode = 1;
} finally {
    report.completedAt = new Date().toISOString();
    writeFileSync(resolve(out, 'comparison.raw.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, output: relative(root, out), error: report.error?.message }));
}
