'use strict';
// Read-only geometry evidence and mutation audit. Writes only an explicit fresh --out.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
    validateReport,
    validateSelectedReport,
    validateNormals,
    checkCase,
    INPUTS,
} = require('./interactive-geometry-browser.cjs');
const ROOT = path.resolve(__dirname, '../..');
const clone = (x) => structuredClone(x);
function audit(report, selectedEngines) {
    const validate = selectedEngines === undefined ? validateReport : (r) => validateSelectedReport(r, selectedEngines);
    const actual = validate(report);
    const invalid = actual.errors.filter((e) => !e.includes(': honest FAIL recorded ('));
    const baseline = {
        scopePassed: validateReport(report).ok,
        selectedScopePassed: actual.ok,
        validRecordedObservations: invalid.length === 0,
        errors: actual.errors,
    };
    const results = [];
    const base = report.rows.find((r) => r.cases?.[0]?.result === 'PASS');
    if (!base) return { ok: false, baseline, errors: ['no actual successful case for rejection controls'] };
    const ctx = {
        sdkModuleSha256: report.fingerprints[INPUTS[0]].sha256,
        appSha256: report.fingerprints[INPUTS[2]].sha256,
        harnessSha256: report.fingerprints[INPUTS[5]].sha256,
        browserExpected: `${base.engine} ${base.browserVersion}`,
    };
    const mutations = [
        [
            'missing-raw-input',
            (r) => {
                delete r.modelState.raw.inputEvents;
            },
        ],
        [
            'untrusted-raw',
            (r) => {
                r.modelState.raw.inputEvents[0].isTrusted = false;
            },
        ],
        [
            'client-css-mismatch',
            (r) => {
                r.modelState.raw.inputEvents[1].clientX += 5;
            },
        ],
        [
            'late-session',
            (r) => {
                r.modelState.raw.inputEvents[1].session += 1;
            },
        ],
        [
            'future-measurement',
            (r) => {
                r.modelState.raw.measuredAtStep = r.submittedFrame.step;
            },
        ],
        [
            'uploaded-NaN',
            (r) => {
                r.modelState.raw.uploads.cut.positions[0] = NaN;
            },
        ],
        [
            'camera-infinite',
            (r) => {
                r.modelState.raw.camera.viewProjection[0] = Infinity;
            },
        ],
        [
            'cut-displaced',
            (r) => {
                r.modelState.raw.uploads.cut.nodeTranslation[0] += 3;
            },
        ],
        [
            'missing-world-hits',
            (r) => {
                delete r.modelState.raw.worldHits;
            },
        ],
        [
            'PNG-identity',
            (r) => {
                r.pngSha256 = 'e'.repeat(64);
            },
        ],
        [
            'wrong-browser',
            (r) => {
                r.browser = 'unknown 0';
            },
        ],
        [
            'NOT_RUN-is-not-measured',
            (r) => {
                r.result = 'NOT_RUN';
            },
        ],
        [
            'step-without-draw',
            (r) => {
                r.submittedFrame.afterDraw = false;
            },
        ],
        [
            'wrong-input-frame',
            (r) => {
                r.submittedFrame.inputSequence += 1;
            },
        ],
        [
            'hidden-by-blocked-flag',
            (r) => {
                r.modelState.blocked = 'invented environment restriction';
            },
        ],
    ];
    for (const [name, mutate] of mutations) {
        const r = clone(base.cases[0]);
        mutate(r);
        const checked = checkCase(r, base.cases[0].caseId, report.runId, ctx);
        results.push({ name, rejected: !checked.ok, errors: checked.errors });
    }
    const normalMutations = [
        [
            'normal-empty-events',
            (r) => {
                r.normals[0].events = [];
            },
        ],
        [
            'normal-stopped-clock',
            (r) => {
                r.normals[0].running.clock.totalFrames = r.normals[0].before.clock.totalFrames;
            },
        ],
        [
            'normal-reset-leak',
            (r) => {
                r.normals[0].resets[0].after.modelState.ownedRefCount += 1;
            },
        ],
        [
            'normal-refs-inflated',
            (r) => {
                r.normals[0].cleanup.refs[0].after = 9;
            },
        ],
        [
            'normal-listeners-not-removed',
            (r) => {
                r.normals[0].cleanup.controlsDetached = false;
            },
        ],
        [
            'normal-non-idempotent',
            (r) => {
                r.normals[0].releaseIdentity = false;
            },
        ],
        [
            'normal-missing-PNG',
            (r) => {
                r.normals[0].visible.pngPath = '/missing-ier-geometry.png';
            },
        ],
        [
            'normal-missing-route',
            (r) => {
                r.normals.pop();
            },
        ],
        [
            'normal-error',
            (r) => {
                r.normals[0].pageErrors.push('injected');
            },
        ],
    ];
    for (const [name, mutate] of normalMutations) {
        const r = clone(report);
        mutate(r);
        const checked = validateNormals(r);
        results.push({ name, rejected: !checked.ok, errors: checked.errors });
    }
    const reportMutations = [
        [
            'duplicate-matrix-row',
            (r) => {
                r.rows.push(clone(r.rows[0]));
            },
        ],
        [
            'SDK-drift',
            (r) => {
                r.fingerprints[INPUTS[0]].sha256 = '0'.repeat(64);
            },
        ],
        [
            'ribbon-no-motion',
            (r) => {
                r.ribbons[0].after = clone(r.ribbons[0].before);
            },
        ],
        [
            'ribbon-missing-coverage',
            (r) => {
                r.ribbons.pop();
            },
        ],
        [
            'reset-old-ref-inflated',
            (r) => {
                r.lifecycles[0].resetRounds[0].refs[0].after = 9;
            },
        ],
        [
            'lifecycle-non-idempotent',
            (r) => {
                r.lifecycles[0].idempotent = false;
            },
        ],
    ];
    for (const [name, mutate] of reportMutations) {
        const r = clone(report);
        mutate(r);
        const checked = validate(r);
        const invalid = checked.errors.filter((e) => !e.includes(': honest FAIL recorded ('));
        results.push({ name, rejected: invalid.length > 0, errors: invalid });
    }
    return {
        ok: baseline.validRecordedObservations && results.every((r) => r.rejected),
        baseline,
        acceptedActualCases: report.rows.length,
        acceptedNormalRoutes: report.normals?.length,
        rejectedMutations: results.filter((r) => r.rejected).length,
        mutations: results,
        browserRunsAdded: 0,
    };
}
module.exports = { audit };
if (require.main === module) {
    const arg = process.argv.find((a) => a.startsWith('--report='));
    if (!arg) throw new Error('--report=<actual.json> required');
    const file = path.resolve(ROOT, arg.slice(9));
    const bytes = fs.readFileSync(file);
    const result = {
        schemaVersion: 'ier-geometry-audit/1',
        executionChannel: 'Lead',
        command: [process.execPath, ...process.argv.slice(1)],
        cwd: ROOT,
        report: {
            path: path.relative(ROOT, file).replace(/\\/g, '/'),
            bytes: bytes.length,
            sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        },
        ...audit(
            JSON.parse(bytes),
            (() => {
                const choice = process.argv.find((a) => a.startsWith('--browser='))?.slice(10);
                return choice && choice !== 'all' ? [choice] : undefined;
            })(),
        ),
    };
    const out = process.argv.find((a) => a.startsWith('--out='));
    if (out) {
        const target = path.resolve(ROOT, out.slice(6));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    }
    console.log(
        JSON.stringify({
            ok: result.ok,
            baseline: result.baseline,
            rejectedMutations: result.rejectedMutations,
            browserRunsAdded: 0,
        }),
    );
    process.exitCode = result.ok ? 0 : 1;
}
