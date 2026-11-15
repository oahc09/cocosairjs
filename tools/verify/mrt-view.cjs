/* User controls + native readback + compositor + release for the opt-in MRT developer page. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const { verifySourceBinding } = require('../build/source-binding.cjs');
const root = path.resolve(__dirname, '../..');
const args = Object.fromEntries(process.argv.slice(2).map((value) => value.replace(/^--/, '').split('=')));
assert(args.out, '--out=<new directory> required');
const out = path.resolve(root, args.out),
    bundle = path.resolve(root, args.bundle || 'build/cocosair.module.js'),
    renderer = args.renderer || 'webgl2';
assert(out.startsWith(root + path.sep) && !fs.existsSync(out), 'Retain previous attempts');
assert(['webgl2', 'webgpu'].includes(renderer));
fs.mkdirSync(out, { recursive: true });
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const inputs = [
    bundle,
    bundle + '.map',
    __filename,
    'tools/debug/probes/mrt-attachments/main.js',
    'tools/debug/probes/mrt-attachments/index.html',
    'tools/verify/browser-engines.cjs',
    'tools/verify/competitive-example-server.cjs',
].map((file) => path.resolve(root, file));
const report = {
    completed: false,
    subset: true,
    scope: 'opt-in MRT controls, first/multiple frames, GPU data, compositor and resource lifetime; not Gallery acceptance',
    renderer,
    errors: [],
    messages: [],
    observations: [],
    fingerprints: Object.fromEntries(inputs.map((file) => [path.relative(root, file).replace(/\\/g, '/'), hash(file)])),
};
(async () => {
    let browser, server, page;
    const timeout = setTimeout(async () => {
        report.failure = 'original 90s budget exceeded';
        process.exitCode = 1;
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
        setTimeout(() => process.exit(1), 4000).unref();
        await browser?.close({ reason: report.failure }).catch(() => {});
    }, 90000);
    try {
        report.sourceBinding = verifySourceBinding(root, bundle);
        assert.equal(report.sourceBinding.matches, true);
        server = await startExampleServer(root);
        browser = await require('playwright').chromium.launch({
            ...launchOptions('chromium'),
            env: loopbackBrowserEnv(),
            headless: true,
        });
        report.browser = browser.version();
        page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 1 });
        page.on('console', (message) => {
            if (report.messages.length < 40) report.messages.push({ type: message.type(), text: message.text() });
            if (message.type() === 'error') report.errors.push(message.text());
        });
        page.on('pageerror', (error) => report.errors.push(String(error)));
        const sdk = '/' + path.relative(root, bundle).replace(/\\/g, '/');
        await page.goto(
            server.origin +
                '/tools/debug/probes/mrt-attachments/?capture=1&renderer=' +
                renderer +
                '&sdk=' +
                encodeURIComponent(sdk),
        );
        await page.waitForFunction(() => window.__mrtLab?.ready || window.__mrtLab?.state.error, null, {
            timeout: 30000,
        });
        const state = () => page.evaluate(() => window.__mrtLab.state);
        let current = await state();
        assert.equal(current.error, null);
        assert.equal(current.frames, 1, 'Capture must stop at the first display frame');
        report.environment = await page.evaluate(async (sdk) => {
            const m = await import(sdk),
                d = m.director.root.device;
            return { api: d.gfxAPI, renderer: d.renderer, vendor: d.vendor };
        }, sdk);
        const step = async () => {
            const before = await state();
            await page.evaluate(() => window.__mrtClock.step(0));
            const after = await state();
            assert.equal(after.error, null);
            assert.equal(after.frames, before.frames + 1);
        };
        const capture = async (name) => {
            const guard = await page.evaluate(async (sdk) => {
                const m = await import(sdk),
                    before = m.director.getTotalFrames();
                await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                return { before, after: m.director.getTotalFrames(), paused: m.game.isPaused() };
            }, sdk);
            assert(
                guard.paused && guard.before === guard.after,
                'Compositor wait must preserve the paused single clock',
            );
            const bytes = await page.locator('canvas').screenshot();
            fs.writeFileSync(path.join(out, name + '.png'), bytes);
            const png = PNG.sync.read(bytes);
            const center = [
                ...png.data.slice(
                    (Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4,
                    (Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4 + 4,
                ),
            ];
            assert(
                center.some((value, index) => index < 3 && value > 5),
                'MRT display is black',
            );
            return {
                sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
                center,
                file: name + '.png',
                guard,
            };
        };
        const first = await capture('first-color');
        for (let i = 0; i < 4; ++i) await step();
        const fifth = await capture('fifth-color');
        assert.equal(first.sha256, fifth.sha256, 'First and fifth fixed MRT frames must agree');
        report.observations.push({ name: 'first-and-fifth-frame-presentation', first, fifth });
        const baseline = await page.evaluate(() => window.__mrtLab.read());
        assert.equal(baseline.id, 16777217);
        assert.equal(baseline.velocity[0], 0.125 / 64);
        assert.equal(baseline.velocity[1], 0.25 / 64);
        await page.locator('#channel').selectOption('1');
        await step();
        const velocity = await capture('velocity');
        await page.locator('#channel').selectOption('2');
        await step();
        const identity = await capture('integer-id');
        assert.equal(
            new Set([first.sha256, velocity.sha256, identity.sha256]).size,
            3,
            'Three controls must display different native attachments',
        );
        report.observations.push({ name: 'real-channel-controls', baseline, velocity, identity });
        await page.screenshot({ path: path.join(out, 'lab-page.png'), fullPage: true });
        report.pagePresentation = { file: 'lab-page.png', sha256: hash(path.join(out, 'lab-page.png')) };
        await page.locator('#overlay').check();
        await step();
        const preservedID = await capture('integer-id-after-color-blend');
        assert.equal(preservedID.sha256, identity.sha256);
        const blended = await page.evaluate(() => window.__mrtLab.read());
        assert.equal(blended.id, baseline.id);
        assert.deepEqual(blended.velocity, baseline.velocity);
        assert(blended.color[0] > baseline.color[0] + 0.4 && blended.color[2] < baseline.color[2] * 0.51);
        await page.locator('#channel').selectOption('1');
        await step();
        assert.equal((await capture('velocity-after-color-blend')).sha256, velocity.sha256);
        await page.locator('#channel').selectOption('0');
        await step();
        const blendedColor = await capture('color-blended');
        assert.notEqual(blendedColor.sha256, first.sha256);
        report.observations.push({
            name: 'color-only-overlay-keeps-velocity-and-uint',
            blended,
            preservedID,
            blendedColor,
        });
        const generation = (await state()).generation;
        await page.locator('#resize').click();
        await step();
        const resized = await page.evaluate(() => window.__mrtLab.read());
        assert.equal((await state()).generation, generation + 1);
        assert.equal((await state()).size, 128);
        assert.equal(resized.id, 16777217);
        assert.equal(resized.velocity[0], 0.125 / 128);
        await capture('resized');
        report.observations.push({ name: 'resize-refreshes-native-pass-and-bindings', resized, state: await state() });
        await page.locator('#dispose').click();
        const released = await state();
        assert.equal(released.resources, 0);
        assert(released.lastRelease.samplerPreserved);
        if (renderer === 'webgl2') assert.equal(released.lastRelease.nativeTexturesDeleted, true);
        else
            assert.deepEqual(
                released.lastRelease.nativeDestroyCounts,
                [1, 1, 1],
                'Every owned native GPUTexture must actually be destroyed once',
            );
        assert(await page.locator('#resize').isDisabled());
        await page.locator('#rebuild').click();
        await step();
        const reentered = await state();
        assert.equal(reentered.cycles, released.cycles + 1);
        assert(reentered.resources > 0);
        assert.equal((await page.evaluate(() => window.__mrtLab.read())).id, 16777217);
        await capture('reentered');
        report.observations.push({ name: 'release-and-reenter-real-controls', released, reentered });
        await page.evaluate(async () => {
            await window.__mrtLab.close();
            window.__mrtClock.end();
        });
        assert.deepEqual(report.errors, []);
        for (const file of inputs)
            assert.equal(hash(file), report.fingerprints[path.relative(root, file).replace(/\\/g, '/')]);
        report.completed = true;
    } catch (error) {
        report.failure ??= String(error.stack || error);
        process.exitCode = 1;
        if (page) {
            report.shaderSources = await page.evaluate(() => window.__mrtShaderSources).catch(() => undefined);
            report.state = await page.evaluate(() => window.__mrtLab?.state).catch(() => null);
            await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
        }
    } finally {
        if (browser) await browser.close();
        if (server) await server.close();
        clearTimeout(timeout);
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(
            JSON.stringify({
                completed: report.completed,
                renderer,
                failure: report.failure,
                errors: report.errors,
                observations: report.observations.length,
            }),
        );
    }
})();
