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
main{margin:18px auto;width:408px;padding:12px;border:1px solid #2c4857;border-radius:20px;background:#131f2d}
h1{font-size:17px;margin:0 0 8px}canvas{display:block;width:384px;height:256px;touch-action:none;border-radius:12px}
p, label{font-size:13px}label{display:flex;align-items:center;gap:12px}input{flex:1}
button{margin-top:10px;padding:6px;border-radius:8px;color:#e5f9ff;background:#1a3546;border:1px solid #76aeb7}
:focus-visible{outline:2px solid #97f8ea;outline-offset:3px}
</style>
<main><h1>E11 · Liquid glass motion</h1><canvas id="GameCanvas" width="384" height="256"></canvas>
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
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 53, y - 21);
        const drag = await draw();
        assert.notEqual(drag.sha, baseline.sha);
        assert.ok(drag.state.x > 0.3);
        assert.ok(drag.state.refraction > 0.6);
        await page.mouse.up();
        const returned = await st();
        const result = { renderer: await v(page, () => e11.renderer()), baseline, drag, returned };
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
        const report = { browser: browser.version(), sourceBindingSha256: receipt.receiptSha256, normal, reduced };
        if (process.env.AIR_PROBE_OUTPUT)
            writeFileSync(process.env.AIR_PROBE_OUTPUT, JSON.stringify(report, null, 2) + '\n');
        console.log(
            JSON.stringify({
                browser: report.browser,
                renderer: normal.renderer,
                identicalSeekHash: normal.forward.sha,
                uniformChangesPixels: true,
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
