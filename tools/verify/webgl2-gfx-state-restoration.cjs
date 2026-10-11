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
        args.every((arg) => /^(--out=|--browser=|--playwright=|--sdk=|--negative-control=)/.test(arg)),
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
    const sdk = args.find((arg) => arg.startsWith('--sdk='))?.slice(6) || '/build/cocosair.module.js';
    const negativeControl = args.find((arg) => arg.startsWith('--negative-control='))?.slice(19);
    assert(!negativeControl || negativeControl === 'omit-pack-pbo-finally', 'Invalid control');
    assert(/^\/(build|output)\/[A-Za-z0-9_./-]+\.js$/.test(sdk) && !sdk.includes('..'), 'Invalid SDK path');
    let controlManifest = null;
    if (negativeControl) {
        assert(sdk.startsWith('/output/webgl2-gfx-contracts/variants/'), 'Control must use an isolated output copy');
        const target = path.join(root, sdk.slice(1));
        assert(!fs.existsSync(target), 'Existing variant must not be overwritten');
        const basePath = path.join(root, 'build/cocosair.module.js');
        const base = fs.readFileSync(basePath, 'utf8');
        const needle =
            '    packNames.forEach((name, index) => gl.pixelStorei(name, savedPack[index]));\n    gl.bindBuffer(WebGLConstants.PIXEL_PACK_BUFFER, savedPBO);';
        assert(base.split(needle).length === 2, 'Control mutation must match exactly once');
        const replacement = '    /* NEGATIVE CONTROL: omit only PACK and PBO finally restoration */';
        const modified = base.replace(needle, replacement).replace(/^\/\/# sourceMappingURL=.*$/gm, '');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, modified, { flag: 'wx' });
        const digest = (text) => crypto.createHash('sha256').update(text).digest('hex');
        controlManifest = {
            base: 'build/cocosair.module.js',
            baseSha256: digest(base),
            variant: sdk.slice(1),
            variantSha256: digest(modified),
            matched: 1,
            needle,
            replacement,
            sourceMapRemoved: true,
        };
    }
    assert(fs.existsSync(path.join(root, sdk.slice(1))), 'SDK file missing');
    const files = [
        sdk.slice(1),
        'build/cocosair.module.js',
        'build/cocosair.module.min.js',
        'build/cocosair.module.d.ts',
        'src/cocos/gfx/webgl2/webgl2-commands.ts',
        'src/cocos/gfx/webgl2/webgl2-device.ts',
        'src/cocos/gfx/webgl2/webgl2-texture.ts',
        'src/cocos/gfx/webgl2/webgl2-framebuffer.ts',
        'src/cocos/gfx/webgl2/webgl2-gpu-objects.ts',
        'tools/verify/webgl2-gfx-state-restoration.cjs',
        'tools/debug/probes/webgl2-gfx-state-restoration/index.html',
        'tools/debug/probes/webgl2-gfx-state-restoration/main.js',
        'tools/verify/competitive-example-server.cjs',
        'tools/verify/browser-engines.cjs',
        'tools/verify/loopback-browser-env.cjs',
        'ai/plans/webgl2-gfx-contract-remediation.md',
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
        schema: 'webgl2-gfx-state-restoration/1',
        startedAt: new Date().toISOString(),
        identity: {
            head: git(['rev-parse', 'HEAD']),
            dirty: git(['status', '--porcelain']),
            node: process.version,
            toolingPath,
            toolingVersion: pw ? require(path.join(path.dirname(toolingPath), 'package.json')).version : null,
        },
        sdk,
        negativeControl: negativeControl || null,
        controlManifest,
        fingerprints,
        results: [],
        subset: engines.length !== 3,
        scope: 'Supplemental external-state GPU fixture. Raw GL writes ONLY establish/release external PACK/PBO/READ/DRAW state and inject one pre-existing INVALID_ENUM error. Tested texture upload, rendering and copyTextureToBuffers use public gfx. Three cases: success, whole-region preflight failure, execution GL_BEFORE failure (not a readPixels-after-call fault); primaryStatus isolates the initial call from continuationStatus of the later valid read. Each checks byte sentinels, actual bindings, PACK and PBO data, then public drawing/readback continuation. Read-only native-delegate instrumentation records temporary FBO creation/deletion; raw buffer binding temporarily permits PBO sentinel inspection then restores the observed binding. Screenshots are readback previews, not compositor proof. Original nine-case fixture raw-GL-read-only rule remains unchanged. Not full Gallery or release readiness.',
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
                await page.goto(
                    server.origin + '/tools/debug/probes/webgl2-gfx-state-restoration/?sdk=' + encodeURIComponent(sdk),
                    {
                        timeout: 30000,
                    },
                );
                await page.waitForFunction(() => window.__wglStateRestoration?.ready, null, { timeout: 60000 });
                const raw = await page.evaluate(() => window.__wglStateRestoration);
                const screenshot = path.join(artifactDir, engine + '.png');
                await page.screenshot({ path: screenshot, fullPage: true });
                const exactFaultConsole = 'WebGL: INVALID_ENUM: pixelStorei: invalid parameter name';
                const injected = raw.results.find((item) => item.id === 'execution-gl-before-failure');
                const faultObserved =
                    injected?.faultInjection?.expectedError === 1280 &&
                    injected?.actual?.caught?.includes('WEBGL2_READBACK_GL_BEFORE: 1280');
                const expectedFaultConsoleErrors = faultObserved
                    ? consoleErrors.filter((message) => message === exactFaultConsole)
                    : [];
                const unexpectedConsoleErrors = consoleErrors.filter(
                    (message) => !faultObserved || message !== exactFaultConsole,
                );
                if (expectedFaultConsoleErrors.length > 1)
                    unexpectedConsoleErrors.push('More fault console errors than injected operations');
                const passed =
                    !raw.startupException &&
                    raw.results.length === 3 &&
                    raw.results.every((result) => result.status === 'PASS') &&
                    raw.startupErrors?.length === 0 &&
                    raw.finalErrors?.length === 0 &&
                    raw.appRelease?.status === 'released' &&
                    !pageErrors.length &&
                    !unexpectedConsoleErrors.length;
                report.results.push({
                    engine,
                    status: passed ? 'PASS' : 'FAIL',
                    version: browser.version(),
                    executablePath: options.executablePath,
                    raw,
                    pageErrors,
                    consoleErrors,
                    expectedFaultConsoleErrors,
                    unexpectedConsoleErrors,
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
        if (negativeControl) {
            report.negativeControlDetected = report.results.map((browser) => {
                const raw = browser.raw;
                const cases = raw?.results || [];
                const exactIDs =
                    JSON.stringify(cases.map((item) => item.id).sort()) ===
                    JSON.stringify(['success', 'preflight-capacity-failure', 'execution-gl-before-failure'].sort());
                const targets = cases.filter((item) => ['success', 'execution-gl-before-failure'].includes(item.id));
                const primaryFailure =
                    targets.length === 2 &&
                    targets.every(
                        (item) =>
                            item.primaryStatus === 'FAIL' &&
                            JSON.stringify(item.actual.pack) === '[1,0,0,0]' &&
                            item.actual.bindings.pbo === false &&
                            item.actual.bindings.read &&
                            item.actual.bindings.draw &&
                            !item.exception,
                    );
                const preflight = cases.find((item) => item.id === 'preflight-capacity-failure');
                const preflightProtected =
                    preflight?.primaryStatus === 'PASS' &&
                    preflight.actual.caught === 'WEBGL2_READBACK_BUFFER_CAPACITY: region 0' &&
                    preflight.actual.temporaryFBOs.length === 0;
                const continuation =
                    cases.length === 3 &&
                    cases.every(
                        (item) =>
                            JSON.stringify(item.actual.continuationPixel) === '[0,255,0,255]' &&
                            item.continuationStatus === 'FAIL' &&
                            JSON.stringify(item.actual.continuationPack) === '[1,0,0,0]' &&
                            item.actual.continuationPBO === false,
                    );
                const clean =
                    cases.length === 3 &&
                    cases.every(
                        (item) =>
                            !item.exception &&
                            Object.values(item.stages).every((errors) => errors.length === 0) &&
                            item.resources.created === 14 &&
                            item.resources.released === 14 &&
                            item.cleanup.every((resource) => resource.released),
                    );
                const runtime =
                    raw?.ready &&
                    !raw.startupException &&
                    raw.startupErrors?.length === 0 &&
                    raw.finalErrors?.length === 0 &&
                    raw.appRelease?.status === 'released' &&
                    browser.pageErrors?.length === 0 &&
                    browser.unexpectedConsoleErrors?.length === 0;
                return {
                    engine: browser.engine,
                    exactIDs,
                    primaryFailure,
                    preflightProtected,
                    continuation,
                    clean,
                    runtime,
                    detected: exactIDs && primaryFailure && preflightProtected && continuation && clean && runtime,
                };
            });
        }
        report.passed =
            report.completed && report.results.every((result) => result.status === 'PASS') && !report.drift.length;
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        process.exitCode = negativeControl
            ? report.completed && !report.drift.length && report.negativeControlDetected.every((item) => item.detected)
                ? 0
                : 1
            : report.passed
              ? 0
              : 1;
    } finally {
        await server.close();
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
