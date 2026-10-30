// Opt-in U08 real-browser collection. No builds, canonical writes, remote servers, retries, or browser fallback.
// --help and --record-not-run never load Playwright, listen, or launch. An authorized environment is required.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { validateObservations } = require('./upstream-experiments-observations.cjs');
const sh = require('./upstream-probe-sh-reference.js');
const root = path.resolve(__dirname, '../..');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const errorRecord = (error) => ({ name: error.name, message: error.message, stack: error.stack });
const formats = ['depth16', 'depth24', 'depth32f', 'depth24-stencil8'];
const depthFixture = 'test/fixtures/upstream-depth-experiments';
const nativeFixture = 'test/fixtures/upstream-experiments-transparency';
const probeFixture = 'test/fixtures/upstream-probe-capture';
const plans = [
    ...['normal', 'reverse'].flatMap((mode) =>
        formats.map((format) => ({
            id: `isolated-${mode}-${format}`,
            kind: 'isolated',
            fixture: `${depthFixture}/index.html`,
            options: { mode, format },
            required: [`${depthFixture}/index.html`, `${depthFixture}/probe.mjs`, `${depthFixture}/model.mjs`],
        })),
    ),
    {
        id: 'native-normal-depth24-stencil8',
        kind: 'native',
        fixture: `${nativeFixture}/index.html`,
        options: {},
        required: [
            `${nativeFixture}/index.html`,
            `${nativeFixture}/probe.mjs`,
            `${nativeFixture}/effect.mjs`,
            `${depthFixture}/model.mjs`,
            'tools/debug/effect-layout.js',
            'build/cocosair.module.js',
        ],
    },
    {
        id: 'probe-serial-atlas',
        kind: 'probe',
        fixture: `${probeFixture}/upstream-probe-capture.html`,
        required: [
            `${probeFixture}/upstream-probe-capture.html`,
            `${probeFixture}/upstream-probe-capture.js`,
            'tools/verify/upstream-probe-sh-reference.js',
        ],
    },
];
const rejections = [
    { id: 'native-reverse-z', options: { mode: 'reverse' }, prefix: 'UNSUPPORTED_NATIVE_DEPTH:' },
    { id: 'native-float-depth', options: { format: 'depth32f' }, prefix: 'UNSUPPORTED_NATIVE_DEPTH:' },
    { id: 'native-webgpu', options: { backend: 'webgpu' }, prefix: 'UNSUPPORTED_BACKEND:' },
    { id: 'native-msaa', options: { samples: 4 }, prefix: 'UNSUPPORTED_MSAA:' },
    { id: 'native-reversed-shadows', options: { shadows: true }, prefix: 'UNSUPPORTED_SHADOWS:' },
];
function parseArgs(argv) {
    if (argv.length === 1 && argv[0] === '--help') return { help: true };
    const values = {};
    for (const arg of argv) {
        const match = /^--(browser|out|record-not-run)=(.+)$/.exec(arg);
        if (!match || values[match[1]] !== undefined)
            throw new Error('Unknown, empty, or duplicate option; use --help');
        values[match[1]] = match[2];
    }
    if (!['chromium', 'firefox', 'webkit'].includes(values.browser) || !values.out)
        throw new Error('Explicit --browser=chromium|firefox|webkit and --out=<new-directory> are required');
    return values;
}
function freshOutput(out) {
    const directory = path.resolve(out);
    fs.mkdirSync(path.dirname(directory), { recursive: true });
    // No recursive mkdir for the attempt itself: a concurrent/existing attempt must fail, never merge.
    fs.mkdirSync(directory);
    return directory;
}
function walk(directory) {
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap((entry) =>
            entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)],
        );
}
function fingerprints() {
    const files = [
        ...new Set([
            ...['src', depthFixture, nativeFixture, probeFixture].flatMap((directory) =>
                walk(path.join(root, directory)).map((file) => path.relative(root, file).split(path.sep).join('/')),
            ),
            ...[
                'upstream-experiment-browser.cjs',
                'upstream-experiment-browser.test.cjs',
                'upstream-experiments-observations.cjs',
                'upstream-depth-source-audit.cjs',
                'upstream-probe-sh-reference.js',
                'browser-engines.cjs',
                'competitive-example-server.cjs',
            ].map((file) => `tools/verify/${file}`),
            'tools/debug/effect-layout.ts',
            'tools/build/build.cjs',
            'tools/build/build-number.json',
            'package.json',
            'package-lock.json',
            'ai/ledgers/upstream-update/acceptance-manifest.json',
            'docs/reference/upstream-depth-experiments.md',
            'docs/reference/upstream-probe-sh-research.md',
            'build/cocosair.module.js',
            'build/cocosair.module.js.map',
        ]),
    ].sort();
    return Object.fromEntries(
        files.map((file) => [
            file,
            fs.existsSync(path.join(root, file)) ? hash(fs.readFileSync(path.join(root, file))) : null,
        ]),
    );
}
function dependencyFingerprints() {
    const result = {};
    const { createRequire } = require('node:module');
    const playwrightPath = require.resolve('playwright/package.json');
    const esbuildPath = require.resolve('esbuild/package.json');
    const packages = {
        playwright: playwrightPath,
        'playwright-core': createRequire(playwrightPath).resolve('playwright-core/package.json'),
        esbuild: esbuildPath,
    };
    for (const [name, packagePath] of Object.entries(packages)) {
        const directory = path.dirname(packagePath);
        result[name] = {
            version: JSON.parse(fs.readFileSync(packagePath)).version,
            files: Object.fromEntries(
                walk(directory).map((file) => [
                    path.relative(directory, file).split(path.sep).join('/'),
                    hash(fs.readFileSync(file)),
                ]),
            ),
        };
    }
    // Capture the platform-specific compiler binary too, not just its JS facade or package-lock declaration.
    const esbuildBinary =
        process.env.ESBUILD_BINARY_PATH ||
        createRequire(esbuildPath).resolve(
            `@esbuild/${process.platform}-${process.arch}/${process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild'}`,
        );
    result.esbuildExecutable = {
        platform: process.platform,
        arch: process.arch,
        sha256: hash(fs.readFileSync(esbuildBinary)),
    };
    return result;
}
function servedInput(file) {
    const local = file === 'tools/debug/effect-layout.js' ? file.slice(0, -3) + '.ts' : file;
    const bytes = fs.readFileSync(path.join(root, local));
    const body = local.endsWith('.ts')
        ? Buffer.from(
              require('esbuild').transformSync(bytes.toString(), {
                  loader: 'ts',
                  format: 'esm',
                  target: 'es2022',
              }).code,
          )
        : bytes;
    return { source: local, sourceSha256: hash(bytes), sha256: hash(body), transformed: local !== file };
}
// Runs inside the real page before fixture scripts. Every wrapper forwards the original call unchanged.
// Capturing byte copies perturbs CPU readback/total timings. These runs are NOT uninstrumented benchmarks.
function installGLTrace() {
    const trace = {
        schema: 'air-upstream-webgl-trace/1',
        contexts: [],
        sources: [],
        readbacks: [],
        allocations: [],
        framebufferChecks: [],
        errors: [],
        queryEvents: [],
        issues: [],
        resources: {},
        cpuTimingPerturbedByReadbackCapture: true,
        gpuSHConvolution: false,
        byteOrder: new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 'little-endian' : 'big-endian',
    };
    globalThis.__upstreamGLTrace = trace;
    const ids = new WeakMap(),
        contexts = new WeakMap();
    let nextId = 1;
    const id = (object) => {
        if (!object) return null;
        if (!ids.has(object)) ids.set(object, nextId++);
        return ids.get(object);
    };
    const proto = globalThis.WebGL2RenderingContext?.prototype;
    if (!proto) {
        trace.issues.push('WebGL2RenderingContext unavailable');
        return;
    }
    const wrap = (name, observe) => {
        const original = proto[name];
        if (typeof original !== 'function') return;
        proto[name] = function (...args) {
            const value = original.apply(this, args);
            try {
                observe.call(this, args, value);
            } catch (error) {
                trace.issues.push(`${name}: ${String(error)}`);
            }
            return value;
        };
    };
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
        const context = originalGetContext.apply(this, args);
        if (args[0] === 'webgl2' && context && !contexts.has(context)) {
            const debug = context.getExtension('WEBGL_debug_renderer_info');
            const index = trace.contexts.length;
            contexts.set(context, index);
            trace.contexts.push({
                id: index,
                backend: 'webgl2',
                renderer: context.getParameter(context.RENDERER),
                vendor: context.getParameter(context.VENDOR),
                version: context.getParameter(context.VERSION),
                shadingLanguage: context.getParameter(context.SHADING_LANGUAGE_VERSION),
                unmaskedRenderer: debug ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
                unmaskedVendor: debug ? context.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
                driver: null,
                driverNote: 'Not separately exposed by WebGL; never inferred from renderer.',
                attributes: context.getContextAttributes(),
                userAgent: navigator.userAgent,
            });
        }
        return context;
    };
    for (const kind of [
        'Buffer',
        'Framebuffer',
        'Program',
        'Query',
        'Renderbuffer',
        'Sampler',
        'Shader',
        'Sync',
        'Texture',
        'TransformFeedback',
        'VertexArray',
    ]) {
        wrap(kind === 'Sync' ? 'fenceSync' : `create${kind}`, function (_args, object) {
            if (object)
                trace.resources[id(object)] = { kind, context: contexts.get(this), deleted: false, deleteCalls: 0 };
        });
        wrap(`delete${kind}`, function ([object]) {
            const resource = trace.resources[id(object)];
            if (resource) {
                resource.deleted = true;
                resource.deleteCalls++;
            }
        });
    }
    wrap('shaderSource', function ([shader, source]) {
        trace.sources.push({
            context: contexts.get(this),
            shader: id(shader),
            stage: this.getShaderParameter(shader, this.SHADER_TYPE),
            source,
        });
    });
    wrap('texStorage2D', function (args) {
        trace.allocations.push({ context: contexts.get(this), call: 'texStorage2D', args });
    });
    wrap('checkFramebufferStatus', function ([target], status) {
        trace.framebufferChecks.push({ target, status });
    });
    wrap('getError', function (_args, value) {
        trace.errors.push(value);
    });
    wrap('getQueryParameter', function ([query, parameter], value) {
        trace.queryEvents.push({ call: 'getQueryParameter', query: id(query), parameter, value });
    });
    wrap('getParameter', function ([parameter], value) {
        if (parameter === 0x8fbb) trace.queryEvents.push({ call: 'GPU_DISJOINT_EXT', value });
    });
    wrap('readPixels', function (args) {
        const [x, y, width, height, format, type, destination, offset = 0] = args;
        const record = {
            context: contexts.get(this),
            x,
            y,
            width,
            height,
            format,
            type,
            destinationOffsetElements: offset,
        };
        if (!ArrayBuffer.isView(destination)) {
            record.unsupportedDestination = typeof destination;
            trace.issues.push('PBO readback requires a separate collector; not presented as captured bytes.');
        } else {
            const bytes = new Uint8Array(destination.buffer, destination.byteOffset, destination.byteLength);
            let binary = '';
            for (let i = 0; i < bytes.length; i += 16384)
                binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
            record.elementType = destination.constructor.name;
            record.byteLength = bytes.byteLength;
            record.base64 = btoa(binary);
        }
        trace.readbacks.push(record);
    });
}
function validateProbe(probe) {
    const failures = [],
        check = (condition, label) => {
            if (!condition) failures.push(label);
        };
    const tolerance = require('../../ai/ledgers/upstream-update/acceptance-manifest.json').thresholds.cpuAbsoluteError;
    check(tolerance === 1e-5, 'frozen threshold');
    check(
        probe?.experiment === 'U08-C/T33' &&
            probe?.decision === 'BLOCKED' &&
            probe?.referenceFixtureCompleted === true &&
            !probe?.error,
        'completed research-only fixture',
    );
    check(probe?.scope === 'standalone-webgl2-analytic-radiance-not-cocos-scene', 'synthetic capture scope');
    const input = probe?.inputs || {};
    check(
        input.faceSize === 32 &&
            input.probeCount === 4 &&
            input.measuredPairs === 6 &&
            input.seed === 0 &&
            JSON.stringify(input.faceOrder) === JSON.stringify(sh.FACE_ORDER) &&
            input.rows === 'bottom-to-top' &&
            input.handedness === 'right-handed-world' &&
            input.basis === 'orthonormal-real-l<=2-y-z-x' &&
            input.colorSpace === 'linear-radiance' &&
            input.cosineConvolved === false &&
            input.exposure === 1 &&
            input.toneMapping === 'none' &&
            input.msaa === 0 &&
            input.depth === 'none' &&
            input.mipmaps === false &&
            input.alpha === 1 &&
            input.premultipliedAlpha === false,
        'exact radiance/input convention',
    );
    check(
        /WebGL 2/.test(probe?.device?.version) && !!probe?.device?.renderer && probe?.device?.floatColorBuffer === true,
        'actual WebGL2/float-buffer metadata',
    );
    check(
        probe?.framebufferObservation?.framebufferComplete === true &&
            probe?.framebufferObservation?.redBits === 32 &&
            probe?.framebufferObservation?.componentType === 0x1406,
        'actual RGBA32F attachment',
    );
    check(
        probe?.allocationLedger?.actualPeakDriverVRAMBytes === null && probe?.resourceCleanupIssued === true,
        'cleanup and no fabricated VRAM',
    );
    const radiance = (p, d) => [
        0.7 + 0.1 * p + 0.2 * d[0],
        0.8 + 0.15 * d[1] + 0.1 * (d[2] ** 2 - 1 / 3),
        0.9 + 0.1 * d[2] + 0.12 * d[0] * d[1],
    ];
    const reference = Array.from({ length: 4 }, (_, p) => sh.project(32, (d) => radiance(p, d)));
    const nonnegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
    const sample = (row, mode, rawRequired) => {
        check(row?.mode === mode && row?.draws === (mode === 'serial' ? 24 : 1), 'mode/draw count');
        check(row?.cpuSceneTraversalMs === null, 'no invented scene traversal');
        for (const key of [
            'cpuSubmissionMs',
            'readbackAndRepackMs',
            'cpuSHMs',
            'totalBakeMs',
            'maxCoefficientError',
            'maxPixelError',
        ])
            check(nonnegative(row?.[key]), `finite ${key}`);
        check(
            row?.gpuMs === null || (probe?.device?.timerQuery === true && nonnegative(row?.gpuMs)),
            'honest optional GPU query',
        );
        check(row?.maxCoefficientError <= tolerance && row?.maxPixelError <= tolerance, 'fixed error bounds');
        check(Array.isArray(row?.coefficients) && row.coefficients.length === 4, 'four probe coefficient sets');
        for (let p = 0; p < 4; p++) {
            const coefficients = row?.coefficients?.[p];
            check(Array.isArray(coefficients) && coefficients.length === 9, 'all nine SH coefficients');
            for (let i = 0; i < 9; i++)
                check(
                    Array.isArray(coefficients?.[i]) &&
                        coefficients[i].length === 3 &&
                        coefficients[i].every(
                            (value, channel) =>
                                Number.isFinite(value) && Math.abs(value - reference[p][i][channel]) <= tolerance,
                        ),
                    'independent analytic SH comparison',
                );
            if (!rawRequired) continue;
            const pixels = row?.rawPixels?.[p];
            const valid = Array.isArray(pixels) && pixels.length === 6 * 32 ** 2 * 4 && pixels.every(Number.isFinite);
            check(valid, 'complete finite raw face data');
            if (!valid) continue;
            let maxError = 0;
            sh.forEachTexel(32, (direction, _weight, face, x, y) => {
                const offset = ((face * 32 + y) * 32 + x) * 4;
                const expected = radiance(p, direction);
                for (let channel = 0; channel < 3; channel++)
                    maxError = Math.max(maxError, Math.abs(pixels[offset + channel] - expected[channel]));
                if (pixels[offset + 3] !== 1) maxError = Infinity;
            });
            check(maxError <= tolerance, 'independent raw linear face/alpha comparison');
        }
    };
    check(probe?.warmups?.length === 2 && probe?.samples?.length === 6, 'warmups and all six alternating pairs');
    sample(probe?.warmups?.[0], 'serial', false);
    sample(probe?.warmups?.[1], 'atlas', false);
    for (let pair = 0; pair < 6; pair++) {
        const row = probe?.samples?.[pair],
            order = pair % 2 ? ['atlas', 'serial'] : ['serial', 'atlas'];
        check(
            row?.pair === pair && JSON.stringify(row?.order) === JSON.stringify(order) && row?.samples?.length === 2,
            'unique paired run/order',
        );
        check(
            nonnegative(row?.serialAtlasCoefficientError) && row.serialAtlasCoefficientError <= tolerance,
            'serial/atlas bound',
        );
        order.forEach((mode, index) => sample(row?.samples?.[index], mode, pair === 0));
    }
    return {
        status: failures.length ? 'FAIL' : 'PASS',
        failures: [...new Set(failures)],
        acceptanceConclusion: 'BLOCKED',
        scope: 'synthetic raw-face and CPU SH projection correctness, not GPU SH convolution or engine performance',
    };
}
function validateTraceBindings(trace, observation, kind) {
    const failures = [];
    const submitted =
        kind === 'probe'
            ? [
                  { stage: 0x8b31, source: observation?.finalSources?.vertexSource },
                  { stage: 0x8b30, source: observation?.finalSources?.fragmentSource },
              ]
            : observation?.submittedSources;
    if (
        !Array.isArray(submitted) ||
        !submitted.length ||
        submitted.some(
            (entry) =>
                typeof entry.source !== 'string' ||
                !trace?.sources?.some((actual) => actual.stage === entry.stage && actual.source === entry.source),
        )
    )
        failures.push('fixture sources must match actual shaderSource calls');
    if (kind === 'probe') {
        const samples = [
            ...(observation?.warmups || []),
            ...(observation?.samples || []).flatMap((pair) => pair.samples || []),
        ];
        const measured = samples.filter((sample) => sample.gpuMs !== null).map((sample) => sample.gpuMs);
        const queryResults = [];
        let disjoint = null;
        const available = new Map();
        for (const event of trace?.queryEvents || []) {
            if (event.call === 'GPU_DISJOINT_EXT') disjoint = event.value;
            else if (event.parameter === 0x8867) available.set(event.query, event.value);
            else if (event.parameter === 0x8866) {
                if (
                    disjoint !== false ||
                    available.get(event.query) !== true ||
                    !Number.isFinite(event.value) ||
                    event.value < 0
                )
                    failures.push('GPU result requires observed available query and non-disjoint state');
                queryResults.push(event.value / 1e6);
            }
        }
        if (JSON.stringify(measured) !== JSON.stringify(queryResults))
            failures.push('GPU ms must equal actual query nanoseconds, not CPU durations');
    }
    return { status: failures.length ? 'FAIL' : 'PASS', failures, acceptanceConclusion: 'BLOCKED' };
}
function rejectionStatus(result) {
    return result?.threw === true &&
        typeof result.message === 'string' &&
        result.message.startsWith(result.prefix) &&
        result.contextsBefore === result.contextsAfter &&
        result.resourcesBefore === result.resourcesAfter
        ? 'NOT_APPLICABLE_WITH_EVIDENCE'
        : 'FAIL';
}
async function bounded(promise, milliseconds, label) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error(`${label}: ${milliseconds} ms budget exceeded`)),
                    milliseconds,
                );
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}
async function closeBrowserServer(server, childClosed, record, budget = 4000) {
    record.preCloseBoundary = new Date().toISOString();
    const started = Date.now();
    record.originalBudgetMs = budget;
    try {
        await bounded(
            Promise.all([Promise.resolve().then(() => server.close()), childClosed]),
            budget,
            'physical browser close',
        );
        record.closeWithinBudget = true;
    } catch (error) {
        record.closeWithinBudget = false;
        record.error = errorRecord(error);
        // Last-resort cleanup gets no second chance at PASS and never resets the original close budget.
        try {
            await bounded(
                Promise.resolve().then(() => server.kill()),
                1000,
                'post-failure cleanup',
            );
            record.forcedKillIssued = true;
        } catch (cleanupError) {
            record.cleanupError = errorRecord(cleanupError);
        }
    }
    record.elapsedMs = Date.now() - started;
    return (
        record.closeWithinBudget === true &&
        record.closeObserved === true &&
        record.exitCode === 0 &&
        record.signalCode === null
    );
}
function saveJSON(directory, name, value) {
    fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
function persistTrace(directory, trace) {
    if (!trace) throw new Error('missing real WebGL trace');
    for (const [index, entry] of trace.readbacks.entries()) {
        if (typeof entry.base64 !== 'string') continue;
        const bytes = Buffer.from(entry.base64, 'base64');
        if (bytes.length !== entry.byteLength) throw new Error('readback byte-length mismatch');
        entry.file = `readback-${String(index).padStart(4, '0')}.bin`;
        entry.sha256 = hash(bytes);
        fs.writeFileSync(path.join(directory, entry.file), bytes, { flag: 'wx' });
        delete entry.base64;
    }
    for (const [index, entry] of trace.sources.entries()) {
        entry.file = `shader-${String(index).padStart(4, '0')}.${entry.stage === 0x8b31 ? 'vert' : 'frag'}.glsl`;
        entry.sha256 = hash(entry.source);
        fs.writeFileSync(path.join(directory, entry.file), entry.source, { flag: 'wx' });
    }
    trace.cleanup = {
        created: Object.keys(trace.resources).length,
        deletionObserved: Object.values(trace.resources).filter((entry) => entry.deleted).length,
        outstanding: Object.entries(trace.resources)
            .filter(([, entry]) => !entry.deleted)
            .map(([id, entry]) => ({ id, ...entry })),
        limitation: 'Deletion calls only. Deferred GL/driver release and process reaping require separate evidence.',
    };
    saveJSON(directory, 'webgl-trace.json', trace);
    return {
        contexts: trace.contexts,
        sources: trace.sources.length,
        readbacks: trace.readbacks.length,
        cleanup: trace.cleanup,
        issues: trace.issues,
        glErrors: trace.errors.filter((value) => value !== 0),
    };
}
async function collectRow(browser, origin, out, plan, inputSha256) {
    const directory = path.join(out, plan.id);
    fs.mkdirSync(directory);
    const row = {
        id: plan.id,
        kind: plan.kind,
        options: plan.options || null,
        status: 'NOT_RUN',
        completed: false,
        scope: 'real fixture diagnostic only; not compositor or full acceptance',
        acceptanceConclusion: 'BLOCKED',
    };
    const context = await browser.newContext({
        viewport: { width: 800, height: 600 },
        deviceScaleFactor: 1,
        serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const logs = [],
        network = [],
        responses = [],
        pending = [];
    let observation;
    const expected = Object.fromEntries(plan.required.map((file) => [file, servedInput(file)]));
    await context.addInitScript(installGLTrace);
    await context.route('**/*', (route) => {
        if (new URL(route.request().url()).origin === origin) return route.continue();
        network.push({ unexpectedOrigin: route.request().url() });
        return route.abort('blockedbyclient');
    });
    page.on('console', (message) => logs.push({ type: message.type(), text: message.text() }));
    page.on('pageerror', (error) => logs.push({ type: 'pageerror', ...errorRecord(error) }));
    page.on('requestfailed', (request) => network.push({ url: request.url(), failure: request.failure() }));
    page.on('response', (response) => {
        const url = new URL(response.url()),
            file = url.pathname.slice(1),
            index = responses.length;
        const receipt = {
            url: response.url(),
            file,
            status: response.status(),
            contentType: response.headers()['content-type'],
        };
        responses.push(receipt);
        pending.push(
            response
                .body()
                .then((bytes) => {
                    receipt.sha256 = hash(bytes);
                    receipt.body = `response-${String(index).padStart(3, '0')}.bin`;
                    fs.writeFileSync(path.join(directory, receipt.body), bytes, { flag: 'wx' });
                })
                .catch((error) => {
                    receipt.error = errorRecord(error);
                }),
        );
    });
    try {
        await page.goto(`${origin}/${plan.fixture}`, { waitUntil: 'load', timeout: 30000 });
        if (plan.kind === 'probe') {
            await page.locator('#run').click();
            await page.waitForFunction(() => !!globalThis.upstreamProbeCaptureReport, undefined, { timeout: 180000 });
            row.observation = await page.evaluate(() => globalThis.upstreamProbeCaptureReport);
            row.validation = validateProbe(row.observation);
        } else {
            const hook = plan.kind === 'native' ? '__upstreamNativeDepth' : '__upstreamDepthExperiments';
            await page.waitForFunction((name) => globalThis[name]?.ready === true, hook, { timeout: 30000 });
            if (plan.kind === 'native') {
                row.capabilityRejections = await page.evaluate(async (cases) => {
                    const results = [];
                    for (const entry of cases) {
                        const result = {
                            ...entry,
                            contextsBefore: globalThis.__upstreamGLTrace.contexts.length,
                            resourcesBefore: Object.keys(globalThis.__upstreamGLTrace.resources).length,
                            threw: false,
                        };
                        try {
                            await globalThis.__upstreamNativeDepth.run(entry.options);
                        } catch (error) {
                            result.threw = true;
                            result.message = error.message;
                            result.name = error.name;
                        }
                        result.contextsAfter = globalThis.__upstreamGLTrace.contexts.length;
                        result.resourcesAfter = Object.keys(globalThis.__upstreamGLTrace.resources).length;
                        results.push(result);
                    }
                    return results;
                }, rejections);
                for (const result of row.capabilityRejections) {
                    result.status = rejectionStatus(result);
                    result.scope =
                        'Current fixture/native-target option rejection only; not a hardware/API impossibility or whole-case waiver.';
                }
            }
            await page.evaluate(
                ({ hook, options }) => {
                    globalThis.__upstreamCollectorOutcome = { state: 'RUNNING' };
                    Promise.resolve()
                        .then(() => globalThis[hook].run(options))
                        .then(
                            (observation) => {
                                globalThis.__upstreamCollectorOutcome = { state: 'RETURNED', observation };
                            },
                            (error) => {
                                globalThis.__upstreamCollectorOutcome = {
                                    state: 'ERROR',
                                    error: { name: error.name, message: error.message, stack: error.stack },
                                };
                            },
                        );
                },
                { hook, options: plan.options },
            );
            await page.waitForFunction(() => globalThis.__upstreamCollectorOutcome.state !== 'RUNNING', undefined, {
                timeout: 90000,
            });
            const outcome = await page.evaluate(() => globalThis.__upstreamCollectorOutcome);
            saveJSON(directory, 'fixture-outcome.json', outcome);
            if (outcome.state !== 'RETURNED') throw new Error(JSON.stringify(outcome.error));
            row.observation = outcome.observation;
            row.validation = await validateObservations(row.observation);
        }
        observation = row.observation;
        saveJSON(directory, 'observations.json', observation);
        delete row.observation;
        row.completed = true;
        row.status = row.validation.status;
        if (row.capabilityRejections?.some((entry) => entry.status !== 'NOT_APPLICABLE_WITH_EVIDENCE'))
            row.status = 'FAIL';
    } catch (error) {
        row.status = 'FAIL';
        row.error = errorRecord(error);
    } finally {
        try {
            const trace = await page.evaluate(() => globalThis.__upstreamGLTrace);
            row.traceBindings = validateTraceBindings(trace, observation, plan.kind);
            if (row.traceBindings.status !== 'PASS') row.status = 'FAIL';
            row.gl = persistTrace(directory, trace);
            if (
                !row.gl.contexts.length ||
                !row.gl.sources ||
                !row.gl.readbacks ||
                row.gl.issues.length ||
                row.gl.glErrors.length
            )
                row.status = 'FAIL';
            // Do not silently reinterpret engine-retained objects as released. Keep exact outstanding inventory.
            if (row.gl.cleanup.outstanding.length) {
                row.status = 'FAIL';
                row.cleanupFailure = 'GL objects remain without observed deletion after fixture cleanup';
            }
        } catch (error) {
            row.traceError = errorRecord(error);
            row.status = 'FAIL';
        }
        try {
            await page.screenshot({ path: path.join(directory, 'diagnostic-page.png'), timeout: 10000 });
            row.screenshot = {
                file: 'diagnostic-page.png',
                sha256: hash(fs.readFileSync(path.join(directory, 'diagnostic-page.png'))),
                scope: 'Diagnostic UI after offscreen capture; not a reference render/compositor proof.',
            };
        } catch (error) {
            row.screenshotError = errorRecord(error);
            row.status = 'FAIL';
        }
        await bounded(Promise.all(pending), 15000, 'response bodies').catch((error) => {
            row.responseError = errorRecord(error);
            row.status = 'FAIL';
        });
        row.servedInputsMatch = plan.required.every((file) => {
            const entries = responses.filter((entry) => entry.file === file);
            return (
                entries.length > 0 &&
                entries.every((entry) => entry.status === 200 && entry.sha256 === expected[file].sha256) &&
                expected[file].sourceSha256 === inputSha256[expected[file].source]
            );
        });
        if (!row.servedInputsMatch || logs.some((entry) => entry.type === 'pageerror') || network.length)
            row.status = 'FAIL';
        saveJSON(directory, 'served-inputs.json', { expected, responses, network });
        saveJSON(directory, 'page-log.json', logs);
        try {
            await bounded(context.close(), 4000, 'page context close');
            row.contextClosed = true;
        } catch (error) {
            row.contextCloseError = errorRecord(error);
            row.status = 'FAIL';
        }
        saveJSON(directory, 'row.json', row);
    }
    return row;
}
async function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    if (args.help) {
        console.log(
            'node tools/verify/upstream-experiment-browser.cjs --browser=chromium|firefox|webkit --out=<new-directory> [--record-not-run=<verified-blocker>]\nTen fresh-context U08 diagnostics: eight isolated depth modes/formats, native depth, serial/atlas probe. Uses shared example server and launchOptions; no retry, remote URL, build or publication. Saves served bodies, shaderSource bytes, every typed-array readPixels byte buffer, real metadata, optional timer-query observations, screenshots and bounded physical close. Instrumented CPU timings are not benchmark results; SH projection stays CPU, not GPU convolution. --record-not-run does not start a server/browser. PASS/exit 0 means limited diagnostic collection only; U08 acceptance remains BLOCKED.',
        );
        return;
    }
    const out = freshOutput(args.out);
    const report = {
        schema: 'air-upstream-experiment-browser/1',
        startedAt: new Date().toISOString(),
        browser: args.browser,
        status: 'NOT_RUN',
        completed: false,
        acceptanceConclusion: 'BLOCKED',
        canonicalPublication: false,
        compositorEvidence: false,
        physicalCampaignShutdownProof: false,
        gpuSHConvolution: false,
        rows: plans.map(({ id }) => ({ id, status: 'NOT_RUN' })),
        boundaries: {
            nativeReverseZ: 'Not implemented; only real option rejections may be N/A_WITH_EVIDENCE',
            webgpu: 'BLOCKED: separate implemented fixture and actual device evidence required',
            msaa: 'BLOCKED: this single-sample diagnostic does not measure MSAA',
            mobile: 'BLOCKED: no physical mobile transport/device run; viewport emulation is not evidence',
            gpuPerformance:
                'BLOCKED: no Cocos serial/atlas scene integration or measured driver VRAM; instrumented CPU times are not benchmarks',
            buildFreshness:
                'Source/build byte identity is retained; this collector does not rebuild or prove source-to-bundle provenance',
        },
    };
    let server,
        browserServer,
        childClosed,
        browserExecutable,
        stage = 'preflight';
    const browserLogs = [];
    try {
        report.gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
        report.inputSha256 = fingerprints();
        saveJSON(out, 'input-receipt.json', { gitSha: report.gitSha, inputSha256: report.inputSha256 });
        if (args['record-not-run']) {
            report.status = 'INFRA_BLOCKED';
            report.blocker = { reason: args['record-not-run'], noLaunchAttempted: true, noServerStarted: true };
            return report;
        }
        if (!report.inputSha256['build/cocosair.module.js'])
            throw new Error('Current candidate main bundle required; collector never rebuilds');
        report.dependencySha256 = dependencyFingerprints();
        const playwright = require('playwright');
        report.launchOptions = { headless: true, ...require('./browser-engines.cjs').launchOptions(args.browser) };
        browserExecutable = report.launchOptions.executablePath || playwright[args.browser].executablePath();
        report.browserExecutable = { path: browserExecutable, sha256: hash(fs.readFileSync(browserExecutable)) };
        saveJSON(out, 'toolchain-receipt.json', {
            node: process.version,
            dependencies: report.dependencySha256,
            browserExecutable: report.browserExecutable,
            launchOptions: report.launchOptions,
        });
        stage = 'server';
        server = await require('./competitive-example-server.cjs').startExampleServer(root);
        stage = 'browser-launch';
        browserServer = await playwright[args.browser].launchServer({ ...report.launchOptions, timeout: 30000 });
        const child = browserServer.process();
        report.browserProcess = { pid: child.pid, closeObserved: false, exitCode: null, signalCode: null };
        child.stdout?.on('data', (data) => browserLogs.push({ stream: 'stdout', text: data.toString() }));
        child.stderr?.on('data', (data) => browserLogs.push({ stream: 'stderr', text: data.toString() }));
        childClosed = new Promise((resolve) =>
            child.once('close', (exitCode, signalCode) => {
                Object.assign(report.browserProcess, { closeObserved: true, exitCode, signalCode });
                resolve();
            }),
        );
        const browser = await playwright[args.browser].connect(browserServer.wsEndpoint(), { timeout: 30000 });
        report.browserVersion = browser.version();
        stage = 'fixtures';
        for (const [index, plan] of plans.entries())
            report.rows[index] = await collectRow(browser, server.origin, out, plan, report.inputSha256);
        report.completed = true;
        report.status = report.rows.every((row) => row.status === 'PASS') ? 'PASS' : 'FAIL';
    } catch (error) {
        report.error = { stage, ...errorRecord(error) };
        report.status = ['preflight', 'server', 'browser-launch'].includes(stage) ? 'INFRA_BLOCKED' : 'FAIL';
    } finally {
        if (browserServer && !(await closeBrowserServer(browserServer, childClosed, report.browserProcess)))
            report.status = 'FAIL';
        if (server) {
            try {
                await bounded(server.close(), 4000, 'server close');
                report.serverClosed = true;
            } catch (error) {
                report.serverCloseError = errorRecord(error);
                report.status = 'FAIL';
            }
        }
        try {
            report.finalInputSha256 = fingerprints();
            report.inputsUnchanged = JSON.stringify(report.inputSha256) === JSON.stringify(report.finalInputSha256);
            if (report.dependencySha256)
                report.dependenciesUnchanged =
                    JSON.stringify(report.dependencySha256) === JSON.stringify(dependencyFingerprints());
            if (report.browserExecutable)
                report.browserExecutableUnchanged =
                    report.browserExecutable.sha256 === hash(fs.readFileSync(browserExecutable));
            if (
                !report.inputsUnchanged ||
                report.dependenciesUnchanged === false ||
                report.browserExecutableUnchanged === false
            )
                report.status = 'FAIL';
        } catch (error) {
            report.fingerprintError = errorRecord(error);
            report.status = 'FAIL';
        }
        saveJSON(out, 'browser-process-log.json', browserLogs);
        report.finishedAt = new Date().toISOString();
        report.collectorExitCode = report.status === 'PASS' ? 0 : 1;
        saveJSON(out, 'report.json', report);
        console.log(
            JSON.stringify({
                status: report.status,
                acceptanceConclusion: report.acceptanceConclusion,
                completed: report.completed,
                report: path.join(out, 'report.json'),
            }),
        );
        process.exitCode = report.collectorExitCode;
    }
    return report;
}
module.exports = {
    parseArgs,
    freshOutput,
    plans,
    rejections,
    fingerprints,
    servedInput,
    installGLTrace,
    validateProbe,
    rejectionStatus,
    validateTraceBindings,
    persistTrace,
    closeBrowserServer,
    main,
};
if (require.main === module)
    main().catch((error) => {
        console.error(error.stack || error);
        process.exitCode = 1;
    });
