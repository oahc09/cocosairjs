'use strict';
const fs = require('fs'),
    path = require('path'),
    crypto = require('crypto'),
    zlib = require('zlib'),
    { checkRow, checkReport, INPUTS } = require('./interactive-color-compare-browser.cjs'),
    ROOT = path.resolve(__dirname, '../..');
function readReport(file) {
    const bytes = fs.readFileSync(file);
    return JSON.parse((file.endsWith('.gz') ? zlib.gunzipSync(bytes) : bytes).toString('utf8'));
}
function audit(r) {
    const baseline = checkReport(r, { selected: true }),
        tests = [];
    if (!baseline.selectedScopePassed) throw Error('positive current baseline required');
    for (const [name, mutate] of Object.entries({
        truncatedPlain: (c) => c.states[0].bytes.pop(),
        nonFinitePlain: (c) => (c.states[0].bytes[0] = NaN),
        truncatedProjection: (c) => c.states[1].projection.pop(),
        nonFiniteProjection: (c) => (c.states[1].projection[0] = Infinity),
        allBlack: (c) => c.states[0].bytes.fill(0),
        clip: (c) => (c.states[1].bytes = c.states[0].bytes),
        alpha: (c) => (c.states[3].bytes = c.states[0].bytes),
        blend: (c) => (c.states[3].material[0].blendTargets[0].blend = false),
        depth: (c) => (c.states[4].material[0].depthWrite = true),
        refs: (c) => (c.release.receipt.refs[0].after = 9),
        matrix: (c) => (c.states[1].projection = c.states[2].projection),
        png: (c) => (c.states[0].png.sha256 = '0'.repeat(64)),
        nan: (c) => (c.states[1].bytes[0] = NaN),
        errors: (c) => c.pageErrors.push('uncaught error'),
    })) {
        const c = structuredClone(r.rows[0]);
        mutate(c);
        tests.push({ name, rejected: !checkRow(c).pass });
    }
    for (const [name, mutate] of Object.entries({
        missingEngine: (c) => (c.engines = []),
        duplicateEngine: (c) => c.engines.push(c.engines[0]),
        unknownEngine: (c) => (c.engines = ['unknown']),
        missingRow: (c) => c.rows.pop(),
        design: (c) => (c.design.clipEdgeChangedPixelBudget = 99999),
        identity: (c) => (c.fingerprints[0] = c.fingerprints[1]),
    })) {
        const c = structuredClone(r);
        mutate(c);
        tests.push({ name, rejected: !checkReport(c, { selected: true }).selectedScopePassed });
    }
    if (r.engines.length < 3) tests.push({ name: 'partial-not-full', rejected: !checkReport(r).scopePassed });
    return { baseline, fullScope: checkReport(r), tests, browserRunsAdded: 0, ok: tests.every((t) => t.rejected) };
}
module.exports = { audit, checkReport, readReport };
if (require.main === module) {
    const arg = (n) => process.argv.find((x) => x.startsWith('--' + n + '='))?.slice(n.length + 3),
        r = audit(readReport(arg('report')));
    fs.writeFileSync(arg('out'), JSON.stringify(r, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify(r));
    process.exitCode = r.ok ? 0 : 1;
}
