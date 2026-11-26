const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PNG } = require('pngjs');
const { webkit } = require('playwright');
const { launchOptions } = require('./browser-engines.cjs');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { makePackedRotationGlb } = require('./gltf-packed-rotation-fixture.cjs');

const root = path.resolve(__dirname, '../..');
const sha = (data) => createHash('sha256').update(data).digest('hex');

async function main() {
    const [mode, pathArg, ...extra] = process.argv.slice(2);
    assert.ok(
        ['baseline', 'fixed'].includes(mode) && pathArg && !extra.length,
        'usage: <baseline|fixed> <new receipt>',
    );
    const dest = path.resolve(pathArg);
    assert.equal(fs.existsSync(dest), false);
    const files = [
        'src/air/assets/gltf/extensions/scene/instancing.ts',
        'src/air/assets/gltf/parser-context.ts',
        'build/cocosair.module.js',
        'tools/verify/gltf-packed-rotation-fixture.cjs',
        'tools/verify/gltf-packed-rotation-browser.cjs',
    ];
    const fingerprints = Object.fromEntries(files.map((name) => [name, sha(fs.readFileSync(path.join(root, name)))]));
    const server = await startExampleServer(root);
    const report = {
        scope: 'public GLB parse/instantiate, real WebKit WebGL2 pixels, no native draw batching or device claim',
        mode,
        status: 'FAIL',
        fingerprints,
        lanes: [],
        pageErrors: [],
    };
    let browser;
    try {
        browser = await webkit.launch({ ...launchOptions('webkit'), headless: true });
        report.browser = browser.version();
        const page = await browser.newPage({ viewport: { width: 300, height: 240 }, deviceScaleFactor: 1 });
        page.on('pageerror', (error) => report.pageErrors.push(error.message));
        await page.route('**/__gltf_rotation_host', (route) =>
            route.fulfill({
                contentType: 'text/html',
                body: '<!doctype html><style>html,body,#GameDiv,#Cocos3dGameContainer{width:100%;height:100%;margin:0;overflow:hidden}canvas{display:block}</style><canvas id="GameCanvas"></canvas>',
            }),
        );
        await page.goto(server.origin + '/__gltf_rotation_host');
        report.backend = await page.evaluate(async () => {
            const { Camera, Color, GLTFLoader, MeshRenderer, Node, Scene, Vec3, createAirApp, createStepClock, game } =
                await import('/build/cocosair.module.js');
            const app = await createAirApp({ canvas: '#GameCanvas' });
            const scene = new Scene('packed-rotation');
            const cameraNode = new Node('camera');
            scene.addChild(cameraNode);
            cameraNode.setPosition(7, 32, 33);
            cameraNode.lookAt(new Vec3(7, 22, 33), new Vec3(0, 0, -1));
            const camera = cameraNode.addComponent(Camera);
            camera.projection = Camera.ProjectionType.ORTHO;
            camera.orthoHeight = 2;
            camera.far = 40;
            camera.clearColor = new Color(12, 16, 24, 255);
            app.run(scene);
            const clock = createStepClock();
            clock.begin();
            const loader = new GLTFLoader();
            let active;
            window.inspectRotation = {
                async load(bytes) {
                    let asset;
                    try {
                        asset = await loader.parseAsync(new Uint8Array(bytes).buffer);
                    } catch (error) {
                        return { status: 'rejected', code: error.code ?? null, message: error.message };
                    }
                    const instance = asset.instantiate();
                    active = { asset, instance, mesh: asset.meshes[0] };
                    scene.addChild(instance.root);
                    const anchor = instance.root.children.find((node) => node.name.startsWith('anchor__'));
                    if (!anchor) throw Error('anchor missing');
                    const child = anchor.children.find((node) => node.name.endsWith('__inst_0'));
                    const matrix = child.worldMatrix;
                    const toArray = (v) => [v.x, v.y, v.z].map((x) => Math.round(x * 1e5) / 1e5);
                    const origin = toArray(child.worldPosition);
                    const vertex = toArray(Vec3.transformMat4(new Vec3(), new Vec3(1, 0, 0), matrix));
                    const local = toArray(child.position);
                    const rotation = ['x', 'y', 'z', 'w'].map((k) => Math.round(child.rotation[k] * 1e5) / 1e5);
                    await clock.step(1 / 60);
                    await clock.step(1 / 60);
                    return {
                        status: 'rendered',
                        origin,
                        vertex,
                        rotation,
                        local,
                        anchorOwnRenderer: !!anchor.getComponent(MeshRenderer),
                        childUsesMesh: child.getComponent(MeshRenderer)?.mesh === asset.meshes[0],
                    };
                },
                async remove() {
                    const { asset, instance, mesh } = active;
                    instance.dispose();
                    asset.destroy();
                    for (let i = 0; i < 4 && (instance.root.isValid || asset.isValid || mesh.isValid); i++) {
                        await clock.step(1 / 60);
                    }
                    active = null;
                    return {
                        instanceReleased: !instance.root.isValid,
                        assetReleased: !asset.isValid,
                        meshReleased: !mesh.isValid,
                    };
                },
                async close() {
                    clock.end();
                    return app.close();
                },
            };
            return {
                webgl2: !!document.querySelector('canvas').getContext('webgl2'),
                pausedForSteps: game.isPaused?.() ?? true,
            };
        });
        assert.equal(report.backend.webgl2, true);
        let floatPixels;
        const variants = [
            ['float32', 5126, false],
            ['signed-byte', 5120, true],
            ['signed-short', 5122, true],
            ['unsigned', 5121, true],
            ['not-normalized', 5120, false],
        ];
        for (const [kind, type, normalized] of variants) {
            const glb = new Uint8Array(makePackedRotationGlb(type, normalized));
            const row = { kind, bytes: glb.byteLength, glbSha256: sha(glb) };
            report.lanes.push(row);
            row.observed = await page.evaluate((data) => window.inspectRotation.load(data), Array.from(glb));
            const accepted = kind === 'float32' || (mode === 'fixed' && ['signed-byte', 'signed-short'].includes(kind));
            if (!accepted) {
                assert.equal(row.observed.status, 'rejected');
                assert.equal(row.observed.code, 'GLTF_EXTENSION_INVALID');
                continue;
            }
            assert.equal(row.observed.status, 'rendered');
            assert.deepEqual(row.observed.origin, [7, 22, 34]);
            assert.deepEqual(row.observed.vertex, [7, 22, 32]);
            assert.deepEqual(row.observed.local, [2, 3, 4]);
            assert.deepEqual(row.observed.rotation, [0, 0.70711, 0, 0.70711]);
            assert.equal(row.observed.anchorOwnRenderer, false);
            assert.equal(row.observed.childUsesMesh, true);
            const png = PNG.sync.read(await page.locator('#GameCanvas').screenshot());
            let redPixels = 0;
            for (let i = 0; i < png.data.length; i += 4) {
                if (png.data[i] >= 170 && png.data[i + 1] < 125 && png.data[i + 2] < 125) redPixels++;
            }
            assert.ok(redPixels >= 200, 'real red triangle must render, not only clear color');
            row.pixels = { width: png.width, height: png.height, redPixels, sha256: sha(png.data) };
            if (floatPixels) assert.deepEqual(row.pixels, floatPixels);
            else floatPixels = row.pixels;
            row.release = await page.evaluate(() => window.inspectRotation.remove());
            assert.deepEqual(row.release, { instanceReleased: true, assetReleased: true, meshReleased: true });
        }
        const closed = await page.evaluate(() => window.inspectRotation.close());
        report.closeStatus = closed.status;
        assert.equal(report.closeStatus, 'released');
        assert.deepEqual(report.pageErrors, []);
        for (const name of files) assert.equal(sha(fs.readFileSync(path.join(root, name))), fingerprints[name]);
        report.status = 'PASS';
    } catch (error) {
        report.error = String(error.message ?? error);
        process.exitCode = 1;
    } finally {
        await browser?.close();
        await server.close();
        fs.writeFileSync(dest, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
