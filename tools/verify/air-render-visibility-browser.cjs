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
            'test/fixtures/render-visibility/main.ts',
            'test/fixtures/render-visibility/index.html',
            'tools/debug/render-visibility.ts',
            'tools/debug/agent-session.ts',
            'tools/debug/skinning-inspector.ts',
            'tools/verify/air-render-visibility-browser.cjs',
        ],
        fingerprints = Object.fromEntries(files.map((f) => [f, hash(f)]));
    const built = await require('esbuild').build({
        entryPoints: [path.join(root, 'test/fixtures/render-visibility/main.ts')],
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
            let browser, observation;
            try {
                browser = await pw[engine].launch({ ...launchOptions(engine), headless: true });
                const page = await browser.newPage({ viewport: { width: 480, height: 360 } }),
                    pageErrors = [];
                page.on('pageerror', (e) => pageErrors.push(String(e)));
                await page.route('**/main.ts', (route) =>
                    route.fulfill({ contentType: 'text/javascript', body: built.outputFiles[0].text }),
                );
                await page.goto(server.origin + '/test/fixtures/render-visibility/');
                await page.waitForFunction(() => window.__visibility?.ready, null, { timeout: 60000 });
                observation = await page.evaluate(() => window.__visibility.run());
                console.error(JSON.stringify({ engine, observation }));
                const expected = {
                    default: 'PASSES_OBSERVED_FILTERS',
                    wrongMask: 'LAYER_MASK',
                    wrongLayer: 'LAYER_MASK',
                    modelFlagOverride: 'PASSES_OBSERVED_FILTERS',
                    outsideFrustum: 'FRUSTUM',
                    cameraDisabled: 'CAMERA_DISABLED',
                    rendererDisabled: 'MODEL_DISABLED',
                    restored: 'PASSES_OBSERVED_FILTERS',
                };
                for (const row of observation.cases) {
                    assert.deepEqual(row.first, row.second);
                    assert(row.sameModel);
                    assert.deepEqual(row.refsBefore, row.refsAfter);
                    assert.deepEqual(row.errors, []);
                    assert.deepEqual(row.toolErrors, []);
                    const main = row.first.cameras.find((c) => c.camera === 'MainCamera');
                    assert.equal(main.reason, expected[row.kind]);
                    if (main.reason === 'PASSES_OBSERVED_FILTERS') assert(row.pixels > 100);
                    else assert.equal(row.pixels, 0);
                    if (row.kind === 'modelFlagOverride') {
                        assert.equal(main.nodeIncluded, false);
                        assert.equal(main.modelIncluded, true);
                    }
                }
                assert.deepEqual(observation.diagnostics, []);
                assert.deepEqual(observation.toolErrors, []);
                assert.deepEqual(pageErrors, []);
                const screenshot = path.join(artifacts, engine + '.png');
                await page.screenshot({ path: screenshot });
                const release = await page.evaluate(() => window.__visibility.release());
                assert.equal(release.receipt.status, 'released');
                assert(release.valid.every((v) => !v));
                results.push({
                    engine,
                    status: 'PASS',
                    version: browser.version(),
                    observation,
                    release,
                    pageErrors,
                    screenshot: path.relative(root, screenshot),
                });
            } catch (error) {
                results.push({ engine, status: 'FAIL', observation, error: String(error.stack || error) });
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
                        'Optional native layer/model flag OR, AABB-frustum and enabled/attachment diagnostics matched to actual GPU visibility',
                    ],
                    results,
                    limitations: [
                        'No LOD/occlusion/shader/material/deployment draw inference',
                        'GPU memory unavailable',
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
