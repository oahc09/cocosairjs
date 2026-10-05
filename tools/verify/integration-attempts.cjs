// Read-only aggregation: shared integration, applications and measurements remain distinct.
const categories = ['shared-integration', 'application-development', 'browser-verification', 'coordination'];
function aggregateAttempts(records, expectedProjects) {
    if (!Array.isArray(records)) throw Error('attempt records must be an array');
    if (!records.length) throw Error('no attempt records; missing history is not a measured zero');
    const ids = new Set(),
        integrations = new Set(),
        projects = new Set();
    let knownCalls = 0,
        unknownCalls = 0;
    const staticSites = new Set(),
        cases = new Set(),
        executions = new Set();
    let unknownStatic = 0,
        unknownCases = 0;
    const counts = Object.fromEntries(categories.map((k) => [k, 0]));
    for (const r of records) {
        if (!r || !categories.includes(r.category) || !['PASS', 'FAIL', 'UNKNOWN'].includes(r.status))
            throw Error('invalid category/status');
        for (const field of ['project', 'batch', 'attemptId', 'integrationId', 'reason']) {
            if (typeof r[field] !== 'string' || !r[field].trim()) throw Error('missing provenance: ' + field);
        }
        if (ids.has(r.attemptId)) throw Error('duplicate attemptId');
        ids.add(r.attemptId);
        if (!Number.isFinite(Date.parse(r.measuredAt))) throw Error('missing measurement time');
        for (const field of ['source', 'harness', 'runtime'])
            if (
                !(r.status === 'UNKNOWN' && r.fingerprints?.[field] === null) &&
                !/^[a-f0-9]{64}$/.test(r.fingerprints?.[field])
            )
                throw Error('missing fingerprint: ' + field);
        if (r.status === 'UNKNOWN' && r.calls !== null)
            throw Error('unknown history cannot be converted to zero calls');
        if (r.calls === null) unknownCalls++;
        else if (Number.isSafeInteger(r.calls) && r.calls >= 0) knownCalls += r.calls;
        else throw Error('calls must be a nonnegative integer or null');
        for (const field of ['staticCallSites', 'executedCases']) {
            if (r.status === 'UNKNOWN' && r[field] === null) continue;
            if (!Array.isArray(r[field]) || r[field].some((v) => typeof v !== 'string' || !v))
                throw Error('separate static/runtime inventories required');
        }
        if (r.status === 'UNKNOWN' && r.executedCases !== null)
            throw Error('unknown execution inventory must stay null');
        if (r.staticCallSites === null) unknownStatic++;
        else {
            if (r.staticCallSites.length && !r.fingerprints.source) throw Error('static sites require source identity');
            for (const site of r.staticCallSites) staticSites.add(r.fingerprints.source + ':' + site);
        }
        if (r.executedCases === null) unknownCases++;
        else
            for (const id of r.executedCases) {
                cases.add(r.project + ':' + id);
                executions.add(r.attemptId + ':' + id);
            }
        integrations.add(r.integrationId);
        projects.add(r.project);
        counts[r.category]++;
    }
    if (expectedProjects !== undefined) {
        if (
            !Array.isArray(expectedProjects) ||
            !expectedProjects.length ||
            expectedProjects.some((p) => typeof p !== 'string' || !p) ||
            new Set(expectedProjects).size !== expectedProjects.length
        )
            throw Error('expected projects must be a nonempty unique list');
        const missing = expectedProjects.filter((p) => !projects.has(p));
        if (missing.length)
            throw Error('missing project history: ' + missing.join(',') + '; add explicit UNKNOWN records');
        if ([...projects].some((p) => !expectedProjects.includes(p))) throw Error('project outside declared scope');
    }
    return {
        attempts: ids.size,
        projects: projects.size,
        sharedIntegrations: integrations.size,
        projectScopeVerified: expectedProjects !== undefined,
        categories: counts,
        calls: { knownTotal: knownCalls, unknownAttempts: unknownCalls, complete: unknownCalls === 0 },
        staticCallSites: {
            knownDistinct: staticSites.size,
            unknownInventories: unknownStatic,
            complete: unknownStatic === 0,
        },
        executedCases: {
            knownDistinct: cases.size,
            knownExecutions: executions.size,
            unknownInventories: unknownCases,
            complete: unknownCases === 0,
        },
        // Deliberately no inferred first-pass rate, cost average or static+runtime combined total.
        evidenceOnly: true,
    };
}
if (require.main === module) {
    const file = process.argv[2];
    if (!file) {
        console.error('Usage: node tools/verify/integration-attempts.cjs <attempts.json>');
        process.exitCode = 1;
    } else
        try {
            console.log(
                JSON.stringify(
                    aggregateAttempts(
                        JSON.parse(require('node:fs').readFileSync(file, 'utf8')),
                        process.argv.find((v) => v.startsWith('--expected='))
                            ? JSON.parse(
                                  require('node:fs').readFileSync(
                                      process.argv.find((v) => v.startsWith('--expected=')).slice(11),
                                      'utf8',
                                  ),
                              )
                            : undefined,
                    ),
                    null,
                    2,
                ),
            );
        } catch (error) {
            console.error(error.message);
            process.exitCode = 1;
        }
}
module.exports = { aggregateAttempts };
