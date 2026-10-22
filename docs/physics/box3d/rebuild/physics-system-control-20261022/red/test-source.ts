/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual PhysicsSystem, PhysicsMaterial, Vec3 and selector sources in the existing Jest engine realm.
 * Only the world setters are mocks. No copied setter implementation, WASM or physics simulation.
 */
import { PhysicsSystem } from '../../../src/cocos/physics/framework/physics-system';
import { PhysicsMaterial } from '../../../src/cocos/physics/framework/assets/physics-material';
import { selector } from '../../../src/cocos/physics/framework/physics-selector';
import type { IPhysicsWorld } from '../../../src/cocos/physics/spec/i-physics-world';
import { Vec3 } from '../../../src/cocos/core/math/vec3';

const mutableSelector = selector as unknown as { id: string; physicsWorld: IPhysicsWorld | null };
const originalId = selector.id;
const originalWorld = selector.physicsWorld;
const vector = (v: Vec3) => [v.x, v.y, v.z];
const materials: PhysicsMaterial[] = [];
const systems: PhysicsSystem[] = [];
function createMaterial(): PhysicsMaterial {
    const result = new PhysicsMaterial();
    materials.push(result);
    return result;
}
function fixture(backend = 'box3d') {
    // TypeScript's private constructor is intentionally accessed only by this internal source test.
    const system = new (PhysicsSystem as unknown as new () => PhysicsSystem)();
    systems.push(system);
    const world = {
        setAllowSleep: jest.fn<void, [boolean]>(),
        setGravity: jest.fn<void, [Vec3]>(),
        setDefaultMaterial: jest.fn<void, [PhysicsMaterial]>(),
    };
    mutableSelector.id = backend;
    mutableSelector.physicsWorld = world as unknown as IPhysicsWorld;
    return { system, world };
}
afterEach(() => {
    jest.restoreAllMocks();
    for (const material of materials) {
        for (const system of systems) material.targetOff(system);
        const index = PhysicsMaterial.allMaterials.indexOf(material);
        if (index >= 0) PhysicsMaterial.allMaterials.splice(index, 1);
    }
    materials.length = systems.length = 0;
    mutableSelector.id = originalId;
    mutableSelector.physicsWorld = originalWorld;
});

