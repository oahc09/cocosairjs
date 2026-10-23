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
import type { Mesh } from '../../../cocos/3d/assets/mesh';
import { AttributeName, FormatInfos, FormatType } from '../../../cocos/gfx/base/define';
import type { Box3DSurfaceMaterial } from './world-binding';
import { copySurfaceMaterial, finiteFloat32, worldError } from './world-binding';
import { unsupportedBox3D } from './unsupported';

export interface Box3DHullGeometry {
    readonly kind: 'hull';
    /** Complete immutable body-local XYZ point cloud, not bounds or a substituted primitive. */
    readonly positions: readonly number[];
    readonly trigger: boolean;
    readonly material: Readonly<Box3DSurfaceMaterial> | null;
}

/** Decode IEEE binary16 storage, preserving nonfinite values so the normal geometry check rejects them. */
function decodeHalf(bits: number): number {
    const sign = bits & 0x8000 ? -1 : 1;
    const exponent = (bits >>> 10) & 31;
    const fraction = bits & 1023;
    if (exponent === 31) return fraction ? NaN : sign * Infinity;
    return sign * (exponent === 0 ? 2 ** -14 * (fraction / 1024) : 2 ** (exponent - 15) * (1 + fraction / 1024));
}

/** Read every submesh POSITION stream. Triangle indices and winding do not define a convex point cloud. */
export function copyHullPoints(mesh: Mesh | null): readonly number[] | null {
    if (mesh === null) return null;
    if (!mesh || !mesh.struct || !mesh.struct.primitives.length)
        throw worldError('AIR_E_BOX3D_GEOMETRY', 'hull source', 'Mesh contains no submeshes.');
    const points: number[] = [];
    for (const primitive of mesh.struct.primitives) {
        let bundle: Mesh.IVertexBundle | undefined;
        let attributeIndex = -1;
        for (const index of primitive.vertexBundelIndices) {
            const candidate = mesh.struct.vertexBundles[index];
            if (!candidate) throw worldError('AIR_E_BOX3D_GEOMETRY', 'hull source', 'Missing vertex bundle.');
            const found = candidate.attributes.findIndex((a) => a.name === AttributeName.ATTR_POSITION);
            if (found >= 0) {
                bundle = candidate;
                attributeIndex = found;
                break;
            }
        }
        const format = bundle && FormatInfos[bundle.attributes[attributeIndex].format];
        if (!bundle || !format || format.count !== 3)
            throw worldError('AIR_E_BOX3D_GEOMETRY', 'hull source', 'Every submesh needs an XYZ POSITION stream.');
        const bytes = format.size / format.count;
        if (
            format.isCompressed ||
            ![1, 2, 4].includes(bytes) ||
            ![FormatType.FLOAT, FormatType.INT, FormatType.UINT, FormatType.SNORM, FormatType.UNORM].includes(
                format.type,
            ) ||
            (format.type === FormatType.FLOAT && bytes !== 2 && bytes !== 4)
        )
            unsupportedBox3D('packed or unreadable MeshCollider POSITION format');
        let attributeOffset = 0;
        for (let i = 0; i < attributeIndex; ++i) {
            const preceding = FormatInfos[bundle.attributes[i].format];
            if (!preceding || preceding.isCompressed)
                unsupportedBox3D('packed or unreadable MeshCollider vertex layout');
            attributeOffset += preceding.size;
        }
        const { offset, length, count, stride } = bundle.view;
        const data = mesh.data;
        const end = (count - 1) * stride + attributeOffset + format.size;
        if (
            ![offset, length, count, stride, attributeOffset, end].every((n) => Number.isSafeInteger(n) && n >= 0) ||
            count === 0 ||
            attributeOffset + format.size > stride ||
            end > length ||
            offset + length > data.byteLength
        )
            throw worldError('AIR_E_BOX3D_GEOMETRY', 'hull source', 'POSITION stream exceeds its vertex buffer.');
        // Mesh.readAttribute currently omits data.byteOffset. Use only the actual Mesh data view, not its backing prefix.
        const view = new DataView(data.buffer, data.byteOffset + offset, length);
        const signed = format.type === FormatType.INT || format.type === FormatType.SNORM;
        for (let vertex = 0; vertex < count; ++vertex) {
            for (let axis = 0; axis < 3; ++axis) {
                const at = vertex * stride + attributeOffset + axis * bytes;
                let value: number;
                if (format.type === FormatType.FLOAT)
                    value = bytes === 4 ? view.getFloat32(at, true) : decodeHalf(view.getUint16(at, true));
                else if (bytes === 1) value = signed ? view.getInt8(at) : view.getUint8(at);
                else if (bytes === 2) value = signed ? view.getInt16(at, true) : view.getUint16(at, true);
                else value = signed ? view.getInt32(at, true) : view.getUint32(at, true);
                if (format.type === FormatType.UNORM) value /= 2 ** (8 * bytes) - 1;
                else if (format.type === FormatType.SNORM) value = Math.max(-1, value / (2 ** (8 * bytes - 1) - 1));
                // Do not clamp to core output limits or silently decimate input; native owns those limits.
                points.push(finiteFloat32(value, 'hull POSITION'));
            }
        }
    }
    if (points.length < 12)
        throw worldError('AIR_E_BOX3D_GEOMETRY', 'hull source', 'A volumetric hull needs at least four input points.');
    return Object.freeze(points);
}

