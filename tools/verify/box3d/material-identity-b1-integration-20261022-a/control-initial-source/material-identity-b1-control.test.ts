/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
declare const BigInt: (value: number) => bigint;
declare const require: { (name: string): any; cache: Record<string, unknown> };
declare const process: { cwd(): string; env: Record<string, string | undefined> };
const fs = require('node:fs'),
    crypto = require('node:crypto'),
    path = require('node:path');
import { Node } from '../../../src/cocos/scene-graph/node';
import { Component } from '../../../src/cocos/scene-graph/component';
import { CCObject, isValid } from '../../../src/cocos/core/data/object';
import { Vec3 } from '../../../src/cocos/core/math/vec3';
import { PhysicsSystem } from '../../../src/cocos/physics/framework/physics-system';
import { PhysicsMaterial } from '../../../src/cocos/physics/framework/assets/physics-material';
import { RigidBody } from '../../../src/cocos/physics/framework/components/rigid-body';
import { BoxCollider } from '../../../src/cocos/physics/framework/components/colliders/box-collider';
import { SphereCollider } from '../../../src/cocos/physics/framework/components/colliders/sphere-collider';
import { selector } from '../../../src/cocos/physics/framework/physics-selector';
import * as transformGuards from '../../../src/cocos/scene-graph/node-transform-validation';
import { registerMutationGuard } from '../../../src/cocos/core/data/mutation-guard';
import { createBox3DWorldAdapter } from '../../../src/air/physics/box3d/registration';
import { createAirPhysicsPreparation } from '../../../src/air/physics/preparation';
import { Box3DPhysicsWorld } from '../../../src/air/physics/box3d/world';
import { Box3DWorldCommandOwner } from '../../../src/air/physics/box3d/world-command-owner';
const original = {
    id: selector.id,
    wrapper: selector.wrapper,
    world: selector.physicsWorld,
    instance: PhysicsSystem.instance,
    backend: selector.backend.box3d,
};
const rows: any[] = [],
    fixtures: any[] = [],
    nodes: Node[] = [];
let row: any;
let materialBaseline = new Set<PhysicsMaterial>();
beforeEach(() => {
    materialBaseline = new Set(PhysicsMaterial.allMaterials);
});
const copy = (value: any): any =>
    value === undefined
        ? { type: 'undefined' }
        : JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? String(v) : v)));
