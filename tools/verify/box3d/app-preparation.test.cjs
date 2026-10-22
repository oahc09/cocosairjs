/* CPU-only execution of the actual AIR TypeScript. Engine, network and native modules are mocks.
 * These tests establish configuration/ownership/lifecycle behavior, never physics or browser acceptance.
 * Writes no evidence files, does not build the runtime, and does not mutate Git state.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}
const plain = (value) => JSON.parse(JSON.stringify(value));
function harness(options = {}) {
    const calls = [],
        cache = new Map(),
        listeners = new Map();
    class Element {
        contains() {
            return false;
        }
    }
    class Canvas extends Element {
        constructor() {
            super();
            this.parentElement = {};
            this.tabIndex = 0;
            this.width = 1;
            this.height = 1;
        }
    }
    const canvas = new Canvas();
    const document = { baseURI: 'https://example.test/app/index.html', body: {}, getElementById: () => null };
    const selector = {
        backend: { builtin: {}, 'cannon.js': {} },
        physicsWorld: undefined,
        register(id, wrapper) {
            this.id = id;
            this.backend[id] = wrapper;
            calls.push(`select3d:${id}`);
        },
    };
    const selector2D = {
        backend: { box2d: {} },
        physicsWorld: undefined,
        register(id, wrapper) {
            this.id = id;
            this.backend[id] = wrapper;
            calls.push(`select2d:${id}`);
        },
    };
    const game = {
        once(event, callback) {
            listeners.set(event, callback);
        },
        off(event) {
            listeners.delete(event);
        },
        async init() {
            calls.push('game.init');
            listeners.get('pre')?.();
            listeners.get('post')?.();
            if (options.gameInit) await options.gameInit({ calls, selector, selector2D });
        },
        pause() {
            calls.push('game.pause');
        },
        run() {},
        resume() {},
    };
    const director = {
        getScene: () => null,
        _releaseSceneImmediate: () => {
            calls.push('scene.release');
            return [];
        },
    };
    const contextHealth = {
        destroy: () => {
            calls.push('context.destroy');
            options.contextDestroy?.();
        },
    };
    const mocks = {
        '../cocos/game': {
            game,
            director,
            Game: { EVENT_PRE_SUBSYSTEM_INIT: 'pre', EVENT_POST_SUBSYSTEM_INIT: 'post' },
        },
        '../cocos/core/platform/debug': { DebugMode: { WARN: 2, ERROR: 1 } },
        './builtin/register': { registerBuiltinAirAssets: () => calls.push('builtin.assets') },
        './physics-2d/box2d3': {
            async acquireBox2D3() {
                calls.push('2d.prepare');
                if (options.prepare2D) return options.prepare2D({ calls });
                return { select: () => calls.push('2d.select'), dispose: () => calls.push('2d.dispose') };
            },
        },
        './context-health': { attachContextHealth: () => contextHealth },
        './diagnostics': { createAirDiagnostics: () => ({ destroy: () => calls.push('diagnostics.destroy') }) },
        '../cocos/ui/view': { view: { setDesignResolutionSize() {} } },
        'pal/screen-adapter': {
            screenAdapter: {
                bindCanvas: () => {
                    calls.push('canvas.bind');
                    options.bindCanvas?.();
                },
                destroyLayoutObserver: () => calls.push('layout.destroy'),
            },
        },
        '../cocos/core/settings': { settings: { querySettings: () => null }, SettingsCategory: { SCREEN: 'screen' } },
        '../exports/gfx-webgpu': {},
        '../cocos/gfx/webgpu/instantiated': { configureWebGPUAssets() {} },
        '../cocos/gfx/device-manager': { deviceManager: {} },
        '../cocos/core/global-exports': { VERSION: 'test' },
        '../cocos/scene-graph/scene': { Scene: class {} },
        '../cocos/core/data/object': { CCObject: { _deferredDestroy() {} } },
        '../cocos/asset/asset-manager/release-manager': { releaseManager: { _flushAirReleaseQueue() {} } },
        '../cocos/asset/asset-manager': { builtinResMgr: { get: () => ({}), addAsset() {} } },
        '../cocos/physics/framework/physics-selector': { selector },
        '../cocos/physics/framework/assets/physics-material': { PhysicsMaterial: class {} },
        '../../cocos/physics-2d/framework/physics-selector': { selector: selector2D },
        '../../cocos/physics-2d/framework': { PHYSICS_2D_PTM_RATIO: 32 },
        ...options.mocks,
    };
    const context = vm.createContext({
        URL,
        Promise,
        console: { info() {}, warn() {} },
        setTimeout,
        clearTimeout,
        document,
        window: { innerWidth: 10, innerHeight: 10, devicePixelRatio: 1 },
        HTMLCanvasElement: Canvas,
        HTMLElement: Element,
        fetch: async () => {
            throw new Error('Unexpected asset request');
        },
        ...options.globals,
    });
    function load(relative) {
        const file = path.resolve(root, relative);
        if (cache.has(file)) return cache.get(file).exports;
        const module = { exports: {} };
        cache.set(file, module);
        const source = fs.readFileSync(file, 'utf8');
        const result = ts.transpileModule(source, {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
            fileName: file,
        });
        const requireMock = (id) => {
            if (id in mocks) return mocks[id];
            if (id.startsWith('../../cocos/') && relative.endsWith('box2d3.ts')) return {};
            if (id.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(file), `${id}.ts`)));
            throw new Error(`Unexpected require: ${id} in ${relative}`);
        };
        vm.runInContext(`(function(require,module,exports){${result.outputText}\n})`, context, { filename: file })(
            requireMock,
            module,
            module.exports,
        );
        return module.exports;
    }
    return { load, calls, canvas, context, selector, selector2D, listeners, game, document };
}

function installFeature(h, { adapter = true, failPrepare, failWorld, failDispose } = {}) {
    const api = h.load('src/air/physics/box3d/prepare.ts');
    api.registerBox3DFeature({
        createLoader() {
            h.calls.push('3d.loader');
            return {
                async prepare() {
                    h.calls.push('3d.prepare');
                    if (failPrepare) throw failPrepare;
                    return {
                        dispose: () => {
                            h.calls.push('3d.module.dispose');
                            if (failDispose) throw failDispose;
                        },
                    };
                },
            };
        },
    });
    if (adapter)
        api.registerBox3DWorldAdapter(async (_lease, _options, preparation) => {
            preparation.own(
                'box3d',
                'world',
                () => {
                    h.calls.push('3d.world.dispose');
                    if (failWorld) throw failWorld;
                },
                { dependsOn: ['module'] },
            );
            return {
                select: () => {
                    h.calls.push('3d.select');
                    h.selector.backend.box3d = {};
                },
            };
        });
    return api;
}

test('Box3D options are copied/frozen and canonical; all legal request modes normalize', () => {
    const h = harness(),
        { normalizeAirOptions, equalAirOptions } = h.load('src/air/app-config.ts');
    const source = {
        canvas: h.canvas,
        physics: 'box3d',
        physicsOptions: { box3d: { assetBaseUrl: './physics/../assets' } },
    };
    const normalized = normalizeAirOptions(source);
    assert.deepEqual(plain(normalized.physicsOptions.box3d), {
        assetBaseUrl: 'https://example.test/app/assets/',
        threading: 'single',
        workerCount: 1,
        solverSubSteps: 4,
    });
    assert.ok(
        Object.isFrozen(normalized) &&
            Object.isFrozen(normalized.physicsOptions) &&
            Object.isFrozen(normalized.physicsOptions.box3d),
    );
    assert.notEqual(normalized.physicsOptions, source.physicsOptions);
    source.physicsOptions.box3d.solverSubSteps = 8;
    assert.equal(normalized.physicsOptions.box3d.solverSubSteps, 4);
    assert.ok(
        equalAirOptions(
            normalized,
            normalizeAirOptions({
                canvas: h.canvas,
                physics: 'box3d',
                physicsOptions: { box3d: { assetBaseUrl: 'https://example.test/app/assets/' } },
            }),
        ),
    );
    for (const threading of ['multi', 'auto']) {
        assert.equal(
            normalizeAirOptions({ canvas: h.canvas, physicsOptions: { box3d: { threading } } }).physicsOptions.box3d
                .workerCount,
            threading === 'auto' ? undefined : 4,
        );
        for (const workerCount of [2, 3, 4])
            for (const solverSubSteps of [1, 2, 4, 8])
                assert.equal(
                    normalizeAirOptions({
                        canvas: h.canvas,
                        physicsOptions: { box3d: { threading, workerCount, solverSubSteps } },
                    }).physicsOptions.box3d.workerCount,
                    workerCount,
                );
    }
});

test('invalid Box3D configuration rejects before initialization and requests', async () => {
    const h = harness(),
        { requestAirApp } = h.load('src/air/app-config.ts');
    for (const box3d of [
        null,
        [],
        { threading: null },
        { threading: 'unknown' },
        { workerCount: 2 },
        { workerCount: Infinity },
        { workerCount: 1.5 },
        { threading: 'multi', workerCount: 1 },
        { threading: 'auto', workerCount: 5 },
        { solverSubSteps: 3 },
        { solverSubSteps: null },
        { assetBaseUrl: '' },
        { assetBaseUrl: 'http://[' },
        { assetBaseUrl: 'data:text/javascript,bad' },
        { assetBaseUrl: 'https://a.test/a?query' },
    ]) {
        await assert.rejects(
            requestAirApp({ canvas: h.canvas, physicsOptions: { box3d } }, () => {
                throw new Error('must not initialize');
            }),
            { code: 'AIR_E_BOX3D_CONFIG' },
        );
    }
    assert.deepEqual(h.calls, []);
});

test('requestAirApp exact-promise dedupe and conflicts preserve the admitted request', async () => {
    const h = harness(),
        gate = deferred(),
        { requestAirApp } = h.load('src/air/app-config.ts');
    const options = { canvas: h.canvas, physics: 'box3d' };
    const first = requestAirApp(options, () => () => gate.promise);
    assert.equal(
        requestAirApp(
            { ...options, physicsOptions: { box3d: { threading: 'single', workerCount: 1, solverSubSteps: 4 } } },
            () => {
                throw new Error('duplicate load');
            },
        ),
        first,
    );
    for (const box3d of [{ threading: 'auto' }, { solverSubSteps: 8 }, { assetBaseUrl: '/other/' }])
        await assert.rejects(
            requestAirApp({ ...options, physicsOptions: { box3d } }, () => {
                throw new Error('conflicting load');
            }),
            { code: 'AIR_E_APP_CONFLICT' },
        );
    const result = {};
    gate.resolve(result);
    assert.equal(await first, result);
});

test('feature absent explicitly rejects Box3D even when no engine backend registered', async () => {
    const h = harness();
    h.selector.backend = {};
    const bootstrap = h.load('src/air/bootstrap.ts');
    await assert.rejects(bootstrap.createAirApp({ canvas: h.canvas, physics: 'box3d' }), {
        code: 'AIR_E_PHYSICS_BACKEND_UNAVAILABLE',
    });
    const state = h.load('src/air/app-config.ts').airBootstrapRegistry();
    assert.deepEqual(plain(state.physicsPreparation.acquired), []);
    assert.equal(state.physicsPreparation.originalError.code, 'AIR_E_PHYSICS_BACKEND_UNAVAILABLE');
    assert.ok(!h.calls.includes('game.init'));
});

test('unimplemented world and unavailable variants fail without invoking lazy loader', async () => {
    for (const [threading, code] of [
        ['single', 'AIR_E_BOX3D_UNSUPPORTED'],
        ['multi', 'AIR_E_BOX3D_VARIANT_UNAVAILABLE'],
        ['auto', 'AIR_E_BOX3D_VARIANT_UNAVAILABLE'],
    ]) {
        const h = harness();
        installFeature(h, { adapter: false });
        await assert.rejects(
            h
                .load('src/air/bootstrap.ts')
                .createAirApp({ canvas: h.canvas, physics: 'box3d', physicsOptions: { box3d: { threading } } }),
            { code },
        );
        assert.ok(!h.calls.includes('3d.loader') && !h.calls.includes('game.init'));
    }
});

test('default builtin and explicit Cannon never invoke Box3D loading', async () => {
    for (const physics of [undefined, 'cannon']) {
        const h = harness();
        installFeature(h);
        const app = await h.load('src/air/bootstrap.ts').createAirApp({ canvas: h.canvas, physics });
        assert.ok(h.calls.includes(`select3d:${physics ? 'cannon.js' : 'builtin'}`));
        assert.ok(!h.calls.some((x) => x.startsWith('3d.') || x.startsWith('2d.')));
        await app.close();
        assert.equal(app.session.active, false);
    }
});

test('2D rejection is inside initialization transaction; 3D and game never start', async () => {
    const original = new Error('2d load failed'),
        h = harness({ prepare2D: () => Promise.reject(original) });
    installFeature(h);
    await assert.rejects(
        h.load('src/air/bootstrap.ts').createAirApp({ canvas: h.canvas, physics: 'box3d', physics2D: 'box2d-v3-wasm' }),
        (error) => error === original,
    );
    assert.ok(!h.calls.includes('3d.loader') && !h.calls.includes('game.init') && !h.calls.includes('2d.dispose'));
    assert.deepEqual(plain(h.load('src/air/app-config.ts').airBootstrapRegistry().physicsPreparation.acquired), []);
});

test('3D rejection releases only acquired 2D and preserves original even when cleanup throws', async () => {
    const original = new Error('3d load failed');
    const h = harness({
        prepare2D: async () => ({
            select() {},
            dispose() {
                h.calls.push('2d.dispose');
                throw new Error('2d cleanup failed');
            },
        }),
    });
    installFeature(h, { failPrepare: original });
    await assert.rejects(
        h.load('src/air/bootstrap.ts').createAirApp({ canvas: h.canvas, physics: 'box3d', physics2D: 'box2d-v3-wasm' }),
        (error) => error === original,
    );
    const receipt = h.load('src/air/app-config.ts').airBootstrapRegistry().physicsPreparation;
    assert.deepEqual(
        plain(receipt.acquired).map((x) => x.backend),
        ['box2d-v3-wasm'],
    );
    assert.match(receipt.cleanupErrors[0].message, /2d cleanup failed/);
    assert.equal(receipt.originalError.message, original.message);
});

test('init order is selected 2D, selected 3D, game.init, synchronous PRE selection', async () => {
    const gate = deferred(),
        h = harness({
            prepare2D: async () => {
                await gate.promise;
                return { select: () => h.calls.push('2d.select'), dispose: () => h.calls.push('2d.dispose') };
            },
        });
    installFeature(h);
    const pending = h
        .load('src/air/bootstrap.ts')
        .createAirApp({ canvas: h.canvas, physics: 'box3d', physics2D: 'box2d-v3-wasm' });
    await new Promise(setImmediate);
    assert.deepEqual(h.calls, ['2d.prepare']);
    gate.resolve();
    const app = await pending;
    const indexes = ['2d.prepare', '3d.prepare', 'game.init', '3d.select', '2d.select'].map((name) =>
        h.calls.indexOf(name),
    );
    assert.deepEqual(
        indexes,
        [...indexes].sort((a, b) => a - b),
    );
    assert.equal(h.listeners.size, 0);
    await app.close();
});

test('game.init failure independently cleans both backends without masking original', async () => {
    const original = new Error('game init failed'),
        h = harness({
            gameInit: () => Promise.reject(original),
            contextDestroy: () => {
                throw new Error('context cleanup failed');
            },
        });
    installFeature(h, { failDispose: new Error('3d module cleanup failed') });
    await assert.rejects(
        h.load('src/air/bootstrap.ts').createAirApp({ canvas: h.canvas, physics: 'box3d', physics2D: 'box2d-v3-wasm' }),
        (error) => error === original,
    );
    for (const call of [
        '3d.world.dispose',
        '3d.module.dispose',
        '2d.dispose',
        'context.destroy',
        'diagnostics.destroy',
    ])
        assert.ok(h.calls.includes(call), call);
    const receipt = h.load('src/air/app-config.ts').airBootstrapRegistry().physicsPreparation;
    assert.equal(receipt.cleanupErrors.length, 2);
    assert.equal(receipt.originalError.message, original.message);
    assert.equal(h.listeners.size, 0);
});

test('DOM setup failure after prepare rolls back both acquisitions before game.init', async () => {
    const original = new Error('canvas bind failed'),
        h = harness({
            bindCanvas: () => {
                throw original;
            },
        });
    installFeature(h);
    await assert.rejects(
        h.load('src/air/bootstrap.ts').createAirApp({ canvas: h.canvas, physics: 'box3d', physics2D: 'box2d-v3-wasm' }),
        (error) => error === original,
    );
    assert.ok(h.calls.includes('3d.module.dispose') && h.calls.includes('2d.dispose'));
    assert.ok(!h.calls.includes('game.init'));
});

test('double close shares promise; failed world retains module but still releases independent 2D and diagnostics', async () => {
    const h = harness();
    installFeature(h, { failWorld: new Error('world busy') });
    const app = await h
        .load('src/air/bootstrap.ts')
        .createAirApp({ canvas: h.canvas, physics: 'box3d', physics2D: 'box2d-v3-wasm' });
    const close = app.close();
    assert.equal(app.close(), close);
    const receipt = await close;
    assert.equal(receipt.status, 'failed');
    assert.equal(h.calls.filter((x) => x === '3d.world.dispose').length, 1);
    assert.equal(h.calls.filter((x) => x === '2d.dispose').length, 1);
    assert.ok(!h.calls.includes('3d.module.dispose'));
    assert.ok(h.calls.indexOf('scene.release') < h.calls.indexOf('3d.world.dispose'));
    assert.ok(h.calls.includes('diagnostics.destroy'));
    assert.ok(receipt.retained.includes('module') && receipt.retained.includes('world'));
    await assert.rejects(h.load('src/air/bootstrap.ts').createAirApp({ canvas: h.canvas }), {
        code: 'AIR_E_APP_CLOSED',
    });
});

function box2dHarness(options = {}) {
    const moduleGate = options.moduleGate;
    let h,
        moduleLoads = 0,
        fetches = 0,
        destroyed = 0,
        nextWorld = 0;
    const native = {
        createWorld: () => ++nextWorld,
        createBody() {
            if (options.failBody) throw options.failBody;
            return 1;
        },
        createJoint() {},
        destroyWorld() {
            destroyed++;
            if (options.failDestroy) throw options.failDestroy;
        },
    };
    h = harness({
        globals: {
            fetch: async () => {
                fetches++;
                if (options.fetchFailure && fetches === 1) throw options.fetchFailure;
                return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
            },
        },
        mocks: {
            'https://example.test/app/build/box2d3/air-box2d.mjs': {
                __esModule: true,
                default: async () => {
                    moduleLoads++;
                    if (moduleGate) await moduleGate.promise;
                    return native;
                },
            },
        },
    });
    const api = h.load('src/air/physics-2d/box2d3.ts');
    return {
        ...h,
        api,
        native,
        get moduleLoads() {
            return moduleLoads;
        },
        get fetches() {
            return fetches;
        },
        get destroyed() {
            return destroyed;
        },
    };
}

test('actual 2D lease code shares in-flight load and pins a late direct consumer', async () => {
    const gate = deferred(),
        h = box2dHarness({ moduleGate: gate });
    const a = h.api.acquireBox2D3(),
        b = h.api.acquireBox2D3();
    await new Promise(setImmediate);
    assert.equal(h.fetches, 1);
    assert.equal(h.moduleLoads, 1);
    assert.equal(h.api.getBox2D3PreparationInfo().leases, 0);
    assert.equal(h.api.getBox2D3PreparationInfo().pendingAcquisitions, 2);
    const direct = h.api.loadBox2D3();
    assert.equal(h.api.loadBox2D3(), direct);
    assert.equal(h.api.getBox2D3PreparationInfo().pinned, true);
    gate.resolve();
    const [first, second] = await Promise.all([a, b]);
    await direct;
    assert.equal(first.generation, second.generation);
    await first.dispose();
    const result = await second.dispose();
    assert.deepEqual(plain(result.retained), ['box2d3-module:direct-consumer-pin']);
    assert.equal(h.api.getBox2D3PreparationInfo().moduleReferenced, true);
    assert.equal(h.api.getBox2D3PreparationInfo().leases, 0);
});

test('actual 2D acquire conflict preserves pending load; failure retry creates fresh generation', async () => {
    const error = new Error('network fixture failed'),
        h = box2dHarness({ fetchFailure: error });
    const first = h.api.acquireBox2D3();
    await assert.rejects(h.api.acquireBox2D3({ subStepCount: 2 }), /BOX2D3_CONFIG_CONFLICT/);
    await assert.rejects(first, (caught) => caught === error);
    assert.equal(h.api.getBox2D3PreparationInfo().leases, 0);
    assert.equal(h.api.getBox2D3PreparationInfo().moduleReferenced, false);
    const next = await h.api.acquireBox2D3();
    assert.equal(next.generation, 2);
    await next.dispose();
    assert.equal(h.api.getBox2D3PreparationInfo().moduleReferenced, false);
});

test('actual 2D lease disposes only its owned world and old disposal cannot clear a newer generation', async () => {
    const h = box2dHarness(),
        lease = await h.api.acquireBox2D3();
    lease.select();
    h.selector2D.physicsWorld = new h.selector2D.backend['box2d-v3-wasm'].PhysicsWorld();
    const closing = lease.dispose();
    assert.equal(lease.dispose(), closing);
    await closing;
    assert.equal(h.destroyed, 1);
    assert.equal(h.api.getBox2D3PreparationInfo().moduleReferenced, false);
    const next = await h.api.acquireBox2D3();
    assert.ok(next.generation > lease.generation);
    await lease.dispose();
    assert.equal(h.api.getBox2D3PreparationInfo().moduleReferenced, true);
    assert.equal(h.api.getBox2D3PreparationInfo().leases, 1);
    await next.dispose();
    assert.equal(h.destroyed, 1);
});

test('actual 2D lease release does not destroy a direct-consumer world', async () => {
    const h = box2dHarness();
    await h.api.loadBox2D3();
    h.api.selectPhysics2DBackend('box2d-v3-wasm');
    h.selector2D.physicsWorld = new h.selector2D.backend['box2d-v3-wasm'].PhysicsWorld();
    const lease = await h.api.acquireBox2D3();
    await lease.dispose();
    assert.equal(h.destroyed, 0);
    assert.equal(h.api.getBox2D3PreparationInfo().pinned, true);
    h.api.disposeBox2D3();
    assert.equal(h.destroyed, 1);
    assert.equal(h.api.getBox2D3PreparationInfo().moduleReferenced, true);
});

test('actual 2D world cleanup failure retains references, rejects further acquire and is not retried by double dispose', async () => {
    const error = new Error('native cleanup fixture failed'),
        h = box2dHarness({ failDestroy: error });
    const lease = await h.api.acquireBox2D3();
    lease.select();
    h.selector2D.physicsWorld = new h.selector2D.backend['box2d-v3-wasm'].PhysicsWorld();
    const closing = lease.dispose();
    await assert.rejects(closing, (caught) => caught === error);
    assert.equal(lease.dispose(), closing);
    assert.equal(h.destroyed, 1);
    const info = h.api.getBox2D3PreparationInfo();
    assert.equal(info.moduleReferenced, true);
    assert.equal(info.leases, 1);
    assert.match(info.cleanupFailure, /native cleanup fixture failed/);
    await assert.rejects(h.api.acquireBox2D3(), /BOX2D3_CLEANUP_FAILED/);
});

test('actual 2D partially constructed world is captured before ground-body creation fails', async () => {
    const error = new Error('ground body fixture failed'),
        h = box2dHarness({ failBody: error });
    const lease = await h.api.acquireBox2D3();
    lease.select();
    assert.throws(
        () => new h.selector2D.backend['box2d-v3-wasm'].PhysicsWorld(),
        (caught) => caught === error,
    );
    await lease.dispose();
    assert.equal(h.destroyed, 1);
    assert.equal(h.api.getBox2D3PreparationInfo().moduleReferenced, false);
});

test('actual 2D pending second acquisition prevents premature drop by an earlier fulfilled lease', async () => {
    const gate = deferred(),
        h = box2dHarness({ moduleGate: gate });
    const firstPending = h.api.acquireBox2D3();
    const secondPending = h.api.acquireBox2D3();
    const firstDisposal = firstPending.then((lease) => lease.dispose());
    gate.resolve();
    await firstDisposal;
    const second = await secondPending;
    assert.equal(h.api.getBox2D3PreparationInfo().moduleReferenced, true);
    assert.equal(h.api.getBox2D3PreparationInfo().leases, 1);
    await second.dispose();
    assert.equal(h.api.getBox2D3PreparationInfo().moduleReferenced, false);
});

test('auto omitted count is distinct from explicit count in admission equality', async () => {
    const h = harness(),
        api = h.load('src/air/app-config.ts');
    const base = { canvas: h.canvas, physics: 'box3d', physicsOptions: { box3d: { threading: 'auto' } } };
    const normalized = api.normalizeAirOptions(base);
    assert.equal(normalized.physicsOptions.box3d.workerCount, undefined);
    assert.equal(
        api.equalAirOptions(
            normalized,
            api.normalizeAirOptions({ ...base, physicsOptions: { box3d: { threading: 'auto', workerCount: 4 } } }),
        ),
        false,
    );
    const gate = deferred(),
        pending = api.requestAirApp(base, () => () => gate.promise);
    await assert.rejects(
        api.requestAirApp({ ...base, physicsOptions: { box3d: { threading: 'auto', workerCount: 4 } } }, () => {
            throw new Error('must not load');
        }),
        { code: 'AIR_E_APP_CONFLICT' },
    );
    gate.resolve({});
    await pending;
});

test('failed resource retains only explicit dependencies; independent same-backend resources still clean', async () => {
    const h = harness(),
        preparation = h.load('src/air/physics/preparation.ts').createAirPhysicsPreparation();
    preparation.own('box3d', 'module', () => h.calls.push('module'));
    preparation.own('box3d', 'world-a', () => h.calls.push('world-a'), { dependsOn: ['module'] });
    preparation.own(
        'box3d',
        'world-b',
        () => {
            h.calls.push('world-b');
            throw new Error('world-b failure');
        },
        { dependsOn: ['module'] },
    );
    const receipt = await preparation.dispose();
    assert.deepEqual(h.calls, ['world-b', 'world-a']);
    assert.deepEqual(
        plain(receipt.acquired).map((x) => x.cleanup),
        ['not-attempted', 'released', 'failed'],
    );
    assert.throws(() => preparation.prepared(), /failed or closed/);
    assert.equal(preparation.diagnostics().status, 'cleanup-failed');
});

test('defensive late acquisition self-releases; terminal attempt never becomes prepared', async () => {
    const h = harness(),
        preparation = h.load('src/air/physics/preparation.ts').createAirPhysicsPreparation();
    await preparation.dispose();
    assert.throws(
        () =>
            preparation.own('box3d', 'late-independent-resource', async () => {
                h.calls.push('late.release');
            }),
        /self-release scheduled/,
    );
    assert.throws(() => preparation.prepared(), /failed or closed/);
    await new Promise(setImmediate);
    assert.deepEqual(h.calls, ['late.release']);
    assert.equal(preparation.diagnostics().acquired[0].cleanup, 'released');
    assert.equal(preparation.diagnostics().status, 'closed');
});

test('late self-release before the dispose microtask is still invoked exactly once', async () => {
    const h = harness(),
        preparation = h.load('src/air/physics/preparation.ts').createAirPhysicsPreparation();
    const closing = preparation.dispose();
    assert.throws(
        () => preparation.own('box3d', 'late-resource', () => h.calls.push('late.release')),
        /self-release scheduled/,
    );
    await closing;
    await new Promise(setImmediate);
    assert.deepEqual(h.calls, ['late.release']);
});

test('final 3D selection never masks missing Box3D and rejects selection after world creation', () => {
    const h = harness(),
        { selectPhysicsBackend } = h.load('src/air/physics-backend.ts');
    h.selector.backend = {};
    assert.throws(() => selectPhysicsBackend('box3d'), { code: 'AIR_E_PHYSICS_BACKEND_UNAVAILABLE' });
    selectPhysicsBackend('builtin'); // Preserve source graphs with no optional physics feature.
    assert.deepEqual(h.calls, []);
    h.selector.backend.box3d = {};
    h.selector.physicsWorld = {};
    assert.throws(() => selectPhysicsBackend('box3d'), /late selection is not supported/);
    assert.deepEqual(h.calls, []);
});

test('actual 2D lease may reselect before world creation, but another lease cannot take ownership', async () => {
    const h = box2dHarness(),
        first = await h.api.acquireBox2D3(),
        second = await h.api.acquireBox2D3();
    first.select();
    assert.doesNotThrow(() => first.select());
    assert.throws(() => second.select(), /BOX2D3_WORLD_OWNER_CONFLICT/);
    assert.equal(h.calls.filter((value) => value === 'select2d:box2d-v3-wasm').length, 2);
    h.selector2D.physicsWorld = new h.selector2D.backend['box2d-v3-wasm'].PhysicsWorld();
    assert.throws(() => first.select(), /BOX2D3_LATE_SELECTION/);
    assert.equal(h.calls.filter((value) => value === 'select2d:box2d-v3-wasm').length, 2);
    await second.dispose();
    assert.equal(h.destroyed, 0);
    await first.dispose();
    assert.equal(h.destroyed, 1);
});

test('preparation resource keys are unique for the whole attempt, including during and after close', async () => {
    const h = harness(),
        preparation = h.load('src/air/physics/preparation.ts').createAirPhysicsPreparation();
    const gate = deferred();
    const dispose = async () => {
        h.calls.push('one.release');
        await gate.promise;
    };
    preparation.own('box3d', 'resource-one', dispose);
    assert.throws(() => preparation.own('box3d', 'resource-one', dispose), /Duplicate physics acquisition/);
    const closing = preparation.dispose();
    assert.throws(() => preparation.own('box3d', 'resource-one', dispose), /Duplicate physics acquisition/);
    await new Promise(setImmediate);
    assert.deepEqual(h.calls, ['one.release']);
    gate.resolve();
    await closing;
    assert.throws(() => preparation.own('box3d', 'resource-one', dispose), /Duplicate physics acquisition/);
    assert.throws(
        () => preparation.own('box3d', 'resource-one', () => h.calls.push('replacement.release')),
        /Duplicate physics acquisition/,
    );
    await new Promise(setImmediate);
    assert.deepEqual(h.calls, ['one.release']);
    assert.equal(preparation.diagnostics().acquired.length, 1);
});

test('distinct late acquisition is self-released once and cannot be re-owned under its existing key', async () => {
    const h = harness(),
        preparation = h.load('src/air/physics/preparation.ts').createAirPhysicsPreparation();
    preparation.own('box3d', 'first', () => h.calls.push('first.release'));
    await preparation.dispose();
    const lateDispose = () => h.calls.push('late.release');
    assert.throws(() => preparation.own('box3d', 'late-distinct', lateDispose), /self-release scheduled/);
    assert.throws(() => preparation.own('box3d', 'late-distinct', lateDispose), /Duplicate physics acquisition/);
    await new Promise(setImmediate);
    assert.deepEqual(h.calls, ['first.release', 'late.release']);
    assert.equal(preparation.diagnostics().acquired.length, 2);
});
