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
}

const degrees = 180 / Math.PI;
const epsilon = 1e-5;

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
    // The pinned editor adjusts once rather than canonicalizing a multi-turn key.
    const diff = heading - rotation - shearX;
    const delta = diff > 180 ? diff - 360 : diff <= -180 ? diff + 360 : diff;
    const baseLength = length*sx;
    const distance = inherit === 'noScale' || inherit === 'noScaleOrReflection'
        ? Math.hypot(worldX,worldY) : Math.hypot(...aim);
    const resize = baseLength > epsilon && ((options.compress && distance < baseLength) ||
        (options.stretch && distance > baseLength));
    const factor = resize ? 1 + (distance/baseLength-1)*options.mix : 1;
    const cross = options.scaleY === 'uniform' ? factor : options.scaleY === 'volume'
        ? 1/(factor < 0.7 ? 0.25 + (0.642857 * factor) : factor) : 1;
    return [x,y,rotation+options.mix*delta,sx*factor,sy*cross];
}
