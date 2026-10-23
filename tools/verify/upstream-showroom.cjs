// Opt-in real explicit-browser desktop/mobile-viewport interaction collection, not a physical-mobile or full Gallery gate.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PNG } = require('pngjs');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const browserName = process.argv.find((value) => value.startsWith('--browser='))?.slice(10) || 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(browserName)) throw Error('Unsupported --browser');
const { launchOwnedBrowser, bounded } = require('./upstream-browser-lifecycle.cjs');
const root = path.resolve(__dirname, '../..');
const requested = process.argv.find((value) => value.startsWith('--out='))?.slice(6);
if (!requested) throw new Error('--out=<fresh directory> required');
const out = path.resolve(requested);
if (fs.existsSync(out)) throw new Error('Output exists; retain every previous attempt.');
fs.mkdirSync(out, { recursive: true });
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const files = [
    'build/cocosair.module.js',
    'tools/verify/upstream-showroom.cjs',
    'tools/verify/upstream-browser-lifecycle.cjs',
    'tools/verify/browser-engines.cjs',
    'tools/verify/competitive-example-server.cjs',
    'examples/material-inspection-showroom/src/showroom.ts',
    'examples/material-inspection-showroom/src/controls.ts',
    'examples/material-inspection-showroom/style.css',
    'examples/shared/asset-lifecycle.js',
    'examples/shared/canvas-coordinates.ts',
];
for (const name of fs.readdirSync(path.join(root, 'examples/material-inspection-showroom/assets')))
    files.push('examples/material-inspection-showroom/assets/' + name);
