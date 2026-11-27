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

import type { AirUIMeshGeometry } from '../ui-mesh';

type Corner = readonly [u: number, v: number, b: number, c: number];
type Projection = readonly [i: number, j: number, k: number, b: number, c: number];
interface Chunk {
    uvs: number[];
    indices: number[];
    points: Projection[];
}
export type Bone2dAtlasCrop = readonly [left: number, bottom: number, right: number, top: number];

/** Clip in source UV space; store each cut as a barycentric projection of its source triangle. */
export function buildBone2dAtlasMesh(
    uvs: readonly number[],
    indices: readonly number[],
    [left, bottom, right, top]: Bone2dAtlasCrop,
): readonly Chunk[] {
    const out: Chunk[] = [];
    const sides = [
        [0, left, 1],
        [0, right, -1],
        [1, bottom, 1],
        [1, top, -1],
    ] as const;
    let chunk: Chunk | undefined;
    const remap = (value: number, min: number, max: number): number =>
        Math.max(0, Math.min(1, (value - min) / (max - min)));
    for (let pos = 0; pos < indices.length; pos += 3) {
        const i = indices[pos],
            j = indices[pos + 1],
            k = indices[pos + 2];
        let polygon: Corner[] = [
            [uvs[i * 2], uvs[i * 2 + 1], 0, 0],
            [uvs[j * 2], uvs[j * 2 + 1], 1, 0],
            [uvs[k * 2], uvs[k * 2 + 1], 0, 1],
        ];
        for (const [axis, limit, sign] of sides) {
            if (!polygon.length) break;
            const next: Corner[] = [];
            let a = polygon[polygon.length - 1];
            let da = (a[axis] - limit) * sign;
            for (const b of polygon) {
                const db = (b[axis] - limit) * sign;
                if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
                    const t = da / (da - db);
                    const lerp = (axis: 0 | 1 | 2 | 3): number => a[axis] + t * (b[axis] - a[axis]);
                    next.push([axis === 0 ? limit : lerp(0), axis === 1 ? limit : lerp(1), lerp(2), lerp(3)]);
                }
                if (db >= 0) next.push(b);
                a = b;
                da = db;
            }
            polygon = next;
        }
        if (polygon.length < 3) continue;
        const fan: number[] = [];
        const a = polygon[0];
        for (let n = 1; n + 1 < polygon.length; n++) {
            const b = polygon[n],
                c = polygon[n + 1];
            // Area in barycentric space, not UV space: a collapsed UV axis can still draw in XY.
            if ((b[2] - a[2]) * (c[3] - a[3]) !== (b[3] - a[3]) * (c[2] - a[2])) fan.push(0, n, n + 1);
        }
        if (!fan.length) continue;
        if (!chunk || chunk.points.length + polygon.length > 1024 || chunk.indices.length + fan.length > 4095) {
            chunk = { uvs: [], indices: [], points: [] };
            out.push(chunk);
        }
        const base = chunk.points.length;
        for (const [u, v, b, c] of polygon) {
            chunk.uvs.push(remap(u, left, right), remap(v, bottom, top));
            chunk.points.push([i * 2, j * 2, k * 2, b, c]);
        }
        for (const index of fan) chunk.indices.push(base + index);
    }
    return out;
}

export function projectBone2dAtlasMesh(
    { uvs, indices, points }: Chunk,
    positions: readonly number[],
): AirUIMeshGeometry {
    const projected: number[] = [];
    for (const [i, j, k, b, c] of points) {
        const x = positions[i],
            y = positions[i + 1];
        projected.push(
            x + b * (positions[j] - x) + c * (positions[k] - x),
            y + b * (positions[j + 1] - y) + c * (positions[k + 1] - y),
        );
    }
    return { positions: projected, uvs, indices };
}
