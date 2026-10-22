/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual Cocos BoxCollider/SphereCollider/PhysicsMaterial sources, injected wrapper only.
 * Tests cache/listener order, NOT native shape or WASM physics.
 */
import { BoxCollider } from '../../../src/cocos/physics/framework/components/colliders/box-collider';
import { SphereCollider } from '../../../src/cocos/physics/framework/components/colliders/sphere-collider';
import { PhysicsMaterial } from '../../../src/cocos/physics/framework/assets/physics-material';
import { selector } from '../../../src/cocos/physics/framework/physics-selector';
import { Vec3 } from '../../../src/cocos/core/math/vec3';

const originalId = selector.id;
const select = (id: string) => {
    (selector as unknown as { id: string }).id = id;
};
const rejection = new Error('injected native shape validation rejection');
const vector = (v: Vec3) => [v.x, v.y, v.z];
const created: PhysicsMaterial[] = [];
function material(): PhysicsMaterial {
    const value = new PhysicsMaterial();
    created.push(value);
    return value;
}
afterEach(() => {
    jest.restoreAllMocks();
    select(originalId);
    for (const value of created) {
        const i = PhysicsMaterial.allMaterials.indexOf(value);
        if (i >= 0) PhysicsMaterial.allMaterials.splice(i, 1);
    }
    created.length = 0;
});
for (const Component of [BoxCollider, SphereCollider]) {
    describe(`${Component.name}: actual component with injected delegate`, () => {
        test('Box3D rejected trigger candidate preserves cache', () => {
            select('box3d');
            const collider = new Component() as any;
            collider._shape = {
                setAsTrigger: () => {
                    throw rejection;
                },
            };
            expect(() => {
                collider.isTrigger = true;
            }).toThrow(rejection);
            expect(collider.isTrigger).toBe(false);
        });
        test('Box3D rejected center preserves vector identity and values', () => {
            select('box3d');
            const collider = new Component() as any;
            const previous = collider.center;
            collider._shape = {
                setCenter: () => {
                    throw rejection;
                },
            };
            expect(() => {
                collider.center = new Vec3(NaN, 2, 3);
            }).toThrow(rejection);
            expect(collider.center).toBe(previous);
            expect(vector(collider.center)).toEqual([0, 0, 0]);
        });
        test('Box3D rejected replacement material preserves cache and listeners', () => {
            select('box3d');
            const collider = new Component() as any;
            const old = material(),
                next = material();
            collider._material = old;
            const off = jest.spyOn(old, 'off'),
                on = jest.spyOn(next, 'on');
            collider._shape = {
                setMaterial: () => {
                    throw rejection;
                },
            };
            expect(() => {
                collider.sharedMaterial = next;
            }).toThrow(rejection);
            expect(collider.sharedMaterial).toBe(old);
            expect(off).not.toHaveBeenCalled();
            expect(on).not.toHaveBeenCalled();
        });
        test('Box3D rejected null material preserves cache', () => {
            select('box3d');
            const collider = new Component() as any;
            const old = material();
            collider._material = old;
            collider._shape = {
                setMaterial: () => {
                    throw rejection;
                },
            };
            expect(() => {
                collider.sharedMaterial = null;
            }).toThrow(rejection);
            expect(collider.sharedMaterial).toBe(old);
        });
        test('Box3D accepted trigger/center candidates are delegated before cache commit', () => {
            select('box3d');
            const collider = new Component() as any;
            collider._shape = {
                setAsTrigger(value: boolean) {
                    expect(value).toBe(true);
                    expect(collider.isTrigger).toBe(false);
                },
                setCenter(value: Vec3) {
                    expect(vector(value)).toEqual([1, 2, 3]);
                    expect(vector(collider.center)).toEqual([0, 0, 0]);
                },
            };
            collider.isTrigger = true;
            collider.center = new Vec3(1, 2, 3);
            expect(collider.isTrigger).toBe(true);
            expect(vector(collider.center)).toEqual([1, 2, 3]);
        });
        test('Box3D accepted material delegates before cache/listener changes', () => {
            select('box3d');
            const collider = new Component() as any;
            const old = material(),
                next = material();
            collider._material = old;
            const off = jest.spyOn(old, 'off'),
                on = jest.spyOn(next, 'on');
            collider._shape = {
                setMaterial(value: PhysicsMaterial) {
                    expect(value).toBe(next);
                    expect(collider.sharedMaterial).toBe(old);
                    expect(off).not.toHaveBeenCalled();
                    expect(on).not.toHaveBeenCalled();
                },
            };
            collider.sharedMaterial = next;
            expect(collider.sharedMaterial).toBe(next);
            expect(off).toHaveBeenCalledTimes(1);
            expect(on).toHaveBeenCalledTimes(1);
        });
        test.each(['builtin', 'cannon.js'])('%s retains existing cache-first order', (backend) => {
            select(backend);
            const collider = new Component() as any;
            const next = material();
            collider._shape = {
                setAsTrigger(value: boolean) {
                    expect(collider.isTrigger).toBe(value);
                },
                setCenter(value: Vec3) {
                    expect(collider.center).toBe(value);
                },
                setMaterial(value: PhysicsMaterial) {
                    expect(collider.sharedMaterial).toBe(value);
                },
            };
            collider.isTrigger = true;
            collider.center = new Vec3(1, 2, 3);
            collider.sharedMaterial = next;
        });
    });
}
test('Box3D rejected box size preserves cached identity and values', () => {
    select('box3d');
    const collider = new BoxCollider() as any;
    const previous = collider.size;
    collider._shape = {
        updateSize: () => {
            throw rejection;
        },
    };
    expect(() => {
        collider.size = new Vec3(NaN, 4, 5);
    }).toThrow(rejection);
    expect(collider.size).toBe(previous);
    expect(vector(collider.size)).toEqual([1, 1, 1]);
});
test('Box3D box size forwards normalized candidate before commit', () => {
    select('box3d');
    const collider = new BoxCollider() as any;
    collider._shape = {
        updateSize(value: Vec3) {
            expect(value).toBeDefined();
            expect(vector(value)).toEqual([2, 4, 6]);
            expect(vector(collider.size)).toEqual([1, 1, 1]);
        },
    };
    collider.size = new Vec3(-2, 4, -6);
    expect(vector(collider.size)).toEqual([2, 4, 6]);
});
test('Box3D rejected sphere radius preserves cache', () => {
    select('box3d');
    const collider = new SphereCollider() as any;
    collider._shape = {
        updateRadius: () => {
            throw rejection;
        },
    };
    expect(() => {
        collider.radius = NaN;
    }).toThrow(rejection);
    expect(collider.radius).toBe(0.5);
});
test('Box3D sphere radius forwards normalized candidate before commit', () => {
    select('box3d');
    const collider = new SphereCollider() as any;
    collider._shape = {
        updateRadius(value: number) {
            expect(value).toBe(3);
            expect(collider.radius).toBe(0.5);
        },
    };
    collider.radius = -3;
    expect(collider.radius).toBe(3);
});
test.each(['builtin', 'cannon.js'])('%s retains zero-argument size callbacks with updated cache', (backend) => {
    select(backend);
    const box = new BoxCollider() as any,
        sphere = new SphereCollider() as any;
    box._shape = {
        updateSize(...args: unknown[]) {
            expect(args).toHaveLength(0);
            expect(vector(box.size)).toEqual([2, 4, 6]);
        },
    };
    sphere._shape = {
        updateRadius(...args: unknown[]) {
            expect(args).toHaveLength(0);
            expect(sphere.radius).toBe(3);
        },
    };
    box.size = new Vec3(-2, 4, -6);
    sphere.radius = -3;
});
test('without live shape, original negative size/radius normalization remains', () => {
    select('box3d');
    const box = new BoxCollider(),
        sphere = new SphereCollider();
    box.size = new Vec3(-2, -3, -4);
    sphere.radius = -5;
    expect(vector(box.size)).toEqual([2, 3, 4]);
    expect(sphere.radius).toBe(5);
});
test('documented boundary: unexpected material.on throw after native commit is not a full rollback', () => {
    select('box3d');
    const collider = new BoxCollider() as any;
    const old = material(),
        next = material();
    collider._material = old;
    const off = jest.spyOn(old, 'off');
    jest.spyOn(next, 'on').mockImplementation(() => {
        throw new Error('unexpected listener failure');
    });
    const write = jest.fn();
    collider._shape = { setMaterial: write };
    expect(() => {
        collider.sharedMaterial = next;
    }).toThrow('unexpected listener failure');
    expect(write).toHaveBeenCalledWith(next);
    expect(off).toHaveBeenCalledTimes(1);
    expect(collider.sharedMaterial).toBe(old);
});
test('documented boundary: material EVENT_UPDATE observes an already mutated material asset', () => {
    select('box3d');
    const collider = new SphereCollider() as any;
    const asset = material();
    collider._shape = { setMaterial: jest.fn() };
    collider.sharedMaterial = asset;
    collider._shape.setMaterial = () => {
        throw rejection;
    };
    expect(() => {
        asset.friction = 0.75;
    }).toThrow(rejection);
    expect(collider.sharedMaterial).toBe(asset);
    expect(asset.friction).toBe(0.75);
});
