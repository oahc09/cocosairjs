/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// CPU-only: transpile the actual unchanged Constraint/FixedConstraint/state-owner source.
// Component, selector and adapter are explicit stubs. No SDK import, physics step or native instantiation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { here, sha } from './inputs.mjs';
import { configureMountedFixedConstraint, readCommittedFixedConfiguration } from './fixture.mjs';
const sourceRoot = resolve(process.env.C20_APP_SOURCE_ROOT ?? resolve(here, '../../../../..'));
const require = createRequire(join(sourceRoot, 'package.json'));
const ts = require('typescript');
const paths = {
    constraint: 'src/cocos/physics/framework/components/constraints/constraint.ts',
    fixed: 'src/cocos/physics/framework/components/constraints/fixed-constraint.ts',
    state: 'src/cocos/physics/framework/constraint-state-control.ts',
    v1: 'tools/physics/box3d/c20-app-scene-cycles/v1/fixture.mjs',
};
const source = Object.fromEntries(
    Object.entries(paths).map(([key, path]) => [key, readFileSync(join(sourceRoot, path), 'utf8')]),
);
const expected = {
    constraint: '2dbb8c5bc7642dd797c48b83f11a98ad9030228b87d1a92c4a6d572d453bd0a0',
    fixed: 'b1b906fa653871eff4aa12dfb846e5e06f2fb8ad3329e77ad89e2b7b87b221a1',
    state: 'ec183a45bc8ee6ebf2cc1a5ee8a8221f472c95534ffb68ac79511dedcb4bfdfd',
    v1: 'b05c1ffb6bfbaefc195b7a93c068dedadd70b7de1f0eaa09955239fa0e9dc6c0',
};
for (const [key, hash] of Object.entries(expected))
    assert.equal(sha(source[key]), hash, 'Exact reviewed actual source: ' + paths[key]);
function load(code, requireStub) {
    const compiled = ts.transpileModule(code, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
            useDefineForClassFields: true,
        },
        reportDiagnostics: true,
    });
    assert(!(compiled.diagnostics ?? []).some((d) => d.category === ts.DiagnosticCategory.Error));
    const module = { exports: {} };
    vm.runInNewContext(
        compiled.outputText,
        { module, exports: module.exports, require: requireStub, Object, Error, TypeError },
        { timeout: 1000 },
    );
    return module.exports;
}
function cpuContext(registerOwner = true) {
    const calls = [],
        state = load(source.state, () => {
            throw new Error('Unexpected state import');
        });
    class Component {
        enabled = true;
        getComponent() {
            return {};
        }
        destroy() {
            return true;
        }
    }
    class RigidBody {}
    const noDecorator = () => undefined;
    const factory = () => noDecorator;
    const decorators = Object.fromEntries(
        ['ccclass', 'requireComponent', 'displayOrder', 'type', 'tooltip', 'help', 'menu', 'formerlySerializedAs'].map(
            (key) => [key, factory],
        ),
    );
    decorators.readOnly = noDecorator;
    decorators.serializable = noDecorator;
    const fake = {
        component: null,
        force: null,
        torque: null,
        connected: false,
        initialize(component) {
            calls.push('actual-onLoad-initialize');
            this.component = component;
            this.force = component.breakForce;
            this.torque = component.breakTorque;
            if (registerOwner)
                state.registerConstraintStateOwner(component, {
                    change: (field, value, commit) => {
                        calls.push('owner-' + field);
                        commit();
                        if (field === 'breakForce') this.force = value;
                        if (field === 'breakTorque') this.torque = value;
                    },
                    assertDestroy() {},
                    read: () => this.read(),
                });
        },
        onEnable() {
            calls.push('actual-onEnable');
        },
        setBreakForce(value) {
            calls.push('legacy-adapter-breakForce');
            this.force = value;
        },
        setBreakTorque(value) {
            calls.push('legacy-adapter-breakTorque');
            this.torque = value;
        },
        setConnectedBody() {},
        setEnableCollision() {},
        read() {
            return Object.freeze({
                backend: 'box3d',
                kind: 'fixed',
                state: this.connected ? 'connected' : 'pending',
                native: this.connected
                    ? Object.freeze({ kind: 'fixed', breakForce: this.force, breakTorque: this.torque })
                    : null,
            });
        },
    };
    const baseImports = {
        'cc.decorator': decorators,
        'internal:constants': { EDITOR_NOT_IN_PREVIEW: false },
        '../../../../scene-graph': { Component },
        '../rigid-body': { RigidBody },
        '../../../../core': { Eventify: (base) => base, CCFloat: Number },
        '../../physics-selector': {
            selector: { runInEditor: true },
            createConstraint: () => {
                calls.push('create-adapter');
                return fake;
            },
        },
        '../../physics-enum': { EConstraintType: { FIXED: 1 } },
        '../../constraint-state-control': state,
    };
    const resolveStub = (id) => {
        assert(id in baseImports, 'Unexpected CPU source import ' + id);
        return baseImports[id];
    };
    const { Constraint } = load(source.constraint, resolveStub);
    baseImports['./constraint'] = { Constraint };
    const { FixedConstraint } = load(source.fixed, resolveStub);
    const joint = new FixedConstraint(),
        scene = {};
    let current = null;
    const app = {
        getScene: () => current,
        run(value) {
            calls.push('mount');
            joint.onLoad();
            joint.onEnable();
            current = value;
        },
    };
    const sdk = { readBox3DConstraintState: (component) => state.readConstraintState(component) };
    return { calls, joint, scene, app, sdk, fake };
}
test('CPU actual v1 source configures non-null-guarded thresholds before app.run', () => {
    assert(source.v1.indexOf('joint.breakForce = 1e8') < source.v1.indexOf('app.run(scene)'));
    assert(source.v1.indexOf('joint.breakTorque = 1e8') < source.v1.indexOf('app.run(scene)'));
});
for (const field of ['breakForce', 'breakTorque'])
    test('CPU actual source preserves v1 pre-mount null failure: ' + field, () => {
        const { joint, calls } = cpuContext();
        assert.equal(joint.constraint, null);
        assert.throws(
            () => {
                joint[field] = 1e8;
            },
            (error) =>
                error.name === 'TypeError' &&
                error.message.includes('null') &&
                error.message.includes(field === 'breakForce' ? 'setBreakForce' : 'setBreakTorque'),
        );
        assert.deepEqual(calls, []);
    });
