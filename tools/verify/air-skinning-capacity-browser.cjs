const assert = require('node:assert/strict'),
    fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..'),
    hash = (f) =>
        crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(root, f)))
            .digest('hex');
async function main() {
    const arg = process.argv.find((v) => v.startsWith('--out='));
    assert(arg, '--out=<new.json> required');
    const output = path.resolve(root, arg.slice(6));
    assert(!fs.existsSync(output), 'new report required');
    const bundleArg = process.argv.find((v) => v.startsWith('--bundle='));
    const bundle = bundleArg ? bundleArg.slice(9).replace(/\\/g, '/') : 'build/cocosair.module.js';
    assert(path.resolve(root, bundle).startsWith(root + path.sep), 'bundle must be inside repository');
    const startedAt = new Date().toISOString(),
        files = [
            bundle,
            'src/cocos/3d/models/skinning-model.ts',
            'src/cocos/3d/models/skinning-validation.ts',
            'src/cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer.ts',
            'test/fixtures/skinning-capacity/index.html',
            'test/fixtures/skinning-capacity/main.ts',
            'tools/verify/air-skinning-capacity-browser.cjs',
        ],
        fingerprints = Object.fromEntries(files.map((f) => [f, hash(f)]));
    const built = await require('esbuild').build({
        entryPoints: [path.join(root, 'test/fixtures/skinning-capacity/main.ts')],
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'esm',
        target: 'es2022',
        alias: { cocosair: '/' + bundle },
        external: ['/' + bundle],
    });
    const server = await startExampleServer(root),
        results = [],
        pw = require('playwright');
    try {
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            let browser;
            const samples = [];
            try {
                browser = await pw[engine].launch({ ...launchOptions(engine), headless: true });
                const page = await browser.newPage({ viewport: { width: 480, height: 360 } }),
                    pageErrors = [];
                page.on('pageerror', (e) => pageErrors.push(String(e)));
                await page.route('**/main.ts', (route) =>
                    route.fulfill({ contentType: 'text/javascript', body: built.outputFiles[0].text }),
                );
                await page.goto(server.origin + '/test/fixtures/skinning-capacity/');
                await page.waitForFunction(() => window.__capacity?.ready, null, { timeout: 60000 });
                const capacity = await page.evaluate(() => window.__capacity.uniformCapacity);
                const cases = [
                    [capacity - 1, capacity - 2, false],
                    [capacity, capacity - 1, false],
                    [256, 255, false],
                    [257, 256, false],
                    [300, 299, true],
                    [300, 0, false],
                ];
                for (const [count, joint, mapped] of cases) {
                    const sample = await page.evaluate(
                        ([n, j, m]) => window.__capacity.runCase(n, j, m),
                        [count, joint, mapped],
                    );
                    samples.push(sample);
                    console.error(JSON.stringify({ engine, sample }));
                    if (joint === 256 && !mapped) {
                        assert(
                            sample.diagnostics.some((v) => v.message.includes('AIR_E_SKINNING_CAPACITY')),
                            'lifecycle must report capacity rejection',
                        );
                        assert.deepEqual(
                            sample.paletteCapacity,
                            [],
                            'rejected bind must not allocate truncated transport',
                        );
                        assert.equal(sample.pixels.count, 0);
                        if (sample.failure) assert.equal(sample.failure.code, 'AIR_E_SKINNING_CAPACITY');
                    } else {
                        assert.equal(sample.failure, null);
                        assert(sample.pixels.count > 100, 'weighted last joint must draw');
                        assert(
                            sample.pixels.centroidX > sample.width / 2 + 25,
                            'last joint translation must affect GPU',
                        );
                        assert.deepEqual(sample.diagnostics, []);
                    }
                }
                assert.deepEqual(pageErrors, []);
                results.push({ engine, status: 'PASS', version: browser.version(), capacity, samples, pageErrors });
            } catch (error) {
                results.push({ engine, status: 'FAIL', samples, error: String(error.stack || error) });
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
                    method: 'REAL_BROWSER',
                    scope: [
                        'Realtime weighted uniform/texture palette boundary, segmented local palettes, actionable rejection',
                    ],
                    bundle,
                    subset: true,
                    completed: false,
                    scopePassed: passed,
                    fingerprints,
                    results,
                    limitations: [
                        'Actual device uniform cap and sampled texture format recorded; RGBA8 fallback is not forced',
                        'Native onLoad catches thrown binding errors and reports diagnostics; direct binding throws are separately tested',
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
