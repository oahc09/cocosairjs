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
import { copyVector, finiteFloat32, worldError } from './world-binding';

/** Proposed copied primitive contract. No renderer or native implementation is installed here. */
export type Box3DDebugPrimitive =
    | Readonly<{ kind: 'line'; from: readonly number[]; to: readonly number[]; color: number }>
    | Readonly<{ kind: 'bounds'; lower: readonly number[]; upper: readonly number[]; color: number }>;
export interface Box3DDebugSnapshot {
    readonly primitives: readonly Box3DDebugPrimitive[];
    readonly flags: number;
    readonly jointScale: number;
    readonly supportedFlags: number;
}
export function validateDebugFlags(value: number): number {
    if (!Number.isInteger(value) || value < 0 || value > 7 || (value & ~7) !== 0)
        throw worldError(
            'AIR_E_BOX3D_UNSUPPORTED',
            'debugDrawFlags',
            'Only wireframe, constraint and AABB bits are defined.',
        );
    return value;
}
export function validateJointScale(value: number): number {
    const result = finiteFloat32(value, 'debugDrawConstraintSize');
    if (value < 0) throw worldError('AIR_E_BOX3D_CONFIG', 'debugDrawConstraintSize', 'Size cannot be negative.');
    return result;
}
/** Validate and own a fresh JS copy; no borrowed native view or unknown primitive is accepted. */
export function copyDebugSnapshot(value: Box3DDebugSnapshot, flags: number, scale: number): Box3DDebugSnapshot {
    if (!value || value.flags !== flags || value.jointScale !== scale || !Array.isArray(value.primitives))
        throw worldError('AIR_E_BOX3D_ABI', 'debugSnapshot', 'Mismatched debug result.');
    const supportedFlags = validateDebugFlags(value.supportedFlags);
    if ((flags & supportedFlags) !== flags)
        throw worldError(
            'AIR_E_BOX3D_UNSUPPORTED',
            'debugSnapshot',
            'Native collector does not support requested flags.',
        );
    const primitives = value.primitives.map((primitive): Box3DDebugPrimitive => {
        if (!primitive || !Number.isInteger(primitive.color) || primitive.color < 0 || primitive.color > 0xffffffff)
            throw worldError('AIR_E_BOX3D_ABI', 'debugSnapshot', 'Invalid primitive color.');
        if (primitive.kind === 'line')
            return Object.freeze({
                kind: 'line',
                color: primitive.color,
                from: copyVector(primitive.from, 'debug.line.from'),
                to: copyVector(primitive.to, 'debug.line.to'),
            });
        if (primitive.kind === 'bounds') {
            const lower = copyVector(primitive.lower, 'debug.bounds.lower');
            const upper = copyVector(primitive.upper, 'debug.bounds.upper');
            if (lower.some((v, i) => v > upper[i]))
                throw worldError('AIR_E_BOX3D_ABI', 'debugSnapshot', 'Inverted bounds.');
            return Object.freeze({ kind: 'bounds', color: primitive.color, lower, upper });
        }
        throw worldError('AIR_E_BOX3D_UNSUPPORTED', 'debugSnapshot', 'Unqualified native primitive variant.');
    });
    if (!flags && primitives.length)
        throw worldError('AIR_E_BOX3D_ABI', 'debugSnapshot', 'Disabled drawing returned primitives.');
    return Object.freeze({ primitives: Object.freeze(primitives), flags, jointScale: scale, supportedFlags });
}
