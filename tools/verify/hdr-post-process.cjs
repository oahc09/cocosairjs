/* Focused HDR pixel/lifecycle regression. Writes a new local attempt, never canonical evidence. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert/strict');
const crypto = require('crypto');
const { PNG } = require('pngjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const { serveStaticFile } = require('./static-file-response.cjs');
const { verifySourceBinding } = require('../build/source-binding.cjs');
const args = Object.fromEntries(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
if (!args.out) throw Error('--out=<new-directory> required');
if (args['freeze-frame-uniform'] === '1' && args['raster-diagnostic'] !== '1')
    throw Error('--freeze-frame-uniform=1 is diagnostic-only and requires --raster-diagnostic=1');
const root = path.resolve(__dirname, '../..');
const out = path.resolve(root, args.out);
const bundle = path.resolve(root, args.bundle || 'build/cocosair.module.js');
fs.mkdirSync(out);
const report = {
    completed: false,
    subset: true,
    scope: 'local Chromium HDR pixels and lifecycle; not release acceptance',
    cases: [],
    errors: [],
    fingerprints: {},
};
const inputs = [
    bundle,
    bundle + '.map',
    __filename,
    ...fs
        .readdirSync(path.join(root, 'src/air/rendering'))
        .filter((v) => /post-process|hdr-context|effect-json-contract/.test(v))
        .map((v) => path.join(root, 'src/air/rendering', v)),
    'src/cocos/rendering/render-pipeline.ts',
    'src/cocos/render-scene/scene/submodel.ts',
    'src/cocos/render-scene/core/pass.ts',
    'src/air/rendering/render-target.ts',
    'src/air/rendering/screen-effect.ts',
    'examples/shared/shader-blocks.js',
    'tools/verify/browser-engines.cjs',
    'tools/verify/loopback-browser-env.cjs',
    'tools/verify/static-file-response.cjs',
    'examples/neon-city/src/main.ts',
    'examples/neon-city/index.html',
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
            '<style>body{margin:0}canvas{width:320px;height:240px;display:block}</style><canvas id="GameCanvas" width="320" height="240"></canvas>',
        );
        return;
    }
    if (['/engine.js', '/build/cocosair.module.js'].includes(url.pathname))
        return serveStaticFile(req, res, bundle, 'text/javascript');
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
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
    console.error('HDR probe timeout');
    report.completed = false;
    report.failure = 'HDR probe exceeded its original 120-second budget';
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    process.exit(1);
}, 120000);
(async () => {
    let browser;
    try {
        const map = JSON.parse(fs.readFileSync(bundle + '.map', 'utf8'));
        const requiredSources = inputs.filter((v) => v.startsWith('src/') || v.includes(path.join('src', 'air')));
        if (Array.isArray(map.sourcesContent)) {
            report.sourceBindings = requiredSources.map((file) => {
                const relative = path.relative(root, path.resolve(root, file)).replace(/\\/g, '/');
                const i = map.sources.findIndex((v) => v.replace(/\\/g, '/').endsWith('/' + relative));
                return {
                    file: relative,
                    matches:
                        i >= 0 &&
                        map.sourcesContent[i].replace(/\r\n/g, '\n') ===
                            fs.readFileSync(path.resolve(root, file), 'utf8').replace(/\r\n/g, '\n'),
                };
            });
        } else {
            report.sourceBinding = verifySourceBinding(root, bundle);
            assert.equal(
                report.sourceBinding.matches,
                true,
                'external map source receipt must bind current source and SDK bytes',
            );
            const receipt = JSON.parse(fs.readFileSync(bundle + '.sources.json', 'utf8'));
            const included = new Set(receipt.sources.map((entry) => entry.path));
            report.sourceBindings = requiredSources.map((file) => {
                const relative = path.relative(root, path.resolve(root, file)).replace(/\\/g, '/');
                return { file: relative, matches: included.has(relative) };
            });
        }
        assert.ok(
            report.sourceBindings.every((v) => v.matches),
            'candidate source map must bind current source',
        );
        await new Promise((r) => server.listen(0, '127.0.0.1', r));
        browser = await require('playwright').chromium.launch({
            ...launchOptions('chromium'),
            headless: true,
            env: loopbackBrowserEnv(),
        });
        report.browser = browser.version();
        const page = await browser.newPage({ viewport: { width: 320, height: 240 }, deviceScaleFactor: 1 });
        page.on('pageerror', (e) => report.errors.push(String(e)));
        page.on('console', (m) => {
            if (m.type() === 'error') report.errors.push(m.text());
        });
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        report.init = await page.evaluate(async () => {
            const a = await import('/engine.js');
            const app = await a.createAirApp({ canvas: '#GameCanvas', pixelRatioCap: 1 });
            const scene = new a.Scene('HDR calibration'),
                node = new a.Node('camera');
            scene.addChild(node);
            node.setPosition(0, 0, 3);
            const camera = node.addComponent(a.Camera);
            Object.assign(camera, {
                projection: a.Camera.ProjectionType.ORTHO,
                orthoHeight: 1,
                near: 0.1,
                far: 100,
                clearFlags: a.Camera.ClearFlag.SOLID_COLOR,
                clearColor: new a.Color(0, 0, 0, 255),
                visibility: a.Layers.Enum.DEFAULT,
            });
            const effect = a.createAirScreenEffect({
                name: 'hdr-calibration',
                constants: ['radiance'],
                body: 'void main(){vec3 c=abs(v_uv.x-0.5)<0.10 && abs(v_uv.y-0.5)<0.10 ? radiance.rgb : vec3(0.0);cc_FragColor=vec4(c,1.0);}',
            });
            const material = new a.Material();
            material.initialize({ effectAsset: effect });
            material.setProperty('radiance', new a.Vec4(4, 1, 0.25, 1));
            const mesh = a.utils.createMesh({
                positions: [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0],
                uvs: [0, 0, 1, 0, 0, 1, 1, 1],
                normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
                indices: [0, 1, 2, 1, 3, 2],
            });
            const quad = new a.Node('radiance');
            scene.addChild(quad);
            const renderer = quad.addComponent(a.MeshRenderer);
            renderer.mesh = mesh;
            renderer.setSharedMaterial(material, 0);
            const post = a.createAirPostProcess(camera, { levels: 5, bloom: { enabled: false } });
            app.run(scene);
            const clock = a.createStepClock();
            clock.begin();
            const step = async () => {
                for (let i = 0; i < 2; i++) await clock.step();
            };
            await step();
            window.rig = { a, app, scene, camera, post, clock, step, renderer, material, mesh, effect };
            return {
                info: post.info,
                source: Array.from(post.source.readColor({ x: 160, y: 120, width: 1, height: 1 })),
                context: {
                    renderer: a.director.root.device.renderer,
                    vendor: a.director.root.device.vendor,
                    version: document
                        .querySelector('canvas')
                        .getContext('webgl2')
                        .getParameter(document.querySelector('canvas').getContext('webgl2').VERSION),
                },
            };
        });
        assert.ok(report.init.source[0] > 3.9, 'RGBA16F retains radiance above one');
        const capture = async (name) => {
            const boundary = await page.evaluate(async () => {
                const a = await import('/build/cocosair.module.js');
                const before = a.director.getTotalFrames();
                document.querySelector('canvas').getContext('webgl2').finish();
                await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                return { before, after: a.director.getTotalFrames(), paused: a.game.isPaused() };
            });
            assert.ok(
                boundary.paused && boundary.before === boundary.after,
                'presentation wait must not advance simulation',
            );
            (report.captureBoundaries ||= []).push({
                name,
                ...boundary,
                gpuCompletion: 'WebGL2 finish; not a timing sample',
            });
            const bytes = await page.locator('canvas').screenshot({ path: path.join(out, name + '.png') });
            return PNG.sync.read(bytes);
        };
        const sample = (p, x = 160, y = 120) =>
            Array.from(p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 3));
        const encode = (x) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
        const aces = (x) => Math.min(1, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));
        let image = await capture('aces');
        const actual = sample(image),
            expected = [4, 1, 0.25].map((x) => encode(aces(x)));
        actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 4, `ACES channel ${i}: ${v} vs ${expected[i]}`));
        report.cases.push({ name: 'HDR-and-ACES-single-output-encoding', actual, expected });
        await page.evaluate(async () => {
            rig.post.setOptions({ toneMapping: 'reinhard' });
            await rig.step();
        });
        image = await capture('reinhard');
        const reinhard = sample(image);
        reinhard.forEach((v, i) => assert.ok(Math.abs(v - encode([4, 1, 0.25][i] / (1 + [4, 1, 0.25][i]))) < 4));
        await page.evaluate(async () => {
            rig.post.setOptions({ exposure: 0.5 });
            await rig.step();
        });
        const half = sample(await capture('exposure-half'));
        assert.ok(half[1] < reinhard[1] - 20);
        report.cases.push({ name: 'Reinhard-and-exposure', reinhard, half });
        await page.evaluate(async () => {
            rig.post.setOptions({ toneMapping: 'none', exposure: 1 });
            await rig.step();
        });
        const none = sample(await capture('tone-none'));
        [1, 1, 0.25]
            .map(encode)
            .forEach((v, i) => assert.ok(Math.abs(none[i] - v) < 4, 'none still encodes display output once'));
        await page.evaluate(async () => {
            rig.post.setOptions({ toneMapping: 'aces', exposure: 1, bloom: { enabled: true, intensity: 1 } });
            await rig.step();
        });
        const bloom = await capture('bloom');
        const halo = sample(bloom, 120, 120);
        assert.ok(halo[0] > 10, 'bloom spreads beyond bright geometry');
        report.cases.push({ name: 'multilevel-bloom-halo', halo });
        report.nativeMaterial = await page.evaluate(async () => {
            const { a, renderer, post } = rig;
            const material = new a.Material();
            material.initialize({ effectName: 'builtin-unlit' });
            material.setProperty('mainColor', new a.Vec4(2, 1, 0.5, 1));
            renderer.setSharedMaterial(material, 0);
            post.setOptions({ bloom: { enabled: false } });
            await rig.step();
            const color = Array.from(post.source.readColor({ x: 160, y: 120, width: 1, height: 1 }));
            renderer.setSharedMaterial(rig.material, 0);
            material.destroy();
            await rig.step();
            return color;
        });
        assert.ok(report.nativeMaterial[0] > 1.9, 'native unlit output remains HDR before final mapping');
        report.nativeStandard = await page.evaluate(async () => {
            const { a, renderer, post } = rig;
            const material = new a.Material();
            material.initialize({ effectName: 'builtin-standard' });
            material.setProperty('mainColor', new a.Color(0, 0, 0, 255));
            material.setProperty('emissive', new a.Vec4(2, 1, 0.5, 1));
            renderer.setSharedMaterial(material, 0);
            await rig.step();
            const color = Array.from(post.source.readColor({ x: 160, y: 120, width: 1, height: 1 }));
            renderer.setSharedMaterial(rig.material, 0);
            material.destroy();
            await rig.step();
            return color;
        });
        assert.ok(report.nativeStandard[0] > 1, 'native standard emissive retains HDR');
        report.lifecycle = await page.evaluate(async () => {
            const { a, camera, post } = rig;
            const old = post.source.renderTexture.getGFXTexture();
            const nativeTexture = old.gpuTexture.glTexture;
            post.setEnabled(false);
            const detached = camera.targetTexture === null;
            post.setEnabled(true);
            await rig.step();
            post.dispose();
            post.dispose();
            const released =
                post.info.ownedTargets === 0 && post.info.ownedMaterials === 0 && camera.targetTexture === null;
            const again = a.createAirPostProcess(camera, { levels: 2, samples: 4, bloom: { enabled: false } });
            rig.post = again;
            await rig.step();
            again.setEnabled(false);
            again.setEnabled(true);
            rig.material.setProperty('radiance', new a.Vec4(6, 8, 0.5, 1));
            await rig.clock.step();
            return {
                detached,
                released,
                oldTextureDestroyed: !a.director.root.device.gl.isTexture(nativeTexture),
                again: again.info,
                resolvedAfterReenable: Array.from(again.source.readColor({ x: 160, y: 120, width: 1, height: 1 })),
            };
        });
        assert.ok(report.lifecycle.detached && report.lifecycle.released);
        assert.ok(report.lifecycle.oldTextureDestroyed, 'owned GFX texture is actually deleted');
        assert.ok(report.lifecycle.resolvedAfterReenable[0] > 5.9, 'MSAA re-enable resolves the current frame');
        const resolvedPixel = sample(await capture('msaa-reenabled'));
        assert.ok(
            Math.abs(resolvedPixel[1] - encode(aces(8))) < 4,
            'output samples resolved current-frame MSAA capture',
        );
        await page.evaluate(async () => {
            const { a, scene, camera, renderer } = rig;
            const material = new a.Material();
            material.initialize({ effectName: 'builtin-unlit' });
            material.setProperty('mainColor', new a.Vec4(0.5, 0.5, 0.5, 1));
            renderer.setSharedMaterial(material, 0);
            camera.rect = new a.Rect(0.5, 0, 0.5, 1);
            camera.priority = 1;
            const node = new a.Node('ordinary-camera');
            scene.addChild(node);
            node.setPosition(0, 0, 3);
            const ordinary = node.addComponent(a.Camera);
            Object.assign(ordinary, {
                projection: a.Camera.ProjectionType.ORTHO,
                orthoHeight: 1,
                near: 0.1,
                far: 100,
                clearFlags: a.Camera.ClearFlag.SOLID_COLOR,
                clearColor: new a.Color(0, 0, 0, 255),
                visibility: a.Layers.Enum.DEFAULT,
                rect: new a.Rect(0, 0, 0.5, 1),
                priority: 0,
            });
            rig.ordinary = node;
            rig.nativeMaterial = material;
            camera.enabled = false;
            await rig.step();
        });
        const baselineLeft = sample(await capture('ordinary-camera-baseline'), 80, 120);
        await page.evaluate(async () => {
            rig.camera.enabled = true;
            await rig.step();
        });
        const split = await capture('camera-isolation-and-viewport');
        const left = sample(split, 80, 120),
            right = sample(split, 240, 120);
        assert.deepEqual(left, baselineLeft, 'ordinary camera retains its measured native output');
        assert.ok(Math.abs(right[0] - encode(aces(0.25))) < 4, 'HDR camera maps its viewport exactly once');
        report.cases.push({ name: 'same-frame-camera-isolation-and-viewport', baselineLeft, left, right });
        await page.evaluate(async () => {
            rig.ordinary.destroy();
            rig.renderer.setSharedMaterial(rig.material, 0);
            rig.nativeMaterial.destroy();
            rig.camera.rect = new rig.a.Rect(0, 0, 1, 1);
            await rig.step();
        });
        await page.setViewportSize({ width: 400, height: 300 });
        report.resize = await page.evaluate(async () => {
            document.querySelector('canvas').style.cssText = 'width:400px;height:300px';
            window.dispatchEvent(new Event('resize'));
            await rig.step();
            return rig.post.info;
        });
        assert.equal(report.resize.width, 400);
        assert.equal(report.resize.height, 300);
        report.nodeDestruction = await page.evaluate(async () => {
            rig.camera.node.destroy();
            await rig.step();
            return rig.post.info.disposed;
        });
        assert.equal(report.nodeDestruction, true, 'node destruction releases owned post-process resources');
        await page.evaluate(async () => {
            rig.post.dispose();
            rig.clock.end();
            await rig.app.close();
        });
        await page.setViewportSize({ width: 960, height: 640 });
        await page.goto(`http://127.0.0.1:${server.address().port}/examples/neon-city/index.html`);
        await page.waitForFunction(() => window.__appReady === true);
        report.freezeControls = await page.evaluate(
            async ({ disableDither, rasterDiagnostic, freezeFrameUniform }) => {
                const a = await import('/build/cocosair.module.js');
                window.neonClock = a.createStepClock();
                neonClock.begin();
                a.director.pause();
                const gl = document.querySelector('canvas').getContext('webgl2');
                const ditherBefore = gl.isEnabled(gl.DITHER);
                if (disableDither) gl.disable(gl.DITHER);
                // Wall-clock FPS text is unrelated to the fixed simulation/render state.
                document.querySelector('#hud').style.visibility = 'hidden';
                if (rasterDiagnostic) {
                    const globalBuffer = a.director.root.pipeline.descriptorSet
                        .getBuffer(0)
                        ?.getGpuBuffer?.()?.glBuffer;
                    if (freezeFrameUniform && !globalBuffer)
                        throw Error('Cannot identify native global UBO for diagnostic control');
                    const ids = new WeakMap();
                    let serial = 0,
                        frameUniform,
                        trace;
                    const id = (value) => {
                        if (!value) return 0;
                        if (!ids.has(value)) ids.set(value, ++serial);
                        return ids.get(value);
                    };
                    a.director.on(a.Director.EVENT_BEFORE_DRAW, () => {
                        trace = { draws: [], uploads: [] };
                    });
                    for (const method of [
                        'drawArrays',
                        'drawElements',
                        'drawArraysInstanced',
                        'drawElementsInstanced',
                    ]) {
                        const original = gl[method].bind(gl);
                        gl[method] = (...args) => {
                            trace?.draws.push({
                                method,
                                args,
                                program: id(gl.getParameter(gl.CURRENT_PROGRAM)),
                                vao: id(gl.getParameter(gl.VERTEX_ARRAY_BINDING)),
                                framebuffer: id(gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING)),
                            });
                            return original(...args);
                        };
                    }
                    for (const method of ['bufferSubData', 'bufferData']) {
                        const original = gl[method].bind(gl);
                        gl[method] = (...args) => {
                            if (
                                freezeFrameUniform &&
                                method === 'bufferSubData' &&
                                args[0] === gl.UNIFORM_BUFFER &&
                                gl.getParameter(gl.UNIFORM_BUFFER_BINDING) === globalBuffer &&
                                args[1] === 0 &&
                                args[2].byteLength === 80
                            ) {
                                const originalBytes = new Uint8Array(
                                    args[2].buffer || args[2],
                                    args[2].byteOffset || 0,
                                    80,
                                );
                                const bytes = new Uint8Array(originalBytes),
                                    data = new DataView(bytes.buffer);
                                frameUniform ??= data.getFloat32(8, true);
                                data.setFloat32(8, frameUniform, true);
                                window.__neonFrameUniformWrites = (window.__neonFrameUniformWrites || 0) + 1;
                                args = [args[0], args[1], bytes];
                            }
                            const target = args[0],
                                data = args[method === 'bufferData' ? 1 : 2],
                                binding =
                                    target === gl.UNIFORM_BUFFER
                                        ? gl.UNIFORM_BUFFER_BINDING
                                        : target === gl.ARRAY_BUFFER
                                          ? gl.ARRAY_BUFFER_BINDING
                                          : gl.ELEMENT_ARRAY_BUFFER_BINDING;
                            let digest = 2166136261,
                                length = 0;
                            if (data != null && typeof data !== 'number') {
                                const offsetIndex = 3,
                                    unit = data.BYTES_PER_ELEMENT || 1,
                                    offset = (args[offsetIndex] || 0) * unit;
                                const available = data.byteLength - offset,
                                    lengthArg = args[offsetIndex + 1];
                                length = lengthArg === undefined ? available : lengthArg * unit;
                                const bytes = new Uint8Array(
                                    data.buffer || data,
                                    (data.byteOffset || 0) + offset,
                                    length,
                                );
                                for (const byte of bytes) digest = Math.imul(digest ^ byte, 16777619);
                            } else length = data || 0;
                            trace?.uploads.push({
                                method,
                                target,
                                buffer: id(gl.getParameter(binding)),
                                offset: method === 'bufferSubData' ? args[1] : 0,
                                length,
                                digest: digest >>> 0,
                            });
                            return original(...args);
                        };
                    }
                    a.director.on(a.Director.EVENT_AFTER_DRAW, () => {
                        const source = window.__airPostProcess.source.readColor();
                        const sameSource = window.__airPostProcess.source.readColor();
                        let sameRead = true;
                        for (let i = 0; i < source.length; ++i)
                            if (source[i] !== sameSource[i]) {
                                sameRead = false;
                                break;
                            }
                        const screen = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
                        const previous = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
                        try {
                            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
                            gl.readPixels(
                                0,
                                0,
                                gl.drawingBufferWidth,
                                gl.drawingBufferHeight,
                                gl.RGBA,
                                gl.UNSIGNED_BYTE,
                                screen,
                            );
                        } finally {
                            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previous);
                        }
                        const camera = a.director
                            .getScene()
                            .getComponentsInChildren(a.Camera)
                            .find((c) => c.node.name === 'Main Camera')?.camera;
                        window.__neonRaster = {
                            source,
                            screen,
                            width: gl.drawingBufferWidth,
                            height: gl.drawingBufferHeight,
                            frame: a.director.getTotalFrames(),
                            time: a.director.root.cumulativeTime,
                            camera: camera
                                ? Array.from(a.Mat4.toArray(new Float32Array(16), camera.matViewProj))
                                : null,
                            trace,
                            sameRead,
                        };
                    });
                }
                await neonClock.step(0);
                if (freezeFrameUniform && !window.__neonFrameUniformWrites)
                    throw Error('Diagnostic global frame uniform was not intercepted');
                return {
                    disableDither,
                    rasterDiagnostic,
                    freezeFrameUniform,
                    ditherBefore,
                    time: a.director.root.cumulativeTime,
                };
            },
            {
                disableDither: args['no-dither'] === '1',
                rasterDiagnostic: args['raster-diagnostic'] === '1',
                freezeFrameUniform: args['freeze-frame-uniform'] === '1',
            },
        );
        const neonOn = await capture('neon-bloom');
        await page.evaluate(async () => {
            document.querySelector('#bloom').click();
            await neonClock.step(0);
        });
        const neonOff = await capture('neon-no-bloom');
        if (args['raster-diagnostic'] === '1')
            await page.evaluate(() => {
                window.__neonRasterBefore = window.__neonRaster;
            });
        const sameFrame = await capture('neon-same-frame');
        report.sameFrameExact = neonOff.data.equals(sameFrame.data);
        assert.ok(report.sameFrameExact, 'unchanged presented frame must reproduce identical pixels');
        report.frozenTime = await page.evaluate(async () => {
            await neonClock.step(0);
            return (await import('/build/cocosair.module.js')).director.root.cumulativeTime;
        });
        const frozenAgain = await capture('neon-frozen-repeat');
        let count = 0,
            maxDelta = 0;
        for (let i = 0; i < neonOff.data.length; i += 4) {
            const delta = Math.max(...[0, 1, 2, 3].map((c) => Math.abs(neonOff.data[i + c] - frozenAgain.data[i + c])));
            if (delta) ++count;
            maxDelta = Math.max(maxDelta, delta);
        }
        const pixelBudget = Math.ceil(neonOff.width * neonOff.height * 0.0002);
        report.frozenDifference = { pixels: count, maxDelta, pixelBudget };
        if (args['raster-diagnostic'] === '1') {
            const diagnostic = await page.evaluate(() => {
                const before = window.__neonRasterBefore,
                    after = window.__neonRaster;
                const diff = (a, b) => {
                    if (a.length !== b.length) throw Error('Raster dimensions changed');
                    let channels = 0,
                        pixels = 0,
                        maxDelta = 0;
                    const examples = [];
                    for (let i = 0; i < a.length; i += 4) {
                        let changed = false;
                        for (let c = 0; c < 4; ++c)
                            if (a[i + c] !== b[i + c]) {
                                changed = true;
                                ++channels;
                                maxDelta = Math.max(maxDelta, Math.abs(a[i + c] - b[i + c]));
                            }
                        if (changed) {
                            ++pixels;
                            if (examples.length < 16)
                                examples.push({
                                    index: i / 4,
                                    before: [...a.slice(i, i + 4)],
                                    after: [...b.slice(i, i + 4)],
                                });
                        }
                    }
                    return { channels, pixels, maxDelta, examples };
                };
                const encode = (array) => {
                    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength),
                        chunks = [];
                    for (let i = 0; i < bytes.length; i += 16384)
                        chunks.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
                    return btoa(chunks.join(''));
                };
                return {
                    source: diff(before.source, after.source),
                    screen: diff(before.screen, after.screen),
                    before: {
                        frame: before.frame,
                        time: before.time,
                        width: before.width,
                        height: before.height,
                        camera: before.camera,
                        trace: before.trace,
                        sameRead: before.sameRead,
                    },
                    after: {
                        frame: after.frame,
                        time: after.time,
                        width: after.width,
                        height: after.height,
                        camera: after.camera,
                        trace: after.trace,
                        sameRead: after.sameRead,
                    },
                    dumps: {
                        'neon-before-source.f32': encode(before.source),
                        'neon-after-source.f32': encode(after.source),
                        'neon-before-screen.rgba': encode(before.screen),
                        'neon-after-screen.rgba': encode(after.screen),
                    },
                };
            });
            for (const [file, data] of Object.entries(diagnostic.dumps))
                fs.writeFileSync(path.join(out, file), Buffer.from(data, 'base64'));
            delete diagnostic.dumps;
            report.rasterDiagnostic = diagnostic;
        }
        // Overlapping additive instances can accumulate in different floating-point order on a GPU,
        // even with frozen uniforms and no MSAA. Same-frame presentation remains exact above;
        // repeated scene draws must also preserve structure and stay within display quantization.
        assert.ok(
            maxDelta <= 1 && count <= pixelBudget,
            'fixed camera/time redraw must stay within one display level and a 0.02% pixel budget',
        );
        let changed = 0;
        for (let i = 0; i < neonOn.data.length; i += 4)
            if (neonOn.data[i] > neonOff.data[i] + 3 || neonOn.data[i + 1] > neonOff.data[i + 1] + 3) changed++;
        assert.ok(changed > 500, 'neon real control changes visible bloom');
        report.cases.push({ name: 'neon-real-control-pixels', changed });
        await page.locator('#tone').selectOption('reinhard');
        await page.evaluate(async () => {
            await neonClock.step(0);
        });
        const neonReinhard = await capture('neon-reinhard');
        assert.ok(!neonReinhard.data.equals(neonOff.data), 'tone control affects rendered scene');
        await page.evaluate(async () => {
            const slider = document.querySelector('#exposure');
            slider.value = '0.3';
            slider.dispatchEvent(new Event('input'));
            await neonClock.step(0);
        });
        const neonDim = await capture('neon-exposure');
        let energyBefore = 0,
            energyAfter = 0;
        for (let i = 0; i < neonDim.data.length; i += 4) {
            energyBefore += neonReinhard.data[i] + neonReinhard.data[i + 1] + neonReinhard.data[i + 2];
            energyAfter += neonDim.data[i] + neonDim.data[i + 1] + neonDim.data[i + 2];
        }
        assert.ok(energyAfter < energyBefore * 0.85, 'exposure control visibly reduces scene luminance');
        report.cases.push({ name: 'neon-fixed-time-tone-and-exposure-controls', energyBefore, energyAfter });
        await page.evaluate(async () => {
            (await import('/build/cocosair.module.js')).director.resume();
            neonClock.end();
            window.__airPostProcess.dispose();
        });
        for (const file of inputs)
            assert.equal(
                crypto
                    .createHash('sha256')
                    .update(fs.readFileSync(path.resolve(root, file)))
                    .digest('hex'),
                report.fingerprints[path.relative(root, path.resolve(root, file)).replace(/\\/g, '/')],
                'input changed during capture: ' + file,
            );
        assert.deepEqual(report.errors, [], 'no page or console errors');
        report.completed = true;
    } catch (e) {
        report.failure = String(e.stack || e);
        process.exitCode = 1;
        console.error(e);
    } finally {
        if (browser) {
            await browser.close();
            report.shutdown = 'browser.close acknowledged; compositor timing and OS ECHILD not measured';
        }
        server.close();
        clearTimeout(timer);
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    }
})();
