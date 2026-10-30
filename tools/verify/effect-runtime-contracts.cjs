/* Local WebGL2 registration/diagnostic/dynamic-mesh probe. Writes a fresh attempt; no canonical publication. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const assert = require('assert/strict');
const { PNG } = require('pngjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const { serveStaticFile } = require('./static-file-response.cjs');
const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')));
if (!args.out) throw Error('--out=<new-directory> is required');
const root = path.resolve(__dirname, '../..');
const bundle = path.resolve(root, args.bundle || 'build/cocosair.module.js');
const out = path.resolve(root, args.out);
fs.mkdirSync(out); // Keep failed attempts; do not overwrite reports or screenshots.
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files = [
    bundle,
    `${bundle}.map`,
    __filename,
    'tools/verify/browser-engines.cjs',
    'tools/verify/loopback-browser-env.cjs',
    'tools/verify/static-file-response.cjs',
    'src/air/rendering/effect-json-contract.ts',
    'src/air/rendering/shader-diagnostics.ts',
    'src/cocos/asset/assets/effect-asset.ts',
    'src/cocos/render-scene/core/program-lib.ts',
    'src/cocos/gfx/webgl2/webgl2-commands.ts',
    'src/cocos/3d/assets/mesh.ts',
    'src/cocos/3d/framework/mesh-renderer.ts',
];
const fingerprints = () =>
    Object.fromEntries(
        files.map((file) => [
            path.relative(root, path.resolve(root, file)).replace(/\\/g, '/'),
            hash(path.resolve(root, file)),
        ]),
    );
const report = {
    completed: false,
    scope: 'local Chromium WebGL2; not E02/E04 historical attribution or full campaign',
    fingerprints: fingerprints(),
    cases: [],
    errors: [],
    physicalShutdown: 'NOT_MEASURED: browser.close acknowledgement only',
};
const server = http.createServer((req, res) => {
    if (req.url === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end(
            '<style>body{margin:0}canvas{width:320px;height:240px}</style><canvas id="GameCanvas" width="320" height="240"></canvas>',
        );
    } else if (req.url === '/engine.js') serveStaticFile(req, res, bundle, 'text/javascript');
    else {
        res.writeHead(404);
        res.end();
    }
});
const watchdog = setTimeout(() => {
    console.error('local effect probe exceeded 90 seconds');
    process.exit(1);
}, 90000);
(async () => {
    let browser;
    try {
        const map = JSON.parse(fs.readFileSync(`${bundle}.map`, 'utf8'));
        report.sourceBindings = files
            .filter((file) => file.startsWith('src/'))
            .map((file) => {
                const index = map.sources.findIndex((source) => source.replace(/\\/g, '/').endsWith(`/${file}`));
                const current = fs.readFileSync(path.resolve(root, file), 'utf8');
                const embedded = index >= 0 ? map.sourcesContent[index] : null;
                return {
                    file,
                    exact: embedded === current,
                    normalizedLF:
                        typeof embedded === 'string' &&
                        embedded.replace(/\r\n/g, '\n') === current.replace(/\r\n/g, '\n'),
                };
            });
        assert.ok(
            report.sourceBindings.every((binding) => binding.normalizedLF),
            'candidate map must match current runtime source (LF-normalized)',
        );
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { chromium } = require('playwright');
        browser = await chromium.launch({ ...launchOptions('chromium'), headless: true, env: loopbackBrowserEnv() });
        report.browserVersion = browser.version();
        const page = await browser.newPage({ viewport: { width: 320, height: 240 }, deviceScaleFactor: 1 });
        page.on('pageerror', (error) => report.errors.push(String(error)));
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        report.registration = await page.evaluate(async () => {
            const a = await import('/engine.js');
            const app = await a.createAirApp({ canvas: '#GameCanvas', pixelRatioCap: 1 });
            const scene = new a.Scene('effect-contracts');
            const cameraNode = new a.Node('camera');
            scene.addChild(cameraNode);
            cameraNode.setPosition(0, 0, 3);
            const camera = cameraNode.addComponent(a.Camera);
            Object.assign(camera, {
                projection: a.Camera.ProjectionType.ORTHO,
                orthoHeight: 1,
                near: 0.1,
                far: 100,
                clearFlags: a.Camera.ClearFlag.SOLID_COLOR,
                clearColor: new a.Color(0, 0, 0, 255),
            });
            const resources = [];
            const make = (name, right) => {
                const program = `${name}-program`;
                const vert = `in vec3 a_position;${right ? 'in vec4 a_color; out vec4 tint;' : ''}
                    void main(){gl_Position=vec4(a_position,1.0);${right ? 'tint=a_color;' : ''}}`;
                const frag = `precision highp float;${right ? 'in vec4 tint;' : ''} out vec4 color;
                    void main(){color=${right ? 'tint' : 'vec4(1.0,0.0,0.0,1.0)'};}`;
                const shader = {
                    name: program,
                    glsl3: { vert, frag },
                    attributes: [
                        { name: 'a_position', format: a.gfx.Format.RGB32F, location: 0, defines: [] },
                        ...(right ? [{ name: 'a_color', format: a.gfx.Format.RGBA32F, location: 1, defines: [] }] : []),
                    ],
                };
                // Deliberately omit hash and all six optional resource arrays.
                const effect = Object.assign(new a.EffectAsset(), {
                    name,
                    shaders: [shader],
                    techniques: [
                        {
                            passes: [
                                {
                                    program,
                                    rasterizerState: { cullMode: a.gfx.CullMode.NONE },
                                    depthStencilState: { depthTest: false, depthWrite: false },
                                },
                            ],
                        },
                    ],
                    combinations: [],
                });
                effect.onLoaded();
                const material = new a.Material();
                material.initialize({ effectAsset: effect });
                const x0 = right ? 0.1 : -0.9,
                    x1 = right ? 0.9 : -0.1;
                const mesh = a.utils.MeshUtils.createMesh({
                    positions: [x0, -0.5, 0, x1, -0.5, 0, x0, 0.5, 0, x1, 0.5, 0],
                    ...(right ? { colors: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1] } : {}),
                    indices: [0, 1, 2, 1, 3, 2],
                });
                const node = new a.Node(name);
                scene.addChild(node);
                const renderer = node.addComponent(a.MeshRenderer);
                renderer.mesh = mesh;
                renderer.setSharedMaterial(material, 0);
                resources.push(effect, material, mesh);
                return {
                    hash: effect.shaders[0].hash,
                    attributes: effect.shaders[0].attributes.map((item) => item.name),
                };
            };
            const first = make('missing-arrays-first', false),
                second = make('missing-arrays-second', true);
            app.run(scene);
            const clock = a.createStepClock();
            clock.begin();
            const step = async () => {
                for (let i = 0; i < 3; ++i) await clock.step();
            };
            await step();
            window.rig = { a, app, scene, camera, resources, clock, step };
            return { first, second };
        });
        const pixels = async (name) => {
            const bytes = await page.locator('canvas').screenshot({ path: path.join(out, `${name}.png`) });
            const image = PNG.sync.read(bytes);
            let green = 0,
                red = 0;
            for (let i = 0; i < image.data.length; i += 4) {
                const [r, g, b] = image.data.subarray(i, i + 3);
                if (g > 180 && r < 60 && b < 60) ++green;
                if (r > 180 && g < 60 && b < 60) ++red;
            }
            return { green, red };
        };
        const colors = await pixels('two-effects');
        assert.ok(colors.green > 1000 && colors.red > 1000);
        assert.notEqual(report.registration.first.hash, report.registration.second.hash);
        report.cases.push({ name: 'missing-arrays-and-distinct-missing-hashes', status: 'PASS', pixels: colors });
        report.driver = await page.evaluate(() => {
            const { a } = rig,
                device = a.director.root.device;
            const make = (name, frag) =>
                device.createShader(
                    new a.gfx.ShaderInfo(name, [
                        new a.gfx.ShaderStage(
                            a.gfx.ShaderStageFlagBit.VERTEX,
                            'void main(){gl_Position=vec4(0.0,0.0,0.0,1.0);}',
                        ),
                        new a.gfx.ShaderStage(a.gfx.ShaderStageFlagBit.FRAGMENT, frag),
                    ]),
                );
            const shader = make('driver-glsl3-invalid', 'precision highp float;\nvoid main(){gl_FragColor=vec4(1.0);}');
            let error;
            try {
                void shader.gpuShader;
            } catch (failure) {
                error = {
                    code: failure.code,
                    shader: failure.shader,
                    stage: failure.stage,
                    hint: failure.hint,
                    source: failure.source,
                    numberedSource: failure.numberedSource,
                    driverLog: failure.driverLog,
                };
            }
            const retired =
                shader._gpuShader.glProgram === null &&
                shader._gpuShader.gpuStages.every((stage) => stage.glShader === null);
            shader._gpuShader.gpuStages[1].source =
                'precision highp float;out vec4 color;void main(){color=vec4(1.0);}';
            const retry = device.gl.isProgram(shader.gpuShader.glProgram);
            shader.destroy();
            const depth = make('depth-only-valid', 'void main(){}');
            const depthOnly = device.gl.isProgram(depth.gpuShader.glProgram);
            depth.destroy();
            return { error, retired, retry, depthOnly };
        });
        assert.equal(report.driver.error.code, 'AIR_E_SHADER_COMPILE');
        assert.equal(report.driver.error.stage, 'fragment');
        assert.ok(report.driver.error.hint.includes('out vec4'));
        assert.ok(report.driver.retired && report.driver.retry && report.driver.depthOnly);
        report.cases.push({ name: 'real-driver-diagnostic-cleanup-retry-and-depth-only', status: 'PASS' });
        await page.evaluate(async () => {
            const { a, scene, resources } = rig;
            for (const child of [...scene.children]) if (child.name !== 'camera') child.destroy();
            await rig.step();
            for (const resource of resources) resource.destroy();
            const geometry = (x) => ({
                positions: new Float32Array([x - 0.6, -0.6, 0, x + 0.6, -0.6, 0, x - 0.6, 0.6, 0, x + 0.6, 0.6, 0]),
                indices16: new Uint16Array([0, 1, 2, 1, 3, 2]),
            });
            const mesh = a.utils.MeshUtils.createDynamicMesh(0, geometry(0), undefined, {
                maxSubMeshes: 1,
                maxSubMeshVertices: 4,
                maxSubMeshIndices: 6,
            });
            const material = new a.Material();
            material.initialize({ effectName: 'builtin-unlit' });
            material.setProperty('mainColor', new a.Color(0, 255, 0, 255));
            const node = new a.Node('dynamic');
            scene.addChild(node);
            const renderer = node.addComponent(a.MeshRenderer);
            renderer.mesh = mesh;
            renderer.setSharedMaterial(material, 0);
            Object.assign(rig, { mesh, renderer, geometry });
            await rig.step();
            rig.bounds = () => ({
                meshMinX: mesh.struct.minPosition.x,
                modelX: renderer.model.worldBounds.center.x,
                meshIndexCount: mesh.renderingSubMeshes[0].drawInfo.indexCount,
                modelIndexCount: renderer.model.subModels[0].inputAssembler.drawInfo.indexCount,
            });
        });
        const initial = {
            pixels: await pixels('dynamic-initial-no-notification'),
            bounds: await page.evaluate(() => rig.bounds()),
        };
        assert.ok(initial.pixels.green > 1000);
        await page.evaluate(async () => {
            rig.mesh.updateSubMesh(0, rig.geometry(100));
            await rig.step();
        });
        const outside = { pixels: await pixels('dynamic-outside'), bounds: await page.evaluate(() => rig.bounds()) };
        assert.equal(outside.pixels.green, 0);
        await page.evaluate(async () => {
            rig.mesh.updateSubMesh(0, {
                ...rig.geometry(0),
                minPos: new rig.a.Vec3(-0.6, -0.6, 0),
                maxPos: new rig.a.Vec3(0.6, 0.6, 0),
            });
            await rig.step();
        });
        const noNotification = {
            pixels: await pixels('dynamic-return-automatic-sync'),
            bounds: await page.evaluate(() => rig.bounds()),
        };
        assert.ok(
            noNotification.pixels.green > 1000,
            'updateSubMesh must restore visibility without a manual notification',
        );
        assert.equal(noNotification.bounds.modelX, 0);
        await page.evaluate(async () => {
            rig.renderer.onGeometryChanged();
            await rig.step();
        });
        const notified = {
            pixels: await pixels('dynamic-return-notified'),
            bounds: await page.evaluate(() => rig.bounds()),
        };
        assert.ok(notified.pixels.green > 1000);
        await page.evaluate(async () => {
            rig.mesh.updateSubMesh(0, { indices16: new Uint16Array([0, 1, 2]) });
            await rig.step();
        });
        const triangle = {
            pixels: await pixels('dynamic-three-indices'),
            bounds: await page.evaluate(() => rig.bounds()),
        };
        assert.equal(triangle.bounds.modelIndexCount, 3);
        assert.ok(
            triangle.pixels.green > noNotification.pixels.green * 0.4 &&
                triangle.pixels.green < noNotification.pixels.green * 0.6,
        );
        await page.evaluate(async () => {
            rig.mesh.updateSubMesh(0, { indices16: new Uint16Array() });
            await rig.step();
        });
        const empty = { pixels: await pixels('dynamic-zero-indices'), bounds: await page.evaluate(() => rig.bounds()) };
        assert.equal(empty.bounds.modelIndexCount, 0);
        assert.equal(empty.pixels.green, 0);
        await page.evaluate(async () => {
            rig.mesh.updateSubMesh(0, { indices16: new Uint16Array([0, 1, 2, 1, 3, 2]) });
            await rig.step();
        });
        const restored = {
            pixels: await pixels('dynamic-restored-indices'),
            bounds: await page.evaluate(() => rig.bounds()),
        };
        assert.equal(restored.bounds.modelIndexCount, 6);
        assert.equal(restored.pixels.green, noNotification.pixels.green);
        report.dynamic = {
            initial,
            outside,
            automaticSync: noNotification,
            manualCompatibility: notified,
            triangle,
            empty,
            restored,
            automaticBoundsAndDrawInfo: true,
            historicalE02E04: 'UNCONFIRMED: original arm inputs not supplied',
        };
        report.cases.push({ name: 'dynamic-mesh-automatic-bounds-and-draw-info', status: 'PASS' });
        await page.evaluate(async () => {
            rig.clock.end();
            await rig.app.close();
        });
        assert.deepEqual(report.errors, []);
        assert.deepEqual(fingerprints(), report.fingerprints);
        report.completed = true;
    } catch (error) {
        report.failure = String(error.stack || error);
        process.exitCode = 1;
    } finally {
        try {
            if (browser) {
                await browser.close();
                report.browserClosed = true;
            }
        } finally {
            await new Promise((resolve) => server.close(resolve));
            clearTimeout(watchdog);
            fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
            console.log(JSON.stringify(report));
        }
    }
})();
