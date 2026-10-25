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
import type { Collider } from '../../../cocos/physics/framework/components/colliders/collider';
import type { IRaycastOptions } from '../../../cocos/physics/spec/i-physics-world';
import type { Ray } from '../../../cocos/core/geometry/ray';
import { finiteFloat32, worldError } from './world-binding';

export interface Box3DCopiedRay {
    readonly origin: readonly number[];
    readonly translation: readonly number[];
    readonly maxDistance: number;
    readonly options: Readonly<{ group: number; mask: number; queryTrigger: boolean }>;
    readonly empty: boolean;
}
export interface Box3DQueryCollider {
    readonly collider: Collider;
    readonly logicalId: number;
    readonly sourceFace?: (triangle: number) => Readonly<{ submesh: number; primitive: number; flatFace: number }>;
}
export interface Box3DResolvedRayHit extends Omit<Box3DQueryCollider, 'sourceFace'> {
    readonly meshFace?: Readonly<{ submesh: number; primitive: number; flatFace: number }>;
    readonly distance: number;
    readonly fraction: number;
    readonly point: Readonly<{ x: number; y: number; z: number }>;
    readonly normal: Readonly<{ x: number; y: number; z: number }>;
}
const config = (message: string): never => {
    throw worldError('AIR_E_BOX3D_CONFIG', 'ray query', message);
};
const abi = (message: string): never => {
    throw worldError('AIR_E_BOX3D_ABI', 'ray query', message);
};
function filterBits(value: number): number {
    if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff)
        return config('Expected a 32-bit integer bitset.');
    return value >>> 0;
}
function vector(value: { x: number; y: number; z: number }, name: string): number[] {
    if (!value) return config(`Missing ${name}.`);
    const result = [value.x, value.y, value.z];
    if (result.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return config(`Nonfinite ${name}.`);
    return result;
}
/** Copy caller inputs before native use. Normalization never mutates the original ray. */
export function copyBox3DRay(ray: Ray, options: IRaycastOptions): Box3DCopiedRay {
    if (!ray || !options) return config('Expected a ray and query options.');
    const origin = vector(ray.o, 'origin').map((v) => finiteFloat32(v, 'ray origin'));
    const direction = vector(ray.d, 'direction');
    const maxDistance = options.maxDistance;
    const group = filterBits(options.group);
    const mask = filterBits(options.mask);
    const queryTrigger = options.queryTrigger;
    if (
        typeof maxDistance !== 'number' ||
        !Number.isFinite(maxDistance) ||
        maxDistance < 0 ||
        maxDistance === Number.MAX_VALUE
    )
        return config('maxDistance must be finite, nonnegative and below Number.MAX_VALUE.');
    if (typeof queryTrigger !== 'boolean') return config('queryTrigger must be a boolean.');
    // Scaling before hypot also handles large finite non-unit directions without overflow.
    const scale = Math.max(...direction.map(Math.abs));
    let translation = [0, 0, 0];
    if (scale !== 0 && maxDistance !== 0) {
        const scaled = direction.map((v) => v / scale);
        const length = Math.hypot(...scaled);
        translation = scaled.map((v) => finiteFloat32((v / length) * maxDistance, 'ray translation'));
        if (translation.some((v, index) => !Number.isFinite(Math.fround(origin[index] + v))))
            return config('The translated endpoint must remain finite float32.');
    }
    return Object.freeze({
        origin: Object.freeze(origin),
        translation: Object.freeze(translation),
        maxDistance,
        options: Object.freeze({ group, mask, queryTrigger }),
        empty: translation.every((v) => v === 0) || group === 0 || mask === 0,
    });
}
function uint32(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}
function copiedVector(value: unknown, name: string): Readonly<{ x: number; y: number; z: number }> {
    if (!Array.isArray(value) || value.length !== 3 || value.some((v) => typeof v !== 'number' || !Number.isFinite(v)))
        return abi(`Invalid native ${name}.`);
    return Object.freeze({ x: value[0], y: value[1], z: value[2] });
}
/** Resolve only the current world's complete native IDs, deduplicate and sort once for BOTH query APIs. */
export function resolveBox3DRayHits(
    raw: unknown,
    ray: Box3DCopiedRay,
    resolve: (low: number, high: number) => Box3DQueryCollider | undefined,
): readonly Box3DResolvedRayHit[] {
    if (!Array.isArray(raw)) return abi('Expected a complete native ray hit array.');
    const hits = new Map<Collider, Box3DResolvedRayHit & { low: number; high: number }>();
    for (const value of raw) {
        if (!value || typeof value !== 'object') return abi('Invalid native hit.');
        const { shape, fraction } = value;
        if (!shape || !uint32(shape.low) || !uint32(shape.high) || (shape.low === 0 && shape.high === 0))
            return abi('Invalid full native shape identity.');
        if (typeof fraction !== 'number' || !Number.isFinite(fraction) || fraction < 0)
            return abi('Invalid native fraction.');
        // Match native half-open policy defensively; endpoint is never an accepted hit.
        if (fraction >= 1) continue;
        const owner = resolve(shape.low, shape.high);
        if (!owner || !Number.isSafeInteger(owner.logicalId) || owner.logicalId <= 0)
            return abi('Native hit does not map to a current owned collider.');
        const point = copiedVector(value.point, 'point');
        const normal = copiedVector(value.normal, 'normal');
        if (owner.sourceFace && (!Number.isSafeInteger(value.triangleIndex) || value.triangleIndex < 0))
            return abi('Mesh hit has no valid cooked triangle.');
        const meshFace = owner.sourceFace?.(value.triangleIndex);
        const candidate = {
            ...(meshFace ? { meshFace } : {}),
            collider: owner.collider,
            logicalId: owner.logicalId,
            distance: fraction * ray.maxDistance,
            fraction,
            point,
            normal,
            low: shape.low,
            high: shape.high,
        };
        const previous = hits.get(owner.collider);
        if (
            !previous ||
            candidate.fraction < previous.fraction ||
            (candidate.fraction === previous.fraction &&
                (candidate.high < previous.high || (candidate.high === previous.high && candidate.low < previous.low)))
        )
            hits.set(owner.collider, candidate);
    }
    return Object.freeze(
        [...hits.values()]
            .sort((a, b) => a.distance - b.distance || a.logicalId - b.logicalId)
            .map(({ low: _low, high: _high, ...hit }) => Object.freeze(hit)),
    );
}
