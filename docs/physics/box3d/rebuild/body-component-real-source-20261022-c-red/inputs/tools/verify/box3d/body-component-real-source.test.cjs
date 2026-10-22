/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual AIR TypeScript with explicit native/Node mocks. NOT native physics qualification.
 * Read-only; optional output redirection belongs to the caller. No runtime build or network.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const cache = new Map();
function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(
        (name) => {
            assert(name.startsWith('.'));
            return load(path.relative(root, path.resolve(path.dirname(file), name + '.ts')));
        },
        module,
        module.exports,
    );
    return module.exports;
}
const { Box3DSharedBody, nativeBodyType, filterBits } = load('src/air/physics/box3d/shared-body.ts');
const { Box3DRigidBody } = load('src/air/physics/box3d/rigid-body.ts');
const { requireComponentBinding } = load('src/air/physics/box3d/world-binding.ts');
const coded = (code) => (error) => error?.code === code;
function fixture() {
    const calls = [];
    const token = Object.freeze({ testCapability: true });
    let state = {
        type: 0,
        enabled: true,
        massPending: true,
        awake: true,
        sleepy: false,
        sleeping: false,
        sleepEnabled: true,
        ccd: false,
        sleepThreshold: 0.1,
        mass: 1,
        linearDamping: 0,
        angularDamping: 0,
        gravityScale: 1,
        linearFactor: [1, 1, 1],
        angularFactor: [1, 1, 1],
        linearVelocity: [0, 0, 0],
        angularVelocity: [0, 0, 0],
    };
    const read = () => Object.freeze({ ...state });
    const node = {
        worldPosition: { x: 1, y: 2, z: 3 },
        worldRotation: { x: 0, y: 0, z: 0, w: 1 },
        worldScale: { x: 1, y: 1, z: 1 },
        parent: null,
        hasChangedFlags: 0x60,
        setWorldPosition(x, y, z) {
            this.worldPosition = { x, y, z };
            this.hasChangedFlags |= 1;
        },
        setWorldRotation(x, y, z, w) {
            this.worldRotation = { x, y, z, w };
            this.hasChangedFlags |= 2;
        },
    };
    const owner = {
        ready: true,
        invalidations: 0,
        faults: [],
        releasedCount: 0,
        assertReady() {
            assert(this.ready);
        },
        invalidate() {
            ++this.invalidations;
        },
        fault(error) {
            this.faults.push(error);
        },
        released() {
            ++this.releasedCount;
        },
    };
    const binding = {
        createBody(world, options) {
            calls.push(['createBody', world, options]);
            return token;
        },
        destroyBody(body) {
            assert.equal(body, token);
            calls.push(['destroyBody']);
        },
        bodyState() {
            return read();
        },
        bodyTransforms() {
            return new Float32Array([7, 8, 9, 0, 0, 0, 1, 70, 80, 90]);
        },
    };
    const fields = {
        setBodyType: ['type'],
        setBodyEnabled: ['enabled'],
        setBodyMass: ['mass'],
        setBodyDamping: ['linearDamping', 'angularDamping'],
        setBodyGravityScale: ['gravityScale'],
        setBodySleepEnabled: ['sleepEnabled'],
        setBodySleepThreshold: ['sleepThreshold'],
        setBodyAwake: ['awake'],
        setBodyCCD: ['ccd'],
        setBodyMotionFactors: ['linearFactor', 'angularFactor'],
        setBodyLinearVelocity: ['linearVelocity'],
        setBodyAngularVelocity: ['angularVelocity'],
        applyBodyForce: [],
        applyBodyImpulse: [],
        applyBodyTorque: [],
        clearBodyForces: [],
        clearBodyVelocity: [],
        clearBodyState: [],
    };
    for (const [name, keys] of Object.entries(fields)) {
        binding[name] = function (world, body, ...args) {
            assert.equal(this, binding);
            assert.equal(body, token);
            calls.push([name, ...args]);
            keys.forEach((key, i) => {
                state[key] = args[i];
            });
            return read();
        };
    }
    const configuration = { collisionMask: () => 1, sleepThreshold: () => 0.125 };
    const worldToken = Object.freeze({ testWorld: true });
    const body = new Box3DSharedBody(binding, worldToken, node, owner, configuration);
    const component = {
        node,
        type: 1,
        mass: 5,
        group: 1,
        linearDamping: 0.1,
        angularDamping: 0.2,
        useGravity: true,
        allowSleep: true,
        linearFactor: { x: 1, y: 1, z: 1 },
        angularFactor: { x: 1, y: 1, z: 1 },
    };
    const world = {
        acquireSharedBody(n, ref) {
            assert.equal(n, node);
            body.retain(ref);
            return body;
        },
    };
    const adapter = new Box3DRigidBody(() => world, configuration);
    return { body, binding, node, owner, component, adapter, calls, state, token, configuration };
}
test('MOCK: Cocos/native type mapping and 32-bit filter domain are explicit', () => {
    assert.deepEqual([1, 2, 4].map(nativeBodyType), [2, 0, 1]);
    for (const value of [0, 3, NaN, '1']) assert.throws(() => nativeBodyType(value));
    assert.equal(filterBits(-2147483648), 2147483648);
    for (const value of [NaN, 1.5, Infinity, 2 ** 32, '1']) assert.throws(() => filterBits(value));
});
test('MOCK: absent body/filter bridge rejects, not a successful component world', () => {
    assert.throws(() => requireComponentBinding({}), coded('AIR_E_BOX3D_UNSUPPORTED'));
});
test('MOCK: constructor owns one disabled native static body at initial origin', () => {
    const f = fixture();
    assert.equal(f.calls[0][2].type, 0);
    assert.deepEqual(f.calls[0][2].position, [1, 2, 3]);
    assert.equal(f.body.state.enabled, false);
    assert.equal(f.body.state.sleepThreshold, 0.125);
    assert.deepEqual(Object.keys(f.body.impl).sort(), ['backend', 'kind']);
    assert(!Object.values(f.body.impl).includes(f.token));
});
test('MOCK: actual IRigidBody lifecycle retains/owns/releases one body', () => {
    const f = fixture();
    f.adapter.initialize(f.component);
    f.adapter.onEnable();
    assert.equal(f.body.state.type, 2);
    assert.equal(f.body.state.enabled, true);
    f.adapter.onDisable();
    assert.equal(f.body.state.enabled, false);
    f.adapter.onDestroy();
    f.adapter.onDestroy();
    assert.equal(f.calls.filter(([name]) => name === 'destroyBody').length, 1);
    assert.equal(f.owner.releasedCount, 1);
});
test('MOCK: last owner, not first owner, destroys the shared body', () => {
    const f = fixture();
    const a = {},
        b = {};
    f.body.retain(a);
    f.body.retain(b);
    f.body.release(a);
    assert.equal(f.calls.filter(([name]) => name === 'destroyBody').length, 0);
    f.body.release(b);
    assert.equal(f.owner.releasedCount, 1);
});
test('MOCK: enabled pending geometry preflight rejects without mutations and can recover', () => {
    const f = fixture();
    f.adapter.initialize(f.component);
    f.adapter.onEnable();
    const before = f.calls.length,
        invalidations = f.owner.invalidations;
    assert.throws(() => f.body.preflight(), coded('AIR_E_BOX3D_MASS_PENDING'));
    assert.equal(f.calls.length, before);
    assert.equal(f.owner.invalidations, invalidations);
    assert.equal(f.owner.faults.length, 0);
    f.state.massPending = false;
    assert.doesNotThrow(() => f.body.preflight());
});
test('MOCK: post-step Node write uses origin, not COM, without clearing other dirty flags', () => {
    const f = fixture();
    f.adapter.initialize(f.component);
    f.adapter.onEnable();
    f.state.massPending = false;
    f.body.syncPhysicsToScene();
    assert.deepEqual(f.node.worldPosition, { x: 7, y: 8, z: 9 });
    assert.equal(f.node.hasChangedFlags & 0x60, 0x60);
    assert.doesNotThrow(() => f.body.preflight());
});
test('MOCK: external Node pose/scale/parent is unsupported before any native change', () => {
    for (const change of [(n) => n.worldPosition.x++, (n) => n.worldScale.y++, (n) => (n.parent = {})]) {
        const f = fixture();
        const before = f.calls.length;
        change(f.node);
        assert.throws(() => f.body.preflight(), coded('AIR_E_BOX3D_UNSUPPORTED'));
        assert.equal(f.calls.length, before);
        assert.equal(f.owner.faults.length, 0);
    }
});
test('MOCK: setters use incoming candidate, never precommit component cache', () => {
    const f = fixture();
    f.adapter.initialize(f.component);
    f.adapter.setMass(12);
    f.adapter.setLinearDamping(0.75);
    f.adapter.useGravity(false);
    f.adapter.setLinearFactor({ x: 0, y: 1, z: 0 });
    assert.equal(f.body.state.mass, 12);
    assert.equal(f.component.mass, 5);
    assert.equal(f.body.state.linearDamping, 0.75);
    assert.equal(f.body.state.angularDamping, 0.2);
    assert.equal(f.body.state.gravityScale, 0);
    assert.deepEqual(f.body.state.linearFactor, [0, 1, 0]);
});
test('MOCK: local forces/impulses forward COM-relative offsets and real native method', () => {
    const f = fixture();
    f.adapter.initialize(f.component);
    f.adapter.applyLocalForce({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 });
    f.adapter.applyLocalImpulse({ x: 1, y: 0, z: 0 });
    assert.deepEqual(f.calls.at(-2), ['applyBodyForce', [1, 2, 3], [4, 5, 6], 'local']);
    assert.deepEqual(f.calls.at(-1), ['applyBodyImpulse', [1, 0, 0], undefined, 'local']);
});
test('MOCK: dynamic method names cannot escape the fixed body-control allowlist', () => {
    const f = fixture();
    const before = f.calls.length;
    assert.throws(() => f.body.control('createBody'), coded('AIR_E_BOX3D_UNSUPPORTED'));
    assert.equal(f.calls.length, before);
});
test('MOCK: state copy failure faults owner; specified native argument rejection does not', () => {
    const f = fixture();
    f.binding.setBodyMass = () => {
        throw Object.assign(new Error('invalid'), { code: 'AIR_E_BOX3D_ARGUMENT' });
    };
    assert.throws(() => f.body.control('setBodyMass', NaN));
    assert.equal(f.owner.faults.length, 0);
    f.binding.setBodyMass = () => ({ mass: 2 });
    assert.throws(() => f.body.control('setBodyMass', 2), coded('AIR_E_BOX3D_ABI'));
    assert.equal(f.owner.faults.length, 1);
});
test('MOCK: after world close, component destroy cannot double-free native body', () => {
    const f = fixture();
    f.adapter.initialize(f.component);
    f.body.closeWithWorld();
    f.adapter.onDestroy();
    assert.equal(f.calls.filter(([name]) => name === 'destroyBody').length, 0);
    assert.throws(() => f.body.state, coded('AIR_E_BOX3D_DISPOSED'));
});

