const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PNG } = require('pngjs');
const playwright = require('playwright');
const { startExampleServer } = require('./competitive-example-server.cjs');
const root = path.resolve(__dirname, '../..');
const engine = process.argv.find((arg) => arg.startsWith('--engine='))?.split('=')[1] || 'chromium';
const channel = process.argv.find((arg) => arg.startsWith('--channel='))?.split('=')[1];
const screenshots = process.argv.find((arg) => arg.startsWith('--screenshots='))?.slice('--screenshots='.length);
const fingerprint = () =>
    crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, 'build/cocosair.module.js')))
        .digest('hex');
const bundleSha256 = fingerprint();

function coverage(image, rectangle) {
    let pixels = 0;
    let lit = 0;
    for (
        let y = Math.floor(rectangle.y * image.height);
        y < Math.floor((rectangle.y + rectangle.h) * image.height);
        y++
    )
        for (
            let x = Math.floor(rectangle.x * image.width);
            x < Math.floor((rectangle.x + rectangle.w) * image.width);
            x++
        ) {
            const i = (y * image.width + x) * 4;
            pixels++;
            if (Math.max(image.data[i], image.data[i + 1], image.data[i + 2]) > 18) lit++;
        }
    return lit / pixels;
}
function coreRadius(image) {
    const y = Math.floor(image.height / 2);
    const center = Math.floor(image.width / 2);
    for (let r = 1; r < image.height / 3; r++) {
        const i = (y * image.width + center + r) * 4;
        if (image.data[i] + image.data[i + 1] + image.data[i + 2] > 40) return r;
    }
    throw new Error('No bright boundary around the dark core');
}
function ringColors(image, distance) {
    const rings = [
        { min: 1.8, max: 2.3, sum: [0, 0, 0], count: 0 },
        { min: 4.3, max: 5.4, sum: [0, 0, 0], count: 0 },
    ];
    const tangent = Math.tan((70 * Math.PI) / 360);
    const tilt = (35 * Math.PI) / 180;
    // Independent ray/plane intersection maps PNG samples to the actual tilted disk plane.
    for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++) {
            const dx = ((((x + 0.5) / image.width) * 2 - 1) * tangent * image.width) / image.height;
            const dy = (1 - ((y + 0.5) / image.height) * 2) * tangent;
            const rayDistance = (distance * Math.cos(tilt)) / (Math.cos(tilt) - Math.sin(tilt) * dy);
            const radius = Math.hypot(dx * rayDistance, (dy * rayDistance) / Math.cos(tilt));
            for (const ring of rings)
                if (radius >= ring.min && radius <= ring.max) {
                    const i = (y * image.width + x) * 4;
                    ring.count++;
                    for (let c = 0; c < 3; c++) ring.sum[c] += image.data[i + c];
                }
        }
    return rings.map((ring) => {
        const rgb = ring.sum.map((v) => v / ring.count);
        return { rgb, brightness: (rgb[0] + rgb[1] + rgb[2]) / 3, redBlue: rgb[0] - rgb[2], pixels: ring.count };
    });
}
function difference(a, b) {
    let changed = 0;
    let count = 0;
    for (let y = Math.floor(a.height * 0.22); y < a.height * 0.78; y++)
        for (let x = Math.floor(a.width * 0.25); x < a.width * 0.75; x++) {
            const i = (y * a.width + x) * 4;
            count++;
            if (
                Math.abs(a.data[i] - b.data[i]) +
                    Math.abs(a.data[i + 1] - b.data[i + 1]) +
                    Math.abs(a.data[i + 2] - b.data[i + 2]) >
                12
            )
                changed++;
        }
    return changed / count;
}