function check(name: string, actual: any, expected: any): void {
    row.checks.push({
        name,
        actual: copy(actual),
        expected: copy(expected),
        passed: JSON.stringify(copy(actual)) === JSON.stringify(copy(expected)),
    });
}
function refused(fn: () => unknown, code = 'AIR_E_BOX3D_REENTRANT'): void {
    let thrown = false,
        error: any;
    try {
        fn();
    } catch (value) {
        thrown = true;
        error = value;
    }
    row.attempts.push({ thrown, code: error?.code ?? null, error: String(error) });
    check('explicit rejection', thrown && error?.code === code, true);
}
function control(name: string, run: () => void): void {
    test(name, () => {
        row = { name, checks: [], attempts: [] };
        rows.push(row);
        try {
            run();
        } catch (error) {
            row.fixtureError = String(error);
            throw error;
        }
        row.status = row.checks.every((v: any) => v.passed)
            ? 'PASS_SOURCE_WITH_MOCK_BINDING'
            : 'RED_SOURCE_WITH_MOCK_BINDING';
        expect(row.checks.filter((v: any) => !v.passed)).toEqual([]);
    });
}
function node(name = 'owner-control'): Node {
    const n = new Node(name);
    nodes.push(n);
    return n;
}
function frozen(value: any): any {
    if (value && typeof value === 'object') {
        for (const v of Object.values(value)) frozen(v);
        Object.freeze(value);
    }
    return value;
}
/** Deliberately NOT a solver. Step moves enabled nonstatic origins by exactly +0.25 X for writeback controls. */
function mockBinding() {
    let id = 0,
        step = 0,
        completed = false,
        available = false,
        live = false;
    const calls: string[] = [],
        bodies = new Map<any, any>(),
        shapes = new Map<any, any>();
    let gravity = [0, -10, 0],
        sleeping = true;
    const token = () => Object.freeze({ id: ++id });
    const state = (body: any) => frozen(copy(bodies.get(body).state));
    const mutate = (name: string, body: any, patch: any) => {
        calls.push(name);
        Object.assign(bodies.get(body).state, patch);
        available = false;
        return state(body);
    };
    const binding: any = {
        identity: frozen({ abiVersion: 1, variant: 'st-simd' }),
        createWorld() {
            calls.push('createWorld');
            live = true;
            return token();
        },
        destroyWorld() {
            calls.push('destroyWorld');
            live = false;
            bodies.clear();
            shapes.clear();
        },
        step() {
            calls.push('step');
            step++;
            completed = available = true;
            for (const b of bodies.values()) if (b.state.enabled && b.state.type !== 0) b.pose[0] += 0.25;
        },
        stepDiagnostics: () => ({ nativeStepIndex: step, nativeCompleted: completed, snapshotAvailable: available }),
        readStepSnapshot: (world: any) =>
            frozen({ worldId: world.id, stepIndex: step, bodyMoves: [], contactsOfOwnedBodies: [] }),
        getGravity: () => [...gravity],
        setGravity(_w: any, g: number[]) {
            gravity = [...g];
            available = false;
            calls.push('setGravity');
        },
        isSleepingEnabled: () => sleeping,
        setSleepingEnabled(_w: any, value: boolean) {
            sleeping = value;
            available = false;
            calls.push('setSleepingEnabled');
        },
        debugSnapshot: (_w: any, flags: number, jointScale: number) =>
            frozen({ flags, jointScale, supportedFlags: 5, primitives: [] }),
        liveBytes: () => (live ? BigInt(64) : BigInt(0)),
        worldCounts: () => ({
            counts: new Uint32Array([bodies.size, shapes.size, 0, 0]),
            liveBytes: live ? BigInt(64) : BigInt(0),
        }),
        createBody(_w: any, definition: any) {
            calls.push('createBody');
            const t = token();
            bodies.set(t, {
                pose: [...definition.position, ...definition.rotation, 0, 0, 0],
                state: {
                    type: definition.type,
                    enabled: true,
                    awake: true,
                    sleeping: false,
                    sleepy: false,
                    sleepEnabled: true,
                    ccd: false,
                    sleepTime: 0,
                    sleepVelocity: 0,
                    sleepThreshold: 0.1,
                    linearDamping: 0,
                    angularDamping: 0,
                    gravityScale: 1,
                    linearVelocity: [1, 2, 3],
                    angularVelocity: [0, 0, 0],
                    force: [0, 0, 0],
                    torque: [0, 0, 0],
                    linearFactor: [1, 1, 1],
                    angularFactor: [1, 1, 1],
                    mass: 1,
                    localCenter: [0, 0, 0],
                    inertia: [1, 0, 0, 0, 1, 0, 0, 0, 1],
                    worldCenter: [0, 0, 0],
                    requestedMass: 1,
                    massPending: false,
                    sensorMassFallback: false,
                },
            });
            return t;
        },
        destroyBody(body: any) {
            calls.push('destroyBody');
            if (!bodies.delete(body)) throw Error('Mock body not owned');
        },
        bodyState: (_w: any, body: any) => state(body),
        bodyTransforms: (_w: any, ids: any[]) =>
            ids.reduce((all: number[], body: any) => all.concat(bodies.get(body).pose), []),
        setBodyType: (_w: any, b: any, v: any) => mutate('setBodyType', b, { type: v }),
        setBodyEnabled: (_w: any, b: any, v: any) => mutate('setBodyEnabled', b, { enabled: v }),
        setBodyMass: (_w: any, b: any, v: any) => mutate('setBodyMass', b, { mass: v, requestedMass: v }),
        setBodyDamping: (_w: any, b: any, x: any, y: any) =>
            mutate('setBodyDamping', b, { linearDamping: x, angularDamping: y }),
        setBodyGravityScale: (_w: any, b: any, v: any) => mutate('setBodyGravityScale', b, { gravityScale: v }),
        setBodySleepEnabled: (_w: any, b: any, v: any) => mutate('setBodySleepEnabled', b, { sleepEnabled: v }),
        setBodySleepThreshold: (_w: any, b: any, v: any) => mutate('setBodySleepThreshold', b, { sleepThreshold: v }),
        setBodyAwake: (_w: any, b: any, v: any) => mutate('setBodyAwake', b, { awake: v }),
        setBodyCCD: (_w: any, b: any, v: any) => mutate('setBodyCCD', b, { ccd: v }),
        setBodyMotionFactors: (_w: any, b: any, x: any, y: any) =>
            mutate('setBodyMotionFactors', b, { linearFactor: [...x], angularFactor: [...y] }),
        setBodyLinearVelocity: (_w: any, b: any, v: any) =>
            mutate('setBodyLinearVelocity', b, { linearVelocity: [...v] }),
        setBodyAngularVelocity: (_w: any, b: any, v: any) =>
            mutate('setBodyAngularVelocity', b, { angularVelocity: [...v] }),
        applyBodyForce: (_w: any, b: any, v: any) => mutate('applyBodyForce', b, { force: [...v] }),
        applyBodyImpulse: (_w: any, b: any, v: any) => mutate('applyBodyImpulse', b, { linearVelocity: [...v] }),
        applyBodyTorque: (_w: any, b: any, v: any) => mutate('applyBodyTorque', b, { torque: [...v] }),
        clearBodyForces: (_w: any, b: any) => mutate('clearBodyForces', b, { force: [0, 0, 0], torque: [0, 0, 0] }),
        clearBodyVelocity: (_w: any, b: any) =>
            mutate('clearBodyVelocity', b, { linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0] }),
        clearBodyState: (_w: any, b: any) =>
            mutate('clearBodyState', b, {
                force: [0, 0, 0],
                torque: [0, 0, 0],
                linearVelocity: [0, 0, 0],
                angularVelocity: [0, 0, 0],
            }),
        createOffsetBox(body: any) {
            calls.push('createOffsetBox');
            const t = token();
            shapes.set(t, {
                body,
                material: { friction: 0.6, restitution: 0 },
                filter: { group: 1, mask: 0xffffffff },
            });
            return t;
        },
        createOffsetSphere(body: any) {
            calls.push('createOffsetSphere');
            const t = token();
            shapes.set(t, {
                body,
                material: { friction: 0.6, restitution: 0 },
                filter: { group: 1, mask: 0xffffffff },
            });
            return t;
        },
        destroyShape(t: any) {
            calls.push('destroyShape');
            if (!shapes.delete(t)) throw Error('Mock shape not owned');
        },
        configureShapeEvents() {
            calls.push('configureShapeEvents');
        },
        getShapeMaterial: (_w: any, t: any) => ({ ...shapes.get(t).material }),
        setShapeMaterial(_w: any, t: any, m: any) {
            calls.push('setShapeMaterial');
            shapes.get(t).material = { ...m };
        },
        getShapeFilter: (_w: any, t: any) => ({ ...shapes.get(t).filter }),
        setShapeFilter(_w: any, t: any, f: any) {
            calls.push('setShapeFilter');
            return (shapes.get(t).filter = frozen({ ...f }));
        },
        setShapeFilters(_w: any, ids: any[], f: any) {
            calls.push('setShapeFilters');
            return ids.map((t) => (shapes.get(t).filter = frozen({ ...f })));
        },
    };
    return { binding, calls, bodies, shapes };
}
function fixture(reader?: () => PhysicsSystem, construct = true) {
    const mock = mockBinding(),
        preparation = createAirPhysicsPreparation();
    const system = new (PhysicsSystem as any)() as PhysicsSystem;
    (PhysicsSystem as any)._instance = system;
    const options: any = { threading: 'single', workerCount: 1, solverSubSteps: 4 };
    const lease: any = {
        binding: mock.binding,
        options,
        generation: preparation.generation,
        dispose() {
            mock.calls.push('module.dispose');
        },
    };
    preparation.own('box3d', 'module', () => lease.dispose());
    (selector as any).physicsWorld = null;
    let reads = 0;
    const config = {
        collisionMask: (group: number) => system.collisionMatrix[group],
        sleepThreshold: () => system.sleepThreshold,
    };
    const prepare = createBox3DWorldAdapter(selector, config, undefined, {
        physicsSystem: () => {
            reads++;
            return reader ? reader() : system;
        },
    });
    const prepared = prepare(lease, options, preparation) as { select(): void };
    const f: any = { ...mock, system, preparation, config, prepared, reads: () => reads, world: null, components: [] };
    fixtures.push(f);
    prepared.select();
    if (construct) {
        f.world = new selector.wrapper.PhysicsWorld!();
        (selector as any).physicsWorld = f.world;
    }
    return f;
}
/** Real onLoad obtains original registered wrapper. No adapter clone and no replaced engine setter. */
function rigid(f: any, n = node()): RigidBody {
    const c = n.addComponent(RigidBody);
    (c as any).onLoad();
    (c as any).onEnable();
    f.components.push(c);
    return c;
}
function shape(
    f: any,
    n: Node,
    enabled = true,
    material: PhysicsMaterial | null = null,
    sphere = false,
): BoxCollider | SphereCollider {
    const c = sphere ? n.addComponent(SphereCollider) : n.addComponent(BoxCollider);
    c.sharedMaterial = material;
    c.enabled = enabled;
    (c as any).onLoad();
    if (enabled) (c as any).onEnable();
    f.components.push(c);
    return c;
}
afterEach(async () => {
    const failures: unknown[] = [];
    for (const n of nodes) n.off(Node.EventType.TRANSFORM_CHANGED);
    try {
        for (const f of fixtures) {
            const errors: string[] = [];
            for (const c of [...f.components].reverse()) {
                try {
                    (c as any).onDisable();
                } catch (error) {
                    errors.push(String(error));
                } finally {
                    try {
                        (c as any).onDestroy();
                    } catch (error) {
                        errors.push(String(error));
                    }
                }
            }
            const receipt = await f.preparation.dispose();
            row.cleanup = { errors, receipt: copy(receipt), diagnostics: copy(f.world?.diagnostics()) };
            if (f.expectedUnresolvedBodies !== undefined) {
                check(
                    'unresolved native body survives JS cleanup',
                    f.world.diagnostics().commandOwner.unresolvedNativeBodies,
                    f.expectedUnresolvedBodies,
                );
                check('component cleanup is independent', f.world.diagnostics().commandOwner.components, 0);
            }
            if (errors.length) failures.push(...errors);
            if (receipt.status !== (f.expectedCleanupStatus ?? 'closed')) failures.push(receipt.status);
        }
    } finally {
        fixtures.length = 0;
        for (const n of nodes) if (isValid(n, true)) n.destroy();
        nodes.length = 0;
        for (const material of [...PhysicsMaterial.allMaterials])
            if (!materialBaseline.has(material) && isValid(material, true)) material.destroy();
        CCObject._deferredDestroy();
        (selector as any).id = original.id;
        (selector as any).wrapper = original.wrapper;
        (selector as any).physicsWorld = original.world;
        (PhysicsSystem as any)._instance = original.instance;
        if (original.backend) selector.backend.box3d = original.backend;
        else delete selector.backend.box3d;
        jest.restoreAllMocks();
    }
    row.status =
        !failures.length && row.checks.every((v: any) => v.passed)
            ? 'PASS_SOURCE_WITH_MOCK_BINDING'
            : 'RED_SOURCE_WITH_MOCK_BINDING';
    expect(failures).toEqual([]);
    expect(row.checks.filter((v: any) => !v.passed)).toEqual([]);
});
afterAll(() => {
    if (process.env.BOX3D_B1_RAW)
        fs.writeFileSync(
            process.env.BOX3D_B1_RAW,
            JSON.stringify(
                {
                    scope: 'Actual engine and AIR source. Explicit mock native binding. Manual original onLoad/onEnable callbacks on unattached Nodes, no scheduler/game.init/WASM/physics qualification.',
                    rows,
                    loadedEngineSources: Object.keys(require.cache)
                        .map((p) => ({ path: path.relative(process.cwd(), p), absolute: p }))
                        .filter((p) => p.path.startsWith('src/') || p.path.startsWith('test/'))
                        .sort((a, b) => a.path.localeCompare(b.path))
                        .map((p) => ({
                            path: p.path,
                            sha256: crypto.createHash('sha256').update(fs.readFileSync(p.absolute)).digest('hex'),
                        })),
                },
                null,
                2,
            ) + '\n',
        );
});

