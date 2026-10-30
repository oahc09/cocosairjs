// Focused, opt-in real GPU collector. Never modifies canonical evidence or launches during --help.
// Usage: node tools/verify/upstream-color-gpu.cjs --browser=chromium --out=<new-directory> [--url=<fixture-url>]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { validateObservations } = require('./upstream-color-observations.cjs');
const root = path.resolve(__dirname, '../..');
// Own the error listener so a denied listen is recorded as INFRA_BLOCKED, not an unhandled process crash.
async function startReadOnlyServer() {
    const http = require('node:http');
    const esbuild = require('esbuild');
    const mime = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.ts': 'text/javascript',
        '.json': 'application/json',
    };
    const server = http.createServer((request, response) => {
        try {
            let file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
            if (!file.startsWith(root + path.sep)) throw new Error('outside workspace');
            if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
            if (!fs.existsSync(file) && file.endsWith('.js') && fs.existsSync(file.slice(0, -3) + '.ts'))
                file = file.slice(0, -3) + '.ts';
            if (!fs.existsSync(file)) {
                response.writeHead(404);
                response.end();
                return;
            }
            if (!fs.realpathSync(file).startsWith(fs.realpathSync(root) + path.sep))
                throw new Error('symlink outside workspace');
            const source = fs.readFileSync(file);
            const body = file.endsWith('.ts')
                ? esbuild.transformSync(source.toString(), { loader: 'ts', format: 'esm', target: 'es2022' }).code
                : source;
            response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
            response.end(body);
        } catch (error) {
            response.writeHead(500);
            response.end(String(error));
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return {
        origin: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((resolve) => server.close(resolve)),
    };
}
const hash = (file) =>
    crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, file)))
        .digest('hex');
