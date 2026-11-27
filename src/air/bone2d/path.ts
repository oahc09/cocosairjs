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
import type { Matrix2D } from './affine';

export interface PathState {
    position: number;
    spacing: number;
    mix: readonly number[];
}
export interface PathConstraint extends PathState {
    kind: 'path';
    id: string;
    bones: readonly string[];
    target: string;
    positionMode: 'fixed' | 'percent';
    spacingMode: 'length' | 'fixed' | 'percent' | 'proportional';
    rotateMode: 'tangent' | 'chain' | 'chainScale';
    offsetRotation: number;
    skinRequired: boolean;
}
type Pair = readonly [number, number];
type Cubic = readonly [Pair, Pair, Pair, Pair];
type Station = readonly [x: number, y: number, angle: number];
type Follower = { matrix: Matrix2D; length: number };

const tau = Math.PI * 2;
const epsilon = 1e-5;
const blend = (a: Pair, b: Pair, t: number): Pair => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const angle = (a: Pair, b: Pair): number => Math.atan2(b[1] - a[1], b[0] - a[0]);

function cubicPoint([a, b, c, d]: Cubic, t: number): Station {
    const p = blend(a, b, t),
        q = blend(b, c, t),
        r = blend(c, d, t);
    const left = blend(p, q, t),
        right = blend(q, r, t);
    return [...blend(left, right, t), t < 0.001 ? angle(a, b) : angle(left, right)];
}

function curvesOf(xy: readonly number[], closed: boolean): Cubic[] {
    const count = xy.length / 6;
    const pt = (i: number): Pair => [xy[i], xy[i + 1]];
    return Array.from({ length: closed ? count : count - 1 }, (_, i) => {
        const j = (i + 1) % count;
        // Each node stores incoming handle, anchor, outgoing handle.
        return [pt(i * 6 + 2), pt(i * 6 + 4), pt(j * 6), pt(j * 6 + 2)];
    });
}

function chordTable(curve: Cubic, count: number): number[] {
    let prev = curve[0];
    const cumulative = [0];
    for (let i = 1; i <= count; i++) {
        const [x, y] = cubicPoint(curve, i / count);
        cumulative.push(cumulative[i - 1] + Math.hypot(x - prev[0], y - prev[1]));
        prev = [x, y];
    }
    return cumulative;
}

export function pathSetupLengths(xy: readonly number[], closed: boolean): number[] {
    return curvesOf(xy, closed).map((curve) => chordTable(curve, 64)[64]);
}

function endExtension(curve: Cubic, end: boolean, distance: number): Station {
    const p = curve[end ? 3 : 0];
    const t = end ? angle(curve[2], p) : angle(p, curve[1]);
    return [p[0] + distance * Math.cos(t), p[1] + distance * Math.sin(t), t];
}

function sampleStations(
    curves: readonly Cubic[],
    setupLengths: readonly number[] | null,
    closed: boolean,
): { length: number; at: (station: number) => Station } {
    // The editor uses coarse per-curve distances and a finer within-curve
    // lookup in responsive speed mode. Keeping the two resolutions separate
    // preserves authored timing even when a path is deformed.
    const distances = setupLengths ?? curves.map((curve) => chordTable(curve, 4)[4]);
    const prefix = [0];
    for (const d of distances) prefix.push(prefix[prefix.length - 1] + d);
    const length = prefix[prefix.length - 1];
    const tables = new Map<number, number[]>();
    return {
        length,
        at(station): Station {
            if (length <= 0) return cubicPoint(curves[0], 0);
            let s = station;
            if (closed) s = ((s % length) + length) % length;
            else {
                if (s < 0) return endExtension(curves[0], false, s);
                if (s > length) return endExtension(curves[curves.length - 1], true, s - length);
            }
            let lo = 0,
                hi = curves.length - 1;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (s > prefix[mid + 1]) lo = mid + 1;
                else hi = mid;
            }
            const span = distances[lo];
            let fraction = span > 0 ? Math.max(0, Math.min(1, (s - prefix[lo]) / span)) : 0;
            if (!setupLengths) {
                let table = tables.get(lo);
                if (!table) {
                    table = chordTable(curves[lo], 10);
                    tables.set(lo, table);
                }
                const distance = fraction * table[10];
                let i = 1;
                while (i < 10 && distance > table[i]) i++;
                const delta = table[i] - table[i - 1];
                fraction = (i - 1 + (delta > 0 ? (distance - table[i - 1]) / delta : 0)) / 10;
            }
            return cubicPoint(curves[lo], fraction);
        },
    };
}

