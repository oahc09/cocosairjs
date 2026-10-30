/* Focused WebGPU host compatibility collector. Writes only a new --out directory.
 * Does not patch an engine/host, install tools, publish evidence, or certify Android.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { PNG } = require('pngjs');
const { serveStaticFile } = require('./static-file-response.cjs');
const { SCENE_IDS, SCENE_KINDS, matrixPassed } = require('./runtime-interop/scene-contract.cjs');
const { verifyScenePresentation } = require('./runtime-interop/scene-oracles.cjs');

const ROOT = path.resolve(__dirname, '../..');
const CASE_IDS = ['canvas-dom-events', 'module-assets', 'wasm-shader', 'gpu-submit-present', 'gpu-errors-loss'];
const ASSET_FILES = [
    'examples/gltf-basic/assets/BoxTextured.glb',
    'examples/gltf-basic/assets/BoxTextured.LICENSE.md',
    'examples/gltf-skin/assets/SimpleSkin.gltf',
    'examples/gltf-skin/assets/SimpleSkin.LICENSE.md',
    ...['skinningData', 'inverseBindMatrices', 'geometry', 'animation'].map(
        (name) => `examples/gltf-skin/assets/SimpleSkin_${name}.bin`,
    ),
];
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const portable = (file) => path.relative(ROOT, file).replace(/\\/g, '/');

async function withDeadline(operation, milliseconds, label) {
    let timer;
    try {
        return await Promise.race([
            Promise.resolve().then(operation),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(Error(`${label} exceeded ${milliseconds}ms`)), milliseconds);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

function parseArgs(argv) {
    const args = {};
    for (const arg of argv) {
        const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
        if (
            !match ||
            ![
                'out',
                'host',
                'bundle',
                'browser',
                'executable',
                'capture-executable',
                'host-build',
                'host-patches',
                'headed',
                'host-label',
                'matrix',
            ].includes(match[1])
        )
            throw Error(`Unknown argument: ${arg}`);
        if (Object.hasOwn(args, match[1])) throw Error(`Duplicate argument: ${match[1]}`);
        args[match[1]] = match[2] ?? true;
    }
    if (typeof args.out !== 'string' || !args.out) throw Error('--out=<new-directory> is required');
    args.host ??= 'browser';
    args.browser ??= 'chromium';
    args.bundle ??= 'build/cocosair.module.js';
    if (!['browser', 'mystral'].includes(args.host)) throw Error('--host must be browser or mystral');
    if (!['chromium', 'edge'].includes(args.browser)) throw Error('--browser must be chromium or edge');
    if (args.host === 'mystral' && typeof args.executable !== 'string')
        throw Error('--host=mystral requires --executable=<existing-file>');
    for (const name of ['bundle', 'executable', 'capture-executable', 'host-build', 'host-patches', 'host-label'])
        if (args[name] !== undefined && typeof args[name] !== 'string') throw Error(`--${name} needs a value`);
    if (args.headed !== undefined && args.headed !== true) throw Error('--headed does not take a value');
    if (args.matrix !== undefined && args.matrix !== true) throw Error('--matrix does not take a value');
    if (args['capture-executable'] !== undefined && (args.host !== 'mystral' || !args.headed))
        throw Error('--capture-executable requires --host=mystral --headed');
    if (args['host-build'] !== undefined && args.host !== 'mystral')
        throw Error('--host-build requires --host=mystral');
    if (args['host-patches'] !== undefined && !args['host-build']) throw Error('--host-patches requires --host-build');
    return args;
}

function probesPassed(result) {
    if (result?.schema !== 'air-runtime-interop-probes-v1' || result.completed !== true || result.pass !== true)
        return false;
    const cases = result.cases;
    return (
        Array.isArray(cases) &&
        cases.length === CASE_IDS.length &&
        CASE_IDS.every((id) => cases.filter((row) => row.id === id && row.status === 'PASS').length === 1)
    );
}

function verifyPresentation(bytes, kind) {
    const png = PNG.sync.read(bytes);
    if (png.width < 16 || png.height < 16) throw Error('Presentation image is too small');
    const pixel = (x, y) => [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)];
    const center = pixel(Math.floor(png.width / 2), Math.floor(png.height / 2));
    const corner = pixel(2, 2);
    let backgroundPixels = 0;
    let subjectPixels = 0;
    for (let i = 0; i < png.data.length; i += 4) {
        const [r, g, b, a] = png.data.subarray(i, i + 4);
        if (a < 250) continue;
        if (b - r >= 20 && b - g >= 10) backgroundPixels++;
        if (r - g >= 35 && r - b >= 35) subjectPixels++;
    }
    const pass =
        kind === 'air'
            ? backgroundPixels >= 64 && subjectPixels >= 64
            : center.every((v, i) => Math.abs(v - [255, 0, 0, 255][i]) <= 3) &&
              corner.every((v, i) => Math.abs(v - [0, 0, 255, 255][i]) <= 3);
    return {
        pass,
        status: pass ? 'PASS' : 'FAIL',
        channel: 'browser-compositor-canvas-screenshot',
        width: png.width,
        height: png.height,
        center,
        corner,
        backgroundPixels,
        subjectPixels,
        sha256: sha256(bytes),
    };
}

function inputs(bundle) {
    function under(directory) {
        return fs.readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
            const file = path.join(directory, item.name);
            return item.isDirectory() ? under(file) : [file];
        });
    }
    const files = [
        __filename,
        path.join(__dirname, 'static-file-response.cjs'),
        path.join(ROOT, 'tools/build/webgpu-assets.cjs'),
        path.join(ROOT, 'tools/build/runtime-interop-capture.cjs'),
        path.join(ROOT, 'vendor/webgpu/manifest.json'),
        path.join(ROOT, 'package-lock.json'),
        ...ASSET_FILES.map((file) => path.join(ROOT, file)),
        ...under(path.join(__dirname, 'runtime-interop')),
        bundle,
        bundle + '.map',
        bundle + '.sources.json',
        path.join(ROOT, 'tools/build/source-binding.cjs'),
        path.join(ROOT, 'tools/build/source-map-publication.cjs'),
        ...fs
            .readdirSync(path.join(path.dirname(bundle), 'webgpu'))
            .map((v) => path.join(path.dirname(bundle), 'webgpu', v)),
    ];
    return Object.fromEntries(
        files.filter((v) => fs.statSync(v).isFile()).map((file) => [portable(file), sha256(fs.readFileSync(file))]),
    );
}

function sourceBinding(bundle) {
    return require('../build/source-binding.cjs').verifySourceBinding(ROOT, bundle);
}

function hostBuildBinding(receiptFile, executable, patchDirectory) {
    const raw = fs.readFileSync(receiptFile);
    const receipt = JSON.parse(raw);
    const directory = patchDirectory || path.join(__dirname, 'runtime-interop/host-patches');
    if (!fs.existsSync(path.join(directory, 'manifest.json')))
        throw Error('Frozen host patch manifest unavailable; supply --host-patches=<verified-archive-directory>');
    const manifestBytes = fs.readFileSync(path.join(directory, 'manifest.json'));
    const manifest = JSON.parse(manifestBytes);
    const sources = Object.fromEntries(
        Object.entries(receipt.sourceFiles || {}).sort(([a], [b]) => a.localeCompare(b, 'en')),
    );
    if (
        receipt.schema !== 'mystral-local-host-build-v1' ||
        receipt.compiled !== true ||
        receipt.sourceInputsUnchanged !== true ||
        receipt.versionExit !== 0 ||
        receipt.upstream !== manifest.upstream.commit ||
        !Array.isArray(receipt.commands) ||
        receipt.commands.length < 2 ||
        !['configure', 'build'].every((label) => receipt.commands.some((command) => command.label === label)) ||
        !receipt.commands.every((command) => command.pass === true && command.exitCode === 0 && !command.signal) ||
        sha256(Buffer.from(JSON.stringify(sources))) !== manifest.compiledSourcesSha256 ||
        receipt.executable?.sha256 !== sha256(fs.readFileSync(executable)) ||
        receipt.executable.bytes !== fs.statSync(executable).size ||
        !manifest.files.every((file) => sources[file.path] === file.patchedSha256)
    )
        throw Error('Host build receipt does not bind this executable to the frozen patched source');
    for (const artifact of [manifest.patch, manifest.buildProfile, manifest.license]) {
        if (typeof artifact?.file !== 'string' || path.basename(artifact.file) !== artifact.file)
            throw Error('Invalid host patch artifact path');
        if (sha256(fs.readFileSync(path.join(directory, artifact.file))) !== artifact.sha256)
            throw Error(`Host patch artifact changed: ${artifact.file}`);
    }
    return {
        matches: true,
        upstream: receipt.upstream,
        receipt: portable(receiptFile),
        receiptSha256: sha256(raw),
        manifestSha256: sha256(manifestBytes),
        patchSha256: manifest.patch.sha256,
        compiledSourcesSha256: manifest.compiledSourcesSha256,
        executableSha256: receipt.executable.sha256,
    };
}

async function startServer(bundle) {
    const probeRoot = path.join(__dirname, 'runtime-interop');
    const probeNames = new Set([
        'probes.mjs',
        'module-fixture.mjs',
        'air-smoke.mjs',
        'scene-runner.mjs',
        'scene-models.mjs',
        'scene-ui.mjs',
        'scene-compute.mjs',
    ]);
    const gpuNames = new Set(['glslang.js', 'glslang.wasm', 'twgsl.js', 'twgsl.wasm']);
    const server = http.createServer((req, res) => {
        try {
            if (!['GET', 'HEAD'].includes(req.method)) {
                res.writeHead(405, { Allow: 'GET, HEAD' }).end();
                return;
            }
            const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
            if (pathname === '/probe.html') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                if (req.method === 'HEAD') return res.end();
                res.end(
                    '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%}canvas{display:block;width:320px;height:240px}</style></head><body><canvas id="GameCanvas" width="320" height="240"></canvas></body></html>',
                );
                return;
            }
            if (pathname === '/favicon.ico') return res.writeHead(204).end();
            let file;
            if (pathname === '/sdk/cocosair.module.js') file = bundle;
            else if (pathname.startsWith('/sdk/webgpu/')) {
                const base = path.join(path.dirname(bundle), 'webgpu');
                if (!gpuNames.has(pathname.slice('/sdk/webgpu/'.length))) return res.writeHead(404).end();
                file = path.resolve(base, pathname.slice('/sdk/webgpu/'.length));
                if (!fs.realpathSync(file).startsWith(fs.realpathSync(base) + path.sep))
                    throw Error('Outside asset directory');
            } else if (pathname.startsWith('/probes/')) {
                if (!probeNames.has(pathname.slice('/probes/'.length))) return res.writeHead(404).end();
                file = path.resolve(probeRoot, pathname.slice('/probes/'.length));
                if (!fs.realpathSync(file).startsWith(fs.realpathSync(probeRoot) + path.sep))
                    throw Error('Outside probe directory');
            } else if (pathname.startsWith('/assets/')) {
                const relative = pathname.slice('/assets/'.length);
                const parts = relative.split('/');
                const candidate = `examples/${parts[0]}/assets/${parts.slice(1).join('/')}`;
                if (!ASSET_FILES.includes(candidate)) return res.writeHead(404).end();
                file = path.join(ROOT, candidate);
                const assetRoot = path.join(ROOT, 'examples', parts[0], 'assets');
                if (!fs.realpathSync(file).startsWith(fs.realpathSync(assetRoot) + path.sep))
                    throw Error('Outside scene asset directory');
            }
            if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
            const type =
                {
                    '.wasm': 'application/wasm',
                    '.gltf': 'model/gltf+json',
                    '.glb': 'model/gltf-binary',
                    '.bin': 'application/octet-stream',
                    '.md': 'text/plain',
                }[path.extname(file)] || 'text/javascript';
            serveStaticFile(req, res, file, type);
        } catch (error) {
            res.writeHead(400).end('Bad request');
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return {
        origin: `http://127.0.0.1:${server.address().port}`,
        close: () =>
            new Promise((resolve) => {
                server.close(resolve);
                server.closeAllConnections();
            }),
    };
}

async function runBrowser(args, out, origin) {
    const playwright = require('playwright');
    const engine = playwright.chromium;
    // Use real browser defaults: no software WebGPU or unsafe feature enablement.
    const options = { headless: !args.headed };
    const executable = args.executable || (args.browser === 'chromium' ? process.env.AIR_CHROMIUM_PATH : undefined);
    if (executable) options.executablePath = path.resolve(executable);
    else if (args.browser === 'edge') options.channel = 'msedge';
    const result = { errors: [], console: [], completed: false, pass: false, launchOptions: options };
    let browserServer;
    let browser;
    let child;
    let exitStatus;
    let closeStatus;
    let boundary;
    try {
        browserServer = await engine.launchServer(options);
        child = browserServer.process();
        child.once('exit', (code, signal) => {
            exitStatus = { code, signal };
        });
        child.once('close', (code, signal) => {
            closeStatus = { code, signal };
        });
        browser = await engine.connect(browserServer.wsEndpoint());
        result.version = browser.version();
        const actualExecutable = options.executablePath || child.spawnfile;
        if (actualExecutable && fs.existsSync(actualExecutable))
            result.executable = {
                name: path.basename(actualExecutable),
                sha256: sha256(fs.readFileSync(actualExecutable)),
                bytes: fs.statSync(actualExecutable).size,
            };
        for (const kind of ['probes', 'air', ...(args.matrix ? SCENE_KINDS : [])]) {
            await withDeadline(
                async () => {
                    const page = await browser.newPage({ viewport: { width: 320, height: 240 }, deviceScaleFactor: 1 });
                    page.setDefaultTimeout(90000);
                    page.on('pageerror', (error) => result.errors.push({ kind, error: String(error) }));
                    page.on('console', (message) =>
                        result.console.push({ kind, type: message.type(), text: message.text() }),
                    );
                    let previousBytes;
                    const captured = new Set();
                    await page.exposeFunction('__interopCapture', async ({ phase } = {}) => {
                        const scene = SCENE_KINDS.includes(kind);
                        if (scene && !['before', 'after'].includes(phase))
                            throw Error('Scene capture phase is invalid');
                        const key = scene ? phase : 'single';
                        if (captured.has(key) || (phase === 'after' && !previousBytes))
                            throw Error('Scene capture order is invalid');
                        captured.add(key);
                        const filename = `${kind}${scene ? '-' + phase : ''}-presentation.png`;
                        const bytes = await page.locator('#GameCanvas').screenshot({ path: path.join(out, filename) });
                        const verified = scene
                            ? verifyScenePresentation(bytes, kind, { phase, previousBytes })
                            : verifyPresentation(bytes, kind);
                        if (phase === 'before') previousBytes = bytes;
                        return { ...verified, channel: 'browser-compositor-canvas-screenshot', file: filename };
                    });
                    await page.goto(`${origin}/probe.html`);
                    try {
                        result[kind] = await page.evaluate(
                            async ({ origin, kind }) => {
                                const canvas = document.querySelector('#GameCanvas');
                                const capturePresentation = ({ phase } = {}) =>
                                    globalThis.__interopCapture(phase ? { phase } : {});
                                if (kind === 'probes') {
                                    const { runRuntimeInterop } = await import(`${origin}/probes/probes.mjs`);
                                    return runRuntimeInterop({
                                        canvas,
                                        assetBaseUrl: `${origin}/sdk/webgpu/`,
                                        moduleUrl: `${origin}/probes/module-fixture.mjs`,
                                        capturePresentation,
                                    });
                                }
                                if (kind.startsWith('scene-')) {
                                    const { runSceneScenario } = await import(`${origin}/probes/scene-runner.mjs`);
                                    return runSceneScenario({
                                        id: kind.slice(6),
                                        canvas,
                                        bundleUrl: `${origin}/sdk/cocosair.module.js`,
                                        assetRootUrl: `${origin}/assets/`,
                                        capturePresentation,
                                    });
                                }
                                const { runAirSmoke } = await import(`${origin}/probes/air-smoke.mjs`);
                                return runAirSmoke({
                                    canvas,
                                    bundleUrl: `${origin}/sdk/cocosair.module.js`,
                                    capturePresentation,
                                });
                            },
                            { origin, kind },
                        );
                    } catch (error) {
                        result[kind] = { status: 'FAIL', completed: false, error: String(error) };
                    }
                    boundary = await page.evaluate(() => ({ acknowledged: true, capturedAt: Date.now() }));
                    await page.close();
                },
                90000,
                `${kind} host execution`,
            );
        }
        result.completed = true;
        result.pass =
            probesPassed(result.probes) &&
            result.air?.status === 'PASS' &&
            (!args.matrix || matrixPassed(result)) &&
            result.errors.length === 0 &&
            !result.console.some((row) => row.type === 'error');
        result.applicationPass = result.pass;
    } catch (error) {
        result.errors.push({ error: String(error), stack: error.stack });
    } finally {
        if (browserServer) {
            const started = Date.now();
            let timer;
            let closeError;
            try {
                await Promise.race([
                    (async () => {
                        if (browser) await browser.close();
                        await browserServer.close();
                    })(),
                    new Promise((_, reject) => {
                        timer = setTimeout(() => reject(Error('Original four-second close budget exceeded')), 4000);
                    }),
                ]);
            } catch (error) {
                closeError = String(error);
                await withDeadline(() => browserServer.kill(), 1000, 'Forced browser cleanup').catch((error) => {
                    closeError += `; ${error}`;
                });
            } finally {
                clearTimeout(timer);
            }
            await new Promise((resolve) => setTimeout(resolve, 0));
            let pidGone = false;
            try {
                process.kill(child.pid, 0);
            } catch (error) {
                pidGone = error.code === 'ESRCH';
            }
            result.shutdown = {
                boundary,
                pid: child.pid,
                exitStatus,
                closeStatus,
                pidGone,
                closeError,
                elapsedMs: Date.now() - started,
                waitContract:
                    process.platform === 'win32'
                        ? 'ChildProcess exit+close; ECHILD not applicable on Windows'
                        : 'ChildProcess exit+close; ECHILD not measured',
            };
            result.shutdown.pass = Boolean(
                boundary?.acknowledged &&
                exitStatus?.code === 0 &&
                !exitStatus.signal &&
                closeStatus?.code === 0 &&
                !closeStatus.signal &&
                pidGone &&
                !closeError,
            );
            if (!result.shutdown.pass) result.pass = false;
        }
    }
    return result;
}

async function main(argv) {
    const args = parseArgs(argv);
    const out = path.resolve(ROOT, args.out);
    const bundle = path.resolve(ROOT, args.bundle);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.mkdirSync(out); // Refuse to replace any earlier successful or failed attempt.
    const report = {
        schema: 'air-runtime-interop-v1',
        measuredAt: new Date().toISOString(),
        scope: args.matrix
            ? 'desktop WebGPU host compatibility plus AIR PBR/skinning/UI/compute matrix'
            : 'focused desktop WebGPU host compatibility and one AIR scene',
        matrixRequested: !!args.matrix,
        sceneIds: args.matrix ? SCENE_IDS : [],
        subset: true,
        releaseReady: false,
        host: args.host,
        hostLabel: args['host-label'] ?? null,
        completed: false,
        pass: false,
    };
    let server;
    const save = () => fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    save();
    try {
        const manifest = require('../build/webgpu-assets.cjs').verify(ROOT);
        for (const [name, expected] of Object.entries(manifest.files)) {
            if (sha256(fs.readFileSync(path.join(path.dirname(bundle), 'webgpu', name))) !== expected.sha256)
                throw Error(`Deployed WebGPU asset differs from frozen manifest: ${name}`);
        }
        report.head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
        report.tooling = {
            node: process.version,
            esbuild: require('esbuild').version,
            pngjs: require('pngjs/package.json').version,
            ...(args.host === 'browser' ? { playwright: require('playwright/package.json').version } : {}),
        };
        report.bundle = portable(bundle);
        report.sourceBinding = sourceBinding(bundle);
        if (!report.sourceBinding.matches)
            throw Error('Bundle source binding failed; rebuild the bundle and its receipt');
        report.inputs = inputs(bundle);
        if (args['host-build'])
            report.hostBuild = hostBuildBinding(
                path.resolve(ROOT, args['host-build']),
                path.resolve(args.executable),
                args['host-patches'] ? path.resolve(ROOT, args['host-patches']) : undefined,
            );
        save();
        server = await startServer(bundle);
        report.execution =
            args.host === 'browser'
                ? await runBrowser(args, out, server.origin)
                : await require('./runtime-interop/native-host.cjs').runNative({
                      executable: path.resolve(args.executable),
                      root: ROOT,
                      out,
                      origin: server.origin,
                      assetBaseUrl: `${server.origin}/sdk/webgpu/`,
                      moduleUrl: `${server.origin}/probes/module-fixture.mjs`,
                      bundleUrl: `${server.origin}/sdk/cocosair.module.js`,
                      captureExecutable: args['capture-executable']
                          ? path.resolve(args['capture-executable'])
                          : undefined,
                      headed: Boolean(args.headed),
                      verifyPresentation,
                      matrix: !!args.matrix,
                  });
        report.inputsUnchanged = JSON.stringify(inputs(bundle)) === JSON.stringify(report.inputs);
        report.sourceBindingAfter = sourceBinding(bundle);
        if (args['host-build'])
            report.hostBuildAfter = hostBuildBinding(
                path.resolve(ROOT, args['host-build']),
                path.resolve(args.executable),
                args['host-patches'] ? path.resolve(ROOT, args['host-patches']) : undefined,
            );
        report.completed = report.execution.completed === true;
        report.pass =
            report.execution.pass === true &&
            probesPassed(report.execution.probes) &&
            report.execution.air?.status === 'PASS' &&
            (!args.matrix || matrixPassed(report.execution)) &&
            report.inputsUnchanged &&
            (!args['host-build'] || JSON.stringify(report.hostBuildAfter) === JSON.stringify(report.hostBuild)) &&
            report.sourceBinding.matches &&
            JSON.stringify(report.sourceBindingAfter) === JSON.stringify(report.sourceBinding);
    } catch (error) {
        report.error = String(error);
        report.stack = error.stack;
    } finally {
        if (server) await server.close();
        report.finishedAt = new Date().toISOString();
        report.status = report.pass ? 'PASS' : 'FAIL';
        save();
    }
    console.log(
        JSON.stringify({
            status: report.status,
            completed: report.completed,
            host: report.host,
            report: portable(path.join(out, 'report.json')),
        }),
    );
    return report.pass ? 0 : 1;
}

module.exports = {
    CASE_IDS,
    parseArgs,
    probesPassed,
    verifyPresentation,
    startServer,
    sourceBinding,
    hostBuildBinding,
    withDeadline,
};
if (require.main === module)
    main(process.argv.slice(2))
        .then((code) => {
            process.exitCode = code;
        })
        .catch((error) => {
            console.error(String(error));
            process.exitCode = 1;
        });
