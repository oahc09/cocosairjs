const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const snapshot = (page) => page.evaluate(() => window.__actionProbe.snapshot());
const tick = (page) => page.evaluate(() => window.__actionProbe.tick());
async function main () {
    const arg = process.argv[2]; assert(arg?.startsWith('--out='), '--out=<new.json> required');
    const out = path.resolve(root, arg.slice(6)); assert(!fs.existsSync(out), 'new report required');
    const startedAt = new Date().toISOString(), files = ['src/air/action-state.ts', 'src/air/action-input.ts', 'src/air/session-scope.ts',
        'src/air/index.ts', 'build/cocosair.module.js', 'test/fixtures/action-input/main.ts', 'test/fixtures/action-input/index.html', 'tools/verify/air-action-input-browser.cjs'];
    const fingerprints = Object.fromEntries(files.map((file) => [file, hash(file)])), results = [];
    const server = await startExampleServer(root);
    try {
        const playwright = require('playwright');
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            let browser;
            try {
                if (engine === 'webkit') assert(fs.existsSync(playwright.webkit.executablePath()), 'matching WebKit required');
                browser = await playwright[engine].launch({ ...launchOptions(engine), headless: true });
                for (const backend of ['native', 'dom']) for (const canvas of ['default', 'custom']) {
                    const checks = []; let stage = 'infrastructure';
                    const context = await browser.newContext({ viewport: { width: 900, height: 650 }, hasTouch: true });
                    const page = await context.newPage(), errors = [];
                    page.on('pageerror', (error) => errors.push(String(error)));
                    try {
                        await page.goto(`${server.origin}/test/fixtures/action-input/?backend=${backend}&canvas=${canvas}`);
                        await page.waitForFunction(() => window.__actionProbe?.ready); stage = 'action-contract';
                        assert.equal((await snapshot(page)).focus, false);
                        await page.locator('#start').click(); assert((await snapshot(page)).focus); checks.push('explicit focus/attach idempotency');
                        await page.keyboard.down('Space'); await page.keyboard.down('Space');
                        assert((await snapshot(page)).jump); assert.equal((await tick(page)).transitions.length, 1);
                        assert.equal((await tick(page)).transitions.length, 0); checks.push('held/repeat/no edge replay');
                        await page.keyboard.down('a'); assert.equal((await snapshot(page)).sources.length, 2);
                        await page.keyboard.up('Space'); assert((await snapshot(page)).jump);
                        await page.keyboard.up('a'); assert.equal((await snapshot(page)).jump, false); await tick(page); checks.push('two keyboard sources OR');
                        await page.keyboard.down('Space'); await page.keyboard.up('Space'); await page.keyboard.down('Space');
                        assert.deepEqual((await tick(page)).transitions.map((edge) => edge.kind), ['press', 'release', 'press']);
                        await page.keyboard.up('Space'); await tick(page); checks.push('zero tick quick sequence preserves ordering');
                        await page.keyboard.down('ArrowLeft'); assert.equal((await snapshot(page)).axis, -1);
                        await page.keyboard.down('ArrowRight'); assert.equal((await snapshot(page)).axis, 0);
                        await page.keyboard.up('ArrowLeft'); assert.equal((await snapshot(page)).axis, 1);
                        await page.keyboard.up('ArrowRight'); assert.equal((await snapshot(page)).axis, 0); checks.push('axis source sum');
                        await page.keyboard.down('ShiftLeft'); await page.keyboard.down('ShiftRight');
                        assert.equal((await snapshot(page)).shift.length, 2);
                        if (backend === 'native') assert((await snapshot(page)).shift.some((source) => source.keyCode === 2000));
                        await page.keyboard.up('ShiftLeft'); assert.equal((await snapshot(page)).shift.length, 1);
                        await page.keyboard.up('ShiftRight'); await tick(page); checks.push('left/right shift identity');
                        await page.keyboard.down('Space'); await page.locator('#editable').focus(); await page.keyboard.up('Space');
                        assert.equal((await snapshot(page)).jump, false); checks.push('held keyup in editable releases');
                        await page.locator('#editable').fill(''); await page.keyboard.type('a');
                        assert.equal(await page.locator('#editable').inputValue(), 'a'); assert.equal((await snapshot(page)).jump, false);
                        await page.locator('#start').click(); await tick(page); checks.push('editable keydown rejected');
                        await page.keyboard.down('Space'); await page.evaluate(() => window.__actionProbe.hudPress());
                        await page.keyboard.up('Space'); assert((await snapshot(page)).jump);
                        await page.evaluate(() => window.__actionProbe.hudRelease()); assert.equal((await snapshot(page)).jump, false); await tick(page); checks.push('keyboard/HUD source OR');
                        await page.mouse.move(600, 400); await page.mouse.down(); assert((await snapshot(page)).pointer);
                        // Stay within the document: Firefox protocol coordinates outside the
                        // viewport do not attest an OS-level window leave or mouseup.
                        await page.mouse.move(850, 600); await page.mouse.up(); assert.equal((await snapshot(page)).pointer, false); await tick(page); checks.push('mouse canvas leave and outside-canvas release');
                        await page.touchscreen.tap(600, 400); const tapped = await tick(page);
                        assert.deepEqual(tapped.transitions.filter((edge) => edge.action === 'pointer').map((edge) => edge.kind), ['press', 'release']);
                        assert((await snapshot(page)).trustedTouch > 0); checks.push('trusted protocol touch same backend');
                        await page.locator('#start').click(); await page.keyboard.down('Space');
                        await page.evaluate(() => window.__actionProbe.deactivate()); assert.equal((await snapshot(page)).jump, false);
                        assert.equal((await snapshot(page)).reset.reason, 'deactivate'); await page.keyboard.up('Space');
                        await page.keyboard.down('Space'); assert.equal((await snapshot(page)).jump, false); await page.keyboard.up('Space');
                        await page.evaluate(() => window.__actionProbe.activate()); await page.keyboard.down('Space'); assert((await snapshot(page)).jump);
                        await page.evaluate(() => window.__actionProbe.pause()); assert.equal((await snapshot(page)).reset.reason, 'pause');
                        await page.keyboard.up('Space'); await tick(page); checks.push('session deactivation/new generation/pause reset');
                        const released = await page.evaluate(() => window.__actionProbe.release()); assert.equal(released.status, 'released');
                        assert.equal((await snapshot(page)).attached, false); assert.equal(await page.evaluate(() => window.__actionProbe.dispose()), 'AIR_E_DISPOSED');
                        await page.keyboard.down('Space'); await page.keyboard.up('Space'); assert.equal((await tick(page)).transitions.length, 0);
                        assert.deepEqual(errors, []); checks.push('owned release unbinds and terminal dispose cannot reattach');
                        results.push({ engine, backend, canvas, status: 'PASS', browserVersion: browser.version(), checks });
                    } catch (error) { results.push({ engine, backend, canvas, status: 'FAIL', stage, checks, snapshot: await snapshot(page).catch(() => null), errors, error: String(error.stack || error) }); }
                    finally { await context.close(); }
                    console.error('[action-input] ' + JSON.stringify(results.at(-1)));
                }
            } catch (error) { results.push({ engine, status: 'FAIL', stage: 'infrastructure', error: String(error.stack || error) }); }
            finally { if (browser) await browser.close(); }
        }
        for (const file of files) assert.equal(hash(file), fingerprints[file], 'candidate drift: ' + file);
        const passed = results.length === 12 && results.every((result) => result.status === 'PASS');
        fs.writeFileSync(out, JSON.stringify({ startedAt, endedAt: new Date().toISOString(), command: process.argv, cwd: root,
            subset: true, completed: false, scopePassed: passed, scope: ['PG-28 production reducer/native/DOM adapter trusted browser keyboard/mouse/tap'],
            unverified: ['physical hardware touch', 'concurrent trusted multi-touch and mixed-device cancellation', 'hidden/blur browser automation'], fingerprints, results }, null, 2) + '\n', { flag: 'wx' });
        process.exitCode = passed ? 0 : 1;
    } finally { await server.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
