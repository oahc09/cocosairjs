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
import { createAirApp } from '../../../src/air/bootstrap';
import type { AirApp } from '../../../src/air/app';
import { registerBox3DFeature, registerBox3DWorldAdapter } from '../../../src/air/physics/box3d/prepare';
import { createBox3DWorldAdapter } from '../../../src/air/physics/box3d/registration';
import { Box3DPhysicsWorld } from '../../../src/air/physics/box3d/world';
import { PhysicsSystem } from '../../../src/cocos/physics/framework/physics-system';
import { PhysicsMaterial } from '../../../src/cocos/physics/framework/assets/physics-material';
import { RigidBody } from '../../../src/cocos/physics/framework/components/rigid-body';
import { BoxCollider } from '../../../src/cocos/physics/framework/components/colliders/box-collider';
import { selector } from '../../../src/cocos/physics/framework/physics-selector';
import { Node } from '../../../src/cocos/scene-graph/node';
import { Scene } from '../../../src/cocos/scene-graph/scene';
import { director, game } from '../../../src/cocos/game';
import type { Box3DSTLoader } from '../../../src/air/physics/box3d/loader/st-loader.mjs';
import type { Box3DFoundation, Box3DWorld, Box3DId } from '../../../src/air/physics/box3d/binding/facade.mjs';
interface Fixture {
    loader: Box3DSTLoader;
    expected: string;
    binding(): Box3DFoundation;
    token(): Box3DWorld;
    shapes(): Box3DId[];
    liveShapes(): Box3DId[];
    observations(): any;
    checkpoint(name: string, value: unknown): void;
    complete(status: 'PASS_LIMITED_PRIVATE_MATERIAL'): void;
    fail(error: unknown): void;
}
declare const __BOX3D_PRIVATE_MATERIAL_FIXTURE__: Fixture;
const fixture = __BOX3D_PRIVATE_MATERIAL_FIXTURE__;
const attempt = (action: () => void) => {
    try {
        action();
        return { threw: false, error: undefined as any };
    } catch (error) {
        return { threw: true, error };
    }
};
const view = (result: ReturnType<typeof attempt>) => ({
    threw: result.threw,
    errorType: typeof result.error,
    errorText: String(result.error),
    code: result.error?.code ?? null,
});
const tuple = (asset: PhysicsMaterial) => [
    asset.friction,
    asset.restitution,
    asset.rollingFriction,
    asset.spinningFriction,
];
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

