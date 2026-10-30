// CPU-only collector/protocol tests. Every fabricated observation below is SYNTHETIC, never GPU evidence.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');
const { PNG } = require('pngjs');
const {
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
} = require('./upstream-skinning-browser.cjs');
const state = (weight = 0, x = 0) => ({
    weight,
    bone: [x, 0, 0],
    containment: { sceneDiagonal: 1, tolerance: 1e-5, violations: [] },
});
const pixels = (colored) => ({ width: 640, height: 480, glError: 0, colored, sums: [1, 1, 1, 1] });
function syntheticObservations() {
    return {
        schema: 'upstream-skinning-browser-observations/1',
        diagnostics: [],
        results: ['RGB', 'RGBA'].map((color) => ({
            color,
            shared: { meshes: true, clips: true, texture: true },
            independent: [state(0.125, 0.25), state(0.375, 0.75), state(0.75, 1.5)],
            combined: pixels(100),
            frustum: [-1, 0, 1].flatMap((weight) =>
                [-8, 0, 8, 0].map((x) => ({
                    weight,
                    x,
                    expectedVisible: x === 0,
                    state: state(weight),
                    pixels: pixels(x === 0 ? 100 : 0),
                })),
            ),
            baselineModels: 3,
            cycles: Array.from({ length: 30 }, (_, cycle) => ({
                cycle,
                rootValid: false,
                passes: 0,
                refs: 3,
                models: 3,
                frames: [cycle * 2, cycle * 2 + 1],
            })),
            unchangedOtherInstances: [state(0.375, 0.75), state(0.75, 1.5)],
        })),
    };
}
function nativeSnapshot() {
    return {
        backend: 'webgl2',
        version: 'WebGL 2 SYNTHETIC CPU UNIT ONLY',
        renderer: 'NOT A REAL BROWSER',
        contextLost: false,
        drawCalls: 0,
        readbacks: 0,
        resources: Object.fromEntries(resourceKinds.map((kind) => [kind, { created: 1, deleted: 0, live: [1] }])),
    };
}
function syntheticEvidence() {
    const initial = nativeSnapshot(),
        current = structuredClone(initial);
    const checkpoints = expectedCheckpoints().map((detail) => {
        const row = { detail };
        if (Object.hasOwn(detail, 'expectedVisible')) {
            current.drawCalls++;
            current.readbacks++;
            row.readback = {
                file: 'SYNTHETIC-NOT-AN-ARTIFACT.rgba',
                sha256: '0'.repeat(64),
                x: 0,
                y: 0,
                format: 6408,
                type: 5121,
                call: current.readbacks,
                bytes: 640 * 480 * 4,
                ...pixels(detail.expectedVisible ? 100 : 0),
            };
            row.screenshot = {
                file: 'SYNTHETIC-NOT-AN-ARTIFACT.png',
                sha256: '0'.repeat(64),
                width: 640,
                height: 480,
                colored: detail.expectedVisible ? 100 : 0,
            };
        }
        const buffer = current.resources.Buffer;
        if (detail.stage === 'cycle-live') buffer.live.push(++buffer.created);
        if (detail.stage === 'cycle-disposed') {
            buffer.live.pop();
            buffer.deleted++;
        }
        row.native = structuredClone(current);
        return row;
    });
    return {
        observation: syntheticObservations(),
        checkpoints,
        initial,
        final: structuredClone(current),
        close: {
            receipt: { status: 'released', pending: [], failures: [] },
            scene: null,
            sceneValid: false,
            running: false,
        },
    };
}
function check(value) {
    return validateEvidence(value.observation, value.checkpoints, value.close, value.initial, value.final);
}