function actualWorldFixture() {
    const f = fixture();
    // The existing shared-body fixture supplies explicit mocked native controls; the world below is actual AIR source.
    const native = { step: 0, completed: false, snapshot: false, gravity: [0, -10, 0], sleeping: true };
    const b = f.binding;
    Object.assign(b, {
        identity: Object.freeze({ abiVersion: 1, variant: 'st-simd' }),
        createWorld: () => Object.freeze({ id: 7 }),
        destroyWorld: () => {},
        step() {
            ++native.step;
            native.completed = native.snapshot = true;
        },
        readStepSnapshot: (world) => Object.freeze({ worldId: world.id, stepIndex: native.step }),
        stepDiagnostics: () => ({
            nativeStepIndex: native.step,
            nativeCompleted: native.completed,
            snapshotAvailable: native.snapshot,
        }),
        getGravity: () => native.gravity,
        setGravity: (_world, value) => {
            native.gravity = value;
        },
        isSleepingEnabled: () => native.sleeping,
        setSleepingEnabled: (_world, value) => {
            native.sleeping = value;
        },
        debugSnapshot: (_world, flags, jointScale) => ({ flags, jointScale, supportedFlags: 5, primitives: [] }),
        getShapeMaterial: () => ({ friction: 0.6, restitution: 0 }),
        setShapeMaterial: () => assert.fail('unused mock shape mutation'),
        worldCounts: () => ({ counts: new Uint32Array([1, 0, 0, 0]), liveBytes: 0n }),
        liveBytes: () => 0n,
        getShapeFilter: () => assert.fail('unused mock filter read'),
        setShapeFilter: () => assert.fail('unused mock filter write'),
        createOffsetBox: () => assert.fail('unused mock shape creation'),
        createOffsetSphere: () => assert.fail('unused mock shape creation'),
        destroyShape: () => assert.fail('unused mock shape destroy'),
        configureShapeEvents: () => assert.fail('unused mock event config'),
    });
    const { Box3DPhysicsWorld } = load('src/air/physics/box3d/world.ts');
    const { createAirPhysicsPreparation } = load('src/air/physics/preparation.ts');
    const preparation = createAirPhysicsPreparation();
    preparation.own('box3d', 'module', () => {});
    const options = { threading: 'single', workerCount: 1, solverSubSteps: 1 };
    const world = new Box3DPhysicsWorld({ binding: b, options }, options, preparation);
    const reference = {};
    const body = world.acquireSharedBody(f.node, reference, f.configuration);
    return { ...f, body, world, native, reference, preparation };
}
test('MOCK/actual world RED: rejected native argument preserves completed snapshot and diagnostics', () => {
    const f = actualWorldFixture();
    f.world.step(1 / 60);
    const before = f.world.diagnostics(),
        snapshot = f.world.getStepSnapshot();
    f.binding.setBodyMass = () => {
        throw Object.assign(new Error('invalid mass'), { code: 'AIR_E_BOX3D_ARGUMENT' });
    };
    assert.throws(() => f.body.control('setBodyMass', NaN), coded('AIR_E_BOX3D_ARGUMENT'));
    assert.deepEqual(f.world.diagnostics(), before);
    assert.equal(f.world.getStepSnapshot(), snapshot);
    f.world.emitEvents();
    assert.equal(f.world.diagnostics().emittedStep, 1);
    f.world.destroy();
});
test('MOCK/actual world RED: unclassified native error after mutation is faulted, never assumed pure', () => {
    const f = actualWorldFixture();
    f.world.step(1 / 60);
    f.binding.setBodyMass = () => {
        f.state.mass = 8;
        f.native.snapshot = false;
        throw Object.assign(new Error('post-write native readback failed'), { code: 'AIR_E_BOX3D_NATIVE' });
    };
    assert.throws(() => f.body.control('setBodyMass', 8), coded('AIR_E_BOX3D_NATIVE'));
    assert.equal(f.world.diagnostics().state, 'faulted');
    assert.equal(f.world.diagnostics().nativeObservationCurrent, false);
    f.world.destroy();
});
test('MOCK/actual world: native destroy failure faults; world destruction remains the cleanup owner', () => {
    const f = actualWorldFixture();
    f.binding.destroyBody = () => {
        throw Object.assign(new Error('destroy uncertain'), { code: 'AIR_E_BOX3D_NATIVE' });
    };
    assert.throws(() => f.body.release(f.reference), /destroy uncertain/);
    assert.equal(f.world.diagnostics().state, 'faulted');
    assert.equal(f.world.diagnostics().sceneBindingCount, 1);
    f.world.destroy();
    assert.equal(f.world.diagnostics().sceneBindingCount, 0);
});
test('MOCK/actual world: mass pending is rejected before stepping state/counters and resolves without fault', () => {
    const f = actualWorldFixture();
    f.body.control('setBodyType', 2);
    f.body.control('setBodyEnabled', true);
    const before = f.world.diagnostics();
    assert.throws(() => f.world.step(1 / 60), coded('AIR_E_BOX3D_MASS_PENDING'));
    assert.deepEqual(f.world.diagnostics(), before);
    assert.equal(f.native.step, 0);
    f.state.massPending = false;
    f.world.step(1 / 60);
    assert.equal(f.native.step, 1);
    assert.equal(f.world.diagnostics().state, 'ready');
    f.world.destroy();
});
for (const [field, invalid] of [
    ['mass', NaN],
    ['mass', 0],
    ['mass', Infinity],
    ['linearDamping', -0.1],
    ['angularDamping', 1.1],
    ['allowSleep', 'false'],
    ['useGravity', 0],
    ['linearFactor', { x: 1, y: 0.5, z: 1 }],
    ['angularFactor', { x: 1, y: 1, z: NaN }],
]) {
    test(`MOCK existing shared owner RED: invalid serialized ${field} rejects before every native write`, () => {
        const f = fixture();
        f.body.retain({ existingColliderOwner: true });
        const candidate = { ...f.component, mass: 12, [field]: invalid };
        const beforeState = f.body.state,
            beforeCalls = f.calls.length,
            beforeInvalidations = f.owner.invalidations;
        expectRejected(() => f.body.attachRigidBody(candidate, f.configuration));
        assert.deepEqual(f.body.state, beforeState);
        assert.equal(f.calls.length, beforeCalls);
        assert.equal(f.owner.invalidations, beforeInvalidations);
        assert.equal(f.body.rigidBody, null);
    });
}
function expectRejected(action) {
    assert.throws(action);
}
