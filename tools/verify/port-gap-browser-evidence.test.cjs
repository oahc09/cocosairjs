// Contract regression against recorded observations; does not execute browsers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeBrowserEvidence } = require('./port-gap-browser-evidence.cjs');
const root = path.resolve(__dirname, '../..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'docs/evidence/port-recipes/pg33-six-s19-installed-same-origin.json'), 'utf8'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cocosair-evidence-contract-'));
const input = path.join(temp, 'input.json');
const options = { root, input, log: 'output/playwright/port-s19-six-installed-same-origin.log',
    gate: 'EG3', evidenceType: 'BROWSER_RENDER_PASS', exitCode: 1 };
const read = (value = baseline, changes = {}) => {
    fs.writeFileSync(input, JSON.stringify(value));
    return normalizeBrowserEvidence({ ...options, ...changes });
};
const rejected = [];
try {
    const report = read();
    assert.equal(report.execution.status, 'NOT_RUN');
    assert.equal(report.execution.exitCode, 1);
    assert.equal(report.scope.totalCases, 18);
    assert.equal(report.scope.measuredCases, 17);
    assert.equal(report.scope.skippedCases, 1);
    assert.equal(report.scope.completed, false);
    assert.equal(report.scope.declared.length, new Set(report.scope.declared).size);
    assert.equal(report.scope.skippedDetail[0].recipeId, 'r3-pointer-lock');
    assert.equal(report.rawOutputs.screenshots.length, 18);
    assert.equal(report.fingerprints.candidate.path, 'build/cocosair.module.js');
    assert.equal(report.fingerprints.source.path, 'docs/manual/examples/manual-port-recipes/main.ts');
    assert.equal(report.fingerprints.contract.path, 'tools/verify/air-port-recipes-browser.cjs');
    const mutations = [
        ['missing recipe', (d) => d.results[0].recipes.pop()],
        ['duplicate recipe', (d) => d.results[0].recipes[1] = d.results[0].recipes[0]],
        ['duplicate browser', (d) => d.results[1] = d.results[0]],
        ['partial scope', (d) => d.scope.pop()],
        ['parent PASS conceals NOT_RUN', (d) => d.results[2].status = 'PASS'],
        ['child PASS conceals unavailable input', (d) => {
            d.results[2].recipes[2].status = 'PASS'; d.results[2].status = 'PASS';
        }],
        ['scope PASS conceals skipped row', (d) => d.scopePassed = true],
        ['fake optional clock', (d) => {
            const p = d.results[0].recipes[5].phases; p.run.stateAfter.currentTime = p.run.stateBefore.currentTime;
        }],
        ['missing terminal release identity', (d) => d.results[0].recipes[5].releaseIdentity = false],
        ['native source drift', (d) => d.fingerprints['docs/manual/examples/manual-port-recipes/optional-recipe.ts'] = '0'.repeat(64)],
        ['missing actual browser version', (d) => delete d.results[0].version],
    ];
    for (const [name, mutate] of mutations) {
        const value = structuredClone(baseline); mutate(value);
        assert.throws(() => read(value), undefined, name); rejected.push(name);
    }
    assert.throws(() => read(baseline, { exitCode: 0 }), undefined, 'Observed zero exit cannot conceal skipped scope');
    rejected.push('zero exit conceals incomplete scope');
    // Existing flat collectors remain browser-scenario units.
    const flat = structuredClone(baseline); flat.schemaVersion = 'flat-contract-fixture/1';
    flat.scopePassed = true; flat.results = flat.results.map(({ engine, version }) => ({ engine, version, status: 'PASS' }));
    const flatReport = read(flat, { exitCode: 0 });
    assert.equal(flatReport.execution.status, 'PASS'); assert.equal(flatReport.scope.totalCases, 3);
    flat.results[0].status = 'FAIL'; flat.scopePassed = false;
    const failed = read(flat);
    assert.equal(failed.execution.status, 'FAIL'); assert.equal(failed.failureStage, 'application');
    console.log(JSON.stringify({ ok: true, recordedRecipeRows: 18, measured: 17, skipped: 1,
        rejected, flatCollectorCompatible: true, browserRunsAdded: 0 }));
} finally {
    const resolved = path.resolve(temp);
    assert(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert(path.basename(resolved).startsWith('cocosair-evidence-contract-'));
    assert(!fs.lstatSync(resolved).isSymbolicLink());
    fs.rmSync(resolved, { recursive: true, force: true });
}
