const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
async function main() {
    assert(process.argv[2]?.startsWith('--out='), '--out=<new.json> required');
    const output = path.resolve(root, process.argv[2].slice(6)); assert(!fs.existsSync(output), 'new report required');
    const artifacts = output.replace(/\.json$/, '-artifacts'); fs.mkdirSync(artifacts, { recursive: true });
    const files = ['src/cocos/particle/billboard.ts', 'src/air/index.ts', 'build/cocosair.module.js',
        'test/fixtures/billboard/main.ts', 'test/fixtures/billboard/index.html', 'tools/verify/air-billboard-browser.cjs'];
    const fingerprints = Object.fromEntries(files.map((file) => [file, hash(file)])), results = [], startedAt = new Date().toISOString();
    const server = await startExampleServer(root), playwright = require('playwright');
    try {
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            let browser;
            try {
                browser = await playwright[engine].launch({ ...launchOptions(engine), headless: true });
                const page = await browser.newPage({ viewport: { width: 480, height: 360 } }), errors = [];
                page.on('pageerror', (error) => errors.push(String(error)));
                await page.goto(server.origin + '/test/fixtures/billboard/'); await page.waitForFunction(() => window.__billboardProbe?.ready);
                const observations = [];
                for (const angle of [0, Math.PI / 4, Math.PI / 2]) observations.push(await page.evaluate((a) => window.__billboardProbe.render(a), angle));
                const rotated = await page.evaluate(() => window.__billboardProbe.render(Math.PI / 4, 90));
                const lifecycle = await page.evaluate(() => window.__billboardProbe.lifecycle());
                const screenshot = path.join(artifacts, engine + '.png'); await page.screenshot({ path: screenshot });
                const release = await page.evaluate(() => window.__billboardProbe.release());
                console.error('[billboard-observation] ' + JSON.stringify({ engine, observations, rotated, lifecycle, release }));
                observations.forEach((o) => { assert(o.count > 3000 && o.red > 1000 && o.green > 1000); assert(o.modelAttached); });
                observations.forEach((o) => { assert(Math.abs(o.width - observations[0].width) <= 2); assert(Math.abs(o.height - observations[0].height) <= 2); });
                assert(Math.abs(rotated.width - observations[0].height) <= 2); assert(Math.abs(rotated.height - observations[0].width) <= 2);
                assert.equal(lifecycle.disabled.count, 0); assert.equal(lifecycle.disabled.modelAttached, false);
                assert.equal(lifecycle.enabled.count, observations[0].count);
                assert(Math.abs(lifecycle.resized.width - observations[0].width / 2) <= 1);
                assert(Math.abs(lifecycle.resized.height - observations[0].height * 2) <= 1); assert.equal(lifecycle.technique, 0);
                assert.equal(release.receipt.status, 'released'); assert.equal(release.modelAttached, false);
                assert.equal(release.meshValid, false); assert.equal(release.materialValid, false); assert.equal(release.textureValid, true);
                assert.deepEqual(errors, []);
                results.push({ engine, status: 'PASS', browserVersion: browser.version(), observations, rotated, lifecycle, release, screenshot: path.relative(root, screenshot) });
            } catch (error) { results.push({ engine, status: 'FAIL', error: String(error.stack || error) }); }
            finally { if (browser) await browser.close(); }
            console.error('[billboard] ' + JSON.stringify(results.at(-1)));
        }
        files.forEach((file) => assert.equal(hash(file), fingerprints[file], 'candidate drift: ' + file));
        const passed = results.length === 3 && results.every((r) => r.status === 'PASS');
        fs.writeFileSync(output, JSON.stringify({ startedAt, endedAt: new Date().toISOString(), command: process.argv, cwd: root,
            scope: ['PG-25 native Billboard three camera angles, rotation, resize, disable/re-enable, technique clamp and scene release'],
            subset: true, completed: false, scopePassed: passed, fingerprints, results }, null, 2) + '\n', { flag: 'wx' });
        process.exitCode = passed ? 0 : 1;
    } finally { await server.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
