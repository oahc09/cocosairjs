/* Focused built-runtime regression. No installs or builds. Use an already installed
 * Playwright via NODE_PATH. Run only in an exclusively assigned browser window:
 * node tools/verify/cocos4-ts-update-browser.cjs --browser=chromium --out=<new-directory>
 * Each attempt retains raw reports and screenshots. This is not full browser acceptance.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { parseArgs } = require('node:util');
const { verifySourceBinding } = require('../build/source-binding.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const { bounded } = require('./upstream-browser-lifecycle.cjs');
const root = path.resolve(__dirname, '../..');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function main() {
    const { values } = parseArgs({
        options: {
            browser: { type: 'string', default: 'chromium' },
            out: { type: 'string' },
            min: { type: 'boolean', default: false },
        },
    });
    if (!values.out || !['chromium', 'webkit'].includes(values.browser))
        throw Error('Require --out=<new-directory> and --browser=chromium|webkit');
    const out = path.resolve(values.out);
    fs.mkdirSync(out, { recursive: false });
    const bundle = path.join(root, values.min ? 'build/cocosair.module.min.js' : 'build/cocosair.module.js');
    const report = {
        schema: 'cocos4-ts-update-browser/1',
        startedAt: new Date().toISOString(),
        engine: values.browser,
        variant: values.min ? 'minified' : 'development',
        status: 'BLOCKED',
        runs: [],
        shutdown: {},
        scope: 'Focused real built-runtime UI, GPU and Worker regressions; not comprehensive acceptance or hardware performance',
    };
    let server, browserServer, browser, exited;
    function binding() {
        return {
            ...verifySourceBinding(root, bundle),
            bundleSha256: hash(bundle),
            receiptSha256: hash(bundle + '.sources.json'),
        };
    }
    try {
        report.before = binding();
        if (!report.before.matches) throw Error('Built bundle source binding is not current');
        report.inputs = [
            'tools/verify/cocos4-ts-update-browser.cjs',
            'tools/verify/browser-engines.cjs',
            'test/fixtures/cocos4-ts-update/index.html',
            'test/fixtures/cocos4-ts-update/main.js',
            'test/fixtures/worker/browser.html',
        ].map((file) => ({ file, sha256: hash(path.join(root, file)) }));
        server = http.createServer((req, res) => {
            try {
                let target = path.resolve(
                    root,
                    '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname),
                );
                if (target === path.join(root, 'build/cocosair.module.js')) target = bundle;
                if (!target.startsWith(root + path.sep) || !fs.statSync(target).isFile()) {
                    res.writeHead(404);
                    res.end();
                    return;
                }
                const type =
                    {
                        '.html': 'text/html',
                        '.js': 'text/javascript',
                        '.wasm': 'application/wasm',
                        '.json': 'application/json',
                    }[path.extname(target)] || 'application/octet-stream';
                res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
                fs.createReadStream(target).pipe(res);
            } catch {
                res.writeHead(404);
                res.end();
            }
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const base = `http://127.0.0.1:${server.address().port}`;
        const playwright = require('playwright');
        report.playwright = require('playwright/package.json').version;
        report.launch = { headless: true, ...launchOptions(values.browser), timeout: 30000 };
        browserServer = await playwright[values.browser].launchServer({ ...report.launch, env: loopbackBrowserEnv() });
        const child = browserServer.process();
        report.shutdown.pid = child.pid;
        exited = new Promise((resolve) =>
            child.once('close', (code, signal) => {
                Object.assign(report.shutdown, { closeObserved: true, code, signal });
                resolve();
            }),
        );
        browser = await playwright[values.browser].connect(browserServer.wsEndpoint());
        report.version = browser.version();
        for (const touch of [false, true]) {
            const run = { mode: touch ? 'touch' : 'mouse', console: [], pageErrors: [] };
            report.runs.push(run);
            const context = await browser.newContext({
                viewport: { width: 640, height: 480 },
                deviceScaleFactor: 1,
                hasTouch: touch,
            });
            const page = await context.newPage();
            page.on('console', (m) => run.console.push({ type: m.type(), text: m.text() }));
            page.on('pageerror', (e) => run.pageErrors.push(e.message));
            try {
                await page.goto(base + '/test/fixtures/cocos4-ts-update/index.html', {
                    waitUntil: 'load',
                    timeout: 60000,
                });
                await page.waitForFunction(() => window.cocos4Probe?.ready, null, { timeout: 60000 });
                if (touch) await page.touchscreen.tap(320, 420);
                else await page.mouse.click(320, 420);
                run.result = await page.evaluate(() => window.cocos4Probe.finish());
                await page.screenshot({ path: path.join(out, run.mode + '.png') });
                run.release = await page.evaluate(() => window.cocos4Probe.release());
                run.pass = run.result.ok && run.result.errors.length === 0 && run.pageErrors.length === 0;
            } catch (error) {
                run.error = String(error.stack || error);
                run.pass = false;
                await page
                    .screenshot({ path: path.join(out, run.mode + '-failure.png'), timeout: 3000 })
                    .catch(() => {});
            } finally {
                await bounded(() => context.close(), 5000, 'context close');
                fs.writeFileSync(path.join(out, run.mode + '.json'), JSON.stringify(run, null, 2) + '\n', {
                    flag: 'wx',
                });
            }
        }
        const worker = { mode: 'worker-wasm', pageErrors: [] };
        report.runs.push(worker);
        const page = await browser.newPage();
        page.on('pageerror', (e) => worker.pageErrors.push(e.message));
        await page.goto(base + '/test/fixtures/worker/browser.html');
        worker.result = await bounded(() => page.evaluate(() => window.workerRegression), 15000, 'Worker fixture');
        worker.pass = worker.result?.ok && worker.pageErrors.length === 0;
        await page.screenshot({ path: path.join(out, 'worker.png') });
        await page.close();
        fs.writeFileSync(path.join(out, 'worker.json'), JSON.stringify(worker, null, 2) + '\n', { flag: 'wx' });
        report.status = report.runs.every((run) => run.pass) ? 'PASS' : 'FAIL';
    } catch (error) {
        report.error = String(error.stack || error);
        report.status = 'FAIL';
    } finally {
        // One original four-second close budget, not a renewed timeout for each operation.
        report.shutdown.preCloseAt = new Date().toISOString();
        try {
            if (browserServer)
                await bounded(
                    async () => {
                        if (browser) await browser.close();
                        await browserServer.close();
                        await exited;
                    },
                    4000,
                    'physical browser close',
                );
        } catch (error) {
            report.shutdown.error = String(error);
            report.status = 'FAIL';
        }
        report.shutdown.closedAt = new Date().toISOString();
        if (
            browserServer &&
            (!report.shutdown.closeObserved || report.shutdown.code !== 0 || report.shutdown.signal !== null)
        )
            report.status = 'FAIL';
        if (server) {
            server.closeAllConnections();
            await new Promise((resolve) => server.close(resolve));
        }
        try {
            report.after = binding();
            if (!report.after.matches || JSON.stringify(report.before) !== JSON.stringify(report.after))
                report.status = 'FAIL';
        } catch (error) {
            report.afterError = String(error);
            report.status = 'FAIL';
        }
        report.finishedAt = new Date().toISOString();
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    }
    console.log(`${report.status}: ${path.join(out, 'report.json')}`);
    process.exitCode = report.status === 'PASS' ? 0 : 1;
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
