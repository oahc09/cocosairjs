const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
async function main() {
    const arg = process.argv[2]; assert(arg?.startsWith('--out='), '--out=<new.json> required');
    const output = path.resolve(root, arg.slice(6)); assert(!fs.existsSync(output), 'new report required');
    const artifacts = output.replace(/\.json$/, '-artifacts'); fs.mkdirSync(artifacts, { recursive: true });
    const files = ['src/air/assets/bmfont.ts', 'src/air/assets/asset-bank.ts', 'src/cocos/2d/assembler/label/text-processing.ts',
        'build/cocosair.module.js', 'tools/verify/air-bmfont-browser.cjs', 'tools/verify/browser-engines.cjs',
        ...fs.readdirSync(path.join(root, 'test/fixtures/bmfont')).map((name) => 'test/fixtures/bmfont/' + name)];
    const fingerprints = Object.fromEntries(files.map((file) => [file, hash(file)]));
    const results = [], startedAt = new Date().toISOString(), server = await startExampleServer(root);
    try {
        const playwright = require('playwright');
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            let browser;
            try {
                if (engine === 'webkit') assert(fs.existsSync(playwright.webkit.executablePath()), 'matching WebKit required');
                browser = await playwright[engine].launch({ ...launchOptions(engine), headless: true });
                const page = await browser.newPage({ viewport: { width: 480, height: 360 } }), errors = [];
                page.on('pageerror', (error) => errors.push(String(error)));
                await page.goto(server.origin + '/test/fixtures/bmfont/');
                await page.waitForFunction(() => window.__bmfontProbe?.ready);
                const without = await page.evaluate(() => window.__bmfontProbe.render(false));
                const withKerning = await page.evaluate(() => window.__bmfontProbe.render(true));
                console.error('[bmfont-observation] ' + JSON.stringify({ engine, without, withKerning }));
                assert.equal(without.red.length, 3); assert.equal(without.green.length, 3);
                assert.equal(withKerning.red.length, 3); assert.equal(withKerning.green.length, 3);
                for (let i = 0; i < 3; i++) {
                    const scale = (24 - i * 4) / 20; // Pixel bands are bottom-to-top.
                    const gapBefore = without.green[i].minX - without.red[i].minX;
                    const gapAfter = withKerning.green[i].minX - withKerning.red[i].minX;
                    assert(Math.abs(gapBefore - 12 * scale) <= 1, 'native unkerned advance');
                    assert(Math.abs(gapAfter - 8 * scale) <= 1, 'two-character kerning pixels');
                    assert(Math.abs(withKerning.red[i].maxX - withKerning.red[i].minX + 1 - 8 * scale) <= 1, 'glyph width at scale');
                    assert(Math.abs(withKerning.red[i].maxY - withKerning.red[i].minY + 1 - 12 * scale) <= 1, 'glyph height at scale');
                }
                const screenshot = path.join(artifacts, engine + '.png'); await page.screenshot({ path: screenshot });
                const release = await page.evaluate(() => window.__bmfontProbe.release());
                assert.equal(release.bankSize, 0); assert.equal(release.disposed, true); assert.equal(release.receipt.status, 'released');
                assert.deepEqual(errors, []);
                results.push({ engine, status: 'PASS', browserVersion: browser.version(), without, withKerning, release, screenshot: path.relative(root, screenshot) });
            } catch (error) { results.push({ engine, status: 'FAIL', error: String(error.stack || error) }); }
            finally { if (browser) await browser.close(); }
            console.error('[bmfont] ' + JSON.stringify(results.at(-1)));
        }
        for (const file of files) assert.equal(hash(file), fingerprints[file], 'candidate drift: ' + file);
        const passed = results.length === 3 && results.every((result) => result.status === 'PASS');
        fs.writeFileSync(output, JSON.stringify({ startedAt, endedAt: new Date().toISOString(), command: process.argv, cwd: root,
            scope: ['PG-02 single-page native BMFont loading, two-character kerning, 0.8/1.0/1.2 glyph pixels and owned release'],
            subset: true, completed: false, scopePassed: passed, fingerprints, results }, null, 2) + '\n', { flag: 'wx' });
        process.exitCode = passed ? 0 : 1;
    } finally { await server.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
