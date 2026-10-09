/* Focused examples/manual acceptance. Serves an existing SDK; never rebuilds
 * or overwrites canonical evidence. NODE_PATH must provide Playwright. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const pw = require('playwright');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');

const root = path.resolve(__dirname, '../..');
const arg = process.argv.find((a) => a.startsWith('--out='));
if (!arg) throw Error('--out=<new.json> is required');
const out = path.resolve(root, arg.slice(6));
if (fs.existsSync(out)) throw Error('Refusing to overwrite evidence: ' + out);
const artifacts = out.replace(/\.json$/, '') + '-artifacts';
fs.mkdirSync(artifacts, { recursive: true });
const files = [
    'build/cocosair.module.js',
    'examples/shared/canvas-coordinates.ts',
    'examples/input/main.ts',
    'examples/camera-screen-world/src/main.ts',
    'docs/manual/examples/manual-align-html/main.ts',
    'docs/manual/examples/manual-align-html/index.html',
    'examples/camera-screen-world/index.html',
    'examples/input/index.html',
    'tools/verify/input-camera-examples.cjs',
];
const hash = (file) =>
    crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, file)))
        .digest('hex');
const fingerprints = Object.fromEntries(files.map((file) => [file, hash(file)]));

async function step(page, count = 2) {
    await page.evaluate(async (count) => {
        const cc = await import('/build/cocosair.module.js');
        cc.game.pause();
        for (let i = 0; i < count; i++) cc.game.step();
    }, count);
}

async function cameraCheck(page) {
    const { p, size } = await page.evaluate(async () => {
        const c = document.querySelector('canvas');
        return { p: await window.__probe(), size: { width: c.width, height: c.height } };
    });
    assert(p.ready && p.worldUnchanged);
    assert(p.roundTripError < 0.01, 'World/screen roundtrip: ' + p.roundTripError);
    assert(Math.abs(p.screenX - size.width / 2) <= 1, JSON.stringify({ p, size }));
    assert(Math.abs(p.screenY - size.height / 2) <= 1, JSON.stringify({ p, size }));
    const client = await page.locator('canvas').evaluate((c, p) => {
        const r = c.getBoundingClientRect();
        return { x: r.left + (p.screenX * r.width) / c.width, y: r.bottom - (p.screenY * r.height) / c.height };
    }, p);
    await page.mouse.click(client.x, client.y);
    const pick = await page.evaluate(() => window.__probe());
    assert.equal(pick.lastPick?.hit, true, 'Projected cube must be pickable');
    return { projection: p, pick: pick.lastPick, size };
}

async function settleViewport(page) {
    let stable = 0;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        const ready = await page.evaluate(async () => {
            const cc = await import('/build/cocosair.module.js'),
                c = document.querySelector('canvas'),
                r = c.getBoundingClientRect();
            if (Math.abs(r.width - 390) >= 1 || Math.abs(r.height - 844) >= 1) return false;
            if (
                Math.abs(c.width - r.width * cc.screen.devicePixelRatio) >= 2 ||
                Math.abs(c.height - r.height * cc.screen.devicePixelRatio) >= 2
            )
                return false;
            if (window.__probe) {
                const p = await window.__probe();
                return (
                    p.bufferSize[0] === c.width &&
                    p.bufferSize[1] === c.height &&
                    Math.abs(p.screenX - c.width / 2) <= 1 &&
                    Math.abs(p.screenY - c.height / 2) <= 1
                );
            }
            const cam = window.__inspect.camera.camera;
            return cam.width === c.width && cam.height === c.height;
        });
        stable = ready ? stable + 1 : 0;
        if (stable === 3) {
            await page.evaluate(async () => (await import('/build/cocosair.module.js')).game.pause());
            return;
        }
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    }
    throw Error('Viewport/camera did not settle');
}

async function labelCheck(page) {
    const samples = await page.evaluate(() => {
        const { camera, anchors } = window.__inspect;
        const c = document.querySelector('canvas'),
            r = c.getBoundingClientRect();
        return anchors.map((a) => {
            const p = camera.worldToScreen(a.node.worldPosition),
                tag = a.el.getBoundingClientRect();
            return {
                label: a.label,
                opacity: a.el.style.opacity,
                errorX: (tag.left + tag.right) / 2 - (r.left + (p.x * r.width) / c.width),
                errorY: (tag.top + tag.bottom) / 2 - (r.bottom - (p.y * r.height) / c.height),
                inCanvas: p.x >= 0 && p.x <= c.width && p.y >= 0 && p.y <= c.height,
            };
        });
    });
    assert(
        samples.every((s) => Math.abs(s.errorX) < 1 && Math.abs(s.errorY) < 1),
        JSON.stringify(samples),
    );
    assert(
        samples.every((s) => s.inCanvas),
        'Orbit anchors must remain in the portrait view',
    );
    return samples;
}

(async () => {
    const server = await startExampleServer(root),
        records = [];
    try {
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            const options = launchOptions(engine);
            const browser = await pw[engine].launch({ ...options, env: loopbackBrowserEnv(), headless: true });
            try {
                for (const dpr of [1, 2, 3]) {
                    for (const example of ['camera-screen-world', 'manual-align-html', 'input']) {
                        const page = await browser.newPage({
                            viewport: { width: 800, height: 600 },
                            deviceScaleFactor: dpr,
                        });
                        const errors = [],
                            rec = { engine, version: browser.version(), dpr, example };
                        page.on('pageerror', (e) => errors.push(e.message));
                        page.on('console', (m) => {
                            if (m.type() === 'error') errors.push(m.text());
                        });
                        try {
                            const url =
                                example === 'manual-align-html'
                                    ? '/docs/manual/examples/manual-align-html/'
                                    : '/examples/' + example + '/';
                            await page.goto(server.origin + url);
                            await page.waitForFunction(() => window.__airApp);
                            if (example === 'camera-screen-world')
                                await page.waitForFunction(async () => (await window.__probe()).ready);
                            if (example === 'manual-align-html')
                                await page.evaluate(() => {
                                    window.__inspect.aligner._t = 1.1;
                                });
                            await step(page);
                            if (example === 'input') {
                                const canvas = page.locator('canvas');
                                await canvas.evaluate((c) => {
                                    c.tabIndex = 0;
                                    c.focus();
                                });
                                await page.keyboard.down('w');
                                await step(page);
                                assert.equal((await page.evaluate(() => window.__inputProbe())).heldKeys, 1);
                                await page.evaluate(() => window.dispatchEvent(new Event('blur')));
                                await step(page);
                                const after = await page.evaluate(() => window.__inputProbe());
                                assert.equal(after.heldKeys, 0);
                                assert.equal(after.dragging, false);
                                await step(page, 4);
                                assert.deepEqual(
                                    (await page.evaluate(() => window.__inputProbe())).position,
                                    after.position,
                                );
                                await page.keyboard.up('w');
                                await canvas.evaluate((c) => c.focus());
                                await page.keyboard.down('d');
                                await step(page);
                                await page.evaluate(() => {
                                    const b = document.createElement('button');
                                    b.textContent = 'HUD';
                                    document.body.append(b);
                                    b.focus();
                                });
                                await step(page);
                                assert.equal((await page.evaluate(() => window.__inputProbe())).heldKeys, 0);
                                await page.keyboard.up('d');
                                rec.input = after;
                            } else {
                                rec.landscape =
                                    example === 'camera-screen-world'
                                        ? await cameraCheck(page)
                                        : await labelCheck(page);
                                if (example === 'camera-screen-world') {
                                    await page.locator('#projection-mode').click();
                                    await step(page);
                                    rec.orthographic = await cameraCheck(page);
                                    assert.equal(rec.orthographic.projection.orthoFrameFits, true);
                                }
                                // Let native resize/layout callbacks settle on the normal
                                // pacer. Pause again before deterministic action sampling;
                                // never run manual steps concurrently with live rAF.
                                await page.evaluate(async () =>
                                    (await import('/build/cocosair.module.js')).game.resume(),
                                );
                                await page.setViewportSize({ width: 390, height: 844 });
                                await settleViewport(page);
                                await step(page);
                                rec.portrait =
                                    example === 'camera-screen-world'
                                        ? await cameraCheck(page)
                                        : await labelCheck(page);
                                if (example === 'camera-screen-world')
                                    assert.equal(rec.portrait.projection.orthoFrameFits, true);
                                await page.locator('canvas').evaluate((c) => {
                                    c.style.transformOrigin = 'top left';
                                    c.style.transform = 'translate(24px, 18px) scale(0.75)';
                                });
                                await step(page);
                                rec.scaled =
                                    example === 'camera-screen-world'
                                        ? await cameraCheck(page)
                                        : await labelCheck(page);
                            }
                            const png = path.join(artifacts, `${engine}-${dpr}-${example}.png`);
                            await page.screenshot({ path: png });
                            rec.pagePng = path.relative(root, png);
                            // Windows WebKit page composition after resize is a separate
                            // known limitation; these assertions prove geometry/DOM/input.
                            rec.pageCompositorVerified = false;
                            assert.deepEqual(errors, []);
                            rec.result = 'PASS';
                        } catch (error) {
                            rec.result = 'FAIL';
                            rec.error = String(error);
                        } finally {
                            rec.errors = errors;
                            records.push(rec);
                            await page.close();
                        }
                    }
                }
            } finally {
                await browser.close();
            }
        }
        const drift = files.filter((file) => hash(file) !== fingerprints[file]);
        const ok = !drift.length && records.length === 27 && records.every((r) => r.result === 'PASS');
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(
            out,
            JSON.stringify(
                {
                    measuredAt: new Date().toISOString(),
                    scope: 'input/camera/manual-label examples',
                    fingerprints,
                    drift,
                    ok,
                    records,
                },
                null,
                2,
            ) + '\n',
        );
        console.log(
            JSON.stringify({
                ok,
                pass: records.filter((r) => r.result === 'PASS').length,
                total: records.length,
                failures: records
                    .filter((r) => r.result === 'FAIL')
                    .map((r) => ({ engine: r.engine, dpr: r.dpr, example: r.example, error: r.error })),
            }),
        );
        process.exitCode = ok ? 0 : 1;
    } finally {
        await server.close();
    }
})().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
