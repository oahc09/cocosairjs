const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');

const root = path.resolve(__dirname, '../..');
const arg = (name) => process.argv.find((value) => value.startsWith('--' + name + '='))?.split('=').slice(1).join('=');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fixture = path.join(root, 'test/fixtures/gltf-texture-direction/main.ts');

async function main () {
    const bundle = arg('bundle'); assert(bundle, '--bundle=<fresh bundle> required');
    const engine = arg('engine') || 'webkit';
    const output = arg('out'); assert(output && !fs.existsSync(output), '--out=<new report> required');
    const files = [bundle, fixture, __filename, path.join(root, 'src/air/assets/gltf/material.ts')];
    const fingerprints = Object.fromEntries(files.map((file) => [path.relative(root, file), hash(file)]));
    const built = await require('esbuild').build({ entryPoints: [fixture], bundle: true, write: false, format: 'esm',
        platform: 'browser', target: 'es2022', external: ['cocosair', '/build/*'] });
    const server = await startExampleServer(root);
    let browser;
    let result;
    const errors = [];
    let failure;
    try {
        browser = await require('playwright')[engine].launch({ headless: true, ...launchOptions(engine) });
        const page = await browser.newPage({ viewport: { width: 480, height: 360 } });
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.route('**/gltf-texture-direction/main.ts', (route) => route.fulfill({ contentType: 'text/javascript', body: built.outputFiles[0].text }));
        await page.route('**/build/cocosair.module.js', (route) => route.fulfill({ contentType: 'text/javascript', path: bundle }));
        await page.goto(server.origin + '/test/fixtures/gltf-texture-direction/');
        await page.waitForFunction(() => window.__gltfTextureDirection?.ready, null, { timeout: 30000 });
        result = await page.evaluate(() => window.__gltfTextureDirection.dedup());
        assert.equal(result.control.uploads, 1);
        assert.equal(result.shared.uploads, 2);
        assert.equal(result.control.unique, 1);
        assert.equal(result.shared.unique, 2);
        assert.equal(result.shared.aliases, 1);
        assert.equal(result.shared.indices, 101);
        assert(result.control.allLive && result.shared.allLive && result.distinctFromControl);
        assert(result.handlesReleased && result.lifecycleClean && result.deletedExactlyOnce);
        const colorBits = result.control.pixels.map(([r, g, b, a]) => {
            assert.equal(a, 255);
            return [r, g, b].map((value) => value > 180 ? 1 : value < 30 ? 0 : -1).join('');
        });
        assert.deepEqual(colorBits, ['100', '010', '001', '110']);
        assert.deepEqual(result.shared.pixels, result.control.pixels);
        assert.equal(result.glError, 0);
        assert.deepEqual([...result.errors, ...errors], []);
        for (const file of files) assert.equal(hash(file), fingerprints[path.relative(root, file)], 'source drift: ' + file);
    } catch (error) {
        failure = String(error.stack || error);
    } finally {
        await browser?.close();
        await server.close();
    }
    fs.writeFileSync(output, JSON.stringify({ status: failure ? 'FAIL' : 'PASS', engine, version: browser?.version(),
        fingerprints, result, errors, failure, limitations: ['WebGL2 finite authored colors, not WebGPU or a GPU memory benchmark'] }, null, 2) + '\n', { flag: 'wx' });
    if (failure) throw new Error(failure);
    console.log(JSON.stringify(result));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
