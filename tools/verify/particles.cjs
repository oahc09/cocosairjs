/* Focused F02 native particles: code-first initialization, pixels, clock and resource ownership. */
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
const out = path.resolve(root, args.out);
const bundle = path.resolve(root, args.bundle || 'build/cocosair.module.js');
fs.mkdirSync(out, { recursive: false });
const inputs = [
    bundle,
    bundle + '.map',
    __filename,
    path.join(root, 'src/air/particles.ts'),
    path.join(root, 'src/air/index.ts'),
    path.join(root, 'src/cocos/particle/renderer/trail.ts'),
    path.join(root, 'src/cocos/particle/animator/texture-animation.ts'),
    path.join(root, 'src/cocos/particle/renderer/particle-system-renderer-data.ts'),
    path.join(root, 'examples/particles-3d/index.html'),
    path.join(root, 'examples/particles-3d/src/main.ts'),
];
const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const fingerprints = Object.fromEntries(inputs.map((f) => [path.relative(root, f).replace(/\\/g, '/'), hash(f)]));
const report = {
    completed: false,
    subset: true,
    scope: 'F02 local Chromium; not release or compositor timing acceptance',
    fingerprints,
    errors: [],
};
const server = http.createServer((req, res) => {
    if (['/engine.js', '/build/cocosair.module.js'].includes(req.url))
        return serveStaticFile(req, res, bundle, 'text/javascript');
    if (req.url.startsWith('/particles-3d/')) {
        const file = path.resolve(root, 'examples' + decodeURIComponent(req.url));
        const entry = fs.existsSync(file) && fs.statSync(file).isDirectory() ? path.join(file, 'index.html') : file;
        if (!entry.startsWith(path.join(root, 'examples', 'particles-3d') + path.sep) || !fs.existsSync(entry)) {
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
    if (req.url === '/favicon.ico') {
        res.writeHead(204);
        return res.end();
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(
        '<style>body{margin:0;background:#000}canvas{width:480px;height:320px}</style><canvas id="GameCanvas" width="480" height="320"></canvas>',
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
        // The re-export-only index is tree-shaken out of source maps; fingerprint it above.
        for (const f of inputs.filter(
            (v) => v.startsWith(path.join(root, 'src') + path.sep) && !v.endsWith(path.sep + 'index.ts'),
        )) {
            const logical = path.relative(root, f).replace(/\\/g, '/');
            const i = map.sources.findIndex((v) => v.replace(/\\/g, '/').endsWith('/' + logical));
            assert.ok(
                i >= 0 &&
                    map.sourcesContent[i].replace(/\r\n/g, '\n') === fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'),
                'source map binding: ' + logical,
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
            const a = await import('/engine.js');
            const app = await a.createAirApp({ canvas: '#GameCanvas', pixelRatioCap: 1 });
            const scene = new a.Scene('Native particles');
            const cn = new a.Node('Camera');
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
            const gl = a.director.root.device.gl;
            const deleted = { buffers: [], textures: [] };
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
            const make = (gpu, x, trails = false) =>
                a.createAirParticleSystem({
                    parent: scene,
                    useGPU: gpu,
                    configure(p) {
                        p.node.setPosition(x, -0.8, 0);
                        p.node.setRotationFromEuler(-90, 0, 0);
                        p.capacity = 64;
                        p.rateOverTime.constant = 16;
                        p.startLifetime.constant = 1;
                        p.startSpeed.constant = 0.8;
                        p.startSizeX.constant = 0.3;
                        p.startColor.color = gpu ? new a.Color(40, 160, 255, 255) : new a.Color(255, 80, 30, 255);
                        p.sizeOvertimeModule.enable = true;
                        p.sizeOvertimeModule.size.mode = a.ParticleCurveMode.Curve;
                        p.sizeOvertimeModule.size.spline.assignSorted([
                            [0, { value: 1 }],
                            [1, { value: 0.3 }],
                        ]);
                        p.colorOverLifetimeModule.enable = true;
                        p.simulationSpace = a.ParticleSpace.World;
                        p.shapeModule.enable = true;
                        p.shapeModule.shapeType = a.ParticleShapeType.Box;
                        p.shapeModule.scale = new a.Vec3(0.8, 0.2, 0.1);
                        p.trailModule.enable = trails;
                        p.renderer.alignSpace = a.ParticleAlignmentSpace.View;
                    },
                });
            const cpu = make(false, -1.3, true),
                gpu = make(true, 1.3);
            app.run(scene);
            const clock = a.createStepClock();
            clock.begin();
            const step = async (frames = 1) => {
                for (let i = 0; i < frames; ++i) await clock.step(1 / 60);
            };
            await step(30);
            window.rig = { a, app, scene, camera, cpu, gpu, clock, step, deleted, gl, make };
            const first = cpu.processor._particles.data[0];
            const age = 1 - first.remainingLifetime / first.startLifetime;
            return {
                cpuCount: cpu.getParticleCount(),
                gpuCount: gpu.getParticleCount(),
                cpuTime: cpu.time,
                gpuTime: gpu.time,
                gpuEnabled: gpu.renderer.useGPU,
                trail: cpu.trailModule.enable,
                trailIndices: cpu.trailModule.getModel()?.subModels[0]?.inputAssembler.drawInfo.indexCount ?? 0,
                curve: { age, size: first.size.x, expected: 0.3 * cpu.sizeOvertimeModule.size.evaluate(age, 0) },
            };
        });
        assert.ok(report.initial.cpuCount > 0 && report.initial.gpuCount > 0 && report.initial.gpuEnabled);
        assert.ok(report.initial.trailIndices > 0, 'trail must submit actual indexed geometry');
        assert.ok(
            report.initial.curve.age > 0.1 &&
                Math.abs(report.initial.curve.size - report.initial.curve.expected) < 1e-5,
            'enabled native size curve must affect live particle state',
        );
        const image = PNG.sync.read(await page.locator('canvas').screenshot({ path: path.join(out, 'cpu-gpu.png') }));
        let warm = 0,
            cool = 0;
        for (let i = 0; i < image.data.length; i += 4) {
            const [r, g, b] = image.data.subarray(i, i + 3);
            if (r > 100 && r > b * 1.5) ++warm;
            if (b > 100 && b > r * 1.5) ++cool;
        }
        report.pixels = { warm, cool };
        assert.ok(warm > 30 && cool > 30, 'both native processors must draw visible colored particles');
        report.lifecycle = await page.evaluate(async () => {
            const { cpu, gpu, step } = rig;
            cpu.pause();
            gpu.pause();
            const before = [cpu.time, gpu.time, cpu.getParticleCount(), gpu.getParticleCount()];
            await step(10);
            const paused = [cpu.time, gpu.time, cpu.getParticleCount(), gpu.getParticleCount()];
            cpu.play();
            gpu.play();
            await step(5);
            const resumed = [cpu.time, gpu.time];
            cpu.stopEmitting();
            gpu.stopEmitting();
            await step(80);
            const expired = [cpu.getParticleCount(), gpu.getParticleCount()];
            cpu.stop();
            gpu.stop();
            cpu.play();
            gpu.play();
            await step(20);
            const replay = [cpu.getParticleCount(), gpu.getParticleCount()];
            cpu.stop();
            gpu.stop();
            const cleared = [cpu.getParticleCount(), gpu.getParticleCount()];
            return { before, paused, resumed, expired, replay, cleared };
        });
        assert.deepEqual(report.lifecycle.before, report.lifecycle.paused);
        assert.ok(
            report.lifecycle.resumed[0] > report.lifecycle.paused[0] &&
                report.lifecycle.resumed[1] > report.lifecycle.paused[1],
        );
        assert.deepEqual(report.lifecycle.expired, [0, 0]);
        assert.deepEqual(report.lifecycle.cleared, [0, 0]);
        assert.ok(report.lifecycle.replay.every((v) => v > 0));
        report.spaces = await page.evaluate(async () => {
            const { a, scene, step, camera } = rig;
            const particles = [],
                points = [];
            for (const gpu of [false, true])
                for (const local of [false, true]) {
                    const x = gpu ? 1 : -1,
                        y = local ? 0.6 : -0.6;
                    const p = a.createAirParticleSystem({
                        parent: scene,
                        useGPU: gpu,
                        configure(p) {
                            p.node.setPosition(x, y, 0);
                            p.rateOverTime.constant = 0;
                            p.startLifetime.constant = 2;
                            p.startSpeed.constant = 0;
                            p.startSizeX.constant = 0.3;
                            p.playOnAwake = false;
                            p.simulationSpace = local ? a.ParticleSpace.Local : a.ParticleSpace.World;
                        },
                    });
                    p.play();
                    p.emit(1, 0);
                    p.node.setPosition(x + 0.5, y, 0);
                    particles.push(p);
                    const expected = camera.worldToScreen(new a.Vec3(local ? x + 0.5 : x, y, 0));
                    const absent = camera.worldToScreen(new a.Vec3(local ? x : x + 0.5, y, 0));
                    points.push({
                        gpu,
                        local,
                        expected: { x: expected.x, y: expected.y },
                        absent: { x: absent.x, y: absent.y },
                    });
                }
            await step(1);
            rig.spaceParticles = particles;
            return points;
        });
        const spaceImage = PNG.sync.read(
            await page.locator('canvas').screenshot({ path: path.join(out, 'spaces.png') }),
        );
        const value = (point) => {
            const i = ((spaceImage.height - 1 - Math.round(point.y)) * spaceImage.width + Math.round(point.x)) * 4;
            return spaceImage.data[i] + spaceImage.data[i + 1] + spaceImage.data[i + 2];
        };
        for (const point of report.spaces) {
            assert.ok(value(point.expected) > 200, 'particle at correct local/world position');
            assert.ok(value(point.absent) < 20, 'no particle at incorrectly transformed position');
        }
        await page.evaluate(async () => {
            rig.spaceParticles.forEach((p) => p.node.destroy());
            await rig.step(2);
        });
        report.lateTrail = await page.evaluate(async () => {
            const { a, scene, step } = rig;
            const p = a.createAirParticleSystem({
                parent: scene,
                configure(p) {
                    p.rateOverTime.constant = 16;
                    p.startLifetime.constant = 2;
                    p.startSpeed.constant = 1;
                    p.node.setRotationFromEuler(-90, 0, 0);
                },
            });
            const initiallyDisabled = !p.trailModule.enable && p.trailModule.getModel() === null;
            await step(20);
            p.trailModule.enable = true;
            await step(30);
            const indices = p.trailModule.getModel()?.subModels[0]?.inputAssembler.indexCount ?? 0;
            p.node.destroy();
            await step(2);
            return { initiallyDisabled, indices };
        });
        assert.ok(
            report.lateTrail.initiallyDisabled && report.lateTrail.indices > 0,
            'initially disabled trail must initialize material and draw when enabled later',
        );
        report.release = await page.evaluate(async () => {
            const { a, cpu, gpu, deleted, gl, step, scene, make } = rig;
            const bufferBefore = deleted.buffers.length,
                textureBefore = deleted.textures.length;
            cpu.node.destroy();
            gpu.node.destroy();
            await step(2);
            const buffers = deleted.buffers.slice(bufferBefore),
                textures = deleted.textures.slice(textureBefore);
            const released = buffers.every((v) => !gl.isBuffer(v)) && textures.every((v) => !gl.isTexture(v));
            const alive = [a.isValid(cpu, true), a.isValid(gpu, true)];
            const next = make(false, 0);
            await step(20);
            const reentry = next.getParticleCount();
            next.node.destroy();
            await step(2);
            return {
                buffers: buffers.length,
                textures: textures.length,
                released,
                alive,
                reentry,
                models: scene.renderScene.models.length,
            };
        });
        assert.ok(report.release.buffers > 0 && report.release.textures > 0 && report.release.released);
        assert.deepEqual(report.release.alive, [false, false]);
        assert.ok(report.release.reentry > 0);
        assert.equal(report.release.models, 0);
        report.rejections = await page.evaluate(async () => {
            const { a, scene, step } = rig;
            const before = scene.children.length;
            const messages = [];
            for (const configure of [
                (p) => {
                    p.trailModule.enable = true;
                },
                (p) => {
                    throw Error('configuration rejected');
                },
            ]) {
                try {
                    a.createAirParticleSystem({ parent: scene, useGPU: true, configure });
                } catch (error) {
                    messages.push(String(error));
                }
            }
            await step(2);
            return {
                messages,
                childrenUnchanged: before === scene.children.length,
                models: scene.renderScene.models.length,
            };
        });
        assert.match(report.rejections.messages[0], /AIR_PARTICLE_GPU_MODULE/);
        assert.match(report.rejections.messages[1], /configuration rejected/);
        assert.ok(report.rejections.childrenUnchanged);
        assert.equal(report.rejections.models, 0);
        assert.deepEqual(report.errors, []);
        await page.evaluate(() => rig.clock.end());
        await page.goto('http://127.0.0.1:' + server.address().port + '/particles-3d/');
        await page.waitForFunction(() => window.__appReady === true);
        await page.evaluate(async () => {
            const a = await import('/build/cocosair.module.js');
            window.demoClock = a.createStepClock();
            demoClock.begin();
            for (let i = 0; i < 60; i++) await demoClock.step(1 / 60);
        });
        await page.screenshot({ path: path.join(out, 'example.png') });
        await page.locator('#pause').click();
        const before = await page.evaluate(() => [__particles3d.cpu.time, __particles3d.gpu.time]);
        await page.evaluate(async () => {
            for (let i = 0; i < 10; i++) await demoClock.step(1 / 60);
        });
        assert.deepEqual(await page.evaluate(() => [__particles3d.cpu.time, __particles3d.gpu.time]), before);
        await page.locator('#resume').click();
        await page.evaluate(async () => {
            for (let i = 0; i < 10; i++) await demoClock.step(1 / 60);
        });
        assert.ok(
            await page.evaluate(
                (before) => __particles3d.cpu.time > before[0] && __particles3d.gpu.time > before[1],
                before,
            ),
        );
        await page.locator('#drain').click();
        await page.evaluate(async () => {
            for (let i = 0; i < 135; i++) await demoClock.step(1 / 60);
        });
        assert.deepEqual(
            await page.evaluate(() => [__particles3d.cpu.getParticleCount(), __particles3d.gpu.getParticleCount()]),
            [0, 0],
        );
        await page.locator('#replay').click();
        await page.evaluate(async () => {
            for (let i = 0; i < 30; i++) await demoClock.step(1 / 60);
        });
        assert.ok(
            await page.evaluate(
                () => __particles3d.cpu.getParticleCount() > 0 && __particles3d.gpu.getParticleCount() > 0,
            ),
        );
        report.example = { pause: 'PASS', resume: 'PASS', drain: 'PASS', replay: 'PASS' };
        report.presets = [];
        for (const preset of ['embers', 'smoke', 'rain', 'snow', 'spray']) {
            await page.locator('#preset').selectOption(preset);
            await page.evaluate(async () => {
                for (let i = 0; i < 60; i++) await demoClock.step(1 / 60);
            });
            // Locator screenshots retain overlapping DOM: hide the HUD so it cannot satisfy particle pixel checks.
            await page.locator('aside').evaluate((el) => {
                el.style.visibility = 'hidden';
            });
            const pixels = PNG.sync.read(
                await page.locator('canvas').screenshot({ path: path.join(out, 'example-' + preset + '.png') }),
            );
            await page.locator('aside').evaluate((el) => {
                el.style.visibility = '';
            });
            let left = 0,
                right = 0;
            for (let y = 0; y < pixels.height; y++)
                for (let x = 0; x < pixels.width; x++) {
                    const i = (y * pixels.width + x) * 4;
                    if (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2] > 85) {
                        if (x < pixels.width / 2) left++;
                        else right++;
                    }
                }
            assert.ok(left > 20 && right > 20, preset + ': both native processors draw pixels');
            report.presets.push({ preset, left, right });
        }
        await page.evaluate(async () => {
            await __particles3d.dispose();
            demoClock.end();
        });
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
                report.shutdown = 'browser.close acknowledged; no Linux subreaper custody claim';
            }
        } finally {
            server.close();
            clearTimeout(timer);
            fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        }
    }
})();
