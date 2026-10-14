/* Test-inventory gate (audit R7a): jest discovery must match a committed manifest.
 *
 * Why: a suite that is never discovered (deleted, renamed, excluded by a
 * testPathIgnorePatterns/testRegex change, or skipped) leaves `npm test` green,
 * so "29 files / 207 tests" was an unverified claim. This gate runs the real
 * project-locked jest with --json and FAILS unless:
 *   1. every suite file on disk under test/smoke appears in the jest report,
 *   2. the on-disk suite set matches docs/test-inventory.json exactly,
 *   3. every manifest suite/test title is present (no silent drop or rename),
 *   4. every reported test status is "passed" (no only/skip/todo/pending),
 *   5. the jest run itself succeeded.
 *
 * Execute:  node tools/verify/test-inventory.cjs [-- <extra jest args>]
 * Rebase:   node tools/verify/test-inventory.cjs --update        (deliberate)
 * Produce:  docs/test-inventory.json
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { constants } = require('os');

const root = path.resolve(__dirname, '../..');
const MANIFEST_PATH = path.join(root, 'docs', 'test-inventory.json');
const SUITE_DIR = path.join(root, 'test', 'smoke');
const argv = process.argv.slice(2);
const UPDATE = argv.includes('--update');
const extraArgs = argv.includes('--') ? argv.slice(argv.indexOf('--') + 1) : [];

function rel(p) {
    return path.relative(root, p).split(path.sep).join('/');
}

function suitesOnDisk() {
    if (!fs.existsSync(SUITE_DIR)) {
        return [];
    }
    return fs
        .readdirSync(SUITE_DIR)
        .filter((f) => /\.test\.(ts|tsx|js)$/.test(f))
        .map((f) => rel(path.join(SUITE_DIR, f)))
        .sort();
}

function jestBin() {
    // jest 28 ships an "exports" map, so deep require.resolve('jest/bin/jest.js')
    // is blocked; resolve by path instead (local install first, then NODE_PATH).
    const candidates = [];
    if (process.env.JEST_BIN) {
        candidates.push(process.env.JEST_BIN);
    }
    candidates.push(path.join(root, 'node_modules', 'jest', 'bin', 'jest.js'));
    for (const dir of (process.env.NODE_PATH || '').split(path.delimiter)) {
        if (dir) {
            candidates.push(path.join(dir, 'jest', 'bin', 'jest.js'));
        }
    }
    return candidates.find((c) => c && fs.existsSync(c)) || null;
}

// Keep JSON separate from live stdout/stderr; neither a quiet suite nor a heartbeat
// proves progress. Never impose a new timeout on the project's full Jest run.
async function runJest({ rootDir = root, bin = jestBin(), args = extraArgs, heartbeatMs = 30000 } = {}) {
    if (!bin) {
        return { error: 'jest binary not resolvable (install deps or set NODE_PATH)', exitCode: 1 };
    }
    const outFile = path.join(rootDir, 'build', `.test-inventory-${process.pid}.json`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.rmSync(outFile, { force: true });
    const childArgs = [bin, '--rootDir', rootDir, '--json', `--outputFile=${outFile}`, ...args];
    const started = Date.now();
    const child = spawn(process.execPath, childArgs, { cwd: rootDir, stdio: 'inherit' });
    let spawnError = null;
    let receivedSignal = null;
    const forwardSignal = (signal) => {
        receivedSignal = signal;
        child.kill(signal);
    };
    const onInterrupt = () => forwardSignal('SIGINT');
    const onTerminate = () => forwardSignal('SIGTERM');
    process.on('SIGINT', onInterrupt);
    process.on('SIGTERM', onTerminate);
    console.error(`[test-inventory] Jest started (pid ${child.pid ?? 'unavailable'}); streaming stdout/stderr`);
    const heartbeat = setInterval(() => {
        console.error(
            `[test-inventory] Jest still running after ${Math.round((Date.now() - started) / 1000)}s ` +
                `(pid ${child.pid}); awaiting suite output, not a progress assertion`,
        );
    }, heartbeatMs);
    let status;
    let signal;
    try {
        ({ status, signal } = await new Promise((resolve) => {
            child.on('error', (error) => {
                spawnError = error;
            });
            child.on('close', (code, sig) => resolve({ status: code, signal: sig }));
        }));
    } finally {
        clearInterval(heartbeat);
        process.removeListener('SIGINT', onInterrupt);
        process.removeListener('SIGTERM', onTerminate);
    }
    signal = signal || receivedSignal;
    const exitCode = signal ? 128 + (constants.signals[signal] || 1) : (status ?? 1);
    console.error(
        `[test-inventory] Jest closed after ${Math.round((Date.now() - started) / 1000)}s (exit ${status}, signal ${signal || 'none'})`,
    );
    let report;
    let reportError;
    try {
        report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
        reportError = validateReport(report);
    } catch (error) {
        reportError = `jest --json produced no parseable report: ${error.message}`;
    } finally {
        fs.rmSync(outFile, { force: true });
    }
    const errors = [
        spawnError && `jest failed to start: ${spawnError.message}`,
        signal && `jest terminated by ${signal}`,
        status !== 0 && `jest exited with status ${status}`,
        reportError,
    ].filter(Boolean);
    return { report, error: errors.length ? errors.join('; ') : null, exitCode, signal };
}

function validateReport(report) {
    if (!report || typeof report.success !== 'boolean' || !Array.isArray(report.testResults)) {
        return 'jest report is incomplete: success/testResults missing';
    }
    const counts = [
        'numTotalTestSuites',
        'numTotalTests',
        'numPassedTests',
        'numFailedTests',
        'numPendingTests',
        'numTodoTests',
    ];
    for (const field of counts) {
        if (!Number.isInteger(report[field]) || report[field] < 0) {
            return `jest report is incomplete: invalid ${field}`;
        }
    }
    const statuses = { passed: 0, failed: 0, pending: 0, todo: 0 };
    const files = new Set();
    for (const suite of report.testResults) {
        if (
            !suite ||
            typeof suite.name !== 'string' ||
            !suite.name ||
            !['passed', 'failed', 'pending'].includes(suite.status) ||
            !Array.isArray(suite.assertionResults) ||
            files.has(suite.name)
        ) {
            return 'jest report is incomplete: invalid or duplicate suite';
        }
        files.add(suite.name);
        for (const assertion of suite.assertionResults) {
            if (
                !assertion ||
                typeof (assertion.fullName || assertion.title) !== 'string' ||
                !(assertion.fullName || assertion.title) ||
                !Object.hasOwn(statuses, assertion.status)
            ) {
                return 'jest report is incomplete: invalid assertion';
            }
            statuses[assertion.status]++;
        }
    }
    const total = Object.values(statuses).reduce((sum, count) => sum + count, 0);
    if (
        files.size !== report.numTotalTestSuites ||
        total !== report.numTotalTests ||
        statuses.passed !== report.numPassedTests ||
        statuses.failed !== report.numFailedTests ||
        statuses.pending !== report.numPendingTests ||
        statuses.todo !== report.numTodoTests
    ) {
        return 'jest report is incomplete: suite/assertion counts disagree with summary';
    }
    return null;
}

async function main() {
    const failures = [];
    const disk = suitesOnDisk();
    const { report, error, exitCode, signal } = await runJest();
    if (error) {
        console.log(JSON.stringify({ ok: false, failures: [error], jestExitCode: exitCode, signal }, null, 2));
        return exitCode || 1;
    }

    const observed = new Map(); // rel suite path -> [{ title, status }]
    for (const tr of report.testResults || []) {
        const file = rel(tr.name || '');
        const tests = (tr.assertionResults || []).map((a) => ({ title: a.fullName || a.title, status: a.status }));
        if (tr.testExecError || tr.status !== 'passed') {
            failures.push(`suite failed to execute: ${file}`);
        }
        observed.set(file, tests);
    }

    // 1 + 4: discovery and status of everything jest actually ran
    for (const file of disk) {
        if (!observed.has(file)) {
            failures.push(`required suite not executed (deleted / excluded / not matched): ${file}`);
        }
    }
    for (const [file, tests] of observed) {
        if (!disk.includes(file)) {
            failures.push(`suite executed but absent from test/smoke inventory: ${file}`);
        }
        for (const t of tests) {
            if (t.status !== 'passed') {
                failures.push(`test not passed (${t.status}): ${file} :: ${t.title}`);
            }
        }
    }
    if (report.numFailedTests || report.success === false) {
        failures.push(`jest reported ${report.numFailedTests} failed test(s) / success=${report.success}`);
    }

    // 2 + 3: match the committed manifest
    const manifest = fs.existsSync(MANIFEST_PATH) ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) : null;
    if (!manifest && !UPDATE) {
        failures.push(`required manifest missing: ${rel(MANIFEST_PATH)}`);
    }
    if (manifest && !UPDATE) {
        if (JSON.stringify(manifest.suites.map((s) => s.file)) !== JSON.stringify(disk)) {
            failures.push(
                `suite set drifted from ${rel(MANIFEST_PATH)} (manifest ${manifest.suites.length}, on disk ${disk.length}); regenerate with --update only when intentional`,
            );
        }
        for (const entry of manifest.suites) {
            const cur = observed.get(entry.file);
            if (!cur) {
                continue;
            } // already reported as not executed
            const want = entry.tests.slice().sort();
            const got = cur.map((t) => t.title).sort();
            for (const title of want) {
                if (!got.includes(title)) {
                    failures.push(`manifest test missing from run: ${entry.file} :: ${title}`);
                }
            }
            for (const title of got) {
                if (!want.includes(title)) {
                    failures.push(`new test not in manifest: ${entry.file} :: ${title}`);
                }
            }
        }
    }

    const current = {
        generatedAt: new Date().toISOString(),
        suites: disk.map((file) => ({ file, tests: (observed.get(file) || []).map((t) => t.title).sort() })),
        totals: {
            suites: disk.length,
            tests: report.numTotalTests,
            passed: report.numPassedTests,
            failed: report.numFailedTests,
        },
    };

    if (UPDATE && failures.length === 0) {
        fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ ...current, suites: current.suites }, null, 2) + '\n');
    }

    const ok = failures.length === 0;
    console.log(
        JSON.stringify(
            {
                ok,
                mode: UPDATE ? 'update' : 'check',
                extraJestArgs: extraArgs,
                manifest: manifest ? rel(MANIFEST_PATH) : null,
                totals: current.totals,
                observedTotals: {
                    suites: observed.size,
                    tests: report.numTotalTests,
                    passed: report.numPassedTests,
                    failed: report.numFailedTests,
                },
                failures,
                output: UPDATE && ok ? rel(MANIFEST_PATH) : null,
            },
            null,
            2,
        ),
    );
    return ok ? 0 : 1;
}

module.exports = { runJest, validateReport };
if (require.main === module) {
    main()
        .then((code) => {
            process.exitCode = code;
        })
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
}
