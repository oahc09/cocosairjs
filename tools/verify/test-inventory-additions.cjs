/* Append new suites from a real passing focused Jest report, without certifying older suites.
 * Requires complete real Jest --listTests --json discovery. Existing entries are immutable.
 * Usage: node tools/verify/test-inventory-additions.cjs --report=<json> --discovery=<json> --out=<new.json>
 * Writes only --out; review and copy that generated inventory to docs/test-inventory.json explicitly.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const arg = (name) => process.argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const reportPath = path.resolve(root, arg('report') || '');
const discoveryPath = path.resolve(root, arg('discovery') || '');
const out = path.resolve(root, arg('out') || '');
assert(
    arg('report') && arg('discovery') && arg('out') && !fs.existsSync(out),
    'new output and both real inputs required',
);
const old = JSON.parse(fs.readFileSync(path.join(root, 'docs/test-inventory.json')));
const report = JSON.parse(fs.readFileSync(reportPath));
assert.equal(report.success, true);
assert.equal(report.numFailedTests, 0);
assert.equal(report.numPendingTests, 0);
const relative = (file) => path.relative(root, file).replace(/\\/g, '/');
const discovered = JSON.parse(fs.readFileSync(discoveryPath)).map(relative).sort();
const disk = fs
    .readdirSync(path.join(root, 'test/smoke'))
    .filter((f) => /\.test\.(ts|tsx|js)$/.test(f))
    .map((f) => 'test/smoke/' + f)
    .sort();
assert.deepEqual(discovered, disk, 'complete discovery must match all suites on disk');
const prior = new Map(old.suites.map((s) => [s.file, s]));
assert.equal(prior.size, old.suites.length, 'no duplicate old suite paths');
assert.ok(
    [...prior.keys()].every((f) => disk.includes(f)),
    'cannot remove existing suites',
);
const additions = report.testResults.map((r) => {
    const file = relative(r.name);
    assert(!prior.has(file) && disk.includes(file), 'only new suites may be appended');
    assert.equal(r.status, 'passed');
    assert(!r.testExecError);
    assert(r.assertionResults.length > 0 && r.assertionResults.every((a) => a.status === 'passed'));
    return { file, tests: r.assertionResults.map((a) => a.fullName || a.title).sort() };
});
assert.deepEqual(
    additions.map((s) => s.file).sort(),
    disk.filter((f) => !prior.has(f)),
    'all and only newly discovered suites must pass',
);
const suites = [...old.suites, ...additions].sort((a, b) => a.file.localeCompare(b.file, 'en'));
assert.equal(new Set(suites.map((s) => s.file)).size, disk.length);
for (const entry of old.suites)
    assert.deepEqual(
        suites.find((s) => s.file === entry.file),
        entry,
        'existing titles preserved',
    );
const result = {
    generatedAt: new Date().toISOString(),
    suites,
    totals: {
        suites: suites.length,
        tests: suites.reduce((n, s) => n + s.tests.length, 0),
        passed: null,
        failed: null,
    },
    verification: {
        scope: 'additions-only',
        fullRunVerified: false,
        previousGeneratedAt: old.generatedAt,
        addedSuites: additions.map((s) => s.file),
        addedTestsPassed: report.numPassedTests,
        note: 'Complete discovery and new suites verified. Older titles preserved; current full Jest execution is not certified.',
    },
};
// The full gate compares sorted paths using JS default sorting.
result.suites.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(
    JSON.stringify({
        ok: true,
        existingSuitesPreserved: old.suites.length,
        addedSuites: additions.length,
        addedTestsPassed: report.numPassedTests,
        fullRunVerified: false,
        output: path.relative(root, out),
    }),
);
