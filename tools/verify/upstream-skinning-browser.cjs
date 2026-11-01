// Opt-in U05 WebGL2 collector. No builds, downloads, remote deployment, fallback browser, or publication.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { validate } = require('./upstream-skinning-observations.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..');
const fixture = 'test/fixtures/upstream-skinning';
const resourceKinds = [
    'Buffer',
    'Texture',
    'Framebuffer',
    'Renderbuffer',
    'VertexArray',
    'Program',
    'Shader',
    'Query',
    'Sampler',
    'TransformFeedback',
    'Sync',
];
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const errorRecord = (error) => ({ name: error.name, message: error.message, stack: error.stack });
const help =
    'node tools/verify/upstream-skinning-browser.cjs --out=<new-directory> [--browser=chromium|firefox|webkit] [--record-not-run=<verified-blocker>]\nRequires a fresh build/cocosair.module.js and matching installed Playwright browser. Each invocation collects one explicit browser; run all three separately for the matrix. Uses existing browser-engines launchOptions. Writes immutable reports, actual served inputs, readbacks, screenshots, native WebGL handle lifecycle observations and bounded physical close evidence. No automatic build/install/retry, remote URL, canonical promotion, complete GPU memory or full-campaign shutdown claim. --record-not-run does not listen or launch and exits nonzero.';
