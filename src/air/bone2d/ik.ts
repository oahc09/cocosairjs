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
import type { Bone2dInheritance, Matrix2D, Shears } from './affine';
import type { Bone2dPose } from './project';

export interface Bone2dAimOptions {
    mix: number;
    scaleY: 'none' | 'uniform' | 'volume';
    compress: boolean;
    stretch: boolean;
    softness: number;
    bendPositive: boolean;
}

const degrees = 180 / Math.PI;
const epsilon = 1e-5;

function blendHeading(rotation: number, heading: number, mix: number): number {
    // The pinned editor adjusts once rather than canonicalizing a multi-turn key.
    const diff = heading - rotation;
    const delta = diff > 180 ? diff - 360 : diff <= -180 ? diff + 360 : diff;
    return rotation + mix * delta;
}

function crossScale(mode: Bone2dAimOptions['scaleY'], factor: number): number {
    if (mode === 'uniform') return factor;
    if (mode === 'volume') return 1 / (factor < 0.7 ? 0.25 + 0.642857 * factor : factor);
    return 1;
}

function vectorInFrame(
    a: number, b: number, c: number, d: number,
    x: number, y: number, originX: number, originY: number,
): [number, number] {
    const determinant = a*d - b*c;
    if (Math.abs(determinant) <= epsilon) return [0,0];
    return [(x*d-y*b)/determinant-originX, (y*a-x*c)/determinant-originY];
}

/** Aim in the editor's local metric, then blend the angular and length deltas. */
export function aimBone2d(
    pose: Bone2dPose, [shearX]: Shears, inherit: Bone2dInheritance, length: number,
    [a,b,c,d,px,py]: Matrix2D, current: Matrix2D, target: Matrix2D, options: Bone2dAimOptions,
): Bone2dPose {
    const [x,y,rotation,sx,sy] = pose;
    const worldX = target[4]-current[4], worldY = target[5]-current[5];
    const parentX = target[4]-px, parentY = target[5]-py;
    let aim: [number, number], reference = 0;
    if (inherit === 'onlyTranslation') {
        aim = [worldX, worldY];
    } else if (inherit === 'noRotationOrReflection') {
        // The editor measures the target in a frame with a retained heading
        // and a positive perpendicular scale, even when the parent is mirrored.
        const across = Math.abs(a*d-b*c)/Math.max(epsilon, a*a+c*c);
        aim = vectorInFrame(a,-c*across,c,a*across,parentX,parentY,x,y);
        reference = Math.atan2(c,a)*degrees;
    } else {
        aim = vectorInFrame(a,b,c,d,parentX,parentY,x,y);
    }
    const heading = Math.atan2(aim[1],aim[0])*degrees + reference + (sx < 0 ? 180 : 0);
    const baseLength = length*sx;
    const distance = inherit === 'noScale' || inherit === 'noScaleOrReflection'
        ? Math.hypot(worldX,worldY) : Math.hypot(...aim);
    const resize = baseLength > epsilon && ((options.compress && distance < baseLength) ||
        (options.stretch && distance > baseLength));
    const factor = resize ? 1 + (distance/baseLength-1)*options.mix : 1;
    return [x, y, blendHeading(rotation, heading - shearX, options.mix), sx * factor, sy * crossScale(options.scaleY, factor)];
}

// Squared radial distance to a point on the ellipse centered at (first, 0),
// written as a quadratic in the cosine of the elbow angle.
function ellipseCosine(first: number, rx: number, ry: number, distance: number): number {
    const aa = rx * rx - ry * ry;
    const bb = 2 * first * rx;
    const cc = first * first + ry * ry;
    const squared = distance * distance;
    const discriminant = bb * bb - 4 * aa * (cc - squared);
    if (aa !== 0 && discriminant >= 0) {
        const q = -(bb + Math.sqrt(discriminant)) / 2;
        const roots = q === 0 ? [0] : [q / aa, (cc - squared) / q];
        // When both ellipse arcs are candidates, match the editor's choice
        // of the intersection whose horizontal endpoint is nearest zero.
        const chosen = roots.reduce((u, v) => Math.abs(first + rx * u) <= Math.abs(first + rx * v) ? u : v);
        if (Math.abs(chosen) <= 1 + 1e-12) return Math.max(-1, Math.min(1, chosen));
    }
    const turning = -bb / (2 * aa);
    const radialSquared = (cosine: number): number => (aa * cosine + bb) * cosine + cc;
    const candidates = Math.abs(turning) <= 1 ? [1, -1, turning] : [1, -1];
    let near = -1, far = 1;
    for (const c of candidates) {
        if (radialSquared(c) < radialSquared(near)) near = c;
        if (radialSquared(c) > radialSquared(far)) far = c;
    }
    return squared <= (radialSquared(near) + radialSquared(far)) / 2 ? near : far;
}

