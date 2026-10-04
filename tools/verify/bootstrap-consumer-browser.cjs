const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { verifyScreenshotPixels } = require('./screenshot-pixels.cjs');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
exports.verify = async function ({ root, built, out, tarballPath }) {
    assert(built, 'installed consumer bundle required');
    const startedAt = new Date().toISOString();
    const outputs = new Map(built.outputFiles.map((file) => [path.basename(file.path), file.text]));
    const entry = Object.entries(built.metafile.outputs).find(([, value]) => value.exports.includes('createAirApp') && value.exports.includes('loadRuntime'));
    assert(entry, 'consumer entry point required');
    const runtime = Object.entries(built.metafile.outputs).filter(([, value]) => Object.keys(value.inputs).some((file) => /build[\\/]npm[\\/]cocosair\.module\.js$/.test(file))).map(([file]) => path.basename(file));
    assert(runtime.length, 'installed runtime chunk required');
    const artifacts = out.replace(/\.json$/, '') + '-artifacts';
    fs.mkdirSync(artifacts, { recursive: true });
    const server = await startExampleServer(root), results = [];
    try {
        const playwright = require('playwright');
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            let browser;
            try {
                if (engine === 'webkit') assert(fs.existsSync(playwright.webkit.executablePath()), 'matching WebKit required');
                browser = await playwright[engine].launch({ ...launchOptions(engine), headless: true });
                const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 3 });
                const page = await context.newPage(), requests = [], errors = [];
                page.on('request', (request) => requests.push(new URL(request.url()).pathname));
                page.on('pageerror', (error) => errors.push(String(error)));
                await page.route((url) => url.pathname.startsWith('/installed/') && url.pathname.endsWith('.js'), (route) => {
                    const name = path.basename(new URL(route.request().url()).pathname);
                    return outputs.has(name) ? route.fulfill({ contentType: 'text/javascript', body: outputs.get(name) }) : route.abort();
                });
                await page.goto(`${server.origin}/test/fixtures/safe-bootstrap/?entry=/installed/${path.basename(entry[0])}`);
                await page.waitForFunction(() => window.__safeBootstrapProbe?.ready);
                const invalid = await page.evaluate(() => window.__safeBootstrapProbe.invalid());
                assert(invalid.unchanged); assert(invalid.codes.every((code) => code.startsWith('AIR_E_')));
                assert(!requests.some((file) => runtime.includes(path.basename(file))), 'engine requested before valid startup');
                const startup = await page.evaluate(() => window.__safeBootstrapProbe.start());
                assert(startup.sharedPromise && startup.sameApp && !startup.focus);
                assert(startup.colored > 100); assert.deepEqual(startup.buffer, [1000, 750]);
                assert(requests.some((file) => runtime.includes(path.basename(file))), 'installed runtime chunk was not loaded');
                assert(!requests.some((file) => file.startsWith('/build/')), 'workspace engine substituted for installed package');
                const released = await page.evaluate(() => window.__safeBootstrapProbe.release());
                assert.equal(released.receipt.status, 'released'); assert.equal(released.scene, null); assert(!released.tokenCurrent);
                await page.setViewportSize({ width: 360, height: 780 });
                await page.waitForFunction(() => { const c = document.querySelector('canvas'); return c.width === 450 && c.height === 975; });
                const viewport = await page.evaluate(() => window.__safeBootstrapProbe.viewport());
                assert.deepEqual(viewport.buffer, [450, 975]); assert.equal(viewport.orthoWidth, 320); assert.equal(viewport.orthoHeight, 240);
                for (const point of viewport.points) {
                    assert.deepEqual(point.pixel, point.color, point.id + ' installed UI pixel'); assert(point.hit);
                    point.projected.forEach((v, i) => assert(Math.abs(v - point.expected[i]) < 1, point.id + ' projection'));
                    await page.mouse.click(...point.click); const hits = await page.evaluate(() => window.__safeBootstrapProbe.viewportHits());
                    point.inputHits = hits; assert.equal(hits.length, 1); assert.equal(hits[0].id, point.id);
                    hits[0].design.forEach((v, i) => assert(Math.abs(v - point.design[i]) < 2, point.id + ' installed input coordinate'));
                }
                await page.evaluate(() => window.__safeBootstrapProbe.startViewportPresentation());
                await page.waitForTimeout(500); viewport.presentationWarmupMs = 500;
                const viewportScreenshot = path.join(artifacts, `${engine}-portrait-ui.png`);
                const viewportPNG = await page.screenshot({ path: viewportScreenshot });
                await page.evaluate(() => window.__safeBootstrapProbe.stopViewportPresentation());
                viewport.presentedPixels = await verifyScreenshotPixels(page, viewportPNG, viewport.points);
                const viewportReleased = await page.evaluate(() => window.__safeBootstrapProbe.release());
                assert.equal(viewportReleased.receipt.status, 'released'); assert.equal(viewportReleased.scene, null);
                assert(!requests.some((file) => file.startsWith('/build/')), 'workspace engine substituted during UI verification');
                const closed = await page.evaluate(() => window.__safeBootstrapProbe.close());
                assert.equal(closed.receipt.status, 'released'); assert.equal(closed.code, 'AIR_E_APP_CLOSED');
                assert.deepEqual(errors, []);
                results.push({ engine, status: 'PASS', browserVersion: browser.version(), invalid, startup, released, viewport, viewportReleased, closed, requests,
                    viewportScreenshot: path.relative(root, viewportScreenshot).replace(/\\/g, '/'),
                    screenshot: path.relative(root, viewportScreenshot).replace(/\\/g, '/') });
            } catch (error) { results.push({ engine, status: 'FAIL', error: String(error.stack || error) }); }
            finally { if (browser) await browser.close(); }
            console.error('[bootstrap-consumer] ' + engine + ' ' + results.at(-1).status);
        }
        const report = { startedAt, endedAt: new Date().toISOString(), subset: true,
            scope: ['installed tarball bootstrap bundled consumer startup/render/release', 'installed EXACT_FIT portrait UI pixels/projection/real input'],
            completed: false, scopePassed: results.length === 3 && results.every((result) => result.status === 'PASS'),
            tarballSha256: sha(fs.readFileSync(tarballPath)),
            fixtureSha256: sha(fs.readFileSync(path.join(root, 'test/fixtures/safe-bootstrap/main.ts'))),
            runnerSha256: sha(fs.readFileSync(__filename)),
            screenshotVerifierSha256: sha(fs.readFileSync(path.join(__dirname, 'screenshot-pixels.cjs'))),
            chunks: [...outputs].map(([name, body]) => ({ name, bytes: Buffer.byteLength(body), sha256: sha(body) })), results };
        fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        return report;
    } finally { await server.close(); }
};
