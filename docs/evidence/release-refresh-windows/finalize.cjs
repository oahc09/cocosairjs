const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const assert = require('node:assert/strict');
const root = process.cwd();
const base = __dirname;
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const inputs = read(path.join(base, 'local-inputs.json'));
cp.execFileSync(process.execPath, [path.join(base, 'local-inputs.cjs')], { cwd: root, stdio: 'pipe' });
const receipts = read(path.join(base, 'receipts.json'));
for (const name of ['devtools', 'gallery', 'browser-matrix']) {
    const receipt = receipts.filter(row => row.name === name).at(-1);
    assert.equal(receipt.exitCode, 0, name);
    assert.equal(receipt.inputGuardExitCode, 0, name + ' input drift');
}
assert.equal(receipts.find(row => row.name === 'gallery').exitCode, 1, 'retain first Gallery failure');
const inventory = read('docs/example-api-inventory.json');
assert.equal(inventory.totalUnits, 13515);
assert.equal(inventory.coverageRequiredUnits, 1439);
const devtools = read('docs/evidence/devtools-examples.json');
assert.equal(devtools.completed, true);
assert.equal(devtools.partial, false);
assert.equal(devtools.total, 5);
assert.equal(devtools.pass, 5);
assert.equal(devtools.candidateFingerprint, inputs.candidate);
const gallery = read('docs/evidence/gallery-artifact.json');
assert.equal(gallery.completed, true);
assert.equal(gallery.pass, gallery.total);
assert.equal(gallery.total, 303);
assert.deepEqual(gallery.scope, { examples: 188, booted: 183, devToolsPagesServed: 5, lifecycle: 91 });
assert.equal(gallery.artifactBytes.identical, true);
assert.equal(gallery.artifactBytes.liveBundleSha256_16, sha('build/cocosair.module.js').slice(0, 16));
assert.deepEqual(gallery.gpuValidationErrors, []);
const matrixPath = 'docs/evidence/browser-matrix/browser-matrix.json';
const matrix = read(matrixPath);
assert.equal(matrix.completed, true);
assert.equal(matrix.subset, false);
assert.equal(matrix.scopePassed, true);
assert.equal(matrix.runPass, 78);
assert.equal(matrix.runTotal, 78);
assert.equal(matrix.bundle.sha256_16, sha('build/cocosair.module.js').slice(0, 16));
assert.equal(matrix.contractFingerprint, sha('tools/verify/browser-matrix-contract.json').slice(0, 16));
assert.equal(matrix.records.every(row => row.result === 'PASS'), true);
const screenshots = new Set();
for (const row of matrix.records) {
    for (const [file, digest, bytes] of [[row.png, row.pngSha256_16, row.pngBytes], [row.pngBefore, row.pngBeforeSha256_16, row.pngBeforeBytes]]) {
        if (!file) continue;
        assert.equal(sha(file).slice(0, 16), digest, 'screenshot drift: ' + file);
        assert.equal(fs.statSync(file).size, bytes, 'screenshot size: ' + file);
        screenshots.add(file.replace(/\\/g, '/'));
    }
}
const staged = cp.execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' }).trim();
assert.equal(staged, '');
const readiness = cp.spawnSync(process.execPath, ['tools/verify/release-readiness.cjs'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
fs.writeFileSync(path.join(base, 'release-readiness.log'), readiness.stdout + readiness.stderr);
assert.equal(readiness.status, 1);
const failures = (readiness.stdout + readiness.stderr).split(/\r?\n/).filter(line => line.startsWith('[release] FAIL '));
assert.deepEqual(failures, [
    '[release] FAIL coverage --check failed: report, specs and runtime evidence must agree',
    '[release] FAIL V1.1 strict campaign invalid: unknown/legacy campaign schema',
    '[release] FAIL release candidate has uncommitted or untracked changes',
    '[release] FAIL V1.1 evidence and coverage use different candidates',
    '[release] FAIL core verified 17/964 (1.8%) < 100%',
    '[release] FAIL important verified 0/283 (0.0%) < 90%',
    '[release] FAIL advanced verified 0/192 (0.0%) < 80%',
    '[release] FAIL 272 unverified Important units lack an explicit status',
    '[release] FAIL Advanced uncovered=180 (must be 0)',
], 'unexpected remaining release gate failures');
assert.equal(failures.some(line => /Gallery|browser matrix|API inventory was/.test(line)), false);
const coverage = read('docs/api-coverage-report.json');
assert.equal(coverage.candidateFingerprint, inputs.candidate);
assert.equal(coverage.inventoryFingerprint, sha('docs/example-api-inventory.json').slice(0, 16));
assert.equal(coverage.apiInventoryRevision, inventory.apiInventoryRevision);
assert.equal(coverage.totalVerified, 18);
assert.equal(coverage.totalVerifiedViaCall, 16);
assert.equal(coverage.totalVerifiedViaRead, 2);
assert.equal(coverage.evidenceSources.find(row => row.path === 'docs/evidence/examples-verified.json').status, 'NOT_RUN');
const evidence = ['docs/example-api-inventory.json', 'docs/api-coverage-report.json', 'docs/evidence/devtools-examples.json', 'docs/evidence/gallery-artifact.json', matrixPath];
const report = { generatedAt: new Date().toISOString(), schema: 'cocos-air.windows-release-refresh/v1',
    version: require(path.join(root, 'package.json')).version, buildCounter: inputs.buildCounter,
    candidateFingerprint: inputs.candidate, sourceSha256: inputs.source, inputDigest: inputs.inputDigest,
    inputGuard: { unchanged: true, metadataFiles: 189, statusOrPromotionChanges: 0 },
    sdk: { reusedVerifiedBuild: true, devBuildNumber: 168, minBuildNumber: 169, sourceMapsVerified: inputs.buildSources.map(row => ({ path: row.path, sources: row.verifiedSources })) },
    api: { inventory: 'REFRESHED', totalUnits: inventory.totalUnits, requiredUnits: inventory.coverageRequiredUnits,
        apiInventoryRevision: inventory.apiInventoryRevision, runtimeEvidence: 'BLOCKED', ordinaryExamples: inputs.ordinaryExamples,
        ordinarySessions: inputs.ordinarySessions, blocker: 'Evidence custody requires Linux subreaper support',
        coverage: { refreshed: true, thresholdsPassed: false, totalVerified: 18, viaCall: 16, viaRead: 2,
            core: { verified: 17, required: 964, viaCall: 15, viaRead: 2 }, important: { verified: 0, required: 283 }, advanced: { verified: 0, required: 192 } },
        ownerDecision: 'Complete Windows-runnable items; retain API environment blocker', formalApiFreezeCreated: false },
    devtools: { completed: true, pass: 5, total: 5, metadataPreserved: true },
    gallery: { completed: true, pass: gallery.pass, total: gallery.total, scope: gallery.scope, gpuValidationErrors: 0 },
    browserMatrix: { completed: true, subset: false, pass: 78, total: 78, engines: matrix.engines, screenshotHashesVerified: screenshots.size },
    releaseReady: false, readinessExitCode: readiness.status, releaseFailures: failures,
    expectedWorktreeBlocker: failures.filter(line => line.includes('uncommitted or untracked')),
    blockedApiChain: failures.filter(line => !line.includes('uncommitted or untracked')),
    externalSafari: 'NOT_RUN - retained external acceptance', receipts,
    history: { firstGalleryAttempt: 'FAIL - empty environment selection; raw bytes retained; corrected invocation did not alter collector assertions or timeouts',
        apiOrdinaryEvidence: 'historical file retained unchanged; not accepted as current campaign', coverage: 'historical PASS retained in history; current report regenerated and fails thresholds because ordinary API evidence is unavailable' },
    evidenceSha256: Object.fromEntries(evidence.map(file => [file, sha(file)])) };
assert.equal(report.version, '1.0.0');
fs.writeFileSync(path.join(base, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ inventory: 13515, devtools: '5/5', gallery: '303/303', matrix: '78/78', screenshots: screenshots.size,
    releaseBlockers: failures.length, api: 'BLOCKED', sourceUnchanged: true }));
