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
    readonly kind: 'box' | 'sphere';
    readonly center: readonly number[];
    /** Box half extents, or one sphere radius, already transformed by initial Node scale. */
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
    kind: 'box' | 'sphere',
    center: readonly number[],
    dimensions: readonly number[],
    scale: readonly number[],
    trigger: boolean,
    material: Readonly<Box3DSurfaceMaterial> | null,
): Box3DPrimitiveGeometry {
    if (typeof trigger !== 'boolean') throw worldError('AIR_E_BOX3D_CONFIG', 'isTrigger', 'Expected boolean.');
    if (center.length !== 3 || scale.length !== 3 || dimensions.length !== (kind === 'box' ? 3 : 1))
        throw worldError('AIR_E_BOX3D_CONFIG', 'shape geometry', 'Invalid geometry dimensions.');
    const s = scale.map((v) => finiteFloat32(v, 'shape scale'));
    if (s.some((v) => v <= 0)) unsupportedBox3D('nonpositive initial primitive scale');
    const c = center.map((v, i) => finiteFloat32(finiteFloat32(v, 'center') * s[i], 'scaled center'));
    const d = dimensions.map((v, i) =>
        finiteFloat32(finiteFloat32(v, 'size') * (kind === 'box' ? 0.5 * s[i] : Math.max(...s)), 'scaled size'),
    );
    if (d.some((v) => v <= 0 || (kind === 'box' && v < Math.fround(0.001))))
        throw worldError(
            'AIR_E_BOX3D_CONFIG',
            'shape geometry',
            'Sphere radius must be positive; box half extents must be at least 0.001m.',
        );
    return Object.freeze({
        kind,
        center: Object.freeze(c),
        dimensions: Object.freeze(d),
        trigger,
        material: material === null ? null : copySurfaceMaterial(material),
    });
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
    const center = rotation.map((row, i) => pose[i] + row.reduce((sum, n, j) => sum + n * value.center[j], 0));
    const halfExtents =
        value.kind === 'sphere'
            ? [value.dimensions[0], value.dimensions[0], value.dimensions[0]]
            : rotation.map((row) => row.reduce((sum, n, j) => sum + Math.abs(n) * value.dimensions[j], 0));
    const radius = value.kind === 'sphere' ? value.dimensions[0] : Math.hypot(...value.dimensions);
    if ([...center, ...halfExtents, radius].some((v) => !Number.isFinite(v)))
        throw worldError('AIR_E_BOX3D_CONFIG', 'primitive bounds', 'Bounds overflow.');
    return { center, halfExtents, radius };
}