export function hullGeometry(
    points: readonly number[] | null,
    convex: boolean,
    center: readonly number[],
    scale: readonly number[],
    trigger: boolean,
    material: Readonly<Box3DSurfaceMaterial> | null,
): Box3DHullGeometry | null {
    if (typeof convex !== 'boolean' || typeof trigger !== 'boolean')
        throw worldError('AIR_E_BOX3D_CONFIG', 'hull flags', 'convex and isTrigger must be exact booleans.');
    if (center.length !== 3 || scale.length !== 3)
        throw worldError('AIR_E_BOX3D_CONFIG', 'hull transform', 'Expected three-component center and scale.');
    const s = scale.map((value) => finiteFloat32(value, 'hull scale'));
    const c = center.map((value) => finiteFloat32(value, 'hull center'));
    // SharedBody retains its current positive-scale/shear admission; this does not claim full C11 mirror support.
    if (s.some((value) => value <= 0)) unsupportedBox3D('nonpositive initial hull scale');
    if (points === null) return null; // Normal component assembly: no fallback/default shape is manufactured.
    if (!convex) unsupportedBox3D('MeshCollider.convex=false triangle mesh geometry');
    if (points.length < 12 || points.length % 3 !== 0)
        throw worldError('AIR_E_BOX3D_GEOMETRY', 'hull points', 'Expected at least four complete XYZ input points.');
    // Collider and body are on the same Node. Node rotation/translation belongs to body origin, not these points.
    // Scale both the source vertex and collider center once; do not add world translation or COM offsets.
    const positions = points.map((value, index) => {
        const axis = index % 3;
        return finiteFloat32((finiteFloat32(value, 'hull POSITION') + c[axis]) * s[axis], 'hull body-local POSITION');
    });
    return Object.freeze({
        kind: 'hull',
        positions: Object.freeze(positions),
        trigger,
        material: material === null ? null : copySurfaceMaterial(material),
    });
}

/** Conservative source-point bounds under the copied native body-origin pose, not a native hull readback. */
export function hullBounds(value: Box3DHullGeometry, pose: readonly number[]) {
    if (pose.length !== 10 || pose.some((v) => !Number.isFinite(v)))
        throw worldError('AIR_E_BOX3D_ABI', 'hull bounds', 'Expected copied native origin/rotation/COM transform.');
    const [x, y, z, w] = pose.slice(3, 7);
    const rotation = [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ];
    const low = [Infinity, Infinity, Infinity],
        high = [-Infinity, -Infinity, -Infinity];
    const points: number[][] = [];
    for (let i = 0; i < value.positions.length; i += 3) {
        const point = rotation.map(
            (row, axis) => pose[axis] + row.reduce((sum, n, j) => sum + n * value.positions[i + j], 0),
        );
        points.push(point);
        for (let axis = 0; axis < 3; ++axis) {
            low[axis] = Math.min(low[axis], point[axis]);
            high[axis] = Math.max(high[axis], point[axis]);
        }
    }
    const center = low.map((v, axis) => 0.5 * v + 0.5 * high[axis]);
    const halfExtents = low.map((v, axis) => 0.5 * (high[axis] - v));
    let radius = 0;
    for (const point of points) radius = Math.max(radius, Math.hypot(...point.map((v, axis) => v - center[axis])));
    if ([...center, ...halfExtents, radius].some((v) => !Number.isFinite(v)))
        throw worldError('AIR_E_BOX3D_CONFIG', 'hull bounds', 'Bounds overflow.');
    return { center, halfExtents, radius };
}