describe('Box3D native-first assignments on actual PhysicsSystem source', () => {
    test('sleep commits only after the native setter returns', () => {
        const { system, world } = fixture();
        const observed: boolean[] = [];
        world.setAllowSleep.mockImplementation(() => {
            observed.push(system.allowSleep);
        });
        system.allowSleep = false;
        expect(observed).toEqual([true]);
        expect(system.allowSleep).toBe(false);
        expect(world.setAllowSleep).toHaveBeenCalledTimes(1);
    });
    test('rejected sleep assignment preserves public cached value', () => {
        const { system, world } = fixture();
        world.setAllowSleep.mockImplementation(() => {
            throw new Error('sleep rejected');
        });
        expect(() => {
            system.allowSleep = false;
        }).toThrow('sleep rejected');
        expect(system.allowSleep).toBe(true);
    });
    test('gravity commits a copy after native success without replacing the cached Vec3', () => {
        const { system, world } = fixture();
        const original = system.gravity;
        const next = new Vec3(1, 2, 3);
        const observed: number[][] = [];
        world.setGravity.mockImplementation(() => {
            observed.push(vector(system.gravity));
        });
        system.gravity = next;
        expect(observed).toEqual([[0, -10, 0]]);
        expect(world.setGravity).toHaveBeenCalledWith(next);
        expect(system.gravity).toBe(original);
        expect(system.gravity).not.toBe(next);
        expect(vector(system.gravity)).toEqual([1, 2, 3]);
        next.x = 99;
        expect(system.gravity.x).toBe(1);
    });
    test('rejected non-aliased gravity preserves the last public value and identity', () => {
        const { system, world } = fixture();
        const original = system.gravity;
        world.setGravity.mockImplementation(() => {
            throw new Error('gravity rejected');
        });
        expect(() => {
            system.gravity = new Vec3(NaN, 0, 0);
        }).toThrow('gravity rejected');
        expect(system.gravity).toBe(original);
        expect(vector(system.gravity)).toEqual([0, -10, 0]);
    });
    test('successful material replacement commits after native acceptance and transfers only the system listener', () => {
        const { system, world } = fixture();
        const previous = createMaterial();
        const next = createMaterial();
        system.setDefaultPhysicsMaterial(previous);
        const unrelated = jest.fn();
        previous.on(PhysicsMaterial.EVENT_UPDATE, unrelated);
        const observed: PhysicsMaterial[] = [];
        world.setDefaultMaterial.mockImplementation(() => {
            observed.push(system.defaultMaterial);
        });
        system.setDefaultPhysicsMaterial(next);
        expect(observed).toEqual([previous]);
        expect(system.defaultMaterial).toBe(next);
        world.setDefaultMaterial.mockClear();
        previous.friction = 0.25;
        expect(unrelated).toHaveBeenCalledTimes(1);
        expect(world.setDefaultMaterial).not.toHaveBeenCalled();
        next.friction = 0.75;
        expect(world.setDefaultMaterial).toHaveBeenCalledTimes(1);
        expect(world.setDefaultMaterial).toHaveBeenCalledWith(next);
    });
    test('failed material replacement leaves the old pointer/listener and never attaches the rejected material', () => {
        const { system, world } = fixture();
        const previous = createMaterial();
        const next = createMaterial();
        system.setDefaultPhysicsMaterial(previous);
        world.setDefaultMaterial.mockImplementationOnce(() => {
            throw new Error('material rejected');
        });
        expect(() => system.setDefaultPhysicsMaterial(next)).toThrow('material rejected');
        expect(system.defaultMaterial).toBe(previous);
        world.setDefaultMaterial.mockClear();
        next.friction = 0.2;
        expect(world.setDefaultMaterial).not.toHaveBeenCalled();
        previous.friction = 0.3;
        expect(world.setDefaultMaterial).toHaveBeenCalledTimes(1);
        expect(world.setDefaultMaterial).toHaveBeenCalledWith(previous);
    });
    test('repeated assignment of the same accepted material keeps one actual event listener', () => {
        const { system, world } = fixture();
        const material = createMaterial();
        for (let i = 0; i < 3; ++i) system.setDefaultPhysicsMaterial(material);
        world.setDefaultMaterial.mockClear();
        material.setValues(0.25, 0, 0, 0.5);
        expect(world.setDefaultMaterial).toHaveBeenCalledTimes(1);
        expect(world.setDefaultMaterial).toHaveBeenCalledWith(material);
    });
    test('pre-world sleep/gravity still stage initialization; material cannot commit without a world', () => {
        const { system } = fixture();
        mutableSelector.physicsWorld = null;
        system.allowSleep = false;
        system.gravity = new Vec3(1, 2, 3);
        expect(system.allowSleep).toBe(false);
        expect(vector(system.gravity)).toEqual([1, 2, 3]);
        expect(() => system.setDefaultPhysicsMaterial(createMaterial())).toThrow();
        expect(system.defaultMaterial).toBeUndefined();
    });
});

