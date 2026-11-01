/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual PhysicsSystem/Vec3/Ray/result sources; only backend intersection dispatch is mocked.
 * This tests public query contracts, not native physics or browser rendering.
 */
import { PhysicsSystem } from '../../src/cocos/physics/framework/physics-system';
import { selector } from '../../src/cocos/physics/framework/physics-selector';
import { Vec3 } from '../../src/cocos/core/math/vec3';
import { copyBox3DRay } from '../../src/air/physics/box3d/query';
import type { IPhysicsWorld } from '../../src/cocos/physics/spec/i-physics-world';

const mutable = selector as unknown as { id: string; physicsWorld: IPhysicsWorld | null };
const original = { id: selector.id, world: selector.physicsWorld };
afterEach(() => {
    mutable.id = original.id;
    mutable.physicsWorld = original.world;
});
const points = (xs: number[]) => xs.map((x) => new Vec3(x, 0, 0));

function fixture(backend: string, closest: boolean, target?: number) {
    const system = new (PhysicsSystem as unknown as new () => PhysicsSystem)();
    const calls: { origin: number; distance: number }[] = [];
    const collider = {};
    const intersect = (ray: any, options: any, result: any) => {
        // Exercise the production Box3D validation too; legacy backends receive the same geometry.
        if (backend === 'box3d') copyBox3DRay(ray, options);
        expect([ray.d.x, ray.d.y, ray.d.z].every(Number.isFinite)).toBe(true);
        expect(Vec3.len(ray.d)).toBeCloseTo(1);
        expect(options.mask).toBe(7);
        expect(options.queryTrigger).toBe(false);
        calls.push({ origin: ray.o.x, distance: options.maxDistance });
        if (target === undefined || target < ray.o.x || target > ray.o.x + options.maxDistance) return false;
        result._assign(new Vec3(target, 0, 0), target - ray.o.x, collider, new Vec3(0, 1, 0));
        return true;
    };
    mutable.id = backend;
    mutable.physicsWorld = {
        raycastClosest: intersect,
        raycast(ray: any, options: any, pool: any, results: any[]) {
            const result = pool.add();
            const hit = intersect(ray, options, result);
            if (hit) results.push(result);
            return hit;
        },
    } as unknown as IPhysicsWorld;
    return {
        calls,
        system,
        cast: (xs: number[], budget = 100) =>
            closest
                ? system.lineStripCastClosest(points(xs), 7, budget, false)
                : system.lineStripCast(points(xs), 7, budget, false),
    };
}

for (const backend of ['box3d', 'builtin', 'cannon.js', 'bullet', 'physx']) {
    for (const closest of [false, true]) {
        describe(`${backend} ${closest ? 'closest' : 'all-hit'} line strip`, () => {
            test.each([
                ['first', [0, 0, 2, 4]],
                ['middle', [0, 2, 2, 4]],
                ['last', [0, 2, 4, 4]],
            ] as const)('skips duplicate %s vertex', (_name, xs) => {
                const f = fixture(backend, closest);
                expect(f.cast([...xs])).toBe(false);
                expect(f.calls).toEqual([
                    { origin: 0, distance: 2 },
                    { origin: 2, distance: 2 },
                ]);
            });
            test.each([[], [0], [0, 0, 0]])('degenerate input %j never reaches backend', (...xs) => {
                const f = fixture(backend, closest);
                expect(f.cast(xs)).toBe(false);
                expect(f.calls).toEqual([]);
            });
            test.each([
                [-1, []],
                [0, []],
                [1, [{ origin: 0, distance: 1 }]],
                [2, [{ origin: 0, distance: 2 }]],
                [
                    3,
                    [
                        { origin: 0, distance: 2 },
                        { origin: 2, distance: 1 },
                    ],
                ],
                [
                    4,
                    [
                        { origin: 0, distance: 2 },
                        { origin: 2, distance: 2 },
                    ],
                ],
                [
                    10,
                    [
                        { origin: 0, distance: 2 },
                        { origin: 2, distance: 2 },
                    ],
                ],
            ])('clips total budget %s', (budget, expected) => {
                const f = fixture(backend, closest);
                expect(f.cast([0, 2, 2, 4], budget as number)).toBe(false);
                expect(f.calls).toEqual(expected);
            });
            test('does not report a hit outside the clipped segment', () => {
                const f = fixture(backend, closest, 5);
                expect(f.cast([0, 10], 1)).toBe(false);
                expect(f.calls).toEqual([{ origin: 0, distance: 1 }]);
            });
            test('reports the exact budget endpoint and retains original segment index', () => {
                const f = fixture(backend, closest, 3);
                expect(f.cast([0, 0, 2, 2, 4], 3)).toBe(true);
                const result = closest ? f.system.lineStripCastClosestResult : f.system.lineStripCastResults[0];
                expect(result.hitPoint.x).toBe(3);
                expect(result.distance).toBe(1);
                expect(result.id).toBe(3);
                expect(f.calls).toEqual([
                    { origin: 0, distance: 2 },
                    { origin: 2, distance: 1 },
                ]);
            });
        });
    }
}
