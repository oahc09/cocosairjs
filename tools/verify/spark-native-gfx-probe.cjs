// SPK-09 driver: runs the Spark native-gfx probe against the current read-only build and writes a
// machine-checkable report bound to an identity fingerprint (HEAD + SDK SHA-256 + Playwright version).
// Structure follows tools/verify/webgl2-gfx-contracts.cjs: the repo root cannot resolve `playwright`,
// so the isolated tooling path (output/playwright/tooling/node_modules/playwright) is used, with
// browser args from browser-engines.cjs and loopback-browser-env.cjs. Exit is non-zero on any FAIL,
// NOT_RUN, drift or startup exception; a BLOCKED case never fabricates a PASS but also does not, by
// itself, flip the exit code (its dependency legitimately has not landed yet).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');

const root = path.resolve(__dirname, '../..');
const PROBE_PATH = 'tools/debug/probes/spark-native-gfx-probe/';

function main() {
    const args = process.argv.slice(2);
    assert(
        args.every((a) => /^(--out=|--browser=|--playwright=|--sdk=|--cases=)/.test(a)),
        `Unknown argument: ${args.filter((a) => !/^(--out=|--browser=|--playwright=|--sdk=|--cases=)/.test(a)).join(' ')}`,
    );
    const out = args.find((a) => a.startsWith('--out='))?.slice(6);
    assert(out && out.endsWith('.json'), '--out=<path.json> required');
    assert(/^output\/[a-zA-Z0-9_./-]+\.json$/.test(out), '--out must be a new JSON file under output/');
    const outAbs = path.resolve(root, out);
    assert(!fs.existsSync(outAbs), '--out must not already exist');

    const selected = args.find((a) => a.startsWith('--browser='))?.slice(10) || 'all';
    const engines = selected === 'all' ? ['chromium', 'firefox', 'webkit'] : selected.split(',');
    assert(
        engines.every((e) => ['chromium', 'firefox', 'webkit'].includes(e)),
        'Invalid browser',
    );
    const explicit = args.find((a) => a.startsWith('--playwright='))?.slice(13);
    const sdk = args.find((a) => a.startsWith('--sdk='))?.slice(6) || 'build/cocosair.module.js';
    assert(/^build\/[a-zA-Z0-9_.-]+\.js$/.test(sdk), 'Invalid SDK path (build/<name>.js only)');
    const cases = args.find((a) => a.startsWith('--cases='))?.slice(8);
    assert(!cases || cases.split(',').every((c) => /^SPK-(C\d|INT)$/.test(c)), 'Invalid cases');
    assert(fs.existsSync(path.resolve(root, sdk)), `Missing SDK build: ${sdk}`);

    let pw;
    let toolingError;
    let toolingPath;
    try {
        toolingPath = require.resolve(explicit || 'playwright');
        pw = require(toolingPath);
    } catch (error) {
        toolingError = String(error);
    }

    const fingerprintFiles = [
        sdk,
        'build/cocosair.module.min.js',
        'src/cocos/gfx/webgl2/webgl2-device.ts',
        'src/cocos/gfx/webgl2/webgl2-commands.ts',
        'src/cocos/gfx/webgl2/webgl2-texture.ts',
        'src/cocos/gfx/webgl2/webgl2-gpu-objects.ts',
        'src/cocos/gfx/base/define.ts',
        `${PROBE_PATH}index.html`,
        `${PROBE_PATH}main.js`,
        'tools/verify/spark-native-gfx-probe.cjs',
        'tools/verify/browser-engines.cjs',
        'tools/verify/competitive-example-server.cjs',
        'tools/verify/loopback-browser-env.cjs',
        'ai/plans/spark-integration.md',
    ];
    const sha256 = (file) =>
        fs.existsSync(path.join(root, file))
            ? crypto
                  .createHash('sha256')
                  .update(fs.readFileSync(path.join(root, file)))
                  .digest('hex')
            : null;
    const fingerprints = Object.fromEntries(fingerprintFiles.map((f) => [f, sha256(f)]));

    const git = (a) => {
        try {
            return cp.execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
        } catch (error) {
            return `GIT_UNAVAILABLE: ${error.message}`;
        }
    };
    let playwrightVersion = null;
    try {
        playwrightVersion = require(path.join(path.dirname(toolingPath), 'package.json')).version;
    } catch {
        playwrightVersion = null;
    }
    const identity = {
        head: git(['rev-parse', 'HEAD']),
        dirty: git(['status', '--porcelain']),
        node: process.version,
        sdk: { path: sdk, sha256: fingerprints[sdk] },
        toolingPath: toolingPath || null,
        toolingError: toolingError || null,
        playwrightVersion,
    };

    return {
        engines,
        cases,
        out,
        outAbs,
        pw,
        toolingError,
        identity,
        fingerprints,
        sha256,
        sdk,
        selected,
        fingerprintFiles,
    };
}

