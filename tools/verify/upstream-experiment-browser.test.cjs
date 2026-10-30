// All fabricated records below are CPU unit-test inputs, never browser observations or saved evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const collector = require('./upstream-experiment-browser.cjs');
const sh = require('./upstream-probe-sh-reference.js');
const root = path.resolve(__dirname, '../..');
const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), 'air-u08-cpu-'));

test('CLI selects an explicit real browser and rejects fallbacks, duplicates and empty flags', () => {
    for (const browser of ['chromium', 'firefox', 'webkit'])
        assert.equal(collector.parseArgs([`--browser=${browser}`, '--out=attempt']).browser, browser);
    assert.deepEqual(collector.parseArgs(['--help']), { help: true });
    for (const args of [
        [],
        ['--out=attempt'],
        ['--browser=edge', '--out=attempt'],
        ['--browser=chromium', '--out='],
        ['--browser=chromium', '--out=a', '--out=b'],
        ['--browser=chromium', '--out=a', '--url=https://example.com'],
        ['--help', '--out=a'],
    ])
        assert.throws(() => collector.parseArgs(args));
});
test('fresh output never merges with or overwrites an existing attempt', () => {
    const temporaryRoot = temporary();
    try {
        const attempt = path.join(temporaryRoot, 'new');
        assert.equal(collector.freshOutput(attempt), attempt);
        fs.writeFileSync(path.join(attempt, 'retained.txt'), 'prior failure');
        assert.throws(() => collector.freshOutput(attempt), /EEXIST/);
        assert.equal(fs.readFileSync(path.join(attempt, 'retained.txt'), 'utf8'), 'prior failure');
    } finally {
        fs.rmSync(temporaryRoot, { recursive: true });
    }
});
test('fixed plan retains all eight isolated choices plus native and real probe fixture', () => {
    assert.equal(collector.plans.length, 10);
    assert.equal(new Set(collector.plans.map((plan) => plan.id)).size, 10);
    for (const mode of ['normal', 'reverse'])
        for (const format of ['depth16', 'depth24', 'depth32f', 'depth24-stencil8'])
            assert.equal(
                collector.plans.filter(
                    (plan) => plan.kind === 'isolated' && plan.options.mode === mode && plan.options.format === format,
                ).length,
                1,
            );
    assert.equal(collector.plans.filter((plan) => plan.kind === 'native').length, 1);
    assert.equal(collector.plans.filter((plan) => plan.kind === 'probe').length, 1);
    for (const plan of collector.plans) assert.ok(fs.existsSync(path.join(root, plan.fixture)));
});
test('only exact observed no-GL rejection is narrowly non-applicable, never an inferred hardware result', async () => {
    const { validateExperiment } = await import('../../test/fixtures/upstream-depth-experiments/model.mjs');
    for (const entry of collector.rejections) {
        const result = { ...entry, contextsBefore: 0, contextsAfter: 0, resourcesBefore: 0, resourcesAfter: 0 };
        try {
            validateExperiment({ pipeline: 'native-target', ...entry.options });
        } catch (error) {
            result.message = error.message;
            result.threw = true;
        }
        assert.equal(collector.rejectionStatus(result), 'NOT_APPLICABLE_WITH_EVIDENCE');
        for (const mutate of [
            (value) => (value.message = 'browser crashed'),
            (value) => (value.threw = false),
            (value) => value.contextsAfter++,
            (value) => value.resourcesAfter++,
        ]) {
            const changed = { ...result };
            mutate(changed);
            assert.equal(collector.rejectionStatus(changed), 'FAIL');
        }
    }
    assert.equal(collector.rejectionStatus(null), 'FAIL');
});
function syntheticProbe() {
    const radiance = (p, d) => [
        0.7 + 0.1 * p + 0.2 * d[0],
        0.8 + 0.15 * d[1] + 0.1 * (d[2] ** 2 - 1 / 3),
        0.9 + 0.1 * d[2] + 0.12 * d[0] * d[1],
    ];
    const coefficients = Array.from({ length: 4 }, (_, p) => sh.project(32, (direction) => radiance(p, direction)));
    const pixels = Array.from({ length: 4 }, (_, p) => {
        const output = new Array(6 * 32 ** 2 * 4);
        sh.forEachTexel(32, (direction, _weight, face, x, y) => {
            const offset = ((face * 32 + y) * 32 + x) * 4;
            [...radiance(p, direction), 1].forEach((value, i) => (output[offset + i] = Math.fround(value)));
        });
        return output;
    });
    const sample = (mode, raw = false) => ({
        mode,
        draws: mode === 'serial' ? 24 : 1,
        cpuSceneTraversalMs: null,
        cpuSubmissionMs: 0,
        readbackAndRepackMs: 0,
        cpuSHMs: 0,
        totalBakeMs: 0,
        gpuMs: null,
        maxCoefficientError: 0,
        maxPixelError: 0,
        coefficients: structuredClone(coefficients),
        ...(raw ? { rawPixels: structuredClone(pixels) } : {}),
    });
    return {
        experiment: 'U08-C/T33',
        decision: 'BLOCKED',
        referenceFixtureCompleted: true,
        scope: 'standalone-webgl2-analytic-radiance-not-cocos-scene',
        inputs: {
            faceSize: 32,
            probeCount: 4,
            measuredPairs: 6,
            seed: 0,
            faceOrder: sh.FACE_ORDER,
            rows: 'bottom-to-top',
            handedness: 'right-handed-world',
            basis: 'orthonormal-real-l<=2-y-z-x',
            colorSpace: 'linear-radiance',
            cosineConvolved: false,
            exposure: 1,
            toneMapping: 'none',
            msaa: 0,
            depth: 'none',
            mipmaps: false,
            alpha: 1,
            premultipliedAlpha: false,
        },
        device: {
            version: 'WebGL 2 UNIT TEST ONLY',
            renderer: 'synthetic, not hardware',
            floatColorBuffer: true,
            timerQuery: false,
        },
        framebufferObservation: { framebufferComplete: true, redBits: 32, componentType: 0x1406 },
        allocationLedger: { actualPeakDriverVRAMBytes: null },
        resourceCleanupIssued: true,
        warmups: [sample('serial'), sample('atlas')],
        samples: Array.from({ length: 6 }, (_, pair) => {
            const order = pair % 2 ? ['atlas', 'serial'] : ['serial', 'atlas'];
            return {
                pair,
                order,
                serialAtlasCoefficientError: 0,
                samples: order.map((mode) => sample(mode, pair === 0)),
            };
        }),
    };
}
test('probe validator verifies raw faces, orientation and all CPU SH coefficients without upgrading acceptance', () => {
    const result = collector.validateProbe(syntheticProbe());
    assert.equal(result.status, 'PASS', result.failures.join('\n'));
    assert.equal(result.acceptanceConclusion, 'BLOCKED');
    assert.match(result.scope, /not GPU SH convolution/);
});
test('probe validator fails closed on missing/duplicate rows, nonfinite/mirrored pixels, CPU-as-GPU and invented memory', () => {
    const input = syntheticProbe();
    for (const mutate of [
        (value) => value.samples.pop(),
        (value) => (value.samples[1] = value.samples[0]),
        (value) => value.samples[0].order.reverse(),
        (value) => (value.samples[0].samples[0].coefficients[0][0][0] += 0.1),
        (value) => (value.samples[0].samples[0].rawPixels[0][0] = NaN),
        (value) => (value.samples[0].samples[0].rawPixels[0][3] = 0),
        (value) => value.samples[0].samples[0].rawPixels.pop(),
        (value) => value.samples[0].samples[0].rawPixels[0].reverse(),
        (value) => (value.samples[0].samples[0].gpuMs = 1),
        (value) => (value.samples[0].samples[0].cpuSHMs = null),
        (value) => (value.samples[0].samples[0].cpuSceneTraversalMs = 0.1),
        (value) => (value.inputs.colorSpace = 'srgb'),
        (value) => (value.inputs.cosineConvolved = true),
        (value) => (value.framebufferObservation.redBits = 16),
        (value) => (value.allocationLedger.actualPeakDriverVRAMBytes = 123),
        (value) => (value.decision = 'PASS'),
        (value) => (value.resourceCleanupIssued = false),
    ]) {
        const changed = structuredClone(input);
        mutate(changed);
        assert.equal(collector.validateProbe(changed).status, 'FAIL', mutate.toString());
    }
    assert.equal(collector.validateProbe(null).status, 'FAIL');
});
test('instrumentation forwards calls, preserves exact typed-array view bytes and tracks actual cleanup calls', () => {
    class GL {
        constructor() {
            Object.assign(this, { RENDERER: 1, VENDOR: 2, VERSION: 3, SHADING_LANGUAGE_VERSION: 4, SHADER_TYPE: 5 });
        }
        getExtension() {
            return null;
        }
        getParameter(parameter) {
            return parameter === 3 ? 'WebGL 2 UNIT TEST ONLY' : 'synthetic';
        }
        getContextAttributes() {
            return { antialias: false };
        }
        createShader() {
            return {};
        }
        createTexture() {
            return {};
        }
        createQuery() {
            return {};
        }
        deleteShader() {}
        deleteTexture() {}
        deleteQuery() {}
        shaderSource(shader, source) {
            shader.submitted = source;
            return 99;
        }
        getShaderParameter() {
            return 0x8b31;
        }
        readPixels(_x, _y, _width, _height, _format, _type, target) {
            target.set([1, 2, 3, 4]);
            return 123;
        }
        getError() {
            return 0;
        }
        texStorage2D() {}
        checkFramebufferStatus() {
            return 0x8cd5;
        }
        getQueryParameter() {
            return 1500000;
        }
    }
    const gl = new GL();
    const sandbox = {
        WebGL2RenderingContext: GL,
        HTMLCanvasElement: class {
            getContext() {
                return gl;
            }
        },
        navigator: { userAgent: 'CPU TEST ONLY' },
        btoa: (binary) => Buffer.from(binary, 'binary').toString('base64'),
    };
    vm.runInNewContext(`(${collector.installGLTrace.toString()})()`, sandbox);
    assert.equal(new sandbox.HTMLCanvasElement().getContext('webgl2'), gl);
    const shader = gl.createShader(),
        texture = gl.createTexture(),
        query = gl.createQuery();
    assert.equal(gl.shaderSource(shader, 'exact shader\n'), 99);
    const whole = Uint8Array.from([9, 9, 0, 0, 0, 0, 9]);
    assert.equal(gl.readPixels(0, 0, 1, 1, 0x1908, 0x1401, whole.subarray(2, 6)), 123);
    assert.deepEqual([...whole], [9, 9, 1, 2, 3, 4, 9]);
    gl.texStorage2D(0xde1, 1, 0x8814, 32, 32);
    gl.checkFramebufferStatus(0x8d40);
    assert.equal(gl.getError(), 0);
    gl.getQueryParameter(query, 0x8866);
    gl.deleteShader(shader);
    gl.deleteTexture(texture);
    gl.deleteQuery(query);
    const trace = sandbox.__upstreamGLTrace;
    assert.equal(trace.sources[0].source, 'exact shader\n');
    assert.deepEqual([...Buffer.from(trace.readbacks[0].base64, 'base64')], [1, 2, 3, 4]);
    assert.equal(trace.queryEvents[0].value, 1500000);
    assert.equal(trace.gpuSHConvolution, false);
    assert.equal(trace.cpuTimingPerturbedByReadbackCapture, true);
    const temporaryRoot = temporary();
    try {
        const summary = collector.persistTrace(temporaryRoot, trace);
        assert.equal(summary.cleanup.created, 3);
        assert.equal(summary.cleanup.outstanding.length, 0);
        assert.deepEqual([...fs.readFileSync(path.join(temporaryRoot, 'readback-0000.bin'))], [1, 2, 3, 4]);
        assert.equal(fs.readFileSync(path.join(temporaryRoot, 'shader-0000.vert.glsl'), 'utf8'), 'exact shader\n');
    } finally {
        fs.rmSync(temporaryRoot, { recursive: true });
    }
});
test('physical close waits for child close, records immutable failure, and bounds last-resort kill', async () => {
    let closed;
    const record = { closeObserved: false, exitCode: null, signalCode: null };
    const childClosed = new Promise(
        (resolve) =>
            (closed = () => {
                Object.assign(record, { closeObserved: true, exitCode: 0, signalCode: null });
                resolve();
            }),
    );
    let killCount = 0;
    const pass = collector.closeBrowserServer(
        { close: async () => closed(), kill: async () => killCount++ },
        childClosed,
        record,
        100,
    );
    assert.equal(await pass, true);
    assert.equal(killCount, 0);
    const failure = { closeObserved: false, exitCode: null, signalCode: null };
    assert.equal(
        await collector.closeBrowserServer(
            { close: () => new Promise(() => {}), kill: async () => killCount++ },
            new Promise(() => {}),
            failure,
            5,
        ),
        false,
    );
    assert.equal(failure.closeWithinBudget, false);
    assert.equal(failure.originalBudgetMs, 5);
    assert.equal(killCount, 1);
    assert.match(failure.error.message, /budget exceeded/);
    const signaled = { closeObserved: true, exitCode: null, signalCode: 'SIGKILL' };
    assert.equal(
        await collector.closeBrowserServer(
            { close: async () => {}, kill: async () => {} },
            Promise.resolve(),
            signaled,
            100,
        ),
        false,
    );
});
function mockServer(denied) {
    let handler;
    const server = new EventEmitter();
    server.listen = (_port, _host, callback) =>
        queueMicrotask(() =>
            denied
                ? server.emit('error', Object.assign(new Error('synthetic denied listen'), { code: 'EPERM' }))
                : callback(),
        );
    server.address = () => ({ port: 0 });
    server.close = (callback) => callback();
    const sandbox = {
        exports: {},
        Buffer,
        require: (name) =>
            name === 'node:http'
                ? {
                      createServer: (listener) => {
                          handler = listener;
                          return server;
                      },
                  }
                : require(name),
        URL,
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'competitive-example-server.cjs'), 'utf8'), sandbox);
    return {
        start: () => sandbox.exports.startExampleServer(root),
        request: (url) => {
            let status, headers, body;
            handler(
                { url },
                {
                    writeHead: (code, value) => {
                        status = code;
                        headers = value;
                    },
                    end: (value) => (body = value),
                },
            );
            return { status, headers, body };
        },
    };
}
test('shared server emits .mjs JavaScript and exact in-memory TS bytes, without opening a socket', async () => {
    const mock = mockServer(false);
    await mock.start();
    const module = mock.request('/test/fixtures/upstream-depth-experiments/probe.mjs');
    assert.equal(module.status, 200);
    assert.equal(module.headers['Content-Type'], 'text/javascript');
    assert.equal(
        module.body.toString(),
        fs.readFileSync(path.join(root, 'test/fixtures/upstream-depth-experiments/probe.mjs'), 'utf8'),
    );
    const transformed = mock.request('/tools/debug/effect-layout.js');
    const hash = require('node:crypto').createHash('sha256').update(transformed.body).digest('hex');
    assert.equal(collector.servedInput('tools/debug/effect-layout.js').sha256, hash);
});
test('shared server listen denial rejects its promise instead of causing an uncaught process error', async () => {
    await assert.rejects(mockServer(true).start(), { code: 'EPERM' });
});
test('record-not-run preserves NOT_RUN rows and cannot load browser tooling or start any server', async () => {
    const temporaryRoot = temporary(),
        previousLoad = Module._load,
        previousLog = console.log,
        previousExit = process.exitCode;
    try {
        Module._load = function (name, ...args) {
            if (name === 'playwright' || name === 'node:http' || name.includes('competitive-example-server'))
                throw new Error(`Forbidden in CPU-only blocked receipt: ${name}`);
            return previousLoad.call(this, name, ...args);
        };
        console.log = () => {};
        const out = path.join(temporaryRoot, 'blocked');
        const report = await collector.main([
            '--browser=chromium',
            `--out=${out}`,
            '--record-not-run=UNIT TEST ONLY, not a real browser attempt',
        ]);
        assert.equal(report.status, 'INFRA_BLOCKED');
        assert.equal(report.completed, false);
        assert.equal(report.blocker.noServerStarted, true);
        assert.equal(report.blocker.noLaunchAttempted, true);
        assert.ok(report.rows.every((row) => row.status === 'NOT_RUN'));
        assert.equal(report.acceptanceConclusion, 'BLOCKED');
        assert.equal(report.inputsUnchanged, true);
        assert.equal(report.browserProcess, undefined);
    } finally {
        Module._load = previousLoad;
        console.log = previousLog;
        process.exitCode = previousExit;
        fs.rmSync(temporaryRoot, { recursive: true });
    }
});
test('reported shaders and GPU times must bind to actual submitted sources and nondisjoint query results', () => {
    const observation = {
        finalSources: { vertexSource: 'vertex', fragmentSource: 'fragment' },
        warmups: [{ gpuMs: 1.5 }, { gpuMs: null }],
        samples: [],
    };
    const trace = {
        sources: [
            { stage: 0x8b31, source: 'vertex' },
            { stage: 0x8b30, source: 'fragment' },
        ],
        queryEvents: [
            { call: 'getQueryParameter', query: 1, parameter: 0x8867, value: true },
            { call: 'GPU_DISJOINT_EXT', value: false },
            { call: 'getQueryParameter', query: 1, parameter: 0x8866, value: 1500000 },
        ],
    };
    assert.equal(collector.validateTraceBindings(trace, observation, 'probe').status, 'PASS');
    for (const mutate of [
        (value) => (value.sources[0].source = 'different'),
        (value) => (value.queryEvents[0].value = false),
        (value) => (value.queryEvents[1].value = true),
        (value) => (value.queryEvents[2].value = 1500),
        (value) => value.queryEvents.pop(),
    ]) {
        const changed = structuredClone(trace);
        mutate(changed);
        assert.equal(collector.validateTraceBindings(changed, observation, 'probe').status, 'FAIL');
    }
    assert.equal(collector.validateTraceBindings(trace, { submittedSources: [] }, 'isolated').status, 'FAIL');
});
