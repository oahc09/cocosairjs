/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual Cocos CapsuleCollider setters and pure AIR geometry, injected delegate only.
 * These controls do not establish native/WASM shape, mass, query, contact or owned-clock acceptance.
 */
import { CapsuleCollider } from '../../../src/cocos/physics/framework/components/colliders/capsule-collider';
import { selector } from '../../../src/cocos/physics/framework/physics-selector';
import { registerMutationGuard } from '../../../src/cocos/core/data/mutation-guard';
import { primitiveBounds, primitiveGeometry } from '../../../src/air/physics/box3d/box-sphere-geometry';

const originalId = selector.id;
const select = (id: string) => {
    (selector as unknown as { id: string }).id = id;
};
afterEach(() => select(originalId));
const cases = [
    ['radius', 'setRadius', 1.25],
    ['cylinderHeight', 'setCylinderHeight', 2.5],
    ['direction', 'setDirection', 2],
] as const;

describe('actual CapsuleCollider setters with an injected delegate, not native physics', () => {
    test.each(cases)('%s commits only after a successful Box3D delegate', (key, method, value) => {
        select('box3d');
        const collider = new CapsuleCollider() as any;
        const previous = collider[key];
        const observed: unknown[] = [];
        collider._shape = {
            [method]: (candidate: number) => {
                observed.push([candidate, collider[key]]);
            },
        };
        collider[key] = value;
        expect(observed).toEqual([[value, previous]]);
        expect(collider[key]).toBe(value);
    });
    test.each(cases)('%s retains the public field on delegate rejection', (key, method, value) => {
        select('box3d');
        const collider = new CapsuleCollider() as any;
        const previous = collider[key];
        const failure = new Error('explicit fixture rejection before native mutation');
        collider._shape = {
            [method]: () => {
                throw failure;
            },
        };
        expect(() => {
            collider[key] = value;
        }).toThrow(failure);
        expect(collider[key]).toBe(previous);
    });
    test.each(cases)(
        '%s is blocked before delegate and public-cache mutation by the current owner guard',
        (key, method, value) => {
            select('box3d');
            const collider = new CapsuleCollider() as any;
            const previous = collider[key];
            const calls = jest.fn();
            collider._shape = { [method]: calls };
            const guard = registerMutationGuard([collider], {
                code: 'CAPSULE_CONTROL_LOCKED',
                message: 'fixture owner',
            });
            try {
                expect(() => {
                    collider[key] = value;
                }).toThrow('fixture owner');
                expect(collider[key]).toBe(previous);
                expect(calls).not.toHaveBeenCalled();
            } finally {
                guard.dispose();
            }
        },
    );
    test.each(cases)('%s preserves the original non-Box3D commit order', (key, method, value) => {
        select('cannon.js');
        const collider = new CapsuleCollider() as any;
        let observed: number | undefined;
        collider._shape = {
            [method]: () => {
                observed = collider[key];
            },
        };
        collider[key] = value;
        expect(observed).toBe(value);
        expect(collider[key]).toBe(value);
    });
    test('Box3D keeps public absolute size/floored axis normalization without passing negative geometry', () => {
        select('box3d');
        const collider = new CapsuleCollider() as any;
        const radius = jest.fn(),
            height = jest.fn(),
            direction = jest.fn();
        collider._shape = { setRadius: radius, setCylinderHeight: height, setDirection: direction };
        collider.radius = -2;
        collider.cylinderHeight = -3;
        collider.direction = 2.9;
        expect(radius).toHaveBeenLastCalledWith(2);
        expect(height).toHaveBeenLastCalledWith(3);
        expect(direction).toHaveBeenLastCalledWith(2);
        expect([collider.radius, collider.cylinderHeight, collider.direction]).toEqual([2, 3, 2]);
    });
    test('height-derived zero cylinder delegates the explicit sphere boundary and retains its cache on rejection', () => {
        select('box3d');
        const collider = new CapsuleCollider() as any;
        const previous = collider.cylinderHeight;
        collider._shape = {
            setCylinderHeight: (value: number) => {
                expect(value).toBe(0);
                throw new Error('reject');
            },
        };
        expect(() => {
            collider.height = 0;
        }).toThrow('reject');
        expect(collider.cylinderHeight).toBe(previous);
    });
});

const pose = [10, 20, 30, 0, 0, 0, 1, 10, 20, 30];
const capsule = (radius = 0.5, height = 2, direction = 1, center = [0, 0, 0], scale = [1, 1, 1]) =>
    primitiveGeometry('capsule', center, [radius, height, direction], scale, false, null);

