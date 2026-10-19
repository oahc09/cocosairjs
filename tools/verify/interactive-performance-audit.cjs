'use strict';
const fs = require('fs'),
    path = require('path'),
    crypto = require('crypto'),
    { PNG } = require('pngjs'),
    { stats, DESIGN, INPUTS, PILOT_BUDGET } = require('./interactive-performance.cjs');
const ROOT = path.resolve(__dirname, '../..');
function checkReport(r) {
    const errors = [],
        reject = (m) => errors.push(m);
    try {
        if (
            r.schemaVersion !== 'ier-performance-pilot/2' ||
            r.result !== 'LIMITED' ||
            r.completed !== false ||
            r.subset !== true ||
            JSON.stringify(r.design) !== JSON.stringify(DESIGN)
        )
            reject('pilot scope/design');
        const keys = DESIGN.dprs.flatMap((d) =>
            DESIGN.workloads.flatMap((w) =>
                DESIGN.screenshots.flatMap((s) => [0, 1, 2].map((n) => [d, w, s, n].join('/'))),
            ),
        );
        if (
            r.rows?.length !== 36 ||
            new Set(r.rows.map((x) => [x.dpr, x.workload, x.screenshots, x.rep].join('/'))).size !== 36 ||
            keys.some((k) => !r.rows.some((x) => [x.dpr, x.workload, x.screenshots, x.rep].join('/') === k))
        )
            reject('36 unique pilot windows');
        for (const row of r.rows || []) {
            const id = [row.dpr, row.workload, row.screenshots, row.rep].join('/');
            if (
                row.pageErrors?.length !== 0 ||
                row.consoleErrors?.length !== 0 ||
                !Number.isFinite(row.observedWindowMs) ||
                row.observedWindowMs < DESIGN.windowMs ||
                row.raw?.length < 6
            )
                reject(id + ' execution');
            if (!row.renderer?.renderer || row.renderer.gpuTime !== 'unavailable')
                reject(id + ' renderer/gpu attribution');
            for (let i = 0; i < (row.raw?.length || 0); i++) {
                const x = row.raw[i];
                if (
                    (i === 0 && x.interval !== null) ||
                    !Number.isFinite(x.timestamp) ||
                    !Number.isSafeInteger(x.nativeFrame) ||
                    x.nativeFrame <= 0 ||
                    !Number.isFinite(x.updateMs) ||
                    x.updateMs < 0 ||
                    !Number.isFinite(x.submitMs) ||
                    x.submitMs < 0 ||
                    (i > 0 &&
                        (x.timestamp <= row.raw[i - 1].timestamp ||
                            x.nativeFrame <= row.raw[i - 1].nativeFrame ||
                            Math.abs(x.interval - (x.timestamp - row.raw[i - 1].timestamp)) > 1e-6))
                )
                    reject(id + ' raw callback sequence');
            }
            if (
                !Array.isArray(row.toolSamples) ||
                row.toolSamples.some(
                    (x) => x.operation !== 'page.screenshot' || !Number.isFinite(x.wallMs) || x.wallMs < 0,
                )
            )
                reject(id + ' screenshot tool attribution');
            const actual = {
                frameCallbackMs: stats(row.raw.map((x) => x.interval).filter((x) => x !== null)),
                cpuUpdateMarkersMs: stats(row.raw.map((x) => x.updateMs)),
                cpuSubmitMarkersMs: stats(row.raw.map((x) => x.submitMs)),
                screenshotWallMs: row.toolSamples.length ? stats(row.toolSamples.map((x) => x.wallMs)) : null,
            };
            if (JSON.stringify(actual) !== JSON.stringify(row.statistics)) reject(id + ' raw statistics mismatch');
            if (
                row.screenshots
                    ? row.captures?.length < 4 || row.toolSamples?.length !== row.captures?.length
                    : row.captures?.length !== 0
            )
                reject(id + ' screenshot contrast');
            for (const f of row.captures || []) verify(f, true);
            if (row.release?.refs?.length !== 3 || row.release.refs.some((x) => x.before !== 1 || x.after !== 0))
                reject(id + ' release');
        }
        if (
            r.fingerprints?.length !== INPUTS.length ||
            new Set(r.fingerprints?.map((f) => f.path)).size !== INPUTS.length ||
            INPUTS.some((p) => !r.fingerprints?.some((f) => f.path === p))
        )
            reject('exact input closure');
        for (const p of INPUTS) {
            const f = r.fingerprints?.find((f) => f.path === p);
            if (f) verify(f);
            else reject('missing input ' + p);
        }
        if (JSON.stringify(r.budget) !== JSON.stringify(PILOT_BUDGET)) reject('unmeasured pilot budget');
    } catch (e) {
        reject(String(e.message || e));
    }
    return { measurementValid: errors.length === 0, result: 'LIMITED', deviceAcceptance: 'NOT_RUN', errors };
}
function verify(f, png = false) {
    const bytes = fs.readFileSync(path.resolve(ROOT, f.path));
    if (bytes.length !== f.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== f.sha256)
        throw Error('file drift ' + f.path);
    if (png) PNG.sync.read(bytes);
}
module.exports = { checkReport };
if (require.main === module) {
    const arg = (n) => process.argv.find((x) => x.startsWith('--' + n + '='))?.slice(n.length + 3),
        r = JSON.parse(fs.readFileSync(arg('report'))),
        baseline = checkReport(r),
        tests = [];
    for (const [name, mutate] of Object.entries({
        statistics: (c) => (c.rows[0].statistics.frameCallbackMs.p95 = 0),
        nan: (c) => (c.rows[0].raw[1].interval = NaN),
        frame: (c) => (c.rows[0].raw[1].nativeFrame = c.rows[0].raw[0].nativeFrame),
        missing: (c) => c.rows.pop(),
        duplicate: (c) => (c.rows[1] = c.rows[0]),
        device: (c) => (c.budget.result = 'PASS'),
        identity: (c) => (c.fingerprints[0].sha256 = '0'.repeat(64)),
        duplicateIdentity: (c) => (c.fingerprints[0] = c.fingerprints[1]),
        budget: (c) => (c.budget.frameTimeBudget = '16.67ms alleged'),
        refs: (c) => (c.rows[0].release.refs[0].after = 1),
    })) {
        const c = structuredClone(r);
        mutate(c);
        tests.push({ name, rejected: !checkReport(c).measurementValid });
    }
    const out = {
        baseline,
        tests,
        browserRunsAdded: 0,
        ok: baseline.measurementValid && tests.every((t) => t.rejected),
    };
    fs.writeFileSync(arg('out'), JSON.stringify(out, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify(out));
    process.exitCode = out.ok ? 0 : 1;
}