test('CPU actual base Constraint caches connectedBody/collision without an adapter', () => {
    const { joint, calls } = cpuContext();
    const peer = {};
    joint.connectedBody = peer;
    joint.enableCollision = false;
    assert.equal(joint.connectedBody, peer);
    assert.equal(joint.enableCollision, false);
    assert.equal(joint.constraint, null);
    assert.deepEqual(calls, []);
});
test('CPU v2 helper rejects an unmounted scene before calling either real setter', () => {
    const { sdk, app, scene, joint, calls } = cpuContext();
    assert.throws(() => configureMountedFixedConstraint(sdk, app, scene, joint), /already mounted scene/);
    assert.equal(joint.constraint, null);
    assert.deepEqual(calls, []);
});
test('CPU actual onLoad then v2 public setters uses registered owner, not null fallback', () => {
    const { sdk, app, scene, joint, fake, calls } = cpuContext();
    joint.connectedBody = {};
    joint.enableCollision = false;
    app.run(scene);
    assert.equal(joint.constraint, fake);
    const configured = configureMountedFixedConstraint(sdk, app, scene, joint);
    assert.equal(configured.ownerReadableBeforeSetters, true);
    assert.equal(configured.componentBreakForce, 1e8);
    assert.equal(configured.componentBreakTorque, 1e8);
    assert.deepEqual(calls, [
        'mount',
        'create-adapter',
        'actual-onLoad-initialize',
        'actual-onEnable',
        'owner-breakForce',
        'owner-breakTorque',
    ]);
    // This is deliberately a fake copied diagnostic, not a real native readback or a physics step.
    fake.connected = true;
    assert.deepEqual(readCommittedFixedConfiguration(sdk, joint), {
        kind: 'fixed',
        state: 'connected',
        nativeKind: 'fixed',
        breakForce: 1e8,
        breakTorque: 1e8,
    });
});
test('CPU actual source post-onLoad fallback is also non-null when no backend owner is registered', () => {
    const { joint, scene, app, calls } = cpuContext(false);
    app.run(scene);
    joint.breakForce = 1e8;
    joint.breakTorque = 1e8;
    assert(calls.includes('legacy-adapter-breakForce') && calls.includes('legacy-adapter-breakTorque'));
});
test('CPU v2 source invokes setter and native-readback helpers after app.run and before its first step', () => {
    const fixture = readFileSync(join(here, 'fixture.mjs'), 'utf8');
    const body = fixture.slice(fixture.indexOf('export async function runSceneCycles'));
    const mounted = body.indexOf('app.run(scene)'),
        configured = body.indexOf('configureMountedFixedConstraint(sdk'),
        synced = body.indexOf('system.syncSceneToPhysics()'),
        checked = body.indexOf('readCommittedFixedConfiguration(sdk'),
        stepped = body.indexOf('await step(row, scene)');
    assert(mounted >= 0 && mounted < configured && configured < synced && synced < checked && checked < stepped);
    assert(!/joint\.break(?:Force|Torque)\s*=/.test(body.slice(0, mounted)));
    assert.equal((body.match(/configureMountedFixedConstraint\(sdk/g) ?? []).length, 1);
});