test('CLI exposes three explicit browsers without fallback and rejects malformed/duplicate options', () => {
    assert.equal(parseArgs(['--out=example']).browser, 'chromium');
    for (const browser of ['chromium', 'firefox', 'webkit'])
        assert.equal(parseArgs(['--out=example', `--browser=${browser}`]).browser, browser);
    for (const args of [
        [],
        ['--out='],
        ['--out=x', '--browser=unknown'],
        ['--out=x', '--out=y'],
        ['--out=x', '--url=https://remote.test'],
        ['--out=x', '--record-not-run= '],
        ['--help', '--out=x'],
    ])
        assert.throws(() => parseArgs(args));
    assert.deepEqual(parseArgs(['--help']), { help: true });
});
test('help cannot load Playwright, start a server or compile a fixture', () => {
    const result = spawnSync(process.execPath, [__filename.replace('.test.cjs', '.cjs'), '--help'], {
        encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    for (const text of ['chromium|firefox|webkit', 'record-not-run', 'No automatic'])
        assert(result.stdout.includes(text));
});
test('prepared actual fixture resolves cocosair to the unchanged production runtime and bundles scalar oracle', async () => {
    const { assets, metafile } = await prepareAssets();
    assert.equal(Object.keys(assets).length, 4);
    const main = assets['/test/fixtures/upstream-skinning/main.ts'].body.toString();
    assert(main.includes('from "/build/cocosair.module.js"'));
    assert(main.includes('function skinnedVertices'));
    assert(!main.includes('from "cocosair"'));
    assert.deepEqual(Object.keys(metafile.inputs).sort(), [
        'test/fixtures/upstream-skinning/main.ts',
        'test/fixtures/upstream-skinning/oracle.ts',
    ]);
    assert(
        assets['/build/cocosair.module.js'].body.equals(
            fs.readFileSync(path.resolve(__dirname, '../../build/cocosair.module.js')),
        ),
    );
    const document = JSON.parse(assets['/test/fixtures/upstream-skinning/rig.gltf'].body);
    await assert.rejects(prepareAssets({}), /source changed before preparation/);
    assert.deepEqual(
        document.meshes[0].primitives.map((primitive) => document.accessors[primitive.attributes.COLOR_0].type),
        ['VEC3', 'VEC4'],
    );
});
test('read-only allowlist serves exact bytes with finish receipts; unknown paths and mutations fail', () => {
    const receipts = [],
        assets = { '/fixture': { body: Buffer.from('actual fixture bytes'), type: 'text/plain' } };
    const handler = createHandler(assets, receipts);
    for (const [url, method, expected] of [
        ['/fixture', 'GET', 200],
        ['/../private', 'GET', 404],
        ['/fixture', 'POST', 404],
    ]) {
        const res = new EventEmitter();
        res.writeHead = (status, headers) => {
            assert.equal(status, expected);
            assert.equal(headers['Cache-Control'], 'no-store');
        };
        res.end = (body) => {
            if (expected === 200) assert(body.equals(assets['/fixture'].body));
            res.emit('finish');
            res.emit('close');
        };
        handler({ url, method }, res);
    }
    assert(receipts.every((row) => row.finished && row.closed && /^[a-f0-9]{64}$/.test(row.sha256)));
});
test('native instrumentation preserves native values, receivers, exceptions and idempotent destruction', () => {
    const calls = [];
    class FakeWebGL2 {
        constructor() {
            this.canvas = { id: 'GameCanvas' };
            this.VERSION = 1;
            this.RENDERER = 2;
        }
        getParameter(parameter) {
            return parameter === 1 ? 'WebGL 2 SYNTHETIC' : 'SYNTHETIC';
        }
        getExtension() {
            return null;
        }
        isContextLost() {
            return false;
        }
    }
    for (const kind of resourceKinds) {
        const create = kind === 'Sync' ? 'fenceSync' : `create${kind}`;
        FakeWebGL2.prototype[create] = function (...args) {
            calls.push({ name: create, receiver: this, args });
            return { kind };
        };
        FakeWebGL2.prototype[`delete${kind}`] = function (...args) {
            calls.push({ name: `delete${kind}`, receiver: this, args });
            return 'native-delete-result';
        };
    }
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'readPixels'])
        FakeWebGL2.prototype[name] = function (...args) {
            calls.push({ name, receiver: this, args });
            if (args[0] === 'throw') throw new Error('native failure');
            return 'native-result';
        };
    const context = vm.createContext({
        WebGL2RenderingContext: FakeWebGL2,
        btoa: (binary) => Buffer.from(binary, 'binary').toString('base64'),
    });
    vm.runInContext(`(${installNativeProbe.toString()})(${JSON.stringify(resourceKinds)})`, context);
    const gl = new FakeWebGL2();
    const buffer = gl.createBuffer(123);
    assert.equal(buffer.kind, 'Buffer');
    assert.equal(gl.drawElements(1, 2), 'native-result');
    assert.equal(gl.readPixels(3), 'native-result');
    assert.throws(() => gl.readPixels('throw'), /native failure/);
    assert.equal(gl.deleteBuffer(buffer), 'native-delete-result');
    gl.deleteBuffer(buffer);
    gl.deleteBuffer(null);
    const snapshot = JSON.parse(JSON.stringify(context.__upstreamSkinningNative.snapshot()));
    assert.deepEqual(snapshot.resources.Buffer, { created: 1, deleted: 1, live: [] });
    assert.equal(snapshot.drawCalls, 1);
    assert.equal(snapshot.readbacks, 1);
    assert.equal(calls.length, 7);
    assert(calls.every((entry) => entry.receiver === gl));
    const nativeBytes = new Uint8Array([255, 12, 5, 255]);
    gl.readPixels(0, 0, 1, 1, 6408, 5121, nativeBytes);
    nativeBytes.fill(0);
    const raw = context.__upstreamSkinningNative.readback();
    assert.equal(raw.call, 2);
    assert.deepEqual([...Buffer.from(raw.base64, 'base64')], [255, 12, 5, 255]);
    assert.deepEqual(calls[0].args, [123]);
    assert.equal(calls[4].args[0], buffer);
    validateNative(snapshot);
});
test('PNG summary analyzes retained bytes, not the GPU readback or a claimed PASS', () => {
    const png = new PNG({ width: 4, height: 3 });
    png.data[0] = 200;
    const bytes = PNG.sync.write(png);
    const row = screenshotSummary(bytes);
    assert.equal(row.width, 4);
    assert.equal(row.height, 3);
    assert.equal(row.colored, 1);
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
    assert.throws(() => screenshotSummary(Buffer.from('not PNG')));
    const native = readbackSummary(png.data, 4, 3);
    assert.equal(native.colored, 1);
    assert.deepEqual(native.sums, [200, 0, 0, 0]);
    assert.throws(() => readbackSummary(png.data, 4, 4));
});
test('complete synthetic evidence validates only the collector protocol, not any real browser', () => {
    assert.equal(expectedCheckpoints().length, 206);
    assert.equal(check(syntheticEvidence()).nativeLifecycleCycles, 60);
});
for (const [name, mutate] of [
    ['missing RGBA observations', (v) => v.observation.results.pop()],
    [
        'retained material passes',
        (v) => {
            v.observation.results[0].cycles[29].passes = 1;
        },
    ],
    [
        'escaped skinned morph vertex',
        (v) => v.observation.results[1].independent[0].containment.violations.push({ vertex: 1 }),
    ],
    [
        'blank native GPU frame',
        (v) => {
            v.observation.results[1].combined.colored = 0;
        },
    ],
    [
        'cross-instance contamination',
        (v) => {
            v.observation.results[0].unchangedOtherInstances[0].weight = 99;
        },
    ],
    ['missing checkpoint', (v) => v.checkpoints.pop()],
    ['reordered checkpoint', (v) => v.checkpoints.reverse()],
    [
        'missing raw native readback',
        (v) => {
            delete v.checkpoints[0].readback;
        },
    ],
    [
        'mismatched raw native pixels',
        (v) => {
            v.checkpoints[0].readback.colored = 0;
        },
    ],
    [
        'incorrect native RGBA format',
        (v) => {
            v.checkpoints[0].readback.format = 6407;
        },
    ],
    [
        'reused native readback',
        (v) => {
            v.checkpoints[2].readback.call = 1;
        },
    ],
    [
        'missing compositor screenshot',
        (v) => {
            delete v.checkpoints[0].screenshot;
        },
    ],
    [
        'blank compositor screenshot',
        (v) => {
            v.checkpoints[0].screenshot.colored = 0;
        },
    ],
    [
        'outside compositor pixels',
        (v) => {
            v.checkpoints[1].screenshot.colored = 1;
        },
    ],
    [
        'lost native context',
        (v) => {
            v.checkpoints[0].native.contextLost = true;
        },
    ],
    [
        'invented backend',
        (v) => {
            v.final.backend = 'empty';
        },
    ],
    [
        'missing native readbacks',
        (v) => {
            v.final.readbacks = 0;
        },
    ],
    [
        'native counter regression',
        (v) => {
            v.checkpoints[2].native.readbacks = 0;
        },
    ],
    [
        'retained native handles',
        (v) => {
            const row = v.checkpoints[15].native.resources.Buffer;
            row.deleted--;
            row.live.push(2);
        },
    ],
    [
        'malformed native handle accounting',
        (v) => {
            v.checkpoints[0].native.resources.Buffer.created = 2;
        },
    ],
    [
        'failed app disposal',
        (v) => {
            v.close.receipt.status = 'failed';
        },
    ],
    ['pending app disposal', (v) => v.close.receipt.pending.push('native-scene')],
    [
        'live scene after close',
        (v) => {
            v.close.sceneValid = true;
        },
    ],
])
    test(`evidence consumer rejects ${name}`, () => {
        const value = syntheticEvidence();
        mutate(value);
        assert.throws(() => check(value));
    });
