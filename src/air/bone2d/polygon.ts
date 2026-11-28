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

/** Build a convex perimeter for the convex/inverse mask options. */
export function convexClipOutline(xy: readonly number[]): number[] {
    type Point = [number, number];
    const points: Point[] = [];
    for (let i = 0; i < xy.length; i += 2) points.push([xy[i], xy[i+1]]);
    points.sort(([x, y], [u, v]) => (x - u) || (y - v));
    const unique = points.filter(([x, y], i) => i === 0 || points[i-1][0] !== x || points[i-1][1] !== y);
    function half(path: Point[]): Point[] {
        const chain: Point[] = [];
        for (const p of path) {
            while (chain.length > 1) {
                const [x, y] = chain[chain.length - 1];
                const [u, v] = chain[chain.length - 2];
                if ((x - u) * (p[1] - y) > (y - v) * (p[0] - x)) break;
                chain.pop();
            }
            chain.push(p);
        }
        return chain.slice(0, -1);
    }
    const pack = (vertices: Point[]): number[] => ([] as number[]).concat(...vertices);
    if (unique.length < 3) return pack(unique);
    return pack(half(unique).concat(half(unique.slice().reverse())));
}

export function hasNonCollinearPoints(xy: readonly number[]): boolean {
    let second = 2;
    while (second < xy.length && xy[second] === xy[0] && xy[second + 1] === xy[1]) second += 2;
    if (second === xy.length) return false;
    const ux = xy[second] - xy[0], uy = xy[second + 1] - xy[1];
    for (let i = second + 2; i < xy.length; i += 2) {
        if (ux * (xy[i + 1] - xy[1]) !== uy * (xy[i] - xy[0])) return true;
    }
    return false;
}
