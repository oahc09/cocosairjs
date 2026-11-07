/* Asset-free focused readback. Requires a fresh output directory; preserves every attempt. */
const fs = require('fs'),
    http = require('http'),
    path = require('path'),
    crypto = require('crypto');
const root = path.resolve(__dirname, '../..');
const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
        const split = arg.indexOf('=');
        return [arg.slice(2, split), arg.slice(split + 1)];
    }),
);
if (!args.out) throw Error('--out=<new-directory> is required');
const output = path.resolve(root, args.out);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.mkdirSync(output);
const { launchOptions } = require('./browser-engines.cjs');
const pw = require(args.playwright || 'playwright');
const { loopbackBrowserEnv } = require(path.join(root, 'tools/verify/loopback-browser-env.cjs'));
const engine = args.browser || 'chromium';
if (!['chromium', 'webkit'].includes(engine)) throw Error('Expected chromium or webkit');
const bundle = path.resolve(root, args.bundle || 'build/cocosair.module.js');
const out = path.join(output, 'report.json');
const { verifySourceBinding } = require('../build/source-binding.cjs');
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const report = {
    timestamp: new Date().toISOString(),
    engine,
    scope: 'Focused native Texture2D RGBA8 mip-level GPU readback; not full release acceptance',
    bundleSHA256: hash(bundle),
    fixtureSHA256: hash(path.join(root, 'test/fixtures/explicit-mipmaps/main.js')),
    collectorSHA256: hash(__filename),
    htmlSHA256: hash(path.join(root, 'test/fixtures/explicit-mipmaps/index.html')),
    sourceBinding: verifySourceBinding(root, bundle),
    subset: true,
    errors: [],
    completed: false,
    passed: false,
};
const server = http.createServer((req, res) => {
    let file;
    if (req.url === '/engine.js') file = bundle;
    else if (req.url === '/fixture/main.js') file = path.join(root, 'test/fixtures/explicit-mipmaps/main.js');
    else if (req.url === '/') file = path.join(root, 'test/fixtures/explicit-mipmaps/index.html');
    else {
        if (req.url === '/favicon.ico') {
            res.writeHead(204);
        } else {
            res.writeHead(404);
        }
        return res.end();
    }
    res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : 'text/javascript');
    res.end(fs.readFileSync(file));
});
let browser, bs, exit;
(async () => {
    try {
        if (!report.sourceBinding.matches) throw Error('Runtime/source binding must match before GPU validation');
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        const options = { ...launchOptions(engine), headless: true, env: loopbackBrowserEnv() };
        if (args.executable) options.executablePath = path.resolve(args.executable);
        report.browserLaunch = { executablePath: options.executablePath, args: options.args };
        bs = await pw[engine].launchServer(options);
        report.pid = bs.process().pid;
        exit = new Promise((resolve) => bs.process().once('exit', (code, signal) => resolve({ code, signal })));
        browser = await pw[engine].connect(bs.wsEndpoint(), { timeout: 30000 });
        report.version = browser.version();
        const page = await browser.newPage({ viewport: { width: 32, height: 32 } });
        page.on('pageerror', (e) => report.errors.push(String(e)));
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(() => ['complete', 'failed'].includes(window.__mipmaps?.state), null, {
            timeout: 30000,
        });
        report.result = await page.evaluate(() => window.__mipmaps);
        report.inputsUnchanged =
            hash(bundle) === report.bundleSHA256 &&
            hash(path.join(root, 'test/fixtures/explicit-mipmaps/main.js')) === report.fixtureSHA256;
        report.sourceBindingAfter = verifySourceBinding(root, bundle);
        report.completed = true;
        report.passed =
            report.result.passed &&
            report.errors.length === 0 &&
            report.inputsUnchanged &&
            report.sourceBindingAfter.matches;
    } catch (e) {
        report.failure = String(e.stack || e);
    } finally {
        if (bs) {
            const start = Date.now();
            report.preCloseBoundary = true;
            let timer;
            try {
                report.shutdown = await Promise.race([
                    Promise.all([bs.close(), exit]).then(([, status]) => ({ acknowledged: true, rootExit: status })),
                    new Promise((_, reject) => {
                        timer = setTimeout(() => reject(Error('original 4-second close budget exceeded')), 4000);
                    }),
                ]);
            } catch (e) {
                report.shutdown = { failure: String(e) };
                report.passed = false;
                // Cleanup after the original budget does not convert the failed close into a pass.
                await bs.kill();
            } finally {
                clearTimeout(timer);
            }
            report.shutdown.elapsedMs = Date.now() - start;
            if (report.shutdown.rootExit?.code !== 0 || report.shutdown.rootExit?.signal !== null)
                report.passed = false;
            report.shutdown.scope =
                'BrowserServer close and root process exit observed; full descendant ECHILD not measured, non-canonical focused probe';
        }
        await new Promise((r) => server.close(r));
        fs.writeFileSync(out, JSON.stringify(report, null, 2));
        console.log(
            JSON.stringify({
                out,
                completed: report.completed,
                passed: report.passed,
                failure: report.failure,
                errors: report.errors,
                cases: report.result?.cases.map((c) => ({
                    kind: c.kind,
                    order: c.order,
                    pass: c.pass,
                    levels: c.levels.map((l) => l.actual),
                })),
                shutdown: report.shutdown,
            }),
        );
        if (!report.passed) process.exitCode = 1;
    }
})();