test('physical close waits for real child close and server acknowledgment in one budget', async () => {
    const child = new EventEmitter();
    Object.assign(child, { pid: 123, exitCode: null, signalCode: null });
    const report = { status: 'PASS' },
        childClosed = observeChild(child, report, []);
    const browserServer = {
        async close() {
            setTimeout(() => child.emit('close', 0, null), 5);
        },
        async kill() {
            assert.fail('unexpected kill');
        },
    };
    const server = {
        sockets: new Set(),
        async close() {},
        forceClose() {
            assert.fail('unexpected force');
        },
    };
    const result = await closePhysical({ browserServer, childClosed, server, report, budgetMs: 100 });
    assert.equal(result.completed, true);
    assert.equal(report.browserProcess.closeObserved, true);
    assert.equal(report.status, 'PASS');
});
test('close timeout and cleanup cannot promote an unobserved browser exit', async () => {
    const report = { status: 'PASS', browserProcess: { closeObserved: false } };
    let killed = false,
        forced = false;
    const browserServer = {
        close: () => Promise.resolve(),
        async kill() {
            killed = true;
        },
    };
    const server = {
        sockets: new Set(),
        close: () => new Promise(() => {}),
        forceClose() {
            forced = true;
        },
    };
    const result = await closePhysical({
        browserServer,
        childClosed: new Promise(() => {}),
        server,
        report,
        budgetMs: 10,
    });
    assert.equal(result.completed, false);
    assert.equal(report.status, 'FAIL');
    assert(killed && forced);
    assert.match(result.error.message, /exceeded 10 ms/);
});
test('nonzero, signal, missing child status and remaining server sockets fail closed', async () => {
    for (const browserProcess of [
        { closeObserved: true, exitCode: 1, signalCode: null },
        { closeObserved: true, exitCode: null, signalCode: 'SIGTERM' },
        { closeObserved: false },
    ]) {
        const report = { status: 'PASS', browserProcess };
        await closePhysical({
            browserServer: { async close() {}, async kill() {} },
            childClosed: Promise.resolve(),
            report,
            budgetMs: 100,
        });
        assert.equal(report.status, 'FAIL');
    }
    const report = { status: 'PASS' };
    await closePhysical({
        server: { sockets: new Set([{}]), async close() {}, forceClose() {} },
        report,
        budgetMs: 100,
    });
    assert.equal(report.status, 'FAIL');
});
test('record-not-run is offline, non-PASS, immutable and does not load browser/compilation tooling', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'u05-offline-unit-'));
    try {
        const guard = path.join(directory, 'guard.cjs');
        fs.writeFileSync(
            guard,
            `const Module = require('node:module'); const original = Module._load; Module._load = function (name, ...args) { if (name === 'playwright' || name === 'esbuild') throw new Error('FORBIDDEN_TOOLING_LOAD'); return original.call(this, name, ...args); }; require('node:http').Server.prototype.listen = function () { throw new Error('FORBIDDEN_LISTEN'); };`,
        );
        const out = path.join(directory, 'attempt');
        const args = [
            '--require',
            guard,
            __filename.replace('.test.cjs', '.cjs'),
            `--out=${out}`,
            '--browser=webkit',
            '--record-not-run=SYNTHETIC UNIT TEST: no execution authorized',
        ];
        const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30000 });
        assert.equal(result.status, 1, result.stderr);
        const report = JSON.parse(fs.readFileSync(path.join(out, 'report.json')));
        assert.equal(report.status, 'NOT_RUN');
        assert.equal(report.completed, false);
        assert.equal(report.blocker.noLaunchAttempted, true);
        assert.equal(report.blocker.noServerStarted, true);
        assert.equal(report.browser, 'webkit');
        assert.equal(report.inputsUnchanged, true);
        assert.equal(report.physicalClose, undefined);
        assert(report.inputSha256['test/fixtures/upstream-skinning/main.ts']);
        const artifacts = JSON.parse(fs.readFileSync(path.join(out, report.artifactManifest)));
        assert.match(artifacts.sha256['report.json'], /^[a-f0-9]{64}$/);
        assert.match(artifacts.sha256['checkpoints.json'], /^[a-f0-9]{64}$/);
        assert.equal(artifacts.sha256[report.artifactManifest], undefined);
        const before = fs.readFileSync(path.join(out, 'report.json'));
        const repeat = spawnSync(process.execPath, args, { encoding: 'utf8' });
        assert.equal(repeat.status, 1);
        assert(fs.readFileSync(path.join(out, 'report.json')).equals(before));
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
