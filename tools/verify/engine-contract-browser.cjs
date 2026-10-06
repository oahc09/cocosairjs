// Focused native pixels/diagnostics, explicit new output; no build, watcher or browser download.
const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto'),
    assert = require('node:assert/strict');
const { startExampleServer } = require('./competitive-example-server.cjs'),
    { launchOptions } = require('./browser-engines.cjs'),
    { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const root = path.resolve(__dirname, '../..'),
    hash = (f) =>
        crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(root, f)))
            .digest('hex');
async function main() {
    const arg = process.argv.find((v) => v.startsWith('--out='));
    assert(arg, '--out=<new.json> required');
    const out = path.resolve(root, arg.slice(6));
    assert(!fs.existsSync(out), 'refusing existing report');
    const engineArg = process.argv.find((v) => v.startsWith('--browser='))?.slice(10) || 'all';
    assert(['all', 'chromium', 'firefox', 'webkit'].includes(engineArg));
    const artifacts = out.slice(0, -5) + '-artifacts';
    fs.mkdirSync(artifacts, { recursive: true });
    const files = [
        'build/cocosair.module.js',
        'src/cocos/3d/assets/mesh.ts',
        'src/cocos/3d/misc/create-mesh.ts',
        'src/cocos/3d/misc/mesh-validation.ts',
        'src/cocos/render-scene/scene/fog.ts',
        'src/cocos/scene-graph/node.ts',
        'src/cocos/scene-graph/node-transform-validation.ts',
        'src/cocos/animation/animation-component.ts',
        'src/cocos/render-scene/core/render-scene.ts',
        'src/air/rendering/engine-contracts.ts',
        'tools/debug/probes/engine-contracts/main.js',
        'tools/debug/probes/engine-contracts/index.html',
        'tools/verify/engine-contract-browser.cjs',
    ];
    const fingerprints = Object.fromEntries(files.map((f) => [f, hash(f)])),
        server = await startExampleServer(root),
        pw = require('playwright'),
        results = [];
    try {
        for (const engine of engineArg === 'all' ? ['chromium', 'firefox', 'webkit'] : [engineArg]) {
            const options = launchOptions(engine),
                browser = await pw[engine].launch({ ...options, env: loopbackBrowserEnv(), headless: true });
            const checks = [],
                errors = [],
                images = [];
            const check = (name, detail, fn) => {
                try {
                    fn();
                    checks.push({ name, ok: true, detail });
                } catch (e) {
                    checks.push({ name, ok: false, detail });
                    throw e;
                }
            };
            try {
                const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
                page.on('pageerror', (e) => errors.push(e.message));
                page.on('console', (e) => {
                    if (e.type() === 'error') errors.push(e.text());
                });
                await page.goto(server.origin + '/tools/debug/probes/engine-contracts/');
                await page.waitForFunction(() => window.__engineContracts);
                const snap = () => page.evaluate(() => window.__engineContracts.snapshot()),
                    step = () => page.evaluate(() => window.__engineContracts.frame());
                const capture = async (name) => {
                    const url = await page.evaluate(() => document.getElementById('GameCanvas').toDataURL());
                    const data = Buffer.from(url.split(',')[1], 'base64'),
                        file = path.join(artifacts, engine + '-' + name + '.png');
                    fs.writeFileSync(file, data);
                    images.push({
                        file: path.relative(root, file).replace(/\\/g, '/'),
                        sha256: crypto.createHash('sha256').update(data).digest('hex'),
                        method: 'CANVAS_NATIVE',
                    });
                };
                const red = await snap();
                check('vertex color reaches actual GPU output', red, () => {
                    assert(red.pixel[0] > red.pixel[1] + 80);
                    assert.equal(red.error, 0);
                    assert.equal(red.material.passes[0].reflection, 'webgl-active');
                    assert(red.material.passes[0].activeAttributes.includes('a_color'));
                });
                await capture('red');
                await page.evaluate(() => window.__engineContracts.green());
                await step();
                const green = await snap();
                check('color-only update retains indices and renders green', green, () => {
                    assert(green.pixel[1] > green.pixel[0] + 80);
                    assert.deepEqual(green.indices, red.indices);
                    assert.equal(green.error, 0);
                });
                await capture('green');
                await page.evaluate(() => window.__engineContracts.uvOnly());
                await step();
                const uv = await snap();
                check('UV-only update preserves normals and triangle connectivity', uv, () => {
                    assert.equal(uv.uv[0], 0.25);
                    assert.deepEqual(uv.normals, red.normals);
                    assert.deepEqual(uv.indices, red.indices);
                    assert(uv.pixel[1] > uv.pixel[0] + 80);
                });
                const invalid = await page.evaluate(() => window.__engineContracts.invalid());
                check('invalid index rejects before mutation', invalid, () => {
                    assert.equal(invalid.code, 'AIR_E_MESH_INDEX_RANGE');
                    assert(invalid.unchanged);
                });
                await page.evaluate(() => window.__engineContracts.vertexOff());
                await step();
                const white = await snap();
                check('disabled vertex macro diagnosed with actual color difference', white, () => {
                    assert(white.pixel[0] > 100 && white.pixel[1] > 100);
                    assert(white.material.issues.some((i) => i.code === 'AIR_W_VERTEX_COLOR_DISABLED'));
                });
                await capture('vertex-disabled');
                await page.evaluate(() => window.__engineContracts.negative());
                await step();
                const culled = await snap();
                check('negative scale changes native winding and back-face visibility', culled, () => {
                    assert(culled.geometry.negativeScale);
                    assert(culled.pixel[0] < 60 && culled.pixel[1] < 60);
                });
                await capture('culled');
                await page.evaluate(() => window.__engineContracts.noCull());
                await step();
                const visible = await snap();
                check('explicit cull override restores the same geometry', visible, () =>
                    assert(visible.pixel[1] > visible.pixel[0] + 80),
                );
                await capture('no-cull');
                const scale = await page.evaluate(() => window.__engineContracts.badScale());
                check('invalid JS scale is rejected before matrix poisoning', scale, () => {
                    assert.equal(scale.code, 'AIR_E_NODE_TRANSFORM');
                    assert(scale.unchanged);
                });
                const fogConfig = await page.evaluate(() => window.__engineContracts.fog(true));
                await step();
                const fog = await snap();
                check(
                    'disabled-first fog configuration activates correct shader and visible pixels',
                    { fogConfig, fog },
                    () => {
                        assert.equal(fogConfig.type, 0);
                        assert.equal(fogConfig.macro, 0);
                        assert(fog.pixel[2] > visible.pixel[2] + 30);
                        assert.equal(fog.error, 0);
                    },
                );
                await capture('fog');
                const offConfig = await page.evaluate(() => window.__engineContracts.fog(false));
                await step();
                const off = await snap();
                check('disabled fog is effective NONE while config remains reusable', { offConfig, off }, () => {
                    assert.equal(offConfig.type, 4);
                    assert.equal(offConfig.macro, 4);
                    assert(off.pixel[1] > off.pixel[0] + 80);
                });
                const lights = await page.evaluate(() => window.__engineContracts.lights());
                check('main light removal and extra-light warning preserve native selection', lights, () => {
                    assert.equal(lights.first.ordinaryDirectionalCapacity, 1);
                    assert.equal(lights.first.lights.length, 2);
                    assert(lights.first.mainLight !== lights.after.mainLight);
                    assert.equal(lights.after.lights.length, 1);
                });
                const final = await snap();
                check('warning channel identifies ordinary directional limit', final.diagnostics, () =>
                    assert(final.diagnostics.some((i) => i.message.includes('AIR_W_DIRECTIONAL_LIGHT_LIMIT'))),
                );
                const receipt = await page.evaluate(() => window.__engineContracts.dispose());
                check('native resources and scene release return successful receipt', receipt, () =>
                    assert.equal(receipt.status, 'released'),
                );
                check('no console/page errors', errors, () => assert.deepEqual(errors, []));
                results.push({
                    engine,
                    version: browser.version(),
                    executable: options.executablePath,
                    status: 'PASS',
                    checks,
                    images,
                });
            } catch (error) {
                results.push({
                    engine,
                    version: browser.version(),
                    executable: options.executablePath,
                    status: 'FAIL',
                    checks,
                    images,
                    errors,
                    error: String(error),
                });
            } finally {
                await browser.close();
            }
        }
        for (const f of files) assert.equal(hash(f), fingerprints[f], 'candidate drift: ' + f);
        const scopePassed = results.every((r) => r.status === 'PASS');
        fs.writeFileSync(
            out,
            JSON.stringify(
                {
                    schema: 'air-engine-contract-proof/1',
                    measuredAt: new Date().toISOString(),
                    command: process.argv,
                    playwright: require('playwright/package.json').version,
                    scope: 'ENG-01..09 focused native pixel and diagnostic contracts',
                    captureMethod: 'CANVAS_NATIVE',
                    pageCompositorVerified: false,
                    completed: true,
                    subset: engineArg !== 'all',
                    fullGalleryVerified: false,
                    scopePassed,
                    fingerprints,
                    results,
                },
                null,
                2,
            ) + '\n',
            { flag: 'wx' },
        );
        process.exitCode = scopePassed ? 0 : 1;
    } finally {
        await server.close();
    }
}
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
