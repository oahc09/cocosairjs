const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { collectSnapshot } = require('./port-gap-candidate-snapshot.cjs');
const root = path.resolve(__dirname, '../..');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
async function main() {
    const args = process.argv.slice(2), out = args.find((arg) => arg.startsWith('--out='))?.slice(6);
    if (!out || args.some((arg) => !arg.startsWith('--out='))) throw new Error('usage: node tools/verify/air-bootstrap-browser.cjs --out=<new.json>');
    const output = path.resolve(root, out); if (fs.existsSync(output)) throw new Error('choose a new report path');
    const startedAt = new Date().toISOString(), candidate = collectSnapshot(), files = [
        'src/air/safe-bootstrap.ts', 'src/air/app-config.ts', 'src/air/bootstrap.ts', 'src/air/app.ts', 'src/air/session-scope.ts',
        'src/cocos/game/director.ts', 'src/cocos/asset/asset-manager/release-manager.ts',
        'test/fixtures/safe-bootstrap/main.ts', 'tools/verify/air-bootstrap-browser.cjs',
        'build/bootstrap.js', 'build/cocosair.module.js', 'build/cocosair.module.min.js',
        'build/npm/bootstrap.js', 'build/npm/cocosair.module.js'];
    const fingerprints = Object.fromEntries(files.map((file) => [file, hash(file)]));
    const artifacts = output.replace(/\.json$/, '') + '-artifacts'; fs.mkdirSync(artifacts, { recursive: true });
    const server = await startExampleServer(root), results = [];
    try {
        const playwright = require('playwright');
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            let browser, stage = 'infrastructure';
            try {
                if (engine === 'webkit') assert(fs.existsSync(playwright.webkit.executablePath()), 'matching WebKit required');
                browser = await playwright[engine].launch({ ...launchOptions(engine), headless: true });
                for (const variant of ['unmin', 'min', 'npm']) {
                    const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 3 });
                    const page = await context.newPage(), requests = [], pageErrors = [];
                    page.on('request', (request) => requests.push(request.url())); page.on('pageerror', (error) => pageErrors.push(String(error)));
                    if (variant === 'min') await page.route('**/build/cocosair.module.js', (route) => route.fulfill({
                        contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'build/cocosair.module.min.js')) }));
                    const entry = variant === 'npm' ? '/build/npm/bootstrap.js' : '/build/bootstrap.js';
                    await page.goto(`${server.origin}/test/fixtures/safe-bootstrap/?entry=${entry}`);
                    await page.waitForFunction(() => window.__safeBootstrapProbe?.ready);
                    stage = 'application';
                    const invalid = await page.evaluate(() => window.__safeBootstrapProbe.invalid());
                    assert.equal(invalid.unchanged, true); assert(invalid.codes.every((code) => code.startsWith('AIR_E_')));
                    assert(!requests.some((url) => /cocosair\.module/.test(url)), 'safe import/invalid calls must not request engine');
                    stage = 'engine'; const startup = await page.evaluate(() => window.__safeBootstrapProbe.start());
                    console.error(`[air-bootstrap-sample] ${engine}/${variant} ` + JSON.stringify(startup));
                    assert.equal(startup.sharedPromise, true); assert.equal(startup.sameApp, true); assert.equal(startup.conflictCode, 'AIR_E_APP_CONFLICT');
                    assert.equal(startup.focus, false); assert(startup.colored > 100); assert.deepEqual(startup.buffer, [1000, 750]);
                    await page.setViewportSize({ width: 960, height: 540 });
                    await page.waitForFunction(() => {
                        const canvas = document.querySelector('canvas'); return canvas.width === 1200 && canvas.height === 675;
                    }, null, { timeout: 10000 });
                    const resized = await page.evaluate(() => window.__safeBootstrapProbe.render());
                    assert(resized.colored > 100); assert.deepEqual(resized.buffer, [1200, 675]);
                    const screenshot = path.join(artifacts, `${engine}-${variant}.png`); await page.screenshot({ path: screenshot });
                    const released = await page.evaluate(() => window.__safeBootstrapProbe.release());
                    console.error(`[air-bootstrap-release] ${engine}/${variant} ` + JSON.stringify(released));
                    assert.equal(released.shared, true); assert.equal(released.runCode, 'AIR_E_SCENE_RELEASING');
                    assert.equal(released.scene, null); assert.equal(released.tokenCurrent, false); assert.equal(released.receipt.status, 'released');
                    const closed = await page.evaluate(() => window.__safeBootstrapProbe.close());
                    assert.equal(closed.shared, true); assert.equal(closed.code, 'AIR_E_APP_CLOSED'); assert.equal(closed.receipt.status, 'released');
                    assert.deepEqual(pageErrors, []);
                    results.push({ engine, variant, status: 'PASS', browserVersion: browser.version(), invalid, startup, resized, released, closed,
                        screenshot: path.relative(root, screenshot).replace(/\\/g, '/') });
                    console.error(`[air-bootstrap] ${engine}/${variant} PASS`); await context.close();
                }
                const page = await browser.newPage(); await page.goto(`${server.origin}/test/fixtures/safe-bootstrap/`);
                await page.waitForFunction(() => window.__safeBootstrapProbe?.ready);
                const failed = await page.evaluate(() => window.__safeBootstrapProbe.start(true));
                console.error(`[air-bootstrap-failure] ${engine} ` + JSON.stringify(failed));
                assert.equal(failed.sharedPromise, true); assert.deepEqual(failed.codes, ['WEBGL2_REQUIRED', 'WEBGL2_REQUIRED']);
                assert.equal(failed.retryCode, 'AIR_E_APP_RELOAD_REQUIRED');
                results.push({ engine, variant: 'failed-webgl2', status: 'PASS', browserVersion: browser.version(), failed }); await page.close();
            } catch (error) { results.push({ engine, status: 'FAIL', stage, error: String(error.stack || error) }); }
            finally { if (browser) await browser.close(); }
        }
        for (const file of files) assert.equal(hash(file), fingerprints[file], `candidate drift: ${file}`);
        const passed = results.length === 12 && results.every((result) => result.status === 'PASS');
        const report = { startedAt, endedAt: new Date().toISOString(), command: process.argv, cwd: root, candidate, fingerprints,
            subset: true, completed: false, scopePassed: passed, scope: ['PG-29 safe startup/admission/failure', 'PG-35 DPR first frame/resize', 'PG-30 paused release/close'],
            unverified: ['installed tarball consumer', 'context lost release', '100 GPU cycles/10 minute stability', 'design-resolution input coordinates'], results };
        fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify(report, null, 2)); process.exitCode = passed ? 0 : 1;
    } finally { await server.close(); }
}
main().catch((error) => { console.error(String(error.stack || error)); process.exitCode = 1; });
