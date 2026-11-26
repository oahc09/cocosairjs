/* Browser integration check for the public AssetBank/loadAtlas path. Run after npm run build. */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { resolve } = require('node:path');
const { webkit } = require('playwright');
const { launchOptions } = require('./browser-engines.cjs');

const root = resolve(__dirname, '../..');
const sha = (data) => createHash('sha256').update(data).digest('hex');
const bundle = readFileSync(process.env.AIR_ATLAS_TEST_BUNDLE || resolve(root, 'build/cocosair.module.js'));
const mainPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGNUbXz4nwEPYMInOXwUAACb0AKWuhdOeQAAAABJRU5ErkJggg==', 'base64');
const overridePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGO8nWH6nwEPYMInOXwUAACN2AKHtrYFXAAAAABJRU5ErkJggg==', 'base64');
const marker = 'pictures.v3/page.png?rev=.webp#frame', noSuffix = 'pictures.v3/page?rev=.webp#frame';
const expectedFailure = process.argv.includes('--baseline');
const report = { scope: 'loopback HTTP redirects, native XHR/image decode, public loadAtlas and AssetBank', bundleSha256: sha(bundle), mode: expectedFailure ? 'baseline' : 'fixed', cases: [] };
let requests = [];
const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const send = (status, mime, data) => {
        requests.push({ path: url.pathname + url.search, status });
        res.writeHead(status, { 'Content-Type': mime, 'Cache-Control': 'no-store' }).end(data);
    };
    switch (url.pathname) {
    case '/':
        return send(200, 'text/html', '<meta charset=utf-8><canvas id="game" width="120" height="120"></canvas>');
    case '/runtime.js': return send(200, 'text/javascript', bundle);
    case '/alias/pack.atlas':
        requests.push({ path: url.pathname + url.search, status: 302 });
        return res.writeHead(302, { Location: '/release/v2.1/pack.atlas' + url.search, 'Cache-Control': 'no-store' }).end();
    case '/release/v2.1/pack.atlas':
        return send(200, 'text/plain', (url.searchParams.get('case') === 'suffixless' ? noSuffix : marker) + '\nsize: 8,8\nmarker\n  xy: 0,0\n  size: 2,2\n');
    case '/release/v2.1/pictures.v3/page.png':
    case '/release/v2.1/pictures.v3/page':
        return send(200, 'image/png', mainPng);
    case '/override/pictures.v3/page.png':
        return send(200, 'image/png', overridePng);
    default: return send(404, 'text/plain', 'missing');
    }
});

