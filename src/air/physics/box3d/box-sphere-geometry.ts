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
import type { PhysicsMaterial } from '../../../cocos/physics/framework/assets/physics-material';
import { readPhysicsMaterialPrivateValues } from '../../../cocos/physics/framework/physics-material-cache';
import type { Box3DSurfaceMaterial } from './world-binding';
import { copySurfaceMaterial, finiteFloat32, worldError } from './world-binding';
import { unsupportedBox3D } from './unsupported';

export interface Box3DPrimitiveGeometry {
    readonly kind: 'box' | 'sphere' | 'capsule';
    readonly center: readonly number[];
    /** Scaled box half extents, sphere radius, or capsule [radius, halfSegment, direction]. */
    readonly dimensions: readonly number[];
    readonly trigger: boolean;
    readonly material: Readonly<Box3DSurfaceMaterial> | null;
}
export function primitiveMaterial(value: PhysicsMaterial | null): Readonly<Box3DSurfaceMaterial> | null {
    if (value === null) return null;
    const [friction, restitution, rollingFriction, spinningFriction] = readPhysicsMaterialPrivateValues(value);
    const result = copySurfaceMaterial({ friction, restitution });
    if (rollingFriction !== 0 || spinningFriction !== 0) unsupportedBox3D('nonzero rollingFriction/spinningFriction');
    return result;
}
export function primitiveGeometry(
    kind: 'box' | 'sphere' | 'capsule',
    center: readonly number[],
    dimensions: readonly number[],
    scale: readonly number[],
    trigger: boolean,
    material: Readonly<Box3DSurfaceMaterial> | null,
): Box3DPrimitiveGeometry {
    if (typeof trigger !== 'boolean') throw worldError('AIR_E_BOX3D_CONFIG', 'isTrigger', 'Expected boolean.');
    if (center.length !== 3 || scale.length !== 3 || dimensions.length !== (kind === 'sphere' ? 1 : 3))
        throw worldError('AIR_E_BOX3D_CONFIG', 'shape geometry', 'Invalid geometry dimensions.');
    const s = scale.map((v) => finiteFloat32(v, 'shape scale'));
    if (s.some((v) => v <= 0)) unsupportedBox3D('nonpositive initial primitive scale');
    const c = center.map((v, i) => finiteFloat32(finiteFloat32(v, 'center') * s[i], 'scaled center'));
    let d: number[];
    if (kind === 'capsule') {
        const radius = finiteFloat32(dimensions[0], 'capsule radius');
        const height = finiteFloat32(dimensions[1], 'capsule cylinderHeight');
        const direction = dimensions[2];
        if (direction !== 0 && direction !== 1 && direction !== 2)
            throw worldError('AIR_E_BOX3D_CONFIG', 'capsule direction', 'Expected exact axis 0, 1 or 2.');
        if (radius <= 0 || dimensions[1] < 0)
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'capsule geometry',
                'Expected positive radius and nonnegative height.',
            );
        const absoluteScale = s.map(Math.abs);
        const radialScale = Math.max(...absoluteScale.filter((_, i) => i !== direction));
        const scaledRadius = finiteFloat32(radius * radialScale, 'scaled capsule radius');
        const halfSegment = finiteFloat32(height * 0.5 * absoluteScale[direction], 'scaled capsule halfSegment');
        if (scaledRadius <= 0)
            throw worldError('AIR_E_BOX3D_CONFIG', 'capsule radius', 'Scaled radius must remain positive.');
        // Only an explicitly zero height is a sphere. A positive segment may not disappear through F32 rounding.
        if (dimensions[1] > 0 && halfSegment === 0) unsupportedBox3D('positive capsule segment rounded to zero');
        capsuleSegment(c[direction], halfSegment);
        d = [scaledRadius, halfSegment, direction];
    } else {
        d = dimensions.map((v, i) =>
            finiteFloat32(finiteFloat32(v, 'size') * (kind === 'box' ? 0.5 * s[i] : Math.max(...s)), 'scaled size'),
        );
        if (d.some((v) => v <= 0 || (kind === 'box' && v < Math.fround(0.001))))
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'shape geometry',
                'Sphere radius must be positive; box half extents must be at least 0.001m.',
            );
    }
    return Object.freeze({
        kind,
        center: Object.freeze(c),
        dimensions: Object.freeze(d),
        trigger,
        material: material === null ? null : copySurfaceMaterial(material),
    });
}
/** Match the pinned native capsule endpoint/slop preflight, including F32 cancellation at large centers. */
function capsuleSegment(center: number, halfSegment: number): readonly [number, number] {
    if (halfSegment === 0) return [center, center];
    const start = finiteFloat32(center - halfSegment, 'capsule first endpoint');
    const end = finiteFloat32(center + halfSegment, 'capsule second endpoint');
    const distance = finiteFloat32(end - start, 'capsule endpoint distance');
    const lengthSquared = finiteFloat32(distance * distance, 'capsule segment length squared');
    const slop = Math.fround(0.005);
    if (lengthSquared <= Math.fround(slop * slop))
        unsupportedBox3D('positive capsule segment is at or below native linear slop after F32 endpoint rounding');
    return [start, end];
}
/** Analytic primitive bounds from the copied native body-origin transform, not a fake native debug snapshot. */
export function primitiveBounds(value: Box3DPrimitiveGeometry, pose: readonly number[]) {
    if (pose.length !== 10 || pose.some((v) => !Number.isFinite(v)))
        throw worldError(
            'AIR_E_BOX3D_ABI',
            'primitive bounds',
            'Expected copied native origin/rotation/COM transform.',
        );
    const [x, y, z, w] = pose.slice(3, 7);
    const rotation = [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ];
    const localCenter = [...value.center];
    let capsuleHalfSegment = 0;
    if (value.kind === 'capsule') {
        const axis = value.dimensions[2];
        const [start, end] = capsuleSegment(value.center[axis], value.dimensions[1]);
        // Native endpoints are rounded independently. Their actual midpoint may differ from the requested center.
        localCenter[axis] = 0.5 * start + 0.5 * end;
        capsuleHalfSegment = 0.5 * (end - start);
    }
    const center = rotation.map((row, i) => pose[i] + row.reduce((sum, n, j) => sum + n * localCenter[j], 0));
    const halfExtents =
        value.kind === 'sphere'
            ? [value.dimensions[0], value.dimensions[0], value.dimensions[0]]
            : value.kind === 'capsule'
              ? rotation.map((row) => Math.abs(row[value.dimensions[2]]) * capsuleHalfSegment + value.dimensions[0])
              : rotation.map((row) => row.reduce((sum, n, j) => sum + Math.abs(n) * value.dimensions[j], 0));
    const radius =
        value.kind === 'sphere'
            ? value.dimensions[0]
            : value.kind === 'capsule'
              ? value.dimensions[0] + capsuleHalfSegment
              : Math.hypot(...value.dimensions);
    if ([...center, ...halfExtents, radius].some((v) => !Number.isFinite(v)))
        throw worldError('AIR_E_BOX3D_CONFIG', 'primitive bounds', 'Bounds overflow.');
    return { center, halfExtents, radius };
}
