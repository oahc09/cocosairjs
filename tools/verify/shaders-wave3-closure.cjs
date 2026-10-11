'use strict';
// Stronger Wave3 closure without rewriting the verifier pinned by E07's historical gate.
const fs = require('node:fs');
const path = require('node:path');
const B = require('./shaders-wave3-gate.cjs');
const TRAIL = require('./shaders-cursor-trail-gate.cjs');
const GLASS = require('./shaders-glass-gate.cjs');
const ROOT = path.resolve(__dirname, '../..');
const fp = GLASS.fingerprint;
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(ROOT, file), 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const LEAVES = [
    'docs/evidence/shaders-absorption/e07-liquid-metal-current-gate.json',
    'docs/evidence/shaders-absorption/e08-cursor-trail-current-gate-r2.json',
    'docs/evidence/shaders-absorption/e09-glass-current-gate.json',
];
function validateWaveReport(report) {
    const errors = [];
    try {
        errors.push(...B.validateWaveReport(report).errors);
        if (
            !same(
                report.effects?.map((f) => f.path),
                LEAVES,
            )
        )
            errors.push('exact current leaf gates required');
        const gates = LEAVES.map(read);
        errors.push(...TRAIL.validateGate(gates[1]).errors);
        errors.push(...GLASS.validateGate(gates[2]).errors);
        const sources = [
            'tools/verify/shaders-wave3-closure.cjs',
            'tools/verify/shaders-wave3-gate.cjs',
            'tools/verify/shaders-cursor-trail-gate.cjs',
            'tools/verify/shaders-glass-gate.cjs',
        ].map(fp);
        if (!same(report.closureInputs, sources)) errors.push('closure implementation identity drift');
        const screenshots = gates.flatMap((g) => g.gates.Visual.screenshots);
        if (!same(report.screenshots, screenshots) || report.screenshotCount !== screenshots.length)
            errors.push('exact PNG scope');
        const windows = gates.map((g) => g.bindings.map((b) => read(b.osReceipt.path))).flat();
        const timed = windows.filter((w) => w.command.includes('--phase=performance'));
        for (let i = 0; i < timed.length; i++)
            for (let j = i + 1; j < timed.length; j++) {
                const a = timed[i],
                    b = timed[j];
                if (!(
                    Date.parse(a.endedAt) <= Date.parse(b.startedAt) || Date.parse(b.endedAt) <= Date.parse(a.startedAt)
                ))
                    errors.push('overlapping timed windows');
            }
        if (report.independentGalleryGate !== 'NOT_RUN' || report.agentGate !== 'NOT_RUN')
            errors.push('independent acceptance scope');
    } catch (error) {
        errors.push('wave closure: ' + error.message);
    }
    return { ok: errors.length === 0, errors };
}
module.exports = { validateWaveReport, LEAVES };
if (require.main === module) {
    const arg = process.argv.find((a) => a.startsWith('--verify='));
    const result = arg ? validateWaveReport(read(arg.slice(9))) : { ok: false, errors: ['--verify required'] };
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
}
