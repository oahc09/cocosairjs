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

export type Matrix2D = readonly [a: number, b: number, c: number, d: number, tx: number, ty: number];
type Basis = readonly [number, number, number, number];
export type Bone2dInheritance = 'normal' | 'onlyTranslation' | 'noRotationOrReflection' | 'noScale' | 'noScaleOrReflection';
export type Shears = readonly [number, number];
const rad = Math.PI / 180;

export function poseBasis(angle: number, sx: number, sy: number, [shx, shy]: Shears): Basis {
    const x = (angle + shx) * rad, y = (angle + shy) * rad;
    return [sx * Math.cos(x), -sy * Math.sin(y), sx * Math.sin(x), sy * Math.cos(y)];
}

export function multiplyBasis([a, b, c, d]: Basis, [e, f, g, h]: Basis): Basis {
    return [a*e+b*g, a*f+b*h, c*e+d*g, c*f+d*h];
}

function basisFromPrincipalAxes(x: number, y: number, along: number, across: number): Basis {
    // A symmetric stretch in the parent's orthonormal frame, with a
    // positive transverse length; the parent's heading/mirror are removed.
    const cross = (along - across) * x * y;
    return [along*x*x + across*y*y, cross, cross, along*y*y + across*x*x];
}

export function inheritBasis(
    [p, q, r, s]: Matrix2D, mode: Bone2dInheritance,
    angle: number, sx: number, sy: number, shear: Shears,
): Basis {
    if (mode === 'onlyTranslation') return poseBasis(angle, sx, sy, shear);
    if (mode === 'normal') return multiplyBasis([p,q,r,s], poseBasis(angle, sx, sy, shear));
    const area = p*s-q*r;
    if (mode === 'noRotationOrReflection') {
        const along = Math.hypot(p,r);
        let stretch: Basis;
        if (along > 1e-5) {
            stretch = basisFromPrincipalAxes(p/along, r/along, along, Math.abs(area)/along);
        } else {
            const transverse = Math.hypot(q,s);
            stretch = transverse === 0 ? [0,0,0,0] : basisFromPrincipalAxes(-q/transverse, s/transverse, transverse, 0);
        }
        return multiplyBasis(stretch, poseBasis(angle, sx, sy, shear));
    }
    // A rotation steers the parent's distorted direction, which is then
    // normalized. Local shear/scale are measured in this unit frame.
    const co = Math.cos(angle * rad), si = Math.sin(angle * rad);
    const dx = p*co+q*si, dy = r*co+s*si;
    const length = Math.hypot(dx,dy);
    if (length === 0) return [0,0,0,0];
    const x = dx/length, y = dy/length;
    const sign = mode === 'noScale' && area < 0 ? -1 : 1;
    return multiplyBasis([x,-y*sign,y,x*sign], poseBasis(0, sx, sy, shear));
}

/** Exact signed two-node factorization: R(outer) · diag(sx,sy) · R(inner). */
export function factorBone2dBasis([a,b,c,d]: Matrix2D): readonly [outer: number, inner: number, sx: number, sy: number] {
    // Identify the plane with C: this map is p*z + q*conj(z).
    const px = (a+d)*0.5, py = (c-b)*0.5, qx = (a-d)*0.5, qy = (c+b)*0.5;
    const rp = Math.hypot(px,py), rq = Math.hypot(qx,qy);
    const argP = rp === 0 ? 0 : Math.atan2(py,px);
    const argQ = rq === 0 ? 0 : Math.atan2(qy,qx);
    return [(argP+argQ)/(2*rad), (argP-argQ)/(2*rad), rp+rq, rp-rq];
}
