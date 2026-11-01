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
import '../../../src/exports/base';
import '../../../src/exports/physics-cannon';
// Use the exact official physics-cannon export's native object. Engine source resolves
// src/node_modules/@cocos/cannon, not the separate root package visible to tools.
const CANNON = (globalThis as any).CANNON;
import { createAirApp } from '../../../src/air/bootstrap';
import type { AirApp } from '../../../src/air/app';
import { createAirPhysicsPreparation } from '../../../src/air/physics/preparation';
import { prepareBox3D, registerBox3DFeature, registerBox3DWorldAdapter } from '../../../src/air/physics/box3d/prepare';
import { createBox3DWorldAdapter } from '../../../src/air/physics/box3d/registration';
import { Box3DPhysicsWorld } from '../../../src/air/physics/box3d/world';
import { PhysicsSystem } from '../../../src/cocos/physics/framework/physics-system';
import { PhysicsMaterial } from '../../../src/cocos/physics/framework/assets/physics-material';
import { RigidBody } from '../../../src/cocos/physics/framework/components/rigid-body';
import { BoxCollider } from '../../../src/cocos/physics/framework/components/colliders/box-collider';
import { selector, createPhysicsWorld } from '../../../src/cocos/physics/framework/physics-selector';
import { getMaterialSource } from '../../../src/cocos/physics/framework/physics-material-bindings';
import { CannonWorld } from '../../../src/cocos/physics/cannon/cannon-world';
import { CannonShape } from '../../../src/cocos/physics/cannon/shapes/cannon-shape';
import { BuiltinShape } from '../../../src/cocos/physics/cocos/shapes/builtin-shape';
import { BuiltInWorld } from '../../../src/cocos/physics/cocos/builtin-world';
import { Node } from '../../../src/cocos/scene-graph/node';
import { Scene } from '../../../src/cocos/scene-graph/scene';
import { CCObject } from '../../../src/cocos/core/data/object';
import { director, game } from '../../../src/cocos/game';
import type { Box3DSTLoader } from '../../../src/air/physics/box3d/loader/st-loader.mjs';
import type { Box3DFoundation, Box3DWorld, Box3DId } from '../../../src/air/physics/box3d/binding/facade.mjs';
interface Fixture {
    loader: Box3DSTLoader;
    expected: string;
    binding(): Box3DFoundation;
    token(): Box3DWorld;
    liveShapes(): Box3DId[];
    observations(): any;
    checkpoint(name: string, value: unknown): void;
    complete(status: 'PASS_LIMITED_FOREIGN_MATERIAL'): void;
    fail(error: unknown): void;
}
declare const __BOX3D_FOREIGN_MATERIAL_FIXTURE__: Fixture;
const fixture = __BOX3D_FOREIGN_MATERIAL_FIXTURE__;
const attempt = (action: () => unknown) => {
    try {
        return { threw: false, result: action(), error: undefined as any };
    } catch (error) {
        return { threw: true, result: undefined, error };
    }
};
const view = (result: ReturnType<typeof attempt>) => ({
    threw: result.threw,
    result: result.result,
    errorText: String(result.error),
    code: result.error?.code ?? null,
});
const tuple = (asset: PhysicsMaterial) => [
    asset.friction,
    asset.restitution,
    asset.rollingFriction,
    asset.spinningFriction,
];
const cache = (asset: PhysicsMaterial) =>
    ['_friction', '_restitution', '_rollingFriction', '_spinningFriction'].map((name) => (asset as any)[name]);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const foreignNative = (shape: CannonShape) => ({
    friction: shape.impl.material.friction,
    restitution: shape.impl.material.restitution,
});