function parseArgs(argv) {
    if (argv.length === 1 && argv[0] === '--help') return { help: true };
    const values = {};
    for (const arg of argv) {
        const match = /^--(out|browser|record-not-run)=(.+)$/.exec(arg);
        assert(match && !Object.hasOwn(values, match[1]), 'unknown, empty or duplicate option; use --help');
        values[match[1]] = match[2];
    }
    assert(values.out, '--out=<new-directory> is required');
    values.browser ||= 'chromium';
    assert(['chromium', 'firefox', 'webkit'].includes(values.browser), 'browser must be chromium, firefox, or webkit');
    if (values['record-not-run']) assert(values['record-not-run'].trim(), 'a verified blocker is required');
    return values;
}
function walk(directory) {
    return fs
        .readdirSync(path.join(root, directory), { withFileTypes: true })
        .flatMap((entry) =>
            entry.isDirectory() ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`],
        );
}
function fingerprints() {
    return Object.fromEntries(
        [
            ...walk('src'),
            ...walk(fixture),
            'package-lock.json',
            'build/cocosair.module.js',
            'tools/verify/upstream-skinning-browser.cjs',
            'tools/verify/upstream-skinning-browser.test.cjs',
            'tools/verify/upstream-skinning-observations.cjs',
            'tools/verify/browser-engines.cjs',
        ]
            .sort()
            .map((file) => [file, hash(fs.readFileSync(path.join(root, file)))]),
    );
}
async function prepareAssets(expectedHashes) {
    const sources = Object.fromEntries(
        [
            `${fixture}/main.ts`,
            `${fixture}/oracle.ts`,
            `${fixture}/index.html`,
            `${fixture}/rig.gltf`,
            'build/cocosair.module.js',
        ].map((source) => {
            const body = fs.readFileSync(path.join(root, source));
            if (expectedHashes)
                assert.equal(hash(body), expectedHashes[source], `source changed before preparation: ${source}`);
            return [source, body];
        }),
    );
    // Bundle only the local fixture/oracle; the production runtime is served byte-for-byte, never rebuilt.
    const result = await require('esbuild').build({
        absWorkingDir: root,
        entryPoints: [`${fixture}/main.ts`],
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'esm',
        target: 'es2022',
        metafile: true,
        plugins: [
            {
                name: 'native-runtime',
                setup(build) {
                    build.onResolve({ filter: /^cocosair$/ }, () => ({
                        path: '/build/cocosair.module.js',
                        external: true,
                    }));
                    build.onLoad({ filter: /\.ts$/ }, (args) => {
                        const source = path.relative(root, args.path).replace(/\\/g, '/');
                        assert(sources[source], `fixture dependency outside frozen inputs: ${source}`);
                        return { contents: sources[source], loader: 'ts' };
                    });
                },
            },
        ],
    });
    const asset = (source, type, body = sources[source]) => ({ source, type, body: Buffer.from(body) });
    return {
        assets: {
            [`/${fixture}/`]: asset(`${fixture}/index.html`, 'text/html; charset=utf-8'),
            [`/${fixture}/main.ts`]: asset(
                `${fixture}/main.ts`,
                'text/javascript; charset=utf-8',
                result.outputFiles[0].contents,
            ),
            [`/${fixture}/rig.gltf`]: asset(`${fixture}/rig.gltf`, 'model/gltf+json'),
            '/build/cocosair.module.js': asset('build/cocosair.module.js', 'text/javascript; charset=utf-8'),
        },
        metafile: result.metafile,
    };
}
function createHandler(assets, receipts) {
    return (req, res) => {
        const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
        const asset = assets[pathname];
        const status = req.method === 'GET' && asset ? 200 : 404;
        const body = status === 200 ? asset.body : Buffer.from('Unknown fixture resource');
        const receipt = {
            pathname,
            method: req.method,
            status,
            sha256: hash(body),
            bytes: body.length,
            finished: false,
        };
        receipts.push(receipt);
        res.once('finish', () => {
            receipt.finished = true;
        });
        res.once('close', () => {
            receipt.closed = true;
        });
        res.writeHead(status, { 'Content-Type': asset?.type || 'text/plain', 'Cache-Control': 'no-store' });
        res.end(body);
    };
}
function bounded(promise, ms, label) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms} ms`)), ms);
        }),
    ]).finally(() => clearTimeout(timer));
}
async function startServer(assets, receipts) {
    const server = http.createServer(createHandler(assets, receipts));
    const sockets = new Set();
    server.on('connection', (socket) => {
        sockets.add(socket);
        socket.once('close', () => sockets.delete(socket));
    });
    try {
        await bounded(
            new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(0, '127.0.0.1', resolve);
            }),
            10000,
            'local server startup',
        );
    } catch (error) {
        server.close();
        for (const socket of sockets) socket.destroy();
        throw error;
    }
    return {
        origin: `http://127.0.0.1:${server.address().port}`,
        close: () =>
            new Promise((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
                server.closeIdleConnections?.();
            }),
        forceClose() {
            for (const socket of sockets) socket.destroy();
        },
        sockets,
    };
}
// Executed before runtime import. Calls the original native methods exactly once and returns their actual values.
// Handles are weakly keyed; records contain numeric IDs, not strong references that could retain WebGL objects.
function installNativeProbe(kinds) {
    const prototype = globalThis.WebGL2RenderingContext?.prototype;
    if (!prototype) throw new Error('WebGL2RenderingContext is unavailable');
    const contexts = new WeakMap(),
        records = [];
    function record(gl) {
        let row = contexts.get(gl);
        if (!row) {
            row = { gl, resources: {}, drawCalls: 0, readbacks: 0 };
            for (const kind of kinds)
                row.resources[kind] = { ids: new WeakMap(), live: new Set(), created: 0, deleted: 0 };
            contexts.set(gl, row);
            records.push(row);
        }
        return row;
    }
    for (const kind of kinds) {
        const createName = kind === 'Sync' ? 'fenceSync' : `create${kind}`;
        const removeName = `delete${kind}`;
        const create = prototype[createName],
            remove = prototype[removeName];
        if (typeof create !== 'function' || typeof remove !== 'function')
            throw new Error(`missing native ${kind} methods`);
        prototype[createName] = function (...args) {
            const value = Reflect.apply(create, this, args);
            if (value) {
                const row = record(this).resources[kind],
                    id = ++row.created;
                row.ids.set(value, id);
                row.live.add(id);
            }
            return value;
        };
        prototype[removeName] = function (...args) {
            const value = Reflect.apply(remove, this, args);
            const row = record(this).resources[kind],
                id = args[0] && row.ids.get(args[0]);
            if (row.live.delete(id)) row.deleted++;
            return value;
        };
    }
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'readPixels']) {
        const original = prototype[name];
        prototype[name] = function (...args) {
            const value = Reflect.apply(original, this, args);
            const row = record(this);
            row[name === 'readPixels' ? 'readbacks' : 'drawCalls']++;
            if (name === 'readPixels' && ArrayBuffer.isView(args[6])) {
                const data = args[6];
                row.lastReadback = {
                    call: row.readbacks,
                    x: args[0],
                    y: args[1],
                    width: args[2],
                    height: args[3],
                    format: args[4],
                    type: args[5],
                    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice(),
                };
            }
            return value;
        };
    }
    globalThis.__upstreamSkinningNative = {
        readback() {
            const matching = records.filter((row) => row.gl.canvas.id === 'GameCanvas');
            if (matching.length !== 1 || !matching[0].lastReadback) throw new Error('missing native readPixels output');
            const { data, ...metadata } = matching[0].lastReadback;
            let binary = '';
            for (let offset = 0; offset < data.length; offset += 8192)
                binary += String.fromCharCode(...data.subarray(offset, offset + 8192));
            return { ...metadata, base64: btoa(binary) };
        },
        snapshot() {
            const matching = records.filter((row) => row.gl.canvas.id === 'GameCanvas');
            if (matching.length !== 1) throw new Error('exactly one tracked real fixture WebGL2 context is required');
            const row = matching[0],
                gl = row.gl;
            const debug = gl.getExtension('WEBGL_debug_renderer_info');
            return {
                backend: 'webgl2',
                version: gl.getParameter(gl.VERSION),
                renderer: gl.getParameter(gl.RENDERER),
                unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
                contextLost: gl.isContextLost(),
                drawCalls: row.drawCalls,
                readbacks: row.readbacks,
                resources: Object.fromEntries(
                    kinds.map((kind) => {
                        const item = row.resources[kind];
                        return [
                            kind,
                            {
                                created: item.created,
                                deleted: item.deleted,
                                live: [...item.live].sort((a, b) => a - b),
                            },
                        ];
                    }),
                ),
            };
        },
    };
}
function readbackSummary(bytes, width, height) {
    assert(Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0);
    assert.equal(bytes.length, width * height * 4, 'full native RGBA8 framebuffer bytes required');
    let colored = 0;
    const sums = [0, 0, 0, 0];
    for (let offset = 0; offset < bytes.length; offset += 4) {
        if (bytes[offset] > 8 || bytes[offset + 1] > 8 || bytes[offset + 2] > 8) colored++;
        for (let channel = 0; channel < 4; channel++) sums[channel] += bytes[offset + channel];
    }
    return { sha256: hash(bytes), width, height, colored, sums, bytes: bytes.length };
}
function screenshotSummary(bytes) {
    const png = require('pngjs').PNG.sync.read(bytes);
    let colored = 0;
    for (let offset = 0; offset < png.data.length; offset += 4)
        if (png.data[offset] > 8 || png.data[offset + 1] > 8 || png.data[offset + 2] > 8) colored++;
    return { sha256: hash(bytes), width: png.width, height: png.height, colored };
}
function expectedCheckpoints() {
    return ['RGB', 'RGBA'].flatMap((color) => [
        { color, stage: 'combined', expectedVisible: true },
        ...[-1, 0, 1].flatMap((weight, wi) =>
            [-8, 0, 8, 0].map((x, xi) => ({
                color,
                stage: 'frustum',
                index: wi * 4 + xi,
                weight,
                x,
                expectedVisible: x === 0,
            })),
        ),
        ...Array.from({ length: 30 }, (_, index) =>
            ['cycle-before', 'cycle-live', 'cycle-disposed'].map((stage) => ({ color, stage, index })),
        ).flat(),
    ]);
}
function validateNative(snapshot) {
    assert.equal(snapshot.backend, 'webgl2');
    assert.match(snapshot.version, /WebGL 2/);
    assert.equal(typeof snapshot.renderer, 'string');
    assert(snapshot.renderer.length > 0);
    assert.equal(snapshot.contextLost, false);
    for (const name of ['drawCalls', 'readbacks']) assert(Number.isSafeInteger(snapshot[name]) && snapshot[name] >= 0);
    assert.deepEqual(Object.keys(snapshot.resources).sort(), [...resourceKinds].sort());
    for (const row of Object.values(snapshot.resources)) {
        assert(Number.isSafeInteger(row.created) && row.created >= 0);
        assert(Number.isSafeInteger(row.deleted) && row.deleted >= 0 && row.deleted <= row.created);
        assert(Array.isArray(row.live) && row.live.length === new Set(row.live).size);
        assert(row.live.every((id) => Number.isSafeInteger(id) && id > 0 && id <= row.created));
        assert.equal(row.live.length, row.created - row.deleted);
    }
}
function validateEvidence(observation, checkpoints, close, initial, final) {
    const observationValidation = validate(observation); // Independent consumer; never use fixture self-reported PASS.
    assert.deepEqual(
        checkpoints.map((row) => row.detail),
        expectedCheckpoints(),
        'exact checkpoint order and inventory',
    );
    validateNative(initial);
    validateNative(final);
    let previous = initial,
        readbackCall = initial.readbacks;
    for (const row of checkpoints) {
        validateNative(row.native);
        assert(
            row.native.drawCalls >= previous.drawCalls && row.native.readbacks >= previous.readbacks,
            'native counters regressed',
        );
        for (const kind of resourceKinds) {
            assert(row.native.resources[kind].created >= previous.resources[kind].created);
            assert(row.native.resources[kind].deleted >= previous.resources[kind].deleted);
        }
        previous = row.native;
        if (Object.hasOwn(row.detail, 'expectedVisible')) {
            const mode = observation.results.find((entry) => entry.color === row.detail.color);
            const observed = row.detail.stage === 'combined' ? mode.combined : mode.frustum[row.detail.index].pixels;
            assert(
                row.readback && /^[a-f0-9]{64}$/.test(row.readback.sha256),
                'retained native RGBA8 readback required',
            );
            assert.equal(row.readback.format, 6408, 'native RGBA format');
            assert.equal(row.readback.type, 5121, 'native UNSIGNED_BYTE type');
            assert.equal(row.readback.x, 0);
            assert.equal(row.readback.y, 0);
            assert.equal(row.readback.call, row.native.readbacks);
            assert(row.readback.call > readbackCall, 'a different real native readback is required per frame');
            readbackCall = row.readback.call;
            for (const key of ['width', 'height', 'colored', 'sums'])
                assert.deepEqual(row.readback[key], observed[key], `native readback ${key}`);
            assert.equal(row.readback.bytes, observed.width * observed.height * 4);
            assert(row.screenshot && /^[a-f0-9]{64}$/.test(row.screenshot.sha256), 'retained compositor PNG required');
            assert(row.screenshot.width > 0 && row.screenshot.height > 0);
            assert(
                Number.isInteger(row.screenshot.colored) &&
                    row.screenshot.colored >= 0 &&
                    row.screenshot.colored <= row.screenshot.width * row.screenshot.height,
            );
            if (row.detail.expectedVisible) assert(row.screenshot.colored > 30, 'visible compositor frame is blank');
            else assert.equal(row.screenshot.colored, 0, 'outside-frustum compositor pixels');
        }
    }
    for (const kind of resourceKinds) {
        assert(final.resources[kind].created >= previous.resources[kind].created);
        assert(final.resources[kind].deleted >= previous.resources[kind].deleted);
    }
    assert(
        final.drawCalls >= previous.drawCalls && final.readbacks >= previous.readbacks,
        'final native counters regressed',
    );
    assert(
        final.drawCalls > initial.drawCalls && final.readbacks - initial.readbacks >= 26,
        'native draws/readbacks did not execute',
    );
    for (const color of ['RGB', 'RGBA'])
        for (let cycle = 0; cycle < 30; cycle++) {
            const rows = checkpoints.filter(
                (row) =>
                    row.detail.color === color && row.detail.index === cycle && row.detail.stage.startsWith('cycle-'),
            );
            const [before, live, disposed] = rows.map((row) => row.native.resources);
            assert(live.Buffer.created > before.Buffer.created, 'temporary instance must allocate native GPU buffers');
            assert(disposed.Buffer.deleted > live.Buffer.deleted, 'temporary instance must delete native GPU buffers');
            for (const kind of resourceKinds) {
                const baseline = new Set(before[kind].live);
                assert(
                    disposed[kind].live.every((id) => baseline.has(id)),
                    `${color} cycle ${cycle}: retained native ${kind}`,
                );
            }
        }
    assert.equal(close?.receipt?.status, 'released', 'native app release failed');
    assert.deepEqual(close.receipt.pending, []);
    assert.deepEqual(close.receipt.failures, []);
    assert.equal(close.scene, null);
    assert.equal(close.sceneValid, false);
    assert.equal(close.running, false);
    return {
        validated: true,
        observationValidation,
        compositorFrames: 26,
        nativeLifecycleCycles: 60,
        scope: 'Native WebGL handle calls and compositor visibility; not VRAM measurement, independent color/alpha reference, or full-campaign acceptance',
    };
}
function observeChild(child, report, logs) {
    assert(
        child?.pid && child.exitCode === null && child.signalCode === null,
        'browser process already terminated before observation',
    );
    report.browserProcess = { pid: child.pid, exitCode: null, signalCode: null, closeObserved: false };
    child.stdout?.on('data', (bytes) => logs.push({ stream: 'stdout', text: bytes.toString() }));
    child.stderr?.on('data', (bytes) => logs.push({ stream: 'stderr', text: bytes.toString() }));
    return new Promise((resolve) =>
        child.once('close', (code, signal) => {
            Object.assign(report.browserProcess, {
                exitCode: code,
                signalCode: signal,
                closeObserved: true,
                closedAt: new Date().toISOString(),
            });
            resolve();
        }),
    );
}
async function closePhysical({ browserServer, childClosed, server, report, budgetMs = 4000 }) {
    const started = Date.now();
    const close = {
        startedAt: new Date().toISOString(),
        budgetMs,
        browserClosed: !browserServer,
        serverClosed: !server,
        completed: false,
    };
    report.physicalClose = close;
    try {
        // One original shared closing budget. A later cleanup cannot turn this failed boundary into PASS.
        await bounded(
            Promise.all([
                browserServer
                    ? Promise.all([Promise.resolve().then(() => browserServer.close()), childClosed]).then(() => {
                          close.browserClosed = true;
                      })
                    : null,
                server
                    ? Promise.resolve()
                          .then(() => server.close())
                          .then(() => {
                              close.serverClosed = true;
                          })
                    : null,
            ]),
            budgetMs,
            'physical browser/server close',
        );
        if (browserServer) {
            assert.equal(report.browserProcess.closeObserved, true);
            assert.equal(report.browserProcess.exitCode, 0, 'nonzero browser exit');
            assert.equal(report.browserProcess.signalCode, null, 'signaled browser exit is not accepted');
        }
        assert(!server || server.sockets.size === 0, 'server sockets remain open');
        close.completed = true;
    } catch (error) {
        close.error = errorRecord(error);
        report.status = 'FAIL';
        server?.forceClose();
        if (browserServer) {
            try {
                await bounded(browserServer.kill(), 1000, 'failed-close cleanup');
                close.cleanupKillAcknowledged = true;
            } catch (cleanupError) {
                close.cleanupError = errorRecord(cleanupError);
            }
        }
    } finally {
        close.elapsedMs = Date.now() - started;
    }
    return close;
}
async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    if (options.help) {
        console.log(help);
        return 0;
    }
    const out = path.resolve(options.out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.mkdirSync(out); // Atomic refusal to overwrite any existing attempt, including an empty one.
    const save = (name, value) =>
        fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    const report = {
        schema: 'air-upstream-skinning-browser/1',
        startedAt: new Date().toISOString(),
        browser: options.browser,
        status: 'NOT_RUN',
        completed: false,
        canonicalPublication: false,
        physicalCampaignShutdownProof: false,
        scope: 'U05 selected-browser RGB/RGBA realtime morph + skinning, frustum, native disposal and compositor visibility; not combined three-browser acceptance or complete GPU memory proof',
    };
    const logs = [],
        browserLogs = [],
        network = [],
        httpReceipts = [],
        checkpoints = [],
        responses = [],
        loaded = {};
    let stage = 'preflight',
        server,
        browserServer,
        childClosed,
        page,
        expectedAssets;
    try {
        report.gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
        report.inputSha256 = fingerprints();
        save('input-receipt.json', {
            startedAt: report.startedAt,
            gitSha: report.gitSha,
            inputSha256: report.inputSha256,
        });
        if (options['record-not-run']) {
            report.blocker = {
                classification: 'INFRA_BLOCKED',
                stage: 'not-attempted',
                reason: options['record-not-run'],
                noLaunchAttempted: true,
                noServerStarted: true,
            };
        } else {
            stage = 'fixture-compilation';
            const prepared = await prepareAssets(report.inputSha256);
            expectedAssets = prepared.assets;
            fs.mkdirSync(path.join(out, 'served-inputs'));
            report.servedInputs = {};
            for (const [url, asset] of Object.entries(expectedAssets)) {
                const filename = `${Object.keys(report.servedInputs).length}-${path.basename(asset.source)}`;
                fs.writeFileSync(path.join(out, 'served-inputs', filename), asset.body, { flag: 'wx' });
                report.servedInputs[url] = {
                    source: asset.source,
                    file: `served-inputs/${filename}`,
                    sha256: hash(asset.body),
                    bytes: asset.body.length,
                };
            }
            save('fixture-compilation.json', {
                esbuildVersion: require('esbuild').version,
                metafile: prepared.metafile,
            });
            stage = 'browser-tooling';
            const playwright = require('playwright');
            report.playwrightVersion = require('playwright/package.json').version;
            report.launchOptions = { headless: true, ...launchOptions(options.browser), timeout: 30000 };
            const executable = report.launchOptions.executablePath || playwright[options.browser].executablePath();
            report.browserExecutable = { path: executable, sha256: hash(fs.readFileSync(executable)) };
            stage = 'server';
            server = await startServer(expectedAssets, httpReceipts);
            stage = 'browser-launch';
            browserServer = await playwright[options.browser].launchServer(report.launchOptions);
            childClosed = observeChild(browserServer.process(), report, browserLogs);
            const browser = await bounded(
                playwright[options.browser].connect(browserServer.wsEndpoint(), { timeout: 30000 }),
                30000,
                'browser connect',
            );
            report.browserVersion = browser.version();
            stage = 'fixture';
            const context = await bounded(
                browser.newContext({
                    viewport: { width: 640, height: 480 },
                    deviceScaleFactor: 1,
                    serviceWorkers: 'block',
                }),
                10000,
                'browser context',
            );
            await bounded(context.addInitScript(installNativeProbe, resourceKinds), 15000, 'native observer setup');
            page = await bounded(context.newPage(), 15000, 'fixture page');
            const evaluate = (callback) => bounded(page.evaluate(callback), 15000, 'fixture evaluation');
            page.setDefaultTimeout(15000);
            page.on('console', (message) => logs.push({ type: message.type(), text: message.text() }));
            page.on('pageerror', (error) => logs.push({ type: 'pageerror', ...errorRecord(error) }));
            page.on('requestfailed', (request) => network.push({ url: request.url(), failure: request.failure() }));
            page.on('response', (response) => {
                const url = new URL(response.url());
                if (url.origin !== server.origin || !expectedAssets[url.pathname]) {
                    network.push({ url: response.url(), status: response.status(), unexpected: true });
                    return;
                }
                responses.push(
                    response
                        .body()
                        .then((body) => {
                            (loaded[url.pathname] ||= []).push({
                                status: response.status(),
                                sha256: hash(body),
                                bytes: body.length,
                            });
                        })
                        .catch((error) => {
                            network.push({ url: response.url(), error: errorRecord(error) });
                        }),
                );
            });
            const expected = expectedCheckpoints();
            await bounded(
                page.exposeBinding('__captureUpstreamSkinning', async ({ page: current }, detail) => {
                    assert.deepEqual(detail, expected[checkpoints.length], 'unexpected checkpoint or order');
                    const row = {
                        detail,
                        native: await bounded(
                            current.evaluate(() => window.__upstreamSkinningNative.snapshot()),
                            15000,
                            'native checkpoint',
                        ),
                    };
                    checkpoints.push(row);
                    if (Object.hasOwn(detail, 'expectedVisible')) {
                        const raw = await bounded(
                            current.evaluate(() => window.__upstreamSkinningNative.readback()),
                            15000,
                            'native framebuffer receipt',
                        );
                        const nativeBytes = Buffer.from(raw.base64, 'base64');
                        const rgbaFile = `${detail.color}-${detail.stage}-${detail.index ?? 'scene'}.rgba`;
                        fs.writeFileSync(path.join(out, rgbaFile), nativeBytes, { flag: 'wx' });
                        const { base64, ...metadata } = raw;
                        row.readback = {
                            file: rgbaFile,
                            ...metadata,
                            ...readbackSummary(nativeBytes, raw.width, raw.height),
                        };
                        // Presentation only: no native render/step/clock call is introduced by the collector.
                        await bounded(
                            current.evaluate(
                                () =>
                                    new Promise((resolve) =>
                                        requestAnimationFrame(() => requestAnimationFrame(resolve)),
                                    ),
                            ),
                            15000,
                            'compositor presentation',
                        );
                        const file = `${detail.color}-${detail.stage}-${detail.index ?? 'scene'}.png`;
                        const bytes = await current.locator('#GameCanvas').screenshot({ timeout: 15000 });
                        fs.writeFileSync(path.join(out, file), bytes, { flag: 'wx' });
                        row.screenshot = { file, ...screenshotSummary(bytes) };
                    }
                    fs.appendFileSync(path.join(out, 'checkpoint-events.jsonl'), JSON.stringify(row) + '\n');
                }),
                15000,
                'checkpoint binding',
            );
            await page.goto(`${server.origin}/${fixture}/`, { waitUntil: 'load', timeout: 30000 });
            await page.waitForFunction(() => window.__upstreamSkinning?.ready === true, undefined, { timeout: 30000 });
            report.initialNative = await evaluate(() => window.__upstreamSkinningNative.snapshot());
            await evaluate(() => {
                window.__upstreamSkinningOutcome = { state: 'RUNNING' };
                window.__upstreamSkinning
                    .run((detail) => window.__captureUpstreamSkinning(detail))
                    .then(
                        (observation) => {
                            window.__upstreamSkinningOutcome = { state: 'RETURNED', observation };
                        },
                        (error) => {
                            window.__upstreamSkinningOutcome = {
                                state: 'ERROR',
                                error: { name: error.name, message: error.message, stack: error.stack },
                            };
                        },
                    );
            });
            await page.waitForFunction(() => window.__upstreamSkinningOutcome.state !== 'RUNNING', undefined, {
                timeout: 180000,
            });
            const outcome = await evaluate(() => window.__upstreamSkinningOutcome);
            save('outcome.json', outcome);
            assert.equal(outcome.state, 'RETURNED', JSON.stringify(outcome.error));
            save('observations.json', outcome.observation);
            report.preClose = await bounded(
                page.evaluate(() => window.__upstreamSkinning.close()),
                15000,
                'native app close acknowledgment',
            );
            report.finalNative = await evaluate(() => window.__upstreamSkinningNative.snapshot());
            report.validation = validateEvidence(
                outcome.observation,
                checkpoints,
                report.preClose,
                report.initialNative,
                report.finalNative,
            );
            await bounded(Promise.all(responses), 15000, 'served response evidence');
            report.loadedFilesMatch = Object.entries(report.servedInputs).every(
                ([url, asset]) =>
                    loaded[url]?.length === 1 &&
                    loaded[url][0].status === 200 &&
                    loaded[url][0].sha256 === asset.sha256,
            );
            assert(report.loadedFilesMatch, 'actual browser-loaded bytes differ or are missing');
            assert.deepEqual(network, [], 'unexpected/failed network requests');
            assert(!logs.some((row) => row.type === 'pageerror' || row.type === 'error'), 'browser errors retained');
            assert(
                httpReceipts.length === Object.keys(expectedAssets).length &&
                    httpReceipts.every((row) => row.finished && row.status === 200),
                'incomplete or unexpected HTTP responses',
            );
            report.status = 'PASS';
            report.completed = true;
        }
    } catch (error) {
        report.error = { stage, ...errorRecord(error) };
        report.status = ['preflight', 'browser-tooling', 'server', 'browser-launch'].includes(stage)
            ? 'INFRA_BLOCKED'
            : 'FAIL';
    } finally {
        // Raw failures, partial checkpoints and the original close failure survive all cleanup paths.
        if (page && !report.preClose) {
            try {
                save(
                    'partial-outcome.json',
                    await bounded(
                        page.evaluate(() => window.__upstreamSkinningOutcome || null),
                        2000,
                        'partial observation',
                    ),
                );
            } catch (error) {
                report.partialObservationError = errorRecord(error);
            }
        }
        if (browserServer || server) await closePhysical({ browserServer, childClosed, server, report });
        if (report.inputSha256) {
            try {
                report.inputsUnchanged = JSON.stringify(fingerprints()) === JSON.stringify(report.inputSha256);
            } catch (error) {
                report.inputsUnchanged = false;
                report.fingerprintError = errorRecord(error);
            }
            if (!report.inputsUnchanged) report.status = 'FAIL';
        }
        save('browser-process-log.json', browserLogs);
        save('page-log.json', { logs, network });
        save('http-responses.json', { received: loaded, served: httpReceipts });
        save('checkpoints.json', checkpoints);
        if (network.length || logs.some((row) => row.type === 'pageerror' || row.type === 'error'))
            report.status = 'FAIL';
        report.finishedAt = new Date().toISOString();
        report.artifactManifest = 'artifact-sha256.json';
        report.completed = report.completed && report.status === 'PASS';
        report.collectorExitCode = report.status === 'PASS' ? 0 : 1;
        save('report.json', report);
        const artifactFiles = (directory = '') =>
            fs.readdirSync(path.join(out, directory), { withFileTypes: true }).flatMap((entry) => {
                const name = path.posix.join(directory, entry.name);
                return entry.isDirectory() ? artifactFiles(name) : [name];
            });
        save(report.artifactManifest, {
            scope: 'All retained attempt artifacts, including report.json; this index excludes itself.',
            sha256: Object.fromEntries(
                artifactFiles()
                    .sort()
                    .map((name) => [name, hash(fs.readFileSync(path.join(out, name)))]),
            ),
        });
        console.log(
            JSON.stringify({
                status: report.status,
                report: path.join(out, 'report.json'),
                exitCode: report.collectorExitCode,
            }),
        );
    }
    return report.collectorExitCode;
}
module.exports = {
    parseArgs,
    prepareAssets,
    createHandler,
    installNativeProbe,
    readbackSummary,
    screenshotSummary,
    expectedCheckpoints,
    validateEvidence,
    validateNative,
    observeChild,
    closePhysical,
    resourceKinds,
    main,
};
if (require.main === module)
    main()
        .then((code) => {
            process.exit(code);
        })
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