const walk = (directory) =>
    fs
        .readdirSync(path.join(root, directory), { withFileTypes: true })
        .flatMap((entry) =>
            entry.isDirectory() ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`],
        );
const inputs = () =>
    Object.fromEntries(
        [
            ...walk('test/fixtures/upstream-color-contract'),
            ...walk('src'),
            'tools/verify/upstream-color-gpu.cjs',
            'tools/verify/upstream-color-observations.cjs',
            'tools/verify/upstream-depth-source-audit.cjs',
            'tools/debug/effect-layout.ts',
            'tools/verify/browser-engines.cjs',
            'ai/ledgers/upstream-update/acceptance-manifest.json',
            'package-lock.json',
            'build/cocosair.module.js',
        ]
            .sort()
            .map((file) => [file, hash(file)]),
    );
const errorRecord = (error) => ({ name: error.name, message: error.message, stack: error.stack });
async function main() {
    if (process.argv.includes('--help')) {
        console.log(
            'node tools/verify/upstream-color-gpu.cjs --browser=chromium|firefox|webkit --out=<new-directory-or-report.json> [--url=<authorized-fixture-url>]\nRequires matching Playwright and a fresh build/cocosair.module.js. Without --url, starts a read-only local fixture server. Creates new raw report, screenshots, submitted GLSL, hashes, logs, and browser child exit status; never overwrites or publishes canonical evidence. GPU readback is not compositor/campaign/real-device acceptance.',
        );
        return;
    }
    const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
    const browserName = arg('browser') || 'chromium';
    if (!['chromium', 'firefox', 'webkit'].includes(browserName) || !arg('out'))
        throw new Error('Use --browser=chromium|firefox|webkit and --out=<new-directory-or-report.json>');
    const target = path.resolve(arg('out'));
    const reportPath = /\.json$/i.test(target) ? target : path.join(target, 'report.json');
    const out = /\.json$/i.test(target) ? target.replace(/\.json$/i, '-artifacts') : target;
    if (fs.existsSync(target) || fs.existsSync(out) || fs.existsSync(reportPath))
        throw new Error('Output already exists; retain it and choose a new attempt');
    fs.mkdirSync(out, { recursive: true });
    const report = {
        schema: 'air-upstream-color-depth/1',
        measuredAt: new Date().toISOString(),
        browser: browserName,
        status: 'NOT_RUN',
        completed: false,
        canonicalPublication: false,
        compositorEvidence: false,
        physicalCampaignShutdownProof: false,
    };
    let server, browserServer, browser, child, childClosed;
    const browserLog = [],
        pageLog = [];
    let stage = 'preflight';
    try {
        report.gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
        report.inputSha256 = inputs();
        fs.writeFileSync(path.join(out, 'input-receipt.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        const playwright = require('playwright');
        const { launchOptions } = require('./browser-engines.cjs');
        let url = arg('url');
        if (!url) {
            stage = 'server';
            server = await startReadOnlyServer();
            url = `${server.origin}/test/fixtures/upstream-color-contract/`;
        }
        stage = 'browser-launch';
        report.launchOptions = { headless: true, ...launchOptions(browserName) };
        browserServer = await playwright[browserName].launchServer(report.launchOptions);
        child = browserServer.process();
        report.browserProcess = { pid: child.pid, exitCode: null, signalCode: null, closeObserved: false };
        child.stdout?.on('data', (data) => browserLog.push({ stream: 'stdout', text: data.toString() }));
        child.stderr?.on('data', (data) => browserLog.push({ stream: 'stderr', text: data.toString() }));
        childClosed = new Promise((resolve) =>
            child.once('close', (code, signal) => {
                Object.assign(report.browserProcess, { exitCode: code, signalCode: signal, closeObserved: true });
                resolve();
            }),
        );
        browser = await playwright[browserName].connect(browserServer.wsEndpoint());
        report.browserVersion = browser.version();
        const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
        const responses = [],
            loaded = {};
        const requiredResponses = {
            '/build/cocosair.module.js': 'build/cocosair.module.js',
            '/probe.js': 'test/fixtures/upstream-color-contract/probe.js',
            '/vectors.json': 'test/fixtures/upstream-color-contract/vectors.json',
        };
        page.on('response', (response) => {
            const pathname = new URL(response.url()).pathname;
            const file = Object.entries(requiredResponses).find(([suffix]) => pathname.endsWith(suffix))?.[1];
            if (file)
                responses.push(
                    response
                        .body()
                        .then((body) => {
                            loaded[file] = {
                                url: response.url(),
                                status: response.status(),
                                sha256: crypto.createHash('sha256').update(body).digest('hex'),
                            };
                        })
                        .catch((error) => {
                            loaded[file] = { error: errorRecord(error) };
                        }),
                );
        });
        page.on('console', (message) => pageLog.push({ type: message.type(), text: message.text() }));
        page.on('pageerror', (error) => pageLog.push({ type: 'pageerror', ...errorRecord(error) }));
        stage = 'probe';
        await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        await page.waitForFunction(() => window.__upstreamColorProbe?.ready, undefined, { timeout: 30000 });
        await page.evaluate(() => {
            window.__upstreamColorOutcome = { status: 'RUNNING' };
            window.__upstreamColorProbe.run().then(
                (value) => {
                    window.__upstreamColorOutcome = { status: 'RETURNED', value };
                },
                (error) => {
                    window.__upstreamColorOutcome = {
                        status: 'ERROR',
                        error: { message: error.message, stack: error.stack },
                    };
                },
            );
        });
        await page.waitForFunction(() => window.__upstreamColorOutcome.status !== 'RUNNING', undefined, {
            timeout: 90000,
        });
        const outcome = await page.evaluate(() => window.__upstreamColorOutcome);
        if (outcome.status !== 'RETURNED')
            throw new Error(`GPU probe: ${outcome.error?.stack || outcome.error?.message}`);
        report.observations = outcome.value;
        fs.writeFileSync(path.join(out, 'observations.json'), JSON.stringify(report.observations, null, 2) + '\n', {
            flag: 'wx',
        });
        report.validation = validateObservations(report.observations);
        await Promise.all(responses);
        report.loadedFiles = loaded;
        report.loadedFilesMatch = Object.values(requiredResponses).every(
            (file) => loaded[file]?.status === 200 && loaded[file]?.sha256 === report.inputSha256[file],
        );
        report.status = report.loadedFilesMatch ? report.validation.status : 'FAIL';
        await page.screenshot({ path: path.join(out, 'diagnostic-page.png') });
        report.screenshot = {
            path: path.relative(path.dirname(reportPath), path.join(out, 'diagnostic-page.png')),
            scope: 'diagnostic-page-only-not-compositor-proof',
        };
        report.completed = true;
        if (pageLog.some((entry) => entry.type === 'pageerror')) report.status = 'FAIL';
    } catch (error) {
        report.status = ['preflight', 'server', 'browser-launch'].includes(stage) ? 'INFRA_BLOCKED' : 'FAIL';
        report.error = { stage, ...errorRecord(error) };
    } finally {
        stage = 'close';
        if (browserServer) {
            const started = Date.now();
            let timer;
            try {
                await Promise.race([
                    Promise.all([browserServer.close(), childClosed]),
                    new Promise((_, reject) => {
                        timer = setTimeout(() => reject(new Error('Browser close exceeded four-second budget')), 4000);
                    }),
                ]);
            } catch (error) {
                report.closeError = errorRecord(error);
                report.status = 'FAIL';
                // Cleanup is not success evidence; preserve the timed-out close and resulting terminal status.
                await browserServer.kill().catch((cleanupError) => {
                    report.cleanupError = errorRecord(cleanupError);
                });
            } finally {
                clearTimeout(timer);
                report.closeWallMs = Date.now() - started;
            }
            if (child) {
                Object.assign(report.browserProcess, { exitCode: child.exitCode, signalCode: child.signalCode });
                if (!report.browserProcess.closeObserved || child.exitCode !== 0 || child.signalCode !== null)
                    report.status = 'FAIL';
            }
        }
        if (server) await server.close();
        if (report.inputSha256) {
            try {
                report.candidateUnchanged = JSON.stringify(inputs()) === JSON.stringify(report.inputSha256);
            } catch (error) {
                report.candidateUnchanged = false;
                report.fingerprintError = errorRecord(error);
            }
            if (!report.candidateUnchanged) report.status = 'FAIL';
        }
        report.collectorExitCode = report.status === 'PASS' ? 0 : 1;
        fs.writeFileSync(path.join(out, 'browser-process-log.json'), JSON.stringify(browserLog, null, 2) + '\n', {
            flag: 'wx',
        });
        fs.writeFileSync(path.join(out, 'page-console.json'), JSON.stringify(pageLog, null, 2) + '\n', { flag: 'wx' });
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify({ status: report.status, report: reportPath, exitCode: report.collectorExitCode }));
        process.exitCode = report.collectorExitCode;
    }
}
if (require.main === module)
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
