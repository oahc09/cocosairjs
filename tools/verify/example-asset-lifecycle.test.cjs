'use strict';
process.env.ESBUILD_WORKER_THREADS = '0';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'examples/shared/asset-lifecycle.js'), 'utf8');
const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

function runtime() {
    const director = new EventEmitter();
    let frame = 0;
    let now = 0;
    director.getTotalFrames = () => frame;
    const timers = new Map();
    let timerId = 0;
    const context = vm.createContext({
        director,
        Director: { EVENT_AFTER_UPDATE: 'update', EVENT_AFTER_DRAW: 'draw' },
        performance: { now: () => now },
        isValid: (ref) => !!ref.valid,
        window: {},
        queueMicrotask,
        setTimeout(fn, ms) {
            const id = ++timerId;
            timers.set(id, { fn, ms });
            return id;
        },
        clearTimeout(id) {
            timers.delete(id);
        },
    });
    vm.runInContext(
        source.replace(/^import .* from 'cocosair';$/m, '').replace('export function ', 'function '),
        context,
    );
    return {
        install: context.installAssetLifecycle,
        context,
        director,
        timers,
        async frame(drain = () => {}) {
            director.emit('update');
            drain();
            director.emit('draw');
            frame++;
            await flush();
        },
        async expire() {
            for (const [id, timer] of [...timers]) {
                timers.delete(id);
                assert.equal(timer.ms, 8000);
                timer.fn();
            }
            await flush();
        },
        setTime(value) {
            now = value;
        },
        setFrame(value) {
            frame = value;
        },
        clean() {
            assert.equal(timers.size, 0);
            assert.equal(director.listenerCount('update'), 0);
            assert.equal(director.listenerCount('draw'), 0);
        },
    };
}
function graph() {
    const refs = ['gem-root', 'gem-asset', 'gem-mesh', 'gem-material', 'capture-texture'].map((name) => ({
        name,
        valid: true,
    }));
    const queue = [];
    const enqueue = (ref, onDestroy) =>
        queue.push(() => {
            ref.valid = false;
            if (onDestroy) onDestroy();
        });
    return {
        refs,
        held: () => refs.map((ref) => ({ name: ref.name, ref })),
        release() {
            enqueue(refs[0], () => {
                enqueue(refs[4]);
                queueMicrotask(() => refs.slice(1, 4).forEach((ref) => enqueue(ref)));
            });
        },
        // This model uses CCObject's fixed-batch rule; the source assertions below
        // bind that rule and the GLTF microtask to the actual engine implementation.
        drain() {
            const batch = queue.splice(0, queue.length);
            for (const destroy of batch) destroy();
        },
    };
}
async function complete(r, g, reportPromise) {
    await flush();
    await r.frame(g?.drain);
    await r.frame(g?.drain);
    await flush();
    await r.frame();
    await r.frame();
    const report = await reportPromise;
    r.clean();
    return report;
}

