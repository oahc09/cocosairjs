/** Read-only TS server and sequential browser proof. Writes only output/hdr-color-pipeline/. */
const fs = require('node:fs'),
    path = require('node:path'),
    http = require('node:http'),
    crypto = require('node:crypto');
const esbuild = require('esbuild');
const { PNG } = require('pngjs');
const { chromium, firefox, webkit } = require('playwright');
const { launchOptions } = require('../../tools/verify/browser-engines.cjs');
const root = path.resolve(__dirname, '../..'),
    output = path.join(root, 'output/hdr-color-pipeline', `attempt-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceHashes = Object.fromEntries(
    [
        'src/main.ts',
        'generate-assets.mjs',
        'verify.cjs',
        'index.html',
        'color-input.effect.json',
        'source.effect.json',
        'output.effect.json',
        'assets/environment.json',
        'assets/environment.bin',
        'assets/ggx-prefiltered.bin',
    ].map((file) => [file, sha(path.join(__dirname, file))]),
);
const server = http.createServer((request, response) => {
    try {
        const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const base = name.startsWith('/build/') ? root : path.join(root, 'examples');
        let file = path.resolve(base, '.' + name);
        if (!file.startsWith(base + path.sep)) throw new Error('outside readonly roots');
        if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
        let data = fs.readFileSync(file);
        const ext = path.extname(file);
        if (ext === '.ts')
            data = esbuild.transformSync(data.toString(), { loader: 'ts', format: 'esm', target: 'es2020' }).code;
        response.setHeader(
            'Content-Type',
            {
                '.ts': 'application/javascript',
                '.js': 'application/javascript',
                '.json': 'application/json',
                '.html': 'text/html',
                '.bin': 'application/octet-stream',
            }[ext] || 'text/plain',
        );
        response.end(data);
    } catch (error) {
        response.writeHead(404);
        response.end(String(error));
    }
});
const checks = [],
    failures = [];
function check(name, ok, actual) {
    checks.push({ name, ok: !!ok, actual });
    if (!ok) failures.push(name);
}
function rgb(image, point) {
    const x = Math.round(point.x),
        y = Math.round(point.y);
    return Array.from(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 3));
}
function diff(a, b) {
    let sum = 0,
        max = 0,
        changed = 0;
    for (let i = 0; i < a.data.length; i += 4) {
        let d = 0;
        for (let j = 0; j < 3; j++) {
            const v = Math.abs(a.data[i + j] - b.data[i + j]);
            sum += v;
            d += v;
            max = Math.max(max, v);
        }
        if (d > 6) changed++;
    }
    return { sum, max, changed };
}
async function frames(page, count = 5) {
    await page.evaluate(async (count) => {
        const { game } = await import('cocosair');
        game.pause();
        for (let i = 0; i < count; i++) {
            game.step();
            await new Promise((resolve) => requestAnimationFrame(resolve));
        }
    }, count);
}
async function screenshot(page, name) {
    const buffer = await page.locator('canvas').screenshot();
    fs.writeFileSync(path.join(output, name + '.png'), buffer);
    return PNG.sync.read(buffer);
}
async function run(name, url) {
    checks.length = 0;
    failures.length = 0;
    const started = new Date().toISOString(),
        errors = [];
    let browser, page;
    try {
        browser = await { chromium, firefox, webkit }[name].launch({ headless: true, ...launchOptions(name) });
        page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
        page.on('pageerror', (error) => errors.push(String(error)));
        page.on('console', (msg) => {
            if (msg.type() === 'error') errors.push(msg.text());
        });
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForFunction(() => window.__appReady || window.__hdrError, { timeout: 90000 });
        const error = await page.evaluate(() => window.__hdrError);
        if (error) throw new Error(error);
        await frames(page);
        const before = await screenshot(page, `${name}-initial`);
        const probe = await page.evaluate(() => window.__probe());
        check(
            'native six-level IBL enabled and RGBE metadata agrees',
            probe.nativeIBL && probe.nativeRGBE && probe.fixture.levels.length === 6,
            probe,
        );
        const nativeFormats = await page.evaluate(() =>
            window.__hdr
                .materialStates()
                .slice(0, 3)
                .map((passes) => passes[0].textures.find((entry) => entry.name === 'colorMap')),
        );
        check(
            'native sampler formats use hardware sRGB only for encoded inputs',
            nativeFormats[0].format.srgb &&
                !nativeFormats[1].format.srgb &&
                nativeFormats[2].format.srgb &&
                nativeFormats.every((entry) => entry.bound),
            nativeFormats,
        );
        const raw = await page.evaluate(() => window.__hdr.sampleRadiance());
        check(
            'floating-point radiance actually exceeds 1',
            raw.hdr.slice(0, 3).some((v) => v > 1),
            raw,
        );
        check(
            'RGBA8 actually clamps HDR radiance',
            raw.ldr.slice(0, 3).every((v) => v <= 255) && raw.ldr[0] === 255,
            raw,
        );
        const panels = await page.evaluate(() => window.__hdr.panelSamples());
        const samples = panels.map((points) => points.map((point) => rgb(before, point)));
        const equivalent = samples[0].map((a, i) => Math.max(...a.map((v, j) => Math.abs(v - samples[1][i][j]))));
        check(
            'hardware sRGB and equivalent linear bytes agree within 3 levels',
            equivalent.every((v) => v <= 3),
            { equivalent, samples },
        );
        check(
            'double-decode negative control has genuinely darker pixels',
            samples[2].every((a, i) => a.reduce((s, v) => s + v, 0) < samples[0][i].reduce((s, v) => s + v, 0) - 30),
            samples.slice(0, 3),
        );
        check(
            'same tonemap preserves HDR/LDR image differences',
            samples[3].some((a, i) => a.some((v, j) => Math.abs(v - samples[4][i][j]) > 15)),
            samples.slice(3),
        );
        await page.evaluate(() => window.__hdr.setExposure(2));
        await frames(page);
        const exposure = await screenshot(page, `${name}-exposure`),
            exposureDiff = diff(before, exposure);
        check('exposure changes actual tone-mapped image', exposureDiff.changed > 1000, exposureDiff);
        await page.evaluate(() => window.__hdr.setExposure(1));
        await page.evaluate(() => window.__hdr.setToneMap(false));
        await frames(page);
        const noTone = await screenshot(page, `${name}-no-tonemap`),
            toneDiff = diff(before, noTone);
        check('tone-map bypass is an actual visual negative control', toneDiff.changed > 1000, toneDiff);
        await page.evaluate(() => window.__hdr.setToneMap(true));
        await page.evaluate(() => window.__hdr.setPrefiltered(false));
        await frames(page);
        const unfiltered = await screenshot(page, `${name}-unfiltered`);
        const spheres = await page.evaluate(() => window.__hdr.sphereSamples());
        const sphereRegions = spheres.map((point) => {
            let sum = 0,
                changed = 0;
            for (let y = -24; y <= 24; y++)
                for (let x = -24; x <= 24; x++) {
                    const a = rgb(before, { x: point.x + x, y: point.y + y }),
                        b = rgb(unfiltered, { x: point.x + x, y: point.y + y });
                    const d = a.reduce((s, v, j) => s + Math.abs(v - b[j]), 0);
                    sum += d;
                    if (d > 6) changed++;
                }
            return { roughness: point.roughness, sum, changed };
        });
        check(
            'real GGX vs unfiltered control changes roughness sphere reflections',
            sphereRegions.filter((entry) => entry.roughness >= 0.5).every((entry) => entry.changed > 100),
            sphereRegions,
        );
        const sphereRGB = spheres.map((point) => rgb(before, point));
        check(
            'roughness spheres produce distinct nonblack reflection pixels',
            sphereRGB.every((a) => a.reduce((s, v) => s + v, 0) > 30) &&
                new Set(sphereRGB.map((a) => a.join(','))).size >= 3,
            sphereRGB,
        );
        await page.click('#reset');
        await frames(page);
        const reset = await screenshot(page, `${name}-reset`),
            resetDiff = diff(before, reset);
        check('reset returns the fixed rendered state', resetDiff.max <= 1, resetDiff);
        // Shared deferred destruction needs native frames; screenshots use paused manual steps above.
        await page.evaluate(async () => {
            const { game } = await import('cocosair');
            game.resume();
        });
        const lifecycle = await page.evaluate(() => window.__lifecycle());
        check(
            'owned native resources release and rebuild',
            lifecycle.released && lifecycle.reloaded && !lifecycle.leaked.length && !lifecycle.errors.length,
            lifecycle,
        );
        await frames(page);
        const after = await screenshot(page, `${name}-reloaded`),
            reloadDiff = diff(before, after);
        check('reloaded resources preserve the rendered result', reloadDiff.max <= 1, reloadDiff);
        check('browser runtime console has no errors', errors.length === 0, errors);
    } catch (error) {
        check('browser completion', false, { error: String(error), errors });
    } finally {
        const report = {
            schema: 'air-hdr-color-example-proof/1',
            browser: name,
            browserVersion: browser?.version() || null,
            executable: launchOptions(name).executablePath,
            started,
            finished: new Date().toISOString(),
            bundle: sha(path.join(root, 'build/cocosair.module.js')),
            sourceHashes,
            checks: [...checks],
            failures: [...failures],
            status: failures.length ? 'FAIL' : 'PASS',
        };
        fs.writeFileSync(path.join(output, `${name}.json`), JSON.stringify(report, null, 2) + '\n');
        if (report.status === 'FAIL') process.exitCode = 1;
        console.log(
            JSON.stringify({
                browser: name,
                status: report.status,
                checks: report.checks.length,
                failures: report.failures,
            }),
        );
        if (browser) await browser.close();
    }
}
(async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
        const url = `http://127.0.0.1:${server.address().port}/hdr-color-pipeline/`;
        for (const name of process.argv[2] ? [process.argv[2]] : ['chromium', 'firefox', 'webkit'])
            await run(name, url);
    } finally {
        server.close();
    }
})().catch((error) => {
    console.error(error);
    server.close();
    process.exitCode = 1;
});
