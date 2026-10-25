/* F03 local Chromium: shader morph pixels, indexed draws, upload traffic and physical GPU deletion. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const assert = require('assert/strict');
const { PNG } = require('pngjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const { serveStaticFile } = require('./static-file-response.cjs');
const args = Object.fromEntries(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const root = path.resolve(__dirname, '../..');
if (!args.out) throw Error('--out=<new-directory> required');
const out = path.resolve(root, args.out),
    bundle = path.resolve(root, args.bundle || 'build/cocosair.module.js');
fs.mkdirSync(out);
const inputs = [
    bundle,
    bundle + '.map',
    __filename,
    ...['morph-data', 'morph-material', 'morph-field', 'point-text', 'point-shapes', 'instance-batch'].map((name) =>
        path.join(root, 'src/air/rendering', name + '.ts'),
    ),
    path.join(root, 'examples/morph-field/index.html'),
    path.join(root, 'examples/morph-field/src/main.ts'),
];
const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const fingerprints = Object.fromEntries(inputs.map((f) => [path.relative(root, f).replace(/\\/g, '/'), hash(f)]));
const report = {
    completed: false,
    subset: true,
    scope: 'F03 local Chromium; no release, universal throughput or compositor timing claim',
    fingerprints,
    errors: [],
};
const server = http.createServer((req, res) => {
    if (['/engine.js', '/build/cocosair.module.js'].includes(req.url))
        return serveStaticFile(req, res, bundle, 'text/javascript');
    if (req.url === '/favicon.ico') {
        res.writeHead(204);
        return res.end();
    }
    if (req.url.startsWith('/morph-field/')) {
        const file = path.resolve(root, 'examples' + decodeURIComponent(req.url));
        const entry = fs.existsSync(file) && fs.statSync(file).isDirectory() ? path.join(file, 'index.html') : file;
        if (!entry.startsWith(path.join(root, 'examples/morph-field') + path.sep) || !fs.existsSync(entry)) {
            res.writeHead(404);
            return res.end();
        }
        if (entry.endsWith('.ts')) {
            res.setHeader('Content-Type', 'text/javascript');
            return res.end(
                require('esbuild').transformSync(fs.readFileSync(entry, 'utf8'), { loader: 'ts', format: 'esm' }).code,
            );
        }
        return serveStaticFile(req, res, entry, 'text/html');
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(
        '<style>body{margin:0;background:black}canvas{width:480px;height:320px}</style><canvas id="GameCanvas" width="480" height="320"></canvas>',
    );
});
const timer = setTimeout(() => {
    report.failure = '120-second original budget exceeded';
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    process.exit(1);
}, 120000);
(async () => {
    let browser;
    try {
        const map = JSON.parse(fs.readFileSync(bundle + '.map'));
        for (const f of inputs.filter((f) => f.startsWith(path.join(root, 'src') + path.sep))) {
            const name = path.relative(root, f).replace(/\\/g, '/'),
                i = map.sources.findIndex((s) => s.replace(/\\/g, '/').endsWith('/' + name));
            assert.ok(
                i >= 0 &&
                    map.sourcesContent[i].replace(/\r\n/g, '\n') === fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'),
                'source binding ' + name,
            );
        }
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        browser = await require('playwright').chromium.launch({
            ...launchOptions('chromium'),
            headless: true,
            env: loopbackBrowserEnv(),
        });
        report.browser = browser.version();
        const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
        page.on('pageerror', (e) => report.errors.push(String(e)));
        page.on('console', (m) => {
            if (m.type() === 'error') report.errors.push(m.text());
        });
        await page.goto('http://127.0.0.1:' + server.address().port);
        report.initial = await page.evaluate(async () => {
            const a = await import('/engine.js'),
                app = await a.createAirApp({ canvas: '#GameCanvas', pixelRatioCap: 1 });
            const scene = new a.Scene('F03'),
                cn = new a.Node('Camera');
            scene.addChild(cn);
            cn.setPosition(0, 0, 10);
            const camera = cn.addComponent(a.Camera);
            Object.assign(camera, {
                projection: a.Camera.ProjectionType.ORTHO,
                orthoHeight: 2.4,
                near: 0.1,
                far: 100,
                clearFlags: a.Camera.ClearFlag.SOLID_COLOR,
                clearColor: new a.Color(0, 0, 0, 255),
                visibility: a.Layers.Enum.DEFAULT,
            });
            const gl = a.director.root.device.gl,
                draws = [],
                uploads = [],
                textures = [],
                created = { buffers: [], textures: [] },
                deleted = { buffers: [], textures: [] };
            for (const [name, key] of [
                ['createBuffer', 'buffers'],
                ['createTexture', 'textures'],
            ]) {
                const original = gl[name].bind(gl);
                gl[name] = (...args) => {
                    const handle = original(...args);
                    if (handle) created[key].push(handle);
                    return handle;
                };
            }
            const originalDraw = gl.drawElementsInstanced.bind(gl);
            gl.drawElementsInstanced = (mode, count, type, offset, instances) => {
                draws.push({ mode, count, instances });
                originalDraw(mode, count, type, offset, instances);
            };
            for (const name of ['bufferSubData', 'bufferData']) {
                const original = gl[name].bind(gl);
                gl[name] = (...args) => {
                    const data = args[name === 'bufferData' ? 1 : 2];
                    uploads.push({
                        target: args[0],
                        bytes: typeof data === 'number' ? data : (data?.byteLength ?? 0),
                        kind: name,
                    });
                    return original(...args);
                };
            }
            for (const name of ['texImage2D', 'texSubImage2D']) {
                const original = gl[name].bind(gl);
                gl[name] = (...args) => {
                    textures.push(name);
                    return original(...args);
                };
            }
            const db = gl.deleteBuffer.bind(gl),
                dt = gl.deleteTexture.bind(gl);
            gl.deleteBuffer = (v) => {
                deleted.buffers.push(v);
                db(v);
            };
            gl.deleteTexture = (v) => {
                deleted.textures.push(v);
                dt(v);
            };
            const rgb = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
            const targets = [
                { positions: new Float32Array([-2, -0.7, 0, 0, -0.7, 0, 2, -0.7, 0]), colors: rgb },
                { positions: new Float32Array([-2, 0.7, 0, 0, 0.7, 0, 2, 0.7, 0]), colors: rgb },
            ];
            const parent = new a.Node('Parent');
            scene.addChild(parent);
            const field = a.createAirMorphField({ parent, targets, size: 0.45 });
            app.run(scene);
            const clock = a.createStepClock();
            clock.begin();
            const step = async () => {
                draws.length = uploads.length = textures.length = 0;
                await clock.step(0);
            };
            await step();
            window.rig = {
                a,
                app,
                scene,
                camera,
                gl,
                draws,
                uploads,
                textures,
                deleted,
                created,
                targets,
                parent,
                field,
                clock,
                step,
            };
            return { info: field.info, draws: draws.slice(), children: field.node.children.length };
        });
        assert.equal(report.initial.children, 0);
        assert.equal(report.initial.draws.length, 1);
        assert.equal(report.initial.draws[0].instances, 3);
        assert.equal(report.initial.draws[0].count, 6);
        const capture = async (name) =>
            PNG.sync.read(await page.locator('canvas').screenshot({ path: path.join(out, name + '.png') }));
        const sample = (png, x, y) => {
            const i = ((png.height - 1 - Math.round(y)) * png.width + Math.round(x)) * 4;
            return Array.from(png.data.subarray(i, i + 3));
        };
        const assertRow = (png, y) => {
            const row = [sample(png, 106.6667, y), sample(png, 240, y), sample(png, 373.3333, y)];
            assert.ok(row[0][0] > 180 && row[0][1] < 20);
            assert.ok(row[1][1] > 180 && row[1][2] < 20);
            assert.ok(row[2][2] > 180 && row[2][0] < 20);
            return row;
        };
        report.start = assertRow(await capture('points-start'), 113.3333);
        report.transition = [];
        for (const progress of [0.5, 1]) {
            const state = await page.evaluate(async (progress) => {
                const r = rig;
                r.draws.length = r.uploads.length = r.textures.length = 0;
                r.field.setTransition(0, 1, progress);
                await r.clock.step(0);
                return {
                    info: r.field.info,
                    draws: r.draws.slice(),
                    streamUploads: r.uploads.filter((u) => u.target === r.gl.ARRAY_BUFFER),
                    textureUploads: r.textures.slice(),
                };
            }, progress);
            assert.deepEqual(state.streamUploads, []);
            assert.deepEqual(state.textureUploads, []);
            assert.equal(state.draws[0].instances, 3);
            state.pixels = assertRow(await capture('points-' + progress), progress === 0.5 ? 160 : 206.6667);
            report.transition.push(state);
        }
        report.parent = await page.evaluate(async () => {
            rig.parent.setPosition(0.5, 0, 0);
            rig.parent.setScale(1.2, 0.7, 1.4);
            await rig.step();
            const b = rig.field.getWorldBounds();
            return {
                center: { x: b.center.x, y: b.center.y, z: b.center.z },
                half: { x: b.halfExtents.x, y: b.halfExtents.y, z: b.halfExtents.z },
                points: [-2, 0, 2].map((x) => {
                    const p = rig.camera.worldToScreen(new rig.a.Vec3(x * 1.2 + 0.5, 0.7 * 0.7, 0));
                    return { x: p.x, y: p.y };
                }),
            };
        });
        assert.ok(Math.abs(report.parent.center.x - 0.5) < 1e-4 && report.parent.half.x > 2.4);
        const parentPixels = await capture('parent-transform');
        report.parent.points.forEach((p, i) => {
            assert.ok(sample(parentPixels, p.x, p.y)[i] > 180, 'GPU centers must follow parent translation and scale');
        });
        await page.evaluate(async () => {
            rig.field.node.setScale(0, 0, 0);
            await rig.step();
        });
        const hidden = await capture('zero-scale');
        assert.ok(!hidden.data.some((v, i) => i % 4 !== 3 && v > 20));
        report.voxels = await page.evaluate(async () => {
            const r = rig;
            r.field.dispose();
            r.parent.setPosition(0, 0, 0);
            r.parent.setScale(1, 1, 1);
            r.field = r.a.createAirMorphField({ parent: r.parent, targets: r.targets, size: 0.45, mode: 'voxels' });
            r.field.setTransition(0, 1, 0.5);
            await r.step();
            return { info: r.field.info, draws: r.draws.slice() };
        });
        assert.equal(report.voxels.draws.length, 1);
        assert.equal(report.voxels.draws[0].count, 36);
        assert.equal(report.voxels.draws[0].instances, 3);
        assertRow(await capture('voxels-middle'), 160);
        report.text = await page.evaluate(async () => {
            const r = rig,
                created = [],
                original = document.createElement.bind(document);
            document.createElement = (...args) => {
                const el = original(...args);
                if (args[0] === 'canvas') created.push(el);
                return el;
            };
            try {
                const shape = await r.a.sampleAirTextShape({ text: 'AIR', count: 2048, size: 5, seed: 42 });
                const repeat = await r.a.sampleAirTextShape({ text: 'AIR', count: 2048, size: 5, seed: 42 });
                r.textShape = shape;
                return {
                    count: shape.positions.length / 3,
                    repeat: shape.positions.every((v, i) => v === repeat.positions[i]),
                    released: created.every((c) => c.width === 0 && c.height === 0),
                    minY: Math.min(...shape.positions.filter((v, i) => i % 3 === 1)),
                    maxY: Math.max(...shape.positions.filter((v, i) => i % 3 === 1)),
                };
            } finally {
                document.createElement = original;
            }
        });
        assert.equal(report.text.count, 2048);
        assert.ok(report.text.repeat && report.text.released && report.text.maxY > report.text.minY);
        report.textDraw = await page.evaluate(async () => {
            const r = rig;
            r.field.dispose();
            r.field = r.a.createAirMorphField({ parent: r.parent, targets: [r.textShape], size: 0.035 });
            await r.step();
            return r.draws.slice();
        });
        assert.equal(report.textDraw[0].instances, 2048);
        const textPixels = await capture('text');
        let ink = 0;
        for (let i = 0; i < textPixels.data.length; i += 4) if (textPixels.data[i] > 100) ink++;
        assert.ok(ink > 300, 'text must produce actual glyph pixels');
        report.text.ink = ink;
        report.atlas = await page.evaluate(async () => {
            const r = rig;
            r.field.dispose();
            const count = 4099,
                positions = new Float32Array(count * 3),
                colors = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) {
                positions[i * 3] = -2;
                colors[i * 3] = 1;
            }
            positions[(count - 1) * 3] = 2;
            colors[(count - 1) * 3] = 0;
            colors[(count - 1) * 3 + 1] = 1;
            const second = positions.slice();
            for (let i = 0; i < count; i++) second[i * 3 + 1] = 0.7;
            r.field = r.a.createAirMorphField({
                parent: r.parent,
                targets: [
                    { positions, colors },
                    { positions: second, colors },
                ],
                size: 0.2,
            });
            r.field.setTransition(1, 1, 0);
            await r.step();
            return { info: r.field.info, draws: r.draws.slice() };
        });
        const atlasPixels = await capture('atlas-row-boundary');
        assert.ok(sample(atlasPixels, 106.6667, 206.6667)[0] > 180);
        assert.ok(sample(atlasPixels, 373.3333, 206.6667)[1] > 180);
        assert.equal(report.atlas.draws[0].instances, 4099);
        report.frustum = await page.evaluate(async () => {
            const r = rig;
            r.field.dispose();
            const colors = new Float32Array([0, 1, 0]);
            r.field = r.a.createAirMorphField({
                parent: r.parent,
                targets: [
                    { positions: new Float32Array([-20, 0, 0]), colors },
                    { positions: new Float32Array([0, 0, 0]), colors },
                ],
                size: 0.4,
            });
            r.field.setTransition(0, 1, 1);
            await r.step();
            return { bounds: r.field.getWorldBounds(), draws: r.draws.slice() };
        });
        assert.ok(
            sample(await capture('frustum-target'), 240, 160)[1] > 180,
            'target remains visible when original shape lies outside camera',
        );
        report.colorMix = await page.evaluate(async () => {
            const r = rig;
            r.field.dispose();
            const b = r.created.buffers.length,
                t = r.created.textures.length;
            const positions = new Float32Array([0, 0, 0]);
            r.field = r.a.createAirMorphField({
                parent: r.parent,
                targets: [
                    { positions, colors: new Float32Array([1, 0, 0]) },
                    { positions, colors: new Float32Array([0, 0, 1]) },
                ],
                size: 0.4,
            });
            r.field.setTransition(0, 1, 0.5);
            await r.step();
            r.ownedBuffers = r.created.buffers.slice(b);
            r.ownedTextures = r.created.textures.slice(t);
            r.ownedLive =
                r.ownedBuffers.every((v) => r.gl.isBuffer(v)) && r.ownedTextures.every((v) => r.gl.isTexture(v));
            return r.field.info;
        });
        const mixed = sample(await capture('linear-color-middle'), 240, 160);
        assert.ok(
            Math.abs(mixed[0] - 188) <= 2 && mixed[1] < 10 && Math.abs(mixed[2] - 188) <= 2,
            'GPU interpolates color in linear space',
        );
        report.colorMix.pixel = mixed;
        report.polish = [];
        const polishedFrames = [];
        for (const roughness of [0.06, 0.8]) {
            const state = await page.evaluate(async (roughness) => {
                const r = rig;
                r.draws.length = r.uploads.length = r.textures.length = 0;
                r.field.setSurface('polished', roughness);
                await r.clock.step(0);
                return {
                    info: r.field.info,
                    streamUploads: r.uploads.filter((u) => u.target === r.gl.ARRAY_BUFFER),
                    textureUploads: r.textures.slice(),
                };
            }, roughness);
            assert.deepEqual(state.streamUploads, []);
            assert.deepEqual(state.textureUploads, []);
            const frame = await capture('polished-' + roughness);
            polishedFrames.push(frame);
            report.polish.push(state);
        }
        let polishDifference = 0;
        for (let i = 0; i < polishedFrames[0].data.length; i += 4)
            for (let c = 0; c < 3; c++)
                polishDifference += Math.abs(polishedFrames[0].data[i + c] - polishedFrames[1].data[i + c]);
        report.polishDifference = polishDifference;
        assert.ok(polishDifference > 500, 'roughness must change actual highlight pixels');
        await page.evaluate(async () => {
            rig.field.setIntensity(0);
            await rig.step();
        });
        const dark = await capture('polished-zero-intensity');
        assert.ok(!dark.data.some((v, i) => i % 4 !== 3 && v > 10));
        await page.evaluate(async () => {
            rig.field.setIntensity(1);
            rig.field.setSurface('unlit');
            await rig.step();
        });
        const restored = sample(await capture('restored-unlit'), 240, 160);
        assert.ok(
            Math.abs(restored[0] - 188) <= 2 && Math.abs(restored[2] - 188) <= 2,
            'surface switch preserves unlit color contract',
        );
        report.release = await page.evaluate(async () => {
            const r = rig,
                b = r.deleted.buffers.length,
                t = r.deleted.textures.length;
            r.field.dispose();
            r.field.dispose();
            await r.step();
            const buffers = r.deleted.buffers.slice(b),
                textures = r.deleted.textures.slice(t);
            const first = {
                buffers: buffers.length,
                textures: textures.length,
                released: buffers.every((v) => !r.gl.isBuffer(v)) && textures.every((v) => !r.gl.isTexture(v)),
                info: r.field.info,
                models: r.scene.renderScene.models.length,
                ownedLive: r.ownedLive,
                ownedBuffers: r.ownedBuffers.length,
                ownedTextures: r.ownedTextures.length,
                allOwnedReleased:
                    r.ownedBuffers.every((v) => !r.gl.isBuffer(v)) && r.ownedTextures.every((v) => !r.gl.isTexture(v)),
            };
            r.field = r.a.createAirMorphField({ parent: r.parent, targets: r.targets, size: 0.3 });
            await r.step();
            const b2 = r.deleted.buffers.length,
                t2 = r.deleted.textures.length;
            r.field.node.destroy();
            await r.step();
            await r.step();
            return {
                first,
                external: {
                    buffers: r.deleted.buffers.length - b2,
                    textures: r.deleted.textures.length - t2,
                    disposed: r.field.info.disposed,
                    models: r.scene.renderScene.models.length,
                },
            };
        });
        assert.equal(report.release.first.textures, 2);
        assert.ok(
            report.release.first.ownedLive &&
                report.release.first.ownedBuffers >= 3 &&
                report.release.first.ownedTextures === 2 &&
                report.release.first.allOwnedReleased,
            'all actual owned buffers/textures must retire, not only the handles already reported deleted',
        );
        assert.ok(report.release.first.buffers >= 3 && report.release.first.released);
        assert.equal(report.release.first.info.cpuBytes, 0);
        assert.equal(report.release.first.info.gpuBytes, 0);
        assert.equal(report.release.first.models, 0);
        assert.ok(
            report.release.external.disposed &&
                report.release.external.textures === 2 &&
                report.release.external.buffers >= 3,
        );
        assert.equal(report.release.external.models, 0);
        report.failureCleanup = await page.evaluate(async () => {
            const r = rig,
                device = r.a.director.root.device,
                original = device.createTexture,
                before = r.deleted.textures.length;
            let attempts = 0,
                message = '';
            device.createTexture = function (...args) {
                if (++attempts === 2) throw Error('injected texture allocation failure');
                return original.apply(this, args);
            };
            try {
                r.a.createAirMorphField({ parent: r.parent, targets: r.targets });
            } catch (error) {
                message = String(error);
            } finally {
                device.createTexture = original;
            }
            const retired = r.deleted.textures.slice(before);
            await r.step();
            let budget = '';
            try {
                r.a.createAirMorphField({ parent: r.parent, targets: r.targets, maxGpuBytes: 1 });
            } catch (error) {
                budget = String(error);
            }
            return {
                attempts,
                message,
                deleted: retired.length,
                released: retired.every((v) => !r.gl.isTexture(v)),
                models: r.scene.renderScene.models.length,
                budget,
            };
        });
        assert.equal(report.failureCleanup.attempts, 2);
        assert.match(report.failureCleanup.message, /injected texture allocation failure/);
        assert.equal(report.failureCleanup.deleted, 1);
        assert.ok(report.failureCleanup.released);
        assert.equal(report.failureCleanup.models, 0);
        assert.match(report.failureCleanup.budget, /maxGpuBytes/);
        assert.deepEqual(report.errors, []);
        await page.evaluate(() => rig.clock.end());
        await page.setViewportSize({ width: 960, height: 640 });
        await page.goto('http://127.0.0.1:' + server.address().port + '/morph-field/');
        await page.waitForFunction(() => window.__appReady === true);
        report.example = await page.evaluate(async () => {
            const a = await import('/build/cocosair.module.js');
            window.demoClock = a.createStepClock();
            demoClock.begin();
            const gl = a.director.root.device.gl,
                draws = [],
                original = gl.drawElementsInstanced.bind(gl);
            gl.drawElementsInstanced = (mode, count, type, offset, instances) => {
                draws.push({ mode, count, instances });
                original(mode, count, type, offset, instances);
            };
            window.demoDraws = draws;
            await demoClock.step(0);
            return { info: __morphField.field.info, draws: draws.slice() };
        });
        assert.equal(report.example.draws.length, 1);
        assert.equal(report.example.draws[0].instances, 16384);
        assert.equal(report.example.draws[0].count, 6);
        await page.screenshot({ path: path.join(out, 'example-text.png') });
        await page.locator('#surface').selectOption('unlit');
        await page.evaluate(async () => {
            await demoClock.step(0);
        });
        await page.screenshot({ path: path.join(out, 'example-unlit.png') });
        assert.equal(await page.evaluate(() => __morphField.field.info.surface), 'unlit');
        await page.locator('#surface').selectOption('polished');
        await page.locator('#roughness').evaluate((el) => {
            el.value = '.8';
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.evaluate(async () => {
            await demoClock.step(0);
        });
        await page.screenshot({ path: path.join(out, 'example-rough.png') });
        assert.equal(await page.evaluate(() => __morphField.field.info.roughness), 0.8);
        await page.locator('#roughness').evaluate((el) => {
            el.value = '.18';
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.evaluate(async () => {
            await demoClock.step(0);
        });
        report.example.targets = [];
        for (const target of ['1', '2', '3']) {
            await page.locator('#to').selectOption(target);
            await page.locator('#progress').evaluate((el) => {
                el.value = '1';
                el.dispatchEvent(new Event('input', { bubbles: true }));
            });
            await page.evaluate(async () => {
                demoDraws.length = 0;
                await demoClock.step(0);
            });
            await page.locator('header').evaluate((el) => {
                el.style.visibility = 'hidden';
            });
            await page.locator('aside').evaluate((el) => {
                el.style.visibility = 'hidden';
            });
            const image = await capture('example-target-' + target);
            let pixels = 0;
            for (let i = 0; i < image.data.length; i += 4)
                if (image.data[i] + image.data[i + 1] + image.data[i + 2] > 180) pixels++;
            await page.locator('header').evaluate((el) => {
                el.style.visibility = '';
            });
            await page.locator('aside').evaluate((el) => {
                el.style.visibility = '';
            });
            assert.ok(pixels > 400, 'target ' + target + ' must be visible');
            report.example.targets.push({ target, pixels });
        }
        await page.locator('#mode').selectOption('voxels');
        report.example.voxels = await page.evaluate(async () => {
            demoDraws.length = 0;
            await demoClock.step(0);
            return { info: __morphField.field.info, draws: demoDraws.slice() };
        });
        assert.equal(report.example.voxels.draws.length, 1);
        assert.equal(report.example.voxels.draws[0].count, 36);
        assert.equal(report.example.voxels.draws[0].instances, 16384);
        await page.screenshot({ path: path.join(out, 'example-voxels.png') });
        await page.locator('#auto').check();
        await page.evaluate(async () => {
            for (let i = 0; i < 30; i++) await demoClock.step(1 / 60);
        });
        const before = await page.evaluate(() => __morphField.field.info.progress);
        assert.ok(before > 0 && before < 1);
        await page.locator('#pause').click();
        await page.evaluate(async () => {
            for (let i = 0; i < 10; i++) await demoClock.step(1 / 60);
        });
        assert.equal(await page.evaluate(() => __morphField.field.info.progress), before);
        await page.locator('#pause').click();
        await page.evaluate(async () => {
            for (let i = 0; i < 10; i++) await demoClock.step(1 / 60);
        });
        assert.ok(await page.evaluate((before) => __morphField.field.info.progress > before, before));
        await page.mouse.move(220, 155);
        await page.mouse.down();
        await page.mouse.move(280, 170);
        await page.mouse.up();
        await page.evaluate(async () => {
            await demoClock.step(0);
        });
        report.example.rotation = await page.evaluate(() => __morphField.field.node.eulerAngles.y);
        assert.ok(Math.abs(report.example.rotation) > 5);
        await page.setViewportSize({ width: 360, height: 640 });
        await page.evaluate(async () => {
            window.dispatchEvent(new Event('resize'));
            await demoClock.step(0);
            await demoClock.step(0);
        });
        report.example.portrait = await page.evaluate(() => ({
            width: document.querySelector('canvas').width,
            height: document.querySelector('canvas').height,
            post: __morphField.post.info,
        }));
        await page.screenshot({ path: path.join(out, 'example-portrait.png') });
        await page.locator('header').evaluate((el) => {
            el.style.visibility = 'hidden';
        });
        await page.locator('aside').evaluate((el) => {
            el.style.visibility = 'hidden';
        });
        const portrait = await capture('portrait-canvas');
        let portraitInk = 0;
        for (let i = 0; i < portrait.data.length; i += 4)
            if (portrait.data[i] + portrait.data[i + 1] + portrait.data[i + 2] > 180) portraitInk++;
        report.example.portrait.pixels = portraitInk;
        assert.ok(portraitInk > 400, 'portrait must retain visible geometry after resize');
        await page.locator('header').evaluate((el) => {
            el.style.visibility = '';
        });
        await page.locator('aside').evaluate((el) => {
            el.style.visibility = '';
        });
        await page.evaluate(async () => {
            await __morphField.dispose();
            await __morphField.dispose();
            demoClock.end();
        });
        report.example.disposed = await page.evaluate(
            () => __morphField.field.info.disposed && __morphField.field.info.gpuBytes === 0,
        );
        assert.ok(report.example.disposed);
        assert.deepEqual(report.errors, []);
        for (const f of inputs) assert.equal(hash(f), fingerprints[path.relative(root, f).replace(/\\/g, '/')]);
        report.completed = true;
    } catch (error) {
        report.failure = String(error.stack || error);
        console.error(error);
        process.exitCode = 1;
    } finally {
        try {
            if (browser) {
                await browser.close();
                report.shutdown = 'browser.close acknowledged; no Linux subreaper custody or compositor claim';
            }
        } finally {
            server.close();
            clearTimeout(timer);
            fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        }
    }
})();