test('engine source contract: destruction is between update and draw, fixed batch plus GLTF microtask', () => {
    const director = fs.readFileSync(path.join(root, 'src/cocos/game/director.ts'), 'utf8');
    const tick = director.slice(director.indexOf('public tick ('));
    const update = tick.indexOf('this.emit(DirectorEvent.AFTER_UPDATE)');
    const destroy = tick.indexOf('CCObject._deferredDestroy()');
    const draw = tick.indexOf('this.emit(DirectorEvent.AFTER_DRAW)');
    assert(update >= 0 && destroy >= 0 && draw >= 0);
    assert(update < destroy && destroy < draw);
    const object = fs.readFileSync(path.join(root, 'src/cocos/core/data/object.ts'), 'utf8');
    assert.match(object, /const deleteCount = objectsToDestroy.length/);
    assert.match(object, /for \(let i = 0; i < deleteCount;/);
    const gltf = fs.readFileSync(path.join(root, 'src/air/assets/gltf/asset.ts'), 'utf8');
    assert.match(gltf, /NODE_DESTROYED[\s\S]*Promise\.resolve\(\)\.then\(\(\) =>[\s\S]*this\.releaseResources\(\)/);
});
test('two complete engine cycles drain node, capture and microtask GLTF assets; no direct flag/queue workaround', async () => {
    const r = runtime(),
        g = graph();
    r.install({
        hold: g.held,
        release: g.release,
        reacquire: async () => [{ name: 'new asset', ref: { valid: true } }],
    });
    const pending = r.context.window.__lifecycle();
    await flush();
    await r.frame(g.drain);
    assert.equal(g.refs[0].valid, false);
    assert(g.refs.slice(1).every((ref) => ref.valid));
    assert.equal(r.context.window.__lifecycleHold(), 5);
    await r.frame(g.drain);
    await r.frame();
    await r.frame();
    const report = await pending;
    assert.equal(report.released, true);
    assert.equal(report.reloaded, true);
    assert.equal(report.errors.length, 0);
    assert.deepEqual(Array.from(report.settlement.release.frames), [0, 1]);
    assert.deepEqual(Array.from(report.settlement.reacquire.frames), [2, 3]);
    assert(report.observations.released.every((row) => !row.valid && row.released));
    r.clean();
    assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, ''), /_objFlags|_deferredDestroy\s*\(|director\.tick\s*\(/);
});
for (const kind of [
    'no-frame',
    'draw-only',
    'draw-before-update',
    'mismatched-frame',
    'same-frame-reused',
    'same-task-two-frames',
]) {
    test(`${kind} cannot substitute for two completed engine cycles`, async () => {
        const r = runtime(),
            ref = { valid: true };
        r.install({
            hold: () => [{ name: 'old', ref }],
            release: () => {
                ref.valid = false;
            },
            reacquire: async () => [{ name: 'new', ref: { valid: true } }],
        });
        const pending = r.context.window.__lifecycle();
        await flush();
        if (kind === 'draw-only') {
            r.director.emit('draw');
            r.director.emit('draw');
        }
        if (kind === 'draw-before-update') {
            r.director.emit('draw');
            r.director.emit('update');
        }
        if (kind === 'mismatched-frame') {
            r.director.emit('update');
            r.setFrame(1);
            r.director.emit('draw');
        }
        if (kind === 'same-frame-reused') {
            await r.frame();
            r.setFrame(0);
            r.director.emit('update');
            r.director.emit('draw');
        }
        if (kind === 'same-task-two-frames') {
            r.director.emit('update');
            r.director.emit('draw');
            r.setFrame(1);
            r.director.emit('update');
            r.director.emit('draw');
        }
        await flush();
        assert.equal(r.timers.size, 1);
        await r.expire();
        await r.frame();
        await r.frame();
        const report = await pending;
        assert.equal(report.settlement.release.completed, false);
        assert(report.errors.includes('release: engine settlement deadline'));
        r.clean();
    });
}
test('live resources stay leaked, release exceptions stay errors, invalid reacquire remains failed', async () => {
    const r = runtime();
    r.install({
        hold: () => [{ name: 'leak', ref: { valid: true } }],
        release: () => {
            throw Error('real release failed');
        },
        reacquire: async () => [{ name: 'broken', ref: { valid: false } }],
    });
    const report = await complete(r, null, r.context.window.__lifecycle());
    assert.equal(report.released, false);
    assert.equal(report.reloaded, false);
    assert.deepEqual(Array.from(report.leaked), ['leak']);
    assert(report.errors.some((e) => e.includes('real release failed')));
    assert(report.errors.some((e) => e.includes('broken')));
});
test('private GPU material proof requires real destroy call and cleared passes, even while CCObject stays valid', async () => {
    for (const skipped of [false, true]) {
        const r = runtime(),
            ref = { valid: true, passes: [{}] },
            destroyed = new WeakSet();
        r.install({
            hold: () => [{ name: 'private', ref, released: () => destroyed.has(ref) && ref.passes.length === 0 }],
            release: () => {
                if (!skipped) {
                    ref.passes = [];
                    destroyed.add(ref);
                }
            },
            reacquire: async () => [{ name: 'new', ref: { valid: true }, released: () => false }],
        });
        const report = await complete(r, null, r.context.window.__lifecycle());
        assert.equal(report.released, !skipped);
        assert.equal(report.reloaded, true);
    }
});
test('malformed or throwing predicates cannot report release/reacquire success', async () => {
    for (const predicate of [
        true,
        () => 1,
        () => {
            throw Error('read failed');
        },
    ]) {
        const r = runtime();
        r.install({
            hold: () => [{ name: 'bad', ref: { valid: true }, released: predicate }],
            release: () => {},
            reacquire: async () => [{ name: 'bad-new', ref: { valid: true }, released: predicate }],
        });
        const report = await complete(r, null, r.context.window.__lifecycle());
        assert.equal(report.released, false);
        assert.equal(report.reloaded, false);
        assert(report.errors.length >= 2);
    }
});
test('reacquire settlement has its own bounded frame proof and removes listeners on timeout', async () => {
    const r = runtime(),
        ref = { valid: true };
    r.install({
        hold: () => [{ name: 'old', ref }],
        release: () => {
            ref.valid = false;
        },
        reacquire: async () => [{ name: 'new', ref: { valid: true } }],
    });
    const p = r.context.window.__lifecycle();
    await flush();
    await r.frame();
    await r.frame();
    await r.expire();
    const report = await p;
    assert.equal(report.settlement.release.completed, true);
    assert.equal(report.settlement.reacquire.completed, false);
    assert(report.errors.includes('reacquire: engine settlement deadline'));
    r.clean();
});
test('readback reads actual existing materials in every slot without calling allocating material getter', async () => {
    const { readScene } = require('./runtime-readback.cjs');
    const cc = { MeshRenderer: class {}, SkinnedMeshRenderer: class {} };
    const shared = [{ name: 'one' }, { name: 'two' }];
    const rendered = [
        { name: '', getProperty: () => 3 },
        { name: '', getProperty: () => 7 },
    ];
    const comp = {
        get material() {
            throw Error('readback allocated a private material');
        },
        getRenderMaterial: (i) => rendered[i],
        getMaterial: (i) => shared[i],
        mesh: null,
    };
    const scene = {
        children: [
            { name: 'model', active: true, children: [], getComponent: (t) => (t === cc.MeshRenderer ? comp : null) },
        ],
    };
    const window = { __airApp: { getScene: () => scene }, __apiTrace: { observing: 2 } };
    const page = {
        evaluate: async (fn, props) =>
            vm.runInNewContext(
                `(${fn.toString().replace("await import('/build/cocosair.module.js')", 'engineModule')})(props)`,
                {
                    engineModule: cc,
                    window,
                    props,
                },
            ),
    };
    const result = await readScene(page, ['value']);
    assert.deepEqual(
        Array.from(result.nodes[0].renderers[0].materials, (entry) => entry.props.value[0]),
        [3, 7],
    );
    assert.equal(window.__apiTrace.observing, 2);
});

test('absolute settlement deadline rejects late events even before the overdue timer gets dispatched', async () => {
    for (const phase of ['update', 'draw', 'microtask']) {
        const r = runtime(),
            ref = { valid: true };
        r.install({
            hold: () => [{ name: 'old', ref }],
            release: () => {
                ref.valid = false;
            },
            reacquire: async () => [{ name: 'new', ref: { valid: true } }],
        });
        const p = r.context.window.__lifecycle();
        await flush();
        if (phase === 'update') {
            r.setTime(8000);
            r.director.emit('update');
        }
        if (phase === 'draw') {
            r.director.emit('update');
            r.setTime(8000);
            r.director.emit('draw');
        }
        if (phase === 'microtask') {
            await r.frame();
            r.director.emit('update');
            r.director.emit('draw');
            r.setTime(8000);
        }
        await flush();
        await r.frame();
        await r.frame();
        const report = await p;
        assert.equal(report.settlement.release.completed, false);
        assert.equal(report.settlement.release.elapsedMs, 8000);
        r.clean();
    }
});
test('glass keeps all five original resources and explicitly retires its owned rendered material after unbinding', () => {
    const esbuild = require('esbuild');
    const main = fs.readFileSync(path.join(root, 'examples/glass-refraction/src/main.ts'), 'utf8');
    const start = main.indexOf('    const destroyedMaterials =');
    const snippet = main.slice(start, main.indexOf('\n}\nmain()', start));
    const events = [];
    const material = {
        isValid: true,
        passes: [{}],
        destroy() {
            events.push('material');
            this.passes = [];
        },
    };
    const asset = {
        isValid: true,
        refCount: 1,
        meshes: [{}],
        materials: [{}],
        destroy() {
            events.push('asset');
            this.isValid = false;
        },
        decRef(auto) {
            assert.equal(auto, false);
            events.push('decRef');
            this.refCount--;
        },
    };
    const capture = {
        sceneColor: {},
        set enabled(value) {
            assert.equal(value, false);
            events.push('unbind');
        },
    };
    const instance = {
        root: {
            set active(value) {
                assert.equal(value, false);
                events.push('deactivate');
            },
        },
        dispose() {
            events.push('instance');
        },
    };
    let contract;
    vm.runInNewContext(esbuild.transformSync(snippet, { loader: 'ts', target: 'es2022' }).code, {
        material,
        asset,
        capture,
        instance,
        captureNode: {
            destroy() {
                events.push('capture-node');
            },
        },
        installAssetLifecycle: (c) => {
            contract = c;
        },
        acquire: async () => {},
        reset: () => {},
    });
    const held = contract.hold();
    assert.deepEqual(
        Array.from(held, (e) => e.name),
        ['gem-asset', 'gem-root', 'gem-mesh', 'gem-material', 'capture-texture', 'gem-material-instance'],
    );
    assert.equal(held[5].released(), false);
    contract.release();
    assert.deepEqual(events, ['unbind', 'deactivate', 'material', 'capture-node', 'instance', 'asset', 'decRef']);
    assert.equal(held[5].released(), true);
    assert.equal(held[0].released(), true);
    asset.refCount = 1;
    assert.equal(held[0].released(), false);
});
test('viewer retires only existing instance-owned material passes and balances both release modes', () => {
    const main = fs.readFileSync(path.join(root, 'examples/gltf-viewer/main.js'), 'utf8');
    const snippet = main.slice(main.indexOf('const destroyedMaterials ='), main.indexOf('async function load('));
    for (const destroyAsset of [false, true]) {
        const events = [];
        const shared = {};
        const material = {
            passes: [{}],
            destroy() {
                events.push('private');
                this.passes = [];
            },
        };
        const renderer = {
            sharedMaterials: [shared],
            getRenderMaterial: () => material,
            getSharedMaterial: () => shared,
        };
        material.owner = renderer;
        const asset = {
            isValid: true,
            refCount: 2,
            destroy() {
                events.push('asset');
                this.isValid = false;
            },
            decRef(auto) {
                events.push(`decRef:${auto}`);
                this.refCount--;
            },
        };
        const instance = {
            root: {
                getComponentsInChildren: () => [renderer],
                removeFromParent() {
                    events.push('detach');
                },
            },
            dispose() {
                events.push('instance');
                asset.refCount--;
            },
        };
        const capture = {
            _enabled: true,
            get enabled() {
                return this._enabled;
            },
            set enabled(value) {
                events.push(`capture:${value}`);
                this._enabled = value;
            },
        };
        const context = vm.createContext({ capture, MeshRenderer: class {}, current: { asset, instance } });
        vm.runInContext(snippet, context);
        const held = context.heldCurrent();
        assert.equal(held.length, 3);
        assert.equal(held[2].released(), false);
        context.retire({ asset, instance }, destroyAsset);
        assert.deepEqual(events, [
            'capture:false',
            'detach',
            'instance',
            'private',
            ...(destroyAsset ? ['asset'] : []),
            `decRef:${!destroyAsset}`,
            'capture:true',
        ]);
        assert.equal(asset.refCount, 0);
        assert.equal(held[2].released(), true);
        assert.equal(held[0].released(), destroyAsset);
        material.owner = {};
        assert.throws(() => context.privateMaterials(instance), /owner mismatch/);
        assert.equal(capture.enabled, true);
        renderer.getRenderMaterial = () => shared;
        assert.equal(context.privateMaterials(instance).length, 0);
    }
    assert.match(main, /if \(previous\) retire\(previous\)/);
    assert.match(main, /retire\(\{ asset: retained, instance: created \}\)/);
    assert.match(main, /retire\(current, true\)/);
});

test('canonical consumer recomputes lifecycle settlement and resource consistency from the retained report', async () => {
    const { validateLifecycleReport } = require('./example-evidence-campaign.cjs');
    const r = runtime(),
        g = graph();
    r.install({ hold: g.held, release: g.release, reacquire: async () => [{ name: 'new', ref: { valid: true } }] });
    const report = JSON.parse(JSON.stringify(await complete(r, g, r.context.window.__lifecycle())));
    assert.doesNotThrow(() => validateLifecycleReport(report));
    const changes = [
        (r) => delete r.schemaVersion,
        (r) => (r.schemaVersion = 'future'),
        (r) => r.held++,
        (r) => (r.runs = 0),
        (r) => (r.released = false),
        (r) => (r.reloaded = false),
        (r) => r.leaked.push('resource'),
        (r) => r.errors.push('deadline'),
        (r) => delete r.settlement.release,
        (r) => (r.settlement.release.completed = false),
        (r) => (r.settlement.release.frames = [1, 1]),
        (r) => (r.settlement.release.frames = [2, 1]),
        (r) => (r.settlement.release.frames = [0, 1.5]),
        (r) => (r.settlement.release.source = 'browser-raf'),
        (r) => (r.settlement.release.elapsedMs = 8000),
        (r) => (r.settlement.release.elapsedMs = -1),
        (r) => (r.settlement.release.deadlineMs = 9000),
        (r) => (r.settlement.reacquire.cycles = 1),
        (r) => (r.settlement.reacquire.frames = [0, 1]),
        (r) => (r.settlement.reacquire.frames = [...r.settlement.release.frames]),
        (r) => r.observations.released.pop(),
        (r) => (r.observations.reacquired = []),
        (r) => (r.observations.released[0].valid = true),
        (r) => (r.observations.released[0].released = false),
        (r) => (r.observations.reacquired[0].valid = false),
        (r) => (r.observations.reacquired[0].released = true),
        (r) => (r.observations.released[0].refCount = -1),
        (r) => (r.observations.released[0].passCount = '0'),
    ];
    for (const change of changes) {
        const copy = structuredClone(report);
        change(copy);
        assert.throws(() => validateLifecycleReport(copy), /lifecycle report/);
    }
});
