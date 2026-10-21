/* Focused browser acceptance. Writes immutable attempts under output/box2d/acceptance/.
 * --engine=chromium|firefox|webkit --scope=official|integration|all --limit=N (diagnostic subset only).
 * Does not publish canonical example evidence. NODE_PATH may point to configured Playwright tooling. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const zlib = require('zlib');
const assert = require('assert/strict');
const { transformSync } = require('esbuild');
const { PNG } = require('pngjs');
const playwright = require('playwright');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..');
const arg = (name, fallback) =>
    process.argv
        .find((v) => v.startsWith(`--${name}=`))
        ?.split('=')
        .slice(1)
        .join('=') ?? fallback;
const engine = arg('engine', 'chromium'),
    scope = arg('scope', 'all'),
    limit = Number(arg('limit', '0'));
assert(['chromium', 'firefox', 'webkit'].includes(engine));
assert(['official', 'integration', 'all'].includes(scope));
const manifest = require('../../vendor/box2d/manifest.json');
const attempt = path.join(
    root,
    'output/box2d/acceptance',
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${engine}-${scope}`,
);
fs.mkdirSync(attempt, { recursive: true });
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function inputs() {
    const names = [
        'vendor/box2d/manifest.json',
        'vendor/box2d/runtime/receipt.json',
        'build/cocosair.module.js',
        'build/box2d3/air-box2d.mjs',
        'build/box2d3/air-box2d.wasm',
        'build/box2d3-samples/air-box2d-samples.mjs',
        'build/box2d3-samples/air-box2d-samples.wasm',
        'src/air/physics-2d/box2d3.ts',
        'examples/box2d3-lab/src/main.ts',
        'examples/box2d3-lab/src/official.ts',
        'examples/box2d3-lab/index.html',
        'examples/box2d3-lab/official.html',
        'src/air/app.ts',
        'src/air/app-config.ts',
        'src/air/bootstrap.ts',
        'src/air/index.ts',
        'tools/verify/box2d3.cjs',
        'tools/verify/box2d3-integration.js',
    ];
    return Object.fromEntries(names.map((name) => [name, hash(path.join(root, name))]));
}
function save(name, value) {
    fs.writeFileSync(path.join(attempt, name), JSON.stringify(value, null, 2) + '\n');
}
function pixels(file) {
    const png = PNG.sync.read(fs.readFileSync(file));
    const colors = new Set();
    let changed = 0;
    const first = '17,27,41';
    for (let i = 0; i < png.data.length; i += 4) {
        const rgb = png.data.slice(i, i + 3).join(',');
        colors.add(rgb);
        if (rgb !== first) changed++;
    }
    return { colors: colors.size, changed, total: png.width * png.height };
}
const server = http.createServer((req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/favicon.ico') {
            res.writeHead(204);
            return res.end();
        }
        if (url.pathname === '/box2d3-negative.html') {
            res.setHeader('Content-Type', 'text/html');
            return res.end('<!doctype html><canvas id="GameCanvas"></canvas>');
        }
        let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(root + path.sep)) throw Error('path');
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
        if (!fs.existsSync(file)) {
            res.writeHead(404);
            return res.end('Not found');
        }
        const ext = path.extname(file);
        res.setHeader(
            'Content-Type',
            {
                '.html': 'text/html',
                '.ts': 'text/javascript',
                '.js': 'text/javascript',
                '.mjs': 'text/javascript',
                '.wasm': 'application/wasm',
                '.json': 'application/json',
                '.png': 'image/png',
            }[ext] || 'application/octet-stream',
        );
        if (ext === '.ts')
            res.end(
                transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'esm', target: 'es2022' }).code,
            );
        else fs.createReadStream(file).pipe(res);
    } catch (error) {
        res.writeHead(500);
        res.end(String(error));
    }
});
async function official(browser, base, report) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('console', (msg) =>
        fs.appendFileSync(path.join(attempt, 'official-console.log'), `${msg.type()}: ${msg.text()}\n`),
    );
    await page.goto(`${base}/examples/box2d3-lab/official.html`);
    await page.waitForFunction(() => !!window.box2d3Official, {}, { timeout: 120000 });
    const list = await page.evaluate(() => {
        window.box2d3Official.stop();
        return window.box2d3Official.list;
    });
    assert.equal(list.length, manifest.samples.length, 'compiled registry must cover every frozen registration');
    assert.deepEqual(
        list.map((r) => `${r.category}/${r.name}`).sort(),
        manifest.samples.map((r) => `${r.category}/${r.name}`).sort(),
    );
    save('official-inventory.json', list);
    for (const row of limit ? list.slice(0, limit) : list) {
        const start = Date.now();
        const stem = `case-${String(row.index).padStart(3, '0')}`;
        const result = { ...row, pass: false };
        try {
            const observation = await page.evaluate(
                async ({ index, category }) => {
                    const h = window.box2d3Official;
                    h.samples.open(index);
                    const initial = h.samples.tick(1, true);
                    const steps = category === 'Determinism' ? 1000 : 120;
                    let final;
                    for (let i = 1; i < steps; i++) final = h.samples.tick(1, i === steps - 1);
                    h.draw(final);
                    const canvas = document.getElementById('view'),
                        data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                    let painted = 0;
                    for (let i = 0; i < data.length; i += 4)
                        if (data[i] !== 17 || data[i + 1] !== 27 || data[i + 2] !== 41) painted++;
                    return {
                        initial,
                        final,
                        steps,
                        sourceImage: { painted, width: canvas.width, height: canvas.height },
                    };
                },
                { index: row.index, category: row.category },
            );
            fs.writeFileSync(path.join(attempt, `${stem}.json.gz`), zlib.gzipSync(JSON.stringify(observation)));
            assert.equal(observation.final.invalid, 0, 'draw coordinates must remain finite');
            assert(
                observation.final.primitives > 0 || observation.final.text.length > 0,
                'scenario must produce real observed output',
            );
            assert((observation.final.bounds ?? []).every(Number.isFinite), 'world bounds must be finite');
            const analytic = ['Shape Distance', 'Dynamic Tree', 'Ray Cast', 'Manifold', 'Smooth Manifold'];
            if (!(row.category === 'Collision' && analytic.includes(row.name)))
                assert(
                    observation.final.step >= observation.steps,
                    'official solver scenario must advance every requested frame',
                );
            else assert(observation.final.geometry.length > 0, 'analytical scenario must output its actual geometry');
            await page.locator('#view').screenshot({ path: path.join(attempt, `${stem}.png`) });
            const image = pixels(path.join(attempt, `${stem}.png`));
            const expectedArea =
                (observation.sourceImage.painted * image.total) /
                (observation.sourceImage.width * observation.sourceImage.height);
            assert(observation.sourceImage.painted > 0, 'official scenario must paint a non-empty frame');
            assert(
                image.colors >= 2 && image.changed >= Math.max(1, expectedArea * 0.75),
                'compositor must present the actual painted scenario area',
            );
            const released = await page.evaluate(() => window.box2d3Official.samples.close());
            assert(released.released, 'native allocations must return to pre-case boundary');
            Object.assign(result, {
                pass: true,
                steps: observation.steps,
                initial: {
                    step: observation.initial.step,
                    bodies: observation.initial.bodies,
                    shapes: observation.initial.shapes,
                },
                final: {
                    step: observation.final.step,
                    bodies: observation.final.bodies,
                    shapes: observation.final.shapes,
                    primitives: observation.final.primitives,
                },
                released,
                image,
            });
        } catch (error) {
            result.error = String(error);
            try {
                result.released = await page.evaluate(() => window.box2d3Official.samples.close());
            } catch (e) {
                result.closeError = String(e);
            }
        }
        result.elapsedMs = Date.now() - start;
        report.official.push(result);
        save(`${stem}-result.json`, result);
        save('report.json', report);
        console.log(
            `${result.pass ? 'PASS' : 'FAIL'} ${row.index + 1}/${list.length} ${row.category}/${row.name}${result.error ? ' ' + result.error : ''}`,
        );
        if (errors.length) {
            report.pageErrors.push(...errors);
            break;
        }
    }
    report.officialBoundary = await page.evaluate(() => ({
        acknowledged: true,
        release: window.box2d3Official.samples.close(),
    }));
    await page.close();
}
async function integration(browser, base, report) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('console', (msg) =>
        fs.appendFileSync(path.join(attempt, 'integration-console.log'), `${msg.type()}: ${msg.text()}\n`),
    );
    await page.goto(`${base}/examples/box2d3-lab/`);
    try {
        await page.waitForFunction(() => !!window.box2d3Lab, {}, { timeout: 120000 });
    } catch (error) {
        report.integration = { error: String(error), startupErrors: errors };
        report.pageErrors.push(...errors);
        await page.screenshot({ path: path.join(attempt, 'integration-startup-failure.png') }).catch(() => {});
        throw error;
    }
    const result = await page.evaluate(async () => {
        try {
            const probe = await import('/tools/verify/box2d3-integration.js');
            return await probe.run(window.box2d3Lab);
        } catch (e) {
            return { error: String(e), stack: e.stack, rows: e.acceptanceRows ?? [] };
        }
    });
    report.integration = result;
    save('integration-result.json', result);
    if (result.error) {
        await page.screenshot({ path: path.join(attempt, 'integration-failure.png') });
        throw Error(result.error);
    }
    // Real browser pointer events drive the public MouseJoint2D input path.
    await page.evaluate(async () => {
        const l = window.box2d3Lab;
        l.clock.begin();
        l.canvasNode.setPosition(740, 410, 0);
        await l.clock.step();
        await l.clock.step();
    });
    const pointerStart = await page.evaluate(() => ({
        x: window.box2d3Lab.drag.node.worldPosition.x,
        y: window.box2d3Lab.drag.node.worldPosition.y,
    }));
    await page.mouse.move(640, 360);
    await page.mouse.down();
    await page.evaluate(() => window.box2d3Lab.clock.step());
    await page.mouse.move(780, 300, { steps: 15 });
    await page.evaluate(async () => {
        const l = window.box2d3Lab;
        l.clock.begin();
        for (let i = 0; i < 90; i++) await l.clock.step();
    });
    const dragged = await page.evaluate(() => ({
        x: window.box2d3Lab.drag.node.worldPosition.x,
        y: window.box2d3Lab.drag.node.worldPosition.y,
        stats: window.box2d3Lab.stats(),
    }));
    assert(
        dragged.stats.joints === 1 && dragged.x - pointerStart.x > 100 && dragged.y - pointerStart.y > 40,
        'real drag must create motor joint and move rigid body',
    );
    report.integration.pointerStart = pointerStart;
    report.integration.dragged = dragged;
    await page.mouse.up();
    await page.evaluate(async () => {
        const l = window.box2d3Lab;
        l.clock.begin();
        l.physics.debugDrawFlags = 1;
        for (let i = 0; i < 3; i++) await l.clock.step();
    });
    await page.screenshot({ path: path.join(attempt, 'integration-debug.png') });
    const greenCount = (file) => {
        const image = PNG.sync.read(fs.readFileSync(file));
        let count = 0;
        for (let y = 150; y < 500; y++)
            for (let x = 650; x < 950; x++) {
                const i = (y * image.width + x) * 4;
                if (image.data[i] < 100 && image.data[i + 1] > 140 && image.data[i + 2] < 120) count++;
            }
        return count;
    };
    const debugPixels = greenCount(path.join(attempt, 'integration-debug.png'));
    report.integration.debugState = await page.evaluate(() => {
        const l = window.box2d3Lab,
            n = l.scene.getChildByName('Canvas')?.getChildByName('Box2D3 Debug'),
            g = n?.getComponent(l.air.Graphics);
        return {
            flags: l.physics.debugDrawFlags,
            node: !!n,
            active: n?.active,
            position: n?.worldPosition,
            layer: n?.layer,
            graphics: !!g,
            model: !!g?.model,
            body: l.drag.node.worldPosition,
            renderFlag: g?._renderFlag,
            isDrawing: g?._isDrawing,
            upload: g?._isNeedUploadData,
            subModels: g?.model?.subModels.map((s) => ({
                vertexCount: s.inputAssembler.vertexCount,
                indexCount: s.inputAssembler.indexCount,
            })),
            vertices: Array.from(g?.impl?.getRenderDataList?.()[0]?.vData?.slice(0, 36) ?? []),
            paths: g?.impl?.paths?.length,
            renderData: g?.impl
                ?.getRenderDataList?.()
                .map((d) => ({ vertexCount: d.vertexCount, indexCount: d.indexCount })),
        };
    });
    assert(debugPixels > 20, 'Shape debug flags must draw actual Cocos Graphics outlines');
    await page.evaluate(async () => {
        const l = window.box2d3Lab;
        l.clock.begin();
        l.physics.debugDrawFlags = 0;
        await l.clock.step();
    });
    await page.screenshot({ path: path.join(attempt, 'integration.png') });
    const disabledDebugPixels = greenCount(path.join(attempt, 'integration.png'));
    assert(disabledDebugPixels < debugPixels / 4, 'disabling debug flags must clear the visible overlay');
    report.integration.debug = { debugPixels, disabledDebugPixels };
    report.integration.image = pixels(path.join(attempt, 'integration.png'));
    const rendered = PNG.sync.read(fs.readFileSync(path.join(attempt, 'integration.png')));
    let yellow = 0;
    for (let y = 150; y < 500; y++)
        for (let x = 650; x < 950; x++) {
            const i = (y * rendered.width + x) * 4;
            if (rendered.data[i] > 180 && rendered.data[i + 1] > 120 && rendered.data[i + 2] < 160) yellow++;
        }
    report.integration.image.yellowPixelsInDraggedBodyRegion = yellow;
    assert(yellow > 500, 'the dragged Cocos Graphics body must appear in the compositor screenshot');
    const cleanup = await page.evaluate(async () => {
        const l = window.box2d3Lab;
        l.stop();
        l.clock.end();
        await l.app.releaseScene();
        const released = l.stats();
        await l.app.close();
        return { released, closed: l.stats() };
    });
    assert.equal(cleanup.released.shapes, 0);
    assert.equal(cleanup.released.joints, 0);
    assert.equal(cleanup.closed.worlds, 0);
    report.integration.cleanup = cleanup;
    report.integrationBoundary = await page.evaluate(() => ({ acknowledged: true, closed: window.box2d3Lab.stats() }));
    report.pageErrors.push(...errors);
    await page.close();
    // Admission/load failure contracts use separate documents, preserving bootstrap isolation.
    const negative = await browser.newPage();
    await negative.goto(`${base}/box2d3-negative.html`);
    const checks = await negative.evaluate(async () => {
        const a = await import('/build/cocosair.module.js');
        const canvas = document.querySelector('canvas');
        const rows = [];
        for (const options of [
            { physics2D: 'bad' },
            { physics2D: 'box2d-v3-wasm', box2d3: { subStepCount: 0 } },
            { physics2D: 'box2d-v3-wasm', box2d3: { assetBaseUrl: '/missing-box2d/' } },
        ]) {
            try {
                await a.createAirApp({ canvas, ...options });
                rows.push({ pass: false });
            } catch (e) {
                rows.push({ pass: true, error: String(e) });
            }
        }
        return rows;
    });
    assert(checks.every((r) => r.pass));
    assert(checks[0].error.includes('AIR_E_PHYSICS_2D_BACKEND'));
    assert(checks[1].error.includes('BOX2D3_SUBSTEPS'));
    assert(checks[2].error.includes('BOX2D3_LOAD: HTTP 404'));
    report.integration.negative = checks;
    await negative.close();
    const defaultPage = await browser.newPage();
    const defaultErrors = [];
    defaultPage.on('pageerror', (error) => defaultErrors.push(String(error)));
    const requests = [];
    defaultPage.on('request', (request) => {
        if (request.url().includes('/box2d3/')) requests.push(request.url());
    });
    await defaultPage.goto(`${base}/examples/starter/`);
    await defaultPage.waitForFunction(() => !!window.__airApp?.getScene());
    await defaultPage.waitForTimeout(300);
    assert.equal(requests.length, 0, 'default backend must not fetch optional WASM assets');
    assert.equal(defaultErrors.length, 0, 'default backend must still start without runtime errors');
    report.integration.defaultBackendRequests = requests;
    await defaultPage.close();
}
(async () => {
    const report = {
        schema: 1,
        engine,
        scope,
        subset: limit > 0,
        complete: false,
        pass: false,
        started: new Date().toISOString(),
        inputs: inputs(),
        official: [],
        integration: null,
        pageErrors: [],
    };
    save('report.json', report);
    let browserServer, browser, child, exitStatus, closeStatus;
    let exited = false,
        closed = false;
    try {
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const base = `http://127.0.0.1:${server.address().port}`;
        browserServer = await playwright[engine].launchServer({ headless: true, ...launchOptions(engine) });
        child = browserServer.process();
        child.once('exit', (code, signal) => {
            exited = true;
            exitStatus = { code, signal };
        });
        child.once('close', (code, signal) => {
            closed = true;
            closeStatus = { code, signal };
        });
        browser = await playwright[engine].connect(browserServer.wsEndpoint());
        report.browserVersion = browser.version();
        if (scope !== 'official') await integration(browser, base, report);
        if (scope !== 'integration') await official(browser, base, report);
        report.complete = !limit && (scope === 'integration' || report.official.length === manifest.samples.length);
        assert.deepEqual(inputs(), report.inputs, 'source/assets changed while collecting');
        report.pass =
            report.complete &&
            report.pageErrors.length === 0 &&
            report.official.every((r) => r.pass) &&
            !report.integration?.error;
    } catch (error) {
        report.error = String(error);
        report.stack = error.stack;
    } finally {
        if (browserServer) {
            const start = Date.now();
            const boundary = {
                acknowledged: Boolean(
                    report.integrationBoundary?.acknowledged || report.officialBoundary?.acknowledged,
                ),
                applicationPass: report.pass,
                official: report.officialBoundary,
                integration: report.integrationBoundary,
            };
            let timeout;
            try {
                await Promise.race([
                    (async () => {
                        if (browser) await browser.close();
                        await browserServer.close();
                    })(),
                    new Promise((_, reject) => {
                        timeout = setTimeout(() => reject(Error('physical close budget exceeded')), 4000);
                    }),
                ]);
                await new Promise((resolve) => setTimeout(resolve, 0));
            } catch (error) {
                report.closeError = String(error);
            } finally {
                clearTimeout(timeout);
            }
            let pidGone = false;
            try {
                process.kill(child.pid, 0);
            } catch (error) {
                pidGone = error.code === 'ESRCH';
            }
            report.shutdown = {
                boundary,
                pid: child.pid,
                exited,
                closed,
                exitStatus,
                closeStatus,
                pidGone,
                elapsedMs: Date.now() - start,
                waitContract:
                    process.platform === 'win32'
                        ? 'ChildProcess exit+close; ECHILD not applicable on Windows'
                        : 'ChildProcess exit+close',
            };
            if (!boundary.acknowledged || !exited || !closed || !pidGone || report.closeError) report.pass = false;
        }
        server.close();
        report.finished = new Date().toISOString();
        save('report.json', report);
        console.log(
            JSON.stringify({
                attempt: path.relative(root, attempt),
                pass: report.pass,
                complete: report.complete,
                official: report.official.length,
                integration: report.integration?.rows?.length,
                error: report.error,
            }),
        );
        if (!report.pass) process.exitCode = 1;
    }
})();