test('actual AIR private material finite lifecycle: ' + fixture.expected, async () => {
    let app: AirApp | undefined,
        world: Box3DPhysicsWorld | undefined,
        failed = false,
        failure: unknown;
    const assets: PhysicsMaterial[] = [];
    const checks: { id: string; pass: boolean; actual: unknown }[] = [];
    const check = (id: string, pass: boolean, actual: unknown) => {
        checks.push({ id, pass, actual });
        fixture.checkpoint(id, { pass, actual });
    };
    try {
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
        app = await createAirApp({
            canvas: '#GameCanvas',
            renderMode: 3,
            physics: 'box3d',
            physicsOptions: { box3d: { threading: 'single', workerCount: 1, solverSubSteps: 4 } },
        });
        game.pause();
        const system = PhysicsSystem.instance;
        world = system.physicsWorld as Box3DPhysicsWorld;
        system.autoSimulation = false;
        const scene = new Scene('private-material-' + fixture.expected);
        director.runSceneImmediate(scene);
        game.pause();
        const asset = new PhysicsMaterial();
        assets.push(asset);
        asset.setValues(0.3, 0, 0, 0.1);
        system.setDefaultPhysicsMaterial(asset);
        const binding = fixture.binding(),
            token = fixture.token();
        const native = () => fixture.liveShapes().map((shape) => binding.getShapeMaterial(token, shape));
        const calls = () => fixture.observations().calls as { name: string; args: any[]; returned: boolean }[];
        const setters = () => calls().filter((call) => call.name === 'setShapeMaterial').length;
        const values = () => world!.diagnostics().commandOwner.privateMaterialValues;
        const read = () => ({ asset: tuple(asset), native: native(), setters: setters(), owner: world!.diagnostics() });
        const colliders: BoxCollider[] = [];
        for (let index = 0; index < 4; index++) {
            const node = new Node(
                ['active-explicit', 'active-inherited', 'inactive-explicit', 'inactive-inherited'][index],
            );
            node.setPosition(index * 4, 10, 0);
            node.addComponent(RigidBody);
            const collider = node.addComponent(BoxCollider);
            if (index % 2 === 0) collider.sharedMaterial = asset;
            if (index >= 2) collider.enabled = false;
            scene.addChild(node);
            colliders.push(collider);
        }
        check(
            'active explicit inherited and initialized inactive memberships',
            fixture.liveShapes().length === 2 &&
                values().roster?.bindings === 3 &&
                values().roster?.pending === 0 &&
                colliders.every((collider, i) => collider.sharedMaterial === (i % 2 === 0 ? asset : null)) &&
                native().every(
                    (material) => material.friction === Math.fround(0.3) && material.restitution === Math.fround(0.1),
                ),
            read(),
        );
        const notifications: any[] = [];
        asset.on(PhysicsMaterial.EVENT_UPDATE, () => notifications.push(read()));
        const mutation = (id: string, action: () => void, expected: number[], shouldChange: boolean) => {
            const count = setters(),
                noticeCount = notifications.length;
            const result = attempt(action),
                actual = read();
            check(
                id,
                !result.threw &&
                    equal(tuple(asset), expected) &&
                    native().every(
                        (material) =>
                            material.friction === Math.fround(expected[0]) &&
                            material.restitution === Math.fround(expected[1]),
                    ) &&
                    setters() - count === (shouldChange ? fixture.liveShapes().length : 0) &&
                    notifications.length - noticeCount === (shouldChange ? 1 : 0) &&
                    (!shouldChange || equal(notifications[notifications.length - 1].native, native())),
                {
                    result: view(result),
                    expected,
                    nativeSetterDelta: setters() - count,
                    notificationDelta: notifications.length - noticeCount,
                    actual,
                },
            );
        };
        if (fixture.expected === 'initial-identity') {
            const alternative = new PhysicsMaterial();
            alternative.setValues(0.8, 0, 0, 0.6);
            const node = new Node('initial-public-identity-divergence');
            node.setPosition(20, 10, 0);
            node.addComponent(RigidBody);
            const collider = node.addComponent(BoxCollider);
            collider.sharedMaterial = asset;
            let publicGetterReads = 0;
            Object.defineProperty(collider, 'sharedMaterial', {
                configurable: true,
                get: () => {
                    ++publicGetterReads;
                    return alternative;
                },
            });
            const beforeShapes = fixture.liveShapes().length;
            const initialization = attempt(() => scene.addChild(node));
            const added = fixture.liveShapes().slice(beforeShapes);
            const materialBefore = added.map((shape) => binding.getShapeMaterial(token, shape));
            const setterBefore = setters();
            const noChange = attempt(() => {
                asset.friction = asset.friction;
            });
            const materialAfter = added.map((shape) => binding.getShapeMaterial(token, shape));
            check(
                'initial identity uses exact private source before coefficient/native acquisition',
                !initialization.threw &&
                    publicGetterReads === 0 &&
                    added.length === 1 &&
                    (collider as any)._material === asset &&
                    materialBefore.every(
                        (value) =>
                            value.friction === Math.fround(asset.friction) &&
                            value.restitution === Math.fround(asset.restitution),
                    ),
                {
                    initialization: view(initialization),
                    publicGetterReads,
                    addedCount: added.length,
                    privateIdentityIsAsset: (collider as any)._material === asset,
                    privateAsset: tuple(asset),
                    alternative: tuple(alternative),
                    nativeBefore: materialBefore,
                },
            );
            check(
                'no-change write cannot certify an initial native material copied from another identity',
                !noChange.threw &&
                    setters() === setterBefore &&
                    materialAfter.length === 1 &&
                    materialAfter.every(
                        (value) =>
                            value.friction === Math.fround(asset.friction) &&
                            value.restitution === Math.fround(asset.restitution),
                    ),
                {
                    noChange: view(noChange),
                    nativeSetterDelta: setters() - setterBefore,
                    privateAsset: tuple(asset),
                    nativeAfter: materialAfter,
                    owner: world.diagnostics(),
                },
            );
            delete (collider as any).sharedMaterial;
            alternative.destroy();
        } else if (fixture.expected === 'initial-coefficients') {
            const privateTuple = () => [
                (asset as any)._friction,
                (asset as any)._restitution,
                (asset as any)._rollingFriction,
                (asset as any)._spinningFriction,
            ];
            const frictionSetter = Object.getOwnPropertyDescriptor(PhysicsMaterial.prototype, 'friction')!.set!;
            const restitutionSetter = Object.getOwnPropertyDescriptor(PhysicsMaterial.prototype, 'restitution')!.set!;
            let publicCoefficientReads = 0;
            Object.defineProperty(asset, 'friction', {
                configurable: true,
                get: () => {
                    ++publicCoefficientReads;
                    return 0.8;
                },
                set: frictionSetter,
            });
            Object.defineProperty(asset, 'restitution', {
                configurable: true,
                get: () => {
                    ++publicCoefficientReads;
                    return 0.6;
                },
                set: restitutionSetter,
            });
            try {
                const node = new Node('initial-private-coefficient-source');
                node.setPosition(20, 10, 0);
                node.addComponent(RigidBody);
                const collider = node.addComponent(BoxCollider);
                collider.sharedMaterial = asset;
                const beforeShapes = fixture.liveShapes().length;
                const initialization = attempt(() => scene.addChild(node));
                const added = fixture.liveShapes().slice(beforeShapes);
                const copiedNative = () => added.map((shape) => binding.getShapeMaterial(token, shape));
                const nativeMatchesPrivate = () =>
                    copiedNative().length === 1 &&
                    copiedNative().every(
                        (value) => value.friction === Math.fround(0.3) && value.restitution === Math.fround(0.1),
                    );
                check(
                    'initializer reads constructor-private coefficients rather than overridden public getters',
                    !initialization.threw &&
                        publicCoefficientReads === 0 &&
                        equal(privateTuple(), [0.3, 0.1, 0, 0]) &&
                        nativeMatchesPrivate(),
                    {
                        initialization: view(initialization),
                        publicCoefficientReads,
                        privateAsset: privateTuple(),
                        native: copiedNative(),
                    },
                );
                const refresh = attempt(() => {
                    collider.shape!.setMaterial(asset);
                    world!.setDefaultMaterial(asset);
                    collider.material = asset;
                });
                check(
                    'raw accepted shape default and copied identity paths use private coefficient authority',
                    !refresh.threw && publicCoefficientReads === 0 && nativeMatchesPrivate(),
                    {
                        refresh: view(refresh),
                        publicCoefficientReads,
                        privateAsset: privateTuple(),
                        native: copiedNative(),
                    },
                );
                let clone: PhysicsMaterial | null = null;
                const cloneResult = attempt(() => {
                    clone = collider.material;
                });
                if (clone && clone !== asset) assets.push(clone);
                check(
                    'clone candidate comparison uses its own constructor-private coefficient authority',
                    !cloneResult.threw &&
                        clone !== null &&
                        clone !== asset &&
                        equal(tuple(clone), [0.3, 0.1, 0, 0]) &&
                        publicCoefficientReads === 0 &&
                        nativeMatchesPrivate(),
                    {
                        cloneResult: view(cloneResult),
                        distinctClone: clone !== null && clone !== asset,
                        clone: clone ? tuple(clone) : null,
                        publicCoefficientReads,
                        native: copiedNative(),
                    },
                );
                const before = setters();
                const noChange = attempt(() => {
                    asset.friction = 0.3;
                });
                check(
                    'no-change private coefficients preserve correct initialized native values without replay',
                    !noChange.threw &&
                        setters() === before &&
                        publicCoefficientReads === 0 &&
                        equal(privateTuple(), [0.3, 0.1, 0, 0]) &&
                        nativeMatchesPrivate(),
                    {
                        noChange: view(noChange),
                        nativeSetterDelta: setters() - before,
                        publicCoefficientReads,
                        privateAsset: privateTuple(),
                        native: copiedNative(),
                    },
                );
            } finally {
                delete (asset as any).friction;
                delete (asset as any).restitution;
            }
        } else if (fixture.expected === 'lifecycle') {
            mutation(
                'friction updates explicit and inherited exactly once before public event',
                () => {
                    asset.friction = 0.45;
                },
                [0.45, 0.1, 0, 0],
                true,
            );
            mutation(
                'restitution updates explicit and inherited exactly once',
                () => {
                    asset.restitution = 0.65;
                },
                [0.45, 0.65, 0, 0],
                true,
            );
            mutation(
                'rollingFriction supported zero no-change preserves native state',
                () => {
                    asset.rollingFriction = 0;
                },
                [0.45, 0.65, 0, 0],
                false,
            );
            mutation(
                'spinningFriction supported zero no-change preserves native state',
                () => {
                    asset.spinningFriction = 0;
                },
                [0.45, 0.65, 0, 0],
                false,
            );
            mutation(
                'setValues public argument order maps to canonical friction restitution rolling spinning',
                () => asset.setValues(0.27, 0, 0, 0.72),
                [0.27, 0.72, 0, 0],
                true,
            );
            asset.removeAll(PhysicsMaterial.EVENT_UPDATE);
            const beforeEnable = setters();
            asset.setValues(0.81, 0, 0, 0.24);
            const mutationSetterDelta = setters() - beforeEnable;
            const beforeCreation = setters();
            colliders[2].enabled = true;
            colliders[3].enabled = true;
            check(
                'inactive explicit and inherited enable with latest private cached coefficients',
                fixture.liveShapes().length === 4 &&
                    mutationSetterDelta === 2 &&
                    setters() - beforeCreation === 2 &&
                    native().every(
                        (material) =>
                            material.friction === Math.fround(0.81) && material.restitution === Math.fround(0.24),
                    ),
                { mutationSetterDelta, enableInitializationSetterDelta: setters() - beforeCreation, actual: read() },
            );
            const count = setters();
            asset.emit(PhysicsMaterial.EVENT_UPDATE);
            check('manual public emit cannot acquire private native authority', setters() === count, read());
        } else if (fixture.expected === 'strict-validation') {
            mutation(
                'supported scalar approximately unchanged preserves original private cache',
                () => {
                    asset.friction = 0.3 + 1e-9;
                },
                [0.3, 0.1, 0, 0],
                false,
            );
            mutation(
                'exact unchanged setValues performs no native or public effect',
                () => asset.setValues(0.3, 0, 0, 0.1),
                [0.3, 0.1, 0, 0],
                false,
            );
            const invalid: [string, () => void][] = [
                [
                    'friction negative',
                    () => {
                        asset.friction = -1;
                    },
                ],
                [
                    'friction NaN',
                    () => {
                        asset.friction = NaN;
                    },
                ],
                [
                    'friction float32 overflow',
                    () => {
                        asset.friction = Number.MAX_VALUE;
                    },
                ],
                [
                    'friction nonprimitive',
                    () => {
                        asset.friction = '0.3' as any;
                    },
                ],
                [
                    'restitution negative',
                    () => {
                        asset.restitution = -1;
                    },
                ],
                [
                    'restitution infinity',
                    () => {
                        asset.restitution = Infinity;
                    },
                ],
                [
                    'rolling approximate zero remains strictly unsupported',
                    () => {
                        asset.rollingFriction = 1e-9;
                    },
                ],
                [
                    'spinning approximate zero remains strictly unsupported',
                    () => {
                        asset.spinningFriction = 1e-9;
                    },
                ],
                ['setValues invalid rolling does not misroute to restitution', () => asset.setValues(0.3, 0.2, 0, 0.1)],
                ['setValues invalid spinning', () => asset.setValues(0.3, 0, 0.2, 0.1)],
                ['setValues invalid restitution', () => asset.setValues(0.3, 0, 0, -1)],
            ];
            for (const [id, action] of invalid) {
                const before = {
                    tuple: tuple(asset),
                    native: native(),
                    setters: setters(),
                    notices: notifications.length,
                };
                const result = attempt(action);
                check(
                    id + ' refuses before any cache native public or fault effect',
                    result.threw &&
                        equal(before, {
                            tuple: tuple(asset),
                            native: native(),
                            setters: setters(),
                            notices: notifications.length,
                        }) &&
                        world.diagnostics().state === 'ready' &&
                        values().roster?.state === 'live',
                    { before, result: view(result), actual: read() },
                );
            }
            asset.friction = 0;
            const result = attempt(() => {
                asset.friction = -1e-9;
            });
            check(
                'scalar approximately unchanged invalid negative still validates first',
                result.threw && asset.friction === 0 && native().every((material) => material.friction === 0),
                { result: view(result), actual: read() },
            );
        } else if (fixture.expected === 'clone-isolation') {
            const shapes = fixture.liveShapes(),
                before = setters();
            const clone = colliders[0].material!;
            assets.push(clone);
            check(
                'actual collider.material allocates and publishes isolated clone without native setter',
                clone !== asset &&
                    colliders[0].sharedMaterial === clone &&
                    colliders[0].material === clone &&
                    equal(tuple(clone), tuple(asset)) &&
                    setters() === before &&
                    values().roster?.bindings === 3,
                { sameIdentity: clone === asset, clone: tuple(clone), actual: read() },
            );
            asset.friction = 0.63;
            check(
                'original mutation no longer reaches cloned active shape',
                binding.getShapeMaterial(token, shapes[0]).friction === Math.fround(0.3) &&
                    binding.getShapeMaterial(token, shapes[1]).friction === Math.fround(0.63) &&
                    clone.friction === 0.3,
                read(),
            );
            clone.setValues(0.91, 0, 0, 0.83);
            check(
                'clone mutation affects only its exact active identity',
                binding.getShapeMaterial(token, shapes[0]).friction === Math.fround(0.91) &&
                    binding.getShapeMaterial(token, shapes[0]).restitution === Math.fround(0.83) &&
                    binding.getShapeMaterial(token, shapes[1]).friction === Math.fround(0.63) &&
                    asset.friction === 0.63,
                { clone: tuple(clone), actual: read() },
            );
            colliders[2].enabled = true;
            colliders[3].enabled = true;
            check(
                'inactive original identities remain isolated from clone on enable',
                native()
                    .slice(2)
                    .every(
                        (material) =>
                            material.friction === Math.fround(0.63) && material.restitution === Math.fround(0.1),
                    ),
                read(),
            );
        } else if (fixture.expected === 'paused-config') {
            system.enable = false;
            const before = binding.stepDiagnostics(token),
                worldBefore = world.diagnostics();
            mutation(
                'disabled System accepts private configuration without hidden native step',
                () => asset.setValues(0.57, 0, 0, 0.76),
                [0.57, 0.76, 0, 0],
                true,
            );
            colliders[2].enabled = true;
            colliders[3].enabled = true;
            check(
                'paused enable and value configuration leave native clock unchanged',
                equal(before, binding.stepDiagnostics(token)) &&
                    world.diagnostics().commandOwner.systemControl.paused &&
                    world.diagnostics().attemptedSteps === worldBefore.attemptedSteps &&
                    native().every(
                        (material) =>
                            material.friction === Math.fround(0.57) && material.restitution === Math.fround(0.76),
                    ),
                read(),
            );
            system.enable = true;
            check('System resume does not implicitly step', equal(before, binding.stepDiagnostics(token)), read());
        } else {
            const sentinels: Record<string, unknown> = {
                'listener-false': false,
                'listener-zero': 0,
                'listener-null': null,
                'listener-undefined': undefined,
                'listener-empty': '',
            };
            const sentinel = sentinels[fixture.expected];
            let listenerEntered = false,
                listenerSawCommittedNative = false;
            asset.on(PhysicsMaterial.EVENT_UPDATE, () => {
                listenerEntered = true;
                listenerSawCommittedNative = native().every((material) => material.friction === Math.fround(0.84));
                throw sentinel;
            });
            const count = setters();
            const result = attempt(() => {
                asset.friction = 0.84;
            });
            const owner = world.diagnostics(),
                last = values().last,
                diagnostics = last?.failure;
            check(
                'deliberate public listener falsey throw preserves exact first failure after actual mutation',
                result.threw &&
                    Object.is(result.error, sentinel) &&
                    listenerEntered &&
                    listenerSawCommittedNative &&
                    asset.friction === 0.84 &&
                    setters() - count === 2 &&
                    native().every((material) => material.friction === Math.fround(0.84)),
                {
                    classification: 'DELIBERATE_PUBLIC_LISTENER_FAULT_NOT_BACKEND_FAILURE',
                    result: view(result),
                    sentinelType: typeof sentinel,
                    sentinelText: String(sentinel),
                    nativeSetterDelta: setters() - count,
                    listenerEntered,
                    listenerSawCommittedNative,
                    actual: read(),
                },
            );
            check(
                'fault diagnostics distinguish returned verified native effects from public failure',
                owner.state === 'faulted' &&
                    owner.failure.hasFailure &&
                    Object.is(owner.failure.error, sentinel) &&
                    last?.failed === true &&
                    diagnostics?.hasFailure === true &&
                    Object.is(diagnostics.error, sentinel) &&
                    diagnostics.cacheWrites === 1 &&
                    diagnostics.publicEntered &&
                    !diagnostics.publicReturned &&
                    diagnostics.native.length === 2 &&
                    diagnostics.native.every(
                        (operation) => operation.state === 'returned' && operation.readback === 'verified',
                    ) &&
                    diagnostics.ownerCacheStates.every((state) => state === 'returned') &&
                    diagnostics.ownerCommitStates.every((state) => state === 'not-entered'),
                owner,
            );
            const after = read(),
                retry = attempt(() => {
                    asset.friction = 0.99;
                });
            check(
                'faulted owner refuses later value write without replay or rollback',
                retry.threw &&
                    setters() === after.setters &&
                    equal(tuple(asset), after.asset) &&
                    equal(native(), after.native),
                { retry: view(retry), actual: read() },
            );
        }
        for (const owned of assets) {
            const flags = (owned as any)._objFlags,
                result = attempt(() => {
                    owned.destroy();
                });
            check(
                'owned asset ' + assets.indexOf(owned) + ' destroy refuses before flags and registry changes',
                result.threw && (owned as any)._objFlags === flags && PhysicsMaterial.allMaterials.includes(owned),
                { result: view(result), flagsBefore: flags, flagsAfter: (owned as any)._objFlags },
            );
        }
        check(
            'no hidden physics step or staged unified activation',
            binding.stepDiagnostics(token).nativeStepIndex === 0 &&
                !world.diagnostics().commandOwner.unifiedTransactionsSupported &&
                !world.diagnostics().commandOwner.stagedCommandsSupported,
            world.diagnostics(),
        );
    } catch (error) {
        failed = true;
        failure = error;
    } finally {
        if (app) {
            try {
                const close = await app.close!(),
                    observations = fixture.observations();
                check(
                    'actual App close confirms native release',
                    close.status === 'released' && world?.diagnostics().teardown.nativeReturned === true,
                    { close, owner: world?.diagnostics() },
                );
                check(
                    'actual core and bridge allocation counters reach zero',
                    observations.beforeBindingDispose?.coreBytes === '0' &&
                        observations.beforeBindingDispose?.bridge.liveBytes === '0' &&
                        observations.beforeBindingDispose?.bridge.liveAllocations === 0,
                    observations.beforeBindingDispose,
                );
                for (const asset of assets) {
                    let returned: boolean | undefined;
                    const result = attempt(() => {
                        returned = asset.destroy();
                    });
                    check(
                        'confirmed close releases asset ' + assets.indexOf(asset) + ' ownership before destroy',
                        !result.threw && returned === true && !PhysicsMaterial.allMaterials.includes(asset),
                        { result: view(result), returned },
                    );
                }
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
        });
    }
    if (failed) {
        fixture.fail(failure);
        throw failure;
    }
    try {
        expect(checks.filter((item) => !item.pass)).toEqual([]);
        fixture.complete('PASS_LIMITED_PRIVATE_MATERIAL');
    } catch (error) {
        fixture.fail(error);
        throw error;
    }
});
