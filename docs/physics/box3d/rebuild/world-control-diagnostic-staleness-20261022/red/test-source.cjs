/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Executes actual AIR adapter source with explicitly mocked native operations and selector.
 * This is control/ownership validation, NOT native physics, engine-loop or browser acceptance.
 * Read-only unless the caller redirects output; no runtime build, evidence writer or Git action.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
function loadSource() {
    const cache = new Map();
    function load(relative) {
        const file = path.resolve(root, relative);
        if (cache.has(file)) return cache.get(file).exports;
        const module = { exports: {} };
        cache.set(file, module);
        const source = fs.readFileSync(file, 'utf8');
        const code = ts.transpileModule(source, {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2020,
            },
        }).outputText;
        vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(
            (name) => {
                assert(name.startsWith('.'), `Unexpected runtime dependency: ${name}`);
                return load(path.relative(root, path.resolve(path.dirname(file), name + '.ts')));
            },
            module,
            module.exports,
        );
        return module.exports;
    }
    return {
        ...load('src/air/physics/box3d/world.ts'),
        ...load('src/air/physics/box3d/registration.ts'),
        ...load('src/air/physics/box3d/unsupported.ts'),
        ...load('src/air/physics/box3d/debug.ts'),
        ...load('src/air/physics/preparation.ts'),
    };
}
const source = loadSource();
const code = (expected) => (error) => error?.code === expected;
function fixture(overrides = {}) {
    const calls = [],
        worlds = new Map(),
        materials = new Map();
    let nextId = 0;
    const binding = {
        identity: Object.freeze({ abiVersion: 1, variant: 'st-simd' }),
        createWorld(gravity) {
            calls.push('create');
            const token = Object.freeze({ id: ++nextId });
            worlds.set(token, { gravity: [...gravity], sleep: true, step: 0, completed: false, snapshot: false });
            return token;
        },
        destroyWorld(world) {
            calls.push('destroy');
            assert(worlds.delete(world));
        },
        step(world, dt, substeps) {
            calls.push(['step', dt, substeps]);
            const state = worlds.get(world);
            state.step++;
            state.completed = state.snapshot = true;
        },
        readStepSnapshot(world) {
            calls.push('snapshot');
            return Object.freeze({
                worldId: world.id,
                stepIndex: worlds.get(world).step,
                bodyMoves: Object.freeze([]),
                contactsOfOwnedBodies: Object.freeze([]),
            });
        },
        stepDiagnostics(world) {
            const state = worlds.get(world);
            return { nativeStepIndex: state.step, nativeCompleted: state.completed, snapshotAvailable: state.snapshot };
        },
        getGravity: (world) => [...worlds.get(world).gravity],
        setGravity(world, value) {
            calls.push('gravity');
            worlds.get(world).gravity = [...value];
            worlds.get(world).snapshot = false;
        },
        isSleepingEnabled: (world) => worlds.get(world).sleep,
        setSleepingEnabled(world, enabled) {
            calls.push('sleep');
            worlds.get(world).sleep = enabled;
            worlds.get(world).snapshot = false;
        },
        debugSnapshot(world, flags, jointScale) {
            assert(worlds.has(world));
            calls.push(['debug', flags, jointScale]);
            return {
                flags,
                jointScale,
                supportedFlags: 7,
                primitives: flags ? [{ kind: 'line', from: [0, 0, 0], to: [1, 2, 3], color: 0xff00ff }] : [],
            };
        },
        getShapeMaterial(world, shape) {
            const state = materials.get(shape);
            assert.equal(state?.world, world);
            return { ...state.material };
        },
        setShapeMaterial(world, shape, material) {
            const state = materials.get(shape);
            assert.equal(state?.world, world);
            state.material = { ...material };
            calls.push(['material', shape.id]);
        },
        worldCounts: () => ({ counts: new Uint32Array([1, 2, 3, 4]), liveBytes: 123n }),
        liveBytes: () => 234n,
        ...overrides,
    };
    const options = { threading: 'single', workerCount: 1, solverSubSteps: 4, assetBaseUrl: undefined };
    const lease = {
        binding,
        options: { ...options, assetBaseUrl: 'https://example.invalid/' },
        generation: 1,
        dispose() {
            calls.push('module.dispose');
        },
    };
    const preparation = source.createAirPhysicsPreparation();
    preparation.own('box3d', 'module', () => lease.dispose());
    const selector = {
        physicsWorld: null,
        backend: {},
        wrapper: {},
        register(id, wrapper) {
            calls.push(`register:${id}`);
            this.id = id;
            this.wrapper = this.backend[id] = wrapper;
        },
    };
    const prepare = () => source.createBox3DWorldAdapter(selector)(lease, options, preparation);
    function construct() {
        const prepared = prepare();
        prepared.select();
        const world = new selector.wrapper.PhysicsWorld();
        selector.physicsWorld = world;
        return world;
    }
    function shape(material = { friction: 0.6, restitution: 0 }, token = [...worlds.keys()][0]) {
        const shape = Object.freeze({ id: materials.size + 1 });
        materials.set(shape, { world: token, material });
        return shape;
    }
    return { calls, binding, worlds, materials, options, lease, preparation, selector, prepare, construct, shape };
}
const material = (friction = 0.6, restitution = 0) => ({
    friction,
    restitution,
    rollingFriction: 0,
    spinningFriction: 0,
});