test('actual foreign material finite control: ' + fixture.expected, async () => {
    let app: AirApp | undefined, oldWorld: CannonWorld | undefined, world: Box3DPhysicsWorld | undefined;
    let preparation: ReturnType<typeof createAirPhysicsPreparation> | undefined;
    let failed = false,
        failure: unknown,
        oldWorldDestroyed = false;
    const retainedNodes: Node[] = [],
        assets: PhysicsMaterial[] = [];
    const checks: { id: string; pass: boolean; actual: unknown }[] = [];
    const check = (id: string, pass: boolean, actual: unknown) => {
        checks.push({ id, pass, actual });
        fixture.checkpoint(id, { pass, actual });
        if (!pass) throw new Error('Finite control failed: ' + id);
    };
    const makeAsset = (friction: number, restitution: number) => {
        const asset = new PhysicsMaterial();
        asset.setValues(friction, 0, 0, restitution);
        assets.push(asset);
        return asset;
    };
    try {
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3, physics: 'cannon' });
        game.pause();
        const system = PhysicsSystem.instance;
        system.autoSimulation = false;
        oldWorld = system.physicsWorld as CannonWorld;
        check(
            'real AIR starts one actual Cannon world',
            oldWorld instanceof CannonWorld && oldWorld.impl instanceof CANNON.World && selector.id === 'cannon.js',
            {
                selector: selector.id,
                paused: game.isPaused(),
                autoSimulation: system.autoSimulation,
                actualWorldIsAdapter: oldWorld instanceof CannonWorld,
                nativeWorldIsCannon: oldWorld.impl instanceof CANNON.World,
                worldConstructor: oldWorld.constructor.name,
                nativeConstructor: oldWorld.impl?.constructor?.name,
                factoryConstructorExact: oldWorld.constructor === selector.wrapper.PhysicsWorld,
                nativeWorldKeys: oldWorld.impl ? Object.keys(oldWorld.impl).slice(0, 12) : null,
            },
        );
        const scene = new Scene('foreign-material-' + fixture.expected);
        director.runSceneImmediate(scene);
        game.pause();
        const shared = makeAsset(0.3, 0.1),
            rawOnly = makeAsset(0.52, 0.22),
            clean = makeAsset(0.19, 0.09);
        system.setDefaultPhysicsMaterial(shared);
        const createCollider = (name: string, asset: PhysicsMaterial | null) => {
            const node = new Node(name);
            node.setPosition(scene.children.length * 4, 8, 0);
            node.addComponent(RigidBody);
            const collider = node.addComponent(BoxCollider);
            scene.addChild(node);
            // Exercise the original live public setter. Preconfigured foreign onLoad has
            // no Collider subscription in this upstream branch; do not invent one.
            collider.sharedMaterial = asset;
            return { node, collider };
        };
        const foreign = createCollider('actual-foreign-explicit', shared);
        const foreignShape = foreign.collider.shape as unknown as CannonShape;
        const foreignLease = getMaterialSource(foreign.collider);
        check(
            'actual Cocos Collider factory lifecycle binds shared asset to actual Cannon shape',
            foreignShape instanceof CannonShape &&
                foreignShape.impl instanceof CANNON.Box &&
                foreign.collider.sharedMaterial === shared &&
                foreignShape.impl.material === CannonShape.idToMaterial[shared.id] &&
                !!foreignLease &&
                oldWorld.bodies.length === 1,
            {
                native: foreignNative(foreignShape),
                materialId: shared.id,
                neutralSourceExists: !!foreignLease,
                bodies: oldWorld.bodies.length,
            },
        );
        const nativeEvents: unknown[] = [];
        const listener = () => nativeEvents.push(foreignNative(foreignShape));
        shared.on(PhysicsMaterial.EVENT_UPDATE, listener);
        shared.friction = 0.41;
        check(
            'foreign-only scalar retains native-before-later-public-listener behavior',
            foreignNative(foreignShape).friction === 0.41 &&
                nativeEvents.length === 1 &&
                (nativeEvents[0] as any).friction === 0.41,
            { tuple: tuple(shared), nativeEvents },
        );
        shared.off(PhysicsMaterial.EVENT_UPDATE, listener);
        if (fixture.expected === 'foreign-only') {
            const invalid = attempt(() => {
                shared.friction = -0.7;
            });
            check(
                'foreign-only negative coefficient retains original permissive setter',
                !invalid.threw && shared.friction === -0.7 && foreignNative(foreignShape).friction === -0.7,
                { result: view(invalid), native: foreignNative(foreignShape) },
            );
            const nan = attempt(() => {
                shared.friction = NaN;
            });
            check(
                'foreign-only NaN is not subjected to Box3D strict validation',
                !nan.threw && Number.isNaN(shared.friction) && Number.isNaN(foreignShape.impl.material.friction),
                {
                    result: view(nan),
                    assetIsNaN: Number.isNaN(shared.friction),
                    nativeIsNaN: Number.isNaN(foreignShape.impl.material.friction),
                },
            );
            shared.setValues(0.25, 0.8, 0.9, 0.15);
            check(
                'foreign-only setValues preserves argument order and unsupported-to-Box3D coefficients',
                equal(tuple(shared), [0.25, 0.15, 0.8, 0.9]) &&
                    equal(foreignNative(foreignShape), { friction: 0.25, restitution: 0.15 }),
                { tuple: tuple(shared), native: foreignNative(foreignShape) },
            );
            const preCloneMaterial = foreignShape.impl.material;
            const clone = foreign.collider.material!;
            assets.push(clone);
            check(
                'actual legacy material getter creates private clone without native replay',
                clone !== shared &&
                    foreign.collider.sharedMaterial === clone &&
                    equal(tuple(clone), tuple(shared)) &&
                    foreignShape.impl.material === preCloneMaterial,
                {
                    distinct: clone !== shared,
                    clone: tuple(clone),
                    nativeMaterialUnchanged: foreignShape.impl.material === preCloneMaterial,
                },
            );
            clone.friction = 0.67;
            check(
                'clone public update reaches actual Cannon adapter',
                foreignNative(foreignShape).friction === 0.67 &&
                    shared.friction === 0.25 &&
                    foreignShape.impl.material === CannonShape.idToMaterial[clone.id],
                { original: tuple(shared), clone: tuple(clone), native: foreignNative(foreignShape) },
            );
            foreign.collider.sharedMaterial = rawOnly;
            check(
                'actual legacy material setter commits different identity and actual Cannon material',
                foreign.collider.sharedMaterial === rawOnly &&
                    foreignShape.impl.material === CannonShape.idToMaterial[rawOnly.id] &&
                    foreignNative(foreignShape).friction === 0.52,
                { native: foreignNative(foreignShape), identity: foreign.collider.sharedMaterial === rawOnly },
            );
            foreign.collider.sharedMaterial = null;
            check(
                'actual legacy null setter uses actual current default',
                foreign.collider.sharedMaterial === null &&
                    equal(foreignNative(foreignShape), { friction: 0.25, restitution: 0.15 }),
                { native: foreignNative(foreignShape), identity: foreign.collider.sharedMaterial },
            );
            system.setDefaultPhysicsMaterial(clean);
            check(
                'actual foreign default setter changes cache and native world',
                system.defaultMaterial === clean &&
                    oldWorld.impl.defaultMaterial.friction === 0.19 &&
                    oldWorld.impl.defaultMaterial.restitution === 0.09,
                {
                    defaultIsClean: system.defaultMaterial === clean,
                    native: {
                        friction: oldWorld.impl.defaultMaterial.friction,
                        restitution: oldWorld.impl.defaultMaterial.restitution,
                    },
                },
            );
            const doomed = makeAsset(0.6, 0.2);
            foreign.collider.sharedMaterial = doomed;
            const destroyed = attempt(() => doomed.destroy());
            check(
                'foreign-only owned asset destroy retains original permissive behavior',
                !destroyed.threw && destroyed.result === true && !PhysicsMaterial.allMaterials.includes(doomed),
                view(destroyed),
            );
            foreign.node.active = false;
            foreign.node.destroy();
            CCObject._deferredDestroy();
            check(
                'actual foreign Collider teardown retains unresolved neutral source rather than false release',
                getMaterialSource(foreign.collider) === foreignLease &&
                    foreignShape.impl === null &&
                    oldWorld.bodies.length === 0,
                {
                    sameUnreleasedSource: getMaterialSource(foreign.collider) === foreignLease,
                    shapeImplNull: foreignShape.impl === null,
                    bodies: oldWorld.bodies.length,
                },
            );
            oldWorld.destroy();
            oldWorldDestroyed = true;
            check(
                'foreign-only old-world actual teardown closes native owner without stepping',
                oldWorld.impl === null &&
                    game.isPaused() &&
                    !system.autoSimulation &&
                    fixture.observations().moduleCreated === false,
                {
                    oldWorldImplNull: oldWorld.impl === null,
                    paused: game.isPaused(),
                    moduleCreated: fixture.observations().moduleCreated,
                },
            );
        } else {
            foreignShape.setMaterial(rawOnly);
            check(
                'actual public Cannon raw setMaterial changes native asset but not Collider cache',
                foreign.collider.sharedMaterial === shared &&
                    foreignShape.impl.material === CannonShape.idToMaterial[rawOnly.id] &&
                    equal(foreignNative(foreignShape), { friction: 0.52, restitution: 0.22 }),
                {
                    semanticIdentityStillShared: foreign.collider.sharedMaterial === shared,
                    native: foreignNative(foreignShape),
                    rawOnlyMaterialId: rawOnly.id,
                },
            );
            foreignShape.setMaterial(shared);
            foreign.node.active = false;
            foreign.node.removeFromParent();
            retainedNodes.push(foreign.node);
            check(
                'old singleton scheduling stopped and actual foreign body disabled before teardown',
                game.isPaused() &&
                    !system.autoSimulation &&
                    oldWorld.bodies.length === 0 &&
                    oldWorld.impl.bodies.length === 0 &&
                    !foreign.collider.enabledInHierarchy &&
                    getMaterialSource(foreign.collider) === foreignLease,
                {
                    paused: game.isPaused(),
                    autoSimulation: system.autoSimulation,
                    bodies: oldWorld.bodies.length,
                    nativeBodies: oldWorld.impl.bodies.length,
                    enabled: foreign.collider.enabledInHierarchy,
                },
            );
            const oldNative = oldWorld.impl;
            oldWorld.destroy();
            oldWorldDestroyed = true;
            check(
                'actual Cannon world teardown occurs before any Box3D native world construction',
                oldWorld.impl === null &&
                    oldNative.broadphase === null &&
                    fixture.observations().moduleCreated === false &&
                    !!foreignShape.impl &&
                    getMaterialSource(foreign.collider) === foreignLease,
                {
                    worldImplNull: oldWorld.impl === null,
                    broadphaseNull: oldNative.broadphase === null,
                    retainedAdapterImpl: !!foreignShape.impl,
                    sameSource: getMaterialSource(foreign.collider) === foreignLease,
                    box3dModuleCreated: fixture.observations().moduleCreated,
                },
            );
            // EXPLICIT TEST-ONLY SEQUENTIAL FIXTURE RESET. This is not a product switching API.
            // The old native world is destroyed and its scheduling is stopped before clearing this slot.
            // All actual Collider/System sources and the production neutral registry remain untouched.
            (selector as any).physicsWorld = null;
            registerBox3DFeature({ createLoader: () => fixture.loader });
            registerBox3DWorldAdapter(
                createBox3DWorldAdapter(
                    selector,
                    {
                        collisionMask: (group) => PhysicsSystem.instance.collisionMatrix[group],
                        sleepThreshold: () => PhysicsSystem.instance.sleepThreshold,
                    },
                    undefined,
                    { physicsSystem: () => PhysicsSystem.instance },
                ),
            );
            preparation = createAirPhysicsPreparation();
            const prepared = await prepareBox3D(
                { assetBaseUrl: undefined, threading: 'single', workerCount: 1, solverSubSteps: 4 },
                preparation,
            );
            prepared.select();
            (selector as any).physicsWorld = createPhysicsWorld();
            preparation.prepared();
            world = system.physicsWorld as Box3DPhysicsWorld;
            check(
                'one current active actual Box3D world uses the unchanged actual System',
                world instanceof Box3DPhysicsWorld &&
                    selector.id === 'box3d' &&
                    oldWorld.impl === null &&
                    game.isPaused() &&
                    !system.autoSimulation,
                {
                    selector: selector.id,
                    oldWorldImplNull: oldWorld.impl === null,
                    paused: game.isPaused(),
                    autoSimulation: system.autoSimulation,
                    owner: world.diagnostics(),
                },
            );
            system.setDefaultPhysicsMaterial(shared);
            createCollider('box3d-shared-with-stale-cannon', shared);
            createCollider('box3d-raw-opaque-only', rawOnly);
            createCollider('box3d-clean-unrelated', clean);
            const binding = fixture.binding(),
                token = fixture.token();
            const native = () => fixture.liveShapes().map((shape) => binding.getShapeMaterial(token, shape));
            const setters = () =>
                fixture.observations().calls.filter((call: any) => call.name === 'setShapeMaterial').length;
            check(
                'same material identity is actually accepted by current Box3D before negative writes',
                fixture.liveShapes().length === 3 &&
                    system.defaultMaterial === shared &&
                    getMaterialSource(foreign.collider) === foreignLease &&
                    native()[0].friction === Math.fround(0.41),
                {
                    native: native(),
                    owner: world.diagnostics(),
                    staleSourceRetained: getMaterialSource(foreign.collider) === foreignLease,
                },
            );
            const refuse = (id: string, asset: PhysicsMaterial, action: () => unknown) => {
                const before = {
                    cache: cache(asset),
                    native: native(),
                    setters: setters(),
                    owner: world!.diagnostics(),
                    nativeStep: binding.stepDiagnostics(token).nativeStepIndex,
                };
                let emitEntries = 0;
                const emit = asset.emit;
                asset.emit = function (this: PhysicsMaterial, ...args: any[]) {
                    emitEntries++;
                    return Reflect.apply(emit, this, args);
                } as any;
                const result = attempt(action);
                asset.emit = emit;
                const after = {
                    cache: cache(asset),
                    native: native(),
                    setters: setters(),
                    owner: world!.diagnostics(),
                    nativeStep: binding.stepDiagnostics(token).nativeStepIndex,
                };
                check(
                    id,
                    result.threw &&
                        /actual-binding coverage|foreign|unknown|stale actual binding/.test(String(result.error)) &&
                        equal(before.cache, after.cache) &&
                        equal(before.native, after.native) &&
                        before.setters === after.setters &&
                        emitEntries === 0 &&
                        before.nativeStep === after.nativeStep &&
                        after.nativeStep === 0 &&
                        game.isPaused() &&
                        !system.autoSimulation &&
                        getMaterialSource(foreign.collider) === foreignLease,
                    {
                        result: view(result),
                        emitEntries,
                        nativeSetterDelta: after.setters - before.setters,
                        before,
                        after,
                        sameForeignSource: getMaterialSource(foreign.collider) === foreignLease,
                    },
                );
            };
            refuse(
                'shared foreign binding refuses scalar before all private cache native and emit effects',
                shared,
                () => {
                    shared.friction = 0.75;
                },
            );
            refuse('shared foreign binding refuses no-change scalar before effects', shared, () => {
                shared.friction = 0.41;
            });
            refuse('shared foreign binding refuses full setValues before effects', shared, () =>
                shared.setValues(0.61, 0, 0, 0.31),
            );
            refuse('shared foreign binding refuses no-change setValues before effects', shared, () =>
                shared.setValues(0.41, 0, 0, 0.1),
            );
            const marker = () => {};
            shared.on(PhysicsMaterial.EVENT_UPDATE, marker);
            shared.off(PhysicsMaterial.EVENT_UPDATE, marker);
            refuse('public off cannot erase actual foreign source', shared, () => {
                shared.restitution = 0.6;
            });
            shared.removeAll(PhysicsMaterial.EVENT_UPDATE);
            refuse('public removeAll cannot erase actual foreign or opaque source', shared, () => {
                shared.friction = 0.7;
            });
            shared.targetOff(system);
            refuse('public targetOff cannot erase actual foreign source', shared, () =>
                shared.setValues(0.6, 0, 0, 0.2),
            );
            refuse('raw-only asset use through actual Cannon adapter remains a scoped opaque blocker', rawOnly, () => {
                rawOnly.friction = 0.72;
            });
            foreign.node.destroy();
            CCObject._deferredDestroy();
            retainedNodes.length = 0;
            check(
                'actual retained foreign Collider cleanup stays unknown without release receipt',
                foreignShape.impl === null && getMaterialSource(foreign.collider) === foreignLease,
                {
                    implNull: foreignShape.impl === null,
                    sameUnreleasedSource: getMaterialSource(foreign.collider) === foreignLease,
                },
            );
            refuse('foreign cleanup return and removed public listeners cannot erase unknown ownership', shared, () => {
                shared.friction = 0.8;
            });
            const noOpReads: string[] = [];
            const unread = new Proxy(clean, {
                get(target, name, receiver) {
                    noOpReads.push(String(name));
                    return Reflect.get(target, name, receiver);
                },
            });
            const beforeNoop = { native: native(), setters: setters(), cache: cache(clean) };
            // These original methods are receiver-independent no-ops. Do not construct a second active world.
            BuiltinShape.prototype.setMaterial.call(undefined, unread);
            BuiltInWorld.prototype.setDefaultMaterial.call(undefined, unread);
            check(
                'original builtin no-op methods read no coefficients and have no material effects',
                noOpReads.length === 0 &&
                    equal(beforeNoop.native, native()) &&
                    beforeNoop.setters === setters() &&
                    equal(beforeNoop.cache, cache(clean)),
                { noOpReads, nativeSetterDelta: setters() - beforeNoop.setters },
            );
            BuiltinShape.prototype.setMaterial.call(undefined, clean);
            BuiltInWorld.prototype.setDefaultMaterial.call(undefined, clean);
            const cleanCount = setters();
            clean.friction = 0.73;
            check(
                'raw foreign opaque hazards are asset scoped and true no-op calls do not poison a clean owned asset',
                clean.friction === 0.73 && setters() - cleanCount === 1 && native()[2].friction === Math.fround(0.73),
                { native: native(), nativeSetterDelta: setters() - cleanCount, owner: world.diagnostics() },
            );
            check(
                'negative scenario never advances physics or enables staged unified support',
                binding.stepDiagnostics(token).nativeStepIndex === 0 &&
                    !world.diagnostics().commandOwner.stagedCommandsSupported &&
                    !world.diagnostics().commandOwner.unifiedTransactionsSupported &&
                    game.isPaused() &&
                    !system.autoSimulation,
                world.diagnostics(),
            );
        }
    } catch (error) {
        failed = true;
        failure = error;
    } finally {
        for (const node of retainedNodes) {
            try {
                node.destroy();
                CCObject._deferredDestroy();
            } catch (error) {
                if (!failed) {
                    failed = true;
                    failure = error;
                }
            }
        }
        if (app) {
            try {
                const close = await app.close!();
                check('actual AIR application close completes without errors', close.status === 'released', close);
            } catch (error) {
                if (!failed) {
                    failed = true;
                    failure = error;
                }
            }
        }
        if (preparation) {
            try {
                const close = await preparation.dispose();
                const observations = fixture.observations();
                check(
                    'sequential fixture owns and confirms actual Box3D native world release',
                    close.status === 'closed' && world?.diagnostics().teardown.nativeReturned === true,
                    { close, owner: world?.diagnostics() },
                );
                check(
                    'native core and bridge counters return to zero before module disposal',
                    observations.beforeBindingDispose?.coreBytes === '0' &&
                        observations.beforeBindingDispose?.bridge.liveBytes === '0' &&
                        observations.beforeBindingDispose?.bridge.liveAllocations === 0,
                    observations.beforeBindingDispose,
                );
            } catch (error) {
                if (!failed) {
                    failed = true;
                    failure = error;
                }
            }
        }
        if (oldWorld && !oldWorldDestroyed) {
            try {
                oldWorld.destroy();
            } catch (error) {
                if (!failed) {
                    failed = true;
                    failure = error;
                }
            }
        }
        fixture.checkpoint('finite-source-contract-final-verdict', {
            expected: fixture.expected,
            checks,
            unexpectedFailure: failed ? String(failure) : null,
            noManualLedgerRegistration: true,
            explicitTestOnlySequentialSelectorReset: fixture.expected === 'sequential-negative',
            formalCells: '2128 NOT_RUN',
            nineGates: 'UNPASSED',
            mixedPropagationSupported: false,
        });
    }
    if (failed) {
        fixture.fail(failure);
        throw failure;
    }
    expect(checks.filter((item) => !item.pass)).toEqual([]);
    fixture.complete('PASS_LIMITED_FOREIGN_MATERIAL');
});
