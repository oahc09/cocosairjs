const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto'),
    assert = require('node:assert/strict');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..');
const ids = ['graphics-svg-paints', 'sprite-mask-blend', 'dom-overlay-texture', 'html-texture-experimental'];
async function main() {
    const args = process.argv.slice(2),
        out = args.find((v) => v.startsWith('--out='))?.slice(6),
        selected = args.find((v) => v.startsWith('--browser='))?.slice(10) ?? 'all';
    assert(out && !fs.existsSync(path.resolve(root, out)), '--out=<new.json> required');
    assert(
        args.every((v) => /^(?:--out=|--browser=|--channel=chrome$|--experimental-html$|--static$|--mobile$)/.test(v)),
        'unknown argument',
    );
    const engines = selected === 'all' ? ['chromium', 'firefox', 'webkit'] : [selected];
    assert(engines.every((v) => ['chromium', 'firefox', 'webkit'].includes(v)));
    const files = [
        'build/cocosair.module.js',
        'build/bootstrap.js',
        'build/html-source.js',
        'src/air/texture-sprite.ts',
        'examples/shared/capability-lab.ts',
        'examples/shared/capability-lab.css',
        'tools/verify/graphics-examples.cjs',
        'tools/verify/gallery-artifact.cjs',
        'tools/verify/competitive-example-server.cjs',
        ...ids.flatMap((id) => [
            `examples/${id}/src/main.ts`,
            `examples/${id}/index.html`,
            `examples/${id}/example.json`,
        ]),
    ];
    const hash = (f) =>
            crypto
                .createHash('sha256')
                .update(fs.readFileSync(path.join(root, f)))
                .digest('hex'),
        fingerprints = Object.fromEntries(files.map((f) => [f, hash(f)]));
    let staticDirectory = null,
        servingRoot = root;
    if (args.includes('--static')) {
        staticDirectory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'air-graphics-gallery-'));
        servingRoot = path.join(staticDirectory, 'site');
        try {
            require('node:child_process').execFileSync(
                process.execPath,
                [path.join(root, 'tools/verify/gallery-artifact.cjs'), 'build'],
                {
                    cwd: root,
                    env: {
                        ...process.env,
                        COCOSAIR_GALLERY_ARTIFACT: servingRoot,
                        COCOSAIR_GALLERY_EXAMPLES: ids.join(','),
                    },
                    stdio: 'pipe',
                    maxBuffer: 8 * 1024 * 1024,
                },
            );
            assert.equal(
                crypto
                    .createHash('sha256')
                    .update(fs.readFileSync(path.join(servingRoot, 'cocosair.module.js')))
                    .digest('hex'),
                fingerprints['build/cocosair.module.js'],
            );
        } catch (error) {
            assert(
                path
                    .resolve(staticDirectory)
                    .startsWith(path.join(require('node:os').tmpdir(), 'air-graphics-gallery-')),
            );
            fs.rmSync(staticDirectory, { recursive: true, force: true });
            throw error;
        }
    }
    const server = await startExampleServer(servingRoot),
        startedAt = new Date().toISOString(),
        results = [],
        dir = path.resolve(root, out.replace(/\.json$/, '') + '-artifacts');
    fs.mkdirSync(dir, { recursive: true });
    try {
        for (const engine of engines) {
            let browser;
            try {
                const options = launchOptions(engine);
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
                for (const id of ids) {
                    const page = await browser.newPage({
                            viewport: { width: args.includes('--mobile') ? 390 : 1100, height: 820 },
                            deviceScaleFactor: 1,
                        }),
                        errors = [],
                        consoleErrors = [];
                    page.on('pageerror', (e) => errors.push(String(e)));
                    page.on('console', (m) => {
                        if (m.type() === 'error') consoleErrors.push(m.text());
                    });
                    try {
                        const built = require('esbuild').buildSync({
                            entryPoints: [path.join(root, `examples/${id}/src/main.ts`)],
                            bundle: true,
                            write: false,
                            format: 'esm',
                            target: 'es2022',
                            external: ['cocosair', 'cocosair/bootstrap', 'cocosair/html-source'],
                        });
                        if (!staticDirectory)
                            await page.route('**/src/main.ts', (route) =>
                                route.fulfill({ contentType: 'text/javascript', body: built.outputFiles[0].text }),
                            );
                        await page.goto(`${server.origin}/${staticDirectory ? '' : 'examples/'}${id}/`);
                        await page.waitForFunction(() => window.__exampleProbe?.ready, null, { timeout: 60000 });
                        // Use the same user-visible button and its serialized action queue.
                        await page.locator('#verify').click();
                        await page.evaluate(() => window.__exampleProbe.idle());
                        const rows = await page.evaluate(() => window.__exampleProbe.rows);
                        assert(rows.length > 1 && rows.every((row) => row.actual !== undefined));
                        assert((await page.locator('#status').textContent()).startsWith('PASS'));
                        let interaction = null,
                            svgExport = null;
                        if (id === 'graphics-svg-paints') {
                            await page.locator('#pattern').click();
                            await page.evaluate(() => window.__exampleProbe.idle());
                            const downloadEvent = page.waitForEvent('download');
                            await page.locator('#export').click();
                            const download = await downloadEvent;
                            const svgFile = path.join(dir, `${engine}-export.svg`);
                            await download.saveAs(svgFile);
                            const preview = await page.locator('#svg-preview').getAttribute('src');
                            assert.equal(
                                fs.readFileSync(svgFile, 'utf8'),
                                decodeURIComponent(preview.slice(preview.indexOf(',') + 1)),
                            );
                            svgExport = {
                                file: path.relative(root, svgFile).replace(/\\/g, '/'),
                                matchesPreview: true,
                            };
                            await page.locator('#gradient').click();
                            await page.evaluate(() => window.__exampleProbe.idle());
                        }
                        if (id === 'sprite-mask-blend') {
                            await page.locator('#red').click();
                            await page.evaluate(() => window.__exampleProbe.idle());
                            await page.locator('#add').click();
                            await page.evaluate(() => window.__exampleProbe.idle());
                        }
                        if (id === 'dom-overlay-texture') {
                            await page.locator('#live-input').fill('AIR overlay');
                            await page.locator('#live-button').click();
                            await page.locator('#move').click();
                            await page.evaluate(() => window.__exampleProbe.idle());
                            await page.locator('#live-button').click();
                            await page.locator('#resize').click();
                            await page.evaluate(() => window.__exampleProbe.idle());
                            interaction = await page.evaluate(() => window.__exampleProbe.interaction());
                            assert(interaction.hits === 2 && interaction.value === 'AIR overlay');
                        }
                        if (id === 'html-texture-experimental') {
                            const support = await page.evaluate(() => window.__exampleProbe.support);
                            if (support.supported) {
                                await page.locator('#html-button').click();
                                await page.locator('#html-input').fill('AIR HTML');
                                interaction = await page.evaluate(() => window.__exampleProbe.interaction());
                                assert(
                                    interaction.hits === 1 &&
                                        interaction.value === 'AIR HTML' &&
                                        interaction.uploads > 0,
                                );
                            } else {
                                interaction = { status: 'UNSUPPORTED', reason: support.reason };
                                assert(await page.locator('#live').isDisabled());
                            }
                        }
                        const screenshot = path.join(dir, `${id}-${engine}.png`);
                        await page.screenshot({ path: screenshot });
                        await page.setViewportSize({ width: 390, height: 820 });
                        await page.waitForTimeout(500);
                        await page.evaluate(() => window.__exampleProbe.idle());
                        const mobile = await page.evaluate(async () =>
                            window.__exampleProbe.redraw ? await window.__exampleProbe.redraw() : null,
                        );
                        if (id === 'dom-overlay-texture')
                            assert(
                                Math.abs(mobile.pixel[1] - 190) < 6,
                                `mobile resized texture invisible: ${mobile.pixel}`,
                            );
                        assert(
                            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
                            'mobile horizontal overflow',
                        );
                        const mobileScreenshot = path.join(dir, `${id}-${engine}-mobile.png`);
                        await page.screenshot({ path: mobileScreenshot });
                        if (id === 'dom-overlay-texture') {
                            const rect = await page.locator('#GameCanvas').boundingBox(),
                                image = require('pngjs').PNG.sync.read(fs.readFileSync(mobileScreenshot));
                            const x = Math.floor(rect.x + rect.width * 0.25),
                                y = Math.floor(rect.y + rect.height * 0.5),
                                offset = (y * image.width + x) * 4;
                            mobile.screenshotPixel = [...image.data.slice(offset, offset + 4)];
                            assert(
                                Math.abs(mobile.screenshotPixel[1] - 190) < 6 &&
                                    Math.abs(mobile.screenshotPixel[2] - 160) < 6,
                                `compositor screenshot mismatch: ${mobile.screenshotPixel}`,
                            );
                        }
                        await page.locator('#dispose').click();
                        await page.evaluate(() => window.__exampleProbe.idle());
                        assert.equal(await page.locator('#status').textContent(), 'RELEASED');
                        assert(await page.locator('#verify').isDisabled());
                        const released = await page.evaluate(() => window.__exampleProbe.dispose());
                        assert(
                            Object.values(released).every((v) => v === true),
                            JSON.stringify(released),
                        );
                        assert.deepEqual(errors, []);
                        assert.deepEqual(consoleErrors, []);
                        results.push({
                            engine,
                            id,
                            status: 'PASS',
                            rows: await page.evaluate(() => window.__exampleProbe.rows),
                            svgExport,
                            interaction,
                            mobile,
                            released,
                            screenshot: path.relative(root, screenshot).replace(/\\/g, '/'),
                            errors,
                            consoleErrors,
                        });
                        console.error(`[graphics-examples] ${engine}/${id}: PASS`);
                    } catch (error) {
                        results.push({
                            engine,
                            id,
                            status: 'FAIL',
                            error: String(error.stack || error),
                            errors,
                            consoleErrors,
                        });
                        console.error(`[graphics-examples] ${engine}/${id}: FAIL ${error.message}`);
                    } finally {
                        await page.close();
                    }
                }
            } catch (error) {
                results.push({ engine, status: 'FAIL', stage: 'launch', error: String(error.stack || error) });
            } finally {
                if (browser) await browser.close();
            }
        }
        const drift = files.filter((f) => hash(f) !== fingerprints[f]),
            report = {
                schemaVersion: 'air-graphics-examples/1',
                startedAt,
                endedAt: new Date().toISOString(),
                fingerprints,
                drift,
                subset: engines.length !== 3,
                scope: ids,
                deployment: staticDirectory ? 'static-gallery' : 'development',
                initialViewport: args.includes('--mobile') ? 'mobile' : 'desktop',
                unverified: [],
                completed:
                    results.length === engines.length * ids.length &&
                    results.every((r) => r.status === 'PASS') &&
                    !drift.length,
                results,
            };
        fs.mkdirSync(path.dirname(path.resolve(root, out)), { recursive: true });
        fs.writeFileSync(path.resolve(root, out), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        process.exitCode = report.completed ? 0 : 1;
    } finally {
        await server.close();
        if (staticDirectory) {
            assert(
                path
                    .resolve(staticDirectory)
                    .startsWith(path.join(require('node:os').tmpdir(), 'air-graphics-gallery-')),
            );
            fs.rmSync(staticDirectory, { recursive: true, force: true });
        }
    }
}
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