test('current incomplete foundation fails before registration or world allocation', async () => {
    const f = fixture();
    delete f.binding.setGravity;
    assert.throws(f.prepare, code('AIR_E_BOX3D_UNSUPPORTED'));
    assert.deepEqual(f.calls, []);
    assert.equal(f.worlds.size, 0);
    await f.preparation.dispose();
    assert.deepEqual(f.calls, ['module.dispose']);
});
test('each mandatory bridge and wrong variant fail closed', () => {
    for (const name of [
        'getGravity',
        'setSleepingEnabled',
        'isSleepingEnabled',
        'debugSnapshot',
        'stepDiagnostics',
        'getShapeMaterial',
        'setShapeMaterial',
    ]) {
        const f = fixture();
        delete f.binding[name];
        assert.throws(f.prepare, code('AIR_E_BOX3D_UNSUPPORTED'));
        assert.deepEqual(f.calls, []);
    }
    const f = fixture();
    f.binding.identity = { abiVersion: 1, variant: 'mt' };
    assert.throws(f.prepare, code('AIR_E_BOX3D_ABI'));
});
test('selection only registers; constructor owns world immediately before fallible readback', async () => {
    const f = fixture();
    const prepared = f.prepare();
    prepared.select();
    prepared.select();
    assert.equal(f.worlds.size, 0);
    assert.equal(f.preparation.diagnostics().acquired.length, 1);
    f.binding.getGravity = () => {
        assert.equal(f.preparation.diagnostics().acquired.at(-1).resource, 'world');
        throw new Error('readback');
    };
    assert.throws(() => new f.selector.wrapper.PhysicsWorld(), /readback/);
    assert.throws(() => new f.selector.wrapper.PhysicsWorld(), code('AIR_E_BOX3D_CONFIG_CONFLICT'));
    await f.preparation.dispose();
    assert.deepEqual(f.calls.slice(-2), ['destroy', 'module.dispose']);
});
test('late selection, closed preparation and second construction reject', async () => {
    const f = fixture();
    const prepared = f.prepare();
    prepared.select();
    const world = new f.selector.wrapper.PhysicsWorld();
    assert.throws(prepared.select, code('AIR_E_BOX3D_CONFIG_CONFLICT'));
    assert.throws(() => new f.selector.wrapper.PhysicsWorld(), code('AIR_E_BOX3D_CONFIG_CONFLICT'));
    await f.preparation.dispose();
    assert.equal(world.diagnostics().state, 'destroyed');
    const other = fixture();
    const late = other.prepare();
    await other.preparation.dispose();
    assert.throws(late.select, code('AIR_E_BOX3D_DISPOSED'));
});
test('every missing component constructor throws instead of selector no-op fallback', () => {
    const f = fixture();
    f.prepare().select();
    assert.equal(source.BOX3D_UNIMPLEMENTED_COMPONENTS.length, 16);
    for (const name of source.BOX3D_UNIMPLEMENTED_COMPONENTS)
        assert.throws(() => new f.selector.wrapper[name](), code('AIR_E_BOX3D_UNSUPPORTED'));
    assert.equal(f.worlds.size, 0);
});
test('all Cocos queries explicitly reject and native pointers are not exposed', () => {
    const f = fixture();
    const world = f.construct();
    const native = [...f.worlds.keys()][0];
    assert.notEqual(world.impl, native);
    assert(Object.isFrozen(world.impl));
    assert.equal(world.impl.backend, 'box3d');
    assert.equal(Object.hasOwn(world, 'token'), false);
    assert.equal(Object.hasOwn(world, 'binding'), false);
    for (const name of [
        'raycast',
        'raycastClosest',
        'sweepBox',
        'sweepBoxClosest',
        'sweepSphere',
        'sweepSphereClosest',
        'sweepCapsule',
        'sweepCapsuleClosest',
    ])
        assert.throws(() => world[name](), code('AIR_E_BOX3D_UNSUPPORTED'));
});
test('fixed step forwards once and snapshots before the event boundary', () => {
    const f = fixture();
    const world = f.construct();
    const start = f.calls.length;
    world.syncSceneToPhysics();
    world.step(1 / 60);
    world.emitEvents();
    world.emitEvents();
    world.syncAfterEvents();
    assert.deepEqual(f.calls.slice(start), [['step', Math.fround(1 / 60), 4], 'snapshot']);
    assert.equal(world.getStepSnapshot().stepIndex, 1);
    assert.equal(world.diagnostics().emittedStep, 1);
    assert.equal(world.diagnostics().sceneSyncCalls, 1);
    assert.equal(world.diagnostics().afterEventsCalls, 1);
    assert.equal(world.diagnostics().componentEventsSupported, false);
});
test('extra manual accumulator arguments and invalid dt reject without native work', () => {
    const f = fixture();
    const world = f.construct();
    const before = f.calls.length;
    for (const dt of [0, -1, NaN, Infinity, 1e40, 1e-90])
        assert.throws(() => world.step(dt), code('AIR_E_BOX3D_CONFIG'));
    assert.throws(() => world.step(1 / 60, 1 / 60), code('AIR_E_BOX3D_UNSUPPORTED'));
    assert.throws(() => world.step(1 / 60, undefined, 1), code('AIR_E_BOX3D_UNSUPPORTED'));
    assert.equal(f.calls.length, before);
    assert.equal(world.diagnostics().attemptedSteps, 0);
});
test('prepared subdivision config is copied and never multiplies dt', () => {
    const f = fixture();
    const world = f.construct();
    f.options.solverSubSteps = 8;
    world.step(0.125);
    assert.deepEqual(
        f.calls.filter(Array.isArray).filter((v) => v[0] === 'step'),
        [['step', 0.125, 4]],
    );
});
test('post-native snapshot failure latches fault; next frame/manual call cannot replay', async () => {
    const f = fixture();
    const original = f.binding.step;
    f.binding.step = (token, dt, count) => {
        original(token, dt, count);
        f.worlds.get(token).snapshot = false;
        throw Object.assign(new Error('copy failed after advance'), { code: 'AIR_E_BOX3D_SNAPSHOT_UNAVAILABLE' });
    };
    const world = f.construct();
    assert.throws(() => world.step(1 / 60), code('AIR_E_BOX3D_SNAPSHOT_UNAVAILABLE'));
    assert.equal(world.diagnostics().native.nativeStepIndex, 1);
    assert.equal(world.diagnostics().native.nativeCompleted, true);
    assert.equal(world.diagnostics().native.snapshotAvailable, false);
    assert.equal(world.diagnostics().state, 'faulted');
    for (const name of ['step', 'syncSceneToPhysics', 'emitEvents'])
        assert.throws(() => world[name](1 / 60), code('AIR_E_BOX3D_WORLD_FAULTED'));
    assert.equal(f.calls.filter((v) => Array.isArray(v) && v[0] === 'step').length, 1);
    await f.preparation.dispose();
    assert.equal(f.worlds.size, 0);
});
test('debug failure after native step also faults without replay', () => {
    const f = fixture();
    const world = f.construct();
    world.debugDrawFlags = 1;
    f.binding.debugSnapshot = () => {
        throw new Error('debug copy failed');
    };
    assert.throws(() => world.step(1 / 60), /debug copy failed/);
    assert.equal(world.diagnostics().native.nativeStepIndex, 1);
    assert.throws(() => world.step(1 / 60), code('AIR_E_BOX3D_WORLD_FAULTED'));
});
test('foreign advancement and inconsistent native step count fault before extra advance', () => {
    const f = fixture();
    const world = f.construct();
    f.worlds.values().next().value.step = 2;
    assert.throws(() => world.step(1 / 60), code('AIR_E_BOX3D_ABI'));
    assert.equal(f.calls.filter((v) => Array.isArray(v) && v[0] === 'step').length, 0);
});
test('gravity/sleep reach native and invalid arguments preserve valid state', () => {
    const f = fixture();
    const world = f.construct();
    world.setGravity({ x: 1, y: 2, z: 3 });
    world.setAllowSleep(false);
    assert.deepEqual(world.diagnostics().gravity, [1, 2, 3]);
    assert.equal(world.diagnostics().allowSleep, false);
    const before = f.calls.length;
    for (const x of [NaN, Infinity, 1e40])
        assert.throws(() => world.setGravity({ x, y: 2, z: 3 }), code('AIR_E_BOX3D_CONFIG'));
    assert.throws(() => world.setAllowSleep(0), code('AIR_E_BOX3D_CONFIG'));
    assert.equal(f.calls.length, before);
    assert.deepEqual(world.diagnostics().gravity, [1, 2, 3]);
    assert.equal(world.diagnostics().state, 'ready');
});
test('native setter readback mismatch faults rather than reporting successful effect', () => {
    const f = fixture();
    const world = f.construct();
    f.binding.setGravity = () => {};
    assert.throws(() => world.setGravity({ x: 3, y: 4, z: 5 }), code('AIR_E_BOX3D_ABI'));
    assert.equal(world.diagnostics().state, 'faulted');
});
test('debug snapshots are copied/frozen; invalid flags, unknown primitives and size reject', () => {
    const f = fixture();
    const world = f.construct();
    world.debugDrawFlags = 5;
    const snapshot = world.getDebugSnapshot();
    assert(Object.isFrozen(snapshot.primitives[0].from));
    assert.equal(world.diagnostics().debugPresented, false);
    for (const n of [-1, 8, 4294967296, NaN, 0.5])
        assert.throws(() => {
            world.debugDrawFlags = n;
        }, code('AIR_E_BOX3D_UNSUPPORTED'));
    for (const n of [-1, -1e-50, Infinity, NaN])
        assert.throws(() => {
            world.debugDrawConstraintSize = n;
        }, code('AIR_E_BOX3D_CONFIG'));
    world.debugDrawConstraintSize = 0.5;
    assert.equal(world.getDebugSnapshot().jointScale, 0.5);
    const good = f.binding.debugSnapshot;
    f.binding.debugSnapshot = (...args) => ({ ...good(...args), primitives: [{ kind: 'unknown', color: 0 }] });
    assert.throws(() => {
        world.debugDrawFlags = 1;
    }, code('AIR_E_BOX3D_UNSUPPORTED'));
    assert.equal(world.debugDrawFlags, 5);
});
test('native unsupported debug flag does not commit JS setting', () => {
    const f = fixture();
    const world = f.construct();
    const collect = f.binding.debugSnapshot;
    f.binding.debugSnapshot = (...args) => ({ ...collect(...args), supportedFlags: 1 });
    assert.throws(() => {
        world.debugDrawFlags = 4;
    }, code('AIR_E_BOX3D_UNSUPPORTED'));
    assert.equal(world.debugDrawFlags, 0);
});
test('material defaults update inherited and future shapes, preserving explicit material', () => {
    const f = fixture();
    const world = f.construct();
    const a = f.shape(),
        b = f.shape();
    world.registerMaterialShape(a, true);
    world.registerMaterialShape(b, false);
    world.setDefaultMaterial(material(0.25, 0.5));
    assert.deepEqual(f.materials.get(a).material, { friction: 0.25, restitution: 0.5 });
    assert.equal(f.materials.get(b).material.friction, 0.6);
    const c = f.shape();
    world.registerMaterialShape(c, true);
    assert.deepEqual(f.materials.get(c).material, { friction: 0.25, restitution: 0.5 });
    assert.throws(() => world.registerMaterialShape(c, true), code('AIR_E_BOX3D_CONFIG'));
    world.unregisterMaterialShape(c);
    assert.equal(world.diagnostics().materialShapeCount, 2);
});
test('unsupported material fields and invalid numbers reject before mutation', () => {
    const f = fixture();
    const world = f.construct();
    const a = f.shape();
    world.registerMaterialShape(a, true);
    const before = f.calls.length;
    for (const field of ['rollingFriction', 'spinningFriction'])
        assert.throws(() => world.setDefaultMaterial({ ...material(), [field]: 0.2 }), code('AIR_E_BOX3D_UNSUPPORTED'));
    for (const n of [-1, -1e-50]) {
        assert.throws(() => world.setDefaultMaterial(material(n)), code('AIR_E_BOX3D_CONFIG'));
        assert.throws(() => world.setDefaultMaterial(material(0.5, n)), code('AIR_E_BOX3D_CONFIG'));
    }
    assert.throws(() => world.setDefaultMaterial(material(NaN)), code('AIR_E_BOX3D_CONFIG'));
    assert.equal(f.calls.length, before);
});
test('material preflight validates every shape before mutation; failure rolls back all attempted writes', () => {
    const f = fixture();
    const world = f.construct();
    const a = f.shape(),
        b = f.shape();
    world.registerMaterialShape(a, true);
    world.registerMaterialShape(b, true);
    const original = f.binding.setShapeMaterial;
    let once = true;
    f.binding.setShapeMaterial = (w, s, v) => {
        original(w, s, v);
        if (s === b && once) {
            once = false;
            throw new Error('partial setter failure');
        }
    };
    assert.throws(() => world.setDefaultMaterial(material(0.25, 0.5)), /partial setter failure/);
    assert.equal(f.materials.get(a).material.friction, Math.fround(0.6));
    assert.equal(f.materials.get(b).material.friction, Math.fround(0.6));
    assert.equal(world.diagnostics().state, 'ready');
    assert.equal(world.diagnostics().material, null);
});
test('material rollback failure faults and cleanup still works', async () => {
    const f = fixture();
    const world = f.construct();
    const a = f.shape();
    world.registerMaterialShape(a, true);
    f.binding.setShapeMaterial = () => {
        throw new Error('cannot mutate or restore');
    };
    assert.throws(() => world.setDefaultMaterial(material(0.25)), code('AIR_E_BOX3D_WORLD_FAULTED'));
    await f.preparation.dispose();
    assert.equal(f.worlds.size, 0);
});
test('destroy is idempotent; closed calls reject while copied diagnostics remain readable', async () => {
    const f = fixture();
    const world = f.construct();
    world.destroy();
    world.destroy();
    assert.equal(f.calls.filter((v) => v === 'destroy').length, 1);
    assert.throws(() => world.step(1 / 60), code('AIR_E_BOX3D_DISPOSED'));
    assert.throws(() => world.raycast(), code('AIR_E_BOX3D_DISPOSED'));
    await f.preparation.dispose();
    assert.equal(f.calls.filter((v) => v === 'destroy').length, 1);
    assert.equal(world.diagnostics().state, 'destroyed');
});
test('failed world release retains module but independent backend cleanup proceeds once', async () => {
    const f = fixture();
    f.preparation.own('box2d-v3-wasm', 'lease', () => f.calls.push('2d.dispose'));
    const world = f.construct();
    f.binding.destroyWorld = () => {
        f.calls.push('destroy.failed');
        throw new Error('native release failed');
    };
    const receipt = await f.preparation.dispose();
    await f.preparation.dispose();
    assert.equal(receipt.status, 'cleanup-failed');
    assert(f.calls.includes('2d.dispose'));
    assert(!f.calls.includes('module.dispose'));
    assert.equal(f.calls.filter((v) => v === 'destroy.failed').length, 1);
    assert.throws(() => world.destroy(), /native release failed/);
    assert.equal(f.calls.filter((v) => v === 'destroy.failed').length, 1);
});
test('copied native counters are exposed without a raw heap view', () => {
    const f = fixture();
    const world = f.construct();
    const counts = world.getNativeCounts();
    assert.deepEqual(counts, { bodies: 1, shapes: 2, contacts: 3, joints: 4, liveBytes: 123n });
    assert(Object.isFrozen(counts));
});
test('mismatched ST options reject before native allocation', () => {
    const f = fixture();
    f.options.solverSubSteps = 8;
    assert.throws(f.construct, code('AIR_E_BOX3D_CONFIG'));
    assert.equal(f.worlds.size, 0);
});

