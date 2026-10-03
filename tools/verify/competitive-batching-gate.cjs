const fs = require('fs');
const path = require('path');
const { SCOPE, ROOT, validateEvidence } = require('./competitive-batching-evidence.cjs');
function run(args = process.argv.slice(2)) {
    const value = (name, fallback) => {
        const arg = args.find((a) => a.startsWith(`--${name}=`));
        return arg ? arg.slice(name.length + 3) : fallback;
    };
    const evidencePath = path.resolve(ROOT, value('evidence', `docs/evidence/recipes/${SCOPE}/browser.json`));
    const out = path.resolve(ROOT, value('out', `docs/evidence/recipes/${SCOPE}/review-gate.json`));
    let evidence;
    let errors;
    try {
        evidence = JSON.parse(fs.readFileSync(evidencePath));
        errors = validateEvidence(evidence);
    } catch (error) {
        errors = [String(error.message)];
    }
    const report = {
        scope: SCOPE,
        schema: 'competitive-batching-review-v1',
        measuredAt: new Date().toISOString(),
        completed: evidence?.completed === true,
        status: errors.length ? 'FAIL' : 'PASS',
        evidence: {
            path: path.relative(ROOT, evidencePath).replace(/\\/g, '/'),
            runId: evidence?.runId || null,
            recipes: evidence?.recipes || [],
            records: evidence?.records?.length || 0,
        },
        errors,
        legacy30: 'NOT_RUN; this scoped result does not validate Golden/Catalog/legacy thirty-recipe evidence',
    };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = errors.length ? 1 : 0;
    return report;
}
module.exports = { run };