/** Solve in the grandparent's coordinates, preserving signed local scales. */
export function aimBone2dPair(
    upper: Bone2dPose, lower: Bone2dPose, upperShear: Shears, lowerShear: Shears,
    upperLength: number, lowerLength: number, frame: Matrix2D, current: Matrix2D, target: Matrix2D,
    options: Bone2dAimOptions,
): readonly [Bone2dPose, Bone2dPose] {
    const [x, y, angle, sx, sy] = upper;
    const [cx, cy, lowerAngle, csx, csy] = lower;
    const [a, b, c, d, px, py] = frame;
    const uniform = Math.abs(Math.abs(sx) - Math.abs(sy)) <= epsilon;
    const elbowY = uniform && !options.stretch ? cy : 0;
    const inFrame = (wx: number, wy: number): [number, number] => {
        if (Math.abs(a * d - b * c) <= epsilon) return [-x, -y];
        return vectorInFrame(a, b, c, d, wx - px, wy - py, x, y);
    };
    const first = Math.hypot(...inFrame(
        current[4] + current[0] * cx + current[1] * elbowY,
        current[5] + current[2] * cx + current[3] * elbowY,
    ));
    if (first < epsilon) {
        const one = aimBone2d(upper, upperShear, 'normal', upperLength, frame, current, target, {
            ...options, compress: false, scaleY: 'none',
        });
        return [one, [cx, elbowY, 0, csx, csy]];
    }
    const [tx, ty] = inFrame(target[4], target[5]);
    const rawDistance = Math.hypot(tx, ty);
    const heading = Math.atan2(ty, tx);
    const distal = lowerLength * Math.abs(csx);
    const rx = distal * Math.abs(sx), ry = distal * Math.abs(sy);
    const reach = first + rx;
    const width = options.softness * Math.abs(sx) * (Math.abs(csx) + 1) / 2;
    let distance = rawDistance;
    if (width > 0 && distance > reach - width) {
        const taper = Math.max(0, 1 - (distance - reach + width) / (2 * width));
        distance = Math.max(0, reach - width * taper * taper);
    }
    let bendCos = 1, factor = 1;
    if (uniform) {
        if (rx > 0) {
            const cosine = (distance * distance - first * first - rx * rx) / (2 * first * rx);
            bendCos = Math.max(-1, Math.min(1, cosine));
        } else if (distance < first) bendCos = -1;
        if (options.stretch && distance > reach) factor += (distance / reach - 1) * options.mix;
    } else if (rx > 0 || ry > 0) bendCos = ellipseCosine(first, rx, ry, distance);
    const bend = Math.acos(bendCos) * (options.bendPositive ? 1 : -1);
    const endpointX = first + rx * bendCos;
    const endpointY = (uniform ? rx : ry) * (Math.abs(bendCos) === 1 ? 0 : Math.sin(bend));
    const elbow = heading - Math.atan2(endpointY, endpointX);
    const parity = (sx < 0) !== (sy < 0) ? -1 : 1;
    const offset = Math.atan2(elbowY, cx) * parity;
    const upperAim = (elbow - offset) * degrees + (sx < 0 ? 180 : 0);
    const lowerAim = ((bend + offset) * degrees - lowerShear[0]) * parity + (csx < 0 ? 180 : 0);
    return [
        [x, y, blendHeading(angle, upperAim, options.mix), sx * factor, sy * crossScale(options.scaleY, factor)],
        [cx, elbowY, blendHeading(lowerAngle, lowerAim, options.mix), csx, csy],
    ];
}
