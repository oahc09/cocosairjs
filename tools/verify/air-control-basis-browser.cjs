const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..'), hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
async function main() {
    assert(process.argv[2]?.startsWith('--out='), '--out=<new.json> required');
    const output = path.resolve(root, process.argv[2].slice(6)); assert(!fs.existsSync(output), 'new report required');
    const artifacts = output.replace(/\.json$/, '-artifacts'); fs.mkdirSync(artifacts, { recursive: true });
    const files = ['build/cocosair.module.js', 'src/cocos/misc/camera-component.ts', 'src/cocos/render-scene/scene/camera.ts',
        'test/fixtures/control-basis/main.ts', 'test/fixtures/control-basis/index.html', 'tools/verify/air-control-basis-browser.cjs'];
    const fingerprints = Object.fromEntries(files.map((file) => [file, hash(file)])), results = [], startedAt = new Date().toISOString();
    const server = await startExampleServer(root), playwright = require('playwright');
    try {
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            let browser;
            try {
                browser = await playwright[engine].launch({ ...launchOptions(engine), headless: true });
                const page = await browser.newPage({ viewport: { width: 640, height: 480 } }), errors = [];
                page.on('pageerror', (e) => errors.push(String(e)));
                await page.goto(server.origin + '/test/fixtures/control-basis/'); await page.waitForFunction(() => window.__basisProbe?.ready);
                const samples = [];
                for (const angle of [0, Math.PI / 4, Math.PI / 2]) {
                    const result = await page.evaluate((a) => window.__basisProbe.sample(a), angle); samples.push(result);
                    console.error('[basis-observation] ' + JSON.stringify({ engine, angle, result }));
                    assert.equal(result.cameraDefaultWidth, 0, 'ordinary camera retains automatic aspect');
                    result.observations.forEach((o) => {
                        // Native 3D color passes through the existing tone mapping; test distinct color channels, not an unlit byte identity.
                        for (let i = 0; i < 3; i++) assert(o.color[i] ? o.pixel[i] > 180 : o.pixel[i] < 30, o.id + ' native projected marker color');
                        assert.equal(o.pixel[3], 255);
                    });
                    const [world, vehicle, forward, right] = result.observations;
                    assert(Math.abs(vehicle.direction[0] + 1) < 1e-6 && Math.abs(vehicle.direction[2]) < 1e-6, 'Euler yaw is degrees and local forward is -Z');
                    assert(Math.abs(forward.projectedDelta[0]) < .01 && forward.projectedDelta[1] > 50, 'screen forward remains screen-up');
                    assert(right.projectedDelta[0] > 100 && Math.abs(right.projectedDelta[1]) < .01, 'screen right remains screen-right');
                    if (angle === 0) { assert(world.projectedDelta[1] > 50); assert(vehicle.projectedDelta[0] < -100); }
                    if (angle === Math.PI / 2) { assert(world.projectedDelta[0] > 100); assert(vehicle.projectedDelta[1] > 50); }
                }
                const screenshot = path.join(artifacts, engine + '.png'); await page.screenshot({ path: screenshot });
                assert.equal((await page.evaluate(() => window.__basisProbe.release())).status, 'released'); assert.deepEqual(errors, []);
                results.push({ engine, status: 'PASS', browserVersion: browser.version(), samples, screenshot: path.relative(root, screenshot) });
            } catch (error) { results.push({ engine, status: 'FAIL', error: String(error.stack || error) }); }
            finally { if (browser) await browser.close(); }
        }
        files.forEach((file) => assert.equal(hash(file), fingerprints[file], 'candidate drift: ' + file));
        const passed = results.length === 3 && results.every((r) => r.status === 'PASS');
        fs.writeFileSync(output, JSON.stringify({ startedAt, endedAt: new Date().toISOString(), command: process.argv, cwd: root,
            scope: ['PG-35 world/vehicle/screen-relative ground-plane controls at three camera yaw angles, actual projected 3D pixels'],
            subset: true, completed: false, scopePassed: passed, fingerprints, results }, null, 2) + '\n', { flag: 'wx' });
        process.exitCode = passed ? 0 : 1;
    } finally { await server.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
