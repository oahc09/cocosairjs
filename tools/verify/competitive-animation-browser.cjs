const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const playwright = require('playwright');
const crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const engine = process.argv.find((arg) => arg.startsWith('--engine='))?.split('=')[1] || 'chromium';
const engines = engine === 'all' ? ['chromium', 'firefox', 'webkit'] : [engine];
const channel = process.argv.find((arg) => arg.startsWith('--channel='))?.split('=')[1];
const screenshots = process.argv.find((arg) => arg.startsWith('--screenshots='))?.slice('--screenshots='.length);
const root = path.resolve(__dirname, '../..');
const fingerprint = () =>
    crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, 'build/cocosair.module.js')))
        .digest('hex');
const bundleSha256 = fingerprint();

(async () => {
    const server = await startExampleServer(path.resolve(__dirname, '../..'));
    const results = [];
    try {
        for (const name of engines) {
            const browser = await playwright[name].launch({
                headless: true,
                ...(name === 'chromium' && channel ? { channel } : {}),
            });
            try {
                for (const model of ['fox', 'morph']) {
                    const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
                    const errors = [];
                    page.on('pageerror', (error) => errors.push(error.message));
                    await page.goto(`${server.origin}/examples/gltf-animation-contract/?model=${model}`);
                    await page.waitForFunction(() => window.__gltfAnimationProbe?.().ready);
                    await page.evaluate(() => window.__gltfAnimationStep(0, true));
                    const initial = await page.evaluate(() => window.__gltfAnimationProbe());
                    assert(
                        initial.sharedMesh && initial.sharedClip && initial.privateMaterial,
                        'share static assets, isolate private material',
                    );
                    assert.notEqual(initial.a.wrapMode, initial.b.wrapMode, 'loop override must be instance-local');
                    const pixelsBefore = await page.locator('canvas').screenshot();
                    await page.evaluate((duration) => window.__gltfAnimationStep(duration * 1.25), initial.duration);
                    const complete = await page.evaluate(() => window.__gltfAnimationProbe());
                    assert(
                        complete.a.playing && !complete.b.playing && complete.finishedB >= 1,
                        'Normal must complete while Loop continues',
                    );
                    assert(
                        complete.sourceWrap === initial.sourceWrap && complete.b.wrapMode === initial.b.wrapMode,
                        'shared clip and second state must retain Normal',
                    );
                    const poseDifference = complete.a.pose.some(
                        (value, index) => Math.abs(value - complete.b.pose[index]) > 1e-5,
                    );
                    const weightDifference =
                        complete.a.weights !== null && Math.abs(complete.a.weights - complete.b.weights) > 1e-5;
                    assert(
                        model === 'morph' ? weightDifference : poseDifference,
                        'native sampled poses/weights must differ between loop and Normal',
                    );
                    const pixelsAfter = await page.locator('canvas').screenshot();
                    if (screenshots) {
                        fs.mkdirSync(path.resolve(screenshots), { recursive: true });
                        fs.writeFileSync(
                            path.resolve(screenshots, `animation-${model}-${name}-before.png`),
                            pixelsBefore,
                        );
                        fs.writeFileSync(path.resolve(screenshots, `animation-${model}-${name}.png`), pixelsAfter);
                    }
                    assert(
                        !pixelsBefore.equals(pixelsAfter),
                        `native animation must change rendered canvas pixels: ${JSON.stringify({ model, initial, complete, errors })}`,
                    );
                    await page.click('#pause');
                    const paused = await page.evaluate(() => window.__gltfAnimationProbe());
                    await page.evaluate(() => window.__gltfAnimationStep(0.25));
                    const still = await page.evaluate(() => window.__gltfAnimationProbe());
                    assert(still.a.paused && still.a.time === paused.a.time, 'pause must hold the first instance');
                    await page.click('#resume');
                    await page.evaluate(() => window.__gltfAnimationStep(0.25));
                    const resumed = await page.evaluate(() => window.__gltfAnimationProbe());
                    assert(
                        !resumed.a.paused && resumed.a.time > still.a.time,
                        'native resume must advance the first instance',
                    );
                    if (initial.names.length > 1) {
                        await page.selectOption('#clips', initial.names[1]);
                        await page.evaluate(() => window.__gltfAnimationStep(0));
                        const switched = await page.evaluate(() => window.__gltfAnimationProbe());
                        assert(
                            switched.selected === initial.names[1] && switched.a.playing && switched.b.playing,
                            'select must switch native clips',
                        );
                    }
                    assert.deepEqual(errors, [], 'no page errors');
                    const lifecycle = await page.evaluate(() => window.__lifecycle());
                    assert(
                        lifecycle.released &&
                            lifecycle.reloaded &&
                            lifecycle.leaked.length === 0 &&
                            lifecycle.errors.length === 0,
                        `full parsed resource lifecycle: ${JSON.stringify(lifecycle)}`,
                    );
                    results.push({
                        engine: name,
                        model,
                        status: 'PASS',
                        duration: initial.duration,
                        poseDifference,
                        weightDifference,
                        pixelChange: true,
                        sharedMesh: true,
                        sharedClip: true,
                        privateMaterial: true,
                        finishedB: complete.finishedB,
                        nativePauseResume: true,
                        clipSwitch: initial.names.length > 1,
                        lifecycle,
                    });
                    await page.close();
                }
            } finally {
                await browser.close();
            }
        }
        assert.equal(fingerprint(), bundleSha256, 'bundle changed during browser verification');
        console.log(
            JSON.stringify(
                {
                    scope: 'CB-07/CB-13',
                    bundleSha256,
                    playwrightVersion: require('playwright/package.json').version,
                    results,
                },
                null,
                2,
            ),
        );
    } finally {
        await server.close();
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
