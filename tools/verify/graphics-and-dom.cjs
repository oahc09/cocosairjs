const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto'),
    assert = require('node:assert/strict');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const root = path.resolve(__dirname, '../..');
async function main() {
    const args = process.argv.slice(2),
        out = args.find((v) => v.startsWith('--out='))?.slice(6),
        selected = args.find((v) => v.startsWith('--browser='))?.slice(10) ?? 'all';
    assert(out && !fs.existsSync(path.resolve(root, out)), '--out=<new.json> required');
    assert(
        args.every((v) => /^(?:--out=|--browser=|--channel=chrome$|--experimental-html$)/.test(v)),
        'unknown argument',
    );
    const engines = selected === 'all' ? ['chromium', 'firefox', 'webkit'] : [selected];
    assert(engines.every((v) => ['chromium', 'firefox', 'webkit'].includes(v)));
    const files = [
        'build/cocosair.module.js',
        'build/html-source.js',
        'src/air/dom-overlay.ts',
        'src/air/texture-sprite.ts',
        'src/air/graphics-commands.ts',
        'src/air/graphics-raster.ts',
        'src/air/ui-blend.ts',
        'src/air/effects/sprite-mask.ts',
        'src/air/html-source.ts',
        'test/fixtures/graphics-and-dom/index.html',
        'test/fixtures/graphics-and-dom/main.ts',
        'tools/verify/graphics-and-dom.cjs',
    ];
    const hash = (f) =>
        crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(root, f)))
            .digest('hex');
    const fingerprints = Object.fromEntries(files.map((f) => [f, hash(f)]));
    const built = await require('esbuild').build({
        entryPoints: [path.join(root, 'test/fixtures/graphics-and-dom/main.ts')],
        bundle: true,
        write: false,
        format: 'esm',
        target: 'es2022',
        external: ['cocosair'],
    });
    const server = await startExampleServer(root),
        results = [],
        startedAt = new Date().toISOString(),
        artifactDir = path.resolve(root, out.replace(/\.json$/, '') + '-artifacts');
    fs.mkdirSync(artifactDir, { recursive: true });
    try {
        for (const engine of engines) {
            let browser,
                stage = 'launch';
            const errors = [],
                consoleErrors = [];
            try {
                const options = launchOptions(engine);
                options.env = loopbackBrowserEnv();
                if (engine === 'chromium' && args.includes('--channel=chrome')) {
                    delete options.executablePath;
                    options.channel = 'chrome';
                }
                if (engine === 'chromium' && args.includes('--experimental-html'))
                    options.args.push(
                        '--enable-experimental-web-platform-features',
                        '--enable-blink-features=CanvasDrawElement',
                    );
                browser = await require('playwright')[engine].launch({ ...options, headless: true });
                const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
                page.on('pageerror', (e) => errors.push(String(e)));
                page.on('console', (m) => {
                    if (m.type() === 'error') consoleErrors.push(m.text());
                });
                await page.route('**/main.ts', (route) =>
                    route.fulfill({ contentType: 'text/javascript', body: built.outputFiles[0].text }),
                );
                stage = 'startup';
                await page.goto(server.origin + '/test/fixtures/graphics-and-dom/');
                await page.waitForFunction(() => window.__graphicsDOM?.ready, null, { timeout: 60000 });
                stage = 'pixels';
                await page.evaluate(() => window.__graphicsDOM.run());
                stage = 'overlay';
                const before = await page.evaluate(() => window.__graphicsDOM.overlay());
                assert(
                    Math.abs(before.rect.x - 78) < 2 && Math.abs(before.rect.y - 108) < 2,
                    'overlay centered at native node',
                );
                await page.locator('#overlay-button').click();
                const moved = await page.evaluate(() => window.__graphicsDOM.moveOverlay());
                assert(moved.x > before.rect.x, 'overlay follows native translation');
                await page.locator('#overlay-button').click();
                const screenshot = path.join(artifactDir, `${engine}.png`);
                await page.screenshot({ path: screenshot });
                const restored = await page.evaluate(() => window.__graphicsDOM.detachOverlay());
                assert(
                    restored.restored && restored.width === '' && restored.clicks === 2,
                    'DOM click and restoration',
                );
                stage = 'html';
                const html = await page.evaluate(() => window.__graphicsDOM.html());
                if (html.status === 'PASS') {
                    await page.locator('#html-button').click();
                    await page.locator('#html-input').fill('AIR input');
                    html.formPixels = await page.evaluate(() => window.__graphicsDOM.flushHTML());
                    await page.screenshot({ path: path.join(artifactDir, `${engine}-html.png`) });
                    html.interactionAndSnapshot = await page.evaluate(() => window.__graphicsDOM.finishHTML());
                }
                assert.equal(errors.length, 0, errors.join('\n'));
                assert.equal(consoleErrors.length, 0, consoleErrors.join('\n'));
                const rows = await page.evaluate(() => window.__graphicsDOM.rows);
                results.push({
                    engine,
                    version: browser.version(),
                    status: 'PASS',
                    rows,
                    overlay: { before, moved, restored },
                    html,
                    screenshot: path.relative(root, screenshot).replace(/\\/g, '/'),
                    errors,
                    consoleErrors,
                });
                console.error(`[graphics-dom] ${engine}: PASS ${rows.length} assertions; HTML=${html.status}`);
            } catch (e) {
                results.push({ engine, status: 'FAIL', stage, error: String(e.stack || e), errors, consoleErrors });
                console.error(`[graphics-dom] ${engine}: FAIL ${stage} ${e.message}`);
            } finally {
                if (browser) await browser.close();
            }
        }
        const drift = files.filter((f) => hash(f) !== fingerprints[f]);
        const report = {
            schemaVersion: 'air-graphics-and-dom/1',
            startedAt,
            endedAt: new Date().toISOString(),
            fingerprints,
            drift,
            subset: engines.length !== 3,
            completed: results.every((r) => r.status === 'PASS') && !drift.length,
            scope: 'Focused Graphics/SVG/raster/mask/blend/DOM and experimental HTML capability checks; not release readiness',
            results,
        };
        fs.mkdirSync(path.dirname(path.resolve(root, out)), { recursive: true });
        fs.writeFileSync(path.resolve(root, out), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        process.exitCode = report.completed ? 0 : 1;
    } finally {
        await server.close();
    }
}
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