const report = {
    schema: 'upstream-showroom-browser/1',
    startedAt: new Date().toISOString(),
    browserName,
    status: 'NOT_RUN',
    scope: 'U09 shared showroom only; all eight full examples, physical mobile GPUs and release gate remain separate',
    fingerprints: Object.fromEntries(files.map((file) => [file, hash(fs.readFileSync(path.join(root, file)))])),
    rows: [],
};
function check(row, name, condition, details) {
    row.checks.push({ name, pass: !!condition, details });
}
function imageDiff(a, b) {
    const x = PNG.sync.read(a),
        y = PNG.sync.read(b);
    if (x.width !== y.width || x.height !== y.height) throw new Error('Screenshot sizes differ');
    let changed = 0,
        nonBackground = 0;
    for (let i = 0; i < x.data.length; i += 4) {
        if ([0, 1, 2].some((c) => Math.abs(x.data[i + c] - y.data[i + c]) > 2)) changed++;
        if (x.data[i] > 45 || x.data[i + 1] > 45 || x.data[i + 2] > 45) nonBackground++;
    }
    return { changed, nonBackground, pixels: x.width * x.height, before: hash(a), after: hash(b) };
}
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
        const profiles = [
            { id: 'desktop-dpr1', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
            { id: 'desktop-dpr2', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 },
            {
                id: 'mobile-viewport-dpr2',
                viewport: { width: 390, height: 844 },
                deviceScaleFactor: 2,
                ...(browserName === 'firefox' ? {} : { isMobile: true }),
                hasTouch: true,
            },
        ];
        for (const { id, ...profile } of profiles) {
            // Firefox lacks Playwright isMobile emulation; viewport/touch remain explicit, never physical-device proof.
            const context = await browser.newContext(profile),
                page = await context.newPage();
            const row = { id, profile, checks: [], errors: [], requests: [], responses: [], status: 'NOT_RUN' };
            report.rows.push(row);
            page.on('pageerror', (error) => row.errors.push(String(error.stack || error)));
            page.on('request', (request) => {
                if (request.url().includes('/assets/'))
                    row.requests.push({ url: request.url(), method: request.method(), headers: request.headers() });
            });
            page.on('response', (response) => {
                if (response.url().includes('/assets/'))
                    row.responses.push({ url: response.url(), status: response.status() });
            });
            try {
                await page.goto(server.origin + '/examples/material-inspection-showroom/');
                await page.waitForFunction(
                    () =>
                        window.__inspection?.state().phase === 'scene-mounted' &&
                        window.__inspection.state().transmissionBound,
                    undefined,
                    { timeout: 30000 },
                );
                await page.evaluate(async () => {
                    window.__inspection.freeze();
                    await window.__inspection.frame();
                });
                row.initial = await page.evaluate(() => window.__inspection.state());
                check(
                    row,
                    'real WebGL2, three rigs, twelve samples and two distinct targets',
                    row.initial.backend === 'webgl2' &&
                        row.initial.liveInstances === 3 &&
                        row.initial.materialSamples === 12 &&
                        row.initial.targets.length === 2 &&
                        row.initial.transmissionBound,
                    row.initial,
                );
                const canvas = page.locator('#GameCanvas');
                const before = await canvas.screenshot();
                fs.writeFileSync(path.join(out, `${id}-before.png`), before);
                await canvas.scrollIntoViewIfNeeded();
                let point = await page.evaluate(() => window.__inspection.pickPoint('sample-4'));
                if (!point) throw new Error('Native projected sample has no bounds');
                if (profile.hasTouch) await page.touchscreen.tap(point.x, point.y);
                else await page.mouse.click(point.x, point.y);
                await page.evaluate(() => window.__inspection.frame());
                let current = await page.evaluate(() => window.__inspection.state());
                check(
                    row,
                    'real pointer/touch hits projected AABB at configured DPR',
                    current.selected === 'sample-4' &&
                        current.log.some((e) => e.event === 'pointer-pick' && e.hit === 'sample-4'),
                    { point, selected: current.selected },
                );
                await page.locator('#red').fill('0.05');
                await page.locator('#green').fill('0.95');
                await page.locator('#blue').fill('0.1');
                await page.locator('#uvScale').fill('2');
                await page.locator('#uvRotation').fill('0.7');
                await page.locator('#ior').fill('2.5');
                await page.locator('#apply').click();
                await page.evaluate(() => window.__inspection.frame());
                current = await page.evaluate(() => window.__inspection.state());
                const after = await canvas.screenshot();
                fs.writeFileSync(path.join(out, `${id}-material.png`), after);
                const difference = imageDiff(before, after);
                check(
                    row,
                    'native uniform mutation plus compositor image change',
                    current.film?.y === 2.5 &&
                        current.uv?.x !== row.initial.uv?.x &&
                        difference.changed > 4 &&
                        difference.nonBackground > 32,
                    difference,
                );
                const priorFilm = current.film;
                await page.locator('#ior').fill('0.9');
                await page.locator('#apply').click();
                current = await page.evaluate(() => window.__inspection.state());
                check(
                    row,
                    'invalid IOR rejected without material mutation',
                    current.error.includes('IOR') && JSON.stringify(current.film) === JSON.stringify(priorFilm),
                    current.error,
                );
                await page.locator('#ior').fill('1.3');
                await page.locator('#apply').click();
                await page.locator('#selection').selectOption('rig-1');
                const previous = await page.evaluate(() => window.__inspection.state());
                await page.locator('#step').click();
                await page.evaluate(() => window.__inspection.frame());
                current = await page.evaluate(() => window.__inspection.state());
                check(
                    row,
                    'single-step only selected native animation',
                    current.instances[1].paused &&
                        Math.abs(current.instances[1].time - previous.instances[1].time - 1 / 60) < 1e-5 &&
                        current.instances[0].time === previous.instances[0].time &&
                        current.instances[2].time === previous.instances[2].time,
                    { previous: previous.instances, current: current.instances },
                );
                await page.locator('#destroy').click();
                await page.evaluate(async () => {
                    await window.__inspection.frame();
                    await Promise.resolve();
                    await window.__inspection.frame();
                });
                check(
                    row,
                    'selected destruction preserves two others',
                    (await page.evaluate(() => window.__inspection.state())).liveInstances === 2,
                );
                await page.locator('#rebuild').click();
                await page.evaluate(() => window.__inspection.frame());
                check(
                    row,
                    'selected rebuild restores third instance',
                    (await page.evaluate(() => window.__inspection.state())).liveInstances === 3,
                );
                // Actual CSS container resize, not only a fabricated click coordinate.
                await page.evaluate(() => {
                    document.querySelector('.stage').style.width = '83%';
                });
                await page.waitForFunction(
                    () =>
                        Math.abs(
                            document.querySelector('#GameCanvas').width -
                                document.querySelector('#GameCanvas').getBoundingClientRect().width *
                                    Math.min(devicePixelRatio, 2),
                        ) <= 2,
                );
                await page.evaluate(() => window.__inspection.frame());
                await canvas.scrollIntoViewIfNeeded();
                point = await page.evaluate(() => window.__inspection.pickPoint('sample-2'));
                if (!point) throw new Error('Missing bounds after container resize');
                if (profile.hasTouch) await page.touchscreen.tap(point.x, point.y);
                else await page.mouse.click(point.x, point.y);
                check(
                    row,
                    'native picking survives container resize',
                    (await page.evaluate(() => window.__inspection.state())).selected === 'sample-2',
                    point,
                );
                await page.evaluate(() => window.__inspection.resume());
                // Intercept the real local image request for one dependency-delay cancellation; never claim this is priority timing evidence.
                let intercepted = false,
                    releaseRequest;
                const delayed = new Promise((resolve) => {
                    releaseRequest = resolve;
                });
                await page.route('**/material-inspection-showroom/assets/checker.png', async (route) => {
                    intercepted = true;
                    await delayed;
                    try {
                        await route.continue();
                    } catch (_) {
                        /* A cancelled browser request may already be closed. */
                    }
                });
                await page.locator('#httpCache').selectOption('no-store');
                await page.locator('#retry').click();
                const start = Date.now();
                while (!intercepted && Date.now() - start < 10000)
                    await new Promise((resolve) => setTimeout(resolve, 50));
                if (!intercepted) {
                    releaseRequest();
                    throw new Error('Real image dependency was not intercepted');
                }
                await page.locator('#cancel').click();
                releaseRequest();
                await page.waitForFunction(() => window.__inspection.state().phase === 'cancelled');
                await page.unroute('**/material-inspection-showroom/assets/checker.png');
                current = await page.evaluate(() => window.__inspection.state());
                check(
                    row,
                    'dependency cancellation terminal with no late attachment',
                    current.liveInstances === 0 && current.materialSamples === 0,
                    current,
                );
                await page.locator('#retry').click();
                await page.waitForFunction(() => window.__inspection.state().phase === 'scene-mounted');
                check(
                    row,
                    'retry after cancellation mounts current generation',
                    (await page.evaluate(() => window.__inspection.state())).liveInstances === 3,
                );
                row.lifecycle = await page.evaluate(() => window.__inspection.runCycles());
                check(
                    row,
                    'thirty settled native ownership cycles',
                    row.lifecycle.status === 'PASS' && row.lifecycle.cycles.length === 30,
                    row.lifecycle,
                );
                row.close = await page.evaluate(() => window.__inspection.close());
                const closed = await page.evaluate(() => window.__inspection.state());
                check(
                    row,
                    'close physically releases owned listener registrations',
                    closed.listeners === 0 &&
                        closed.liveInstances === 0 &&
                        closed.materialSamples === 0 &&
                        row.close.status === 'released',
                    { close: row.close, closed },
                );
                check(row, 'no unhandled page errors', row.errors.length === 0, row.errors);
                row.status = row.checks.every((check) => check.pass) ? 'PASS' : 'FAIL';
            } catch (error) {
                row.status = 'FAIL';
                row.error = String(error.stack || error);
                try {
                    row.partialState = await page.evaluate(() => window.__inspection?.state());
                    row.partialCycles = await page.evaluate(() => window.__inspection?.cycleObservations());
                } catch (partialError) {
                    row.partialCollectionError = String(partialError);
                }
            } finally {
                try {
                    await bounded(() => context.close(), 4000, 'context close');
                    row.contextClosed = true;
                } catch (error) {
                    row.status = 'FAIL';
                    row.closeError = String(error);
                }
            }
        }
        for (const [file, digest] of Object.entries(report.fingerprints))
            if (hash(fs.readFileSync(path.join(root, file))) !== digest)
                throw Error('Inputs changed during collection: ' + file);
        report.status = report.rows.length === 3 && report.rows.every((row) => row.status === 'PASS') ? 'PASS' : 'FAIL';
    } catch (error) {
        if (report.status !== 'INFRA_BLOCKED') report.status = 'FAIL';
        report.error = String(error.stack || error);
    } finally {
        for (const [name, object] of [
            ['browser', owned],
            ['server', server],
        ]) {
            try {
                if (object) await bounded(() => object.close(), 15000, name + ' close');
                report[name + 'Closed'] = !!object;
            } catch (error) {
                report.status = 'FAIL';
                report[name + 'CloseError'] = String(error);
            }
        }
        report.finishedAt = new Date().toISOString();
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify(report, null, 2));
        if (report.status !== 'PASS') process.exitCode = 1;
    }
})();