describe.each(['builtin', 'cannon.js', 'bullet', 'physx'])('unchanged legacy backend %s ordering', (backend) => {
    test('success preserves cache-first observations and the existing old-material listener behavior', () => {
        const { system, world } = fixture(backend);
        const observed: unknown[] = [];
        world.setAllowSleep.mockImplementation(() => {
            observed.push(system.allowSleep);
        });
        system.allowSleep = false;
        world.setGravity.mockImplementation(() => {
            observed.push(vector(system.gravity));
        });
        system.gravity = new Vec3(1, 2, 3);
        const previous = createMaterial();
        const next = createMaterial();
        system.setDefaultPhysicsMaterial(previous);
        world.setDefaultMaterial.mockImplementation(() => {
            observed.push(system.defaultMaterial);
        });
        system.setDefaultPhysicsMaterial(next);
        expect(observed).toEqual([false, [1, 2, 3], next]);
        world.setDefaultMaterial.mockClear();
        previous.friction = 0.25;
        expect(world.setDefaultMaterial).toHaveBeenCalledTimes(1);
        expect(world.setDefaultMaterial).toHaveBeenCalledWith(next);
    });
    test('backend rejection retains the original cache-first failure behavior', () => {
        const { system, world } = fixture(backend);
        world.setAllowSleep.mockImplementation(() => {
            throw new Error('legacy sleep');
        });
        expect(() => {
            system.allowSleep = false;
        }).toThrow('legacy sleep');
        expect(system.allowSleep).toBe(false);
        world.setGravity.mockImplementation(() => {
            throw new Error('legacy gravity');
        });
        expect(() => {
            system.gravity = new Vec3(1, 2, 3);
        }).toThrow('legacy gravity');
        expect(vector(system.gravity)).toEqual([1, 2, 3]);
        const material = createMaterial();
        world.setDefaultMaterial.mockImplementation(() => {
            throw new Error('legacy material');
        });
        expect(() => system.setDefaultPhysicsMaterial(material)).toThrow('legacy material');
        expect(system.defaultMaterial).toBe(material);
        expect(material.hasEventListener(PhysicsMaterial.EVENT_UPDATE)).toBe(false);
    });
});

describe('explicit unchanged non-transactional boundaries, not C36 acceptance', () => {
    test('mutating the getter Vec3 changes the cache before an aliased rejected assignment', () => {
        const { system, world } = fixture();
        const alias = system.gravity;
        alias.x = NaN;
        world.setGravity.mockImplementation(() => {
            throw new Error('aliased gravity rejected');
        });
        expect(() => {
            system.gravity = alias;
        }).toThrow('aliased gravity rejected');
        expect(system.gravity).toBe(alias);
        expect(Number.isNaN(system.gravity.x)).toBe(true);
    });
    test('actual material EVENT_UPDATE occurs after mutation; native rejection does not undo the material', () => {
        const { system, world } = fixture();
        const material = createMaterial();
        system.setDefaultPhysicsMaterial(material);
        let acceptedFriction = material.friction;
        world.setDefaultMaterial.mockImplementation((next) => {
            if (next.friction < 0) throw new Error('updated material rejected');
            acceptedFriction = next.friction;
        });
        expect(() => {
            material.friction = -1;
        }).toThrow('updated material rejected');
        expect(system.defaultMaterial).toBe(material);
        expect(material.friction).toBe(-1);
        expect(acceptedFriction).toBe(0.6);
    });
    test('resetConfiguration still mutates caches before native calls and is not a transaction', () => {
        const { system, world } = fixture();
        world.setGravity.mockImplementation(() => {
            throw new Error('reset rejected');
        });
        expect(() =>
            system.resetConfiguration({
                allowSleep: false,
                gravity: new Vec3(NaN, 0, 0),
                fixedTimeStep: -1,
                autoSimulation: false,
            }),
        ).toThrow('reset rejected');
        expect(system.allowSleep).toBe(false);
        expect(Number.isNaN(system.gravity.x)).toBe(true);
        expect(system.fixedTimeStep).toBe(-1);
        expect(system.autoSimulation).toBe(false);
        expect(world.setAllowSleep).not.toHaveBeenCalled();
    });
    test('an unexpectedly throwing material.on is not claimed as a native rollback', () => {
        const { system, world } = fixture();
        const previous = createMaterial();
        const next = createMaterial();
        system.setDefaultPhysicsMaterial(previous);
        let accepted = previous;
        world.setDefaultMaterial.mockImplementation((value) => {
            accepted = value;
        });
        jest.spyOn(next, 'on').mockImplementation(() => {
            throw new Error('injected listener registration failure');
        });
        expect(() => system.setDefaultPhysicsMaterial(next)).toThrow('injected listener registration failure');
        expect(accepted).toBe(next);
        expect(system.defaultMaterial).toBe(next);
        expect(next.hasEventListener(PhysicsMaterial.EVENT_UPDATE)).toBe(false);
    });
});
