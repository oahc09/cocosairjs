/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual AIR world, selector, Component and Node functions. Explicit in-memory binding only:
 * no generated WASM, physical integration, browser, renderer, unified commands or target qualification.
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
                    (c as any).onDestroy();
                } catch (error) {
                    errors.push(String(error));
                }
            }
            const receipt = await f.preparation.dispose();
            row.cleanup = { errors, receipt: copy(receipt), diagnostics: copy(f.world?.diagnostics()) };
            if (errors.length) failures.push(...errors);
            if (receipt.status !== (f.expectedCleanupStatus ?? 'closed')) failures.push(receipt.status);
        }
    } finally {
        fixtures.length = 0;
        for (const n of nodes) if (isValid(n, true)) n.destroy();
        nodes.length = 0;
        CCObject._deferredDestroy();
        (selector as any).id = original.id;
        (selector as any).wrapper = original.wrapper;
        (selector as any).physicsWorld = original.world;
        (PhysicsSystem as any)._instance = original.instance;
        if (original.backend) selector.backend.box3d = original.backend;
        else delete selector.backend.box3d;
        jest.restoreAllMocks();
    }
    expect(failures).toEqual([]);
});
afterAll(() => {
    if (process.env.BOX3D_OWNER_RAW)
        fs.writeFileSync(
            process.env.BOX3D_OWNER_RAW,
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
control('missing environment refuses before selector and allocation', () => {
    const before = selector.wrapper;
    refused(() => (createBox3DWorldAdapter as any)(selector, undefined, undefined), 'AIR_E_BOX3D_CONFIG');
    check('no selector mutation', selector.wrapper === before, true);
});
control('reader must return actual System before native world creation', () => {
    const f = fixture(() => ({}) as PhysicsSystem, false);
    refused(() => new selector.wrapper.PhysicsWorld!(), 'AIR_E_BOX3D_CONFIG');
    check('no mock allocation', f.calls, []);
    check('reader once', f.reads(), 1);
});
control('delayed System uniqueness and owned-world checks precede body/step', () => {
    const f = fixture();
    check('reader once', f.reads(), 1);
    (PhysicsSystem as any)._instance = new (PhysicsSystem as any)();
    refused(() => f.world.step(1 / 60), 'AIR_E_BOX3D_CONFIG');
    const n = node(),
        c = n.addComponent(RigidBody);
    refused(() => (c as any).onLoad(), 'AIR_E_BOX3D_CONFIG');
    check('no body or step', f.calls.includes('createBody') || f.calls.includes('step'), false);
    (PhysicsSystem as any)._instance = f.system;
    (selector as any).physicsWorld = null;
    refused(() => f.world.step(1 / 60), 'AIR_E_BOX3D_CONFIG');
    (selector as any).physicsWorld = f.world;
    f.world.step(1 / 60);
    check('one admitted step', f.calls.filter((v: string) => v === 'step').length, 1);
});
control('fake kind and duplicate actual component rejected before allocation', () => {
    const f = fixture(),
        n = node(),
        adapter = {};
    refused(
        () =>
            f.world.acquireSharedBody(n, adapter, f.config, {
                adapter,
                component: { node: n },
                kind: 'rigid-body',
                material: null,
            }),
        'AIR_E_BOX3D_CONFIG',
    );
    const c = n.addComponent(RigidBody);
    refused(
        () =>
            f.world.acquireSharedBody(n, adapter, f.config, {
                adapter,
                component: c,
                kind: 'collider',
                material: null,
            }),
        'AIR_E_BOX3D_CONFIG',
    );
    check('pure admission zero bodies', f.bodies.size, 0);
    (c as any).onLoad();
    (c as any).onEnable();
    f.components.push(c);
    refused(
        () =>
            f.world.acquireSharedBody(n, adapter, f.config, {
                adapter,
                component: c,
                kind: 'rigid-body',
                material: null,
            }),
        'AIR_E_BOX3D_CONFIG',
    );
    check('one component one body', [f.world.diagnostics().commandOwner.components, f.bodies.size], [1, 1]);
});
control('original actual components share native lifetime; disabled collider identity retained', () => {
    const f = fixture(),
        n = node(),
        rb = rigid(f, n);
    shape(f, n);
    const disabled = shape(f, n, false, null, true);
    check(
        'shared ownership',
        [
            f.bodies.size,
            f.world.diagnostics().commandOwner.components,
            f.world.diagnostics().commandOwner.disabledComponents,
        ],
        [1, 3, 1],
    );
    (rb as any).onDisable();
    (rb as any).onDestroy();
    f.components.splice(f.components.indexOf(rb), 1);
    check('body persists for colliders', [f.bodies.size, f.world.diagnostics().commandOwner.components], [1, 2]);
    check('disabled cache retained', disabled.enabled, false);
});
control('ordinary force remains immediate; System.step owns one native step and exact writeback', () => {
    const f = fixture(),
        rb = rigid(f);
    shape(f, rb.node);
    rb.applyForce(new Vec3(4, 5, 6));
    check('immediate mock effect', f.calls.filter((v: string) => v === 'applyBodyForce').length, 1);
    check('no queue', f.world.diagnostics().commandOwner.pendingCommands, 0);
    f.system.step(1 / 60);
    check('one original System step', f.calls.filter((v: string) => v === 'step').length, 1);
    check('mock origin copied', rb.node.position.x, 0.25);
    check(
        'activation blocked',
        [
            f.world.diagnostics().commandOwner.stagedCommandsSupported,
            f.world.diagnostics().commandOwner.unifiedTransactionsSupported,
        ],
        [false, false],
    );
    check('scope finally gone', f.world.diagnostics().commandOwner.activeTemporaryScopes, 0);
    rb.mass = 2;
    check('outside scope ordinary cache commit', rb.mass, 2);
});
control('actual Node/Component/System/material earliest writes reject inside writeback while reads succeed', () => {
    const f = fixture(),
        parent = node('parent'),
        child = node('child');
    parent.addChild(child);
    const rb = rigid(f, child),
        asset = new PhysicsMaterial(),
        def = new PhysicsMaterial();
    const disabled = shape(f, child, false, asset);
    f.system.setDefaultPhysicsMaterial(def);
    let events = 0,
        constructorCalls = 0,
        getterCalls = 0;
    class Custom extends Component {
        constructor() {
            super();
            constructorCalls++;
        }
    }
    const orphan = node('orphan');
    child.on(Node.EventType.TRANSFORM_CHANGED, () => {
        events++;
        const before = {
            enabled: rb.enabled,
            active: child.active,
            mass: rb.mass,
            sleep: f.system.allowSleep,
            material: asset.friction,
            default: def.friction,
            substeps: f.system.maxSubSteps,
            accumulator: (f.system as any)._accumulator,
        };
        refused(() => {
            rb.enabled = false;
        });
        refused(() => rb.destroy());
        refused(() => {
            child.active = false;
        });
        refused(() => parent.destroyAllChildren());
        refused(() => parent.setPosition(1, 2, 3));
        refused(() => orphan.addComponent(Custom));
        refused(() => {
            disabled.enabled = true;
        });
        refused(() => {
            asset.friction = 0.2;
        });
        refused(() => {
            def.friction = 0.3;
        });
        refused(() => {
            f.system.maxSubSteps = 2;
        });
        refused(() => {
            f.system.allowSleep = false;
        });
        refused(() => f.system.postUpdate(1 / 60));
        refused(() => f.system.step(1 / 60));
        refused(() =>
            f.system.raycastClosest({
                get o() {
                    getterCalls++;
                    return {};
                },
            } as any),
        );
        refused(() =>
            rb.setLinearVelocity({
                get x() {
                    getterCalls++;
                    return 0;
                },
                y: 0,
                z: 0,
            } as Vec3),
        );
        const out = new Vec3();
        rb.getLinearVelocity(out);
        check('committed mock read allowed', [out.x, out.y, out.z], [1, 2, 3]);
        check(
            'cache unchanged',
            {
                enabled: rb.enabled,
                active: child.active,
                mass: rb.mass,
                sleep: f.system.allowSleep,
                material: asset.friction,
                default: def.friction,
                substeps: f.system.maxSubSteps,
                accumulator: (f.system as any)._accumulator,
            },
            before,
        );
    });
    f.system.step(1 / 60);
    check('writeback events occurred', events > 0, true);
    check('constructors and getters never reached', [constructorCalls, getterCalls], [0, 0]);
    check(
        'ready and scope closed',
        [f.world.diagnostics().state, f.world.diagnostics().commandOwner.phase],
        ['ready', 'idle'],
    );
    child.off(Node.EventType.TRANSFORM_CHANGED);
    orphan.addComponent(Custom);
    check('no lease original constructor', constructorCalls, 1);
});
control('recoverable preflight rejection releases leases and does not step/fault', () => {
    const f = fixture(),
        rb = rigid(f),
        body = [...f.bodies.values()][0] as any;
    body.state.massPending = true;
    refused(() => f.system.step(1 / 60), 'AIR_E_BOX3D_MASS_PENDING');
    check(
        'zero steps and idle',
        [f.calls.includes('step'), f.world.diagnostics().state, f.world.diagnostics().commandOwner.phase],
        [false, 'ready', 'idle'],
    );
    rb.enabled = false;
    check('actual public enabled writable after refusal', rb.enabled, false);
    body.state.massPending = false;
    f.system.step(1 / 60);
    check('recoverable retry', f.world.diagnostics().native.nativeStepIndex, 1);
});
control('uncaught writeback configuration refusal faults completed step and releases every lease', () => {
    const f = fixture(),
        rb = rigid(f);
    shape(f, rb.node);
    rb.node.on(Node.EventType.TRANSFORM_CHANGED, () => {
        rb.enabled = false;
    });
    refused(() => f.system.step(1 / 60));
    const d = f.world.diagnostics();
    check(
        'known completed not replayed',
        [d.state, d.lastStepOutcome, d.native.nativeStepIndex, d.commandOwner.activeTemporaryScopes],
        ['faulted', 'completed', 1, 0],
    );
    refused(() => f.system.step(1 / 60), 'AIR_E_BOX3D_WORLD_FAULTED');
    rb.node.off(Node.EventType.TRANSFORM_CHANGED);
    rb.node.active = false;
    check('Node guard released despite fault', rb.node.active, false);
});
control('other owner lease remains after a temporary owner scope releases', () => {
    const f = fixture(),
        n = node(),
        rb = rigid(f, n),
        asset = new PhysicsMaterial();
    shape(f, n, false, asset);
    const other = registerMutationGuard([asset], {
        code: 'OTHER_OWNER',
        message: 'Separate explicit source-control owner',
    });
    try {
        f.system.step(1 / 60);
        refused(() => {
            asset.friction = 0.2;
        }, 'OTHER_OWNER');
    } finally {
        other.dispose();
    }
    asset.friction = 0.2;
    check('both leases gone', asset.friction, 0.2);
    check('body still owned', !!rb.body, true);
});
control('owner phase forbids direct scope reentry and scope token cannot be replayed', () => {
    const f = fixture(),
        owner = new Box3DWorldCommandOwner(99, f.system, f.world),
        scope = owner.beginStep();
    try {
        refused(() => owner.beginStep());
        scope.advance('solving');
        refused(() => owner.assertCommittedRead('test'));
        scope.advance('writeback');
        owner.assertCommittedRead('test');
    } finally {
        scope.dispose();
    }
    scope.dispose();
    refused(() => scope.advance('solving'));
    check('idle after repeated release', owner.diagnostics().phase, 'idle');
    owner.closeAfterWorldTeardown();
});

control('default material fake identity rejects before shape/native mutation', () => {
    const f = fixture(),
        rb = rigid(f);
    shape(f, rb.node);
    const before = f.calls.length;
    refused(
        () => f.world.setDefaultMaterial({ friction: 0.2, restitution: 0, rollingFriction: 0, spinningFriction: 0 }),
        'AIR_E_BOX3D_CONFIG',
    );
    check('no native call for fake asset', f.calls.length, before);
    check('still ready', f.world.diagnostics().state, 'ready');
});
control('failed native disable does not delete component ownership or claim disabled', () => {
    const f = fixture(),
        rb = rigid(f),
        initial = f.world.diagnostics().commandOwner;
    const error = Object.assign(new Error('Explicit mocked not-mutated rejection'), { code: 'MOCK_NOT_MUTATED' });
    Object.defineProperty(error, 'mutationOutcome', { value: 'not-mutated', writable: false, configurable: false });
    const originalSet = f.binding.setBodyEnabled;
    f.binding.setBodyEnabled = () => {
        throw error;
    };
    refused(() => rb.body!.onDisable!(), 'MOCK_NOT_MUTATED');
    f.binding.setBodyEnabled = originalSet;
    check('ownership and activity retained', f.world.diagnostics().commandOwner, initial);
    check('native mock enabled remains', ([...f.bodies.values()][0] as any).state.enabled, true);
});
control('unknown body destruction retains ownership until unique world teardown', () => {
    const f = fixture(),
        rb = rigid(f),
        old = f.binding.destroyBody;
    f.binding.destroyBody = () => {
        throw new Error('Explicit unknown native teardown injection');
    };
    let thrown = false;
    try {
        rb.body!.onDestroy!();
    } catch {
        thrown = true;
    }
    check('destroy refusal surfaced', thrown, true);
    check(
        'owner retained and faulted',
        [
            f.world.diagnostics().commandOwner.components,
            f.world.diagnostics().commandOwner.bodies,
            f.world.diagnostics().state,
        ],
        [1, 1, 'faulted'],
    );
    f.binding.destroyBody = old;
    check('not retried body destruction', f.calls.filter((v: string) => v === 'destroyBody').length, 0);
});
control('native world destruction failure remains separate from cleared JS leases', () => {
    const f = fixture(),
        rb = rigid(f);
    f.binding.destroyWorld = () => {
        throw new Error('Explicit unknown world teardown injection');
    };
    f.expectedCleanupStatus = 'cleanup-failed';
    let thrown = false;
    try {
        f.world.destroy();
    } catch {
        thrown = true;
    }
    check('native teardown failure surfaced', thrown, true);
    check(
        'JS owner closed despite native failure',
        [
            f.world.diagnostics().state,
            f.world.diagnostics().commandOwner.phase,
            f.world.diagnostics().commandOwner.activeTemporaryScopes,
        ],
        ['destroy-failed', 'closed', 0],
    );
    // Actual component cleanup must still release JS references without retrying the failed native world.
    rb.node.active = false;
    f.system.enable = false;
    check('JS guards released', [rb.node.active, f.system.enable], [false, false]);
});
control('solving rejects direct reads and configuration; copied read resumes after completion', () => {
    const f = fixture(),
        rb = rigid(f),
        originalStep = f.binding.step;
    f.binding.step = (...args: unknown[]) => {
        refused(() => rb.getLinearVelocity(new Vec3()));
        refused(() => {
            f.system.gravity = new Vec3(1, 2, 3);
        });
        refused(() => f.world.step(1 / 60));
        originalStep(...args);
    };
    f.system.step(1 / 60);
    const out = new Vec3();
    rb.getLinearVelocity(out);
    check('committed state readable outside solving', [out.x, out.y, out.z], [1, 2, 3]);
});
control('no-lease ordinary Node and System configuration retain original behavior', () => {
    const f = fixture(),
        n = node();
    let calls = 0;
    class Probe extends Component {
        constructor() {
            super();
            calls++;
        }
    }
    const c = n.addComponent(Probe);
    c.enabled = false;
    n.setPosition(2, 3, 4);
    f.system.maxSubSteps = 3;
    f.system.enable = false;
    check(
        'unfenced original changes',
        [calls, c.enabled, n.position.x, f.system.maxSubSteps, f.system.enable],
        [1, false, 2, 3, false],
    );
    check('no staged path', f.world.diagnostics().commandOwner.pendingCommands, 0);
});
