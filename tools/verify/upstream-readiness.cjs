const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PNG } = require('pngjs');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const browserName = process.argv.find((value) => value.startsWith('--browser='))?.slice(10) || 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(browserName)) throw Error('Unsupported --browser');
const { launchOwnedBrowser, bounded } = require('./upstream-browser-lifecycle.cjs');
const { verifySourceBinding } = require('../build/source-binding.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const root = path.resolve(__dirname, '../..');
const bundle = path.resolve(
    root,
    process.argv.find((value) => value.startsWith('--bundle='))?.slice(9) || 'build/cocosair.module.js',
);
if (!bundle.startsWith(root + path.sep)) throw new Error('candidate bundle must be inside checkout');
const bundlePath = path.relative(root, bundle).split(path.sep).join('/');
const bundleURL = '/' + bundlePath.split('/').map(encodeURIComponent).join('/');
const sourceBinding = verifySourceBinding(root, bundle);
if (!sourceBinding.matches) throw new Error('bundle must bind current source bytes');
const request = process.argv.find((value) => value.startsWith('--out='))?.slice(6);
if (!request) throw new Error('--out=<new directory> required');
const out = path.resolve(request);
if (fs.existsSync(out)) throw new Error('output exists; preserve all previous attempts');
fs.mkdirSync(out, { recursive: true });
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const files = [
    bundlePath,
    bundlePath + '.map',
    bundlePath + '.sources.json',
    'tools/debug/readiness-observer.ts',
    'tools/verify/upstream-readiness.cjs',
    'tools/verify/upstream-browser-lifecycle.cjs',
    'tools/verify/browser-engines.cjs',
    'tools/verify/competitive-example-server.cjs',
    'test/fixtures/upstream-readiness/main.js',
    'test/fixtures/upstream-readiness/index.html',
    'test/fixtures/upstream-skinning/rig.gltf',
];
const report = {
    status: 'NOT_RUN',
    startedAt: new Date().toISOString(),
    scope: 'Browser screenshot attribution in a controlled WebGL2 fixture; not hardware presentation or complete scene coverage',
    sourceBinding,
    browserName,
    fingerprints: Object.fromEntries(files.map((file) => [file, sha(fs.readFileSync(path.join(root, file)))])),
    rows: [],
};
(async () => {
    let browser, server, owned;
    try {
        server = await startExampleServer(root);
        try {
            owned = await launchOwnedBrowser(
                require('playwright')[browserName],
                {
                    headless: true,
                    ...launchOptions(browserName),
                    env: loopbackBrowserEnv(),
                },
                report,
            );
            browser = owned.browser;
        } catch (error) {
            report.status = 'INFRA_BLOCKED';
            throw error;
        }
        report.browserVersion = browser.version();
        for (const mode of [
            'cold',
            'delayed-resource',
            'offscreen',
            'shader-failure',
            'context-lost',
            'later-frame-control',
        ]) {
            const context = await browser.newContext({ viewport: { width: 640, height: 320 }, deviceScaleFactor: 1 });
            const page = await context.newPage();
            const row = { mode, status: 'NOT_RUN', errors: [], console: [] };
            report.rows.push(row);
            page.on('pageerror', (error) => row.errors.push(String(error.stack || error)));
            page.on('console', (message) => row.console.push({ type: message.type(), text: message.text() }));
            try {
                const url = `${server.origin}/test/fixtures/upstream-readiness/?case=${mode}`;
                const html = fs.readFileSync(path.join(root, 'test/fixtures/upstream-readiness/index.html'), 'utf8');
                await page.route(url, (route) =>
                    route.fulfill({
                        contentType: 'text/html',
                        body: html.replace('/build/cocosair.module.js', bundleURL),
                    }),
                );
                const [sdkResponse] = await Promise.all([
                    page.waitForResponse(server.origin + bundleURL, { timeout: 20000 }),
                    page.goto(url),
                ]);
                if (!sdkResponse.ok() || sha(await sdkResponse.body()) !== report.fingerprints[bundlePath])
                    throw Error('Browser did not load the selected candidate bytes');
                await page.waitForFunction(
                    () =>
                        (window.__readiness?.submission && window.__readiness.captureReady) ||
                        window.__readiness?.report,
                    undefined,
                    { timeout: 20000 },
                );
                const snapshot = await page.evaluate(() => ({
                    submission: window.__readiness.submission,
                    readback: window.__readiness.readback,
                    firstMarker: window.__readiness.firstMarker,
                    drawOrdinal: window.__readiness.drawOrdinal,
                    report: window.__readiness.report,
                }));
                if (snapshot.submission && !snapshot.report) {
                    const bytes = await page.locator('canvas').screenshot();
                    const png = PNG.sync.read(bytes);
                    row.screenshot = `${mode}.png`;
                    fs.writeFileSync(path.join(out, row.screenshot), bytes);
                    const offset = (Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4;
                    const center = [...png.data.subarray(offset, offset + 4)];
                    const expected = snapshot.readback;
                    const centerMatches =
                        expected?.length === 4 &&
                        expected[0] > 100 &&
                        expected[3] > 250 &&
                        center.every((value, index) => Math.abs(value - expected[index]) <= 2);
                    const marker = [...png.data.subarray((8 * png.width + 8) * 4, (8 * png.width + 9) * 4)];
                    const markerColor = ([r, g, b, a] = []) =>
                        a > 250 && r < 32
                            ? g > 224 && b < 32
                                ? 'first'
                                : b > 224 && g < 32
                                  ? 'later'
                                  : 'unknown'
                            : 'unknown';
                    const firstMarker = markerColor(snapshot.firstMarker);
                    const capturedMarker = markerColor(marker);
                    const drawOrdinalAfter = await page.evaluate(() => window.__readiness.drawOrdinal);
                    const captureStable = snapshot.drawOrdinal === drawOrdinalAfter;
                    const contentValidated =
                        centerMatches &&
                        firstMarker === 'first' &&
                        capturedMarker === 'first' &&
                        snapshot.drawOrdinal === 1 &&
                        captureStable;
                    row.compositor = {
                        center,
                        readback: expected,
                        toleranceRGBA8: 2,
                        centerMatches,
                        marker,
                        firstMarker,
                        capturedMarker,
                        drawOrdinalBefore: snapshot.drawOrdinal,
                        drawOrdinalAfter,
                        captureStable,
                        contentValidated,
                    };
                    await page.evaluate((receipt) => window.__readiness.present(receipt), {
                        source: 'browser-compositor',
                        submissionId: snapshot.submission.id,
                        sha256: sha(bytes),
                        width: png.width,
                        height: png.height,
                        contentValidated,
                    });
                }
                await page.waitForFunction(() => !!window.__readiness?.report, undefined, { timeout: 20000 });
                row.observation = await page.evaluate(() => ({
                    report: window.__readiness.report,
                    shaderFault: window.__readiness.shaderFault || null,
                    renderer: (() => {
                        const gl = document.querySelector('canvas').getContext('webgl2');
                        const debug = gl?.getExtension('WEBGL_debug_renderer_info');
                        return gl ? gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : null;
                    })(),
                }));
                const terminal = row.observation.report;
                const negative = ['shader-failure', 'context-lost'].includes(mode);
                row.status = negative
                    ? terminal.status === 'FAILED' &&
                      terminal.error?.code === 'READINESS_DEVICE_OR_SHADER_FAILURE' &&
                      terminal.businessUnchanged
                        ? 'EXPECTED_NEGATIVE_PASS'
                        : terminal.status === 'BLOCKED'
                          ? 'BLOCKED'
                          : 'FAIL'
                    : terminal.status === 'READY' && terminal.businessUnchanged && row.errors.length === 0
                      ? 'PASS'
                      : terminal.status === 'BLOCKED'
                        ? 'BLOCKED'
                        : 'FAIL';
                if (mode === 'later-frame-control') {
                    const evidence = row.compositor;
                    row.status =
                        terminal.status === 'FAILED' &&
                        terminal.error?.code === 'READINESS_PRESENTATION_INVALID' &&
                        terminal.businessUnchanged &&
                        row.errors.length === 0 &&
                        evidence?.centerMatches &&
                        evidence.firstMarker === 'first' &&
                        evidence.capturedMarker === 'later' &&
                        evidence.drawOrdinalBefore === 2 &&
                        evidence.captureStable &&
                        !evidence.contentValidated
                            ? 'EXPECTED_NEGATIVE_PASS'
                            : 'FAIL';
                }
                if (
                    mode === 'shader-failure' &&
                    !(
                        row.observation.shaderFault?.compiled === false &&
                        row.observation.shaderFault?.source?.includes('AIR_READINESS_NATIVE_UNDECLARED') &&
                        row.observation.shaderFault?.scope?.startsWith('native EffectAsset')
                    )
                )
                    row.status = 'FAIL';
                try {
                    row.close = await page.evaluate(() => window.__readiness.close());
                    for (const receipt of Object.values(row.close))
                        if (receipt.status !== 'released' || receipt.pending.length || receipt.failures.length)
                            throw Error('Runtime cleanup incomplete');
                } catch (error) {
                    row.closeError = String(error);
                    row.status = 'FAIL';
                }
            } catch (error) {
                row.status = 'FAIL';
                row.error = String(error.stack || error);
            } finally {
                await bounded(() => context.close(), 4000, 'context close');
                row.contextClosed = true;
            }
        }
        for (const [file, digest] of Object.entries(report.fingerprints))
            if (sha(fs.readFileSync(path.join(root, file))) !== digest)
                throw Error('Inputs changed during collection: ' + file);
        report.status =
            report.rows.length === 6 &&
            report.rows.every((row) => ['PASS', 'EXPECTED_NEGATIVE_PASS'].includes(row.status))
                ? 'PASS'
                : report.rows.some((row) => row.status === 'BLOCKED')
                  ? 'BLOCKED'
                  : 'FAIL';
    } catch (error) {
        if (report.status !== 'INFRA_BLOCKED') report.status = 'FAIL';
        report.error = String(error.stack || error);
    } finally {
        try {
            if (owned) await owned.close();
            report.browserClosed = !!browser;
        } catch (error) {
            report.closeError = String(error);
            report.status = 'FAIL';
        }
        try {
            if (server) await bounded(() => server.close(), 4000, 'server close');
            report.serverClosed = !!server;
        } catch (error) {
            report.serverCloseError = String(error);
            report.status = 'FAIL';
        }
        report.finishedAt = new Date().toISOString();
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify(report, null, 2));
        if (report.status !== 'PASS') process.exitCode = 1;
    }
})();
