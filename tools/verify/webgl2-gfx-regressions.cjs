const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const root = path.resolve(__dirname, '../..');

async function main() {
    const args = process.argv.slice(2);
    assert(
        args.every((arg) => /^(--out=|--browser=|--playwright=)/.test(arg)),
        'Unknown argument',
    );
    const out = args.find((arg) => arg.startsWith('--out='))?.slice(6);
    assert(out && out.endsWith('.json'), '--out=<new.json> is required');
    const reportPath = path.resolve(root, out);
    assert(!fs.existsSync(reportPath), 'Existing evidence must not be overwritten');
    const selection = args.find((arg) => arg.startsWith('--browser='))?.slice(10) || 'all';
    const engines = selection === 'all' ? ['chromium', 'firefox', 'webkit'] : selection.split(',');
    assert(
        engines.every((engine) => ['chromium', 'firefox', 'webkit'].includes(engine)),
        'Invalid browser',
    );
    const explicit = args.find((arg) => arg.startsWith('--playwright='))?.slice(13);
    let pw, toolingPath, toolingError;
    try {
        toolingPath = require.resolve(explicit || 'playwright');
        pw = require(toolingPath);
    } catch (error) {
        toolingError = String(error);
    }
    const files = [
        'build/cocosair.module.js',
        'build/cocosair.module.min.js',
        'build/cocosair.module.d.ts',
        'src/cocos/gfx/webgl2/webgl2-commands.ts',
        'src/cocos/gfx/webgl2/webgl2-device.ts',
        'src/cocos/gfx/webgl2/webgl2-texture.ts',
        'src/cocos/gfx/webgl2/webgl2-framebuffer.ts',
        'src/cocos/gfx/webgl2/webgl2-gpu-objects.ts',
        'tools/verify/webgl2-gfx-regressions.cjs',
        'tools/debug/probes/webgl2-gfx-regressions/index.html',
        'tools/debug/probes/webgl2-gfx-regressions/main.js',
        'tools/verify/competitive-example-server.cjs',
        'tools/verify/browser-engines.cjs',
        'tools/verify/loopback-browser-env.cjs',
        'ai/plans/webgl2-gfx-contract-remediation.md',
        ...[
            'SimpleSkin.gltf',
            'SimpleSkin_geometry.bin',
            'SimpleSkin_skinningData.bin',
            'SimpleSkin_inverseBindMatrices.bin',
            'SimpleSkin_animation.bin',
        ].map((name) => 'examples/gltf-skin/assets/' + name),
    ];
    const hash = (file) =>
        fs.existsSync(path.join(root, file))
            ? crypto
                  .createHash('sha256')
                  .update(fs.readFileSync(path.join(root, file)))
                  .digest('hex')
            : null;
    const fingerprints = Object.fromEntries(files.map((file) => [file, hash(file)]));
    const git = (gitArgs) => cp.execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8' }).trim();
    const report = {
        schema: 'webgl2-gfx-ordinary-regressions/1',
        startedAt: new Date().toISOString(),
        identity: {
            head: git(['rev-parse', 'HEAD']),
            dirty: git(['status', '--porcelain']),
            node: process.version,
            toolingPath,
            toolingVersion: pw ? require(path.join(path.dirname(toolingPath), 'package.json')).version : null,
        },
        fingerprints,
        results: [],
        subset: engines.length !== 3,
        scope: 'Two directed ordinary-path GPU regressions: native realtime skinning; RGBA8 MSAA resolve, existing framebuffer resize, read/draw/blit continuation. Not full Gallery or release readiness.',
    };
    const artifactDir = reportPath.replace(/\.json$/, '-artifacts');
    fs.mkdirSync(artifactDir, { recursive: true });
    const server = await startExampleServer(root);
    try {
        for (const engine of engines) {
            let browser,
                options,
                stage = 'tooling';
            const pageErrors = [],
                consoleErrors = [];
            try {
                if (!pw) throw new Error(toolingError);
                options = launchOptions(engine);
                const matching = pw[engine].executablePath();
                if (engine !== 'chromium' && fs.existsSync(matching)) options.executablePath = matching;
                options.env = loopbackBrowserEnv();
                stage = 'launch';
                browser = await pw[engine].launch({ ...options, headless: true, timeout: 20000 });
                const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
                page.on('pageerror', (error) => pageErrors.push(String(error)));
                page.on('console', (message) => {
                    if (message.type() === 'error') consoleErrors.push(message.text());
                });
                stage = 'gpu-regressions';
                await page.goto(server.origin + '/tools/debug/probes/webgl2-gfx-regressions/', { timeout: 30000 });
                await page.waitForFunction(() => window.__wglRegressions?.ready, null, { timeout: 60000 });
                const raw = await page.evaluate(() => window.__wglRegressions);
                const screenshot = path.join(artifactDir, engine + '.png');
                await page.screenshot({ path: screenshot, fullPage: true });
                const passed =
                    !raw.startupException &&
                    raw.results.length === 2 &&
                    raw.results.every((result) => result.status === 'PASS') &&
                    raw.startupErrors?.length === 0 &&
                    raw.finalErrors?.length === 0 &&
                    raw.appRelease?.status === 'released' &&
                    !pageErrors.length &&
                    !consoleErrors.length;
                report.results.push({
                    engine,
                    status: passed ? 'PASS' : 'FAIL',
                    version: browser.version(),
                    executablePath: options.executablePath,
                    raw,
                    pageErrors,
                    consoleErrors,
                    screenshot: path.relative(root, screenshot).replace(/\\/g, '/'),
                });
                console.error(`[webgl2-regressions] ${engine}: ${passed ? 'PASS' : 'FAIL'}`);
            } catch (error) {
                report.results.push({
                    engine,
                    status: stage === 'tooling' ? 'NOT_RUN' : stage === 'launch' ? 'BLOCKED' : 'FAIL',
                    stage,
                    error: String(error.stack || error),
                    pageErrors,
                    consoleErrors,
                });
                console.error(`[webgl2-regressions] ${engine}: ${stage}: ${error.message}`);
            } finally {
                await browser?.close();
            }
        }
        report.finishedAt = new Date().toISOString();
        report.drift = files.filter((file) => hash(file) !== fingerprints[file]);
        report.completed =
            report.results.length === engines.length && report.results.every((result) => result.raw?.ready);
        report.passed =
            report.completed && report.results.every((result) => result.status === 'PASS') && !report.drift.length;
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        process.exitCode = report.passed ? 0 : 1;
    } finally {
        await server.close();
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
