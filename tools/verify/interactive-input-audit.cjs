'use strict';
const fs = require('fs'),
    path = require('path');
const {
    checkReport,
    checkSelectedReport,
    checkOperation,
    checkSupplementary,
} = require('./interactive-input-browser.cjs');
const clone = (x) => structuredClone(x);
function audit(report, selectedEngines = null) {
    const validate = (r) => (selectedEngines === null ? checkReport(r) : checkSelectedReport(r, selectedEngines));
    const baseline = validate(report),
        tests = [],
        op = report.rows[0]?.operations[0];
    if (selectedEngines !== null && !baseline.valid)
        throw Error('selected baseline rejected: ' + baseline.errors.join('; '));
    const mutations = {
        double: (r) => r.after.activations++,
        untrusted: (r) => (r.after.events.find((e) => e.type === 'activate').isTrusted = false),
        touchAlias: (r) => (r.kind = 'button-touch'),
        missingSubmission: (r) => (r.after.submitted.timestamp = 'UNKNOWN'),
        late: (r) => (r.after.submitted.submittedSequence = 0),
        future: (r) => (r.after.submitted.submittedSequence += 1),
        frame: (r) => (r.after.frame = r.before.frame),
        pose: (r) => (r.after.actor.x += 1),
        hiddenMesh: (r) => (r.after.actor.meshBound = false),
        pngSha: (r) => (r.png.sha256 = '0'.repeat(64)),
        pngMissing: (r) => (r.png.path += '-missing'),
        nan: (r) => (r.after.layout.dpr = NaN),
        notRun: (r) => (r.result = 'NOT_RUN'),
        contact: (r) => (r.after.activePointers = [1]),
        generation: (r) => r.after.generation++,
    };
    if (!checkOperation(op).ok) throw Error('baseline measured operation rejected');
    for (const [name, mutate] of Object.entries(mutations)) {
        const r = clone(op);
        mutate(r);
        tests.push({ name, rejected: !checkOperation(r).ok });
    }
    const cases = {
        keyboard: (r) => r.stages.find((x) => x.name === 'after').snapshot.activations--,
        rewrite: (r) => (r.stages.find((x) => x.name === 'rewriting').snapshot.labelIdentityStable = true),
        hover: (r) => (r.stages.find((x) => x.name === 'after').snapshot.hoverMoves = 0),
        reset: (r) => (r.stages.find((x) => x.name === 'retired').snapshot.activePointers = [1]),
        'range-cancel': (r) => r.stages.find((x) => x.name === 'late').snapshot.rangeValue++,
        wheel: (r) => (r.stages.find((x) => x.name === 'vertical').snapshot.scrollY += 120),
        multitouch: (r) => (r.stages.find((x) => x.name === 'held').snapshot.activePointers = [1]),
        cancel: (r) => r.stages.find((x) => x.name === 'fresh').snapshot.dragCommits--,
    };
    for (const [kind, mutate] of Object.entries(cases)) {
        if (selectedEngines !== null && report.rows[0].engine !== 'chromium' && ['multitouch', 'cancel'].includes(kind))
            continue;
        const source = report.rows[0].supplementary.find((x) => x.kind === kind);
        if (!checkSupplementary(source).ok) throw Error('baseline supplementary rejected ' + kind);
        const r = clone(source);
        mutate(r);
        tests.push({ name: kind, rejected: !checkSupplementary(r).ok });
    }
    // Coverage and identity mutations must introduce an error beyond the recorded PAL diagnostic.
    const reportMutations = {
        missingRow: (r) => r.rows.pop(),
        missingAction: (r) => r.rows[1].operations.pop(),
        leakedReference: (r) => (r.rows[1].release.receipt.refs = [{ before: 1, after: 9 }]),
        sdkInHtml: (r) => r.rows[1].sdkRequests.push('/build/cocosair.module.js'),
        sourceDrift: (r) => (r.fingerprints[0].sha256 = '0'.repeat(64)),
        duplicateControl: (r) => (r.rows[1].control = r.rows[0].control),
        wrongEngine: (r) => (r.rows[1].engine = 'unknown'),
    };
    const missing = report.rows
        .flatMap((row, index) => row.notRun.map((item) => ({ index, caseId: item.caseId })))
        .find((x) => x.caseId === 'multitouch' || x.caseId === 'blur' || x.caseId === 'hidden');
    if (missing)
        reportMutations.lostNotRun = (r) =>
            (r.rows[missing.index].notRun = r.rows[missing.index].notRun.filter((x) => x.caseId !== missing.caseId));
    for (const kind of ['blur', 'hidden'])
        reportMutations['forged-' + kind] = (r) => {
            r.rows[0].notRun = r.rows[0].notRun.filter((x) => x.caseId !== kind);
            r.rows[0].supplementary = r.rows[0].supplementary.filter((x) => x.kind !== kind);
            r.rows[0].supplementary.push({ kind, stages: [] });
        };
    for (const [name, mutate] of Object.entries(reportMutations)) {
        const r = clone(report);
        mutate(r);
        const v = validate(r);
        tests.push({ name, rejected: v.errors.some((e) => !baseline.errors.includes(e)) });
    }

    return {
        schemaVersion: 'ier-input-audit/1',
        baseline,
        selectedEngines,
        acceptedMeasuredOperation: true,
        acceptedSupplementaryCases: tests.filter((t) => Object.keys(cases).includes(t.name)).length,
        browserRunsAdded: 0,
        tests,
        ok: tests.every((t) => t.rejected),
        limitations: [
            'Selected audit validity does not establish full scope: all observed errors and NOT_RUN remain, never compensated by mutation rejection',
        ],
    };
}
module.exports = { audit };
if (require.main === module) {
    const arg = (n) =>
        process.argv
            .find((x) => x.startsWith('--' + n + '='))
            ?.split('=')
            .slice(1)
            .join('=');
    const file = arg('report'),
        out = arg('out');
    if (!file || !out) throw Error('--report and --out required');
    const browser = arg('browser');
    if (browser !== undefined && !['all', 'chromium', 'firefox', 'webkit'].includes(browser))
        throw Error('unknown browser selection');
    const result = audit(JSON.parse(fs.readFileSync(file)), browser && browser !== 'all' ? [browser] : null);
    fs.writeFileSync(path.resolve(out), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(
        JSON.stringify({
            ok: result.ok,
            rejected: result.tests.filter((x) => x.rejected).length,
            total: result.tests.length,
            baselineErrors: result.baseline.errors.length,
        }),
    );
    process.exitCode = result.ok ? 0 : 1;
}
