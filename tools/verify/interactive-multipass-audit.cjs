'use strict';
// Lead: independent mutations of actual collected rows. No browser/build/install.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateReport, validateSelectedReport } = require('./interactive-multipass-browser.cjs');

function auditReport(report) {
    const mutations = {
        'missing-engine': (r) => {
            r.engines = [];
        },
        'duplicate-engine': (r) => {
            r.engines.push(r.engines[0]);
        },
        'unknown-engine': (r) => {
            r.engines = ['unknown'];
        },
        'NOT_RUN-case': (r) => {
            r.rows[0].cases[0].result = 'NOT_RUN';
        },
        'wrong-browser': (r) => {
            r.rows[0].cases[0].browser = 'firefox 0.0';
        },
        'wrong-format': (r) => {
            r.rows[0].cases[0].modelState.colorFormat = 'rgba16f';
        },
        'future-input': (r) => {
            r.rows[0].cases[0].submittedFrame.inputSequence = 99999;
        },
        'missing-draw': (r) => {
            r.rows[0].cases[0].submittedFrame.afterDraw = false;
        },
        'skip-required-full-checks': (r) => {
            r.rows[0].full = false;
            delete r.rows[0].cleanup;
            delete r.rows[0].negatives;
            delete r.rows[0].lifecycle;
        },
        'normal-error': (r) => {
            r.normal[0].error = 'unexpected failure after capture';
        },
        'normal-untrusted': (r) => {
            r.normal[0].receivedEvents = [];
        },
        'all-matrix-skipped': (r) => {
            r.rows[0].matrix.combos.forEach((c) => {
                c.notRun = true;
                c.reason = 'unavailable';
            });
        },
        'duplicate-matrix': (r) => {
            r.rows[0].matrix.combos = Array(4).fill(r.rows[0].matrix.combos[0]);
        },
        'delete-reset': (r) => {
            r.rows[0].cases.pop();
        },
        'zero-std140-error': (r) => {
            r.rows
                .find((x) => x.mode === 'native')
                .negatives.cases.find((x) => x.kind === 'std140-layout').wrongGlError = 0;
        },
        'nonadvancing-generation': (r) => {
            r.rows[0].lifecycle.rows.forEach((x) => {
                x.generationAfterResize = x.generationAfterCreate;
            });
        },
        'undestroyed-native': (r) => {
            r.rows
                .find((x) => x.mode === 'native')
                .lifecycle.rows.forEach((x) => {
                    x.destroyed = false;
                });
        },
        'page-error': (r) => {
            r.rows[0].pageErrors.push('unexpected');
        },
        'ref-retained': (r) => {
            r.rows[0].cleanup.refs[0].after = 1;
        },
    };
    const baseline = validateSelectedReport(report);
    if (!baseline.ok) throw Error('positive selected browser matrix required');
    const results = Object.entries(mutations).map(([name, mutate]) => {
        const clone = structuredClone(report);
        mutate(clone);
        const validation = validateSelectedReport(clone);
        return { name, rejected: !validation.ok, errors: validation.errors };
    });
    return {
        baseline,
        results,
        rejected: results.filter((x) => x.rejected).length,
        total: results.length,
        browserRunsAdded: 0,
        ok: baseline.ok && results.every((x) => x.rejected),
    };
}

function main() {
    const reportArg = process.argv.slice(2).find((a) => a.startsWith('--report='));
    if (!reportArg) throw new Error('explicit --report=<actual.json> required');
    const reportPath = path.resolve(reportArg.slice(9));
    const bytes = fs.readFileSync(reportPath);
    const result = {
        schemaVersion: 'ier-multipass-audit/1',
        executionChannel: 'Lead',
        reportPath,
        reportSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        auditedAt: new Date().toISOString(),
        ...auditReport(JSON.parse(bytes)),
    };
    const outArg = process.argv.slice(2).find((a) => a.startsWith('--out='));
    if (outArg) fs.writeFileSync(path.resolve(outArg.slice(6)), JSON.stringify(result, null, 2), { flag: 'wx' });
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = result.ok ? 0 : 1;
}
module.exports = { auditReport };
if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
