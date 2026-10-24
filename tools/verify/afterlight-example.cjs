/* AFTERLIGHT visual and interaction regression. New local attempt only, never canonical evidence. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert/strict');
const crypto = require('crypto');
const { PNG } = require('pngjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const { serveStaticFile } = require('./static-file-response.cjs');
const args = Object.fromEntries(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
if (!args.out) throw Error('--out=<new-directory> required');
const root = path.resolve(__dirname, '../..');
const out = path.resolve(root, args.out);
const bundle = path.resolve(root, args.bundle || 'build/cocosair.module.js');
fs.mkdirSync(out);
const report = {
    completed: false,
    subset: true,
    scope: 'local Chromium AFTERLIGHT visual/interaction/lifecycle; not canonical coverage',
    cases: [],
    errors: [],
    fingerprints: {},
};
const inputs = [
    bundle,
    bundle + '.map',
    __filename,
    'examples/afterlight/index.html',
    'examples/afterlight/src/main.ts',
    'examples/afterlight/src/materials.ts',
    'examples/shared/shader-blocks.js',
    'tools/verify/browser-engines.cjs',
    'tools/verify/loopback-browser-env.cjs',
    'tools/verify/static-file-response.cjs',
];
for (const file of inputs)
    report.fingerprints[path.relative(root, path.resolve(root, file)).replace(/\\/g, '/')] = crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.resolve(root, file)))
        .digest('hex');
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
    }
    if (url.pathname === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end(
            '<style>body{margin:0}canvas{width:320px;height:240px;display:block}</style><canvas id="GameCanvas" width="320" height="240"></canvas>',
        );
        return;
    }
    if (['/engine.js', '/build/cocosair.module.js'].includes(url.pathname))
        return serveStaticFile(req, res, bundle, 'text/javascript');
    const pathname = /^\/(afterlight|shared)(\/|$)/.test(url.pathname) ? '/examples' + url.pathname : url.pathname;
    let file = path.resolve(root, '.' + decodeURIComponent(pathname));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) && file.endsWith('.js') && fs.existsSync(file.slice(0, -3) + '.ts'))
        file = file.slice(0, -3) + '.ts';
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404);
        res.end();
        return;
    }
    if (file.endsWith('.ts')) {
        const { transformSync } = require('esbuild');
        res.setHeader('Content-Type', 'text/javascript');
        res.end(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'esm' }).code);
        return;
    }
    serveStaticFile(
        req,
        res,
        file,
        file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream',
    );
});

const timer = setTimeout(() => {
    report.failure = '120-second collection budget expired';
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    process.exit(1);
}, 120000);
(async () => {
    let browser;
    try {
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        browser = await require('playwright').chromium.launch({
            ...launchOptions('chromium'),
            headless: true,
            env: loopbackBrowserEnv(),
        });
        report.browser = browser.version();
        const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
        page.on('pageerror', (e) => report.errors.push(String(e)));
        page.on('console', (m) => {
            if (m.type() === 'error') report.errors.push(m.text());
        });
        const entry = args.url || 'http://127.0.0.1:' + server.address().port + '/afterlight/';
        report.entry = entry;
        if (args.url) {
            const response = await fetch(new URL('/build/cocosair.module.js', entry));
            assert.ok(response.ok, 'dev server serves the engine bundle');
            const actual = crypto
                .createHash('sha256')
                .update(Buffer.from(await response.arrayBuffer()))
                .digest('hex');
            assert.equal(
                actual,
                report.fingerprints[path.relative(root, bundle).replace(/\\/g, '/')],
                'dev server uses the fingerprinted bundle',
            );
        }
        const response = await page.goto(entry);
        assert.equal(response.status(), 200, 'example document is served successfully');
        await page.waitForFunction(() => window.__appReady === true, { timeout: 20000 });
        await page.evaluate(async () => {
            const a = await import('/build/cocosair.module.js');
            window.clock = a.createStepClock();
            clock.begin();
            a.director.pause();
            window.__afterlight.freeze();
            await clock.step(0);
        });
        const capture = async (name) => {
            // Let browser layout/compositing settle while the engine's step clock stays paused.
            await page.evaluate(
                () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
            );
            const bytes = await page.screenshot({ path: path.join(out, name + '.png') });
            return PNG.sync.read(bytes);
        };
        const on = await capture('afterlight-desktop');
        await page.locator('#surface').selectOption('obsidian');
        await page.evaluate(async () => clock.step(0));
        const opaque = await capture('afterlight-obsidian-control');
        let glassPixels = 0;
        for (let y = 325; y < 515; y++)
            for (let x = 620; x < 830; x++) {
                const i = (y * on.width + x) * 4;
                if (
                    Math.abs(on.data[i] - opaque.data[i]) +
                        Math.abs(on.data[i + 1] - opaque.data[i + 1]) +
                        Math.abs(on.data[i + 2] - opaque.data[i + 2]) >
                    8
                )
                    glassPixels++;
            }
        assert.ok(glassPixels > 500, 'liquid glass control changes actual core pixels at fixed time');
        report.cases.push({ name: 'liquid-glass-vs-obsidian', glassPixels });
        await page.locator('#surface').selectOption('glass');
        await page.evaluate(async () => clock.step(0));
        const energy = (image) => {
            let total = 0;
            for (let y = 160; y < image.height - 100; y++)
                for (let x = 300; x < image.width - 300; x++) {
                    const i = (y * image.width + x) * 4;
                    total += image.data[i] + image.data[i + 1] + image.data[i + 2];
                }
            return total;
        };
        const difference = (a, b) => {
            let count = 0;
            for (let y = 160; y < a.height - 100; y++)
                for (let x = 300; x < a.width - 300; x++) {
                    const i = (y * a.width + x) * 4;
                    if (
                        Math.abs(a.data[i] - b.data[i]) +
                            Math.abs(a.data[i + 1] - b.data[i + 1]) +
                            Math.abs(a.data[i + 2] - b.data[i + 2]) >
                        8
                    )
                        count++;
                }
            return count;
        };
        report.state = await page.evaluate(() => __afterlight.getState());
        report.reflectionHDR = await page.evaluate(() => {
            const pixels = __afterlight.reflection.readColor();
            let max = 0;
            for (let i = 0; i < pixels.length; i += 4) max = Math.max(max, pixels[i], pixels[i + 1], pixels[i + 2]);
            return max;
        });
        assert.ok(report.reflectionHDR > 1, 'reflected scene retains HDR radiance');
        let lit = 0;
        for (let i = 0; i < on.data.length; i += 4)
            if (Math.max(on.data[i], on.data[i + 1], on.data[i + 2]) > 80) lit++;
        assert.ok(lit > 5000, 'visible sculpture and reflection');
        await page.locator('#bloom').uncheck();
        await page.evaluate(async () => clock.step(0));
        const off = await capture('afterlight-no-bloom');
        let changed = 0;
        for (let y = 160; y < on.height - 100; y++)
            for (let x = 300; x < on.width - 300; x++) {
                const i = (y * on.width + x) * 4;
                if (on.data[i] > off.data[i] + 3 || on.data[i + 1] > off.data[i + 1] + 3) changed++;
            }
        assert.ok(changed > 1000, 'actual halo outside emissive surfaces');
        report.cases.push({ name: 'bloom-pixels', changed });
        await page.locator('#bloom').check();
        await page.locator('#tone').selectOption('reinhard');
        await page.evaluate(async () => clock.step(0));
        const tone = await capture('afterlight-reinhard');
        assert.ok(difference(tone, on) > 1000, 'tone curve affects scene pixels outside controls');
        await page.locator('#tone').selectOption('aces');
        await page.evaluate(async () => {
            const e = document.querySelector('#exposure');
            e.value = '.4';
            e.dispatchEvent(new Event('input'));
            await clock.step(0);
        });
        const low = await capture('afterlight-low-exposure');
        assert.ok(energy(low) < energy(on) * 0.95, 'exposure changes scene luminance outside controls');
        report.cases.push({
            name: 'tone-and-exposure-scene-pixels',
            tonePixels: difference(tone, on),
            baselineEnergy: energy(on),
            lowEnergy: energy(low),
        });
        await page.evaluate(async () => {
            const e = document.querySelector('#exposure');
            e.value = '.85';
            e.dispatchEvent(new Event('input'));
            await clock.step(0);
        });
        await page.locator('#pause').click();
        const motionStart = await page.evaluate(() => __afterlight.getState().time);
        await page.evaluate(async () => {
            const a = await import('/build/cocosair.module.js');
            a.director.resume();
            await clock.step(0.1);
            await clock.step(0.1);
        });
        const motionEnd = await page.evaluate(() => __afterlight.getState().time);
        assert.ok(motionEnd > motionStart, 'resume advances actual sculpture animation');
        await page.locator('#pause').click();
        await page.evaluate(async () => {
            await clock.step(0.1);
            await clock.step(0.1);
        });
        assert.equal(
            await page.evaluate(() => __afterlight.getState().time),
            motionEnd,
            'pause freezes sculpture animation',
        );
        await page.evaluate(async () => {
            const a = await import('/build/cocosair.module.js');
            a.director.pause();
            __afterlight.freeze();
            await clock.step(0);
        });
        report.cases.push({ name: 'pause-resume', motionStart, motionEnd });
        const before = await page.evaluate(() => __afterlight.getState());
        await page.mouse.move(820, 430);
        await page.mouse.down();
        await page.mouse.move(940, 465, { steps: 5 });
        await page.mouse.up();
        await page.evaluate(async () => clock.step(0));
        const after = await page.evaluate(() => __afterlight.getState());
        assert.notEqual(after.azimuth, before.azimuth);
        await capture('afterlight-orbit');
        await page.locator('#reset').click();
        await page.evaluate(async () => clock.step(0));
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(async () => {
            window.dispatchEvent(new Event('resize'));
            await clock.step(0);
        });
        await capture('afterlight-mobile');
        report.mobile = await page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            viewport: innerWidth,
            post: __afterlight.post.info,
            reflection: __afterlight.reflection.info,
            transmission: __afterlight.transmission.info,
            state: __afterlight.getState(),
        }));
        assert.equal(report.mobile.width, 390);
        assert.equal(report.mobile.post.width, 390);
        assert.equal(report.mobile.transmission.width, 390, 'glass background follows portrait resize');
        assert.ok(
            Math.abs(report.mobile.state.cameraAspect - 390 / 844) < 0.001,
            'portrait projection matches its current target',
        );
        assert.ok(
            Math.abs(
                report.mobile.state.reflectionAspect - report.mobile.reflection.width / report.mobile.reflection.height,
            ) < 0.001,
        );
        report.release = await page.evaluate(async () => {
            const h = __afterlight,
                gl = (await import('/build/cocosair.module.js')).director.root.device.gl;
            const texture = h.reflection.renderTexture.getGFXTexture().gpuTexture.glTexture;
            const backgroundTexture = h.transmission.renderTexture.getGFXTexture().gpuTexture.glTexture;
            const a = await import('/build/cocosair.module.js');
            a.director.resume();
            await h.dispose();
            await h.dispose();
            clock.end();
            return {
                post: h.post.info.disposed,
                reflection: h.reflection.info.disposed,
                textureDeleted: !gl.isTexture(texture),
                backgroundDisposed: h.transmission.info.disposed,
                backgroundTextureDeleted: !gl.isTexture(backgroundTexture),
            };
        });
        assert.ok(report.release.post && report.release.reflection && report.release.textureDeleted);
        assert.ok(
            report.release.backgroundDisposed && report.release.backgroundTextureDeleted,
            'glass background GFX texture is released',
        );
        assert.deepEqual(report.errors, []);
        for (const file of inputs)
            assert.equal(
                crypto
                    .createHash('sha256')
                    .update(fs.readFileSync(path.resolve(root, file)))
                    .digest('hex'),
                report.fingerprints[path.relative(root, path.resolve(root, file)).replace(/\\/g, '/')],
            );
        report.completed = true;
    } catch (e) {
        report.failure = String(e.stack || e);
        console.error(e);
        process.exitCode = 1;
    } finally {
        if (browser) {
            await browser.close();
            report.shutdown = 'browser.close acknowledged; OS shutdown/compositor timing not measured';
        }
        server.close();
        clearTimeout(timer);
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    }
})();
