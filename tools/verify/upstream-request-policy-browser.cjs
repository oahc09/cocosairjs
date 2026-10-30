// Opt-in real browser HTTP fixture. No canonical publication, build, retries, or remote deployment.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { specs, startPolicyServers } = require('../../test/fixtures/upstream-request-policy/server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const errorRecord = (error) => ({ name: error.name, message: error.message, stack: error.stack });
const fixturePath = 'test/fixtures/upstream-request-policy';
const expectedCounts = (id) => {
    const normal = { 'model.gltf': 1, 'mesh.bin': 1, 'pixel.png': 1 };
    if (id === 'pre-abort') return {};
    if (id === 'redirect-headers') return { 'model.gltf': 1 };
    if (id === 'http-cache') return { 'model.gltf': 4, 'mesh.bin': 4, 'pixel.png': 4 };
    if (id === 'abort-main' || id === 'retry-parse') return { ...normal, 'model.gltf': 2 };
    if (id === 'abort-buffer' || id === 'retry-network') return { ...normal, 'model.gltf': 2, 'mesh.bin': 2 };
    if (id === 'abort-image' || id === 'abort-handoff') return { 'model.gltf': 2, 'mesh.bin': 2, 'pixel.png': 2 };
    if (id.startsWith('multi-consumer')) return { 'model.gltf': 3, 'mesh.bin': 2, 'pixel.png': 2 };
    if (id.startsWith('abort-decode-'))
        return {
            'model.gltf': 2,
            [{
                'abort-decode-meshopt': 'compressed.bin',
                'abort-decode-draco': 'mesh.bin',
                'abort-decode-ktx2': 'image.ktx2',
            }[id]]: 2,
            'provider.bin': 2,
        };
    return normal;
};
function validateRow(observation, receipts) {
    const failures = [];
    const requireThat = (condition, reason) => {
        if (!condition) failures.push(reason);
    };
    const spec = specs.find((entry) => entry.id === observation?.case);
    if (
        !spec ||
        !Array.isArray(receipts) ||
        receipts.some((entry) => !entry || typeof entry !== 'object' || !entry.headers)
    )
        return { status: 'FAIL', failures: ['missing known case or HTTP receipts'] };
    requireThat(
        observation.schema === 'air-upstream-request-policy-observation/1' &&
            observation.status === 'OBSERVED_NOT_VALIDATED' &&
            observation.completed === true,
        'observation schema/terminal marker',
    );
    requireThat(
        observation.engine?.backend === 'webgl2' &&
            /WebGL 2/.test(observation.engine?.version) &&
            !!observation.engine?.renderer,
        'actual WebGL2 engine metadata',
    );
    requireThat(
        observation.prioritySchedulingClaim === false && observation.compositorEvidence === false,
        'scope must not claim scheduling or compositor acceptance',
    );
    requireThat(
        Array.isArray(observation.calls) && Array.isArray(observation.progress),
        'native call/progress records required',
    );
    const checks = Array.isArray(observation.checks)
        ? observation.checks.filter((entry) => entry && typeof entry === 'object')
        : [];
    requireThat(
        checks.length === spec.checks.length && new Set(checks.map((entry) => entry.name)).size === checks.length,
        'exact, duplicate-free fixture assertion inventory',
    );
    for (const name of spec.checks)
        requireThat(
            checks.some((entry) => entry.name === name && entry.pass === true && entry.actual !== undefined),
            `assertion ${name}`,
        );
    requireThat(
        receipts.every((entry) => entry.case === spec.id && entry.method === 'GET'),
        'unexpected request, preflight, or mixed-case receipt',
    );
    const counts = expectedCounts(spec.id);
    const calls = Array.isArray(observation.calls) ? observation.calls : [];
    const callCounts = spec.id === 'http-cache' ? { 'model.gltf': 5, 'mesh.bin': 5, 'pixel.png': 5 } : counts;
    requireThat(
        calls.length === Object.values(callCounts).reduce((a, b) => a + b, 0),
        'exact native fetch invocation count',
    );
    const perResource = new Map();
    for (const call of calls) {
        let resource;
        try {
            resource = new URL(call.url).pathname.split('/').at(-1);
        } catch {
            requireThat(false, 'absolute native fetch URL');
            continue;
        }
        const ordinal = perResource.get(resource) || 0;
        perResource.set(resource, ordinal + 1);
        const init = call.init || {};
        let priority = null,
            cache = 'no-store',
            credentials = 'same-origin',
            header;
        if (spec.id === 'default-options' || spec.id === 'redirect-headers') cache = null;
        if (spec.id === 'policy-inheritance') {
            priority = 'high';
            credentials = 'include';
            header = 'global';
        }
        if (spec.id === 'policy-override') {
            priority = 'auto';
            cache = 'default';
        }
        if (spec.id === 'cross-origin-headers') {
            priority = 'low';
            credentials = 'omit';
            if (resource === 'model.gltf') header = 'origin-only';
        }
        if (spec.id === 'redirect-headers') header = 'do-not-forward';
        if (spec.id === 'http-cache')
            cache = ['force-cache', 'force-cache', 'no-cache', 'no-store', 'no-store'][ordinal];
        if (spec.id.startsWith('abort-decode-')) {
            const provider = resource === 'provider.bin';
            priority = provider ? 'low' : 'high';
            cache = provider ? 'reload' : 'no-store';
            credentials = provider ? 'omit' : 'include';
            header = provider ? 'provider-owned' : 'loader-owned';
        }
        if (spec.id.startsWith('multi-consumer')) {
            const label = init.headers?.['x-synthetic-consumer'];
            const same = spec.id === 'multi-consumer-same-policy';
            requireThat(same ? label === 'same' : ['A', 'B', 'A-retry'].includes(label), 'native consumer header');
            const first = same || label?.startsWith('A');
            priority = first ? 'low' : 'high';
            cache = first ? 'no-store' : 'reload';
            credentials = 'omit';
        }
        requireThat(
            init.priority === priority && init.cache === cache && init.credentials === credentials,
            `native effective policy: ${resource} invocation ${ordinal + 1}`,
        );
        requireThat(init.headers?.['x-synthetic-test'] === header, `native bounded test header: ${resource}`);
        if (header !== undefined && resource !== 'provider.bin')
            requireThat(init.redirect === 'error', 'configured headers fail closed on redirects');
    }
    for (const [resource, count] of Object.entries(callCounts))
        requireThat(perResource.get(resource) === count, `native fetch count ${resource}=${count}`);
    requireThat(receipts.length === Object.values(counts).reduce((a, b) => a + b, 0), 'exact server request count');
    for (const [resource, count] of Object.entries(counts))
        requireThat(
            receipts.filter((entry) => entry.resource === resource).length === count,
            `HTTP count ${resource}=${count}`,
        );
    for (const entry of receipts) {
        requireThat(
            (typeof entry.bodySha256 === 'string' && /^[a-f0-9]{64}$/.test(entry.bodySha256)) || entry.status === 302,
            'response body hash or redirect receipt',
        );
        requireThat(
            entry.finished === true || (entry.held === true && entry.aborted === true),
            'HTTP request reached finish or explicit aborted body',
        );
        requireThat([200, 302, 304, 503].includes(entry.status), 'expected HTTP status domain');
    }
    if (spec.id === 'policy-inheritance')
        requireThat(
            receipts.every((entry) => entry.headers['x-synthetic-test'] === 'global' && entry.syntheticCookie === true),
            'global header and include-cookie reach server',
        );
    if (spec.id === 'policy-override' || spec.id === 'default-options')
        requireThat(
            receipts.every(
                (entry) => entry.headers['x-synthetic-test'] === undefined && entry.syntheticCookie === true,
            ),
            'default same-origin cookie and absent custom header',
        );
    if (spec.id === 'cross-origin-headers') {
        const remote = receipts.filter((entry) => entry.origin === 'cross');
        requireThat(
            remote.length === 2 &&
                remote.every((entry) => entry.headers['x-synthetic-test'] === undefined && !entry.syntheticCookie),
            'cross-origin header/cookie leakage',
        );
        requireThat(
            receipts
                .filter((entry) => entry.origin === 'primary')
                .every((entry) => entry.headers['x-synthetic-test'] === 'origin-only' && !entry.syntheticCookie),
            'main request bounded synthetic header and omit-cookie',
        );
    }
    if (spec.id === 'redirect-headers')
        requireThat(
            receipts.length === 1 && receipts[0].origin === 'primary' && receipts[0].status === 302,
            'redirect target must receive no request',
        );
    if (spec.id === 'http-cache') {
        for (const resource of Object.keys(counts)) {
            const rows = receipts.filter((entry) => entry.resource === resource);
            requireThat(
                rows.map((entry) => entry.status).join(',') === '200,304,200,200',
                `fresh cache, ETag revalidation, no-store bypass: ${resource}`,
            );
            requireThat(rows[1]?.headers['if-none-match'] === rows[0]?.etag, `ETag matched: ${resource}`);
        }
    }
    if (['abort-main', 'abort-buffer', 'abort-image'].includes(spec.id) || spec.id.startsWith('multi-consumer'))
        requireThat(
            receipts.filter((entry) => entry.held && entry.aborted && !entry.finished).length === 1,
            'exactly one server-observed canceled body',
        );
    if (spec.id.startsWith('abort-decode-')) {
        const own = receipts.filter((entry) => entry.resource === 'provider.bin');
        requireThat(
            own.length === 2 &&
                own.every((entry) => entry.headers['x-synthetic-test'] === 'provider-owned' && !entry.syntheticCookie),
            'external decoder retains its request policy',
        );
        requireThat(
            receipts
                .filter((entry) => entry.resource !== 'provider.bin')
                .every((entry) => entry.headers['x-synthetic-test'] === 'loader-owned' && entry.syntheticCookie),
            'loader assets retain different policy',
        );
    }
    if (spec.id.startsWith('multi-consumer')) {
        const mains = receipts.filter((entry) => entry.resource === 'model.gltf');
        requireThat(
            mains.map((entry) => entry.headers['x-synthetic-consumer']).join(',') ===
                (spec.id === 'multi-consumer-same-policy' ? 'same,same,same' : 'A,B,A-retry'),
            'independent consumer identities and retry',
        );
        requireThat(
            receipts.every((entry) => !entry.syntheticCookie),
            'consumer omit credentials',
        );
        requireThat(
            mains[1]?.held === true &&
                mains[1]?.startEvent < mains[0]?.abortEvent &&
                mains[0]?.abortEvent < mains[1]?.finishEvent,
            'survivor genuinely pending across other consumer cancellation',
        );
    }
    if (spec.id === 'retry-network')
        requireThat(receipts.filter((entry) => entry.status === 503).length === 1, 'retained first HTTP failure');
    if (spec.id !== 'retry-network')
        requireThat(
            receipts.every((entry) => entry.status !== 503),
            'unexpected failure response',
        );
    return { status: failures.length ? 'FAIL' : 'PASS', failures };
}
function walk(directory) {
    return fs
        .readdirSync(path.join(root, directory), { withFileTypes: true })
        .flatMap((entry) =>
            entry.isDirectory() ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`],
        );
}
function fingerprints() {
    return Object.fromEntries(
        [
            ...walk('src'),
            ...walk(fixturePath),
            'package-lock.json',
            'build/cocosair.module.js',
            'tools/verify/upstream-request-policy-browser.cjs',
            'tools/verify/upstream-request-policy-browser.test.cjs',
            'tools/verify/competitive-example-server.cjs',
            'tools/verify/browser-engines.cjs',
        ]
            .sort()
            .map((file) => [file, hash(fs.readFileSync(path.join(root, file)))]),
    );
}
function selectedBrowser(argv) {
    const value = argv.find((arg) => arg.startsWith('--browser='))?.slice(10) || 'chromium';
    if (!['chromium', 'firefox', 'webkit'].includes(value))
        throw new Error('browser must be chromium, firefox, or webkit');
    return value;
}
async function main(argv = process.argv.slice(2)) {
    if (argv.includes('--help')) {
        console.log(
            'node tools/verify/upstream-request-policy-browser.cjs --out=<new-directory> [--browser=chromium|firefox|webkit] [--record-not-run=<verified-blocker>]\nRequires a fresh main bundle, Playwright and an authorized browser environment. Uses existing browser-engines launchOptions and read-only example server plus local synthetic HTTP origins. Writes new immutable attempts only. --record-not-run does not launch, listen, or infer browser PASS. No remote URL/deployment fallback.',
        );
        return;
    }
    const arg = (name) => argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
    if (
        !arg('out') ||
        argv.some(
            (value) =>
                !value.startsWith('--out=') &&
                !value.startsWith('--browser=') &&
                !value.startsWith('--record-not-run='),
        )
    )
        throw new Error('use --help or --out=<new-directory>');
    const browserName = selectedBrowser(argv);
    const out = path.resolve(arg('out'));
    if (fs.existsSync(out)) throw new Error('attempt exists; preserve it and use a new directory');
    fs.mkdirSync(out, { recursive: true });
    const save = (name, value) =>
        fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    const report = {
        schema: 'air-upstream-request-policy-browser/1',
        startedAt: new Date().toISOString(),
        browser: browserName,
        status: 'NOT_RUN',
        completed: false,
        scope: 'U01 T01–T06 focused selected-browser HTTP/ownership matrix; not codec-conformance, combined three-browser acceptance, compositor, real-device, or canonical campaign evidence',
        canonicalPublication: false,
        prioritySchedulingClaim: false,
        compositorEvidence: false,
        physicalCampaignShutdownProof: false,
        rows: specs.map((entry) => ({ case: entry.id, acceptance: entry.acceptance, status: 'NOT_RUN' })),
    };
    let server, browserServer, browser, childClosed;
    let stage = 'preflight';
    const browserLogs = [];
    try {
        report.gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
        report.inputSha256 = fingerprints();
        save('input-receipt.json', {
            startedAt: report.startedAt,
            gitSha: report.gitSha,
            inputSha256: report.inputSha256,
        });
        if (arg('record-not-run')) {
            report.blocker = {
                stage: 'not-attempted',
                reason: arg('record-not-run'),
                noLaunchAttempted: true,
                noServerStarted: true,
            };
            return;
        }
        const playwright = require('playwright');
        stage = 'server';
        server = await startPolicyServers(root, (event) =>
            fs.appendFileSync(path.join(out, 'http-events.jsonl'), JSON.stringify(event) + '\n'),
        );
        stage = 'browser-launch';
        report.launchOptions = { headless: true, ...launchOptions(browserName) };
        browserServer = await playwright[browserName].launchServer(report.launchOptions);
        const child = browserServer.process();
        report.browserProcess = { pid: child.pid, exitCode: null, signalCode: null, closeObserved: false };
        child.stdout?.on('data', (bytes) => browserLogs.push({ stream: 'stdout', text: bytes.toString() }));
        child.stderr?.on('data', (bytes) => browserLogs.push({ stream: 'stderr', text: bytes.toString() }));
        childClosed = new Promise((resolve) =>
            child.once('close', (code, signal) => {
                Object.assign(report.browserProcess, { exitCode: code, signalCode: signal, closeObserved: true });
                resolve();
            }),
        );
        browser = await playwright[browserName].connect(browserServer.wsEndpoint());
        report.browserVersion = browser.version();
        stage = 'fixture';
        for (const row of report.rows) {
            const context = await browser.newContext({
                viewport: { width: 640, height: 360 },
                deviceScaleFactor: 1,
                serviceWorkers: 'block',
            });
            const page = await context.newPage();
            const logs = [],
                network = [],
                pendingBodies = [],
                loaded = {};
            const required = ['/build/cocosair.module.js', `/${fixturePath}/main.js`, `/${fixturePath}/cases.json`];
            page.on('console', (message) => logs.push({ type: message.type(), text: message.text() }));
            page.on('pageerror', (error) => logs.push({ type: 'pageerror', ...errorRecord(error) }));
            page.on('requestfailed', (request) => network.push({ url: request.url(), failure: request.failure() }));
            page.on('response', (response) => {
                const pathname = new URL(response.url()).pathname;
                if (required.includes(pathname))
                    pendingBodies.push(
                        response
                            .body()
                            .then((body) => {
                                loaded[pathname.slice(1)] = { status: response.status(), sha256: hash(body) };
                            })
                            .catch((error) => {
                                loaded[pathname.slice(1)] = { error: errorRecord(error) };
                            }),
                    );
            });
            try {
                await page.goto(`${server.origin}/${fixturePath}/?case=${row.case}`, {
                    waitUntil: 'load',
                    timeout: 30000,
                });
                await page.waitForFunction(() => window.__requestPolicy?.ready === true, undefined, { timeout: 30000 });
                await page.evaluate(() => {
                    window.__requestPolicyOutcome = { state: 'RUNNING' };
                    window.__requestPolicy.run().then(
                        (observation) => {
                            window.__requestPolicyOutcome = { state: 'RETURNED', observation };
                        },
                        (error) => {
                            window.__requestPolicyOutcome = {
                                state: 'ERROR',
                                error: { name: error.name, message: error.message, stack: error.stack },
                            };
                        },
                    );
                });
                await page.waitForFunction(() => window.__requestPolicyOutcome.state !== 'RUNNING', undefined, {
                    timeout: 60000,
                });
                const outcome = await page.evaluate(() => window.__requestPolicyOutcome);
                save(`${row.case}-outcome.json`, outcome);
                row.observationFile = `${row.case}-outcome.json`;
                if (outcome.state !== 'RETURNED') throw new Error(JSON.stringify(outcome.error));
                row.http = server.state.entries
                    .filter((entry) => entry.case === row.case)
                    .map((entry) => ({ ...entry }));
                row.validation = validateRow(outcome.observation, row.http);
                row.status = row.validation.status;
                await Promise.all(pendingBodies);
                row.loaded = loaded;
                row.loadedFilesMatch = required.every(
                    (file) =>
                        loaded[file.slice(1)]?.status === 200 &&
                        loaded[file.slice(1)]?.sha256 === report.inputSha256[file.slice(1)],
                );
                if (!row.loadedFilesMatch) row.status = 'FAIL';
                row.close = await page.evaluate(() => window.__requestPolicy.close());
                if (
                    row.close?.allResourcesReleased !== true ||
                    row.close?.borrowedProvidersUntouched !== true ||
                    logs.some((entry) => entry.type === 'pageerror')
                )
                    row.status = 'FAIL';
            } catch (error) {
                row.status = 'FAIL';
                row.error = errorRecord(error);
            } finally {
                try {
                    save(
                        `${row.case}-partial.json`,
                        await page.evaluate(() => window.__requestPolicy?.snapshot() || null),
                    );
                } catch (error) {
                    row.partialObservationError = errorRecord(error);
                }
                // Even a failed fixture remains in its own raw attempt. Context isolation is
                // mandatory for native caches, global defaults, HTTP cache and engine singleton.
                try {
                    await context.close();
                    row.contextClosed = true;
                } catch (error) {
                    row.contextCloseError = errorRecord(error);
                    row.status = 'FAIL';
                }
                row.http = server.state.entries
                    .filter((entry) => entry.case === row.case)
                    .map((entry) => ({ ...entry }));
                save(`${row.case}-logs.json`, { logs, network, http: row.http, loaded });
                save(`${row.case}-row.json`, row);
            }
        }
        report.completed = true;
        report.status = report.rows.every((row) => row.status === 'PASS') ? 'PASS' : 'FAIL';
    } catch (error) {
        report.error = { stage, ...errorRecord(error) };
        if (['preflight', 'server', 'browser-launch'].includes(stage)) {
            report.status = 'NOT_RUN';
            report.blocker = { classification: 'INFRA_BLOCKED', stage, reason: error.message };
        } else report.status = 'FAIL';
    } finally {
        if (browserServer) {
            let timer;
            try {
                await Promise.race([
                    Promise.all([browserServer.close(), childClosed]),
                    new Promise((_, reject) => {
                        timer = setTimeout(
                            () => reject(new Error('browser close not observed within original 4000 ms budget')),
                            4000,
                        );
                    }),
                ]);
                report.browserClosed = true;
            } catch (error) {
                report.status = 'FAIL';
                report.browserCloseError = errorRecord(error);
                try {
                    await browserServer.kill();
                    report.forcedBrowserKill = true;
                } catch (killError) {
                    report.killError = errorRecord(killError);
                }
            } finally {
                clearTimeout(timer);
            }
        }
        if (server) {
            save('http-final.json', server.state.entries);
            try {
                await server.close();
                report.serversClosed = true;
            } catch (error) {
                report.status = 'FAIL';
                report.serverCloseError = errorRecord(error);
            }
        }
        if (report.inputSha256) {
            try {
                report.inputsUnchanged = JSON.stringify(report.inputSha256) === JSON.stringify(fingerprints());
            } catch (error) {
                report.fingerprintError = errorRecord(error);
                report.inputsUnchanged = false;
            }
            if (!report.inputsUnchanged) report.status = 'FAIL';
        }
        save('browser-logs.json', browserLogs);
        report.finishedAt = new Date().toISOString();
        save('report.json', report);
        console.log(
            JSON.stringify({
                status: report.status,
                report: path.join(out, 'report.json'),
                completed: report.completed,
            }),
        );
        if (report.status !== 'PASS') process.exitCode = 1;
    }
}
module.exports = { specs, expectedCounts, validateRow, selectedBrowser, main };
if (require.main === module)
    main().catch((error) => {
        console.error(error.stack || error);
        process.exitCode = 1;
    });
