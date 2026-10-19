/* Focused manual-recipe browser evidence. Never publishes canonical example status.
 * SDK_BUILD_DIR and SDK_RUNTIME_HEAD may select a diagnostic runtime; such runs
 * are explicitly cross-candidate and cannot satisfy same-head acceptance.
 */
const fs = require('node:fs'),
    path = require('node:path'),
    http = require('node:http'),
    crypto = require('node:crypto');
const assert = require('node:assert/strict'),
    esbuild = require('esbuild'),
    { PNG } = require('pngjs');
const playwright = require('playwright');
const root = path.resolve(__dirname, '../..'),
    build = path.resolve(process.env.SDK_BUILD_DIR || path.join(root, 'build'));
const output = path.resolve(process.env.SDK_BROWSER_OUT || path.join(root, 'output/sdk-recipes-browser'));
if (fs.existsSync(output)) throw Error('Evidence output exists; use a fresh SDK_BROWSER_OUT');
fs.mkdirSync(output, { recursive: true });
const engine = process.env.SDK_BROWSER || 'chromium',
    errors = [],
    rows = [],
    responses = new Map();
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const receipt = {
    timestamp: new Date().toISOString(),
    browser: engine,
    candidate: process.env.SDK_CANDIDATE_HEAD || 'working-tree',
    runtimeHead: process.env.SDK_RUNTIME_HEAD || process.env.SDK_CANDIDATE_HEAD || 'working-tree',
    crossCandidate: !!process.env.SDK_BUILD_DIR,
    rows,
    errors,
    canonicalEligible: false,
    completed: false,
};
const mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.ts': 'text/javascript',
    '.json': 'application/json',
    '.map': 'application/json',
};
const server = http.createServer(async (req, res) => {
    try {
        let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname === '/math-probe.html') {
            res.writeHead(200, { 'content-type': 'text/html' });
            res.end('<!doctype html><title>Math first</title>');
            return;
        }
        if (pathname === '/') pathname = '/docs/manual/examples/input-focus/index.html';
        if (pathname.endsWith('/')) pathname += 'index.html';
        let file =
            pathname === '/build/cocosair.module.js'
                ? path.join(build, 'cocosair.module.js')
                : path.resolve(root, '.' + pathname);
        if (!file.startsWith(root + path.sep) && file !== path.join(build, 'cocosair.module.js'))
            throw Error('Forbidden path');
        if (file.endsWith('.js') && !fs.existsSync(file)) file = file.slice(0, -3) + '.ts';
        let bytes = fs.readFileSync(file);
        if (file.endsWith('.ts'))
            bytes = Buffer.from(
                esbuild.transformSync(bytes.toString(), { loader: 'ts', format: 'esm', target: 'es2022' }).code,
            );
        responses.set(pathname, { path: pathname, sha256: hash(bytes), bytes: bytes.length });
        res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
        res.end(bytes);
    } catch (error) {
        res.writeHead(404);
        res.end(String(error));
    }
});
const loadHandle = async (page, name) => {
    await page.goto(base + '/docs/manual/examples/' + name + '/');
    await page.evaluate(async () => {
        window.__recipe = (await import(new URL('main.ts', location.href))).verification;
    });
};
let base, browser;
async function step(page) {
    return page.evaluate(async () => {
        const m = await import('/build/cocosair.module.js');
        window.__step ??= m.createStepClock();
        window.__step.begin();
        return window.__step.step();
    });
}
async function screenshot(page, name) {
    const bytes = await page.screenshot({ path: path.join(output, name + '.png') });
    const png = PNG.sync.read(bytes);
    return { name, sha256: hash(bytes), width: png.width, height: png.height, png };
}
function colorCount(image, predicate) {
    let n = 0;
    for (let i = 0; i < image.png.data.length; i += 4)
        if (predicate(image.png.data[i], image.png.data[i + 1], image.png.data[i + 2])) n++;
    return n;
}
async function record(id, fn) {
    try {
        const details = await fn();
        rows.push({ id, status: 'PASS', details });
        console.log(id + ' PASS');
    } catch (error) {
        rows.push({ id, status: 'FAIL', error: error.stack });
        console.error(id + ' FAIL ' + error);
    }
}
async function closePage(page) {
    try {
        await page.evaluate(async () => {
            window.__step?.end();
            const r = window.__recipe;
            if (r?.close) await r.close();
            else if (r?.recipe) await r.recipe.close();
            else if (r?.app?.close) await r.app.close();
        });
    } finally {
        await page.close();
    }
}
(async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = 'http://127.0.0.1:' + server.address().port;
    browser = await playwright[engine].launch({
        headless: true,
        ...(process.env.SDK_BROWSER_EXECUTABLE ? { executablePath: process.env.SDK_BROWSER_EXECUTABLE } : {}),
        ...(engine === 'chromium'
            ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
            : {}),
    });
    receipt.browserVersion = browser.version();
    const context = await browser.newContext({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 2 });
    context.on('page', (page) => page.on('pageerror', (e) => errors.push(String(e))));
    await record('math-first-main-parity-canvas-dpr', async () => {
        const page = await context.newPage();
        try {
            await page.goto(base + '/math-probe.html');
            await page.setContent(
                '<canvas id="decoy"></canvas><div id="host" style="width:320px;height:240px"><canvas id="selected" style="width:100%;height:100%"></canvas></div>',
            );
            const data = await page.evaluate(async (base) => {
                const before = { cc: window.cc, CocosEngine: window.CocosEngine };
                const math = await import(base + '/build/cocosair.math.js');
                if (window.cc !== before.cc || window.CocosEngine !== before.CocosEngine)
                    throw Error('math mutated host namespace');
                const m = await import(base + '/build/cocosair.module.js');
                const results = [];
                for (let i = 0; i < 32; i++) {
                    const a = new math.Vec3(i / 7, -i / 3, i * 0.125),
                        b = new m.Vec3(a.x, a.y, a.z),
                        qa = new math.Quat(),
                        qb = new m.Quat();
                    math.Quat.fromEuler(qa, i, 2 * i, -i);
                    m.Quat.fromEuler(qb, i, 2 * i, -i);
                    const ma = new math.Mat4(),
                        mb = new m.Mat4();
                    math.Mat4.fromRTS(ma, qa, a, new math.Vec3(1, 2, 3));
                    m.Mat4.fromRTS(mb, qb, b, new m.Vec3(1, 2, 3));
                    for (const key of [
                        'm00',
                        'm01',
                        'm02',
                        'm04',
                        'm05',
                        'm06',
                        'm08',
                        'm09',
                        'm10',
                        'm12',
                        'm13',
                        'm14',
                    ])
                        if (Math.abs(ma[key] - mb[key]) > 1e-10) throw Error('math drift ' + key);
                    results.push(a.length() - b.length());
                }
                const canvas = document.querySelector('#selected'),
                    app = await m.createAirApp({
                        canvas,
                        pixelRatioCap: 1,
                        screenMode: 'container',
                        container: '#host',
                    }),
                    scene = new m.Scene('Math first');
                const n = new m.Node('Camera');
                scene.addChild(n);
                const camera = n.addComponent(m.Camera);
                camera.clearFlags = m.Camera.ClearFlag.SOLID_COLOR;
                camera.clearColor = new m.Color(80, 40, 160, 255);
                app.run(scene);
                window.__recipe = { app };
                return {
                    selected: app.canvas === canvas,
                    dpr: devicePixelRatio,
                    width: canvas.width,
                    height: canvas.height,
                    decoyWidth: document.querySelector('#decoy').width,
                    maxError: Math.max(...results.map(Math.abs)),
                    exports: Object.keys(math).length,
                };
            }, base);
            assert.equal(data.selected, true);
            assert.equal(data.width, 320);
            assert.equal(data.height, 240);
            assert.equal(data.maxError, 0);
            await step(page);
            const shot = await screenshot(page, 'math-first');
            assert.ok(colorCount(shot, (r, g, b) => r > 30 && b > r * 1.3 && b > g * 2) > 5000);
            return { ...data, screenshot: shot.sha256 };
        } finally {
            await closePage(page);
        }
    });
    await record('focus-real-click-key-editable-leave-reenter', async () => {
        const page = await context.newPage();
        try {
            await loadHandle(page, 'input-focus');
            await step(page);
            await page.click('#start');
            await page.keyboard.press('a');
            await step(page);
            assert.equal(await page.evaluate(() => __recipe.presses), 1);
            await page.click('#hud');
            await page.keyboard.press('a');
            await step(page);
            assert.equal(await page.evaluate(() => __recipe.presses), 2);
            await page.click('#GameCanvas', { position: { x: 20, y: 20 } });
            await page.keyboard.down('a');
            await step(page);
            await page.click('#text');
            await page.keyboard.up('a');
            await step(page);
            assert.equal(await page.evaluate(() => __recipe.state.held('move')), false);
            const count = await page.evaluate(() => __recipe.presses);
            await page.keyboard.type('aaa');
            await step(page);
            assert.equal(await page.evaluate(() => __recipe.presses), count);
            await page.click('#leave');
            await page.keyboard.press('a');
            await step(page);
            assert.equal(await page.evaluate(() => __recipe.presses), count);
            for (let i = 0; i < 4; i++) {
                await page.click('#start');
                await page.keyboard.press('a');
                await step(page);
                await page.click('#leave');
            }
            assert.equal(await page.evaluate(() => __recipe.presses), count + 4);
            const shot = await screenshot(page, 'focus');
            assert.ok(colorCount(shot, (r, g, b) => r > 150 && g > 60 && g < 210 && b < 100) > 1000);
            const details = await page.evaluate(() => ({
                presses: __recipe.presses,
                held: __recipe.state.held('move'),
                attached: __recipe.input.attached,
                owned: __recipe.scope.ownedCount,
                reset: __recipe.state.lastReset(),
            }));
            return {
                ...details,
                screenshot: shot.sha256,
                realWindowBlur: 'NOT_RUN: headless window focus is a separate target-device check',
            };
        } finally {
            await closePage(page);
        }
    });
    await record('lifecycle-cancel-before-mount', async () => {
        const page = await context.newPage();
        try {
            await loadHandle(page, 'runtime-lifecycle-page');
            await page.click('#close');
            const result = await page.evaluate(async () => {
                const a = __recipe.recipe.close(),
                    b = __recipe.recipe.close();
                return {
                    same: a === b,
                    receipt: await a,
                    mounted: await __recipe.recipe.ready.catch((error) =>
                        error.name === 'AbortError' ? false : Promise.reject(error),
                    ),
                    disabled: document.querySelector('#angle').disabled,
                };
            });
            assert.equal(result.same, true);
            assert.equal(result.mounted, false);
            assert.equal(result.disabled, true);
            assert.equal(result.receipt.status, 'released');
            return result;
        } finally {
            await closePage(page);
        }
    });
    await record('lifecycle-real-context-loss-reload', async () => {
        const page = await context.newPage();
        try {
            await loadHandle(page, 'runtime-lifecycle-page');
            assert.equal(await page.evaluate(() => __recipe.recipe.ready), true);
            const before = await page.evaluate(() => {
                const app = __recipe.app,
                    canvas = app.canvas;
                const extension = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
                if (!extension) throw Error('WEBGL_lose_context unavailable: actual loss/reload NOT_RUN');
                sessionStorage.removeItem('sdk-context-reload');
                const evidence = { states: [], events: [], receipt: null, reloadCalls: 0 };
                const save = () => sessionStorage.setItem('sdk-context-reload', JSON.stringify(evidence));
                app.contextHealth.onChange((health) => {
                    evidence.states.push(health.state);
                    save();
                });
                for (const type of ['webglcontextlost', 'webglcontextrestored'])
                    canvas.addEventListener(type, (event) => {
                        evidence.events.push({ type, trusted: event.isTrusted });
                        save();
                    });
                const close = app.close.bind(app);
                app.close = () =>
                    close().then((receipt) => {
                        evidence.receipt = receipt;
                        save();
                        return receipt;
                    });
                const reload = app.contextHealth.requestReload.bind(app.contextHealth);
                app.contextHealth.requestReload = () => {
                    evidence.reloadCalls++;
                    save();
                    return reload();
                };
                window.__lose = extension;
                extension.loseContext();
                return { timeOrigin: performance.timeOrigin, url: location.href };
            });
            await page.waitForFunction(() => __recipe.app.contextHealth.snapshot().state === 'lost');
            const lost = await page.evaluate(() => ({
                health: __recipe.app.contextHealth.snapshot(),
                disabled: document.querySelector('#angle').disabled,
                aborted: __recipe.recipe.signal.aborted,
            }));
            assert.equal(lost.health.isContextLost, true);
            assert.equal(lost.disabled, true);
            assert.equal(lost.aborted, true);
            const navigated = page.waitForNavigation({ waitUntil: 'load' });
            await page.evaluate(() => __lose.restoreContext());
            await navigated;
            const after = await page.evaluate(async () => {
                window.__recipe = (await import(new URL('main.ts', location.href))).verification;
                return {
                    evidence: JSON.parse(sessionStorage.getItem('sdk-context-reload')),
                    timeOrigin: performance.timeOrigin,
                    url: location.href,
                    ready: await __recipe.recipe.ready,
                    health: __recipe.app.contextHealth.snapshot().state,
                };
            });
            assert.equal(after.url, before.url);
            assert.notEqual(after.timeOrigin, before.timeOrigin);
            assert.deepEqual(after.evidence.states, ['lost', 'restoring', 'failed']);
            assert.deepEqual(after.evidence.events, [
                { type: 'webglcontextlost', trusted: true },
                { type: 'webglcontextrestored', trusted: true },
            ]);
            assert.equal(after.evidence.receipt.status, 'released');
            assert.equal(after.evidence.reloadCalls, 1);
            assert.equal(after.ready, true);
            assert.equal(after.health, 'healthy');
            await step(page);
            const shot = await screenshot(page, 'context-full-reload');
            assert.ok(colorCount(shot, (r, g, b) => r > 150 && g > 70 && g < 210 && b < 110) > 1000);
            return {
                before,
                lost,
                after,
                screenshot: shot.sha256,
                method: 'Real WEBGL_lose_context loss/restore plus actual same-URL navigation; not physical GPU reset',
            };
        } finally {
            await closePage(page);
        }
    });
    await record('pageflip-real-upload-visible-front-back-and-close', async () => {
        const page = await context.newPage();
        try {
            await loadHandle(page, 'runtime-lifecycle-page');
            assert.equal(await page.evaluate(() => __recipe.recipe.ready), true);
            await step(page);
            await page.evaluate(() => {
                window.__uploads = [];
                for (const side of ['front', 'back']) {
                    const target = __recipe.resource[side],
                        update = target.mesh.updateSubMesh.bind(target.mesh);
                    target.mesh.updateSubMesh = (i, data) => {
                        __uploads.push({
                            side,
                            positions: Array.from(data.positions),
                            normals: Array.from(data.normals),
                            indices: Array.from(data.indices16),
                        });
                        return update(i, data);
                    };
                }
            });
            const shots = [];
            for (const angle of [0, 30, 60, 90, 120, 150, 180, 150, 120, 90, 60, 30, 0]) {
                await page.locator('#angle').fill(String(angle));
                await step(page);
                const shot = await screenshot(page, 'page-' + shots.length + '-' + angle);
                shots.push({
                    angle,
                    sha256: shot.sha256,
                    orange: colorCount(shot, (r, g, b) => r > 150 && g > 70 && g < 210 && b < 110),
                    blue: colorCount(shot, (r, g, b) => b > 150 && g > 80 && r < 130),
                });
            }
            assert.ok(shots[0].orange > 1000);
            assert.ok(shots[6].blue > 1000);
            const uploads = await page.evaluate(() => __uploads);
            assert.equal(uploads.length, 26);
            assert.ok(uploads.every((u) => u.positions.every(Number.isFinite) && u.normals.every(Number.isFinite)));
            for (let i = 0; i < uploads.length; i += 2) {
                assert.equal(uploads[i].side, 'front');
                assert.equal(uploads[i + 1].side, 'back');
                assert.deepEqual(uploads[i].positions, uploads[i + 1].positions);
                assert.ok(uploads[i].normals.every((v, j) => Math.abs(v + uploads[i + 1].normals[j]) < 1e-6));
            }
            fs.writeFileSync(path.join(output, 'page-uploads.json'), JSON.stringify(uploads));
            const audioAvailable = await page.evaluate(() => typeof AudioContext === 'function');
            if (audioAvailable) {
                await page.click('#audio');
                await page.waitForFunction(() => __recipe.audio?.state === 'running');
            }
            await page.click('#close');
            const receipt = await page.evaluate(() => __recipe.recipe.close());
            if (audioAvailable) assert.equal(await page.evaluate(() => __recipe.audio.state), 'closed');
            assert.equal(receipt.status, 'released');
            return {
                shots,
                uploads: uploads.length,
                receipt,
                audio: audioAvailable
                    ? 'PASS: gesture resumed real AudioContext; close awaited its closed state'
                    : 'NOT_RUN: AudioContext unavailable',
            };
        } finally {
            await closePage(page);
        }
    });
    await record('texture-real-import-priority-replacements-cleanup', async () => {
        const page = await context.newPage();
        try {
            await loadHandle(page, 'texture-replacement');
            await step(page);
            const counts = [];
            const png = await page.evaluate(() => {
                const c = document.createElement('canvas');
                c.width = c.height = 16;
                const x = c.getContext('2d');
                x.fillStyle = '#35bb7a';
                x.fillRect(0, 0, 16, 16);
                return c.toDataURL().split(',')[1];
            });
            for (let i = 0; i < 12; i++) {
                await page.evaluate(() => {
                    window.__previousFrame = __recipe.sprite.spriteFrame;
                });
                await page.setInputFiles('#import', {
                    name: 'image-' + i + '.png',
                    mimeType: 'image/png',
                    buffer: Buffer.from(png, 'base64'),
                });
                // The previous import also says "replaced"; wait for this real frame commit.
                await page.waitForFunction(() => __recipe.sprite.spriteFrame !== __previousFrame);
                await step(page);
                counts.push(await page.evaluate(() => __recipe.app.session.ownedCount));
            }
            assert.equal(new Set(counts).size, 1);
            await page.evaluate(() => {
                window.__frame = __recipe.sprite.spriteFrame;
            });
            await page.locator('#paper').fill('#ff0000');
            await step(page);
            assert.equal(await page.evaluate(() => __recipe.sprite.spriteFrame === __frame), true);
            assert.ok((await page.locator('#status').textContent()).startsWith('preserved-import'));
            const shot = await screenshot(page, 'texture');
            assert.ok(colorCount(shot, (r, g, b) => g > 130 && r < 100 && b > 70 && b < 180) > 1000);
            await page.click('#close');
            const closed = await page.evaluate(async () => {
                const receipt = await __recipe.app.close();
                return { receipt, count: __recipe.app.session.ownedCount, frame: __recipe.sprite.spriteFrame };
            });
            assert.equal(closed.receipt.status, 'released');
            assert.equal(closed.count, 0);
            assert.equal(closed.frame, null);
            return { counts, screenshot: shot.sha256, closed };
        } finally {
            await closePage(page);
        }
    });
    await record('two-program-vertex-texture-custom-color-visible', async () => {
        const page = await context.newPage();
        try {
            await loadHandle(page, 'color-input-contract');
            await step(page);
            const shot = await screenshot(page, 'color-contract');
            const counts = {
                target: colorCount(
                    shot,
                    (r, g, b) => Math.abs(r - 128) <= 2 && Math.abs(g - 90) <= 2 && Math.abs(b - 50) <= 2,
                ),
                negative: colorCount(shot, (r, g, b) => r >= 52 && r <= 58 && g >= 23 && g <= 29 && b >= 6 && b <= 11),
            };
            assert.ok(counts.target > 5000, JSON.stringify(counts));
            assert.ok(counts.negative > 1000, JSON.stringify(counts));
            const points = await page.evaluate(async () => {
                const { Vec3 } = await import('/build/cocosair.module.js');
                const rect = __recipe.app.canvas.getBoundingClientRect(),
                    canvas = __recipe.app.canvas;
                return [0, 1].flatMap((program) =>
                    [0, 1, 2, 3].map((mode) => {
                        const point = __recipe.camera.worldToScreen(
                            new Vec3((mode - 1.5) * 1.65, program ? -0.8 : 0.8, 0),
                        );
                        return {
                            program,
                            mode,
                            x: rect.left + (point.x / canvas.width) * rect.width,
                            y: rect.top + (1 - point.y / canvas.height) * rect.height,
                        };
                    }),
                );
            });
            const pixels = points.map((point) => {
                const x = Math.round((point.x * shot.width) / 960),
                    y = Math.round((point.y * shot.height) / 720),
                    offset = (y * shot.width + x) * 4;
                return { ...point, rgba: Array.from(shot.png.data.slice(offset, offset + 4)) };
            });
            for (const pixel of pixels) {
                const expected = pixel.mode === 3 ? [55, 26, 8] : [128, 90, 50];
                assert.ok(
                    expected.every((v, i) => Math.abs(v - pixel.rgba[i]) <= 2),
                    JSON.stringify(pixel),
                );
            }
            return {
                counts,
                pixels,
                screenshot: shot.sha256,
                bindings: await page.evaluate(() => __recipe.bindings),
                readback: 'Screenshot pixels; per-pass GPU readback remains separate',
            };
        } finally {
            await closePage(page);
        }
    });
    await context.close();
    receipt.applicationCompleted = true;
})()
    .catch((error) => errors.push(error.stack))
    .finally(async () => {
        try {
            if (browser) {
                await browser.close();
                receipt.browserCloseResolved = true;
                receipt.browserDisconnected = !browser.isConnected();
            }
        } catch (e) {
            errors.push('browser close: ' + e);
        }
        await new Promise((resolve) => server.close(resolve));
        esbuild.stop();
        receipt.completed = receipt.applicationCompleted === true && receipt.browserCloseResolved === true;
        receipt.responses = [...responses.values()];
        receipt.runtimeSHA256 = hash(fs.readFileSync(path.join(build, 'cocosair.module.js')));
        receipt.mathSHA256 = hash(fs.readFileSync(path.join(root, 'build/cocosair.math.js')));
        receipt.passed =
            receipt.completed && !errors.length && rows.length === 7 && rows.every((row) => row.status === 'PASS');
        fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
        console.log(
            JSON.stringify({ passed: receipt.passed, rows: rows.map((r) => ({ id: r.id, status: r.status })), errors }),
        );
        if (!receipt.passed) process.exitCode = 1;
    });
