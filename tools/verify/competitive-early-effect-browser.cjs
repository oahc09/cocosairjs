const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startExampleServer } = require('./competitive-example-server.cjs');
const root = path.resolve(__dirname, '../..');
const fingerprint = () =>
    crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, 'build/cocosair.module.js')))
        .digest('hex');
const bundleSha256 = fingerprint();
(async () => {
    const server = await startExampleServer(root);
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    try {
        const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.stack || error.message));
        await page.goto(`${server.origin}/tools/debug/probes/early-effect-registration/`);
        await page
            .waitForFunction(() => window.__earlyEffectProbe?.ready, undefined, { timeout: 10000 })
            .catch((error) => {
                throw new Error(`FULL SDK early effect failed: ${JSON.stringify(errors)}; ${error.message}`);
            });
        const probe = await page.evaluate(() => window.__earlyEffectProbe);
        assert(
            probe.earlyLookup && probe.lateLookup && probe.brightPixels > 1000,
            `native early registration + actual GPU pixels: ${JSON.stringify(probe)}`,
        );
        assert.deepEqual(errors, []);
        assert.equal(fingerprint(), bundleSha256, 'bundle changed during probe');
        const dir = path.join(root, 'output/playwright/competitive-early-effect');
        fs.mkdirSync(dir, { recursive: true });
        await page.locator('canvas').screenshot({ path: path.join(dir, 'early-effect.png') });
        console.log(
            JSON.stringify({ scope: 'CB-07 FULL SDK early effect', bundleSha256, status: 'PASS', ...probe }, null, 2),
        );
    } finally {
        await browser.close();
        await server.close();
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
