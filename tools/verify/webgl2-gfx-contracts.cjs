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
        args.every((a) => /^(--out=|--browser=|--playwright=|--sdk=|--cases=|--variant=|--control-manifest=)/.test(a)),
        'Unknown argument',
    );
    const out = args.find((a) => a.startsWith('--out='))?.slice(6);
    assert(out && out.endsWith('.json') && !fs.existsSync(path.resolve(root, out)), '--out=<new.json> required');
    const selected = args.find((a) => a.startsWith('--browser='))?.slice(10) || 'all';
    const engines = selected === 'all' ? ['chromium', 'firefox', 'webkit'] : selected.split(',');
    assert(
        engines.every((e) => ['chromium', 'firefox', 'webkit'].includes(e)),
        'Invalid browser',
    );
    const explicit = args.find((a) => a.startsWith('--playwright='))?.slice(13);
    const sdk = args.find((a) => a.startsWith('--sdk='))?.slice(6) || 'build/cocosair.module.js';
    assert(/^(?:build|output\/webgl2-gfx-contracts\/variants)\/[a-zA-Z0-9_.-]+\.js$/.test(sdk), 'Invalid SDK path');
    const cases = args.find((a) => a.startsWith('--cases='))?.slice(8);
    assert(!cases || cases.split(',').every((c) => /^(WGL-0[1-9]|REGRESSION)$/.test(c)), 'Invalid cases');
    const variant = args.find((a) => a.startsWith('--variant='))?.slice(10) || 'candidate';
    const controlManifestFile = args.find((a) => a.startsWith('--control-manifest='))?.slice(19);
    let controlManifest, control;
    if (controlManifestFile) {
        assert(
            /^output\/webgl2-gfx-contracts\/variants\/[a-zA-Z0-9_.-]+\.json$/.test(controlManifestFile),
            'Invalid control manifest path',
        );
        controlManifest = JSON.parse(fs.readFileSync(path.join(root, controlManifestFile), 'utf8'));
        control = controlManifest.variants.find((v) => v.file === sdk);
        assert(control, 'SDK missing from control manifest');
        assert.equal(control.name, variant, 'Variant does not match control manifest');
    }
    let pw, toolingError, toolingPath;
    try {
        toolingPath = require.resolve(explicit || 'playwright');
        pw = require(toolingPath);
    } catch (error) {
        toolingError = String(error);
    }
    const files = ['build/cocosair.module.js', 'build/cocosair.module.min.js', 'build/cocosair.module.d.ts', 'src/cocos/gfx/webgl2/webgl2-device.ts', 'src/cocos/gfx/webgl2/webgl2-commands.ts', 'src/cocos/gfx/webgl2/webgl2-texture.ts', 'src/cocos/gfx/webgl2/webgl2-gpu-objects.ts', 'src/cocos/gfx/webgl2/states/webgl2-sampler.ts', 'src/cocos/gfx/base/states/sampler.ts', 'src/cocos/gfx/base/define.ts', 'src/cocos/gfx/webgl2/webgl2-framebuffer.ts', 'src/cocos/gfx/webgl2/webgl2-swapchain.ts', 'src/cocos/gfx/webgl2/webgl2-state-cache.ts', 'src/cocos/core/math/utils.ts', 'build/npm/cocosair.module.js', 'build/npm/cocosair.module.min.js', 'build/cocosair.legacy.d.ts', 'tools/debug/probes/webgl2-gfx-contracts/index.html', 'tools/debug/probes/webgl2-gfx-contracts/main.js', 'tools/verify/webgl2-gfx-contracts.cjs', 'tools/verify/browser-engines.cjs', 'tools/verify/competitive-example-server.cjs', 'tools/verify/webgl2-gfx-controls.cjs', 'ai/plans/webgl2-gfx-contract-remediation.md'];
    if (!files.includes(sdk)) files.push(sdk);
    if (controlManifestFile) files.push(controlManifestFile);
    const hash = (file) =>
        fs.existsSync(path.join(root, file))
            ? crypto
                  .createHash('sha256')
                  .update(fs.readFileSync(path.join(root, file)))
                  .digest('hex')
            : null;
    const fingerprints = Object.fromEntries(files.map((file) => [file, hash(file)]));
    if (control) {
        assert.equal(fingerprints[sdk], control.sha256, 'Control SDK fingerprint mismatch');
        assert.equal(
            fingerprints['build/cocosair.module.js'],
            controlManifest.sourceSha256,
            'Base candidate drifted from control generation',
        );
    }
    const startedAt = new Date().toISOString(),
        results = [];
    const git = (args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    const identity = {
        head: git(['rev-parse', 'HEAD']),
        dirty: git(['status', '--porcelain']),
        node: process.version,
        toolingPath,
        toolingVersion: pw ? require(path.join(path.dirname(toolingPath), 'package.json')).version : null,
    };
    const server = await startExampleServer(root);
    const artifactDir = path.resolve(root, out.replace(/\.json$/, '-artifacts'));
    fs.mkdirSync(artifactDir, { recursive: true });
    try {
        for (const engine of engines) {
            let browser,
                stage = 'tooling',
                options;
            const pageErrors = [],
                consoleErrors = [];
            try {
                if (!pw) throw new Error(toolingError);
                options = launchOptions(engine);
                // Match cached binaries to the explicitly supplied tool when available.
                const matching = pw[engine].executablePath();
                if (engine !== 'chromium' && fs.existsSync(matching)) options.executablePath = matching;
                options.env = loopbackBrowserEnv();
                stage = 'launch';
                browser = await pw[engine].launch({ ...options, headless: true, timeout: 20000 });
                const page = await browser.newPage({ viewport: { width: 256, height: 256 } });
                page.on('pageerror', (e) => pageErrors.push(String(e)));
                page.on('console', (m) => {
                    if (m.type() === 'error') consoleErrors.push(m.text());
                });
                stage = 'contracts';
                const query = new URLSearchParams({ sdk: '/' + sdk });
                if (cases) query.set('cases', cases);
                await page.goto(server.origin + '/tools/debug/probes/webgl2-gfx-contracts/?' + query, {
                    timeout: 30000,
                });
                await page.waitForFunction(() => window.__wglContracts?.ready, null, { timeout: 45000 });
                const raw = await page.evaluate(() => window.__wglContracts);
                const screenshot = path.join(artifactDir, engine + '.png');
                await page.screenshot({ path: screenshot });
                const status =
                    !raw.startupException &&
                    !raw.startupErrors?.length &&
                    raw.results.every((r) => ['PASS', 'UNSUPPORTED'].includes(r.status)) &&
                    !pageErrors.length &&
                    !consoleErrors.length
                        ? 'PASS'
                        : 'FAIL';
                results.push({
                    engine,
                    status,
                    version: browser.version(),
                    executablePath: options.executablePath,
                    options: { args: options.args },
                    raw,
                    pageErrors,
                    consoleErrors,
                    screenshot: path.relative(root, screenshot).replace(/\\/g, '/'),
                });
                console.error(
                    `[webgl2-contracts] ${engine}: ${status} ${raw.results.map((r) => r.id + ':' + r.status).join(' ')}`,
                );
            } catch (error) {
                results.push({
                    engine,
                    status: stage === 'tooling' ? 'NOT_RUN' : 'BLOCKED',
                    stage,
                    executablePath: options?.executablePath,
                    error: String(error.stack || error),
                    pageErrors,
                    consoleErrors,
                });
                console.error(`[webgl2-contracts] ${engine}: ${stage} ${error.message}`);
            } finally {
                if (browser) await browser.close();
            }
        }
        const drift = files.filter((file) => hash(file) !== fingerprints[file]);
        const report = {
            schemaVersion: 'webgl2-gfx-contracts/1',
            startedAt,
            endedAt: new Date().toISOString(),
            identity,
            sdk,
            variant,
            control: control
                ? {
                      manifest: controlManifestFile,
                      sourceFile: controlManifest.sourceFile,
                      sourceSha256: controlManifest.sourceSha256,
                      sdkSha256: control.sha256,
                      replacements: control.replacements,
                      baseControlSha256: controlManifest.baseControlSha256,
                      generator: controlManifest.generator,
                  }
                : null,
            cases: cases ? cases.split(',') : 'all',
            fingerprints,
            drift,
            subset: engines.length !== 3 || !!cases,
            scope: 'Directed public-gfx nine-contract state/pixel/readback/validation suite; not release readiness',
            pending: [
                'Nondefault PACK/PBO GPU injection (raw writes disallowed; source tests cover it)',
                'Real-time skeletal animation scene',
                'MSAA resolve lifecycle',
                'Actual presentation after Windows WebKit resize',
            ],
            completed:
                results.length === engines.length &&
                results.every((r) => r.raw?.ready && r.raw.results.length && !r.raw.startupException),
            passed: results.every((r) => r.status === 'PASS') && !drift.length,
            results,
            negativeControlDetected:
                control && control.name !== 'base'
                    ? results.map((r) => ({
                          engine: r.engine,
                          detected: r.raw?.results.some((c) => c.status === 'FAIL'),
                          failedCases:
                              r.raw?.results
                                  .filter((c) => c.status === 'FAIL')
                                  .map((c) => ({
                                      id: c.id,
                                      variant: c.variant,
                                      expected: c.expected,
                                      actual: c.actual,
                                      stages: c.stages,
                                      exception: c.exception,
                                  })) || [],
                      }))
                    : null,
        };
        fs.mkdirSync(path.dirname(path.resolve(root, out)), { recursive: true });
        fs.writeFileSync(path.resolve(root, out), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        process.exitCode = report.passed ? 0 : 1;
    } finally {
        await server.close();
    }
}
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