(async () => {
    const server = await startExampleServer(root);
    const browser = await playwright[engine].launch({
        headless: true,
        ...(engine === 'chromium' && channel ? { channel } : {}),
    });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        const errors = [];
        const responses = [];
        page.on('pageerror', (error) => errors.push(error.stack || error.message));
        page.on('console', (message) => {
            if (message.type() === 'error') errors.push(message.text());
        });
        page.on('response', (response) => responses.push(response.url()));
        const sample = async (label) => {
            await page.locator('aside,button').evaluateAll((nodes) =>
                nodes.forEach((node) => {
                    node.style.visibility = 'hidden';
                }),
            );
            let bytes;
            try {
                bytes = await page.locator('canvas').screenshot();
            } finally {
                await page.locator('aside,button').evaluateAll((nodes) =>
                    nodes.forEach((node) => {
                        node.style.visibility = '';
                    }),
                );
            }
            if (screenshots) {
                fs.mkdirSync(path.resolve(screenshots), { recursive: true });
                fs.writeFileSync(path.resolve(screenshots, `black-hole-${engine}-${label}.png`), bytes);
            }
            return PNG.sync.read(bytes);
        };
        await page.goto(`${server.origin}/examples/black-hole-accretion/`);
        await page
            .waitForFunction(() => window.__appReady === true, undefined, { timeout: 10000 })
            .catch((error) => {
                throw new Error(`Black-hole startup failed: ${JSON.stringify(errors)}; ${error.message}`);
            });
        await page.waitForTimeout(2500);
        const initial = await page.evaluate(() => window.__bench.getState());
        const callbackFps = await page.evaluate(() => window.__blackHoleProbe().callbackFps);
        assert(callbackFps >= 30, `default-view native frame callback rate: ${callbackFps}`);
        const first = await sample('p1');
        assert(
            initial.starStreamCount >= 200 &&
                initial.backgroundStarCount >= 300 &&
                initial.diskRotation > 0 &&
                initial.cameraDistance >= 13 &&
                initial.cameraDistance <= 15,
            'P1 geometry counts and camera',
        );
        const centerCoverage = coverage(first, { x: 1 / 3, y: 1 / 3, w: 1 / 3, h: 1 / 3 });
        const corners = [
            { x: 0, y: 0, w: 0.2, h: 0.2 },
            { x: 0.8, y: 0, w: 0.2, h: 0.2 },
            { x: 0, y: 0.8, w: 0.2, h: 0.2 },
            { x: 0.8, y: 0.8, w: 0.2, h: 0.2 },
        ].map((region) => coverage(first, region));
        assert(
            centerCoverage >= 0.05 && corners.every((value) => value >= 0.01),
            `P1 visible disk/background density: ${JSON.stringify({ centerCoverage, corners })}`,
        );
        const core = coreRadius(first);
        const centerIndex = (Math.floor(first.height / 2) * first.width + Math.floor(first.width / 2)) * 4;
        assert(
            first.data[centerIndex] + first.data[centerIndex + 1] + first.data[centerIndex + 2] < 12 && core > 20,
            'P1 dark core surrounded by a bright ring',
        );
        const rotationBefore = await page.evaluate(() => window.__bench.getState().diskRotation);
        await page.waitForTimeout(800);
        const rotated = await sample('p2');
        const rotationAfter = await page.evaluate(() => window.__bench.getState().diskRotation);
        const motionRatio = difference(first, rotated);
        assert(
            rotationAfter - rotationBefore >= 0.1 && motionRatio >= 0.015,
            `P2 actual disk/stream motion: ${JSON.stringify({ rotationBefore, rotationAfter, motionRatio })}`,
        );
        const color = ringColors(rotated, initial.cameraDistance);
        assert(
            color[0].brightness >= color[1].brightness * 1.5 && color[1].redBlue >= color[0].redBlue + 8,
            `P3 independent radial colors: ${JSON.stringify(color)}`,
        );
        const phase = await page.evaluate(() => window.__bench.getState().accretionPhase);
        assert(phase >= 0 && phase < 1);
        await page.mouse.move(640, 360);
        await page.mouse.wheel(0, -600);
        await page.waitForTimeout(1200);
        const zoomState = await page.evaluate(() => window.__bench.getState());
        const zoomed = await sample('p4');
        const zoomCore = coreRadius(zoomed);
        assert(
            zoomState.cameraDistance < 10 && zoomState.cameraDistance >= 5 && zoomCore >= core * 1.25,
            `P4 smooth physical zoom: ${JSON.stringify({ zoomState, core, zoomCore })}`,
        );
        const streamBefore = await page.evaluate(() => window.__blackHoleProbe().stream);
        await page.waitForTimeout(1000);
        const streamed = await sample('p5');
        const streamAfter = await page.evaluate(() => window.__blackHoleProbe().stream);
        assert.notDeepEqual(streamAfter, streamBefore);
        assert(
            difference(zoomed, streamed) >= 0.01 &&
                (await page.evaluate(() => window.__bench.getState().starStreamCount)) === initial.starStreamCount,
            'P5 native stream motion and constant count',
        );
        await page.click('[data-ui="reset"]');
        await page.waitForTimeout(400);
        const reset = await page.evaluate(() => window.__bench.getState());
        await sample('p6');
        assert(
            reset.cameraDistance >= 13.5 &&
                reset.cameraDistance <= 14.5 &&
                reset.diskRotation < 0.3 &&
                reset.accretionPhase < 0.1 &&
                reset.starStreamCount === initial.starStreamCount,
            'P6 real reset',
        );
        const lifecycle = await page.evaluate(() => window.__lifecycle());
        assert(
            lifecycle.released && lifecycle.reloaded && lifecycle.leaked.length === 0 && lifecycle.errors.length === 0,
            `native resource lifecycle: ${JSON.stringify(lifecycle)}`,
        );
        assert(
            !responses.some((url) => /\.(?:png|jpe?g|webp|avif|glb|gltf|mp4|webm|gif)(?:[?#]|$)/i.test(url)),
            'no external visual assets',
        );
        assert.deepEqual(errors, []);
        assert.equal(fingerprint(), bundleSha256, 'bundle changed during browser verification');
        console.log(
            JSON.stringify(
                {
                    scope: 'CB-18/E05 public brief 1.0.0',
                    engine,
                    bundleSha256,
                    status: 'PASS',
                    probes: 6,
                    initial,
                    centerCoverage,
                    corners,
                    core,
                    color,
                    motionRatio,
                    zoomCore,
                    lifecycle,
                    glowMode: 'analytic-additive-impostor',
                    callbackFps,
                },
                null,
                2,
            ),
        );
    } finally {
        await browser.close();
        await server.close();
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
