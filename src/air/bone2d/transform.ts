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
import { inheritBasis } from './affine';
import type { Bone2dInheritance, Matrix2D, Shears } from './affine';
import type { Bone2dPose } from './project';

export const transformProperties = ['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearY'] as const;
export type TransformProperty = (typeof transformProperties)[number];
export interface Bone2dTransform {
    kind: 'transform';
    id: string;
    source: string;
    bones: readonly string[];
    skinRequired: boolean;
    localSource: boolean;
    localTarget: boolean;
    additive: boolean;
    clamp: boolean;
    offsets: readonly number[];
    mix: readonly number[];
    mappings: readonly {
        prop: TransformProperty;
        offset: number;
        to: readonly { prop: TransformProperty; offset: number; max: number; scale: number }[];
    }[];
}

export interface AppliedPose {
    pose: Bone2dPose;
    shear: Shears;
}

const rad = Math.PI / 180;
const heading = (x: number, y: number): number => Math.atan2(y, x) / rad;
const wrap = (n: number): number => (n > 180 ? n - 360 : n <= -180 ? n + 360 : n);
const wrapWorld = (n: number): number => (n > 180 ? n - 360 : n < -180 ? n + 360 : n);
const position = (p: TransformProperty): number => transformProperties.indexOf(p);
const localValues = ({ pose: [x, y, r, sx, sy], shear }: AppliedPose): number[] => [r, x, y, sx, sy, shear[1]];

export function transformReadLocal(p: TransformProperty, local: AppliedPose, offsets: readonly number[]): number {
    const i = position(p);
    return localValues(local)[i] + offsets[i];
}

export function transformReadWorld(
    p: TransformProperty,
    [a, b, c, d, x, y]: Matrix2D,
    offset: readonly number[],
): number {
    switch (p) {
        case 'rotate': {
            const rotation = heading(a, c) + (a * d - b * c > 0 ? offset[0] : -offset[0]);
            return rotation < 0 ? rotation + 360 : rotation;
        }
        case 'x':
            return x + a * offset[1] + b * offset[2];
        case 'y':
            return y + c * offset[1] + d * offset[2];
        case 'scaleX':
            return Math.hypot(a, c) + offset[3];
        case 'scaleY':
            return Math.hypot(b, d) + offset[4];
        case 'shearY':
            return heading(b, d) - heading(a, c) - 90 + offset[5];
    }
}

export function transformWriteLocal(
    p: TransformProperty,
    local: AppliedPose,
    value: number,
    mix: number,
    add: boolean,
): AppliedPose {
    const values = localValues(local),
        i = position(p),
        old = values[i];
    const scale = p === 'scaleX' || p === 'scaleY';
    values[i] =
        scale && add
            ? old * (1 + (value - 1) * mix)
            : scale && old === 0
              ? old
              : old + (add ? value : value - old) * mix;
    const [rotation, x, y, sx, sy, shearY] = values;
    return { pose: [x, y, rotation, sx, sy], shear: [local.shear[0], shearY] };
}

export function transformWriteWorld(
    p: TransformProperty,
    m: Matrix2D,
    value: number,
    mix: number,
    add: boolean,
): Matrix2D {
    const [a, b, c, d, x, y] = m;
    switch (p) {
        case 'x':
            return [a, b, c, d, x + (add ? value : value - x) * mix, y];
        case 'y':
            return [a, b, c, d, x, y + (add ? value : value - y) * mix];
        case 'rotate': {
            const r = (add ? wrapWorld(value) : wrapWorld(value - heading(a, c))) * mix * rad;
            const co = Math.cos(r),
                si = Math.sin(r);
            return [a * co - c * si, b * co - d * si, a * si + c * co, b * si + d * co, x, y];
        }
        case 'scaleX':
        case 'scaleY': {
            const horizontal = p === 'scaleX';
            const length = horizontal ? Math.hypot(a, c) : Math.hypot(b, d);
            const scale = add ? 1 + (value - 1) * mix : length === 0 ? 1 : 1 + (value / length - 1) * mix;
            return horizontal ? [a * scale, b, c * scale, d, x, y] : [a, b * scale, c, d * scale, x, y];
        }
        case 'shearY': {
            const by = heading(b, d);
            const turn = add ? value : wrapWorld(value + 90 - (by - heading(a, c)));
            const r = (by + turn * mix) * rad,
                len = Math.hypot(b, d);
            return [a, Math.cos(r) * len, c, Math.sin(r) * len, x, y];
        }
    }
}

type Basis = readonly [number, number, number, number];
const identity: Matrix2D = [1, 0, 0, 1, 0, 0];

function unmap([a, b, c, d]: Basis, x: number, y: number): [number, number] {
    const det = a * d - b * c;
    if (!det || !Number.isFinite(1 / det)) return [0, 0];
    return [(d * x - b * y) / det, (a * y - c * x) / det];
}

/** Recover the authored local representation when a later constraint reads a world edit. */
export function transformApplied(m: Matrix2D, parent: Matrix2D | null, mode: Bone2dInheritance): AppliedPose {
    const p = parent ?? identity;
    const [x, y] = unmap([p[0], p[1], p[2], p[3]], m[4] - p[4], m[5] - p[5]);
    const noScale = parent !== null && (mode === 'noScale' || mode === 'noScaleOrReflection');
    const offset = noScale ? heading(...unmap([p[0], p[1], p[2], p[3]], m[0], m[2])) : 0;
    const rotationless = parent !== null && mode === 'noRotationOrReflection';
    const compass = rotationless ? heading(p[0], p[2]) : 0;
    // Polar readback uses the parent's oriented frame for rotationless
    // inheritance; adding its heading after atan2 preserves the angle branch.
    const along = Math.hypot(p[0], p[2]);
    const across = along > 0 ? Math.abs(p[0] * p[3] - p[1] * p[2]) / (along * along) : 0;
    const basis = rotationless
        ? ([p[0], -p[2] * across, p[2], p[0] * across] as const)
        : parent === null
          ? ([1, 0, 0, 1] as const)
          : inheritBasis(parent, mode, offset, 1, 1, [0, 0]);
    const project = (u: number, v: number): [number, number] =>
        rotationless
            ? [
                  along > 0 ? (p[0] * u + p[2] * v) / (along * along) : 0,
                  across > 0 ? (p[0] * v - p[2] * u) / (along * along * across) : 0,
              ]
            : unmap(basis, u, v);
    const [a, c] = project(m[0], m[2]),
        [b, d] = project(m[1], m[3]);
    const sx = Math.hypot(a, c),
        magY = Math.hypot(b, d);
    const signedY = a * d - b * c < 0 ? -magY : magY;
    const xAngle = sx > 1e-5 ? heading(a, c) : 0;
    // In normalized inheritance the desired heading steers the parent's
    // distorted X; residual axis differences live in the two shear keys.
    if (noScale) {
        const shy = magY > 1e-5 ? wrap(heading(b, d) + (signedY < 0 ? 90 : -90)) : 0;
        return { pose: [x, y, offset, sx > 1e-5 ? sx : 0, signedY], shear: [xAngle, shy] };
    }
    if (sx <= 1e-5) return { pose: [x, y, (magY > 1e-5 ? heading(b, d) - 90 : 0) + compass, 0, magY], shear: [0, 0] };
    const shy = magY > 1e-5 ? wrap(heading(b, d) + (signedY < 0 ? 90 : -90) - xAngle) : 0;
    return { pose: [x, y, xAngle + compass, sx, signedY], shear: [0, shy] };
}
