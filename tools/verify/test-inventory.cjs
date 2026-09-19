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
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const MANIFEST_PATH = path.join(root, 'docs', 'test-inventory.json');
const SUITE_DIR = path.join(root, 'test', 'smoke');
const argv = process.argv.slice(2);
const UPDATE = argv.includes('--update');
const extraArgs = argv.includes('--') ? argv.slice(argv.indexOf('--') + 1) : [];

function rel (p) { return path.relative(root, p).split(path.sep).join('/'); }

function suitesOnDisk () {
    if (!fs.existsSync(SUITE_DIR)) { return []; }
    return fs.readdirSync(SUITE_DIR)
        .filter((f) => /\.test\.(ts|tsx|js)$/.test(f))
        .map((f) => rel(path.join(SUITE_DIR, f)))
        .sort();
}

function jestBin () {
    // jest 28 ships an "exports" map, so deep require.resolve('jest/bin/jest.js')
    // is blocked; resolve by path instead (local install first, then NODE_PATH).
    const candidates = [];
    if (process.env.JEST_BIN) { candidates.push(process.env.JEST_BIN); }
    candidates.push(path.join(root, 'node_modules', 'jest', 'bin', 'jest.js'));
    for (const dir of (process.env.NODE_PATH || '').split(path.delimiter)) {
        if (dir) { candidates.push(path.join(dir, 'jest', 'bin', 'jest.js')); }
    }
    return candidates.find((c) => c && fs.existsSync(c)) || null;
}

function runJest () {
    const bin = jestBin();
    if (!bin) { return { error: 'jest binary not resolvable (install deps or set NODE_PATH)' }; }
    const outFile = path.join(root, 'build', `.test-inventory-${process.pid}.json`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const args = [bin, '--rootDir', root, '--json', `--outputFile=${outFile}`, ...extraArgs];
    const run = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
    let report = null;
    if (fs.existsSync(outFile)) {
        try { report = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch (e) { report = null; }
        fs.rmSync(outFile, { force: true });
    }
    if (!report) {
        return { error: `jest --json produced no parseable report (exit ${run.status})`, stderr: (run.stderr || run.stdout || '').slice(-4000) };
    }
    return { report };
}

const failures = [];
const disk = suitesOnDisk();
const { report, error, stderr } = runJest();
if (error) {
    console.log(JSON.stringify({ ok: false, failures: [error], stderr: stderr || null }, null, 2));
    process.exit(1);
}

const observed = new Map(); // rel suite path -> [{ title, status }]
for (const tr of report.testResults || []) {
    const file = rel(tr.name || '');
    const tests = (tr.assertionResults || []).map((a) => ({ title: a.fullName || a.title, status: a.status }));
    if (tr.testExecError || (tr.status === 'failed' && tests.length === 0)) {
        failures.push(`suite failed to execute: ${file}`);
    }
    observed.set(file, tests);
}

// 1 + 4: discovery and status of everything jest actually ran
for (const file of disk) {
    if (!observed.has(file)) { failures.push(`required suite not executed (deleted / excluded / not matched): ${file}`); }
}
for (const [file, tests] of observed) {
    if (!disk.includes(file)) { failures.push(`suite executed but absent from test/smoke inventory: ${file}`); }
    for (const t of tests) {
        if (t.status !== 'passed') { failures.push(`test not passed (${t.status}): ${file} :: ${t.title}`); }
    }
}
if (report.numFailedTests || report.success === false) {
    failures.push(`jest reported ${report.numFailedTests} failed test(s) / success=${report.success}`);
}

// 2 + 3: match the committed manifest
const manifest = fs.existsSync(MANIFEST_PATH) ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) : null;
if (manifest && !UPDATE) {
    if (JSON.stringify(manifest.suites.map((s) => s.file)) !== JSON.stringify(disk)) {
        failures.push(`suite set drifted from ${rel(MANIFEST_PATH)} (manifest ${manifest.suites.length}, on disk ${disk.length}); regenerate with --update only when intentional`);
    }
    for (const entry of manifest.suites) {
        const cur = observed.get(entry.file);
        if (!cur) { continue; } // already reported as not executed
        const want = entry.tests.slice().sort();
        const got = cur.map((t) => t.title).sort();
        for (const title of want) { if (!got.includes(title)) { failures.push(`manifest test missing from run: ${entry.file} :: ${title}`); } }
        for (const title of got) { if (!want.includes(title)) { failures.push(`new test not in manifest: ${entry.file} :: ${title}`); } }
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

if (UPDATE) {
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ ...current, suites: current.suites }, null, 2) + '\n');
}

const ok = failures.length === 0;
console.log(JSON.stringify({
    ok,
    mode: UPDATE ? 'update' : 'check',
    extraJestArgs: extraArgs,
    manifest: manifest ? rel(MANIFEST_PATH) : null,
    totals: current.totals,
    observedTotals: { suites: observed.size, tests: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests },
    failures,
    output: UPDATE ? rel(MANIFEST_PATH) : null,
}, null, 2));
process.exit(ok ? 0 : 1);
