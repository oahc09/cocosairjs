const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const playwright = require('playwright');
const { startExampleServer } = require('./competitive-example-server.cjs');
const root = path.resolve(__dirname, '../..');
const engine = process.argv.find((arg) => arg.startsWith('--engine='))?.split('=')[1] || 'chromium';
const engines = engine === 'all' ? ['chromium', 'firefox', 'webkit'] : [engine];
const channel = process.argv.find((arg) => arg.startsWith('--channel='))?.split('=')[1];
const screenshots = process.argv.find((arg) => arg.startsWith('--screenshots='))?.slice('--screenshots='.length);
const soakSeconds = Number(process.argv.find((arg) => arg.startsWith('--soak='))?.split('=')[1] || 0);
const fingerprint = () =>
    crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, 'build/cocosair.module.js')))
        .digest('hex');
const bundleSha256 = fingerprint();
const assetSha256 = crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(root, 'examples/animated-character-showcase/assets/character.glb')))
    .digest('hex');
assert.equal(assetSha256, 'd97044e701822bac5a62696459b27d7b375aada5de8574ed4362edbba94771f7');

(async () => {
    const server = await startExampleServer(root);
    const results = [];
    try {
        for (const name of engines) {
            const browser = await playwright[name].launch({
                headless: true,
                ...(name === 'chromium' && channel ? { channel } : {}),
            });
            try {
                const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
                const errors = [];
                const network = [];
                page.on('pageerror', (error) => errors.push(error.message));
                page.on('response', (response) => {
                    if (response.url().endsWith('/assets/character.glb'))
                        network.push({ url: response.url(), status: response.status() });
                });
                const state = () => page.evaluate(() => window.__bench.getState());
                const probe = () => page.evaluate(() => window.__characterProbe());
                const screenshot = async (label) => {
                    const bytes = await page.locator('canvas').screenshot();
                    if (screenshots) {
                        fs.mkdirSync(path.resolve(screenshots), { recursive: true });
                        fs.writeFileSync(path.resolve(screenshots, `character-${name}-${label}.png`), bytes);
                    }
                    return bytes;
                };
                const region = async (side) => {
                    const rect =
                        side === 'A'
                            ? { x: 102, y: 108, width: 435, height: 576 }
                            : { x: 742, y: 108, width: 435, height: 576 };
                    // Exclude changing DOM counters; only the rendered canvas may prove region motion.
                    await page.locator('aside').evaluate((element) => {
                        element.style.visibility = 'hidden';
                    });
                    try {
                        return await page.screenshot({ clip: rect });
                    } finally {
                        await page.locator('aside').evaluate((element) => {
                            element.style.visibility = '';
                        });
                    }
                };
                await page.goto(`${server.origin}/examples/animated-character-showcase/`);
                await page.waitForFunction(() => window.__appReady === true, undefined, { timeout: 10000 });
                const rendererInfo = await page.evaluate(() => {
                    const gl = document.querySelector('canvas').getContext('webgl2');
                    const extension = gl.getExtension('WEBGL_debug_renderer_info');
                    return extension
                        ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
                        : gl.getParameter(gl.RENDERER);
                });
                await page.waitForTimeout(1500);
                const p1 = await state();
                const skin = await probe();
                assert(
                    p1.assetLoaded &&
                        p1.instanceCount === 2 &&
                        p1.instances.A.clip === 'idle' &&
                        p1.instances.B.clip === 'idle',
                    'P1 dual Idle',
                );
                assert.deepEqual(
                    network.map((row) => row.status),
                    [200],
                    'one successful character request',
                );
                assert(
                    skin.sharedMesh &&
                        skin.aAttached &&
                        skin.bAttached &&
                        skin.skeletonJoints.some((count) => count >= 15),
                    'actual shared skinned GLB with >=15 joints',
                );
                await screenshot('p1');
                const pixelsA = await region('A');
                const pixelsB = await region('B');
                await page.waitForTimeout(1000);
                const p2 = await state();
                const moved = await probe();
                assert(
                    p2.instances.A.time > p1.instances.A.time && p2.instances.B.time > p1.instances.B.time,
                    'P2 actual native time advances',
                );
                assert.notDeepEqual(moved.aPose, skin.aPose);
                assert.notDeepEqual(moved.bPose, skin.bPose);
                assert(
                    !pixelsA.equals(await region('A')) && !pixelsB.equals(await region('B')),
                    'P2 both character regions move',
                );
                await page.click('[data-ui="anim-a-walk"]');
                await page.waitForTimeout(1000);
                const p3 = await state();
                assert(p3.instances.A.clip === 'walk' && p3.instances.B.clip === 'idle', 'P3 switching A preserves B');
                await page.click('[data-ui="anim-b-walk"]');
                await page.waitForTimeout(100);
                assert((await state()).instances.A.clip === 'walk', 'switching B preserves A');
                await page.click('[data-ui="anim-b-idle"]');
                const beforeDestroy = await region('A');
                await page.click('[data-ui="destroy-a"]');
                await page.waitForTimeout(800);
                const p4 = await state();
                assert(
                    p4.instanceCount === 1 && p4.destroyedInstance === 'A' && p4.instances.A === null,
                    'P4 remove/dispose A',
                );
                assert((await probe()).aPose === null && (await probe()).bAttached, 'A removed, B attached');
                assert(!beforeDestroy.equals(await region('A')), 'P4 A disappears from its screen region');
                await screenshot('p4');
                const remaining = await region('B');
                await page.waitForTimeout(1500);
                const p5 = await state();
                assert(
                    p5.instanceCount === 1 &&
                        p5.instances.B.clip === 'idle' &&
                        p5.instances.B.time > p4.instances.B.time,
                    'P5 B survives and progresses',
                );
                assert(!remaining.equals(await region('B')), 'P5 B region still moves');
                await page.click('[data-ui="reset"]');
                await page.waitForTimeout(1500);
                const p6 = await state();
                assert(
                    p6.resetCount === 1 &&
                        p6.instanceCount === 2 &&
                        p6.destroyedInstance === null &&
                        p6.instances.A.clip === 'idle' &&
                        p6.instances.B.clip === 'idle',
                    'P6 cached reset',
                );
                assert.equal(network.length, 1, 'reset must not request the GLB again');
                await screenshot('p6');
                await page.waitForTimeout(1000);
                const p7 = await state();
                assert(
                    p7.instances.A.time > p6.instances.A.time &&
                        p7.instances.B.time > p6.instances.B.time &&
                        p7.fps >= 30,
                    `P7 native playback after reset with measured frame callback rate: ${JSON.stringify({ p6, p7 })}`,
                );
                const refs = (await probe()).assetRefCount;
                const heapSamples = [];
                let cdp;
                if (soakSeconds > 0 && name === 'chromium') {
                    cdp = await page.context().newCDPSession(page);
                    await cdp.send('Performance.enable');
                    await cdp.send('HeapProfiler.enable');
                    async function sampleHeap() {
                        await cdp.send('HeapProfiler.collectGarbage');
                        const metrics = await cdp.send('Performance.getMetrics');
                        const value = metrics.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value;
                        assert(Number.isFinite(value) && value > 0, 'CDP heap measurement must be available');
                        heapSamples.push(value);
                    }
                    await sampleHeap();
                }
                for (let seconds = 0; seconds < soakSeconds; seconds += 5) {
                    await page.waitForTimeout(Math.min(5, soakSeconds - seconds) * 1000);
                    assert.equal((await state()).instanceCount, 2);
                    assert.equal((await probe()).assetRefCount, refs, 'soak references must remain bounded');
                    assert.deepEqual(errors, []);
                    if (cdp && ((seconds + 5) % 30 === 0 || seconds + 5 >= soakSeconds)) {
                        await cdp.send('HeapProfiler.collectGarbage');
                        const metrics = await cdp.send('Performance.getMetrics');
                        heapSamples.push(metrics.metrics.find((metric) => metric.name === 'JSHeapUsedSize').value);
                    }
                }
                if (heapSamples.length > 1) {
                    const retainedGrowth = heapSamples[heapSamples.length - 1] - heapSamples[0];
                    assert(
                        retainedGrowth <= Math.max(256 * 1024, heapSamples[0] * 0.03),
                        `retained JS heap growth exceeded 3%/256KiB warm-run tolerance: ${JSON.stringify(heapSamples)}`,
                    );
                }
                assert.deepEqual(errors, []);
                const lifecycle = await page.evaluate(() => window.__lifecycle());
                assert(
                    lifecycle.released &&
                        lifecycle.reloaded &&
                        lifecycle.leaked.length === 0 &&
                        lifecycle.errors.length === 0,
                    `full character resource lifecycle: ${JSON.stringify(lifecycle)}`,
                );
                assert.equal(
                    network.length,
                    1,
                    'full parsed-resource rebuild uses cached container bytes, not another request',
                );
                results.push({
                    engine: name,
                    rendererInfo,
                    status: 'PASS',
                    probes: 7,
                    assetRequests: network.length,
                    assetStatus: network[0].status,
                    skinJointCounts: skin.skeletonJoints,
                    nativeStateIsolation: true,
                    actualRegionMotion: true,
                    disposeAndReset: true,
                    callbackFps: p7.fps,
                    soakSeconds,
                    stableAssetRefs: refs,
                    heapSamples,
                    lifecycle,
                });
            } finally {
                await browser.close();
            }
        }
        assert.equal(fingerprint(), bundleSha256, 'bundle changed during browser verification');
        console.log(
            JSON.stringify({ scope: 'CB-18/E10 public brief 1.0.1', bundleSha256, assetSha256, results }, null, 2),
        );
    } finally {
        await server.close();
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
