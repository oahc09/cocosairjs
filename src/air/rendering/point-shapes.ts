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

/** Flat positions in parent-local units and linear RGB; one ordered record per point. */
export interface AirPointShape {
    readonly positions: Float32Array;
    readonly colors: Float32Array;
    /** Optional unit surface normals. Omitted shapes use a +Z plane normal. */
    readonly normals?: Float32Array;
}

function shapeError(message: string): never {
    throw new Error(`[AIR_POINT_SHAPE] ${message}`);
}

function countCheck(count: number): void {
    if (!Number.isInteger(count) || count < 1 || count > 1048576) shapeError('count must be 1..1048576');
}

function random(seed: number): () => number {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) shapeError('seed must be a uint32');
    let state = seed || 0x9e3779b9;
    return () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return (state >>> 0) / 0x100000000;
    };
}

function pick(cumulative: readonly number[], value: number): number {
    let lo = 0,
        hi = cumulative.length - 1;
    while (lo < hi) {
        const middle = (lo + hi) >>> 1;
        if (value < cumulative[middle]) hi = middle;
        else lo = middle + 1;
    }
    return lo;
}

function linear(byte: number): number {
    const value = byte / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export interface AirImageShapeOptions {
    rgba: Uint8Array | Uint8ClampedArray;
    width: number;
    height: number;
    count: number;
    seed?: number;
    /** Width in local units; height preserves the source aspect ratio. */
    size?: number;
    /** Pixels whose alpha is <= this threshold are excluded. Defaults to zero. */
    alphaThreshold?: number;
}

/** Alpha-weighted sampling. Row zero maps to positive Y; RGB bytes are decoded from sRGB. */
export function sampleAirImageShape(options: AirImageShapeOptions): AirPointShape {
    const { rgba, width, height, count } = options;
    countCheck(count);
    const rng = random(options.seed ?? 1),
        size = options.size ?? 1,
        threshold = options.alphaThreshold ?? 0;
    if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 1 ||
        height < 1 ||
        !Number.isSafeInteger(width * height * 4) ||
        rgba.length !== width * height * 4
    )
        shapeError('invalid RGBA dimensions');
    if (!Number.isFinite(Math.fround(size)) || size <= 0 || !Number.isFinite(Math.fround((size * height) / width)))
        shapeError('invalid image size');
    if (!Number.isInteger(threshold) || threshold < 0 || threshold > 255) shapeError('alphaThreshold must be 0..255');
    const pixels: number[] = [],
        cumulative: number[] = [];
    let total = 0;
    for (let i = 0; i < width * height; i++) {
        const alpha = rgba[i * 4 + 3];
        if (alpha <= threshold) continue;
        pixels.push(i);
        total += alpha;
        cumulative.push(total);
    }
    if (!pixels.length) shapeError('image contains no eligible pixels');
    const positions = new Float32Array(count * 3),
        colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const pixel = pixels[pick(cumulative, rng() * total)];
        positions[i * 3] = (((pixel % width) + rng()) / width - 0.5) * size;
        positions[i * 3 + 1] = ((0.5 - (Math.floor(pixel / width) + rng()) / height) * size * height) / width;
        for (let c = 0; c < 3; c++) colors[i * 3 + c] = linear(rgba[pixel * 4 + c]);
    }
    return { positions, colors };
}

export interface AirTriangleShapeOptions {
    positions: Float32Array;
    normals?: Float32Array;
    indices?: Uint16Array | Uint32Array;
    /** Optional linear RGB per vertex. */
    colors?: Float32Array;
    count: number;
    seed?: number;
}

/** Area-weighted triangle sampling; degenerate faces are skipped, not counted as surface area. */
export function sampleAirTriangleShape(options: AirTriangleShapeOptions): AirPointShape {
    const { positions: source, indices, colors: vertexColors, normals: vertexNormals, count } = options;
    countCheck(count);
    const rng = random(options.seed ?? 1),
        vertices = source.length / 3;
    if (!Number.isInteger(vertices) || vertices < 3 || source.some((v) => !Number.isFinite(v)))
        shapeError('invalid positions');
    if (
        vertexColors &&
        (vertexColors.length !== source.length || vertexColors.some((v) => !Number.isFinite(v) || v < 0))
    )
        shapeError('invalid linear vertex colors');
    if (vertexNormals && (vertexNormals.length !== source.length || vertexNormals.some((v) => !Number.isFinite(v))))
        shapeError('invalid vertex normals');
    const elements = indices?.length ?? vertices;
    if (elements % 3 || !elements) shapeError('triangle element count must be divisible by three');
    if (indices?.some((v) => v >= vertices)) shapeError('triangle index out of range');
    const faces: number[] = [],
        cumulative: number[] = [];
    let total = 0;
    const index = (i: number) => (indices ? indices[i] : i);
    for (let f = 0; f < elements; f += 3) {
        const a = index(f) * 3,
            b = index(f + 1) * 3,
            c = index(f + 2) * 3;
        const ux = source[b] - source[a],
            uy = source[b + 1] - source[a + 1],
            uz = source[b + 2] - source[a + 2];
        const vx = source[c] - source[a],
            vy = source[c + 1] - source[a + 1],
            vz = source[c + 2] - source[a + 2];
        const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
        if (!Number.isFinite(area)) shapeError('non-finite triangle area');
        if (area === 0) continue;
        total += area;
        faces.push(f);
        cumulative.push(total);
    }
    if (!faces.length || !Number.isFinite(total)) shapeError('mesh has no finite non-degenerate surface');
    const positions = new Float32Array(count * 3),
        colors = new Float32Array(count * 3),
        normals = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const face = faces[pick(cumulative, rng() * total)],
            root = Math.sqrt(rng()),
            v = rng();
        const w0 = 1 - root,
            w1 = root * (1 - v),
            w2 = root * v;
        const a = index(face) * 3,
            b = index(face + 1) * 3,
            c = index(face + 2) * 3;
        for (let channel = 0; channel < 3; channel++) {
            positions[i * 3 + channel] = source[a + channel] * w0 + source[b + channel] * w1 + source[c + channel] * w2;
            colors[i * 3 + channel] = vertexColors
                ? vertexColors[a + channel] * w0 + vertexColors[b + channel] * w1 + vertexColors[c + channel] * w2
                : 1;
            normals[i * 3 + channel] = vertexNormals
                ? vertexNormals[a + channel] * w0 + vertexNormals[b + channel] * w1 + vertexNormals[c + channel] * w2
                : 0;
        }
        let length = Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
        if (length < 1e-12) {
            const ux = source[b] - source[a],
                uy = source[b + 1] - source[a + 1],
                uz = source[b + 2] - source[a + 2];
            const vx = source[c] - source[a],
                vy = source[c + 1] - source[a + 1],
                vz = source[c + 2] - source[a + 2];
            const nx = uy * vz - uz * vy,
                ny = uz * vx - ux * vz,
                nz = ux * vy - uy * vx;
            length = Math.hypot(nx, ny, nz);
            normals[i * 3] = nx / length;
            normals[i * 3 + 1] = ny / length;
            normals[i * 3 + 2] = nz / length;
            continue;
        }
        for (let axis = 0; axis < 3; axis++) normals[i * 3 + axis] /= length;
    }
    return { positions, colors, normals };
}
