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
import { Node } from '../../../../src/cocos/scene-graph/node';
import { Component } from '../../../../src/cocos/scene-graph/component';
import { CCObject, isValid } from '../../../../src/cocos/core/data/object';
import { Vec3 } from '../../../../src/cocos/core/math/vec3';
import { PhysicsSystem } from '../../../../src/cocos/physics/framework/physics-system';
import { PhysicsMaterial } from '../../../../src/cocos/physics/framework/assets/physics-material';
import { RigidBody } from '../../../../src/cocos/physics/framework/components/rigid-body';
import { BoxCollider } from '../../../../src/cocos/physics/framework/components/colliders/box-collider';
import { SphereCollider } from '../../../../src/cocos/physics/framework/components/colliders/sphere-collider';
import { selector } from '../../../../src/cocos/physics/framework/physics-selector';
import * as transformGuards from '../../../../src/cocos/scene-graph/node-transform-validation';
import { registerMutationGuard } from '../../../../src/cocos/core/data/mutation-guard';
import * as mutationGuards from '../../../../src/cocos/core/data/mutation-guard';
import * as materialBridge from '../../../../src/cocos/physics/framework/physics-material-transaction';
import { createBox3DWorldAdapter } from '../../../../src/air/physics/box3d/registration';
import { createAirPhysicsPreparation } from '../../../../src/air/physics/preparation';
import { Box3DPhysicsWorld } from '../../../../src/air/physics/box3d/world';
import { Box3DWorldCommandOwner } from '../../../../src/air/physics/box3d/world-command-owner';
import * as systemControl from '../../../../src/cocos/physics/framework/physics-system-control';
import { Box3DCommandQueue } from '../../../../src/air/physics/box3d/command-queue';
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
function control(name: string, run: () => void | Promise<void>): void {
    test(name, async () => {
        row = { name, checks: [], attempts: [] };
        rows.push(row);
        try {
            await run();
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
function fixture(reader?: () => PhysicsSystem, construct = true, actualSystem?: PhysicsSystem) {
    const mock = mockBinding(),
        preparation = createAirPhysicsPreparation();
    const system = actualSystem ?? (new (PhysicsSystem as any)() as PhysicsSystem);
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
    if (process.env.BOX3D_PAUSE_REVIEW_RAW)
        fs.writeFileSync(
            process.env.BOX3D_PAUSE_REVIEW_RAW,
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

/** Explicitly inject only AFTER the genuine lease disposal. No native status/result is mocked by this injection. */
function injectLeaseCleanupFailures() {
    const calls: string[] = [];
    let mutationIndex = 0;
    const mutation = mutationGuards.registerMutationGuard;
    const transform = transformGuards.registerNodeTransformGuard;
    jest.spyOn(mutationGuards, 'registerMutationGuard').mockImplementation((...args: Parameters<typeof mutation>) => {
        const lease = mutation(...args),
            index = ++mutationIndex;
        const name = index === 1 ? 'scope-mutation' : 'candidate-mutation';
        let thrown = false;
        return Object.freeze({
            dispose() {
                calls.push(name);
                lease.dispose();
                if (!thrown) {
                    thrown = true;
                    throw index === 1 ? 'scope-mutation-secondary' : undefined;
                }
            },
        });
    });
    jest.spyOn(transformGuards, 'registerNodeTransformGuard').mockImplementation(
        (...args: Parameters<typeof transform>) => {
            const lease = transform(...args);
            let thrown = false;
            return Object.freeze({
                write: lease.write.bind(lease),
                dispose() {
                    calls.push('scope-transform');
                    lease.dispose();
                    if (!thrown) {
                        thrown = true;
                        throw null;
                    }
                },
            });
        },
    );
    return calls;
}
function cleanupChannels(value: any): any[] {
    const found: any[] = [];
    const visit = (current: any, at: string) => {
        if (!current || typeof current !== 'object') return;
        for (const key of Object.keys(current)) {
            const next = current[key],
                name = at + '.' + key;
            if (/secondary|cleanupErrors|cleanupFailures/.test(key)) found.push({ path: name, value: copy(next) });
            visit(next, name);
        }
    };
    visit(value, 'diagnostics');
    return found;
}

function injectInitialDoubleFailure() {
    const prepare = Box3DCommandQueue.prototype.preparePauseTransition;
    const calls: string[] = [];
    jest.spyOn(Box3DCommandQueue.prototype, 'preparePauseTransition').mockImplementation(function (
        this: Box3DCommandQueue,
        paused: boolean,
    ) {
        const actual = prepare.call(this, paused);
        return Object.freeze({
            commit() {
                calls.push('actual queue.commit then throw 0');
                actual.commit();
                throw 0;
            },
            dispose() {
                calls.push('actual queue.dispose then throw undefined');
                actual.dispose();
                throw undefined;
            },
            diagnostics: actual.diagnostics.bind(actual),
        });
    });
    return calls;
}
control(
    'Bootstrap false double JS failure preserves original commit zero and separately records cleanup undefined',
    async () => {
        const f = fixture(undefined, false);
        f.system.enable = false;
        f.expectedCleanupStatus = 'cleanup-failed'; // Persistent injected dispose failure, not a native leak proof.
        const calls = injectInitialDoubleFailure();
        let beforeClose: any;
        const destroy = Box3DPhysicsWorld.prototype.destroy;
        jest.spyOn(Box3DPhysicsWorld.prototype, 'destroy').mockImplementation(function (this: Box3DPhysicsWorld) {
            f.world = this;
            beforeClose = this.diagnostics();
            return destroy.call(this);
        });
        const result = capture(() => {
            f.world = new selector.wrapper.PhysicsWorld!();
            (selector as any).physicsWorld = f.world;
        });
        const receipt = await f.preparation.dispose();
        row.observed = {
            constructor: {
                threw: result.threw,
                exactZero: result.error === 0,
                exactUndefined: result.error === undefined,
            },
            calls: [...calls],
            beforeClose: copy(beforeClose),
            receipt: copy(receipt),
            nativeMockCalls: [...f.calls],
        };
        check('both actual participant methods ran before explicit injected throws', calls.slice(0, 2), [
            'actual queue.commit then throw 0',
            'actual queue.dispose then throw undefined',
        ]);
        check('outer constructor retains first exact zero', result.threw && result.error === 0, true);
        check(
            'world first typed failure retains first exact zero',
            beforeClose.failure.hasFailure && beforeClose.failure.error === 0,
            true,
        );
        check(
            'secondary cleanup undefined remains independently reachable',
            beforeClose.commandOwner.cleanup.cleanupFailures.some((v: any) => v.error === undefined),
            true,
        );
        check('persistent injected disposer remains cleanup-failed honestly', receipt.status, 'cleanup-failed');
        check('native mock teardown independently returned', f.world.diagnostics().teardown.nativeReturned, true);
    },
);
control('Observed setter double JS failure retains zero, actual cache and independent cleanup', () => {
    const f = configured();
    f.expectedCleanupStatus = 'cleanup-failed'; // The wrapper throws after every genuine dispose.
    const calls = injectInitialDoubleFailure();
    const result = capture(() => {
        f.system.enable = false;
    });
    const d = f.world.diagnostics();
    row.observed = {
        result: { threw: result.threw, exactZero: result.error === 0 },
        calls: [...calls],
        diagnostics: copy(d),
        cache: f.system.enable,
    };
    check('original setter zero survives terminal ticket outer catch', result.threw && result.error === 0, true);
    check('world first typed zero survives', d.failure.hasFailure && d.failure.error === 0, true);
    check('public cache committed false is not rolled back', f.system.enable, false);
    check('native independent queue is actually paused', d.commandOwner.systemControl.queuePhase, 'paused');
    check(
        'unknown return marked entered but not returned',
        [
            d.commandOwner.systemControl.lastChange!.queueCommitEntered,
            d.commandOwner.systemControl.lastChange!.queueCommitReturned,
        ],
        [true, false],
    );
    check(
        'cleanup first undefined remains present',
        d.commandOwner.cleanup.hasFailure && d.commandOwner.cleanup.firstError === undefined,
        true,
    );
    const count = f.calls.filter((v: string) => v === 'step').length;
    check('faulted manual step refuses', capture(() => f.system.step(1 / 60)).threw, true);
    check('faulted manual step cannot advance native mock', f.calls.filter((v: string) => v === 'step').length, count);
});
control('Initial false bootstrap permits body assembly but no manual step until resume', () => {
    const f = fixture(undefined, false);
    f.system.enable = false;
    f.world = new selector.wrapper.PhysicsWorld!();
    (selector as any).physicsWorld = f.world;
    const before = f.world.diagnostics();
    check('actual initial queue is paused', before.commandOwner.systemControl.queuePhase, 'paused');
    check('owner captures initial false', before.commandOwner.systemControl.paused, true);
    const n = node();
    rigid(f, n);
    shape(f, n);
    check(
        'paused assembly remains ready with one real adapter body',
        [f.world.diagnostics().state, f.world.diagnostics().commandOwner.bodies],
        ['ready', 1],
    );
    check('paused manual refuses', capture(() => f.system.step(1 / 60)).threw, true);
    check('native mock step count remains zero', f.world.diagnostics().native.nativeStepIndex, 0);
    f.world.syncSceneToPhysics();
    check('paused preflight remains separately admitted', f.world.diagnostics().sceneSyncCalls, 1);
    f.system.enable = true;
    f.system.autoSimulation = false;
    f.system.step(1 / 60);
    check('resume manual advances only one owned mock step', f.world.diagnostics().native.nativeStepIndex, 1);
    check(
        'producer is explicitly not integrated',
        f.world.diagnostics().commandOwner.systemControl.producers,
        'NOT_INTEGRATED',
    );
});

control('Actual cache change before effect-delivery failure faults owner without queue replay', () => {
    const f = configured();
    const begin = systemControl.beginPhysicsSystemControl;
    let actualTicket: ReturnType<typeof begin>;
    const calls: string[] = [];
    jest.spyOn(systemControl, 'beginPhysicsSystemControl').mockImplementation((...args: Parameters<typeof begin>) => {
        const ticket = begin(...args);
        if (!ticket) return ticket;
        actualTicket = ticket;
        return Object.freeze({
            prepare: ticket.prepare.bind(ticket),
            effect() {
                calls.push('injected before real effect recording');
                throw 0;
            },
            commit: ticket.commit.bind(ticket),
            fail: ticket.fail.bind(ticket),
            dispose: ticket.dispose.bind(ticket),
            diagnostics: ticket.diagnostics.bind(ticket),
        });
    });
    const result = capture(() => {
        f.system.enable = false;
    });
    const beforeStep = f.world.diagnostics();
    const ticket = actualTicket!.diagnostics();
    const count = f.calls.filter((v: string) => v === 'step').length;
    const directStep = capture(() => f.world.step(1 / 60));
    row.observed = {
        calls,
        result: { threw: result.threw, exactZero: result.error === 0 },
        ticket: copy(ticket),
        beforeStep: copy(beforeStep),
        directStep: { threw: directStep.threw, error: String(directStep.error) },
        afterStep: copy(f.world.diagnostics()),
    };
    check('original zero escapes observed setter', result.threw && result.error === 0, true);
    check('real System cache changed before injected effect delivery', f.system.enable, false);
    check(
        'real failure snapshot independently observes changed cache',
        [ticket.before, ticket.actual, ticket.actualRead],
        [
            { kind: 'system-control', enabled: true, autoSimulation: true },
            { kind: 'system-control', enabled: false, autoSimulation: true },
            'copied',
        ],
    );
    check('effect log remains empty by explicit injection', ticket.effects.length, 0);
    check('queue commit not replayed to hide failure', beforeStep.commandOwner.systemControl.queuePhase, 'ready');
    check('changed actual cache faults World even without recorded effect', beforeStep.state, 'faulted');
    check('world retains original exact zero', beforeStep.failure.hasFailure && beforeStep.failure.error === 0, true);
    check('direct World step is refused after post-cache failure', directStep.threw, true);
    check('direct World step did not advance mock native', f.calls.filter((v: string) => v === 'step').length, count);
});
