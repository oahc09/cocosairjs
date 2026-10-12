'use strict';
// Current-workspace gate. Historical/frozen pilot PASS does not bypass exact SDK freshness.
const fs = require('node:fs'),
    path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const D = require('./shaders-driver-pilot-gate.cjs');
const DB = require('./shaders-driver-pilot-browser.cjs');
const DOC = require('../examples/shaders-effect-docs.cjs');
const FILES = {
    driver: 'docs/evidence/shaders-absorption/wave5-driver-pilot-frozen-gate.json',
    fusion: 'docs/evidence/shaders-absorption/wave5-uv-fusion-pilots-gate.json',
    previousWave: 'docs/evidence/shaders-absorption/wave4-current-sdk-r2-gate.json',
};
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8'));
const sorted = (items) => [...items].sort((a, b) => a.path.localeCompare(b.path));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function assess() {
    const driver = read(FILES.driver),
        fusion = read(FILES.fusion),
        previous = read(FILES.previousWave);
    const currentSdk = sorted(DB.currentIdentity().inputs.filter((x) => DB.SDK.includes(x.path)));
    const fusionRaw = read(fusion.functional.path);
    const driverValidation = D.validateGate(driver);
    const driverSdkMatches = equal(sorted(driver.sdk), currentSdk);
    const fusionSdkMatches = equal(sorted(fusionRaw.inputs.sdk), currentSdk);
    const previousSdkMatches = equal(sorted(previous.currentSdk), currentSdk);
    const documentation = DOC.check();
    const blockers = [];
    if (!driverValidation.ok)
        blockers.push({ classification: 'AGENT_FAILURE', item: 'Driver frozen leaf', errors: driverValidation.errors });
    for (const [item, matches] of [
        ['Driver workspace SDK', driverSdkMatches],
        ['Fusion workspace SDK', fusionSdkMatches],
        ['Wave4 predecessor SDK', previousSdkMatches],
    ]) {
        if (!matches)
            blockers.push({
                classification: 'INFRA_FAILURE',
                item,
                errors: [
                    'Exact SDK bytes differ from the accepted candidate; parallel builds must not be relabeled as current evidence.',
                ],
            });
    }
    if (!documentation.ok)
        blockers.push({ classification: 'DOC_GAP', item: 'Generated metadata', errors: documentation.errors });
    if (previousSdkMatches) {
        const result = require('./shaders-current-sdk-wave4-gate.cjs').validateWaveReport(previous);
        if (!result.ok)
            blockers.push({ classification: 'AGENT_FAILURE', item: 'Current predecessor gate', errors: result.errors });
    }
    if (fusionSdkMatches) {
        const result = require('./shaders-uv-fusion-gate.cjs').validateGate(fusion);
        if (!result.ok)
            blockers.push({ classification: 'AGENT_FAILURE', item: 'Current fusion gate', errors: result.errors });
    }
    return {
        status: blockers.length ? 'BLOCKED' : 'PASS',
        nextWaveEligible: blockers.length === 0,
        agentGate: 'NOT_RUN',
        independentGalleryGate: 'NOT_RUN',
        projectCompleted: false,
        coreAPIAdded: false,
        currentSdk,
        bindings: Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, D.fingerprint(file)])),
        driver: {
            frozenCandidateValidation: driverValidation,
            counts: driver.counts,
            currentSdkMatches: driverSdkMatches,
        },
        fusion: {
            historicalStatusAtCollection: fusion.status,
            currentSdkMatches: fusionSdkMatches,
            currentValidationPerformed: fusionSdkMatches,
        },
        previousWave: {
            historicalStatusAtCollection: previous.status,
            currentSdkMatches: previousSdkMatches,
            currentValidationPerformed: previousSdkMatches,
        },
        documentation,
        blockers,
    };
}
function validateReport(report) {
    try {
        if (
            !report ||
            report.schema !== 'shaders-wave5-current-gate/1' ||
            !Number.isFinite(Date.parse(report.evaluatedAt))
        )
            return { ok: false, errors: ['report schema/time'] };
        const actual = assess();
        const declared = { ...report };
        delete declared.schema;
        delete declared.evaluatedAt;
        return equal(declared, actual)
            ? { ok: true, errors: [], status: actual.status }
            : { ok: false, errors: ['declared current Wave5 state differs from production assessment'] };
    } catch (e) {
        return { ok: false, errors: ['malformed:' + e.message] };
    }
}
module.exports = { FILES, assess, validateReport };
if (require.main === module) {
    const out = process.argv.find((x) => x.startsWith('--out='))?.slice(6),
        verify = process.argv.find((x) => x.startsWith('--verify='))?.slice(9);
    if (out && !verify) {
        const report = { schema: 'shaders-wave5-current-gate/1', evaluatedAt: new Date().toISOString(), ...assess() };
        fs.writeFileSync(path.resolve(ROOT, out), JSON.stringify(report, null, 2), { flag: 'wx' });
        console.log(
            JSON.stringify({
                out,
                status: report.status,
                nextWaveEligible: report.nextWaveEligible,
                blockers: report.blockers,
            }),
        );
        process.exitCode = report.status === 'PASS' ? 0 : 1;
    } else if (verify && !out) {
        const result = validateReport(read(verify));
        console.log(JSON.stringify(result));
        process.exitCode = result.ok && result.status === 'PASS' ? 0 : 1;
    } else {
        console.error('Use --out=<new.json> or --verify=<report.json>');
        process.exitCode = 2;
    }
}
