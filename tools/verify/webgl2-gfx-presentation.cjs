const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const root = path.resolve(__dirname, '../..');
async function main() {
    const args = process.argv.slice(2);
    assert(
        args.every((arg) => /^(--out=|--browser=|--playwright=|--webkit-compositor=)/.test(arg)),
        'Unknown argument',
    );
    const out = args.find((arg) => arg.startsWith('--out='))?.slice(6);
    assert(out?.endsWith('.json'), '--out=<new.json> required');
    const reportPath = path.resolve(root, out);
    assert(!fs.existsSync(reportPath), 'Existing evidence must not be overwritten');
    const selection = args.find((arg) => arg.startsWith('--browser='))?.slice(10) || 'all';
    const engines = selection === 'all' ? ['chromium', 'firefox', 'webkit'] : selection.split(',');
    assert(
        engines.every((name) => ['chromium', 'firefox', 'webkit'].includes(name)),
        'Invalid browser',
    );
    const toolingPath = require.resolve(args.find((arg) => arg.startsWith('--playwright='))?.slice(13) || 'playwright');
    const pw = require(toolingPath);
    const compositorProfile = args.find((arg) => arg.startsWith('--webkit-compositor='))?.slice(20) || 'default';
    assert(['default', 'accelerated'].includes(compositorProfile), 'Invalid WebKit compositor profile');
    const { PNG } = require(require.resolve('pngjs', { paths: [path.dirname(toolingPath), root] }));
    const files = [
        'build/cocosair.module.js',
        'build/cocosair.module.min.js',
        'build/cocosair.module.d.ts',
        'src/cocos/gfx/webgl2/webgl2-commands.ts',
        'src/cocos/gfx/webgl2/webgl2-swapchain.ts',
        'src/cocos/render-scene/core/render-window.ts',
        'tools/verify/webgl2-gfx-presentation.cjs',
        'tools/debug/probes/webgl2-gfx-presentation/main.js',
        'tools/debug/probes/webgl2-gfx-presentation/index.html',
        'tools/verify/competitive-example-server.cjs',
        'tools/verify/browser-engines.cjs',
        'tools/verify/loopback-browser-env.cjs',
    ];
    const hash = (file) =>
        crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(root, file)))
            .digest('hex');
    const fingerprints = Object.fromEntries(files.map((file) => [file, hash(file)]));
    const report = {
        schema: 'webgl2-gfx-presentation/1',
        startedAt: new Date().toISOString(),
        identity: {
            head: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
            dirty: cp.execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
            node: process.version,
            toolingPath,
        },
        scope: 'Native pacer public-gfx default-framebuffer quadrant drawing before/after viewport resize. Actual compositor PNG pixels are asserted independently from offscreen public readback. No raw GL writes, no preview canvas, no release readiness claim.',
        fingerprints,
        compositorProfile,
        subset: engines.length !== 3,
        results: [],
    };
    const artifactDir = reportPath.replace(/\.json$/, '-artifacts');
    fs.mkdirSync(artifactDir, { recursive: true });
    const server = await startExampleServer(root);
    const expected = [
        [255, 0, 0, 255],
        [0, 255, 0, 255],
        [0, 0, 255, 255],
        [255, 255, 0, 255],
    ];
    try {
        for (const engine of engines) {
            let browser;
            const row = { engine, cases: [], pageErrors: [], consoleErrors: [] };
            try {
                const options = launchOptions(engine);
                const binary = pw[engine].executablePath();
                if (engine !== 'chromium' && fs.existsSync(binary)) options.executablePath = binary;
                if (engine === 'webkit' && process.platform === 'win32' && compositorProfile === 'accelerated') {
                    options.ignoreDefaultArgs = ['--disable-accelerated-compositing'];
                }
                row.launch = { args: options.args, ignoreDefaultArgs: options.ignoreDefaultArgs || [], headless: true };
                browser = await pw[engine].launch({
                    ...options,
                    env: loopbackBrowserEnv(),
                    headless: true,
                    timeout: 20000,
                });
                row.version = browser.version();
                row.executablePath = options.executablePath;
                const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
                page.on('pageerror', (error) => row.pageErrors.push(String(error)));
                page.on('console', (message) => {
                    if (message.type() === 'error') row.consoleErrors.push(message.text());
                });
                await page.goto(server.origin + '/tools/debug/probes/webgl2-gfx-presentation/');
                await page.waitForFunction(() => window.__wglPresentation?.ready, null, { timeout: 30000 });
                const startup = await page.evaluate(() => ({
                    exception: window.__wglPresentation.startupException,
                    renderer: window.__wglPresentation.renderer,
                }));
                assert(!startup.exception, startup.exception);
                row.renderer = startup.renderer;
                for (const [id, width, height] of [
                    ['initial-native', 640, 400],
                    ['resize-native', 480, 320],
                    ['resize-second-native', 720, 360],
                ]) {
                    const before = await page.evaluate(() => window.__wglPresentation.frames);
                    await page.setViewportSize({ width, height });
                    await page.waitForFunction((previous) => window.__wglPresentation.frames >= previous + 12, before, {
                        timeout: 15000,
                    });
                    const snapshot = await page.evaluate(() => window.__wglPresentation.snapshot());
                    const screenshot = path.join(artifactDir, engine + '-' + id + '.png');
                    await page.screenshot({ path: screenshot });
                    const png = PNG.sync.read(fs.readFileSync(screenshot));
                    const exported = await page.evaluate(() => window.__wglPresentation.exportCanvas());
                    const exportPath = path.join(artifactDir, engine + '-' + id + '-canvas-export.png');
                    fs.writeFileSync(exportPath, Buffer.from(exported.split(',')[1], 'base64'), { flag: 'wx' });
                    const canvasPNG = PNG.sync.read(fs.readFileSync(exportPath));
                    const positions = [
                        [0.25, 0.25],
                        [0.75, 0.25],
                        [0.25, 0.75],
                        [0.75, 0.75],
                    ];
                    const samples = positions.map(([x, y]) => {
                        const index = (Math.floor(y * height) * png.width + Math.floor(x * width)) * 4;
                        return [...png.data.subarray(index, index + 4)];
                    });
                    const exportPixels = positions.map(([x, y]) => {
                        const index =
                            (Math.floor(y * canvasPNG.height) * canvasPNG.width + Math.floor(x * canvasPNG.width)) * 4;
                        return [...canvasPNG.data.subarray(index, index + 4)];
                    });
                    const checks = {
                        screenshotPixels: JSON.stringify(samples) === JSON.stringify(expected),
                        readbackPixels: JSON.stringify(snapshot.samples) === JSON.stringify(expected),
                        screenshotSize: png.width === width && png.height === height,
                        canvasSize: snapshot.canvas.width === width && snapshot.canvas.height === height,
                        drawingBufferSize: JSON.stringify(snapshot.drawingBuffer) === JSON.stringify([width, height]),
                        windowSize: JSON.stringify(snapshot.window) === JSON.stringify([width, height]),
                        defaultFramebuffer: snapshot.defaultDrawFramebuffer,
                        continuedNativeFrames: snapshot.frames >= before + 12,
                        noGLErrors: !snapshot.errors.length && !snapshot.drawException,
                    };
                    row.cases.push({
                        id,
                        status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
                        checks,
                        expected,
                        screenshotPixels: samples,
                        snapshot,
                        screenshot: path.relative(root, screenshot).replace(/\\/g, '/'),
                        screenshotSHA256: crypto.createHash('sha256').update(fs.readFileSync(screenshot)).digest('hex'),
                        canvasExport: {
                            path: path.relative(root, exportPath).replace(/\\/g, '/'),
                            pixels: exportPixels,
                            sha256: crypto.createHash('sha256').update(fs.readFileSync(exportPath)).digest('hex'),
                            diagnosticOnly: true,
                        },
                    });
                }
                row.release = await page.evaluate(() => window.__wglPresentation.close());
                row.status =
                    row.cases.every((test) => test.status === 'PASS') &&
                    !row.pageErrors.length &&
                    !row.consoleErrors.length &&
                    row.release.appRelease?.status === 'released' &&
                    !row.release.errors.length &&
                    row.release.resources.created === row.release.resources.released
                        ? 'PASS'
                        : 'FAIL';
            } catch (error) {
                row.status = 'FAIL';
                row.error = String(error.stack || error);
            } finally {
                await browser?.close();
            }
            report.results.push(row);
            console.error(`[presentation] ${engine}: ${row.status}`);
        }
        report.finishedAt = new Date().toISOString();
        report.drift = files.filter((file) => hash(file) !== fingerprints[file]);
        report.completed =
            report.results.length === engines.length &&
            report.results.every((row) => row.cases.length === 3 && row.release);
        report.passed =
            Boolean(report.completed) && report.results.every((row) => row.status === 'PASS') && !report.drift.length;
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        process.exitCode = report.passed ? 0 : 1;
    } finally {
        await server.close();
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