test('unreadable post-call diagnostics retain an explicitly unknown native outcome', () => {
    const f = fixture();
    const world = f.construct();
    let invoked = false;
    const originalDiagnostic = f.binding.stepDiagnostics;
    f.binding.step = () => {
        invoked = true;
        throw new Error('uncertain native outcome');
    };
    f.binding.stepDiagnostics = (...args) => {
        if (invoked) throw new Error('diagnostics failed');
        return originalDiagnostic(...args);
    };
    assert.throws(() => world.step(1 / 60), /uncertain native outcome/);
    assert.equal(world.diagnostics().lastStepOutcome, 'unknown');
    assert.equal(world.diagnostics().nativeObservationCurrent, false);
    assert.throws(() => world.step(1 / 60), code('AIR_E_BOX3D_WORLD_FAULTED'));
});
test('pre-native binding rejection records no completion and faults safely', () => {
    const f = fixture();
    const world = f.construct();
    f.binding.step = () => {
        throw new Error('native rejected before step');
    };
    assert.throws(() => world.step(1 / 60), /native rejected before step/);
    assert.equal(world.diagnostics().lastStepOutcome, 'not-completed');
    assert.equal(world.diagnostics().native.nativeStepIndex, 0);
});
test('native reentrancy cannot destroy a world during its step', () => {
    const f = fixture();
    const world = f.construct();
    const original = f.binding.step;
    f.binding.step = (...args) => {
        assert.throws(() => world.destroy(), code('AIR_E_BOX3D_REENTRANT'));
        original(...args);
    };
    world.step(0.25);
    assert.equal(world.diagnostics().state, 'ready');
    assert.equal(f.worlds.size, 1);
});
test('all material tokens are read before any inherited shape is modified', () => {
    const f = fixture();
    const world = f.construct();
    const a = f.shape(),
        b = f.shape();
    world.registerMaterialShape(a, true);
    world.registerMaterialShape(b, true);
    const read = f.binding.getShapeMaterial;
    const before = f.calls.length;
    f.binding.getShapeMaterial = (w, shape) => {
        if (shape === b) throw new Error('invalid shape');
        return read(w, shape);
    };
    assert.throws(() => world.setDefaultMaterial(material(0.25)), /invalid shape/);
    assert.equal(f.calls.length, before);
    assert.equal(f.materials.get(a).material.friction, 0.6);
});
test('cross-world material adoption rejects before mutation', () => {
    const f = fixture();
    const world = f.construct();
    const foreign = Object.freeze({ id: 999 });
    const shape = f.shape(undefined, foreign);
    const before = f.calls.length;
    assert.throws(() => world.registerMaterialShape(shape, true));
    assert.equal(f.calls.length, before);
    assert.equal(world.diagnostics().materialShapeCount, 0);
});
test('native material failure during adoption faults rather than silently registering', () => {
    const f = fixture();
    const world = f.construct();
    world.setDefaultMaterial(material(0.25));
    const shape = f.shape();
    f.binding.setShapeMaterial = () => {
        throw new Error('adoption failed');
    };
    assert.throws(() => world.registerMaterialShape(shape, true), /adoption failed/);
    assert.equal(world.diagnostics().materialShapeCount, 0);
    assert.equal(world.diagnostics().state, 'faulted');
});

