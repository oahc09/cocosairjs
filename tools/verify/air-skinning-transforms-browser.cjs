const assert = require('node:assert/strict'),
    fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs'),
    { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..'),
    hash = (f) =>
        crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(root, f)))
            .digest('hex');
async function main() {
    const out = process.argv.find((v) => v.startsWith('--out='));
    assert(out, '--out required');
    const output = path.resolve(root, out.slice(6));
    assert(!fs.existsSync(output), 'new report required');
    const bundle = process.argv.find((v) => v.startsWith('--bundle='))?.slice(9) ?? 'build/cocosair.module.js';
    assert(path.resolve(root, bundle).startsWith(root + path.sep), 'bundle inside repository');
    const startedAt = new Date().toISOString(),
        files = [
            bundle,
            'src/cocos/3d/skeletal-animation/skeletal-animation-state.ts',
            'src/cocos/3d/models/skinning-model.ts',
            'src/cocos/3d/models/skinning-validation.ts',
            'src/cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer.ts',
            'test/fixtures/skinning-transforms/main.ts',
            'test/fixtures/skinning-transforms/index.html',
            'tools/debug/skinning-inspector.ts',
            'tools/verify/air-skinning-transforms-browser.cjs',
        ],
        fingerprints = Object.fromEntries(files.map((f) => [f, hash(f)]));
    const built = await require('esbuild').build({
        entryPoints: [path.join(root, 'test/fixtures/skinning-transforms/main.ts')],
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'esm',
        target: 'es2022',
        alias: { cocosair: '/' + bundle },
        external: ['/' + bundle],
    });
    const server = await startExampleServer(root),
        pw = require('playwright'),
        results = [],
        artifacts = output.replace(/\.json$/, '-artifacts');
    fs.mkdirSync(artifacts, { recursive: true });
    try {
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            let browser;
            const transforms = [],
                clips = [],
                lifecycle = [];
            try {
                browser = await pw[engine].launch({ ...launchOptions(engine), headless: true });
                const page = await browser.newPage({ viewport: { width: 480, height: 360 } }),
                    pageErrors = [];
                page.on('pageerror', (e) => pageErrors.push(String(e)));
                await page.route('**/main.ts', (route) =>
                    route.fulfill({ contentType: 'text/javascript', body: built.outputFiles[0].text }),
                );
                await page.goto(server.origin + '/test/fixtures/skinning-transforms/');
                await page.waitForFunction(() => window.__skinTransforms?.ready, null, { timeout: 60000 });
                const cases = [
                    { target: 'root', translation: [0.4, 0.3, 0] },
                    { target: 'root', rotation: [0, 0, 30] },
                    { target: 'root', scale: [1.6, 0.7, 1], lit: true },
                    { target: 'root', scale: [-1, 1, 1], lit: true },
                    { target: 'ancestor', scale: [1.6, 0.7, 1], rotation: [0, 0, -15], lit: true },
                    { target: 'ancestor', scale: [-1, 1, 1], lit: true },
                    { target: 'root', rotation: [0, 180, 0], lit: true },
                    { target: 'smr', translation: [4, 4, 0], rotation: [0, 0, 75], scale: [-2, 0.4, 1] },
                    {
                        target: 'root',
                        bonePosition: [0.4, 0.3, 0],
                        boneRotation: [0, 0, 35],
                        boneScale: [1.3, 0.6, 1],
                        bindpose: true,
                    },
                    { target: 'root', scale: [-1, 1, 1], cull: true },
                ];
                for (const baked of [false, true])
                    for (const options of cases) {
                        const sample = await page.evaluate((o) => window.__skinTransforms.transformCase(o), {
                            baked,
                            ...options,
                        });
                        transforms.push(sample);
                        console.error(JSON.stringify({ engine, sample }));
                        assert.deepEqual(sample.errors, []);
                        assert(sample.released.every((v) => !v));
                        if (options.cull) {
                            assert.equal(sample.actual.count, 0, 'mirrored backface must be culled');
                            assert.equal(sample.expected.count, 0);
                        } else {
                            assert(sample.actual.count > 100);
                            assert(sample.expected.count > 100);
                            assert(
                                Math.abs(sample.actual.count - sample.expected.count) <
                                    Math.max(10, sample.expected.count * 0.02),
                                'position coverage differs',
                            );
                            for (let c = 0; c < 2; c++)
                                assert(
                                    Math.abs(sample.actual.centroid[c] - sample.expected.centroid[c]) < 1,
                                    'position centroid differs',
                                );
                        }
                        if (sample.lighting)
                            for (let c = 0; c < 3; c++)
                                assert(
                                    Math.abs(sample.lighting.actual[c] - sample.lighting.expected[c]) < 3,
                                    'inverse transpose lighting differs',
                                );
                        assert.equal(sample.inspection.requestedMode, baked ? 'BAKED' : 'AUTO_REALTIME');
                        assert.equal(sample.inspection.transport, baked ? 'BAKED_TEXTURE' : 'REALTIME_UNIFORM');
                    }
                for (const baked of [false, true]) {
                    const sample = await page.evaluate((b) => window.__skinTransforms.clipCase(b), baked);
                    clips.push(sample);
                    console.error(JSON.stringify({ engine, clip: sample }));
                    assert.deepEqual(sample.errors, []);
                    assert(sample.released.every((v) => !v));
                    assert(sample.first.count > 100);
                    assert(sample.middle.centroid[0] > sample.first.centroid[0] + 15);
                    assert(Math.abs(sample.paused.centroid[0] - sample.middle.centroid[0]) < 1);
                    assert.equal(sample.paused.time, 0.5);
                    assert(sample.resumed.time > 0.5);
                    assert(sample.resumed.centroid[0] > sample.middle.centroid[0] + 5);
                    assert(Math.abs(sample.switched.centroid[0] - sample.middle.centroid[0]) < 2);
                    assert.equal(sample.after.requestedMode, baked ? 'REALTIME' : 'BAKED');
                    assert.notEqual(sample.before.effectiveModel, sample.after.effectiveModel);
                }
                const orders = [
                    ['mesh', 'skeleton', 'root'],
                    ['mesh', 'root', 'skeleton'],
                    ['skeleton', 'mesh', 'root'],
                    ['skeleton', 'root', 'mesh'],
                    ['root', 'mesh', 'skeleton'],
                    ['root', 'skeleton', 'mesh'],
                ];
                for (const live of [true, false])
                    for (const mode of ['none', 'realtime', 'baked', 'disabledBaked'])
                        for (const enabled of [false, true])
                            for (const order of orders) {
                                const sample = await page.evaluate((o) => window.__skinTransforms.lifecycleCase(o), {
                                    mode,
                                    enabled,
                                    order,
                                    live,
                                });
                                lifecycle.push(sample);
                                console.error(JSON.stringify({ engine, lifecycle: sample }));
                                assert.deepEqual(sample.errors, []);
                                assert(sample.released.every((v) => !v));
                                assert(sample.pixels.count > 100);
                                assert.equal(
                                    sample.inspection.transport,
                                    mode === 'baked' ? 'BAKED_TEXTURE' : 'REALTIME_UNIFORM',
                                );
                                assert.equal(sample.inspection.modelTransform, 'Armature');
                                for (const bounds of [sample.inspection.modelBounds, sample.inspection.worldBounds])
                                    assert(bounds && [...bounds.center, ...bounds.halfExtents].every(Number.isFinite));
                            }
                const rebind = await page.evaluate(() => window.__skinTransforms.rebindCase());
                console.error(JSON.stringify({ engine, rebind }));
                assert.deepEqual(rebind.errors, []);
                assert(rebind.released.every((v) => !v));
                assert.equal(rebind.before.transport, 'REALTIME_UNIFORM');
                assert.equal(rebind.middle.transport, 'REALTIME_TEXTURE');
                assert.equal(rebind.after.transport, 'REALTIME_UNIFORM');
                for (const frame of [rebind.texture, rebind.uniform]) {
                    assert(frame.count > 100);
                    assert(frame.centroid[0] > rebind.base.centroid[0] + 25);
                }
                assert(Math.abs(rebind.texture.centroid[0] - rebind.uniform.centroid[0]) < 1);
                const preview = await page.evaluate(() => window.__skinTransforms.preview()),
                    screenshot = path.join(artifacts, engine + '.png');
                await page.screenshot({ path: screenshot });
                const previewReleased = await page.evaluate(() => window.__skinTransforms.releasePreview());
                assert(previewReleased.every((v) => !v));
                assert.deepEqual(pageErrors, []);
                results.push({
                    engine,
                    status: 'PASS',
                    version: browser.version(),
                    transforms,
                    clips,
                    lifecycle,
                    rebind,
                    preview,
                    previewReleased,
                    screenshot: path.relative(root, screenshot),
                    pageErrors,
                });
            } catch (error) {
                results.push({
                    engine,
                    status: 'FAIL',
                    transforms,
                    clips,
                    lifecycle,
                    error: String(error.stack || error),
                });
            } finally {
                await browser?.close();
            }
            console.error(JSON.stringify({ engine, status: results.at(-1).status, error: results.at(-1).error }));
        }
        for (const f of files) assert.equal(hash(f), fingerprints[f], 'candidate drift: ' + f);
        const passed = results.length === 3 && results.every((r) => r.status === 'PASS');
        fs.writeFileSync(
            output,
            JSON.stringify(
                {
                    startedAt,
                    endedAt: new Date().toISOString(),
                    command: process.argv,
                    cwd: root,
                    bundle,
                    fingerprints,
                    method: 'REAL_BROWSER',
                    subset: true,
                    completed: false,
                    scopePassed: passed,
                    scope: [
                        'Realtime/baked TRS and inverse bind rigid GPU reference',
                        'Builtin standard reflected/nonuniform root/ancestor lighting',
                        'Native clip seek/pause/resume and public mode preference',
                        '96 public lifecycle assignment/enabled/animation combinations per browser, before/after scene activation',
                        'Live uniform to texture to uniform descriptor/macro rebinding',
                    ],
                    results,
                    limitations: [
                        'Single-joint normalized float attributes; multijoint blended nonuniform bone normal correctness not asserted',
                        'GPU memory unavailable',
                        'Optional inspector reads pinned private arrays without changing refs or modes',
                    ],
                },
                null,
                2,
            ) + '\n',
            { flag: 'wx' },
        );
        process.exitCode = passed ? 0 : 1;
    } finally {
        await server.close();
    }
}
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