(async () => {
    let browser;
    try {
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const origin = 'http://127.0.0.1:' + server.address().port;
        browser = await webkit.launch({ ...launchOptions('webkit'), headless: true });
        report.browser = browser.version();
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(origin);
        await page.evaluate(async () => {
            const air = await import('/runtime.js');
            window.air = air;
            window.app = await air.createAirApp({ canvas: '#game' });
            air.assetManager.downloader.maxRetryCount = 0;
        });
        for (const name of ['default', 'explicit', 'direct', 'suffixless', 'custom']) {
            requests = [];
            const result = await page.evaluate(async (name) => {
                const { AssetBank, loadAtlas } = window.air, bank = new AssetBank();
                const url = new URL((name === 'direct' ? '/release/v2.1' : '/alias') + '/pack.atlas?case=' + name, location.href).href;
                let factoryInput;
                if (name === 'custom') window.air.assetManager.factory.register('.atlas', (_id, text, _options, done) => {
                    factoryInput = typeof text;
                    const asset = new window.air.TextAsset();
                    asset.text = text;
                    done(null, asset);
                });
                const options = { bank, ...(name === 'explicit' ? { baseURL: '/override/' } : {}), ...(name === 'suffixless' ? { pageExt: 'png' } : {}) };
                const pixel = (handle) => {
                    const frame = handle.getFrame('marker');
                    if (!frame || frame.rect.width !== 2 || frame.rect.height !== 2) throw new Error('bad frame geometry');
                    const surface = document.createElement('canvas');
                    surface.width = surface.height = 1;
                    const ctx = surface.getContext('2d');
                    ctx.drawImage(handle.textures[0].image.data, 0, 0);
                    return [...ctx.getImageData(0, 0, 1, 1).data];
                };
                const loaded = await Promise.allSettled(Array.from({ length: name === 'default' ? 2 : 1 }, () => loadAtlas(url, options)));
                try {
                    const refs = [bank.size], colors = [];
                    for (const row of loaded) if (row.status === 'fulfilled') {
                        colors.push(pixel(row.value));
                        row.value.dispose();
                        refs.push(bank.size);
                    }
                    return { statuses: loaded.map((r) => r.status), colors, refs, inFlight: bank.inFlightCount,
                        factoryInput, requestedRelease: bank.release(url, 'atlas') };
                } finally {
                    for (const row of loaded) if (row.status === 'fulfilled') row.value.dispose();
                }
            }, name);
            report.cases.push({ name, requests: [...requests], ...result });
            assert.equal(result.inFlight, 0);
            assert.equal(result.requestedRelease, false);
            if (name === 'custom') assert.equal(result.factoryInput, 'string');
            if (expectedFailure && ['default', 'suffixless', 'custom'].includes(name)) {
                assert.deepEqual(result.statuses, Array(name === 'default' ? 2 : 1).fill('rejected'));
                assert.deepEqual(result.refs, [0]);
                assert.ok(requests.some((r) => r.path.startsWith('/alias/pictures.v3/page') && r.status === 404));
            } else {
                const count = name === 'default' ? 2 : 1;
                const color = name === 'explicit' ? [219, 104, 53, 255] : [37, 129, 225, 255];
                assert.deepEqual(result.statuses, Array(count).fill('fulfilled'));
                assert.deepEqual(result.colors, Array(count).fill(color));
                assert.deepEqual(result.refs, count === 2 ? [2, 2, 0] : [2, 0]);
                assert.deepEqual(requests.filter((r) => r.path.includes('/pictures.v3/')),
                    [{ path: (name === 'explicit' ? '/override' : '/release/v2.1') + '/pictures.v3/page' + (name === 'suffixless' ? '' : '.png') + '?rev=.webp', status: 200 }]);
            }
            if (name !== 'direct') {
                assert.equal(requests.filter((r) => r.path === '/alias/pack.atlas?case=' + name && r.status === 302).length, 1);
            }
        }
        requests = [];
        const identities = await page.evaluate(async () => {
            const { AssetBank, loadAtlas } = window.air;
            const bank = new AssetBank();
            const outcomes = await Promise.allSettled(['/alias', '/release/v2.1'].map((dir) => {
                const url = new URL(dir + '/pack.atlas?case=identity', location.href).href;
                return loadAtlas(url, { bank });
            }));
            const refs = [bank.size];
            for (const outcome of outcomes) if (outcome.status === 'fulfilled') {
                outcome.value.dispose();
                refs.push(bank.size);
            }
            return { statuses: outcomes.map((r) => r.status), refs, inFlight: bank.inFlightCount };
        });
        assert.deepEqual(identities, expectedFailure
            ? { statuses: ['rejected', 'fulfilled'], refs: [2, 0], inFlight: 0 }
            : { statuses: ['fulfilled', 'fulfilled'], refs: [3, 2, 0], inFlight: 0 });
        assert.equal(requests.filter((r) => r.status === 200 && r.path === '/release/v2.1/pictures.v3/page.png?rev=.webp').length, 1);
        report.distinctAtlasKeys = identities;
        requests = [];
        const source = await page.evaluate(async () => {
            const url = new URL('/alias/pack.atlas?case=raw', location.href).href;
            const body = await new Promise((ok, fail) => window.air.assetManager.loadAny(
                { url }, { ext: '.atlas', __isNative__: true }, (err, data) => err ? fail(err) : ok(data),
            ));
            return { type: typeof body, body };
        });
        assert.deepEqual(source, { type: 'string', body: marker + '\nsize: 8,8\nmarker\n  xy: 0,0\n  size: 2,2\n' });
        assert.deepEqual(requests.map((r) => r.status), [302, 200]);
        report.rawLoadAny = { type: source.type, requests: [...requests] };
        assert.deepEqual(errors, []);
        report.result = 'PASS';
    } finally {
        const out = resolve(root, 'output/playwright');
        mkdirSync(out, { recursive: true });
        writeFileSync(resolve(out, 'atlas-redirect-' + report.mode + '.json'), JSON.stringify(report, null, 2) + '\n');
        await browser?.close();
        server.closeAllConnections();
        if (server.listening) await new Promise((done) => server.close(done));
    }
})().catch((error) => { console.error(error); process.exitCode = 1; });