function capture(perform: () => unknown): { threw: boolean; error: unknown } {
    try {
        perform();
        return { threw: false, error: undefined };
    } catch (error) {
        return { threw: true, error };
    }
}
function configured() {
    const f = fixture();
    const material = new PhysicsMaterial();
    f.system.setDefaultPhysicsMaterial(material);
    return f;
}
function nativeFriction(f: any): number {
    return [...f.shapes.values()][0].material.friction;
}
control('initial listener commit completes disabled identity; replacement applies on later enable', () => {
    const f = configured(),
        asset = new PhysicsMaterial(),
        next = new PhysicsMaterial();
    next.friction = 0.8;
    const c = shape(f, node(), false, asset);
    check('disabled component retained', f.world.diagnostics().commandOwner.disabledComponents, 1);
    c.material = next;
    check('actual cache committed', c.sharedMaterial === next, true);
    check('no fake native shape', f.shapes.size, 0);
    c.enabled = true;
    (c as any).onEnable();
    check('later real adapter applies copied value to mock', nativeFriction(f), Math.fround(0.8));
    check('no scope remains', f.world.diagnostics().commandOwner.activeTemporaryScopes, 0);
});
control('cloned actual identity is fenced in original Node writeback callback', () => {
    const f = configured(),
        n = node(),
        asset = new PhysicsMaterial();
    rigid(f, n);
    const c = shape(f, n, true, asset);
    const cloned = c.material!;
    check('distinct clone', cloned !== asset, true);
    let callbacks = 0;
    n.on(Node.EventType.TRANSFORM_CHANGED, () => {
        callbacks++;
        refused(() => {
            cloned.friction = 0.8;
        });
    });
    f.world.step(1 / 60);
    check('callback happened', callbacks > 0, true);
    check('clone cache preserved', cloned.friction, asset.friction);
    check('world ready', f.world.diagnostics().state, 'ready');
});
control('candidate getter reads once behind owner guards; copied delegate does not reread', () => {
    const f = configured(),
        n = node(),
        c = shape(f, n, true, new PhysicsMaterial());
    const candidate = new PhysicsMaterial();
    let reads = 0;
    Object.defineProperty(candidate, 'friction', {
        configurable: true,
        get() {
            reads++;
            refused(() => {
                f.system.enable = false;
            });
            refused(() => n.setPosition(1, 2, 3));
            return 0.7;
        },
    });
    c.material = candidate;
    check('single candidate read', reads, 1);
    check('mock receives copied value', nativeFriction(f), Math.fround(0.7));
    check('cache actual identity', c.sharedMaterial === candidate, true);
});
control('Collider listener throw 0 after delegate preserves actual old cache and faults without replay', () => {
    const f = configured(),
        old = new PhysicsMaterial(),
        c = shape(f, node(), true, old),
        candidate = new PhysicsMaterial();
    candidate.friction = 0.8;
    (candidate as any).on = () => {
        throw 0;
    };
    const start = f.calls.filter((x: string) => x === 'setShapeMaterial').length;
    const result = capture(() => {
        c.material = candidate;
    });
    check('original falsy error', result.threw && result.error === 0, true);
    check('actual old cache', c.sharedMaterial === old, true);
    check('mock native committed', nativeFriction(f), Math.fround(0.8));
    check('one setter not reverse write', f.calls.filter((x: string) => x === 'setShapeMaterial').length - start, 1);
    const d = f.world.diagnostics();
    check('fault', d.state, 'faulted');
    check('actual read classification', d.commandOwner.lastMaterialChange.actualMatchesBefore, true);
    check('candidate distinction', d.commandOwner.lastMaterialChange.actualMatchesCandidate, false);
    refused(() => f.world.step(1 / 60), 'AIR_E_BOX3D_WORLD_FAULTED');
});
control('System listener throw undefined after cache write records actual candidate and fault', () => {
    const f = configured();
    shape(f, node());
    const candidate = new PhysicsMaterial();
    candidate.friction = 0.8;
    (candidate as any).on = () => {
        throw undefined;
    };
    const result = capture(() => f.system.setDefaultPhysicsMaterial(candidate));
    check('original undefined', result.threw && result.error === undefined, true);
    check('System actual cache', f.system.defaultMaterial === candidate, true);
    check('native value', nativeFriction(f), Math.fround(0.8));
    const d = f.world.diagnostics();
    check('fault', d.state, 'faulted');
    check('actual candidate', d.commandOwner.lastMaterialChange.actualMatchesCandidate, true);
    check('not old', d.commandOwner.lastMaterialChange.actualMatchesBefore, false);
});
control('old world default entry post-write readback throw null never rolls back', () => {
    const f = configured();
    shape(f, node());
    const candidate = new PhysicsMaterial();
    candidate.friction = 0.8;
    const get = f.binding.getShapeMaterial;
    let reads = 0;
    f.binding.getShapeMaterial = (...args: any[]) => {
        if (++reads === 2) throw null;
        return get(...args);
    };
    const start = f.calls.filter((x: string) => x === 'setShapeMaterial').length;
    const result = capture(() => f.world.setDefaultMaterial(candidate));
    check('original null', result.threw && result.error === null, true);
    check('one setter', f.calls.filter((x: string) => x === 'setShapeMaterial').length - start, 1);
    check('no reverse value', nativeFriction(f), Math.fround(0.8));
    check('fault', f.world.diagnostics().state, 'faulted');
});
control('pure unsupported candidate preserves world/cache and permits later valid retry', () => {
    const f = configured(),
        old = new PhysicsMaterial(),
        c = shape(f, node(), true, old),
        invalid = new PhysicsMaterial();
    invalid.rollingFriction = 0.2;
    const start = f.calls.length;
    const result = capture(() => {
        c.material = invalid;
    });
    check('rejected', result.threw, true);
    check('no binding calls', f.calls.length, start);
    check('old actual cache', c.sharedMaterial === old, true);
    check('ready', f.world.diagnostics().state, 'ready');
    check('idle', f.world.diagnostics().commandOwner.phase, 'idle');
    const valid = new PhysicsMaterial();
    valid.friction = 0.4;
    c.material = valid;
    check('retry committed', c.sharedMaterial === valid, true);
});
control('clone return mismatch faults with actualRead not requested, never pretends old actual proof', () => {
    const f = configured(),
        asset = new PhysicsMaterial(),
        c = shape(f, node(), true, asset);
    (asset as any).clone = () => {
        const result = new PhysicsMaterial();
        result.friction = 0.9;
        return result;
    };
    const result = capture(() => c.material);
    check('mismatch rejected', result.threw, true);
    const d = f.world.diagnostics();
    check('fault', d.state, 'faulted');
    check('no inferred actual', d.commandOwner.lastMaterialChange.actualRead, 'not-requested');
    check('actual comparison unknown', d.commandOwner.lastMaterialChange.actualMatchesBefore, null);
});
control('initial listener failure leaves allocated owner faulted and teardown possible', () => {
    const f = configured(),
        c = node().addComponent(BoxCollider),
        material = new PhysicsMaterial();
    c.sharedMaterial = material;
    (material as any).on = () => {
        throw 'initial-listener';
    };
    f.components.push(c);
    const result = capture(() => (c as any).onLoad());
    check('initial primary', result.threw && result.error === 'initial-listener', true);
    check('fault', f.world.diagnostics().state, 'faulted');
    check('component remains owned', f.world.diagnostics().commandOwner.components, 1);
    check('not enabled', f.world.diagnostics().commandOwner.disabledComponents, 1);
});
control('two actual same-id material objects are not confused', () => {
    const f = configured(),
        old = new PhysicsMaterial(),
        next = new PhysicsMaterial(),
        c = shape(f, node(), true, old);
    Object.defineProperty(next, 'id', { configurable: true, value: old.id });
    next.friction = 0.2;
    c.material = next;
    check('identity, not id string', c.sharedMaterial === next, true);
    check('copied effect', nativeFriction(f), Math.fround(0.2));
});
control('no observer leaves original unattached Collider setter and getter behavior', () => {
    const c = node().addComponent(BoxCollider),
        material = new PhysicsMaterial();
    c.sharedMaterial = material;
    const clone = c.material;
    check('original clone', clone !== material, true);
    check('cache follows original getter', c.sharedMaterial === clone, true);
});
control('forged internal authority cannot use copied native route', () => {
    const f = configured(),
        owner = new Box3DWorldCommandOwner(1, f.system, f.world);
    refused(() => owner.consumeMaterialAuthority({}, f.system, null));
    check('ordinary world remains ready', f.world.diagnostics().state, 'ready');
    owner.closeAfterWorldTeardown(true);
});