for (const kind of ['gravity', 'sleep']) {
    test(`post-step ${kind} mutation plus readback failure marks native observation stale`, () => {
        const f = fixture();
        const world = f.construct();
        world.step(1 / 60);
        assert.equal(world.diagnostics().nativeObservationCurrent, true);
        assert.equal(world.diagnostics().native.snapshotAvailable, true);
        if (kind === 'gravity')
            f.binding.getGravity = () => {
                throw new Error('readback failed');
            };
        else
            f.binding.isSleepingEnabled = () => {
                throw new Error('readback failed');
            };
        assert.throws(
            () => (kind === 'gravity' ? world.setGravity({ x: 1, y: 2, z: 3 }) : world.setAllowSleep(false)),
            /readback failed/,
        );
        assert.equal([...f.worlds.values()][0].snapshot, false);
        assert.equal(world.diagnostics().state, 'faulted');
        assert.equal(world.diagnostics().lastStepOutcome, 'completed');
        assert.equal(world.diagnostics().nativeObservationCurrent, false);
    });
}
test('post-step inherited-shape adoption failure marks native observation stale', () => {
    const f = fixture();
    const world = f.construct();
    world.setDefaultMaterial(material(0.25));
    const shape = f.shape();
    world.step(1 / 60);
    const read = f.binding.getShapeMaterial,
        write = f.binding.setShapeMaterial;
    let mutated = false;
    f.binding.setShapeMaterial = (...args) => {
        write(...args);
        [...f.worlds.values()][0].snapshot = false;
        mutated = true;
    };
    f.binding.getShapeMaterial = (...args) => {
        if (mutated) throw new Error('adoption readback failed');
        return read(...args);
    };
    assert.throws(() => world.registerMaterialShape(shape, true), /adoption readback failed/);
    assert.equal(world.diagnostics().state, 'faulted');
    assert.equal(world.diagnostics().nativeObservationCurrent, false);
    assert.equal(world.diagnostics().lastStepOutcome, 'completed');
});
test('post-step material rollback failure marks native observation stale', () => {
    const f = fixture();
    const world = f.construct();
    const shape = f.shape();
    world.registerMaterialShape(shape, true);
    world.step(1 / 60);
    const write = f.binding.setShapeMaterial;
    f.binding.setShapeMaterial = (...args) => {
        write(...args);
        [...f.worlds.values()][0].snapshot = false;
        throw new Error('mutated before failure');
    };
    assert.throws(() => world.setDefaultMaterial(material(0.25)), code('AIR_E_BOX3D_WORLD_FAULTED'));
    assert.equal(world.diagnostics().state, 'faulted');
    assert.equal(world.diagnostics().nativeObservationCurrent, false);
    assert.equal(world.diagnostics().lastStepOutcome, 'completed');
});
