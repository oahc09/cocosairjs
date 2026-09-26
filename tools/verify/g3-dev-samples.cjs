const assert = require('assert');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..');

async function main() {
    const reservation = net.createServer();
    await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const child = spawn(process.execPath, ['tools/dev/dev-server.cjs', '--port', String(port)], {
        cwd: root,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let browser;
    const results = [];
    const artifacts = path.join(root, 'output/playwright');
    fs.mkdirSync(artifacts, { recursive: true });
    try {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('dev server did not start')), 15000);
            child.once('error', (error) => {
                clearTimeout(timer);
                reject(error);
            });
            child.once('exit', (code) => {
                clearTimeout(timer);
                reject(new Error('dev server exited: ' + code));
            });
            child.stdout.on('data', (data) => {
                if (String(data).includes('Cocos AIR dev server:')) {
                    clearTimeout(timer);
                    resolve();
                }
            });
        });
        browser = await chromium.launch({ ...launchOptions('chromium'), headless: true });
        for (const id of ['starter', 'hello-cube', 'scene-switch-reentry']) {
            const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
            const errors = [],
                modules = [];
            page.on('pageerror', (error) => errors.push(String(error)));
            page.on('response', (response) => {
                if (response.url().includes('/components/'))
                    modules.push({ path: new URL(response.url()).pathname, status: response.status() });
            });
            // Other verification processes may update metadata; keep this test page stable.
            await page.route('**/__reload.js', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
            await page.goto(`http://127.0.0.1:${port}/${id}/`);
            await page.waitForFunction(() => !!window.__airApp?.getScene(), null, { timeout: 30000 });
            if (id === 'hello-cube') {
                const rotation = () =>
                    page.evaluate(() => window.__airApp.getScene().getChildByName('Cube').eulerAngles.y);
                const before = await rotation();
                await page.waitForTimeout(400);
                assert.notStrictEqual(await rotation(), before, 'extracted Rotator must update');
            }
            if (id === 'scene-switch-reentry') {
                await page.waitForFunction(() => window.__trialProbe?.ready === true, null, { timeout: 30000 });
                await page.locator('#GameCanvas').click({ position: { x: 900, y: 500 } });
                await page.waitForFunction(() => window.__trialProbe?.clickPhaseDone === true);
                assert.strictEqual(await page.evaluate(() => window.__trialProbe.ok), true);
            }
            if (id !== 'starter')
                assert(
                    modules.length > 0 && modules.every((m) => m.status === 200),
                    'TypeScript component imports must load',
                );
            assert.deepStrictEqual(errors, []);
            await page.screenshot({ path: path.join(artifacts, `g3-${id}.png`) });
            results.push({ id, result: 'PASS', modules });
            await page.close();
        }
        fs.writeFileSync(
            path.join(root, 'docs/evidence/g3-dev-samples.json'),
            JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2) + '\n',
        );
        console.log('[g3-dev] 3/3 PASS: dev-server module loading, Rotator update, reentry interaction');
    } finally {
        if (browser) await browser.close();
        child.kill();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
