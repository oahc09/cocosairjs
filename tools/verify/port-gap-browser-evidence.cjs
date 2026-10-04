/* PG-34: normalize an executed browser subset into port-gap-evidence/1.
 * Reads only: never starts a browser, manufactures a run, or promotes a subset
 * to a complete gate. --exit-code is the observed collector process exit code.
 * --input=<native.json> --log=<raw.log> --gate=EG2|EG3|EG4
 * --type=BROWSER_INPUT_PASS|BROWSER_RENDER_PASS --exit-code=0 --out=<new.json>
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validatePortGapReport } = require('./port-gap-evidence-schema.cjs');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const absent = (reason, status) => ({ present: false, status, reason });

function normalizeBrowserEvidence(options) {
    const root = path.resolve(options.root || path.join(__dirname, '../..'));
    const resolve = (file) => path.resolve(root, file);
    const input = JSON.parse(fs.readFileSync(resolve(options.input), 'utf8'));
    if (!Number.isInteger(options.exitCode)) throw new Error('Observed integer exitCode is required');
    if (!Array.isArray(input.command) || !input.command.length || !input.startedAt || !input.endedAt || !input.cwd) {
        throw new Error('Collector must record its actual command, cwd and execution times');
    }
    const browserRows = input.results || input.records;
    if (!Array.isArray(browserRows) || browserRows.length === 0) throw new Error('No executed browser rows');
    const recipeScope = input.schemaVersion === 'air-port-recipes/2';
    let rows = browserRows;
    if (recipeScope) {
        const { IDS, checkRecipe } = require('./air-port-recipes-browser.cjs');
        if (JSON.stringify(input.scope) !== JSON.stringify(IDS)) throw new Error('Recipe scope does not match the collector contract');
        if (new Set(browserRows.map((row) => row.engine)).size !== browserRows.length) throw new Error('Duplicate browser execution');
        rows = browserRows.flatMap((browser) => {
            if (!Array.isArray(browser.recipes) || JSON.stringify(browser.recipes.map((row) => row.id)) !== JSON.stringify(IDS)) {
                throw new Error('Missing, reordered or duplicate recipe rows');
            }
            const expected = browser.recipes.some((row) => row.status === 'FAIL') ? 'FAIL' :
                browser.recipes.some((row) => row.status === 'NOT_RUN') ? 'NOT_RUN' : 'PASS';
            if (browser.status !== expected) throw new Error('Browser status disagrees with recipe executions');
            return browser.recipes.map((row) => {
                if (row.status === 'PASS' || row.status === 'NOT_RUN') {
                    checkRecipe(row.id, row.phases);
                    if ((row.status === 'NOT_RUN') !== !!row.phases.run.unavailableReason) throw new Error('Recipe status and unavailable reason disagree');
                    if (row.releaseIdentity !== true || !row.terminal || Object.keys(row.terminal).length !== 3 ||
                        ['construct', 'run', 'pauseRestart'].some((key) => row.terminal[key] !== 'RECIPE_DISPOSED')) {
                        throw new Error('Recipe terminal contract missing');
                    }
                }
                return { ...row, recipeId: row.id, engine: browser.engine, version: browser.version,
                    reason: row.phases?.run?.unavailableReason };
            });
        });
    }
    const statuses = rows.map((row) => row.status || row.result);
    if (statuses.some((status) => !['PASS', 'FAIL', 'NOT_RUN'].includes(status))) throw new Error('Unknown browser execution status');
    if (recipeScope && input.scopePassed !== statuses.every((status) => status === 'PASS')) throw new Error('Recipe scope verdict disagrees with executed rows');
    if (rows.some((row) => (row.status || row.result) !== 'NOT_RUN' && !(row.version || row.browserVersion))) {
        throw new Error('Executed browser rows require actual browser versions');
    }
    const passed = input.scopePassed === true && statuses.every((status) => status === 'PASS');
    if ((options.exitCode === 0) !== passed) throw new Error('Observed exit code and collector scope verdict disagree');
    if (!fs.existsSync(resolve(options.log))) throw new Error('Original collector log is missing');
    const entries = Object.entries(input.fingerprints || {});
    if (!entries.length) throw new Error('Collector fingerprints are required');
    for (const [file, expected] of entries) {
        if (!/^[0-9a-f]{64}$/.test(expected) || hash(resolve(file)) !== expected) throw new Error('Evidence drift: ' + file);
    }
    const runtime = entries.find(([file]) => file === 'build/cocosair.module.js') ||
        entries.find(([file]) => /(?:^|\/)cocosair\.module\.js$/.test(file));
    if (!runtime) throw new Error('No full runtime candidate fingerprint');
    const firstFingerprint = (predicate, reason, missingStatus = 'NOT_RUN') => {
        const entry = entries.find(([file]) => predicate(file));
        return entry ? { present: true, path: entry[0], sha256: entry[1] } : absent(reason, missingStatus);
    };
    const skipped = rows.filter((row) => (row.status || row.result) === 'NOT_RUN');
    const executionStatus = passed ? 'PASS' : skipped.length > 0 && !statuses.includes('FAIL') ? 'NOT_RUN' : 'FAIL';
    const report = {
        schemaVersion: 'port-gap-evidence/1',
        gate: options.gate,
        subject: { description: 'Browser subset: ' + (Array.isArray(input.scope) ? input.scope.join('; ') : options.input) },
        evidenceTypes: [options.evidenceType],
        execution: {
            status: executionStatus, command: input.command.join(' '), cwd: input.cwd,
            startedAt: input.startedAt, endedAt: input.endedAt, exitCode: options.exitCode,
            ...(executionStatus === 'NOT_RUN' ? { reason: 'Executed subset remains incomplete: ' + skipped.map((row) => [row.engine, row.recipeId, row.reason || 'NOT_RUN'].filter(Boolean).join('/')).join('; ') } : {}),
        },
        ...(executionStatus === 'FAIL' ? { failureStage: options.failureStage || 'application' } : {}),
        scope: {
            declared: rows.map((row) => [row.engine, row.recipeId || row.example || row.backend, row.canvas].filter(Boolean).join('/')),
            subset: true, completed: false, totalCases: rows.length,
            measuredCases: rows.length - skipped.length, skippedCases: skipped.length,
            skippedDetail: skipped.map((row) => ({ engine: row.engine, ...(row.recipeId ? { recipeId: row.recipeId } : {}), reason: row.reason || 'Collector recorded NOT_RUN' })),
            countingUnit: recipeScope ? 'browser/recipe scenario rows; phases and nested assertions are not counted again' : 'browser scenario rows; nested assertions are not counted again',
        },
        method: {
            kind: 'REAL_BROWSER',
            detail: 'Original collector: ' + (input.method || 'REAL_BROWSER') + '. ' +
                'Normalize recorded executions only; explicit synthetic contacts remain synthetic and are not physical device evidence.',
            limitations: ['Scope and source-type limits from the native report remain applicable',
                'No complete gate, physical device, real hidden background or GPU allocation certification', ...(input.limitations || [])].join('; '),
        },
        fingerprints: {
            candidate: { present: true, path: runtime[0], sha256: runtime[1] },
            source: firstFingerprint((file) => file.startsWith('src/') || (recipeScope && file.startsWith('docs/manual/examples/')), 'Native report identifies runtime bytes; individual source entry not recorded'),
            contract: firstFingerprint((file) => recipeScope ? file === 'tools/verify/air-port-recipes-browser.cjs' : file.startsWith('test/') || file.endsWith('-contract.json'), 'Contract is embedded in the fingerprinted collector'),
            runner: firstFingerprint((file) => file.startsWith('tools/verify/') && file.endsWith('.cjs'), 'No separate runner entry recorded'),
            browser: { present: true, path: options.input, sha256: hash(resolve(options.input)), detail: 'Native report contains per-row actual browser versions' },
            application: firstFingerprint((file) => file.startsWith('test/fixtures/') && file.endsWith('index.html'), 'Reference application source was not separately fingerprinted in the native report'),
        },
        nativeEvidence: { path: options.input, sha256: hash(resolve(options.input)), allFingerprints: input.fingerprints,
            installed: input.installed || null, originalMethod: input.method || 'REAL_BROWSER' },
        measurements: { gpuMemory: { available: false, unavailableReason: 'No portable complete WebGL allocation measurement' } },
        rawOutputs: { stdout: { path: resolve(options.log) }, logs: [{ path: resolve(options.input) }],
            screenshots: recipeScope ? rows.filter((row) => row.screenshot).map((row) => ({ path: resolve(row.screenshot) })) : [] },
    };
    const result = validatePortGapReport(report, { verifyPaths: true });
    if (!result.ok) throw new Error('Schema rejected report: ' + JSON.stringify(result.errors));
    return report;
}

if (require.main === module) {
    try {
        const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
            const match = /^--([^=]+)=(.*)$/.exec(arg);
            if (!match) throw new Error('Expected --name=value: ' + arg);
            return [match[1], match[2]];
        }));
        for (const key of ['input', 'log', 'gate', 'type', 'exit-code', 'out']) if (!(key in args)) throw new Error('Missing --' + key);
        if (!/^-?\d+$/.test(args['exit-code'])) throw new Error('Invalid --exit-code');
        const report = normalizeBrowserEvidence({ input: args.input, log: args.log, gate: args.gate,
            evidenceType: args.type, exitCode: Number(args['exit-code']), failureStage: args['failure-stage'] });
        fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
        fs.writeFileSync(args.out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify({ ok: true, out: args.out, status: report.execution.status, completed: false }));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { normalizeBrowserEvidence };
