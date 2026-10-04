const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { verifyScreenshotPixels } = require('./screenshot-pixels.cjs');
const root = path.resolve(__dirname, '../..'), hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
async function main() {
    assert(process.argv[2]?.startsWith('--out='), '--out=<new.json> required');
    const output = path.resolve(root, process.argv[2].slice(6)); assert(!fs.existsSync(output), 'new report required');
    const artifacts = output.replace(/\.json$/, '-artifacts'); fs.mkdirSync(artifacts, { recursive: true });
    const files = ['src/air/app-config.ts', 'src/air/bootstrap.ts', 'src/air/safe-bootstrap.ts', 'src/air/ui-kit.ts',
        'src/cocos/2d/framework/canvas.ts', 'src/cocos/render-scene/scene/camera.ts', 'src/cocos/misc/camera-component.ts',
        'src/pal/screen-adapter/web/screen-adapter.js', 'tools/build/pal-source.cjs',
        'build/cocosair.module.js', 'build/bootstrap.js', 'test/fixtures/design-viewport/main.ts', 'test/fixtures/design-viewport/index.html',
        'tools/verify/air-design-viewport-browser.cjs', 'tools/verify/screenshot-pixels.cjs'];
    const fingerprints = Object.fromEntries(files.map((file) => [file, hash(file)])), results = [], startedAt = new Date().toISOString();
    const playwright = require('playwright'), server = await startExampleServer(root);
    try {
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            const browser = await playwright[engine].launch({ ...launchOptions(engine), headless: true });
            try {
                for (const profile of [{ id: 'dpr1', dpr: 1, cap: 2 }, { id: 'fractional', dpr: 3, cap: 1.25 }, { id: 'default', dpr: 3, cap: 2, omitCap: true }]) {
                    for (const size of [{ width: 978, height: 846 }, { width: 360, height: 780 }, { width: 1280, height: 540 }]) {
                    const context = await browser.newContext({ viewport: { width: 978, height: 846 }, deviceScaleFactor: profile.dpr });
                    const page = await context.newPage(), errors = []; page.on('pageerror', (e) => errors.push(String(e)));
                    try {
                        await page.goto(server.origin + '/test/fixtures/design-viewport/' + (profile.omitCap ? '' : '?cap=' + profile.cap));
                        await page.waitForFunction(() => window.__designProbe?.ready);
                            const initial = await page.evaluate(() => window.__designProbe.sample());
                            const density = Math.min(profile.dpr, profile.cap);
                            assert.deepEqual(initial.buffer, [Math.round(978 * density), Math.round(846 * density)], 'first-frame buffer');
                            await page.setViewportSize(size);
                            const expectedBuffer = [Math.round(size.width * density), Math.round(size.height * density)];
                            await page.waitForFunction((expected) => { const c = document.querySelector('canvas'); return c.width === expected[0] && c.height === expected[1]; }, expectedBuffer);
                            const observed = await page.evaluate(() => window.__designProbe.sample());
                            observed.initialBuffer = initial.buffer;
                            console.error('[design-observation] ' + JSON.stringify({ engine, profile: profile.id, size, observed }));
                            assert.deepEqual(observed.buffer, expectedBuffer); assert.equal(observed.bodyUnchanged, true); assert.deepEqual(observed.errors, []);
                            for (const point of observed.points) {
                                assert.deepEqual(point.pixel, point.color, point.id + ' complete viewport pixel');
                                assert(Math.abs(point.projected[0] - point.expected[0]) < 1 && Math.abs(point.projected[1] - point.expected[1]) < 1, point.id + ' projection');
                                assert.equal(point.hit, true, point.id + ' native hitTest');
                                await page.mouse.click(...point.click);
                                const hits = await page.evaluate(() => window.__designProbe.hits());
                                point.inputHits = hits;
                                assert.equal(hits.length, 1, point.id + ' one native hit'); assert.equal(hits[0].id, point.id);
                                for (const key of ['design', 'local']) hits[0][key].forEach((v, i) => assert(Math.abs(v - point.design[i]) <= 2.8, point.id + ' ' + key));
                            }
                            await page.mouse.click(size.width / 2, size.height / 2);
                            const outsideHits = await page.evaluate(() => window.__designProbe.hits());
                            assert.deepEqual(outsideHits, [], 'empty stage does not hit a corner target'); observed.outsideHits = outsideHits;
                            await page.evaluate(() => window.__designProbe.startPresentation());
                            // WebKit's Windows compositor settles the resized backing
                            // surface after the GL buffer itself has already resized.
                            // First-frame readPixels above stays separate from this
                            // delayed, presented screenshot check; no time advances.
                            await page.waitForTimeout(500); observed.presentationWarmupMs = 500;
                            const screenshot = path.join(artifacts, `${engine}-${profile.id}-${size.width}x${size.height}.png`);
                            const png = await page.screenshot({ path: screenshot });
                            await page.evaluate(() => window.__designProbe.stopPresentation());
                            observed.presentedPixels = await verifyScreenshotPixels(page, png, observed.points);
                            results.push({ engine, profile, size, status: 'PASS', browserVersion: browser.version(), observed, screenshot: path.relative(root, screenshot) });
                        assert.equal((await page.evaluate(() => window.__designProbe.release())).status, 'released'); assert.deepEqual(errors, []);
                    } catch (error) { results.push({ engine, profile, size, status: 'FAIL', error: String(error.stack || error) }); }
                    finally { await context.close(); }
                    }
                }
            } finally { await browser.close(); }
        }
        files.forEach((file) => assert.equal(hash(file), fingerprints[file], 'candidate drift: ' + file));
        const passed = results.length === 27 && results.every((r) => r.status === 'PASS');
        fs.writeFileSync(output, JSON.stringify({ startedAt, endedAt: new Date().toISOString(), command: process.argv, cwd: root,
            scope: ['PG-08/35 EXACT_FIT 978x846 full viewport, native projection and input hits, DPR cap first frame/resize'],
            subset: true, completed: false, scopePassed: passed, fingerprints, results }, null, 2) + '\n', { flag: 'wx' });
        process.exitCode = passed ? 0 : 1;
    } finally { await server.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
