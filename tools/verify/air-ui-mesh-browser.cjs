const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
async function main() {
    assert(process.argv[2]?.startsWith('--out='), '--out=<new.json> required');
    const output = path.resolve(root, process.argv[2].slice(6)); assert(!fs.existsSync(output), 'new report required');
    const artifacts = output.replace(/\.json$/, '-artifacts'); fs.mkdirSync(artifacts, { recursive: true });
    const files = ['src/air/ui-mesh.ts', 'src/air/index.ts', 'build/cocosair.module.js',
        'test/fixtures/ui-mesh/main.ts', 'test/fixtures/ui-mesh/index.html', 'tools/verify/air-ui-mesh-browser.cjs'];
    const fingerprints = Object.fromEntries(files.map((file) => [file, hash(file)])), results = [], startedAt = new Date().toISOString();
    const server = await startExampleServer(root), playwright = require('playwright');
    try {
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            let browser;
            try {
                browser = await playwright[engine].launch({ ...launchOptions(engine), headless: true });
                const page = await browser.newPage({ viewport: { width: 480, height: 360 } }), errors = [];
                page.on('pageerror', (error) => errors.push(String(error)));
                await page.goto(server.origin + '/test/fixtures/ui-mesh/'); await page.waitForFunction(() => window.__uiMeshProbe?.ready);
                const observations = [];
                for (const mode of ['initial', 'changed', 'reenabled', 'material']) observations.push(await page.evaluate((m) => window.__uiMeshProbe.render(m), mode));
                const screenshot = path.join(artifacts, engine + '.png'); await page.screenshot({ path: screenshot });
                const release = await page.evaluate(() => window.__uiMeshProbe.release());
                console.error('[ui-mesh-observation] ' + JSON.stringify({ engine, observations, release }));
                const initial = observations[0];
                assert(initial.center[1] > 180 && initial.center[0] < 80, 'later Sprite overlays mesh');
                assert(initial.redTriangle[0] > 180 && initial.redTriangle[1] < 80, 'mesh overlays earlier Sprite');
                assert(observations[1].redTriangle[0] < 80, 'geometry mutation changes actual pixels');
                assert.deepEqual(observations[2].redTriangle, observations[1].redTriangle, 're-enable preserves updated geometry');
                assert(observations[3].customColor[2] > 180 && observations[3].customColor[0] < 80, 'custom UI material and color dirtiness');
                for (const o of observations) {
                    assert(o.maskInside[0] > 180 && o.maskInside[1] < 80, 'triangle inside native Mask');
                    assert(o.maskOutside[0] < 80, 'native stencil clips outside');
                    assert(o.opacity[0] > 100 && o.opacity[0] < 160, 'native cascaded opacity');
                    assert.deepEqual(o.errors, []);
                    assert.equal(o.materialCurrent, true, 'render data follows current material');
                    assert.deepEqual(o.uvMesh, o.uvSprite, 'rotated asymmetric frame matches native Sprite UV');
                    assert.equal(new Set(o.uvMesh.map((color) => color.join(','))).size, 4, 'four distinct UV quadrants');
                    assert(o.batches.some((batch) => batch.indices === 15), 'two Sprites and triangle share a native batch');
                }
                assert.equal(release.receipt.status, 'released'); assert.equal(release.disposed, true);
                assert.equal(release.frameRefs, 1); assert.equal(release.textureRefs, 1);
                assert.equal(release.frameValid, true); assert.equal(release.textureValid, true); assert.deepEqual(errors, []);
                results.push({ engine, status: 'PASS', browserVersion: browser.version(), observations, release, screenshot: path.relative(root, screenshot) });
            } catch (error) { results.push({ engine, status: 'FAIL', error: String(error.stack || error) }); }
            finally { if (browser) await browser.close(); }
            console.error('[ui-mesh] ' + JSON.stringify(results.at(-1)));
        }
        files.forEach((file) => assert.equal(hash(file), fingerprints[file], 'candidate drift: ' + file));
        const passed = results.length === 3 && results.every((r) => r.status === 'PASS');
        fs.writeFileSync(output, JSON.stringify({ startedAt, endedAt: new Date().toISOString(), command: process.argv, cwd: root,
            scope: ['PG-11 native UI mesh Sprite ordering, Mask clipping, opacity, geometry mutation, re-enable and shared asset release'],
            subset: true, completed: false, scopePassed: passed, fingerprints, results }, null, 2) + '\n', { flag: 'wx' });
        process.exitCode = passed ? 0 : 1;
    } finally { await server.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
