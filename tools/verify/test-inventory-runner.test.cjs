/* Process/JSON negative controls for the inventory gate. Fake Jest fixtures
 * exercise the wrapper only; they are never evidence that project tests passed.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { validateReport } = require('./test-inventory.cjs');

function report(root) {
    return {
        success: true,
        numTotalTestSuites: 1,
        numTotalTests: 1,
        numPassedTests: 1,
        numFailedTests: 0,
        numPendingTests: 0,
        numTodoTests: 0,
        testResults: [
            {
                name: path.join(root, 'test/smoke/fixture.test.js'),
                status: 'passed',
                assertionResults: [{ fullName: 'fixture passes', status: 'passed' }],
            },
        ],
    };
}

async function fixture(body, { args = [], onOutput } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-inventory-runner-'));
    const runner = path.join(root, 'tools/verify/test-inventory.cjs');
    fs.mkdirSync(path.dirname(runner), { recursive: true });
    fs.mkdirSync(path.join(root, 'test/smoke'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'test-inventory.cjs'), runner);
    fs.writeFileSync(path.join(root, 'test/smoke/fixture.test.js'), '// fixture\n');
    const manifestPath = path.join(root, 'docs/test-inventory.json');
    const manifest = JSON.stringify({ suites: [{ file: 'test/smoke/fixture.test.js', tests: ['fixture passes'] }] });
    fs.writeFileSync(manifestPath, manifest);
    const fake = path.join(root, 'fake-jest.cjs');
    fs.writeFileSync(
        fake,
        `
        const fs = require('node:fs');
        const root = ${JSON.stringify(root)};
        const outFile = process.argv.find(a => a.startsWith('--outputFile=')).slice('--outputFile='.length);
        const report = ${JSON.stringify(report(root))};
        const writeReport = () => fs.writeFileSync(outFile, JSON.stringify(report));
        ${body}
    `,
    );
    const child = spawn(process.execPath, [runner, ...args], {
        env: { ...process.env, JEST_BIN: fake },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const watchdog = setTimeout(() => child.kill('SIGKILL'), 10000);
    for (const [stream, kind] of [
        [child.stdout, 'stdout'],
        [child.stderr, 'stderr'],
    ]) {
        stream.on('data', (chunk) => {
            if (kind === 'stdout') stdout += chunk;
            else stderr += chunk;
            if (onOutput) onOutput({ child, root, stdout, stderr });
        });
    }
    try {
        const result = await new Promise((resolve, reject) => {
            child.on('error', reject);
            child.on('close', (status, signal) => resolve({ status, signal }));
        });
        return {
            ...result,
            stdout,
            stderr,
            manifestUnchanged: fs.existsSync(manifestPath) && fs.readFileSync(manifestPath, 'utf8') === manifest,
            tempReports: fs.readdirSync(path.join(root, 'build')).filter((f) => f.startsWith('.test-inventory-')),
            forwarded: fs.existsSync(path.join(root, 'signal-received')),
        };
    } finally {
        clearTimeout(watchdog);
        fs.rmSync(root, { recursive: true, force: true });
    }
}

test('streams both channels before Jest exits, keeps argv and drains large output', async () => {
    let released = false;
    const result = await fixture(
        `
        if (!process.argv.includes('--runInBand')) process.exit(9);
        process.stdout.write('stdout-before-exit\\n');
        process.stderr.write('stderr-before-exit\\n');
        const timer = setInterval(() => {
            if (!fs.existsSync(root + '/release')) return;
            clearInterval(timer);
            process.stdout.write('x'.repeat(1100000) + '\\nlast-byte\\n');
            writeReport();
        }, 10);
    `,
        {
            args: ['--', '--runInBand'],
            onOutput: ({ root, stdout, stderr }) => {
                if (!released && stdout.includes('stdout-before-exit') && stderr.includes('stderr-before-exit')) {
                    released = true;
                    fs.writeFileSync(path.join(root, 'release'), 'ok');
                }
            },
        },
    );
    assert.equal(released, true);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.signal, null);
    assert.match(result.stdout, /last-byte\n/);
    assert.match(result.stdout, /"ok": true/);
    assert.deepEqual(result.tempReports, []);
});

test('nonzero exit is preserved even with an otherwise passing report; update does not write', async () => {
    const result = await fixture('writeReport(); process.exitCode = 7;', { args: ['--update'] });
    assert.equal(result.status, 7);
    assert.match(result.stdout, /jest exited with status 7/);
    assert.equal(result.manifestUnchanged, true);
    assert.deepEqual(result.tempReports, []);
});

test('child signal is a failure even with a passing report', async () => {
    const result = await fixture("writeReport(); process.kill(process.pid, 'SIGTERM');");
    assert.equal(result.status, 143);
    assert.match(result.stdout, /jest terminated by SIGTERM/);
});

test('parent cancellation is forwarded and cannot become a success', async () => {
    let sent = false;
    const result = await fixture(
        `
        process.on('SIGTERM', () => {
            fs.writeFileSync(root + '/signal-received', 'yes');
            writeReport();
            process.exit(0);
        });
        process.stdout.write('ready-for-signal\\n');
        setInterval(() => {}, 1000);
    `,
        {
            onOutput: ({ child, stdout }) => {
                if (!sent && stdout.includes('ready-for-signal')) {
                    sent = true;
                    child.kill('SIGTERM');
                }
            },
        },
    );
    assert.equal(result.status, 143);
    assert.equal(result.forwarded, true);
    assert.match(result.stdout, /jest terminated by SIGTERM/);
});

test('missing, malformed and incomplete reports fail despite exit zero', async () => {
    for (const body of ['', "fs.writeFileSync(outFile, '{bad');", 'report.testResults = []; writeReport();']) {
        const result = await fixture(body);
        assert.equal(result.status, 1);
        assert.match(result.stdout, /no parseable report|report is incomplete/);
        assert.deepEqual(result.tempReports, []);
    }
});

test('failed, skipped and undiscovered tests cannot update; normal checks reject renames', async () => {
    const cases = [
        "report.success = false; report.testResults[0].assertionResults[0].status = 'failed'; report.numPassedTests = 0; report.numFailedTests = 1;",
        "report.testResults[0].assertionResults[0].status = 'pending'; report.numPassedTests = 0; report.numPendingTests = 1;",
        "report.testResults[0].name = root + '/test/smoke/unexpected.test.js';",
    ];
    for (const body of cases) {
        const result = await fixture(body + 'writeReport();', { args: ['--update'] });
        assert.equal(result.status, 1);
        assert.match(result.stdout, /"ok": false/);
        assert.equal(result.manifestUnchanged, true);
    }
    const renamed = await fixture("report.testResults[0].assertionResults[0].fullName = 'renamed'; writeReport();");
    assert.equal(renamed.status, 1);
    assert.match(renamed.stdout, /manifest test missing|new test not in manifest/);
});

test('report validation rejects absent fields, invalid statuses, duplicates and inconsistent counters', () => {
    assert.equal(validateReport(report('/fixture')), null);
    const mutations = [
        (r) => {
            delete r.success;
        },
        (r) => {
            delete r.numTodoTests;
        },
        (r) => {
            r.numPassedTests = -1;
        },
        (r) => {
            r.numTotalTestSuites = 2;
        },
        (r) => {
            r.numFailedTests = 1;
        },
        (r) => {
            r.testResults.push(r.testResults[0]);
        },
        (r) => {
            delete r.testResults[0].status;
        },
        (r) => {
            r.testResults[0].assertionResults[0].status = 'toString';
        },
        (r) => {
            r.testResults[0].assertionResults[0].fullName = '';
        },
    ];
    for (const mutate of mutations) {
        const input = report('/fixture');
        mutate(input);
        assert.match(validateReport(input), /incomplete/);
    }
});

test('only a complete successful run may create a fresh inventory', async () => {
    const missing = "fs.rmSync(root + '/docs/test-inventory.json'); writeReport();";
    const rejected = await fixture(missing);
    assert.equal(rejected.status, 1);
    assert.match(rejected.stdout, /required manifest missing/);
    const updated = await fixture('writeReport();', { args: ['--update'] });
    assert.equal(updated.status, 0);
    assert.equal(updated.manifestUnchanged, false);
    assert.match(updated.stdout, /"mode": "update"/);
});
