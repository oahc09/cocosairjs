const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const browserName = process.argv.find((value) => value.startsWith('--browser='))?.slice(10) || 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(browserName)) throw Error('Unsupported --browser');
const { launchOwnedBrowser, bounded } = require('./upstream-browser-lifecycle.cjs');
const root = path.resolve(__dirname, '../..');
const requested = process.argv.find((value) => value.startsWith('--out='))?.slice(6);
if (!requested) throw new Error('--out=<new directory> required');
const out = path.resolve(requested);
if (fs.existsSync(out)) throw new Error('output exists; preserve previous attempts');
fs.mkdirSync(out, { recursive: true });
const hash = (file) =>
    crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, file)))
        .digest('hex');
const report = {
    status: 'NOT_RUN',
    startedAt: new Date().toISOString(),
    browserName,
    scope: 'U04 explicit-browser state/target subset; not transmission/mobile/full plan acceptance',
    fingerprints: Object.fromEntries(
        [
            'build/cocosair.module.js',
            'tools/verify/upstream-state-isolation.cjs',
            'tools/verify/upstream-browser-lifecycle.cjs',
            'tools/verify/browser-engines.cjs',
            'tools/verify/competitive-example-server.cjs',
            'test/fixtures/upstream-state-isolation/main.js',
            'test/fixtures/upstream-state-isolation/index.html',
        ].map((file) => [file, hash(file)]),
    ),
    rows: [],
};
(async () => {
    let server, browser, owned;
    try {
        server = await startExampleServer(root);
        try {
            owned = await launchOwnedBrowser(
                require('playwright')[browserName],
                {
                    headless: true,
                    ...launchOptions(browserName),
                },
                report,
            );
            browser = owned.browser;
        } catch (error) {
            report.status = 'INFRA_BLOCKED';
            throw error;
        }
        report.browserVersion = browser.version();
        for (const dpr of [1, 2]) {
            const context = await browser.newContext({ viewport: { width: 640, height: 320 }, deviceScaleFactor: dpr });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', (error) => errors.push(String(error.stack || error)));
            try {
                await page.goto(server.origin + '/test/fixtures/upstream-state-isolation/');
                await page.waitForFunction(() => window.__upstreamState?.ready, undefined, { timeout: 20000 });
                const row = await page.evaluate(() => window.__upstreamState.run());
                row.screenshot = `dpr-${dpr}.png`;
                await page.screenshot({ path: path.join(out, row.screenshot) });
                row.close = await page.evaluate(() => window.__upstreamState.close());
                for (const receipt of Object.values(row.close))
                    if (receipt.status !== 'released' || receipt.pending.length || receipt.failures.length)
                        throw Error('Runtime cleanup incomplete');
                row.screenshotSha256 = crypto
                    .createHash('sha256')
                    .update(fs.readFileSync(path.join(out, row.screenshot)))
                    .digest('hex');
                row.pageErrors = errors;
                if (errors.length || row.glError !== 0) row.status = 'FAIL';
                report.rows.push(row);
            } finally {
                await bounded(() => context.close(), 4000, 'context close');
            }
        }
        for (const [file, digest] of Object.entries(report.fingerprints))
            if (hash(file) !== digest) throw Error('Inputs changed during collection: ' + file);
        report.status = report.rows.length === 2 && report.rows.every((row) => row.status === 'PASS') ? 'PASS' : 'FAIL';
    } catch (error) {
        if (report.status !== 'INFRA_BLOCKED') report.status = 'FAIL';
        report.error = String(error.stack || error);
    } finally {
        try {
            if (owned) await owned.close();
            report.browserClosed = !!browser;
        } catch (error) {
            report.status = 'FAIL';
            report.browserCloseError = String(error);
        }
        try {
            if (server) await bounded(() => server.close(), 4000, 'server close');
            report.serverClosed = !!server;
        } catch (error) {
            report.status = 'FAIL';
            report.serverCloseError = String(error);
        }
        report.finishedAt = new Date().toISOString();
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify(report, null, 2));
        if (report.status !== 'PASS') process.exitCode = 1;
    }
})();