describe('pure capsule geometry and analytic bounds, not native geometry acceptance', () => {
    test.each([0, 1, 2])('axis %s uses only perpendicular radius scale and axial cylinder scale', (direction) => {
        const geometry = capsule(0.5, 4, direction, [1, -2, 3], [2, 3, 4]);
        const radius = direction === 2 ? 1.5 : 2;
        const half = [4, 6, 8][direction];
        expect(geometry.center).toEqual([2, -6, 12]);
        expect(geometry.dimensions).toEqual([radius, half, direction]);
        const bounds = primitiveBounds(geometry, pose);
        expect(bounds.center).toEqual([12, 14, 42]);
        expect(bounds.halfExtents).toEqual([0, 1, 2].map((axis) => radius + (axis === direction ? half : 0)));
        expect(bounds.radius).toBe(radius + half);
    });
    test.each([0, 1, 2])(
        'explicit zero cylinder axis %s has sphere bounds, not a hidden positive segment',
        (direction) => {
            const geometry = capsule(0.5, 0, direction, [1, 2, 3]);
            expect(geometry.dimensions).toEqual([0.5, 0, direction]);
            expect(primitiveBounds(geometry, pose)).toEqual({
                center: [11, 22, 33],
                halfExtents: [0.5, 0.5, 0.5],
                radius: 0.5,
            });
        },
    );
    test('rotated capsule bounds follow the actual body-local segment and offset center', () => {
        const halfAngle = Math.PI / 4;
        const rotated = [10, 20, 30, 0, 0, Math.sin(halfAngle), Math.cos(halfAngle), 0, 0, 0];
        const bounds = primitiveBounds(capsule(0.5, 2, 1, [1, 2, 3]), rotated);
        bounds.center.forEach((value, index) => expect(value).toBeCloseTo([8, 21, 33][index], 12));
        bounds.halfExtents.forEach((value, index) => expect(value).toBeCloseTo([1.5, 0.5, 0.5][index], 12));
        expect(bounds.radius).toBe(1.5);
    });
    test.each([Number.NaN, Infinity, -1, 0.5, 3, 1 + Number.EPSILON])(
        'rejects nonexact adapter direction %s',
        (axis) => {
            expect(() => capsule(0.5, 2, axis)).toThrow('Expected exact axis');
        },
    );
    test.each([0, -1, NaN, Infinity, 1e-50])('rejects invalid or F32-underflowed radius %s', (radius) => {
        expect(() => capsule(radius)).toThrow();
    });
    test.each([-1, -1e-50, NaN, Infinity])('rejects invalid cylinder height %s', (height) => {
        expect(() => capsule(0.5, height)).toThrow();
    });
    test.each([1e-50, 0.001, 0.005])('positive height %s may not silently become sphere geometry', (height) => {
        expect(() => capsule(0.5, height)).toThrow('AIR_E_BOX3D_UNSUPPORTED');
    });
    test('accepts a segment strictly above the exact F32 native slop test', () => {
        expect(capsule(0.5, 0.005001).dimensions[1]).toBeGreaterThan(Math.fround(0.0025));
    });
    test('large-center endpoint cancellation is rejected rather than normalized to a sphere', () => {
        expect(() => capsule(0.5, 2, 0, [1e9, 0, 0])).toThrow('AIR_E_BOX3D_UNSUPPORTED');
    });
    test('bounds use independently rounded endpoints, including an asymmetric F32 midpoint', () => {
        const geometry = capsule(0.5, 2, 0, [2 ** 24, 0, 0]);
        const bounds = primitiveBounds(geometry, [0, 0, 0, 0, 0, 0, 1, 0, 0, 0]);
        expect(bounds.center).toEqual([2 ** 24 - 0.5, 0, 0]);
        expect(bounds.halfExtents).toEqual([1, 0.5, 0.5]);
        expect(bounds.radius).toBe(1);
    });
    test('derived endpoint-distance overflow is rejected before shape creation', () => {
        expect(() => capsule(0.5, 1e20)).toThrow();
    });
    test.each([[[-1, 1, 1]], [[1, 0, 1]]])(
        'retains the existing nonpositive initial-scale restriction: %j',
        (scale) => {
            expect(() => capsule(0.5, 2, 1, [0, 0, 0], scale)).toThrow('nonpositive initial primitive scale');
        },
    );
    test('box and sphere geometry/bounds remain unchanged', () => {
        const box = primitiveGeometry('box', [1, -2, 3], [2, 4, 6], [2, 3, 4], false, null);
        const sphere = primitiveGeometry('sphere', [1, -2, 3], [0.5], [2, 3, 4], false, null);
        expect(box.dimensions).toEqual([2, 6, 12]);
        expect(primitiveBounds(box, pose)).toEqual({
            center: [12, 14, 42],
            halfExtents: [2, 6, 12],
            radius: Math.hypot(2, 6, 12),
        });
        expect(sphere.dimensions).toEqual([2]);
        expect(primitiveBounds(sphere, pose)).toEqual({ center: [12, 14, 42], halfExtents: [2, 2, 2], radius: 2 });
    });
});
