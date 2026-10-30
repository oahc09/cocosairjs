// Opt-in complete smoke inventory, isolated in small Jest processes. Does not rewrite the canonical inventory.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { validateReport } = require('./test-inventory.cjs');
const root = path.resolve(__dirname, '../..');
const requested = process.argv.find((arg) => arg.startsWith('--out='))?.slice(6);
if (!requested) throw new Error('--out=<new directory> required');
const out = path.resolve(requested);
if (fs.existsSync(out)) throw new Error('Output exists; keep all failed attempts');
fs.mkdirSync(out, { recursive: true });
const files = fs
    .readdirSync(path.join(root, 'test/smoke'))
    .filter((file) => /\.test\.(ts|tsx|js)$/.test(file))
    .map((file) => 'test/smoke/' + file)
    .sort();
const expected = Object.fromEntries(
    files.map((file) => [
        file,
        crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(root, file)))
            .digest('hex'),
    ]),
);
fs.writeFileSync(
    path.join(out, 'frozen-inventory.json'),
    JSON.stringify({ frozenAt: new Date().toISOString(), files: expected }, null, 2) + '\n',
);
(async () => {
    const batches = [],
        observed = new Map(),
        errors = [];
    for (let offset = 0; offset < files.length; offset += 8) {
        const id = String(offset / 8 + 1).padStart(3, '0'),
            batch = files.slice(offset, offset + 8),
            json = path.join(out, `batch-${id}.json`),
            log = fs.createWriteStream(path.join(out, `batch-${id}.log`));
        console.log(`[upstream-cpu] batch ${id}, ${offset + 1}..${offset + batch.length}/${files.length}`);
        const startedAt = new Date().toISOString(),
            child = cp.spawn(
                process.execPath,
                [
                    path.join(root, 'node_modules/jest/bin/jest.js'),
                    '--runInBand',
                    '--runTestsByPath',
                    ...batch,
                    '--json',
                    `--outputFile=${json}`,
                ],
                {
                    cwd: root,
                    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=3072' },
                    stdio: ['ignore', 'pipe', 'pipe'],
                },
            );
        child.stdout.on('data', (chunk) => log.write(chunk));
        child.stderr.on('data', (chunk) => log.write(chunk));
        const heartbeat = setInterval(
            () => console.log(`[upstream-cpu] batch ${id} is still running; no completion claimed`),
            30000,
        );
        const result = await new Promise((resolve) => {
            child.on('error', (error) => resolve({ code: null, error: String(error) }));
            child.on('close', (code, signal) => resolve({ code, signal }));
        });
        clearInterval(heartbeat);
        await new Promise((resolve) => log.end(resolve));
        let report;
        try {
            report = JSON.parse(fs.readFileSync(json, 'utf8'));
            const invalid = validateReport(report);
            if (invalid) throw Error(invalid);
        } catch (error) {
            errors.push(`${id}: missing/invalid report: ${error.message}`);
        }
        const row = {
            id,
            files: batch,
            startedAt,
            finishedAt: new Date().toISOString(),
            ...result,
            validReport: !!report && !validateReport(report),
            success: report?.success === true,
        };
        batches.push(row);
        if (result.code !== 0 || !report?.success) errors.push(`${id}: Jest failed or incomplete`);
        const names = (report?.testResults || [])
            .map((suite) => path.relative(root, suite.name).split(path.sep).join('/'))
            .sort();
        if (JSON.stringify(names) !== JSON.stringify(batch)) errors.push(`${id}: discovered subset/different suites`);
        for (const suite of report?.testResults || []) {
            const file = path.relative(root, suite.name).split(path.sep).join('/');
            if (observed.has(file)) errors.push(`duplicate suite ${file}`);
            observed.set(file, suite);
            if (suite.status !== 'passed' || suite.assertionResults.some((test) => test.status !== 'passed'))
                errors.push(`failed/skipped assertion ${file}`);
        }
        fs.writeFileSync(path.join(out, 'progress.json'), JSON.stringify({ batches, errors }, null, 2) + '\n');
    }
    for (const [file, hash] of Object.entries(expected)) {
        if (!observed.has(file)) errors.push(`missing ${file}`);
        if (
            crypto
                .createHash('sha256')
                .update(fs.readFileSync(path.join(root, file)))
                .digest('hex') !== hash
        )
            errors.push(`changed during collection ${file}`);
    }
    const now = fs
        .readdirSync(path.join(root, 'test/smoke'))
        .filter((file) => /\.test\.(ts|tsx|js)$/.test(file))
        .map((file) => 'test/smoke/' + file)
        .sort();
    if (JSON.stringify(now) !== JSON.stringify(files)) errors.push('suite inventory changed during collection');
    const assertions = [...observed.values()].flatMap((suite) => suite.assertionResults),
        total = assertions.length;
    const inventory = {
        generatedAt: new Date().toISOString(),
        suites: files.map((file) => ({
            file,
            tests: (observed.get(file)?.assertionResults || []).map((test) => test.fullName || test.title).sort(),
        })),
        totals: {
            suites: files.length,
            tests: total,
            passed: assertions.filter((test) => test.status === 'passed').length,
            failed: assertions.filter((test) => test.status === 'failed').length,
        },
    };
    fs.writeFileSync(path.join(out, 'observed-inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
    const result = {
        schema: 'upstream-complete-cpu/1',
        status: errors.length ? 'FAIL' : 'PASS',
        completed: batches.length === Math.ceil(files.length / 8) && batches.every((batch) => batch.validReport),
        partial: observed.size !== files.length || batches.some((batch) => !batch.validReport),
        expectedSuites: files.length,
        observedSuites: observed.size,
        totalTests: total,
        passed: inventory.totals.passed,
        failed: inventory.totals.failed,
        pendingOrTodo: assertions.filter((test) => test.status !== 'passed' && test.status !== 'failed').length,
        batches,
        errors,
    };
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
    if (errors.length) process.exitCode = 1;
})().catch((error) => {
    fs.writeFileSync(
        path.join(out, 'fatal.json'),
        JSON.stringify({ status: 'FAIL', completed: false, error: String(error.stack || error) }, null, 2) + '\n',
    );
    console.error(error);
    process.exitCode = 1;
});
