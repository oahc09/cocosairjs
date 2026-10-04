const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..'), hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
async function main() {
    assert(process.argv[2]?.startsWith('--out='), '--out=<new.json> required');
    const out = path.resolve(root, process.argv[2].slice(6)); assert(!fs.existsSync(out), 'new report required');
    const playwright = require('playwright'), startedAt = new Date().toISOString(), results = [];
    const files = ['src/air/assets/asset-bank.ts', 'src/air/ui-kit.ts', 'src/air/app.ts', 'build/cocosair.module.js',
        'test/fixtures/asset-bank-browser/index.html', 'test/fixtures/asset-bank-browser/main.ts', 'tools/verify/air-asset-bank-browser.cjs'];
    const fingerprints = Object.fromEntries(files.map((f) => [f, hash(f)]));
    const assets = [], server = await startExampleServer(root);
    const network = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost'), entry = { path: url.pathname, query: url.search, startedAt: new Date().toISOString(), status: url.pathname === '/missing' ? 404 : 200, completed: false };
        assets.push(entry);
        if (url.pathname !== '/cors-denied') res.setHeader('Access-Control-Allow-Origin', '*');
        const png = url.searchParams.get('kind') === 'png'; res.setHeader('Content-Type', png ? 'image/png' : 'application/json');
        res.writeHead(entry.status);
        const finish = () => { res.end(png ? fs.readFileSync(path.join(root, 'test/fixtures/atlas/page-0.png')) : JSON.stringify({ marker: 'actual-network', path: url.pathname })); entry.completed = true; entry.endedAt = new Date().toISOString(); };
        if (url.pathname.startsWith('/delayed')) setTimeout(finish, 500); else finish();
    });
    await new Promise((resolve) => network.listen(0, '127.0.0.1', resolve)); const origin = 'http://127.0.0.1:' + network.address().port;
    try {
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            let browser, sample; const offset = assets.length;
            try {
                browser = await playwright[engine].launch({ ...launchOptions(engine), headless: true });
                const page = await browser.newPage(), errors = []; page.on('pageerror', (e) => errors.push(String(e)));
                await page.goto(server.origin + '/test/fixtures/asset-bank-browser/'); await page.waitForFunction(() => window.__assetBankProbe?.ready);
                sample = await page.evaluate((origin) => window.__assetBankProbe.run(origin), origin);
                console.error('[asset-bank-observed] ' + JSON.stringify({ engine, sample }));
                assert(sample.noSuffix.isJson); assert.equal(sample.noSuffix.json.marker, 'actual-network');
                assert.equal(sample.noSuffix.refs, 1); assert.equal(sample.noSuffix.subscribers, 1); assert.deepEqual(sample.noSuffix.progress, [[0, 1], [1, 1]]);
                assert(sample.types.inferredJson && sample.types.explicitText && sample.types.distinct); assert.equal(JSON.parse(sample.types.text).marker, 'actual-network');
                assert(sample.decoded.isImage && sample.decoded.width > 0 && sample.decoded.height > 0);
                assert.equal(sample.shared.cancelled.code, 'AIR_E_ABORTED'); assert.equal(sample.shared.subscribers, 1); assert.equal(sample.shared.engineRefs, 1);
                assert.equal(sample.late.error.code, 'AIR_E_ABORTED'); assert.equal(sample.late.subscribers, 0); assert.equal(sample.late.inFlight, 0); assert(!sample.late.cached);
                assert.equal(sample.afterRevocation.error.code, 'AIR_E_REVOKED'); assert.equal(sample.afterRevocation.size, 0); assert.equal(sample.afterRevocation.inFlight, 0); assert(!sample.afterRevocation.cached);
                assert.equal(sample.missing.code, 'AIR_E_LOAD_FAILED'); assert.equal(sample.cors.code, 'AIR_E_LOAD_FAILED');
                assert(sample.ownership.sameAsset && sample.ownership.peerValid); assert.equal(sample.ownership.before, 2); assert.equal(sample.ownership.afterOne, 1); assert.equal(sample.ownership.afterBoth, 0);
                assert.equal(sample.finalSize, 0); assert.equal(sample.finalInFlight, 0); assert.equal(sample.underlyingCancelSupported, false);
                const requests = assets.slice(offset); for (const name of ['/delayed-peer', '/delayed-abandoned', '/delayed-revoked']) {
                    const matches = requests.filter((r) => r.path === name); assert.equal(matches.length, 1, name + ' actual request count'); assert(matches[0].completed, 'subscription cancellation does not abort network');
                }
                const csp = await page.evaluate((origin) => window.__assetBankProbe.runCsp(origin), origin);
                assert.equal(csp.error.code, 'AIR_E_LOAD_FAILED'); assert.equal(csp.size, 0); assert.equal(csp.inFlight, 0);
                assert(csp.violations.some((v) => v.blockedURI === origin + '/csp-denied' && v.effectiveDirective === 'connect-src'));
                assert(!assets.slice(offset).some((r) => r.path === '/csp-denied'), 'CSP must block transport before HTTP server');
                const expectedErrors = errors.filter((e) => /^XMLHttpRequest cannot load .*\/(cors-denied|csp-denied) due to access control checks\.$/.test(e));
                assert.deepEqual(errors.filter((e) => !expectedErrors.includes(e)), [], 'unexpected application errors');
                assert.equal((await page.evaluate(() => window.__assetBankProbe.close())).status, 'released');
                results.push({ engine, status: 'PASS', browserVersion: browser.version(), sample, csp, requests, expectedErrors });
            } catch (error) { results.push({ engine, status: 'FAIL', sample, requests: assets.slice(offset), error: String(error.stack || error) }); }
            finally { if (browser) await browser.close(); }
        }
        files.forEach((f) => assert.equal(hash(f), fingerprints[f], 'candidate drift: ' + f));
        const scopePassed = results.length === 3 && results.every((r) => r.status === 'PASS');
        fs.writeFileSync(out, JSON.stringify({ startedAt, endedAt: new Date().toISOString(), command: process.argv, cwd: root,
            subset: true, completed: false, scopePassed, scope: ['PG-06/32 real network suffix-less JSON/PNG/ext dispatch, cancellation, 404/CORS/CSP, native shared ownership'], fingerprints, results }, null, 2) + '\n', { flag: 'wx' });
        process.exitCode = scopePassed ? 0 : 1;
    } finally { await server.close(); await new Promise((resolve) => network.close(resolve)); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
