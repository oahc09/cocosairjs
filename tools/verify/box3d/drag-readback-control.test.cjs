/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual helper, registry and rigid adapter source with explicit component/world/native seams.
 * Read-only source controls; NOT real WASM, engine/browser acceptance or a formal Gate.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { test } = require('node:test');
const root = path.resolve(process.env.DRAG_SOURCE_ROOT || path.join(__dirname, '../../..'));
const dependencyRoot = path.resolve(process.env.DRAG_DEPENDENCY_ROOT || root);
const ts = require(path.join(dependencyRoot, 'node_modules/typescript'));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, imports = {}) {
    const result = ts.transpileModule(read(file), {
        fileName: file,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
        reportDiagnostics: true,
    });
    assert.equal(result.diagnostics.length, 0, file);
    const compiled = new Module(file, module);
    compiled.require = (name) => {
        assert(Object.hasOwn(imports, name), `Unexpected runtime import ${file}: ${name}`);
        return imports[name];
    };
    compiled._compile(result.outputText, file);
    return compiled.exports;
}
const errors = load('src/air/physics/box3d/world-binding.ts');
const before = load('src/air/physics/box3d/before-step-source.ts');
const motion = load('src/air/physics/box3d/body-motion-source.ts', { './world-binding': errors });
const constraintState = load('src/cocos/physics/framework/constraint-state-control.ts');
const PhysicsSystem = { instance: null };
const controls = load('src/air/box3d-controls.ts', {
    '../cocos/physics/framework/physics-system': { PhysicsSystem },
    './physics/box3d/before-step-source': before,
    './physics/box3d/body-motion-source': motion,
    '../cocos/physics/framework/constraint-state-control': constraintState,
});
const flags = { Destroyed: 1, ToDestroy: 4, Destroying: 128 };
const noop = () => {};
const { Box3DRigidBody } = load('src/air/physics/box3d/rigid-body.ts', {
    '../../../cocos/core/data/object': { CCObjectFlags: flags },
    '../../../cocos/physics/framework/physics-system': { PhysicsSystem },
    './body-motion-source': motion,
    './world-binding': errors,
    './shared-body': { validateRigidBodyInitial: noop },
    '../../../cocos/physics/framework/physics-command-submission': {},
    '../../../cocos/scene-graph/component-activity-control': { installComponentActivityDelegateSource: noop },
});
const code = (expected) => (error) => error?.code === expected;
function fixture() {
    const calls = [];
    let readError = null;
    const state = {
        type: 2,
        enabled: true,
        mass: 3,
        massPending: false,
        worldCenter: [11, 22, 33],
        localCenter: [1, 2, 3],
        linearVelocity: [4, 5, 6],
        angularVelocity: [7, 8, 9],
    };
    const transform = [10, 20, 30, 0, 0, 0, 1, 11, 22, 33];
    const node = { _objFlags: 0 };
    const component = { node, _objFlags: 0 };
    // These getters must never become an identity, motion or COM authority.
    for (const key of ['body', 'impl', 'worldPosition', 'worldRotation', 'worldMatrix'])
        Object.defineProperty(component, key, {
            get() {
                throw new Error(`Caller property read: ${key}`);
            },
        });
    const admitRead = () => {
        if (readError) throw readError;
    };
    const shared = {
        rigidBody: null,
        attachRigidBody(value) {
            this.rigidBody = value;
        },
        completeComponent: noop,
        detachRigidBody() {
            this.rigidBody = null;
        },
        release: noop,
        copiedTransform() {
            admitRead();
            calls.push('transform');
            return transform;
        },
        get state() {
            admitRead();
            calls.push('state');
            return state;
        },
    };
    const world = {
        assertComponentConfiguration: noop,
        acquireSharedBody(_node, adapter, _configuration, seed) {
            assert.equal(_node, node);
            assert.equal(seed.adapter, adapter);
            assert.equal(seed.component, component);
            return shared;
        },
    };
    before.installBox3DBeforeStepSource(world, (callback) => {
        callback({ tickIndex: 1 });
    });
    PhysicsSystem.instance = { physicsWorld: world };
    const adapter = new Box3DRigidBody(() => world, {});
    adapter.initialize(component);
    return {
        component,
        adapter,
        state,
        transform,
        node,
        world,
        shared,
        calls,
        rejectRead: (error) => {
            readError = error;
        },
    };
}

