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
import * as mutationGuards from '../../../src/cocos/core/data/mutation-guard';
import * as materialBridge from '../../../src/cocos/physics/framework/physics-material-transaction';
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
    if (process.env.BOX3D_CLEANUP_GREEN_RAW)
        fs.writeFileSync(
            process.env.BOX3D_CLEANUP_GREEN_RAW,
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
control('Collider cleanup reports first falsy and independent errors after retired previous asset', () => {
    const f = configured(),
        originalMaterial = new PhysicsMaterial(),
        candidate = new PhysicsMaterial();
    const c = shape(f, node(), true, originalMaterial);
    candidate.friction = 0.8;
    const originalOn = candidate.on;
    (candidate as any).on = () => {
        throw 0;
    };
    const business = capture(() => {
        c.material = candidate;
    });
    candidate.on = originalOn;
    const adapter = (c as any)._shape,
        events = adapter.updateEventListener,
        destroy = adapter.onDestroy;
    const oldOff = originalMaterial.off,
        newOff = candidate.off,
        calls: string[] = [];
    adapter.updateEventListener = function () {
        calls.push('updateEventListener');
        events.call(this);
        throw undefined;
    };
    originalMaterial.off = function (this: PhysicsMaterial, ...args: any[]) {
        calls.push('old.off');
        oldOff.apply(this, args as any);
        throw null;
    } as typeof originalMaterial.off;
    candidate.off = function (this: PhysicsMaterial, ...args: any[]) {
        calls.push('candidate.off');
        newOff.apply(this, args as any);
        throw 0;
    } as typeof candidate.off;
    adapter.onDestroy = function () {
        calls.push('adapter.onDestroy');
        destroy.call(this);
        throw 'adapter-cleanup-secondary';
    };
    let result: ReturnType<typeof capture>;
    try {
        result = capture(() => (c as any).onDestroy());
    } finally {
        adapter.updateEventListener = events;
        adapter.onDestroy = destroy;
        originalMaterial.off = oldOff;
        candidate.off = newOff;
        f.components = f.components.filter((value: any) => value !== c);
    }
    const diagnostics = f.world.diagnostics();
    row.observed = {
        business: { threw: business.threw, exactZero: business.error === 0 },
        cleanup: { threw: result!.threw, exactUndefined: result!.error === undefined },
        calls: [...calls],
        diagnostics: copy(diagnostics),
        existingCleanupChannels: cleanupChannels(diagnostics),
    };
    check('business zero retained at submission', business.threw && business.error === 0, true);
    check('all independent cleanup actions ran', calls, ['updateEventListener', 'candidate.off', 'adapter.onDestroy']);
    check('cleanup throws first undefined', result!.threw && result!.error === undefined, true);
    const d = materialBridge.inspectPhysicsMaterialCleanup(c)!;
    check(
        'released target reporter reachable with first undefined',
        d.consumed && d.report!.hasFailure && d.report!.firstError === undefined,
        true,
    );
    check(
        'three actual cleanup errors stored without reading error internals',
        d.report!.errors.map((v) => v.error),
        [undefined, 0, 'adapter-cleanup-secondary'],
    );
    check('world business primary remains zero in this route', diagnostics.error, '0');
    // Contract assertion, not a claim that a specific new field already exists.
    check(
        'secondary cleanup values have an explicit reachable diagnostic channel',
        cleanupChannels(diagnostics).length > 0,
        true,
    );
});
control('Observed listener primary zero and all lease cleanup failures remain reachable', () => {
    const f = configured(),
        old = new PhysicsMaterial(),
        c = shape(f, node(), true, old),
        candidate = new PhysicsMaterial();
    candidate.friction = 0.8;
    (candidate as any).on = () => {
        throw 0;
    };
    const begin = materialBridge.beginPhysicsMaterialChange;
    let actualChange: any;
    jest.spyOn(materialBridge, 'beginPhysicsMaterialChange').mockImplementation((...args: Parameters<typeof begin>) => {
        const result = begin(...args);
        if (args[0] === c) actualChange = result;
        return result;
    });
    const calls = injectLeaseCleanupFailures();
    const result = capture(() => {
        c.material = candidate;
    });
    const diagnostics = f.world.diagnostics(),
        ticket = actualChange.diagnostics();
    row.observed = {
        exactThrownZero: result.threw && result.error === 0,
        cleanupCallsBeforeClose: [...calls],
        diagnostics: copy(diagnostics),
        bridge: copy(ticket),
        existingCleanupChannels: cleanupChannels(diagnostics),
        ticketSecondaryTypes: ticket.observer.secondaryErrors.map((v: any) =>
            v === undefined ? 'undefined' : v === null ? 'null' : String(v),
        ),
    };
    check('original business zero still thrown', result.threw && result.error === 0, true);
    check('all genuine lease disposers were called', calls, [
        'candidate-mutation',
        'scope-transform',
        'scope-mutation',
    ]);
    check('B0 primary exact zero', ticket.observer.hasFailure && ticket.observer.error === 0, true);
    check('world first error must not be replaced by cleanup undefined', diagnostics.error, '0');
    check(
        'all three cleanup failures reachable in owner leaf channel',
        diagnostics.commandOwner.cleanup.cleanupFailures.length,
        3,
    );
    check('world typed primary exact zero', diagnostics.failure.hasFailure && diagnostics.failure.error === 0, true);
    check(
        'owner first cleanup exact undefined',
        diagnostics.commandOwner.cleanup.hasFailure && diagnostics.commandOwner.cleanup.firstError === undefined,
        true,
    );
    check('separate owner cleanup channel retains omitted failures', cleanupChannels(diagnostics).length > 0, true);
});
control('Original public default retains primary zero and separate cleanup errors without replay', () => {
    const f = configured();
    shape(f, node());
    const candidate = new PhysicsMaterial();
    candidate.friction = 0.8;
    const get = f.binding.getShapeMaterial;
    let reads = 0;
    f.binding.getShapeMaterial = (...args: any[]) => {
        if (++reads === 2) throw 0;
        return get(...args);
    };
    const calls = injectLeaseCleanupFailures();
    const start = f.calls.filter((value: string) => value === 'setShapeMaterial').length;
    const result = capture(() => f.world.setDefaultMaterial(candidate));
    const diagnostics = f.world.diagnostics();
    row.observed = {
        originalThrownZero: result.threw && result.error === 0,
        cleanupCallsBeforeClose: [...calls],
        diagnostics: copy(diagnostics),
        existingCleanupChannels: cleanupChannels(diagnostics),
    };
    check('public original zero thrown', result.threw && result.error === 0, true);
    check(
        'no native replay in mocked binding',
        f.calls.filter((value: string) => value === 'setShapeMaterial').length - start,
        1,
    );
    check('both original lease disposers ran', calls, ['scope-transform', 'scope-mutation']);
    check('world retains primary zero, not cleanup null', diagnostics.error, '0');
    check('separate cleanup secondary channel exists', cleanupChannels(diagnostics).length > 0, true);
});

function retireShape(f: any, c: BoxCollider | SphereCollider): void {
    try {
        (c as any).onDestroy();
    } finally {
        f.components = f.components.filter((v: unknown) => v !== c);
    }
}
control('Successful repeated material replacements and null retire historical subscriptions', () => {
    const f = configured(),
        assets = Array.from({ length: 12 }, () => new PhysicsMaterial());
    const c = shape(f, node(), true, assets[0]);
    const calls = assets.map(() => 0);
    assets.forEach((asset, i) => {
        const off = asset.off;
        asset.off = function (this: PhysicsMaterial, ...args: any[]) {
            ++calls[i];
            return off.apply(this, args as any);
        } as typeof off;
    });
    for (const asset of assets.slice(1)) c.material = asset;
    check('old assets each unsubscribe once on replacement', calls, [...Array.from({ length: 11 }, () => 1), 0]);
    c.material = null;
    retireShape(f, c);
    check(
        'destruction does not retain/re-unsubscribe twelve retired assets',
        calls,
        assets.map(() => 1),
    );
    check('empty observed set still destroys adapter ownership', f.world.diagnostics().commandOwner.components, 0);
});
control('Failed off retains old subscription but does not claim candidate on entered', () => {
    const f = configured(),
        old = new PhysicsMaterial(),
        next = new PhysicsMaterial(),
        c = shape(f, node(), true, old);
    const off = old.off;
    let offCalls = 0,
        nextOffCalls = 0;
    old.off = function (this: PhysicsMaterial, ...args: any[]) {
        ++offCalls;
        if (offCalls === 1) throw null;
        return off.apply(this, args as any);
    } as typeof off;
    const nextOff = next.off;
    next.off = function (this: PhysicsMaterial, ...args: any[]) {
        ++nextOffCalls;
        return nextOff.apply(this, args as any);
    } as typeof nextOff;
    const result = capture(() => {
        c.material = next;
    });
    check('original off null escapes', result.threw && result.error === null, true);
    check(
        'typed first null is present',
        f.world.diagnostics().failure.hasFailure && f.world.diagnostics().failure.error === null,
        true,
    );
    retireShape(f, c);
    check('uncertain old subscription retried by independent teardown', offCalls, 2);
    check('candidate never subscribed is not retained for cleanup', nextOffCalls, 0);
});
control('Clone failed on retains clone but retires successfully unsubscribed source', () => {
    const f = configured(),
        old = new PhysicsMaterial(),
        c = shape(f, node(), true, old);
    const clone = old.clone.bind(old),
        off = old.off;
    let oldOff = 0,
        cloneOff = 0;
    old.off = function (this: PhysicsMaterial, ...args: any[]) {
        oldOff++;
        return off.apply(this, args as any);
    } as typeof off;
    old.clone = () => {
        const result = clone(),
            off = result.off;
        result.on = (() => {
            throw 0;
        }) as typeof result.on;
        result.off = function (this: PhysicsMaterial, ...args: any[]) {
            cloneOff++;
            return off.apply(this, args as any);
        } as typeof off;
        return result;
    };
    const result = capture(() => c.material);
    check('clone on original zero escapes', result.threw && result.error === 0, true);
    retireShape(f, c);
    check('source off not repeated', oldOff, 1);
    check('uncertain clone subscription cleaned', cloneOff, 1);
});
control('Preflight getter throw undefined plus cleanup preserves original first identity', () => {
    const f = configured();
    shape(f, node());
    const candidate = new PhysicsMaterial();
    Object.defineProperty(candidate, 'friction', {
        get() {
            throw undefined;
        },
    });
    const calls = injectLeaseCleanupFailures();
    const result = capture(() => f.world.setDefaultMaterial(candidate));
    const d = f.world.diagnostics();
    check('outer undefined throw remains present', result.threw && result.error === undefined, true);
    check(
        'world distinguishes failure undefined from no failure',
        d.failure.hasFailure && d.failure.error === undefined,
        true,
    );
    check(
        'cleanup null and second error remain separately accessible',
        d.commandOwner.cleanup.cleanupFailures.map((v: any) => v.error),
        [null, 'scope-mutation-secondary'],
    );
    check('both cleanup calls occurred', calls, ['scope-transform', 'scope-mutation']);
});

control('Same actual System release then new world registers a distinct cleanup generation', () => {
    const first = fixture();
    const old = materialBridge.capturePhysicsMaterialCleanup(first.system)!;
    first.world.destroy();
    const second = fixture(undefined, true, first.system);
    const current = materialBridge.capturePhysicsMaterialCleanup(second.system)!;
    old.complete([]);
    current.complete([]);
    const previous = old.diagnostics().report!,
        latest = current.diagnostics().report!;
    check('same actual System identity reused', second.system === first.system, true);
    check(
        'registry generation advances independently of world generation',
        latest.generation > previous.generation,
        true,
    );
    check(
        'target inspect identifies current not old reporter',
        materialBridge.inspectPhysicsMaterialCleanup(second.system)!.report === latest,
        true,
    );
});

control('Step original falsy failure is not overwritten by independent scope cleanup', () => {
    const f = configured();
    shape(f, node());
    f.binding.step = () => {
        throw 0;
    };
    const calls = injectLeaseCleanupFailures(),
        result = capture(() => f.world.step(1 / 60)),
        d = f.world.diagnostics();
    check('step rethrows native mock original zero', result.threw && result.error === 0, true);
    check('world first typed zero retained', d.failure.hasFailure && d.failure.error === 0, true);
    check('native mock completion not invented', d.lastStepOutcome, 'not-completed');
    check('both independent cleanup calls ran', calls, ['scope-transform', 'scope-mutation']);
    check(
        'both errors remain distinct',
        d.commandOwner.cleanup.cleanupFailures.map((v: any) => v.error),
        [null, 'scope-mutation-secondary'],
    );
});
control('Dispatch scope disposal failure cannot leave world ready with owner faulted', () => {
    const f = configured();
    shape(f, node());
    injectLeaseCleanupFailures();
    const result = capture(() => f.world.emitEvents()),
        d = f.world.diagnostics();
    check('dispatch cleanup first null thrown', result.threw && result.error === null, true);
    check('world and owner fault together', [d.state, d.commandOwner.phase], ['faulted', 'faulted']);
    check('typed null retained', [d.failure.hasFailure, d.failure.error], [true, null]);
});
