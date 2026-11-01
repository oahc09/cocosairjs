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
import type { AirPointShape } from './point-shapes';

export function morphError(message: string): never {
    throw new Error(`[AIR_MORPH_FIELD] ${message}`);
}

/** Pure packing step, before allocating any graphics resources. Bounds are per-point center/extent. */
export function packMorphShapes(
    targets: readonly AirPointShape[],
    size: number,
    points: boolean,
    maxTextureSize: number,
    maxGpuBytes: number,
): {
    count: number;
    width: number;
    height: number;
    positions: Float32Array;
    colors: Float32Array;
    envelopes: Float32Array;
    textureBytes: number;
} {
    if (
        !Array.isArray(targets) ||
        !targets.length ||
        !targets[0] ||
        !(targets[0].positions instanceof Float32Array) ||
        !Number.isFinite(Math.fround(size)) ||
        Math.fround(size) <= 0
    )
        morphError('targets and positive float32 size required');
    const count = targets[0].positions.length / 3;
    if (!Number.isInteger(count) || count < 1 || count > 1048576) morphError('point count must be 1..1048576');
    for (const [index, target] of targets.entries()) {
        if (
            !target ||
            !(target.positions instanceof Float32Array) ||
            !(target.colors instanceof Float32Array) ||
            target.positions.length !== count * 3 ||
            target.colors.length !== count * 3 ||
            target.positions.some((v) => !Number.isFinite(v)) ||
            target.colors.some((v) => !Number.isFinite(v) || v < 0)
        ) {
            morphError(`target ${index} requires matching finite positions and nonnegative linear RGB`);
        }
        if (
            target.normals &&
            (!(target.normals instanceof Float32Array) ||
                target.normals.length !== count * 3 ||
                target.normals.some((v) => !Number.isFinite(v)))
        )
            morphError(`target ${index} requires matching finite normals`);
    }
    const texels = count * targets.length;
    if (
        !Number.isInteger(maxTextureSize) ||
        maxTextureSize < 1 ||
        !Number.isSafeInteger(texels) ||
        texels > maxTextureSize ** 2
    )
        morphError('shape atlas exceeds device texture limit');
    const width = Math.min(2048, maxTextureSize, texels),
        height = Math.ceil(texels / width);
    const textureBytes = width * height * 32;
    if (!Number.isSafeInteger(maxGpuBytes) || maxGpuBytes <= 0 || textureBytes + count * 64 > maxGpuBytes)
        morphError('shape textures and instance stream exceed maxGpuBytes');
    const envelopes = new Float32Array(count * 6);
    for (let i = 0; i < count; i++)
        for (let axis = 0; axis < 3; axis++) {
            let lo = Infinity,
                hi = -Infinity;
            for (const target of targets) {
                const position = target.positions[i * 3 + axis];
                lo = Math.min(lo, position);
                hi = Math.max(hi, position);
            }
            const margin = Math.max(points ? size : size / 2, Math.max(Math.abs(lo), Math.abs(hi)) * 1e-6, 1e-6);
            const center = Math.fround((lo + hi) / 2),
                extent = Math.fround((hi - lo + margin * 2) * 1.000001);
            if (!Number.isFinite(center) || !Number.isFinite(extent) || extent <= 0)
                morphError('shape envelope exceeds float32 range');
            envelopes[i * 6 + axis] = center;
            envelopes[i * 6 + axis + 3] = extent;
        }
    const positions = new Float32Array(width * height * 4),
        colors = new Float32Array(width * height * 4);
    targets.forEach((target, shape) => {
        for (let i = 0; i < count; i++) {
            const offset = (shape * count + i) * 4;
            for (let axis = 0; axis < 3; axis++) {
                positions[offset + axis] =
                    (target.positions[i * 3 + axis] - envelopes[i * 6 + axis]) / envelopes[i * 6 + axis + 3];
                colors[offset + axis] = target.colors[i * 3 + axis];
            }
            let nx = target.normals?.[i * 3] ?? 0,
                ny = target.normals?.[i * 3 + 1] ?? 0,
                nz = target.normals?.[i * 3 + 2] ?? 1;
            const divisor = Math.abs(nx) + Math.abs(ny) + Math.abs(nz);
            if (divisor === 0) morphError(`target ${shape} has a zero normal`);
            nx /= divisor;
            ny /= divisor;
            nz /= divisor;
            if (nz < 0) {
                const x = nx;
                nx = (1 - Math.abs(ny)) * (x < 0 ? -1 : 1);
                ny = (1 - Math.abs(x)) * (ny < 0 ? -1 : 1);
            }
            // Octahedral normal occupies the previously unused alpha lanes: no third atlas.
            positions[offset + 3] = nx;
            colors[offset + 3] = ny;
        }
    });
    return { count, width, height, positions, colors, envelopes, textureBytes };
}