async function run() {
    const ctx = main();
    const { engines, cases, out, outAbs, pw, toolingError, identity, fingerprints, sha256, sdk, fingerprintFiles } =
        ctx;
    const startedAt = new Date().toISOString();
    const results = [];
    const server = await startExampleServer(root);
    const artifactDir = path.resolve(root, out.replace(/\.json$/, '-artifacts'));
    fs.mkdirSync(artifactDir, { recursive: true });
    try {
        for (const engine of engines) {
            let browser;
            let stage = 'tooling';
            let options;
            const pageErrors = [];
            const consoleErrors = [];
            try {
                if (!pw) throw new Error(toolingError || 'Playwright unavailable');
                options = launchOptions(engine);
                // Match cached binaries to the explicitly supplied tool so a stale pinned
                // revision (e.g. WebKit-2311 vs the tooling-required WebKit-2359) cannot launch
                // then hang at the protocol layer. Chromium keeps the media-capable pinned build.
                try {
                    const matching = pw[engine].executablePath();
                    if (engine !== 'chromium' && fs.existsSync(matching)) options.executablePath = matching;
                } catch {
                    /* keep launchOptions fallback */
                }
                options.env = loopbackBrowserEnv();
                stage = 'launch';
                browser = await pw[engine].launch({ ...options, headless: true, timeout: 20000 });
                const page = await browser.newPage({ viewport: { width: 16, height: 16 } });
                page.on('pageerror', (e) => pageErrors.push(String(e)));
                page.on('console', (m) => {
                    if (m.type() === 'error') consoleErrors.push(m.text());
                });
                stage = 'probe';
                const query = new URLSearchParams({ sdk: '/' + sdk });
                if (cases) query.set('cases', cases);
                await page.goto(server.origin + '/' + PROBE_PATH + '?' + query, { timeout: 30000 });
                await page.waitForFunction(() => window.__sparkGfxProbe?.ready, null, { timeout: 45000 });
                const raw = await page.evaluate(() => window.__sparkGfxProbe);
                const screenshot = path.join(artifactDir, engine + '.png');
                await page.screenshot({ path: screenshot });

                const failCases = (raw.results || []).filter((r) => r.status === 'FAIL');
                const blockedCases = (raw.results || []).filter((r) => r.status === 'BLOCKED');
                const status =
                    !raw.startupException && !failCases.length && !pageErrors.length && !consoleErrors.length
                        ? 'PASS'
                        : 'FAIL';
                results.push({
                    engine,
                    status,
                    version: browser.version(),
                    executablePath: options.executablePath,
                    raw,
                    failCases: failCases.map((c) => c.id + ':' + c.variant),
                    blockedCases: blockedCases.map((c) => c.id),
                    pageErrors,
                    consoleErrors,
                    screenshot: path.relative(root, screenshot).replace(/\\/g, '/'),
                });
                const perCase = (raw.results || []).map((r) => `${r.id}:${r.status}`).join(' ');
                console.error(`[spark-gfx-probe] ${engine}: ${status} ${perCase}`);
                (raw.results || [])
                    .filter((r) => r.status === 'FAIL')
                    .forEach((r) =>
                        console.error(
                            `[spark-gfx-probe]   FAIL ${r.id}/${r.variant} expected=${JSON.stringify(
                                r.expected,
                            )} actual=${JSON.stringify(r.actual)} glClean=${r.glClean} exception=${r.exception || ''}`,
                        ),
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
                console.error(`[spark-gfx-probe] ${engine}: ${stage} ${error.message}`);
            } finally {
                if (browser) await browser.close();
            }
        }
        const drift = fingerprintFiles.filter((file) => sha256(file) !== fingerprints[file]);
        const anyFail = results.some((r) => r.status === 'FAIL' || r.status === 'NOT_RUN');
        const anyBlockedIntegration = results.some((r) => (r.blockedCases || []).includes('SPK-INT'));
        const allEnginesDelivered = results.every((r) => r.raw?.ready && r.raw.results?.length);
        const passed = !anyFail && !drift.length && allEnginesDelivered;
        const report = {
            schemaVersion: 'spark-native-gfx-probe/1',
            startedAt,
            endedAt: new Date().toISOString(),
            task: 'SPK-09',
            scope: 'Spark native-gfx data-path contracts (integer format/attribute/clear, array-layer view attach, MRT, public + async PBO readback) via public gfx; not release readiness.',
            identity,
            sdk,
            cases: cases ? cases.split(',') : 'all',
            fingerprints,
            drift,
            subset: engines.length !== 3 || !!cases,
            fullyVerified: passed && !anyBlockedIntegration,
            note: anyBlockedIntegration
                ? 'SPK-INT is BLOCKED: the AIR Spark integration layer is not yet wired into the build export surface (SPK-07/08/12). The native-gfx contract cases do not depend on it.'
                : 'All observed cases exercised (no BLOCKED integration case).',
            results,
            passed,
        };
        fs.mkdirSync(path.dirname(outAbs), { recursive: true });
        fs.writeFileSync(outAbs, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.error(
            `[spark-gfx-probe] report=${out} passed=${passed} fullyVerified=${report.fullyVerified} drift=${drift.length}`,
        );
        process.exitCode = passed ? 0 : 1;
    } finally {
        await server.close();
    }
}

run().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