/** Evaluate a chain from immutable pre-constraint matrices. */
export function followBone2dPath(
    definition: PathConstraint,
    state: PathState,
    points: readonly number[],
    setupLengths: readonly number[] | null,
    closed: boolean,
    holder: Matrix2D,
    followers: readonly Follower[],
): Matrix2D[] {
    const sampler = sampleStations(curvesOf(points, closed), setupLengths, closed);
    const tangent = definition.rotateMode === 'tangent';
    const stretch = definition.rotateMode === 'chainScale';
    const tip = definition.rotateMode === 'chain' && definition.offsetRotation === 0;
    const [rotate, mixX, mixY] = state.mix;
    const n = tangent ? followers.length - 1 : followers.length;
    const worldLengths = followers.map(({ matrix: m, length }) => length * Math.hypot(m[0], m[2]));
    let distances = Array.from({ length: n }, (_, i) => {
        const rest = followers[i].length,
            live = worldLengths[i];
        if (definition.spacingMode === 'percent') return state.spacing * sampler.length;
        if (definition.spacingMode === 'proportional') return rest < epsilon ? state.spacing : live;
        return rest < epsilon
            ? state.spacing
            : ((definition.spacingMode === 'length' ? Math.max(0, rest + state.spacing) : state.spacing) * live) / rest;
    });
    if (definition.spacingMode === 'proportional') {
        const sum = followers.slice(0, n).reduce((v, f, i) => v + (f.length < epsilon ? 0 : worldLengths[i]), 0);
        const factor = sum > 0 ? (state.spacing * sampler.length) / sum : sampler.length / (n + 1);
        distances = distances.map((d) => d * factor);
    }
    let station = state.position * (definition.positionMode === 'percent' ? sampler.length : 1);
    const samples = [sampler.at(station)];
    for (const distance of distances) {
        station += distance;
        samples.push(sampler.at(station));
    }
    const offset =
        ((definition.offsetRotation * Math.PI) / 180) * (holder[0] * holder[3] - holder[1] * holder[2] > 0 ? 1 : -1);
    let anchor: Pair = [samples[0][0], samples[0][1]];
    return followers.map(({ matrix: [a, b, c, d, x, y], length }, i) => {
        const next = samples[i + 1];
        const px = x + (anchor[0] - x) * mixX,
            py = y + (anchor[1] - y) * mixY;
        const dx = next ? next[0] - anchor[0] : 0,
            dy = next ? next[1] - anchor[1] : 0;
        const base = definition.spacingMode === 'percent' || length >= epsilon ? worldLengths[i] : 0;
        const ratio = stretch && base !== 0 ? 1 + (Math.hypot(dx, dy) / base - 1) * rotate : 1;
        const aim = tangent ? samples[i][2] : distances[i] === 0 ? next[2] : Math.atan2(dy, dx);
        const heading = Math.atan2(c, a);
        if (next) {
            anchor =
                tip && rotate > 0
                    ? [
                          next[0] + (length * Math.hypot(a, c) * Math.cos(aim) - dx) * rotate,
                          next[1] + (length * Math.hypot(a, c) * Math.sin(aim) - dy) * rotate,
                      ]
                    : [next[0], next[1]];
        }
        let turn = aim - heading + (tip ? 0 : offset);
        if (turn > Math.PI) turn -= tau;
        else if (turn < -Math.PI) turn += tau;
        turn *= Math.max(0, rotate);
        const co = Math.cos(turn),
            si = Math.sin(turn);
        return [(co * a - si * c) * ratio, co * b - si * d, (si * a + co * c) * ratio, si * b + co * d, px, py];
    });
}
