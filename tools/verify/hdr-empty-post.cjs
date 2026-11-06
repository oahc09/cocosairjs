/* Asset-free focused empty-scene HDR post regression. Keeps each raw attempt; does not publish canonical evidence. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const { serveStaticFile } = require('./static-file-response.cjs');

const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
        const split = arg.replace(/^--/, '').indexOf('=');
        const raw = arg.replace(/^--/, '');
        return split < 0 ? [raw, true] : [raw.slice(0, split), raw.slice(split + 1)];
    }),
);
if (typeof args.out !== 'string') throw Error('--out=<new-directory> is required');
const root = path.resolve(__dirname, '../..');
const out = path.resolve(root, args.out);
const fixture = path.join(root, 'test/fixtures/hdr-empty-post');
const bundle = path.resolve(root, args.bundle || 'build/cocosair.module.js');
const engine = args.browser || 'chromium';
if (!['chromium', 'webkit'].includes(engine)) throw Error('--browser must be chromium or webkit');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.mkdirSync(out);
const files = [bundle, __filename, path.join(fixture, 'main.js'), path.join(fixture, 'index.html')];
const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report = {
    timestamp: new Date().toISOString(),
    completed: false,
    passed: false,
    subset: true,
    scope: `asset-free ${engine} native first-three empty solid-color frames and post UBO binding; not release acceptance`,
    browserEngine: engine,
    sourceBindingScope:
        bundle === path.resolve(root, 'build/cocosair.module.js')
            ? 'current-source-required'
            : 'explicit-archived-bundle',
    bundle: { path: path.relative(root, bundle), sha256: digest(bundle) },
    fingerprints: Object.fromEntries(files.map((file) => [path.relative(root, file), digest(file)])),
    messages: [],
    errors: [],
    responses: [],
    screenshots: [],
};
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/favicon.ico') {
        res.writeHead(204);
        return res.end();
    }
    if (url.pathname === '/engine.js') return serveStaticFile(req, res, bundle, 'text/javascript');
    if (url.pathname === '/') return serveStaticFile(req, res, path.join(fixture, 'index.html'), 'text/html');
    if (url.pathname === '/main.js') return serveStaticFile(req, res, path.join(fixture, 'main.js'), 'text/javascript');
    res.writeHead(404);
    res.end('Not found');
});
const save = () => fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const timeout = setTimeout(() => {
    report.passed = false;
    report.completed = false;
    report.failure = 'Focused run exceeded original 120-second budget';
    save();
    process.exit(1);
}, 120000);
(async () => {
    let browser;
    try {
        const manifestPath = bundle + '.sources.json';
        const mapPath = bundle + '.map';
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const sourcePath = 'src/air/rendering/screen-effect.ts';
        const entry = manifest.sources.find((source) => source.path === sourcePath);
        report.sourceBinding = {
            file: sourcePath,
            matchesCurrentSource: entry?.sha256 === digest(path.join(root, sourcePath)),
            sourceSHA256: entry?.sha256,
            manifestBundleMatches: manifest.bundleSha256 === report.bundle.sha256,
            manifestMapMatches: manifest.mapSha256 === digest(mapPath),
            sourceMapSHA256: digest(mapPath),
        };
        report.sourceBindingPassed =
            report.sourceBinding.manifestBundleMatches &&
            report.sourceBinding.manifestMapMatches &&
            !!entry?.sha256 &&
            (report.sourceBindingScope === 'explicit-archived-bundle' || report.sourceBinding.matchesCurrentSource);
        for (const file of [manifestPath, mapPath]) {
            files.push(file);
            report.fingerprints[path.relative(root, file)] = digest(file);
        }
        if (!report.sourceBindingPassed) throw Error('SDK/source binding verification failed');
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const playwright = require(args.playwright || 'playwright');
        const options = { ...launchOptions(engine), headless: true, env: loopbackBrowserEnv() };
        report.browserLaunch = { executablePath: options.executablePath, args: options.args };
        browser = await playwright[engine].launch(options);
        report.browserVersion = browser.version();
        const page = await browser.newPage({ viewport: { width: 320, height: 240 }, deviceScaleFactor: 1 });
        page.on('pageerror', (error) => report.errors.push(String(error)));
        page.on('console', (message) => {
            report.messages.push({ type: message.type(), text: message.text() });
            if (message.type() === 'error') report.errors.push(message.text());
        });
        page.on('response', (response) => report.responses.push({ url: response.url(), status: response.status() }));
        await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => ['done', 'failed'].includes(window.proof?.state), null, { timeout: 30000 });
        report.result = await page.evaluate(() => window.proof);
        await page.screenshot({ path: path.join(out, 'first-three-frames.png') });
        report.screenshots.push('first-three-frames.png');
        if (report.result.state === 'failed') throw Error(report.result.failure);
        report.inputsUnchanged = files.every((file) => digest(file) === report.fingerprints[path.relative(root, file)]);
        report.completed = true;
        report.passed =
            report.result.passed &&
            report.sourceBindingPassed &&
            report.inputsUnchanged &&
            report.errors.length === 0 &&
            report.responses.every((response) => response.status < 400);
        if (!report.passed) process.exitCode = 1;
    } catch (error) {
        report.passed = false;
        report.completed = false;
        report.failure = String(error.stack || error);
        process.exitCode = 1;
    } finally {
        try {
            if (browser) {
                await browser.close();
                report.shutdown = 'browser.close acknowledged; OS ECHILD not measured; focused non-canonical run';
            }
        } catch (error) {
            report.passed = false;
            report.completed = false;
            report.shutdownFailure = String(error.stack || error);
            process.exitCode = 1;
        }
        try {
            await new Promise((resolve, reject) =>
                server.close((error) => {
                    if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
                    else resolve();
                }),
            );
        } catch (error) {
            report.passed = false;
            report.completed = false;
            report.serverShutdownFailure = String(error.stack || error);
            process.exitCode = 1;
        } finally {
            clearTimeout(timeout);
            save();
        }
        console.log(
            JSON.stringify({
                completed: report.completed,
                passed: report.passed,
                sdkSHA256: report.bundle.sha256,
                failedChecks: report.result?.checks?.filter((check) => !check.pass),
                failure: report.failure,
                out,
            }),
        );
    }
})();
