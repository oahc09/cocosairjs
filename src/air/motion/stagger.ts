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

export interface AirMotionGrid {
    readonly columns: number;
    readonly rows: number;
    readonly layers?: number;
    readonly step: number;
    readonly from?: 'start' | 'center' | 'end' | 'random';
    readonly seed?: number;
}

/** Row-major 2D or 3D grid offsets in seconds. Coincident distances move together. */
export function createAirMotionStagger({
    columns,
    rows,
    layers = 1,
    step,
    from = 'start',
    seed = 0,
}: AirMotionGrid): readonly number[] {
    const total = columns * rows * layers;
    if (
        ![columns, rows, layers].every((n) => Number.isSafeInteger(n) && n > 0) ||
        total > 16384 ||
        !Number.isFinite(step * total) ||
        step < 0 ||
        !Number.isInteger(seed) ||
        seed < 0 ||
        seed > 0xffffffff ||
        !['start', 'center', 'end', 'random'].includes(from)
    ) {
        throw new RangeError('Invalid motion stagger grid');
    }
    if (from === 'random') {
        // A local 32-bit PRNG and Fisher–Yates permutation. No mutation of global random state.
        let state = seed >>> 0;
        const ranks = Array.from({ length: total }, (_, i) => i);
        for (let i = total - 1; i > 0; i--) {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            const j = Math.floor((state / 0x100000000) * (i + 1));
            [ranks[i], ranks[j]] = [ranks[j], ranks[i]];
        }
        return Object.freeze(ranks.map((rank) => rank * step));
    }
    const origin = from === 'center' ? 0.5 : from === 'end' ? 1 : 0;
    let nearest = Infinity;
    const values = Array.from({ length: total }, (_, i) => {
        const distance = Math.hypot(
            (i % columns) - (columns - 1) * origin,
            (Math.floor(i / columns) % rows) - (rows - 1) * origin,
            Math.floor(i / (columns * rows)) - (layers - 1) * origin,
        );
        nearest = Math.min(nearest, distance);
        return distance;
    });
    return Object.freeze(values.map((distance) => (distance - nearest) * step));
}
