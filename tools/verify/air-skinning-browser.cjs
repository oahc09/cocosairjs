const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const esbuild = require('esbuild');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { collectSnapshot } = require('./port-gap-candidate-snapshot.cjs');
const root = path.resolve(__dirname, '../..');
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
async function main() {
    const args = process.argv.slice(2), out = args.find((arg) => arg.startsWith('--out='))?.slice(6);
    if (!out || args.some((arg) => !arg.startsWith('--out='))) throw new Error('usage: node tools/verify/air-skinning-browser.cjs --out=<new.json>');
    const output = path.resolve(root, out);
    if (fs.existsSync(output)) throw new Error('report exists; choose a new path');
    const startedAt = new Date().toISOString(), candidate = collectSnapshot();
    const files = ['src/cocos/3d/assets/mesh.ts', 'src/cocos/3d/models/skinning-model.ts',
        'src/cocos/3d/models/baked-skinning-model.ts', 'src/cocos/3d/models/skinning-validation.ts',
        'test/fixtures/skinning/geometry.ts', 'test/fixtures/skinning-browser/main.ts',
        'tools/verify/air-skinning-browser.cjs', 'build/cocosair.module.js'];
    const fingerprints = Object.fromEntries(files.map((file) => [file, sha(file)]));
    const artifactDir = output.replace(/\.json$/, '') + '-artifacts';
    fs.mkdirSync(artifactDir, { recursive: true });
    const built = await esbuild.build({ entryPoints: [path.join(root, 'test/fixtures/skinning-browser/main.ts')],
        bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022', external: ['cocosair'],
        plugins: [{ name: 'fixture-native-entry', setup(build) {
            build.onResolve({ filter: /^\.\.\/\.\.\/\.\.\/src$/ }, () => ({ path: 'cocosair', external: true }));
        } }] });
    const server = await startExampleServer(root), results = [];
    try {
        const playwright = require('playwright');
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            let browser, stage = 'infrastructure';
            try {
                if (engine === 'webkit') assert(fs.existsSync(playwright.webkit.executablePath()), 'matching WebKit required');
                browser = await playwright[engine].launch({ ...launchOptions(engine), headless: true });
                const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
                const pageErrors = []; page.on('pageerror', (error) => pageErrors.push(String(error)));
                await page.route('**/test/fixtures/skinning-browser/main.ts', (route) => route.fulfill({
                    contentType: 'text/javascript', body: built.outputFiles[0].text }));
                await page.goto(`${server.origin}/test/fixtures/skinning-browser/`);
                await page.waitForFunction(() => window.__skinningProbe?.ready, null, { timeout: 30000 });
                stage = 'engine';
                for (const baked of [false, true]) {
                    const samples = [];
                    const cases = [{ target: 'none', scale: 1, cull: false },
                        { target: 'none', scale: 1, cull: false, boneX: 1 },
                        ...['smr', 'root', 'ancestor'].flatMap((target) => [1.5, -1].map((scale) => ({ target, scale, cull: false }))),
                        { target: 'root', scale: -1, cull: true }];
                    for (const options of cases) {
                        const sample = await page.evaluate((options) => window.__skinningProbe.renderCase(options), { baked, ...options });
                        console.error('[air-skinning-sample] ' + JSON.stringify({ engine, ...sample }));
                        const stem = `${engine}-${baked ? 'baked' : 'realtime'}-${samples.length}`;
                        const screenshot = path.join(artifactDir, stem + '.png');
                        await page.screenshot({ path: screenshot });
                        sample.screenshot = path.relative(root, screenshot).replace(/\\/g, '/'); samples.push(sample);
                        assert.equal(sample.paused, true); assert.equal(sample.transform, 'Armature');
                        assert.deepEqual(sample.errors, []); assert.deepEqual(pageErrors, []);
                        for (const bound of [sample.modelBounds, sample.worldBounds]) {
                            assert(bound, 'model and world bounds exist');
                            assert([...bound.center, ...bound.halfExtents].every(Number.isFinite), 'finite bounds');
                        }
                        if (!options.cull) assert(sample.pixels.count > 100, 'paused first render must show the weighted triangle');
                    }
                    const base = samples[0], posed = samples[1];
                    assert(posed.pixels.centroid[0] > base.pixels.centroid[0] + 20, 'current joint pose affects first render');
                    for (const sample of samples.slice(2, 8)) {
                        const factor = sample.options.target === 'smr' ? 1 : sample.options.scale;
                        assert(Math.abs(sample.worldBounds.center[0] - 0.5 * factor) < 1e-5);
                        assert(Math.abs(sample.worldBounds.halfExtents[0] - 1.5 * Math.abs(factor)) < 1e-5);
                        if (sample.options.target === 'smr') assert.equal(sample.pixels.count, base.pixels.count, 'SMR local TRS does not replace root space');
                        if (factor === -1) assert(sample.pixels.centroid[0] < base.pixels.centroid[0] - 15, 'root/ancestor mirror is visible');
                    }
                    results.push({ engine, baked, status: 'PASS', browserVersion: browser.version(), samples });
                    console.error(`[air-skinning] ${engine}/${baked ? 'baked' : 'realtime'} PASS (${samples.length} GPU cases)`);
                }
                await page.close();
            } catch (error) { results.push({ engine, status: 'FAIL', stage, error: String(error.stack || error) }); }
            finally { if (browser) await browser.close(); }
        }
        for (const file of files) assert.equal(sha(file), fingerprints[file], `candidate drift: ${file}`);
        const completed = results.length === 6 && results.every((entry) => entry.status === 'PASS');
        const report = { startedAt, endedAt: new Date().toISOString(), command: process.argv, cwd: root,
            candidate, fingerprints, scope: ['PG-19 paused first render/default pose', 'PG-20 SMR/root/ancestor signed scale'],
            subset: true, completed, unverified: ['animation clips', 'lighting/normals under reflection', 'joint capacity boundaries', 'full assignment matrix GPU'], results };
        fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify(report, null, 2)); process.exitCode = completed ? 0 : 1;
    } finally { await server.close(); }
}
main().catch((error) => { console.error(String(error.stack || error)); process.exitCode = 1; });
