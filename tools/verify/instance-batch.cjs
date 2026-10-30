/* F01 native indexed instancing: actual GL draws, pixels, committed bounds/picking and ownership. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert/strict');
const crypto = require('crypto');
const { PNG } = require('pngjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const { serveStaticFile } = require('./static-file-response.cjs');
const args = Object.fromEntries(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
if (!args.out) throw Error('--out=<new-directory> required');
const root = path.resolve(__dirname, '../..');
const out = path.resolve(root, args.out);
const bundle = path.resolve(root, args.bundle || 'build/cocosair.module.js');
fs.mkdirSync(out);
const report = {
    completed: false,
    subset: true,
    scope: 'local Chromium F01 instance-batch contract; not release acceptance',
    cases: [],
    errors: [],
    fingerprints: {},
};
const inputs = [
    bundle,
    bundle + '.map',
    __filename,
    'src/air/rendering/instance-data.ts',
    'src/air/rendering/instance-material.ts',
    'src/air/rendering/instance-batch.ts',
    'src/air/rendering/effect-json-contract.ts',
    'examples/instance-batch/index.html',
    'examples/instance-batch/src/main.ts',
];
for (const file of inputs)
    report.fingerprints[path.relative(root, path.resolve(root, file)).replace(/\\/g, '/')] = crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.resolve(root, file)))
        .digest('hex');
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
    }
    if (url.pathname === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end(
            '<style>body{margin:0}canvas{width:480px;height:320px;display:block}</style><canvas id="GameCanvas" width="480" height="320"></canvas>',
        );
        return;
    }
    if (['/engine.js', '/build/cocosair.module.js'].includes(url.pathname))
        return serveStaticFile(req, res, bundle, 'text/javascript');
    const route = url.pathname.startsWith('/instance-batch/') ? '/examples' + url.pathname : url.pathname;
    let file = path.resolve(root, '.' + decodeURIComponent(route));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404);
        res.end();
        return;
    }
    if (file.endsWith('.ts')) {
        const { transformSync } = require('esbuild');
        res.setHeader('Content-Type', 'text/javascript');
        res.end(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'esm' }).code);
        return;
    }
    serveStaticFile(
        req,
        res,
        file,
        file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream',
    );
});

const timer = setTimeout(() => {
    report.failure = '90-second original budget exceeded';
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    process.exit(1);
}, 90000);
(async () => {
    let browser;
    try {
        const map = JSON.parse(fs.readFileSync(bundle + '.map'));
        report.sourceBindings = inputs
            .filter((v) => v.startsWith('src/'))
            .map((file) => {
                const i = map.sources.findIndex((v) => v.replace(/\\/g, '/').endsWith('/' + file));
                return {
                    file,
                    matches:
                        i >= 0 &&
                        map.sourcesContent[i].replace(/\r\n/g, '\n') ===
                            fs.readFileSync(path.resolve(root, file), 'utf8').replace(/\r\n/g, '\n'),
                };
            });
        assert.ok(
            report.sourceBindings.every((v) => v.matches),
            'candidate source map must match current implementation',
        );
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        browser = await require('playwright').chromium.launch({
            ...launchOptions('chromium'),
            headless: true,
            env: loopbackBrowserEnv(),
        });
        report.browser = browser.version();
        const page = await browser.newPage({ viewport: { width: 480, height: 320 }, deviceScaleFactor: 1 });
        page.on('pageerror', (e) => report.errors.push(String(e)));
        page.on('console', (m) => {
            if (m.type() === 'error') report.errors.push(m.text());
        });
        await page.goto('http://127.0.0.1:' + server.address().port + '/');
        report.initial = await page.evaluate(async () => {
            const a = await import('/engine.js');
            const app = await a.createAirApp({ canvas: '#GameCanvas', pixelRatioCap: 1 });
            const scene = new a.Scene('F01');
            const cameraNode = new a.Node('camera');
            scene.addChild(cameraNode);
            cameraNode.setPosition(0, 0, 10);
            const camera = cameraNode.addComponent(a.Camera);
            Object.assign(camera, {
                projection: a.Camera.ProjectionType.ORTHO,
                orthoHeight: 2.4,
                near: 0.1,
                far: 100,
                clearFlags: a.Camera.ClearFlag.SOLID_COLOR,
                clearColor: new a.Color(0, 0, 0, 255),
                visibility: a.Layers.Enum.DEFAULT,
            });
            const mesh = a.utils.createMesh(a.primitives.box({ width: 0.8, height: 0.8, length: 0.8 }));
            const batch = a.createAirInstanceBatch({ parent: scene, mesh, capacity: 3, count: 3 });
            const m = (x) => a.Mat4.fromTranslation(new a.Mat4(), new a.Vec3(x, 0, 0));
            [-2, 0, 2].forEach((x, i) => {
                batch.setMatrix(i, m(x));
                batch.setColor(i, new a.Vec4(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0, 1));
            });
            batch.commit();
            const gl = a.director.root.device.gl,
                draws = [];
            const original = gl.drawElementsInstanced.bind(gl);
            gl.drawElementsInstanced = (mode, count, type, offset, instances) => {
                draws.push({ mode, count, type, offset, instances });
                original(mode, count, type, offset, instances);
            };
            app.run(scene);
            const clock = a.createStepClock();
            clock.begin();
            const step = async () => {
                draws.length = 0;
                await clock.step(0);
            };
            await step();
            window.rig = { a, app, scene, camera, mesh, batch, clock, step, draws, m };
            return { info: batch.info, children: batch.node.children.length, draws: draws.slice() };
        });
        const capture = async (name) =>
            PNG.sync.read(await page.locator('canvas').screenshot({ path: path.join(out, name + '.png') }));
        const colors = (p) => {
            let red = 0,
                green = 0,
                blue = 0;
            for (let i = 0; i < p.data.length; i += 4) {
                const [r, g, b] = p.data.subarray(i, i + 3);
                if (r > 180 && g < 40 && b < 40) red++;
                if (g > 180 && r < 40 && b < 40) green++;
                if (b > 180 && r < 40 && g < 40) blue++;
            }
            return { red, green, blue };
        };
        report.pixels = colors(await capture('indexed-three'));
        assert.ok(report.pixels.red > 400 && report.pixels.green > 400 && report.pixels.blue > 400);
        assert.equal(report.initial.children, 0);
        assert.equal(report.initial.draws.length, 1);
        assert.equal(report.initial.draws[0].instances, 3);
        assert.equal(report.initial.draws[0].count, 36);
        report.partial = await page.evaluate(async () => {
            const { a, batch, step, m } = rig;
            batch.setMatrix(0, m(-8));
            batch.setMatrix(2, m(8));
            const uploaded = batch.commit(0, 1);
            await step();
            const bounds = batch.getWorldBounds();
            const first = batch.raycast(new a.geometry.Ray(-8, 0, 10, 0, 0, -1));
            const staged = batch.raycast(new a.geometry.Ray(8, 0, 10, 0, 0, -1));
            return {
                uploaded,
                pending: batch.info.pendingInstances,
                rightBound: bounds.center.x + bounds.halfExtents.x,
                first: first?.instanceIndex,
                staged: staged?.instanceIndex ?? null,
            };
        });
        assert.equal(report.partial.uploaded, 64);
        assert.equal(report.partial.pending, 1);
        assert.ok(Math.abs(report.partial.rightBound - 2.4) < 0.001);
        assert.equal(report.partial.first, 0);
        assert.equal(report.partial.staged, null);
        await capture('partial-publication');
        report.nonzeroRange = await page.evaluate(async () => {
            const bytes = rig.batch.commit(2, 1);
            await rig.step();
            return { bytes, pending: rig.batch.info.pendingInstances };
        });
        assert.equal(report.nonzeroRange.bytes, 64);
        assert.equal(report.nonzeroRange.pending, 0);
        const moved = colors(await capture('nonzero-range-publication'));
        assert.equal(moved.blue, 0);
        assert.ok(moved.green > 400, 'nonzero GPU update moves only its own instance');
        report.growth = await page.evaluate(async () => {
            const { a, batch, step, draws, m } = rig;
            batch.reserve(2048);
            batch.commit();
            batch.node.setPosition(1, 0, 0);
            const hit = batch.raycast(new a.geometry.Ray(9, 0, 10, 0, 0, -1));
            batch.setCount(2048);
            await step();
            return { info: batch.info, hit: hit?.instanceIndex, draws: draws.slice() };
        });
        assert.equal(report.growth.hit, 2);
        assert.equal(report.growth.draws.length, 1);
        assert.equal(report.growth.draws[0].instances, 2048);
        await capture('grown-2048');
        report.zero = await page.evaluate(async () => {
            rig.batch.setCount(0);
            await rig.step();
            return { draws: rig.draws.slice(), bounds: rig.batch.getWorldBounds() };
        });
        assert.equal(report.zero.draws.length, 0);
        assert.equal(report.zero.bounds, null);
        const blank = colors(await capture('zero-count'));
        assert.deepEqual(blank, { red: 0, green: 0, blue: 0 });
        report.ownership = await page.evaluate(async () => {
            const { a, batch, mesh, scene, step } = rig;
            const gl = a.director.root.device.gl,
                base = mesh.renderingSubMeshes[0].vertexBuffers[0].getGpuBuffer().glBuffer;
            const owned = scene.renderScene.models
                .find((m) => m.node === batch.node)
                .subModels[0].inputAssembler.vertexBuffers.at(-1)
                .getGpuBuffer().glBuffer;
            const before = mesh.refCount;
            batch.dispose();
            batch.dispose();
            await step();
            const alive = mesh.isValid && gl.isBuffer(base);
            const again = a.createAirInstanceBatch({ parent: scene, mesh, capacity: 1, count: 1 });
            again.setColor(0, new a.Vec4(0, 1, 0, 1));
            again.commit();
            await step();
            return {
                before,
                after: mesh.refCount,
                alive,
                instanceBufferDeleted: !gl.isBuffer(owned),
                old: batch.info,
                newInfo: again.info,
                ...((window.rig.again = again), {}),
            };
        });
        assert.ok(report.ownership.alive);
        assert.equal(report.ownership.old.gpuBytes, 0);
        assert.equal(report.ownership.old.cpuBytes, 0);
        assert.ok(report.ownership.instanceBufferDeleted);
        assert.equal(report.ownership.old.disposed, true);
        assert.equal(report.ownership.newInfo.attached, true);
        const reused = colors(await capture('borrowed-mesh-reused'));
        assert.ok(reused.green > 400);
        report.hdr = await page.evaluate(async () => {
            rig.again.setColor(0, new rig.a.Vec4(4, 1, 0.25, 1));
            rig.again.commit();
            const post = rig.a.createAirPostProcess(rig.camera, { levels: 2, bloom: { enabled: false } });
            await rig.step();
            const color = Array.from(post.source.readColor({ x: 240, y: 160, width: 1, height: 1 }));
            post.dispose();
            return color;
        });
        assert.ok(
            report.hdr[0] > 3.9 && Math.abs(report.hdr[2] - 0.25) < 0.01,
            'instance material integrates with linear HDR capture',
        );
        report.nodeDestruction = await page.evaluate(async () => {
            const model = rig.scene.renderScene.models.find((m) => m.node === rig.again.node),
                gl = rig.a.director.root.device.gl,
                owned = model.subModels[0].inputAssembler.vertexBuffers.at(-1).getGpuBuffer().glBuffer;
            rig.again.node.destroy();
            await rig.step();
            return {
                disposed: rig.again.info.disposed,
                gpuDeleted: !gl.isBuffer(owned),
                cpuBytes: rig.again.info.cpuBytes,
            };
        });
        assert.ok(
            report.nodeDestruction.disposed &&
                report.nodeDestruction.gpuDeleted &&
                report.nodeDestruction.cpuBytes === 0,
            'destroying the owner node releases batch resources',
        );
        await page.evaluate(async () => {
            rig.again.dispose();
            rig.clock.end();
            await rig.app.close();
            rig.mesh.destroy();
        });
        assert.deepEqual(report.errors, []);
        for (const file of inputs)
            assert.equal(
                crypto
                    .createHash('sha256')
                    .update(fs.readFileSync(path.resolve(root, file)))
                    .digest('hex'),
                report.fingerprints[path.relative(root, path.resolve(root, file)).replace(/\\/g, '/')],
            );
        await page.setViewportSize({ width: 960, height: 640 });
        await page.goto(`http://127.0.0.1:${server.address().port}/instance-batch/`);
        await page.waitForFunction(() => window.__appReady === true);
        await page.evaluate(async () => {
            const a = await import('/build/cocosair.module.js');
            window.demoClock = a.createStepClock();
            demoClock.begin();
            await demoClock.step(0);
        });
        await page.screenshot({ path: path.join(out, 'example-144.png') });
        await page.locator('#grow').click();
        await page.evaluate(async () => demoClock.step(0));
        assert.equal(await page.evaluate(() => __instanceBatch.batch.info.count), 2048);
        await page.screenshot({ path: path.join(out, 'example-2048.png') });
        await page.locator('#range').click();
        await page.evaluate(async () => demoClock.step(0));
        assert.equal(await page.evaluate(() => __instanceBatch.batch.info.lastUploadBytes), 1024);
        await page.locator('#empty').click();
        await page.evaluate(async () => demoClock.step(0));
        assert.equal(await page.evaluate(() => __instanceBatch.batch.getWorldBounds()), null);
        await page.locator('#reset').click();
        await page.evaluate(async () => demoClock.step(0));
        const pick = await page.evaluate(async () => {
            const a = await import('/build/cocosair.module.js'),
                h = __instanceBatch,
                canvas = document.querySelector('canvas'),
                rect = canvas.getBoundingClientRect(),
                camera = h.app.getScene().getChildByName('Main Camera').getComponent(a.Camera),
                m = h.batch.getMatrix(143, new a.Mat4()),
                p = camera.worldToScreen(new a.Vec3(m.m12, m.m13, m.m14));
            return {
                x: rect.left + (p.x / canvas.width) * rect.width,
                y: rect.bottom - (p.y / canvas.height) * rect.height,
            };
        });
        await page.mouse.click(pick.x, pick.y);
        await page.evaluate(async () => demoClock.step(0));
        assert.match(await page.locator('#status').textContent(), /选中实例 143/);
        await page.screenshot({ path: path.join(out, 'example-picked.png') });
        report.example = { count: 144, expandedCount: 2048, picked: 143, controls: 'PASS' };
        await page.evaluate(async () => {
            await __instanceBatch.dispose();
            demoClock.end();
        });
        assert.deepEqual(report.errors, []);
        for (const file of inputs)
            assert.equal(
                crypto
                    .createHash('sha256')
                    .update(fs.readFileSync(path.resolve(root, file)))
                    .digest('hex'),
                report.fingerprints[path.relative(root, path.resolve(root, file)).replace(/\\/g, '/')],
            );
        report.cases = [
            'indexed instancing and RGB pixels',
            'partial GPU publication matches bounds/picking',
            'reserve and 2048 instances in one native draw',
            'zero count skips drawing',
            'borrowed geometry survives while owned GPU/CPU buffers release',
            'linear HDR integration',
        ].map((name) => ({ name, status: 'PASS' }));
        report.completed = true;
    } catch (e) {
        report.failure = String(e.stack || e);
        console.error(e);
        process.exitCode = 1;
    } finally {
        try {
            if (browser) {
                await browser.close();
                report.shutdown = 'browser.close acknowledged; not Linux subreaper custody or compositor performance';
            }
        } finally {
            server.close();
            clearTimeout(timer);
            fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        }
    }
})();
