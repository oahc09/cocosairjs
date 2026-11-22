// Standalone opt-in shadow correctness check; not the 200-actor timing/pose-count experiment.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const assert = require('node:assert/strict');
const hash = (bytes) => require('node:crypto').createHash('sha256').update(bytes).digest('hex');
const { execFileSync } = require('node:child_process');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { verifySourceBinding } = require('../build/source-binding.cjs');
const [engine, out, input, ...extra] = process.argv.slice(2);
assert(engine === 'webkit' && out && input && !extra.length, 'usage: webkit <new-directory> <workspace ESM bundle>');
const bundlePath = fs.realpathSync(path.resolve(root, input));
assert(
    bundlePath.startsWith(fs.realpathSync(root) + path.sep) && bundlePath.endsWith('.js'),
    'Candidate must be a workspace .js bundle',
);
const bundleName = path.relative(root, bundlePath).split(path.sep).join('/');
const bind = verifySourceBinding(root, bundlePath);
assert(bind.matches && bind.origin === 'compiler-map');
const sha = hash(fs.readFileSync(bundlePath));
const fixture = 'test/fixtures/upstream-skinning/rig.gltf';
const fixtureSha = hash(fs.readFileSync(path.join(root, fixture)));
(async () => {
    const server = await startExampleServer(root);
    let browser;
    try {
        browser = await require('playwright')[engine].launch({
            headless: true,
            ...launchOptions(engine),
            env: loopbackBrowserEnv(),
        });
        const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        const shell = server.origin + '/test/fixtures/crowd-pose/';
        await page.route(shell, (route) =>
            route.fulfill({
                contentType: 'text/html',
                body: '<!doctype html><link rel="icon" href="data:,"><canvas id="GameCanvas" width="320" height="240"></canvas>',
            }),
        );
        await page.goto(shell);
        const url = server.origin + '/' + bundleName.split('/').map(encodeURIComponent).join('/');
        const pending = page.waitForResponse(url);
        const fixturePending = page.waitForResponse(server.origin + '/' + fixture);
        const experimental = page.evaluate(
            async ({ url, fixture }) => {
                const A = await import(url);
                const {
                    Animation,
                    Camera,
                    Color,
                    DirectionalLight,
                    Vec3,
                    createAirApp,
                    createStepClock,
                    GLTFLoader,
                    Node,
                    Scene,
                    SkinnedMeshRenderer,
                    MeshRenderer,
                    Material,
                    primitives,
                    utils,
                    geometry,
                    director,
                } = A;
                const app = await createAirApp({ canvas: '#GameCanvas', renderer: 'webgl2', pixelRatioCap: 1 });
                const gl = app.canvas.getContext('webgl2');
                if (!gl) throw Error('No WebGL2');
                const scene = new Scene('Off-camera directional ShadowMap correctness');
                const camera = new Node('Main camera');
                scene.addChild(camera);
                camera.setPosition(0, 0, 10);
                const cam = camera.addComponent(Camera);
                cam.projection = Camera.ProjectionType.ORTHO;
                cam.orthoHeight = 3;
                cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
                cam.clearColor = new Color(24, 30, 35, 255);
                const shadows = scene.globals.shadows;
                shadows.type = 1; // Native ShadowType.ShadowMap
                shadows.enabled = true;
                shadows.shadowMapSize = 1024;
                const light = new Node('Fixed area tilted directional light');
                scene.addChild(light);
                light.setPosition(12, 0, 6);
                light.lookAt(new Vec3(0, 0, 0));
                const sun = light.addComponent(DirectionalLight);
                sun.shadowEnabled = true;
                sun.shadowFixedArea = true;
                sun.shadowNear = 0.01;
                sun.shadowFar = 30;
                sun.shadowOrthoSize = 8;
                sun.illuminance = 90000;
                const receiver = new Node('Visible matte receiver');
                scene.addChild(receiver);
                const render = receiver.addComponent(MeshRenderer);
                render.mesh = utils.createMesh(primitives.quad({ width: 7, height: 5 }));
                const material = new Material();
                material.initialize({ effectName: 'builtin-standard' });
                material.setProperty('albedo', new Color(135, 160, 185, 255));
                render.setMaterial(material, 0);
                render.receiveShadow = 1;
                const fetched = await fetch('/' + fixture);
                if (!fetched.ok) throw Error('Authored rig missing');
                const model = await fetched.json();
                model.meshes[0].primitives = [model.meshes[0].primitives[0]];
                // Keep the rig's skeletal animation only. The source unlit material is deliberately
                // replaced so this fixture has an opaque native lit pass and a shadow-caster pass.
                delete model.meshes[0].primitives[0].targets;
                delete model.meshes[0].weights;
                delete model.materials[0].extensions;
                delete model.extensionsRequired;
                model.animations[0].channels = model.animations[0].channels.filter(
                    (c) => c.target.path === 'translation',
                );
                const asset = await new GLTFLoader().parseAsync(JSON.stringify(model));
                const actor = asset.instantiate();
                scene.addChild(actor.root);
                const state = actor.root.getComponent(Animation).getState('move');
                const skin = actor.root.getComponentInChildren(SkinnedMeshRenderer);
                if (!skin) throw Error('Expected authored skinned renderer');
                const cast = SkinnedMeshRenderer.ShadowCastingMode;
                app.run(scene);
                const clock = createStepClock();
                clock.begin();
                try {
                    const width = app.canvas.width,
                        height = app.canvas.height;
                    const crop = { x: 72, y: 65, width: 176, height: 110 };
                    const referenceCrop = { x: 40, y: 35, width: 24, height: 20 };
                    const layer = () => director.root.pipeline.pipelineSceneData.csmLayers.specialLayer;
                    const membership = () => {
                        const m = skin.model,
                            b = m.worldBounds,
                            v = cam.camera.visibility;
                        return {
                            main: !!geometry.intersect.aabbFrustum(b, cam.camera.frustum),
                            light: !!geometry.intersect.aabbFrustum(b, layer().validFrustum),
                            insideLight: !!geometry.intersect.aabbFrustumCompletelyInside(b, layer().validFrustum),
                            layerAdmitted: (v & m.node.layer) === m.node.layer || !!(v & m.visFlags),
                            cast: !!m.castShadow,
                            listed: layer().shadowObjects.some((o) => o.model === m),
                            bounds: [
                                b.center.x,
                                b.center.y,
                                b.center.z,
                                b.halfExtents.x,
                                b.halfExtents.y,
                                b.halfExtents.z,
                            ],
                            phases: m.subModels.flatMap((sm) => sm.passes.map((p) => p.phase)),
                            casterMaterialHasPass: skin
                                .getMaterial(0)
                                .effectAsset.techniques[0].passes.some((p) => p.phase === 'shadow-caster'),
                        };
                    };
                    const report = [];
                    const sample = (t) => {
                        state.time = t;
                        state.sample();
                    };
                    const read = ({ x, y, width, height }) => {
                        const data = new Uint8Array(width * height * 4);
                        gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
                        return Array.from(data);
                    };
                    const snapshot = async (name, logical, sampled) => {
                        await clock.step(0);
                        const data = read(crop);
                        const reference = read(referenceCrop);
                        report.push({
                            name,
                            logical,
                            sampled,
                            poseTime: state.time,
                            error: gl.getError(),
                            ...membership(),
                            data,
                            reference,
                        });
                    };
                    actor.root.setPosition(6, 0, 3);
                    skin.shadowCastingMode = cast.OFF;
                    sample(0);
                    await snapshot('cast-off', 0, true);
                    skin.shadowCastingMode = cast.ON;
                    await snapshot('full-pose-a', 0, true);
                    sample(1);
                    await snapshot('full-pose-b', 1, true);
                    actor.root.setPosition(0, 0, 3);
                    sample(1);
                    await snapshot('full-reentry', 1, true);
                    for (const policy of ['camera-only', 'shadow-aware']) {
                        actor.root.setPosition(6, 0, 3);
                        sample(0);
                        await snapshot(policy + '-pose-a', 0, true);
                        const m = membership();
                        const sampled = m.main || (policy === 'shadow-aware' && m.layerAdmitted && m.cast && m.light);
                        if (sampled) sample(1);
                        await snapshot(policy + '-pose-b', 1, sampled);
                        actor.root.setPosition(0, 0, 3);
                        sample(1);
                        await snapshot(policy + '-reentry', 1, true);
                    }
                    return { width, height, crop, referenceCrop, webgl: gl.getParameter(gl.VERSION), shots: report };
                } finally {
                    actor.dispose();
                    asset.destroy();
                    material.destroy();
                    clock.end();
                    await app.close();
                }
            },
            { url, fixture },
        );
        const [response, rig, result] = await Promise.all([pending, fixturePending, experimental]);
        assert(response.ok());
        assert.equal(hash(await response.body()), sha);
        assert(rig.ok());
        assert.equal(hash(await rig.body()), fixtureSha);
        assert.equal(hash(fs.readFileSync(path.join(root, fixture))), fixtureSha);
        assert.deepEqual(verifySourceBinding(root, bundlePath), bind);
        const { shots, ...surface } = result;
        const by = Object.fromEntries(shots.map((shot) => [shot.name, shot]));
        const delta = (a, b) => {
            const x = by[a].data,
                y = by[b].data;
            let count = 0;
            assert.equal(x.length, y.length);
            for (let i = 0; i < x.length; i += 4)
                if (x[i] !== y[i] || x[i + 1] !== y[i + 1] || x[i + 2] !== y[i + 2] || x[i + 3] !== y[i + 3]) count++;
            return count;
        };
        const metrics = {
            shadow: delta('cast-off', 'full-pose-a'),
            movingShadow: delta('full-pose-a', 'full-pose-b'),
            exemptInitial: delta('full-pose-a', 'shadow-aware-pose-a'),
            staleMatchesOldPose: delta('full-pose-a', 'camera-only-pose-b'),
            exempt: delta('full-pose-b', 'shadow-aware-pose-b'),
            negative: delta('full-pose-b', 'camera-only-pose-b'),
            reentry: delta('full-reentry', 'shadow-aware-reentry'),
        };
        const offscreen = shots.filter((s) => !/reentry/.test(s.name));
        const checks = {
            separateFrusta: offscreen.every((s) => !s.main && s.light && s.insideLight && s.layerAdmitted),
            castingAdmission: offscreen.every((s) => s.casterMaterialHasPass && s.cast === s.listed),
            stableReference: offscreen.every((s) =>
                Buffer.from(s.reference).equals(Buffer.from(by['cast-off'].reference)),
            ),
            poseTime: shots.every((s) => s.poseTime === (s.sampled ? s.logical : 0)),
            meaningfulStamp: metrics.shadow > 16 && metrics.movingShadow > 16,
            negative: !by['camera-only-pose-b'].sampled && metrics.negative > 16 && metrics.staleMatchesOldPose === 0,
            candidate: by['shadow-aware-pose-b'].sampled && metrics.exemptInitial === 0 && metrics.exempt === 0,
            reentry: by['full-reentry'].main && by['shadow-aware-reentry'].main && metrics.reentry === 0,
            noErrors: !errors.length && shots.every((s) => s.error === 0),
        };
        const pass = Object.values(checks).every(Boolean);
        const directory = path.resolve(out);
        fs.mkdirSync(directory);
        const report = {
            status: pass ? 'PASS' : 'FAIL',
            engine,
            head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
            browser: browser.version(),
            bundle: { path: bundleName, sha, bind },
            fixtureSha,
            scriptSha: hash(fs.readFileSync(__filename)),
            surface,
            metrics,
            checks,
            errors,
            scope: 'Fixed-area directional ShadowMap with a skin-only authored clip; no production policy, morph or performance claim.',
            shots: shots.map(({ data, reference, ...shot }) => {
                const file = shot.name + '.rgba';
                const pixels = Buffer.from(data);
                fs.writeFileSync(path.join(directory, file), pixels, { flag: 'wx' });
                const referenceFile = shot.name + '-reference.rgba';
                const referencePixels = Buffer.from(reference);
                fs.writeFileSync(path.join(directory, referenceFile), referencePixels, { flag: 'wx' });
                return { ...shot, file, sha256: hash(pixels), referenceFile, referenceSha256: hash(referencePixels) };
            }),
        };
        fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify(report, null, 2));
        if (!pass) process.exitCode = 1;
    } finally {
        try {
            if (browser) await browser.close();
        } finally {
            await server.close();
        }
    }
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
