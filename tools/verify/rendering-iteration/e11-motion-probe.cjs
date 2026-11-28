'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const { readFileSync, writeFileSync } = require('node:fs');
const { createServer } = require('node:http');
const { join, resolve } = require('node:path');
const { transformSync } = require('esbuild');
const { chromium, webkit } = require('playwright');
const { verifySourceBinding } = require('../../build/source-binding.cjs');

const root = resolve(__dirname, '../../..');
const bundle = join(root, 'build/cocosair.module.js');
const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><title>E11 liquid glass motion</title><link rel="icon" href="data:,">
<style>
*{box-sizing:border-box}body{margin:0;background:#101726;color:#e5f9ff;font:16px system-ui}
main{margin:18px auto;width:max-content;padding:12px;border:1px solid #2c4857;border-radius:20px;background:#131f2d}
h1{font-size:17px;margin:0 0 8px}#E11Host{width:384px;height:256px}canvas{display:block;width:100%;height:100%;touch-action:none;border-radius:12px}
p, label{font-size:13px}label{display:flex;align-items:center;gap:12px}input{flex:1}
button{margin-top:10px;padding:6px;border-radius:8px;color:#e5f9ff;background:#1a3546;border:1px solid #76aeb7}
:focus-visible{outline:2px solid #97f8ea;outline-offset:3px}
</style>
<main><h1>E11 · Liquid glass motion</h1><div id="E11Host"><canvas id="GameCanvas" width="384" height="256"></canvas></div>
<p>Drag the lens and release. Drag again to interrupt the return.</p>
<label>Scrub return <input type="range" min="0" max=".65" step=".01" value="0"></label>
<button type="button">Return to center</button></main><script type="module" src="/page.mjs"></script>`;

const material = transformSync(readFileSync(join(root, 'examples/shader-glass/src/effect.generated.ts'), 'utf8'), {
    loader: 'ts',
    format: 'esm',
}).code;
const routes = {
    '/': ['text/html', html],
    '/build/cocosair.module.js': ['text/javascript', readFileSync(bundle)],
    '/glass-effects.mjs': ['text/javascript', material],
    '/page.mjs': ['text/javascript', readFileSync(join(__dirname, 'e11-motion-page.mjs'))],
};

const select = (s) => [s.x, s.y, s.alpha, s.refraction, s.shared];
const v = (page, fn, value) => page.evaluate(fn, value);

async function verifyOpacity(page, draw, baseline) {
    await v(page, () => e11.seekBadge(127 / 255));
    const partial = await draw();
    await v(page, () => e11.seekBadge(1));
    const transparent = await draw();
    await v(page, () => e11.hideBadge(true));
    const background = await draw();
    await v(page, () => {
        e11.hideBadge(false);
        e11.seekBadge(127 / 255);
    });
    const reversePartial = await draw();
    await v(page, () => e11.seekBadge(0));
    const restored = await draw();
    assert.equal(partial.state.alpha, 128);
    assert.equal(transparent.state.alpha, 0);
    assert.equal(restored.state.alpha, 255);
    for (const frame of [partial, transparent, background, reversePartial, restored]) {
        assert.deepEqual(
            [frame.state.x, frame.state.y, frame.state.refraction],
            [baseline.state.x, baseline.state.y, baseline.state.refraction],
        );
        assert.deepEqual(frame.extent, baseline.extent);
        assert.deepEqual(frame.lens, baseline.lens);
    }
    assert.equal(transparent.sha, background.sha);
    assert.equal(partial.sha, reversePartial.sha);
    assert.equal(restored.sha, baseline.sha);
    assert.equal(baseline.badge.length, 7 * 7 * 4);
    assert.equal(baseline.lens.length, 7 * 7 * 4);
    let blendedChannels = 0;
    for (const [i, visible] of baseline.badge.entries()) {
        if (i % 4 === 3) continue;
        const clear = background.badge[i];
        if (Math.abs(visible - clear) < 40) continue;
        const blend = (partial.badge[i] - clear) / (visible - clear);
        assert.ok(blend > 0.25 && blend < 0.75, 'the UI pixel must blend between the visible sprite and background');
        blendedChannels++;
    }
    assert.ok(blendedChannels >= 49, 'the opacity control region must cover the visible 7×7 sprite sample');
    return {
        blendedChannels,
        full: baseline.sha,
        partial: partial.sha,
        clear: transparent.sha,
        restored: restored.sha,
    };
}

async function verify(browser, origin, reducedMotion) {
    const page = await browser.newPage({ viewport: { width: 520, height: 470 }, deviceScaleFactor: 1, reducedMotion });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    try {
        await page.goto(origin + '?fixed');
        await page.waitForFunction(() => Boolean(window.e11), { timeout: 10000 });
        const box = await page.locator('canvas').boundingBox();
        assert.deepEqual([box.width, box.height], [384, 256]);
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        const draw = (dt = 0) => v(page, (delta) => e11.draw(delta), dt);
        const st = () => v(page, () => e11.state());
        const baseline = await draw();
        const opacity = await verifyOpacity(page, draw, baseline);
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 53, y - 21);
        const drag = await draw();
        assert.notEqual(drag.sha, baseline.sha);
        assert.ok(drag.state.x > 0.3);
        assert.ok(drag.state.refraction > 0.6);
        await page.mouse.up();
        const returned = await st();
        const result = { renderer: await v(page, () => e11.renderer()), baseline, opacity, drag, returned };
        if (reducedMotion === 'reduce') {
            assert.deepEqual(select(returned), select(baseline.state));
            assert.equal(returned.playing, false);
            assert.equal(returned.completions, 1);
        } else {
            assert.deepEqual(await v(page, () => e11.continuity()), [0, 0, 0]);
            const firstSpring = await draw(0.12);
            assert.notEqual(firstSpring.sha, drag.sha);
            assert.equal(firstSpring.state.time, 0.12);
            assert.notEqual(firstSpring.state.x, drag.state.x);
            // Mid-flight pointer capture pauses the same timeline. No pointer move is needed
            // to retarget the spring at the live pose when the pointer is released.
            await page.mouse.down();
            const paused = await draw(0.05);
            assert.equal(paused.state.x, firstSpring.state.x);
            assert.equal(paused.state.time, 0.12);
            await page.mouse.up();
            assert.deepEqual(await v(page, () => e11.continuity()), [0, 0, 0]);
            assert.deepEqual(select(await st()), select(paused.state));

            await v(page, () => e11.seek(0.22));
            const forward = await draw();
            await v(page, () => e11.seek(0.62));
            const endpoint = await draw();
            assert.notEqual(forward.sha, endpoint.sha);
            await v(page, () => e11.seek(0.22));
            const backward = await draw();
            assert.deepEqual(select(backward.state), select(forward.state));
            assert.equal(backward.sha, forward.sha);
            assert.equal(backward.state.completions, 0);
            assert.equal(backward.state.shared, 0.3);

            // With the exact same pose, modify only the material instance. This must affect
            // rendered pixels rather than only changing a JavaScript mirror.
            await v(page, () => e11.refraction(1.1));
            const uniformOnly = await draw();
            assert.notEqual(uniformOnly.sha, backward.sha);
            assert.equal(uniformOnly.state.x, backward.state.x);
            assert.equal(uniformOnly.state.y, backward.state.y);
            assert.equal(uniformOnly.state.shared, backward.state.shared);
            await v(page, () => e11.revert());
            assert.deepEqual(select(await st()), select(paused.state));

            // Use the actual keyboard-driven range and button, then leave while playback is live.
            await page.locator('input').focus();
            await page.keyboard.press('ArrowRight');
            assert.ok((await st()).time > 0);
            await page.locator('button').click();
            assert.equal((await st()).playing, true);
            Object.assign(result, { firstSpring, paused, forward, endpoint, backward, uniformOnly });
        }
        const exit = await v(page, () => e11.exit());
        assert.deepEqual(exit.before, exit.after);
        assert.equal(exit.disposed, true);
        assert.equal(exit.receipt.status, 'released');
        assert.equal(exit.scene, 'E11 scene replacement');
        assert.deepEqual(errors, []);
        return { ...result, exit };
    } catch (error) {
        throw new Error(`${error.stack || error}; browser: ${errors.join('; ')}`);
    } finally {
        await page.close();
    }
}

async function verifyResize(browser, origin, dpr) {
    const page = await browser.newPage({ viewport: { width: 620, height: 520 }, deviceScaleFactor: dpr });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    try {
        await page.goto(origin + '?fixed');
        await page.waitForFunction(() => Boolean(window.e11), null, { timeout: 10000 });
        const box = await page.locator('canvas').boundingBox();
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        const draw = (mode) => v(page, (arg) => e11.draw(0, arg), mode);
        const getSize = () => v(page, () => e11.resizeState());
        function checkSize(metrics, width, height) {
            for (const key of ['buffer', 'target', 'attachment', 'shader'])
                assert.deepEqual(metrics[key], [width * dpr, height * dpr], key);
            assert.equal(metrics.bound, true);
            assert.equal(metrics.attached, true);
        }
        async function resize(width, height) {
            await v(
                page,
                ([w, h]) => {
                    Object.assign(document.querySelector('#E11Host').style, { width: w + 'px', height: h + 'px' });
                },
                [width, height],
            );
            await page.waitForFunction(
                ([w, h]) => {
                    const { buffer, target } = e11.resizeState();
                    return buffer[0] === w && buffer[1] === h && target[0] === w && target[1] === h;
                },
                [width * dpr, height * dpr],
                { timeout: 8000 },
            );
            const metrics = await getSize();
            checkSize(metrics, width, height);
            return metrics;
        }
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 50, y - 12);
        const initial = await draw();
        const a = await getSize();
        checkSize(a, 384, 256);
        const b = await resize(512, 288);
        assert.equal(b.generation, a.generation + 1);
        // A real pointer move after resizing uses the original gesture height.
        await page.mouse.move(x + 51, y - 12);
        const moved = await draw();
        assert.ok(Math.abs(moved.state.x - initial.state.x - 2 / 256) < 1e-7);
        assert.equal(moved.state.y, initial.state.y);
        await page.mouse.move(x + 50, y - 12);
        const wide = await draw('remember');
        assert.deepEqual(select(wide.state), select(initial.state));
        await v(page, () => e11.refraction(1.4));
        const refracted = await draw('compare');
        assert.ok(
            refracted.difference.count > 25,
            JSON.stringify({ dpr, wide: wide.sha, refracted: refracted.sha, difference: refracted.difference }),
        );
        const [left, bottom, right, top] = refracted.difference.bounds;
        const center = [(left + right + 1) / 2, (bottom + top + 1) / 2];
        const targetCenter = [256 + (wide.state.x * 288) / 2, 144 + (wide.state.y * 288) / 2];
        assert.ok(
            center.every((value, axis) => Math.abs(value / dpr - targetCenter[axis]) < 8),
            JSON.stringify({ dpr, center, targetCenter, difference: refracted.difference }),
        );
        const renderLayout = await getSize();
        assert.ok(Math.abs(renderLayout.shaderCenter[0] - (wide.state.x * 288) / 1024) < 1e-7);
        assert.ok(Math.abs(renderLayout.shaderCenter[1] - wide.state.y / 2) < 1e-7);
        assert.deepEqual(refracted.edge, wide.edge);
        await v(page, (value) => e11.refraction(value), wide.state.refraction);
        assert.equal((await draw()).sha, wide.sha);
        const returned = await resize(384, 256);
        assert.equal(returned.generation, b.generation + 1);
        const restored = await draw();
        assert.equal(restored.sha, initial.sha);
        await page.mouse.up();
        const exit = await v(page, () => e11.exit());
        assert.equal(exit.receipt.status, 'released');
        assert.deepEqual(errors, []);
        return {
            dpr,
            initial: a,
            wide: b,
            returned,
            wideHash: wide.sha,
            refractedHash: refracted.sha,
            difference: refracted.difference,
            lensCenter: center,
            targetCenter,
            initialHash: initial.sha,
            returnedHash: restored.sha,
        };
    } catch (error) {
        throw new Error(`${error.stack || error}; browser: ${errors.join('; ')}`);
    } finally {
        await page.close();
    }
}

async function main() {
    const receipt = verifySourceBinding(root, bundle);
    if (!receipt.matches) throw new Error('E11 requires source-bound SDK');
    const server = createServer((req, res) => {
        const row = routes[new URL(req.url, 'http://localhost').pathname];
        if (!row) {
            res.writeHead(404).end();
            return;
        }
        res.writeHead(200, { 'Content-Type': row[0], 'Cache-Control': 'no-store' }).end(row[1]);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    let browser;
    try {
        const executablePath = process.env.AIR_PROBE_CHROMIUM_EXECUTABLE || process.env.AIR_PROBE_WEBKIT_EXECUTABLE;
        const webKit = Boolean(process.env.AIR_PROBE_WEBKIT_EXECUTABLE);
        browser = await (webKit ? webkit : chromium).launch({
            executablePath,
            ...(webKit ? {} : { chromiumSandbox: true }),
        });
        const origin = 'http://127.0.0.1:' + server.address().port + '/';
        const normal = await verify(browser, origin, 'no-preference');
        const reduced = await verify(browser, origin, 'reduce');
        const resize = [await verifyResize(browser, origin, 1), await verifyResize(browser, origin, 2)];
        const report = {
            browser: browser.version(),
            sourceBindingSha256: receipt.receiptSha256,
            normal,
            reduced,
            resize,
        };
        if (process.env.AIR_PROBE_OUTPUT)
            writeFileSync(process.env.AIR_PROBE_OUTPUT, JSON.stringify(report, null, 2) + '\n');
        console.log(
            JSON.stringify({
                browser: report.browser,
                renderer: normal.renderer,
                identicalSeekHash: normal.forward.sha,
                uniformChangesPixels: true,
                opacityBlendedChannels: normal.opacity.blendedChannels,
                resizedDpr: resize.map((row) => row.dpr),
                normalExit: normal.exit.receipt.status,
                reducedExit: reduced.exit.receipt.status,
            }),
        );
    } finally {
        await browser?.close();
        server.close();
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
