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
import box from '../cocos/primitive/box';
import sphere from '../cocos/primitive/sphere';
import cylinder from '../cocos/primitive/cylinder';
import cone from '../cocos/primitive/cone';
import type { IGeometry } from '../cocos/primitive/define';

interface GeometryChannels { includeNormal?: boolean; includeUV?: boolean; }
export type AirPrimitiveDescriptor =
    | (GeometryChannels & { type: 'box'; width?: number; height?: number; length?: number;
        widthSegments?: number; heightSegments?: number; lengthSegments?: number })
    | (GeometryChannels & { type: 'sphere'; radius?: number; segments?: number })
    | (GeometryChannels & { type: 'cylinder'; radiusTop?: number; radiusBottom?: number; height?: number;
        radialSegments?: number; heightSegments?: number; capped?: boolean; arc?: number })
    | (GeometryChannels & { type: 'cone'; radius?: number; height?: number;
        radialSegments?: number; heightSegments?: number; capped?: boolean; arc?: number });

const fields = {
    box: ['width', 'height', 'length', 'widthSegments', 'heightSegments', 'lengthSegments'],
    sphere: ['radius', 'segments'],
    cylinder: ['radiusTop', 'radiusBottom', 'height', 'radialSegments', 'heightSegments', 'capped', 'arc'],
    cone: ['radius', 'height', 'radialSegments', 'heightSegments', 'capped', 'arc'],
} as const;
function invalid(field: string, reason: string): never {
    const error = new RangeError(`AIR_E_PRIMITIVE_DESCRIPTOR: ${field} ${reason}`);
    Object.assign(error, { code: 'AIR_E_PRIMITIVE_DESCRIPTOR', field });
    throw error;
}
function number(value: unknown, field: string, minimum: number, inclusive = false): void {
    if (value === undefined) return;
    if (typeof value !== 'number' || !Number.isFinite(value) || (inclusive ? value < minimum : value <= minimum)) {
        invalid(field, `must be finite and ${inclusive ? '>=' : '>'} ${minimum}`);
    }
}
function segments(value: unknown, field: string, minimum: number): void {
    number(value, field, minimum, true);
    if (value !== undefined && (!Number.isInteger(value) || (value as number) > 1024)) {
        invalid(field, 'must be an integer no greater than 1024');
    }
}

/** Validate named parameters, then forward to the original geometry functions. Returns geometry, not Mesh. */
export function createPrimitiveGeometry(descriptor: AirPrimitiveDescriptor): IGeometry {
    if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)
        || !Object.prototype.hasOwnProperty.call(fields, descriptor.type)) invalid('type', 'must be box, sphere, cylinder or cone');
    const { type, ...options } = descriptor;
    const allowed: readonly string[] = fields[type];
    for (const field of Object.keys(options)) {
        if (!allowed.includes(field) && field !== 'includeNormal' && field !== 'includeUV') invalid(field, `is not a ${type} parameter`);
    }
    for (const field of ['includeNormal', 'includeUV', 'capped'] as const) {
        const value = (options as Record<string, unknown>)[field];
        if (value !== undefined && typeof value !== 'boolean') invalid(field, 'must be boolean');
    }
    if (type === 'box') {
        const value = descriptor;
        for (const field of ['width', 'height', 'length'] as const) number(value[field], field, 0);
        for (const field of ['widthSegments', 'heightSegments', 'lengthSegments'] as const) segments(value[field], field, 1);
        const x = value.widthSegments ?? 1, y = value.heightSegments ?? 1, z = value.lengthSegments ?? 1;
        if (2 * ((x + 1) * (y + 1) + (x + 1) * (z + 1) + (y + 1) * (z + 1)) > 1_000_000) {
            invalid('segments', 'would exceed 1000000 vertices');
        }
        return box(options);
    }
    if (type === 'sphere') {
        number(descriptor.radius, 'radius', 0); segments(descriptor.segments, 'segments', 3);
        if (((descriptor.segments ?? 32) + 1) ** 2 > 1_000_000) invalid('segments', 'would exceed 1000000 vertices');
        return sphere(descriptor.radius, options);
    }
    number(descriptor.height, 'height', 0);
    segments(descriptor.radialSegments, 'radialSegments', 3);
    segments(descriptor.heightSegments, 'heightSegments', 1);
    number(descriptor.arc, 'arc', 0);
    if (descriptor.arc !== undefined && descriptor.arc > 2 * Math.PI) invalid('arc', 'must not exceed 2 * PI radians');
    const radial = descriptor.radialSegments ?? 32, height = descriptor.heightSegments ?? 1;
    if ((radial + 1) * (height + 1) + 4 * radial + 2 > 1_000_000) invalid('segments', 'would exceed 1000000 vertices');
    if (type === 'cone') {
        number(descriptor.radius, 'radius', 0);
        return cone(descriptor.radius, descriptor.height, options);
    }
    number(descriptor.radiusTop, 'radiusTop', 0, true);
    number(descriptor.radiusBottom, 'radiusBottom', 0, true);
    if ((descriptor.radiusTop ?? 0.5) === 0 && (descriptor.radiusBottom ?? 0.5) === 0) invalid('radius', 'requires at least one positive end radius');
    return cylinder(descriptor.radiusTop, descriptor.radiusBottom, descriptor.height, options);
}
