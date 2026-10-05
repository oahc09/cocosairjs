const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { PNG } = require('pngjs');
const playwright = require('playwright');
const { launchOptions } = require('./browser-engines.cjs');
const { startExampleServer } = require('./competitive-example-server.cjs');
const root = path.resolve(__dirname, '../..');
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = arg('out');
if (!out) throw new Error('--out=<new report.json> is required; no canonical default exists.');
const outPath = path.resolve(out);
if (fs.existsSync(outPath)) throw new Error('Output exists; use a new attempt path.');
const requestedBrowser = arg('browser') || 'all';
const browsers = requestedBrowser === 'all' ? ['chromium', 'firefox', 'webkit'] : [requestedBrowser];
const baselineOnly = process.argv.includes('--baseline');
const bundle = path.join(root, 'build/cocosair.module.js');
const fingerprint = () => crypto.createHash('sha256').update(fs.readFileSync(bundle)).digest('hex');
const bundleSha256 = fingerprint();
const artifactDirectory = outPath.replace(/\.json$/i, '') + '-artifacts';
const sourceFiles = [
    'tools/verify/rendering-contracts.cjs',
    'tools/debug/effect-layout.ts',
    ...fs
        .readdirSync(path.join(root, 'tools/debug/probes/rendering-contracts'))
        .map((file) => `tools/debug/probes/rendering-contracts/${file}`),
];
const sourceFingerprints = () =>
    Object.fromEntries(
        sourceFiles.map((file) => [
            file,
            crypto
                .createHash('sha256')
                .update(fs.readFileSync(path.join(root, file)))
                .digest('hex'),
        ]),
    );
const sourceSha256 = sourceFingerprints();

async function capture(page, name) {
    await page.locator('aside').evaluate((element) => {
        element.style.visibility = 'hidden';
    });
    const start = performance.now();
    let bytes;
    try {
        bytes = await page.locator('#GameCanvas').screenshot();
    } finally {
        await page.locator('aside').evaluate((element) => {
            element.style.visibility = '';
        });
    }
    const wallMs = performance.now() - start;
    const image = PNG.sync.read(bytes);
    const center = [0, 0, 0];
    let count = 0;
    for (let y = Math.floor(image.height / 2) - 8; y < Math.floor(image.height / 2) + 8; ++y)
        for (let x = Math.floor(image.width / 2) - 8; x < Math.floor(image.width / 2) + 8; ++x) {
            for (let channel = 0; channel < 3; ++channel)
                center[channel] += image.data[(y * image.width + x) * 4 + channel];
            ++count;
        }
    fs.mkdirSync(artifactDirectory, { recursive: true });
    const output = path.join(artifactDirectory, `${name}.png`);
    fs.writeFileSync(output, bytes);
    return {
        path: output,
        wallMs,
        width: image.width,
        height: image.height,
        center: center.map((value) => value / count),
    };
}

(async () => {
    const server = await startExampleServer(root);
    const results = [];
    try {
        // One browser at a time: no GPU contention between formal measurements.
        for (const browserName of browsers) {
            let browser;
            const row = { browser: browserName, status: 'NOT_RUN', cpu: null, gpu: null, screenshot: null };
            try {
                const options =
                    browserName === 'chromium' && arg('channel')
                        ? { channel: arg('channel') }
                        : launchOptions(browserName);
                browser = await playwright[browserName].launch({ headless: true, ...options });
                const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
                const errors = [];
                page.on('pageerror', (error) => errors.push(error.stack || error.message));
                const start = performance.now();
                await page.goto(`${server.origin}/tools/debug/probes/rendering-contracts/`);
                await page.waitForFunction(() => window.__renderingContracts?.ready, undefined, { timeout: 15000 });
                row.startupWallMs = performance.now() - start;
                row.probe = await page.evaluate(
                    (baseline) =>
                        baseline ? window.__renderingContracts.baseline() : window.__renderingContracts.run(),
                    baselineOnly,
                );
                row.status = baselineOnly ? 'OBSERVED' : row.probe.status;
                row.screenshot = await capture(page, browserName);
                const timings = [...(row.probe.rows || []), ...(row.probe.depth?.rows || [])]
                    .map((value) => value.timing)
                    .filter(Boolean);
                if (timings.length) {
                    row.cpu = {
                        scope: 'native-frame-submit-wall',
                        samplesMs: timings.map((value) => value.cpuSubmitMs),
                    };
                    row.gpu = {
                        scope: 'EXT_disjoint_timer_query_webgl2',
                        samplesMs: timings.map((value) => value.gpuMs),
                        unavailableReasons: timings.map((value) => value.gpuUnavailableReason),
                    };
                }
                if (!baselineOnly && row.probe.status === 'PASS') {
                    const initial = row.screenshot;
                    await page.locator('[data-action="resize"]').click();
                    await page.waitForFunction(() =>
                        window.__renderingContracts.results.some((result) => result.action === 'resize'),
                    );
                    const resized = await capture(page, `${browserName}-resize`);
                    const resizeReport = await page.evaluate(
                        () => window.__renderingContracts.results.find((result) => result.action === 'resize').report,
                    );
                    await page.locator('[data-action="contrast"]').click();
                    await page.waitForFunction(() =>
                        window.__renderingContracts.results.some((result) => result.action === 'contrast'),
                    );
                    const contrasted = await capture(page, `${browserName}-contrast`);
                    const checks = [
                        {
                            name: 'resolved-sampler-visible',
                            ok: initial.center[0] > 80 && initial.center[1] > 80 && initial.center[2] > 40,
                        },
                        {
                            name: 'resize-rebind-new-content',
                            ok:
                                resized.center[1] > resized.center[0] + 30 &&
                                resized.center[0] < initial.center[0] - 30 &&
                                resizeReport.after.generation > resizeReport.before.generation,
                        },
                        { name: 'contrast-control-pixel-response', ok: contrasted.center[1] < resized.center[1] - 30 },
                    ];
                    row.interaction = {
                        status: checks.every((check) => check.ok) ? 'PASS' : 'FAIL',
                        checks,
                        initial,
                        resized,
                        contrasted,
                        resizeReport,
                    };
                    if (row.interaction.status !== 'PASS') row.status = 'FAIL';
                }
                row.errors = errors;
                if (errors.length) row.status = 'FAIL';
            } catch (error) {
                row.status = 'FAIL';
                row.error = { message: error.message, stack: error.stack };
            } finally {
                if (browser) await browser.close();
            }
            results.push(row);
        }
    } finally {
        await server.close();
    }
    const unchanged =
        fingerprint() === bundleSha256 && JSON.stringify(sourceFingerprints()) === JSON.stringify(sourceSha256);
    const report = {
        schema: 'air-rendering-contracts/1',
        measuredAt: new Date().toISOString(),
        scope: baselineOnly ? 'legacy-baseline' : 'public-target-contracts',
        bundleSha256,
        sourceSha256,
        candidateUnchanged: unchanged,
        completed: true,
        subset: requestedBrowser !== 'all',
        results,
        status:
            unchanged && results.every((row) => (baselineOnly ? row.status === 'OBSERVED' : row.status === 'PASS'))
                ? baselineOnly
                    ? 'OBSERVED'
                    : 'PASS'
                : 'FAIL',
    };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    if (report.status === 'FAIL') process.exitCode = 1;
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