test('copies actual origin/COM/COM velocity and deeply freezes an independent snapshot', () => {
    const h = fixture();
    const a = controls.readBox3DBodyMotion(h.component);
    assert.deepEqual(
        Object.keys(a).sort(),
        [
            'position',
            'rotation',
            'worldCOM',
            'localCenter',
            'linearVelocity',
            'angularVelocity',
            'mass',
            'enabled',
            'type',
            'massPending',
        ].sort(),
    );
    assert.deepEqual(a.position, { x: 10, y: 20, z: 30 });
    assert.deepEqual(a.rotation, { x: 0, y: 0, z: 0, w: 1 });
    assert.deepEqual(a.worldCOM, { x: 11, y: 22, z: 33 });
    assert.deepEqual(a.localCenter, { x: 1, y: 2, z: 3 });
    assert.deepEqual(a.linearVelocity, { x: 4, y: 5, z: 6 });
    assert.deepEqual(a.angularVelocity, { x: 7, y: 8, z: 9 });
    assert(Object.isFrozen(a));
    for (const value of Object.values(a)) if (typeof value === 'object') assert(Object.isFrozen(value));
    assert.throws(() => {
        a.worldCOM.x = 999;
    }, TypeError);
    h.state.worldCenter[0] = 50;
    h.state.linearVelocity[0] = 60;
    h.transform[0] = 70;
    const b = controls.readBox3DBodyMotion(h.component);
    assert.equal(a.position.x, 10);
    assert.equal(a.worldCOM.x, 11);
    assert.equal(a.linearVelocity.x, 4);
    assert.equal(b.position.x, 70);
    assert.equal(b.worldCOM.x, 50);
    assert.equal(b.linearVelocity.x, 60);
    assert.notEqual(a, b);
    assert.deepEqual(h.calls, ['transform', 'state', 'transform', 'state']);
});
test('before-step helper reads committed state without commands; disabled/massPending remain observable', () => {
    const h = fixture();
    h.state.enabled = false;
    h.state.massPending = true;
    h.state.type = 0;
    h.state.mass = 0;
    let snapshot;
    controls.registerBox3DBeforeStep(() => {
        snapshot = controls.readBox3DBodyMotion(h.component);
    });
    assert.equal(snapshot.enabled, false);
    assert.equal(snapshot.massPending, true);
    assert.equal(snapshot.type, 0);
    assert.equal(snapshot.mass, 0);
    assert.deepEqual(h.calls, ['transform', 'state']);
});
test('fake, adapter, proxy, null and uninitialized sources reject without reading caller properties', () => {
    const h = fixture();
    const fake = new Proxy(
        {},
        {
            get() {
                throw new Error('Fake body getter invoked');
            },
        },
    );
    for (const input of [fake, h.adapter, new Proxy(h.component, {}), null, {}, 42])
        assert.throws(() => controls.readBox3DBodyMotion(input), code('AIR_E_BOX3D_DISPOSED'));
    assert.deepEqual(h.calls, []);
});
test('current-world identity rejects foreign and old-generation registered bodies', () => {
    const a = fixture();
    const b = fixture();
    assert.throws(() => controls.readBox3DBodyMotion(a.component), code('AIR_E_BOX3D_DISPOSED'));
    assert.deepEqual(a.calls, []);
    assert.equal(controls.readBox3DBodyMotion(b.component).mass, 3);
    PhysicsSystem.instance = { physicsWorld: {} };
    assert.throws(() => controls.readBox3DBodyMotion(b.component), code('AIR_E_PHYSICS_BACKEND_UNAVAILABLE'));
    PhysicsSystem.instance = null;
    assert.throws(() => controls.readBox3DBodyMotion(b.component), code('AIR_E_PHYSICS_BACKEND_UNAVAILABLE'));
});
test('component/Node destruction, detached ownership and terminal disposal reject before native read', () => {
    for (const target of ['component', 'node'])
        for (const flag of Object.values(flags)) {
            const h = fixture();
            h[target]._objFlags = flag;
            assert.throws(() => controls.readBox3DBodyMotion(h.component), code('AIR_E_BOX3D_DISPOSED'));
            assert.deepEqual(h.calls, []);
        }
    const h = fixture();
    h.shared.rigidBody = {};
    assert.throws(() => controls.readBox3DBodyMotion(h.component), code('AIR_E_BOX3D_DISPOSED'));
    h.shared.rigidBody = h.component;
    h.adapter.onDestroy();
    assert.throws(() => controls.readBox3DBodyMotion(h.component), code('AIR_E_BOX3D_DISPOSED'));
    assert.deepEqual(h.calls, []);
});
test('existing committed-read rejection propagates unchanged with no fallback pose estimate', () => {
    for (const errorCode of ['AIR_E_BOX3D_WORLD_FAULTED', 'AIR_E_BOX3D_REENTRANT', 'AIR_E_BOX3D_DISPOSED']) {
        const h = fixture();
        const error = errors.worldError(errorCode, 'existing committed read', 'control rejection');
        h.rejectRead(error);
        assert.throws(
            () => controls.readBox3DBodyMotion(h.component),
            (actual) => actual === error,
        );
        assert.deepEqual(h.calls, []);
    }
});

test('original System identity and current-world identity remain required across native pose preflight', () => {
    const a = fixture();
    PhysicsSystem.instance = { physicsWorld: a.world };
    assert.throws(() => controls.readBox3DBodyMotion(a.component), code('AIR_E_BOX3D_DISPOSED'));
    assert.deepEqual(a.calls, []);
    const b = fixture();
    const transform = b.shared.copiedTransform;
    b.shared.copiedTransform = () => {
        const pose = transform();
        PhysicsSystem.instance = { physicsWorld: b.world };
        return pose;
    };
    assert.throws(() => controls.readBox3DBodyMotion(b.component), code('AIR_E_BOX3D_DISPOSED'));
    assert.deepEqual(b.calls, ['transform']);
});
