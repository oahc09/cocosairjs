/* Read-only release gate. The coverage ratchet is a regression floor, not V1.1 acceptance. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const failures = [];
const requireCheck = (condition, message) => {
    if (!condition) failures.push(message);
};
const sha16 = (file) =>
    crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, file)))
        .digest('hex')
        .slice(0, 16);

const manifest = read('examples/files.json');
const coverage = read('docs/api-coverage-report.json');
const inventory = read('docs/example-api-inventory.json');
const currentCandidate = require('./api-trace.cjs').candidateFingerprint();
requireCheck(coverage.candidateFingerprint === currentCandidate, 'coverage report uses a different live candidate');
try {
    execFileSync(process.execPath, [path.join(root, 'tools/examples/coverage-report.cjs'), '--check'], {
        cwd: root,
        stdio: 'pipe',
        maxBuffer: 8 * 1024 * 1024,
    });
} catch (error) {
    failures.push('coverage --check failed: report, specs and runtime evidence must agree');
}
const licenseAudit = require('./verify-licenses.cjs').check();
for (const failure of licenseAudit.failures) failures.push(`license: ${failure}`);
const requiredEvidence = [
    'docs/evidence/examples-verified.json',
    'docs/evidence/devtools-examples.json',
    'docs/evidence/gallery-artifact.json',
    'docs/evidence/browser-matrix/browser-matrix.json',
];
const missingEvidence = requiredEvidence.filter((file) => !fs.existsSync(path.join(root, file)));
if (missingEvidence.length) {
    for (const failure of failures) console.error(`[release] FAIL ${failure}`);
    for (const file of missingEvidence) console.error(`[release] FAIL missing evidence: ${file}`);
    console.log(
        `[release] NOT READY (${failures.length + missingEvidence.length} blockers; ${missingEvidence.length} missing evidence files)`,
    );
    process.exit(1);
}
const v11 = read('docs/evidence/examples-verified.json');
const v11Validation = require('./example-evidence-campaign.cjs').validateCampaign(v11, {
    repo: root,
    evidencePath: path.join(root, 'docs/evidence/examples-verified.json'),
});
requireCheck(v11Validation.ok, `V1.1 strict campaign invalid: ${v11Validation.errors.join('; ')}`);
const devtools = read('docs/evidence/devtools-examples.json');
const gallery = read('docs/evidence/gallery-artifact.json');
const v12 = read('docs/evidence/browser-matrix/browser-matrix.json');
const bundle = sha16('build/cocosair.module.js');
const verifiedUnits = new Set((coverage.verifiedList || []).map((entry) => entry.unit));
const worktreeChanges = execFileSync('git', ['status', '--porcelain=v1'], { cwd: root, encoding: 'utf8' }).trim();
requireCheck(!worktreeChanges, 'release candidate has uncommitted or untracked changes');

const stable = manifest.examples.filter((example) => example.status === 'stable').length;
requireCheck(stable >= 120, `stable examples ${stable}/120`);
requireCheck(
    coverage.inventoryFingerprint === sha16('docs/example-api-inventory.json'),
    'coverage inventory fingerprint is stale',
);
requireCheck(
    inventory.sourceFingerprint === sha16('build/cocosair.module.d.ts'),
    'API inventory was generated from a different declaration bundle',
);
requireCheck(/^[0-9a-f]{16}$/.test(inventory.apiInventoryRevision || ''), 'API inventory revision is missing');
requireCheck(
    coverage.apiInventoryRevision === inventory.apiInventoryRevision,
    'coverage report belongs to another API inventory revision',
);
requireCheck((coverage.inventoryConsistency || []).length === 0, 'coverage inventory is inconsistent');
requireCheck((coverage.staleEvidenceExamples || []).length === 0, 'coverage evidence is stale');
requireCheck((coverage.evidenceSchemaGaps || []).length === 0, 'coverage evidence has schema gaps');
requireCheck(inventory.coverageRequiredUnits === coverage.totalRequired, 'coverage denominator differs from inventory');
requireCheck(
    coverage.candidateFingerprint === v11.candidateFingerprint,
    'V1.1 evidence and coverage use different candidates',
);
requireCheck(
    coverage.candidateFingerprint === devtools.candidateFingerprint,
    'DevTools evidence and coverage use different candidates',
);

for (const [tier, target] of [
    ['core', 1],
    ['important', 0.9],
    ['advanced', 0.8],
]) {
    const actual = coverage.tiers[tier];
    requireCheck(actual && actual.required > 0, `${tier} coverageRequired denominator is empty`);
    if (!actual || !actual.required) continue;
    // V1.1 §23: only coverageRequired units enter the denominator. An empty
    // Advanced denominator is an inventory gap, never evidence of 80% coverage.
    const rate = actual.requiredVerified / actual.required;
    requireCheck(
        rate + Number.EPSILON >= target,
        `${tier} verified ${actual.requiredVerified}/${actual.required} (${(rate * 100).toFixed(1)}%) < ${(target * 100).toFixed(0)}%`,
    );
}

const importantUnstated = Object.entries(inventory.units).filter(
    ([name, unit]) =>
        unit.tier === 'important' && unit.coverageRequired && !verifiedUnits.has(name) && !unit.coverageStatus,
);
requireCheck(
    importantUnstated.length === 0,
    `${importantUnstated.length} unverified Important units lack an explicit status`,
);
const advancedRequired = Object.entries(inventory.units).filter(
    ([, unit]) => unit.tier === 'advanced' && unit.coverageRequired,
);
if (advancedRequired.length) {
    const documentedOnly = advancedRequired.filter(
        ([name, unit]) =>
            !verifiedUnits.has(name) &&
            unit.coverageStatus === 'documented-only' &&
            typeof unit.coverageReason === 'string' &&
            unit.coverageReason.trim(),
    );
    const uncovered = advancedRequired.length - coverage.tiers.advanced.requiredVerified - documentedOnly.length;
    requireCheck(
        documentedOnly.length / advancedRequired.length <= 0.2,
        `Advanced documented-only ${documentedOnly.length}/${advancedRequired.length} exceeds 20%`,
    );
    requireCheck(uncovered === 0, `Advanced uncovered=${uncovered} (must be 0)`);
}

requireCheck(
    v11.completed === true && v11.partial === false && v11.fail === 0 && v11.runPass === v11.runTotal,
    `V1.1 browser evidence incomplete (${v11.runPass}/${v11.runTotal})`,
);
requireCheck(
    devtools.completed === true &&
        devtools.partial === false &&
        devtools.fail === 0 &&
        devtools.runPass === devtools.runTotal,
    `DevTools evidence incomplete (${devtools.runPass}/${devtools.runTotal})`,
);
requireCheck(
    gallery.completed === true && gallery.pass === gallery.total && gallery.artifactBytes.identical === true,
    `Gallery artifact evidence incomplete (${gallery.pass}/${gallery.total})`,
);
requireCheck(gallery.artifactBytes.liveBundleSha256_16 === bundle, 'Gallery artifact uses a different bundle');
requireCheck(
    v12.completed === true && v12.subset === false && v12.runPass === v12.runTotal,
    `V1.2 browser matrix incomplete (${v12.runPass}/${v12.runTotal})`,
);
requireCheck(v12.bundle.sha256_16 === bundle, 'V1.2 browser matrix uses a different bundle');
requireCheck(
    v12.contractFingerprint === sha16('tools/verify/browser-matrix-contract.json'),
    'V1.2 browser matrix uses an old contract',
);

console.log(
    `[release] stable=${stable}; coverage core=${coverage.tiers.core.requiredVerified}/${coverage.tiers.core.required}, important=${coverage.tiers.important.requiredVerified}/${coverage.tiers.important.required}, advanced=${coverage.tiers.advanced.requiredVerified}/${coverage.tiers.advanced.required}`,
);
for (const failure of failures) console.error(`[release] FAIL ${failure}`);
console.log(`[release] ${failures.length ? 'NOT READY' : 'READY'} (${failures.length} blockers)`);
process.exitCode = failures.length ? 1 : 0;
