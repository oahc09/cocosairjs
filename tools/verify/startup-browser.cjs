// Run only through startup-browser-supervisor.cjs: one engine, bounded startup and real PID teardown.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
if (!process.env.AIR_STARTUP_SUPERVISED) throw Error('Use startup-browser-supervisor.cjs');
const option = (key) => process.argv.find((v) => v.startsWith(`--${key}=`))?.slice(key.length + 3);
const root = path.resolve(__dirname, '../..');
const engine = option('browser') || 'chromium';
const out = path.resolve(option('out')).replace(/\.json$/, '-probe.json');
if (fs.existsSync(out)) throw Error('report exists');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const stat = (pid) => {
    try {
        const raw = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'),
            s = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
        return { startTicks: s[19], pgrp: +s[2] };
    } catch {
        return null;
    }
};
// Hook before loading Playwright so the supervisor sees actual spawned browser exit/close events.
const spawn = cp.spawn;
cp.spawn = function (command, args, options) {
    const child = spawn.apply(this, arguments);
    process.send?.({
        processEvent: {
            type: 'spawn',
            row: { pid: child.pid, command, detached: !!options?.detached, initial: stat(child.pid) },
        },
    });
    for (const type of ['exit', 'close'])
        child.once(type, (code, signal) => process.send?.({ processEvent: { type, pid: child.pid, code, signal } }));
    return child;
};
const playwright = require('playwright');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const report = {
    started: new Date().toISOString(),
    engine,
    subset: true,
    completed: false,
    results: [],
    bundleHashes: {},
};
let browser, server;
const save = () => fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
(async () => {
    const baseline = cp.execFileSync(
        'git',
        ['show', 'f76257fc6805f2e9cd722f376d50afc402afe074:build/cocosair.module.js'],
        { cwd: root, maxBuffer: 20 * 1024 * 1024 },
    );
    const files = new Map([['/baseline.js', baseline]]);
    for (const name of ['cocosair.module.js', 'cocosair.module.spark.js', 'bootstrap.js', 'html-source.js']) {
        const bytes = fs.readFileSync(path.join(root, 'build', name));
        files.set('/build/' + name, bytes);
        report.bundleHashes[name] = sha(bytes);
    }
    server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (files.has(url.pathname)) {
            res.setHeader('Content-Type', 'text/javascript');
            res.end(files.get(url.pathname));
        } else {
            res.setHeader('Content-Type', 'text/html');
            res.end(
                '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}canvas{display:block;width:100%;height:100%}</style><body></body>',
            );
        }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const launch = { headless: true, timeout: 12000, env: loopbackBrowserEnv() };
    if (engine === 'chromium')
        Object.assign(launch, {
            executablePath: process.env.AIR_CHROMIUM_PATH || '/usr/bin/chromium',
            args: [
                '--no-sandbox',
                '--use-gl=angle',
                '--use-angle=swiftshader',
                '--enable-unsafe-swiftshader',
                '--disable-gpu-sandbox',
            ],
        });
    if (engine === 'webkit' && process.env.AIR_WEBKIT_PATH) launch.executablePath = process.env.AIR_WEBKIT_PATH;
    browser = await playwright[engine].launch(launch);
    const warm = await browser.newPage();
    await warm.goto(origin);
    await warm.close();
    process.send?.({ browserReady: true });
    report.browserVersion = browser.version();
    save();
    {
        const page = await browser.newPage();
        await page.goto(origin);
        const negative = await page.evaluate(async () => {
            try {
                await import('/baseline.js');
                return { failed: false };
            } catch (e) {
                return { failed: true, error: String(e) };
            }
        });
        assert.ok(
            negative.failed && /GameCanvas|appendChild/.test(negative.error),
            'fixed baseline distinguishes no-canvas import',
        );
        report.results.push({ case: 'baseline-no-canvas-negative', ...negative });
        await page.close();
        save();
    }
    for (const scenario of [
        { id: 'late-custom-high-dpr', dpr: 3.25, cap: 3, entry: 'cocosair.module.js', order: 'safe-first' },
        {
            id: 'late-default-fractional',
            dpr: 1.25,
            cap: 2,
            entry: 'cocosair.module.js',
            order: 'main-first',
            defaultCanvas: true,
        },
        { id: 'late-container', dpr: 1.5, cap: 2, entry: 'cocosair.module.js', container: true },
        { id: 'spark-late-custom', dpr: 1.5, cap: 3, entry: 'cocosair.module.spark.js', spark: true },
        { id: 'failed-startup', dpr: 1, cap: 2, entry: 'cocosair.module.js', fail: true },
    ]) {
        const context = await browser.newContext({
            viewport: { width: 640, height: 480 },
            deviceScaleFactor: scenario.dpr,
            hasTouch: true,
        });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.goto(origin);
        const startup = await page.evaluate(async (s) => {
            const windowEvents = [];
            const originalWindowAdd = window.addEventListener;
            window.addEventListener = function (type, ...args) {
                windowEvents.push(type);
                return originalWindowAdd.call(this, type, ...args);
            };
            const runtime = await import('/build/' + s.entry);
            if (s.spark && (typeof runtime.CocosRenderer !== 'function' || !runtime.sparkRuntime?.SplatMesh))
                throw new Error('Spark variant exports missing');
            if (!s.spark && runtime.sparkRuntime) throw new Error('Spark leaked into default');
            const afterImport = {
                canvases: document.querySelectorAll('canvas').length,
                wrappers: document.querySelectorAll('#GameDiv,#Cocos3dGameContainer').length,
                resizeListeners: windowEvents.filter((v) => v === 'resize').length,
            };
            window.dispatchEvent(new Event('resize'));
            window.dispatchEvent(new Event('orientationchange'));
            document.dispatchEvent(new Event('fullscreenchange'));
            const invalid = [];
            for (const options of [{ canvas: '#missing' }, { canvas: '[' }, { canvas: document.body }]) {
                try {
                    await runtime.createAirApp(options);
                    invalid.push('accepted');
                } catch (e) {
                    invalid.push(e.code);
                }
            }
            const canvas = document.createElement('canvas');
            canvas.id = s.defaultCanvas ? 'GameCanvas' : 'LateCustomCanvas';
            let host;
            if (s.container) {
                host = document.createElement('div');
                host.id = 'host';
                host.style.cssText = 'width:400px;height:300px;position:absolute;left:20px;top:30px';
                document.body.appendChild(host);
                host.appendChild(canvas);
            } else document.body.appendChild(canvas);
            const listenerCounts = {};
            const originalAdd = canvas.addEventListener.bind(canvas);
            canvas.addEventListener = (type, ...args) => {
                listenerCounts[type] = (listenerCounts[type] || 0) + 1;
                return originalAdd(type, ...args);
            };
            if (s.fail) {
                const get = canvas.getContext.bind(canvas);
                canvas.getContext = (type, ...args) => (type === 'webgl2' ? null : get(type, ...args));
            }
            const options = {
                canvas,
                pixelRatioCap: s.cap,
                screenMode: s.container ? 'container' : 'window',
                ...(s.container ? { container: host } : {}),
            };
            const safe = s.spark ? runtime : await import('/build/bootstrap.js');
            const a = (s.order === 'main-first' ? runtime : safe).createAirApp(options);
            const b = (s.order === 'main-first' ? safe : runtime).createAirApp(options);
            const sharedPromise = a === b;
            let conflict;
            try {
                await runtime.createAirApp({ ...options, pixelRatioCap: s.cap + 1 });
            } catch (e) {
                conflict = e.code;
            }
            if (s.fail) {
                const failures = await Promise.allSettled([a, b]);
                let retry;
                try {
                    await safe.createAirApp(options);
                } catch (e) {
                    retry = e.code;
                }
                return {
                    afterImport,
                    invalid,
                    sharedPromise,
                    conflict,
                    failed: failures.map((v) => (v.status === 'rejected' ? v.reason.code : 'resolved')),
                    retry,
                };
            }
            const [app, other] = await Promise.all([a, b]);
            const firstBuffer = [canvas.width, canvas.height];
            const scene = new runtime.Scene('StartupBinding');
            const cameraNode = new runtime.Node('Camera');
            const camera = cameraNode.addComponent(runtime.Camera);
            camera.clearFlags = runtime.Camera.ClearFlag.SOLID_COLOR;
            camera.clearColor = new runtime.Color(40, 120, 200, 255);
            scene.addChild(cameraNode);
            app.run(scene);
            const clock = runtime.createStepClock();
            clock.begin();
            await clock.step();
            const gl = canvas.getContext('webgl2'),
                pixel = new Uint8Array(4);
            gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            const hits = { mouse: 0, key: 0, touch: 0 };
            const locations = [];
            runtime.input.on(runtime.Input.EventType.MOUSE_DOWN, (e) => {
                hits.mouse++;
                locations.push([e.getLocation().x, e.getLocation().y]);
            });
            runtime.input.on(runtime.Input.EventType.KEY_DOWN, () => hits.key++);
            runtime.input.on(runtime.Input.EventType.TOUCH_START, () => hits.touch++);
            window.__probe = { runtime, app, canvas, clock, hits, locations, options, listenerCounts, host };
            return {
                afterImport,
                invalid,
                sharedPromise,
                sameApp: app === other,
                conflict,
                firstBuffer,
                rawDpr: devicePixelRatio,
                selectedCap: globalThis.__CCDPR_CAP__,
                selectedCanvas: globalThis.__CC_CANVAS__ === canvas,
                wrappers: document.querySelectorAll('#GameDiv,#Cocos3dGameContainer').length,
                listenerCounts: { ...listenerCounts },
                pixel: [...pixel],
                bodyStyle: document.body.style.cssText,
            };
        }, scenario);
        assert.deepEqual(startup.afterImport, { canvases: 0, wrappers: 0, resizeListeners: 0 });
        assert.ok(startup.invalid.every((code) => code === 'AIR_E_CANVAS'));
        assert.ok(startup.sharedPromise);
        assert.equal(startup.conflict, 'AIR_E_APP_CONFLICT');
        if (scenario.fail) {
            assert.deepEqual(startup.failed, ['WEBGL2_REQUIRED', 'WEBGL2_REQUIRED']);
            assert.equal(startup.retry, 'AIR_E_APP_RELOAD_REQUIRED');
        } else {
            assert.ok(startup.sameApp && startup.selectedCanvas);
            assert.equal(startup.selectedCap, scenario.cap);
            assert.equal(startup.wrappers, 2);
            const density = Math.min(startup.rawDpr, scenario.cap);
            assert.deepEqual(startup.firstBuffer, [
                Math.round((scenario.container ? 400 : 640) * density),
                Math.round((scenario.container ? 300 : 480) * density),
            ]);
            assert.deepEqual(startup.pixel, [40, 120, 200, 255]);
            for (const type of ['keydown', 'keyup', 'mousedown', 'touchstart'])
                assert.equal(startup.listenerCounts[type], 1, type + ' bound once');
            const box = await page.locator('canvas').boundingBox();
            await page.mouse.click(box.x + 60, box.y + 80);
            await page.keyboard.press('a');
            await page.touchscreen.tap(box.x + 90, box.y + 90);
            const input = await page.evaluate(async () => {
                await window.__probe.clock.step();
                return {
                    hits: window.__probe.hits,
                    locations: window.__probe.locations,
                    focused: document.activeElement === window.__probe.canvas,
                };
            });
            assert.equal(input.hits.key, 1);
            assert.equal(input.hits.touch, 1);
            assert.ok(input.hits.mouse >= 1 && input.hits.mouse <= 2);
            assert.ok(input.focused);
            const expectedLocation = [60 * density, ((scenario.container ? 300 : 480) - 80) * density];
            input.locations[0].forEach((v, i) => assert.ok(Math.abs(v - expectedLocation[i]) < 1));
            if (scenario.container)
                await page.evaluate(() => {
                    window.__probe.host.style.width = '321px';
                    window.__probe.host.style.height = '213px';
                });
            else await page.setViewportSize({ width: 511, height: 333 });
            const resized = [
                Math.round((scenario.container ? 321 : 511) * density),
                Math.round((scenario.container ? 213 : 333) * density),
            ];
            await page.waitForFunction(
                ([w, h]) => window.__probe.canvas.width === w && window.__probe.canvas.height === h,
                resized,
            );
            const final = await page.evaluate(async () => {
                const p = window.__probe;
                await p.clock.step();
                const before = { ...p.listenerCounts };
                await p.runtime.createAirApp(p.options);
                const unchangedListeners = JSON.stringify(before) === JSON.stringify(p.listenerCounts);
                const buffer = [p.canvas.width, p.canvas.height];
                await p.app.close();
                let closed;
                try {
                    await p.runtime.createAirApp(p.options);
                } catch (e) {
                    closed = e.code;
                }
                return { buffer, unchangedListeners, closed };
            });
            assert.deepEqual(final.buffer, resized);
            assert.ok(final.unchangedListeners);
            assert.equal(final.closed, 'AIR_E_APP_CLOSED');
            startup.input = input;
            startup.final = final;
        }
        assert.deepEqual(errors, []);
        report.results.push({ case: scenario.id, status: 'PASS', startup });
        save();
        await context.close();
    }
    report.completed = true;
    report.scopePassed = true;
})()
    .catch((e) => {
        report.error = String(e.stack || e);
        report.scopePassed = false;
        process.exitCode = 1;
    })
    .finally(async () => {
        if (browser) {
            try {
                await browser.close();
                report.browserCloseReturned = true;
            } catch (e) {
                report.closeError = String(e);
                process.exitCode = 1;
            }
        }
        if (server) await new Promise((resolve) => server.close(resolve));
        report.ended = new Date().toISOString();
        save();
        console.log(
            JSON.stringify({ scopePassed: report.scopePassed, results: report.results.length, error: report.error }),
        );
        if (process.connected) process.disconnect();
    });
