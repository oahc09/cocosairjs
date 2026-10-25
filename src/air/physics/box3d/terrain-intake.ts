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
import type { ITerrainAsset } from '../../../cocos/physics/spec/i-external';
import type { Mesh } from '../../../cocos/3d/assets/mesh';
import { AttributeName, Format, PrimitiveMode } from '../../../cocos/gfx/base/define';
import type { Box3DFoundation } from './binding/facade.mjs';
import type { StaticMeshSource } from './static-mesh-intake';
import { StaticMeshIntakeError } from './static-mesh-intake';
import { staticMeshGeometry } from './static-mesh-resource';
import type { Box3DStaticMeshGeometry } from './static-mesh-resource';
import type { Box3DSurfaceMaterial } from './world-binding';

/** Explicit bounded CPU intake, not a native compressed heightfield or a simplifier. */
export const TERRAIN_MAX_VERTICES = 257 * 257;
const COORDINATE_ERROR_BUDGET = 0.001;
export interface TerrainSource {
    readonly mesh: StaticMeshSource;
    readonly countX: number;
    readonly countZ: number;
    readonly tileSize: number;
    readonly heights: readonly number[];
}
function fail(code: string, detail: string): never {
    throw new StaticMeshIntakeError(code, 'TerrainCollider', detail);
}
function finite(value: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(Math.fround(value)))
        fail('NONFINITE', 'Expected a finite float32-representable value.');
    return value;
}
/** Preserve authored binary64 values until the final cooked-coordinate error check. */
export function copyTerrainVector(value: { x: number; y: number; z: number }): readonly number[] {
    if (!value) fail('STRUCTURE', 'Expected a three-component vector.');
    return Object.freeze([finite(value.x), finite(value.y), finite(value.z)]);
}
function coordinate(value: number): number {
    finite(value);
    const rounded = Math.fround(value);
    if (Math.abs(rounded - value) > COORDINATE_ERROR_BUDGET)
        fail('PRECISION', 'Coordinate float32 error exceeds 0.001m intake budget.');
    return rounded;
}
/** Copies actual TerrainAsset or structural ITerrainAsset; never retain getters or caller-owned samples. */
export function copyTerrainSource(asset: ITerrainAsset | null): TerrainSource | null {
    if (asset === null) return null;
    if (
        !asset ||
        typeof asset.getVertexCountI !== 'function' ||
        typeof asset.getVertexCountJ !== 'function' ||
        typeof asset.getHeight !== 'function'
    )
        fail('STRUCTURE', 'Expected ITerrainAsset sample accessors.');
    // There is no holes schema in ITerrainAsset. Never interpret NaN/sentinels as holes.
    if ('holes' in asset || 'holeMask' in asset || 'materialIndices' in asset)
        fail('HOLES', 'Hole/material-grid extensions are not supported; no samples have been cooked.');
    const countX = asset.getVertexCountI(),
        countZ = asset.getVertexCountJ();
    if (![countX, countZ].every((n) => Number.isSafeInteger(n) && n >= 2))
        fail('STRUCTURE', 'Expected at least two rows and columns.');
    const vertices = countX * countZ,
        triangles = 2 * (countX - 1) * (countZ - 1);
    if (!Number.isSafeInteger(vertices) || vertices > TERRAIN_MAX_VERTICES)
        fail('CAPACITY', `Terrain exceeds the explicit ${TERRAIN_MAX_VERTICES}-vertex intake budget.`);
    const tileSize = finite(asset.tileSize);
    if (tileSize <= 0) fail('SCALE', 'Expected positive tileSize.');
    const positionBytes = vertices * 12,
        indexBytes = triangles * 12;
    const data = new Uint8Array(positionBytes + indexBytes),
        view = new DataView(data.buffer);
    const heights: number[] = [];
    for (let j = 0; j < countZ; ++j)
        for (let i = 0; i < countX; ++i) {
            const offset = (j * countX + i) * 12;
            view.setFloat32(offset, coordinate(i * tileSize), true);
            const height = finite(asset.getHeight(i, j));
            heights.push(height);
            view.setFloat32(offset + 4, coordinate(height), true);
            view.setFloat32(offset + 8, coordinate(j * tileSize), true);
        }
    let offset = positionBytes;
    for (let j = 0; j < countZ - 1; ++j)
        for (let i = 0; i < countX - 1; ++i) {
            const a = j * countX + i,
                b = a + 1,
                c = a + countX,
                d = c + 1;
            for (const index of [a, c, b, d, b, c]) {
                view.setUint32(offset, index, true);
                offset += 4;
            }
        }
    const struct = {
        vertexBundles: [
            {
                view: { offset: 0, length: positionBytes, count: vertices, stride: 12 },
                attributes: [
                    {
                        name: AttributeName.ATTR_POSITION,
                        format: Format.RGB32F,
                        stream: 0,
                        isNormalized: false,
                        isInstanced: false,
                        location: 0,
                    },
                ],
            },
        ],
        primitives: [
            {
                primitiveMode: PrimitiveMode.TRIANGLE_LIST,
                vertexBundelIndices: [0],
                indexView: { offset: positionBytes, length: indexBytes, count: triangles * 3, stride: 4 },
            },
        ],
        // Canonical mesh codec snapshots all structural fields, including this explicit provenance.
        terrainSource: {
            kind: 'heightfield-cooked-static-triangle-mesh',
            countX,
            countZ,
            tileSize,
            heights: Object.freeze(heights),
            diagonal: 'a-c-b,d-b-c',
            holes: 'none',
            version: 1,
        },
    } as unknown as Mesh.IStruct;
    return Object.freeze({
        mesh: Object.freeze({ struct, data }),
        countX,
        countZ,
        tileSize,
        heights: Object.freeze(heights),
    });
}
export function terrainGeometry(
    source: TerrainSource | null,
    center: readonly number[],
    scale: readonly number[],
    trigger: boolean,
    material: Readonly<Box3DSurfaceMaterial> | null,
    identity: Box3DFoundation['identity'],
): Box3DStaticMeshGeometry | null {
    if (scale.length !== 3 || scale.some((n) => !Number.isFinite(n) || Math.fround(n) <= 0))
        fail('SCALE', 'Terrain supports positive nonuniform scale only.');
    if (center.length !== 3) fail('STRUCTURE', 'Expected three center components.');
    center.forEach(finite);
    const geometry = staticMeshGeometry(source?.mesh ?? null, center, scale, trigger, material, identity);
    if (!geometry || !source) return null;
    // No double transform: source stores unscaled points, static mesh intake applies (point+center)*scale.
    for (let n = 0; n < geometry.positions.length; ++n) {
        const vertex = Math.floor(n / 3),
            axis = n % 3;
        const authored =
            axis === 0
                ? (vertex % source.countX) * source.tileSize
                : axis === 1
                  ? source.heights[vertex]
                  : Math.floor(vertex / source.countX) * source.tileSize;
        const exact = (authored + center[axis]) * scale[axis];
        if (Math.abs(exact - geometry.positions[n]) > COORDINATE_ERROR_BUDGET)
            fail('PRECISION', 'Scaled coordinate float32 error exceeds 0.001m intake budget.');
    }
    return Object.freeze({
        ...geometry,
        publicKind: 'terrain',
        provenance: 'heightfield-cooked-static-triangle-mesh',
        terrain: Object.freeze({ countX: source.countX, countZ: source.countZ, tileSize: source.tileSize }),
    });
}
