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
import { AttributeName, FormatInfos, FormatType, PrimitiveMode } from '../../../cocos/gfx/base/define';

export interface StaticMeshCooking {
    readonly weld: false;
    readonly buildAdjacency: true;
    readonly split: 'sah';
    readonly degenerates: 'reject';
    readonly primitiveRestart: 'reject';
}

export interface StaticMeshVersions {
    readonly core: string;
    readonly patch: string;
    readonly mesh: string;
    readonly schema: string;
}

export interface StaticMeshOptions {
    readonly center: readonly number[];
    readonly scale: readonly number[];
    readonly sourceWinding: 'ccw';
    readonly cooking: StaticMeshCooking;
    readonly versions: StaticMeshVersions;
}

export interface StaticMeshKey {
    /** FNV-1a is only a bucket selector, never proof that two meshes are equal. */
    readonly bucketHash: string;
    /** Owned, frozen ordinary array, not a mutable typed-array view. */
    readonly canonicalBytes: readonly number[];
}

export interface StaticMeshIntake {
    readonly kind: 'static-triangle-mesh';
    readonly positions: readonly number[];
    readonly indices: readonly number[];
    /** Indexes the input list before any native BVH reordering, NOT native cooked triangle indices. */
    readonly sourceFaces: readonly Readonly<{ submesh: number; primitive: number; flatFace: number }>[];
    readonly center: readonly number[];
    readonly scale: readonly number[];
    readonly mirrorFlipped: boolean;
    readonly nativeScale: readonly [1, 1, 1];
    readonly key: StaticMeshKey;
}

export class StaticMeshIntakeError extends Error {
    constructor(
        readonly code: string,
        readonly location: string,
        detail: string,
    ) {
        super(`[${code}] ${location}: ${detail}`);
        this.name = 'StaticMeshIntakeError';
    }
}

function fail(code: string, at: string, message: string): never {
    throw new StaticMeshIntakeError(code, at, message);
}

function integer(value: number, at: string, minimum = 0): number {
    if (!Number.isSafeInteger(value) || value < minimum) fail('STRUCTURE', at, 'Expected a safe nonnegative integer.');
    return value;
}

function float32(value: number, at: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(Math.fround(value)))
        fail('NONFINITE', at, 'Expected a finite float32-representable number.');
    return Math.fround(value);
}

function vector(value: readonly number[], at: string): readonly number[] {
    if (!Array.isArray(value) || value.length !== 3) fail('CONFIG', at, 'Expected exactly three components.');
    // Array.from visits holes: sparse input is rejected, not silently copied as a sparse result.
    return Object.freeze(Array.from(value, (n, i) => float32(n, `${at}[${i}]`)));
}

type Snapshot = undefined | null | boolean | number | string | Snapshot[] | { [key: string]: Snapshot };

/** Copy metadata without getters, symbols, sparse arrays, functions or cyclic references. */
function snapshot(value: unknown, at: string, ancestors = new Set<object>()): Snapshot {
    if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'string') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) fail('NONFINITE', at, 'Nonfinite structural metadata.');
        return value;
    }
    if (typeof value !== 'object' || Object.getOwnPropertySymbols(value).length || ancestors.has(value))
        fail('STRUCTURE', at, 'Metadata must be acyclic own data properties without symbols.');
    ancestors.add(value);
    const out: Snapshot[] | { [key: string]: Snapshot } = Array.isArray(value) ? [] : Object.create(null);
    const keys = Object.keys(value);
    if (Array.isArray(value) && (keys.length !== value.length || keys.some((key, i) => key !== String(i))))
        fail('STRUCTURE', at, 'Sparse arrays and extra array properties are unsupported.');
    for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!('value' in descriptor)) fail('STRUCTURE', `${at}.${key}`, 'Accessor metadata is unsupported.');
        (out as { [key: string]: Snapshot })[key] = snapshot(descriptor.value, `${at}.${key}`, ancestors);
    }
    ancestors.delete(value);
    return out;
}

/** Tagged, length-delimited binary encoding. Numbers retain all binary64 bits, including signed zero. */
class CanonicalWriter {
    readonly bytes: number[] = [];
    private readonly numberBytes = new DataView(new ArrayBuffer(8));

    private u32(value: number): void {
        if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff)
            fail('CAPACITY', 'canonical key', 'Length does not fit uint32.');
        for (let shift = 0; shift < 32; shift += 8) this.bytes.push((value >>> shift) & 255);
    }

    write(value: Snapshot): void {
        if (value === undefined) this.bytes.push(0);
        else if (value === null) this.bytes.push(1);
        else if (typeof value === 'boolean') this.bytes.push(value ? 3 : 2);
        else if (typeof value === 'number') {
            this.bytes.push(4);
            this.numberBytes.setFloat64(0, value, true);
            for (let i = 0; i < 8; ++i) this.bytes.push(this.numberBytes.getUint8(i));
        } else if (typeof value === 'string') {
            this.bytes.push(5);
            this.u32(value.length);
            // UTF-16 code units also distinguish unpaired surrogates, with no lossy TextEncoder replacement.
            for (let i = 0; i < value.length; ++i) {
                const code = value.charCodeAt(i);
                this.bytes.push(code & 255, code >>> 8);
            }
        } else if (Array.isArray(value)) {
            this.bytes.push(6);
            this.u32(value.length);
            for (const item of value) this.write(item);
        } else {
            this.bytes.push(7);
            const keys = Object.keys(value).sort();
            this.u32(keys.length);
            for (const key of keys) {
                this.write(key);
                this.write(value[key]);
            }
        }
    }

    source(bytes: Uint8Array): void {
        this.bytes.push(8);
        this.u32(bytes.byteLength);
        for (const byte of bytes) this.bytes.push(byte);
    }
}

export function sameStaticMeshKey(a: StaticMeshKey, b: StaticMeshKey): boolean {
    const x = a.canonicalBytes,
        y = b.canonicalBytes;
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; ++i) if (x[i] !== y[i]) return false;
    return true;
}

function makeKey(metadata: Snapshot, source: Uint8Array): StaticMeshKey {
    const writer = new CanonicalWriter();
    writer.write('box3d-static-mesh-intake/canonical-v1/f32-le');
    writer.write(metadata);
    writer.source(source);
    let hash = 0x811c9dc5;
    for (const byte of writer.bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    return Object.freeze({
        bucketHash: hash.toString(16).padStart(8, '0'),
        canonicalBytes: Object.freeze(writer.bytes),
    });
}

function exactKeys(value: object, keys: string[], at: string): void {
    if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== keys.sort().join(','))
        fail('CONFIG', at, 'Unrecognized or missing option field.');
}

function validateOptions(options: StaticMeshOptions): { center: readonly number[]; scale: readonly number[] } {
    exactKeys(options, ['center', 'scale', 'sourceWinding', 'cooking', 'versions'], 'options');
    const center = vector(options.center, 'center'),
        scale = vector(options.scale, 'scale');
    if (scale.some((n) => n === 0))
        fail('SCALE', 'scale', 'Zero, signed zero, or raw nonzero scale rounded to float32 zero is unsupported.');
    if (options.sourceWinding !== 'ccw')
        fail('WINDING', 'sourceWinding', 'Only the declared Cocos CCW convention is supported.');
    exactKeys(options.cooking, ['weld', 'buildAdjacency', 'split', 'degenerates', 'primitiveRestart'], 'cooking');
    const cook = options.cooking;
    if (
        cook.weld !== false ||
        cook.buildAdjacency !== true ||
        cook.split !== 'sah' ||
        cook.degenerates !== 'reject' ||
        cook.primitiveRestart !== 'reject'
    )
        fail('COOKING', 'cooking', 'This proposal supports only no-weld SAH adjacency with strict rejection.');
    exactKeys(options.versions, ['core', 'patch', 'mesh', 'schema'], 'versions');
    for (const [key, value] of Object.entries(options.versions))
        if (typeof value !== 'string' || !value.trim())
            fail('CONFIG', `versions.${key}`, 'An explicit version is required.');
    return { center, scale };
}

function bufferView(view: Mesh.IBufferView, dataLength: number, at: string): void {
    if (!view || typeof view !== 'object') fail('STRUCTURE', at, 'Missing buffer view.');
    for (const name of ['offset', 'length', 'count', 'stride'] as const) integer(view[name], `${at}.${name}`);
    if (view.count < 1 || view.stride < 1 || view.offset > dataLength || view.length > dataLength - view.offset)
        fail('BOUNDS', at, 'Empty view or byte range outside mesh.data.');
    if (!Number.isSafeInteger(view.count * view.stride))
        fail('BOUNDS', at, 'View arithmetic exceeds integer precision.');
}

function half(bits: number): number {
    const sign = bits & 0x8000 ? -1 : 1,
        exponent = (bits >>> 10) & 31,
        fraction = bits & 1023;
    if (exponent === 31) return fraction ? NaN : sign * Infinity;
    return sign * (exponent === 0 ? (2 ** -14 * fraction) / 1024 : 2 ** (exponent - 15) * (1 + fraction / 1024));
}

interface PositionStream {
    view: Mesh.IBufferView;
    attribute: Mesh.IVertexBundle['attributes'][number];
    offset: number;
}

function positionStream(
    struct: Mesh.IStruct,
    primitive: Mesh.ISubMesh,
    dataLength: number,
    at: string,
): PositionStream {
    if (!Array.isArray(primitive.vertexBundelIndices) || !primitive.vertexBundelIndices.length)
        fail('STRUCTURE', at, 'Submesh has no vertex bundles.');
    let result: PositionStream | undefined;
    let count: number | undefined;
    const seen = new Set<number>();
    for (const index of primitive.vertexBundelIndices) {
        integer(index, `${at}.vertexBundelIndices`);
        if (seen.has(index)) fail('STRUCTURE', at, 'Repeated vertex bundle reference.');
        seen.add(index);
        const bundle = struct.vertexBundles[index],
            where = `${at}.bundle[${index}]`;
        if (!bundle || !Array.isArray(bundle.attributes) || !bundle.attributes.length)
            fail('STRUCTURE', where, 'Missing vertex bundle or attributes.');
        bufferView(bundle.view, dataLength, where);
        if (count !== undefined && count !== bundle.view.count) fail('BOUNDS', where, 'Vertex bundle counts disagree.');
        count = bundle.view.count;
        let offset = 0;
        for (const attribute of bundle.attributes) {
            if (!attribute || typeof attribute.name !== 'string' || !attribute.name)
                fail('STRUCTURE', where, 'Invalid attribute metadata.');
            integer(attribute.format, where);
            integer(attribute.stream, where);
            integer(attribute.location, where);
            if (typeof attribute.isNormalized !== 'boolean' || typeof attribute.isInstanced !== 'boolean')
                fail('STRUCTURE', where, 'Attribute flags must be booleans.');
            if (attribute.isInstanced) fail('FORMAT', where, 'Instanced vertex attributes are unsupported.');
            const info = FormatInfos[attribute.format];
            if (!info || info.isCompressed || !Number.isSafeInteger(info.size) || info.size <= 0)
                fail('FORMAT', where, 'Unknown or compressed vertex layout.');
            if (attribute.name === AttributeName.ATTR_POSITION) {
                if (result) fail('FORMAT', where, 'Ambiguous duplicate POSITION streams.');
                const bytes = info.size / info.count;
                if (
                    info.count !== 3 ||
                    ![1, 2, 4].includes(bytes) ||
                    ![FormatType.FLOAT, FormatType.INT, FormatType.UINT, FormatType.SNORM, FormatType.UNORM].includes(
                        info.type,
                    ) ||
                    (info.type === FormatType.FLOAT && bytes !== 2 && bytes !== 4)
                )
                    fail('FORMAT', where, 'POSITION must be unpacked readable XYZ components.');
                result = { view: bundle.view, attribute, offset };
            }
            offset += info.size;
        }
        const end = (bundle.view.count - 1) * bundle.view.stride + offset;
        if (!Number.isSafeInteger(end) || offset > bundle.view.stride || end > bundle.view.length)
            fail('BOUNDS', where, 'Complete vertex layout exceeds stride or declared view length.');
    }
    if (!result) fail('FORMAT', at, 'Every submesh must provide exactly one XYZ POSITION stream.');
    return result;
}

function readPoints(stream: PositionStream, data: Uint8Array, at: string): number[] {
    const { view, attribute, offset } = stream,
        info = FormatInfos[attribute.format],
        bytes = info.size / 3;
    const source = new DataView(data.buffer, data.byteOffset + view.offset, view.length);
    const signed = info.type === FormatType.INT || info.type === FormatType.SNORM;
    const normalized = attribute.isNormalized || info.type === FormatType.SNORM || info.type === FormatType.UNORM;
    const result: number[] = [];
    for (let vertex = 0; vertex < view.count; ++vertex) {
        for (let axis = 0; axis < 3; ++axis) {
            const p = vertex * view.stride + offset + axis * bytes;
            let n: number;
            if (info.type === FormatType.FLOAT)
                n = bytes === 4 ? source.getFloat32(p, true) : half(source.getUint16(p, true));
            else if (bytes === 1) n = signed ? source.getInt8(p) : source.getUint8(p);
            else if (bytes === 2) n = signed ? source.getInt16(p, true) : source.getUint16(p, true);
            else n = signed ? source.getInt32(p, true) : source.getUint32(p, true);
            if (info.type !== FormatType.FLOAT && normalized)
                n = signed ? Math.max(-1, n / (2 ** (bytes * 8 - 1) - 1)) : n / (2 ** (bytes * 8) - 1);
            result.push(float32(n, `${at}.POSITION[${vertex}][${axis}]`));
        }
    }
    return result;
}

function readElements(primitive: Mesh.ISubMesh, data: Uint8Array, vertexCount: number, at: string): number[] {
    if (primitive.indexView === undefined) return Array.from({ length: vertexCount }, (_, i) => i);
    const view = primitive.indexView;
    bufferView(view, data.byteLength, `${at}.indices`);
    if (![1, 2, 4].includes(view.stride)) fail('INDEX_FORMAT', at, 'Only uint8/uint16/uint32 indices are supported.');
    if (view.count * view.stride > view.length) fail('BOUNDS', at, 'Index count exceeds its declared view length.');
    const source = new DataView(data.buffer, data.byteOffset + view.offset, view.length),
        result: number[] = [];
    const restart = 2 ** (8 * view.stride) - 1;
    for (let i = 0; i < view.count; ++i) {
        const offset = i * view.stride;
        const n =
            view.stride === 1
                ? source.getUint8(offset)
                : view.stride === 2
                  ? source.getUint16(offset, true)
                  : source.getUint32(offset, true);
        if (n === restart)
            fail('PRIMITIVE_RESTART', at, 'The all-ones sentinel is reserved and unsupported, even in lists.');
        if (n >= vertexCount) fail('INDEX_BOUNDS', at, `Index ${n} exceeds POSITION count ${vertexCount}.`);
        result.push(n);
    }
    return result;
}

/** Source geometry uses binary64 area; only the final cooked input receives conservative binary32 arithmetic checks. */
function checkTriangle(points: readonly number[], a: number, b: number, c: number, at: string, cooked: boolean): void {
    if (a === b || b === c || c === a)
        fail('REPEATED_INDEX', at, 'Repeated-index triangles/connectors are unsupported.');
    const f = cooked ? Math.fround : (n: number) => n;
    const u = [0, 1, 2].map((axis) => f(points[b * 3 + axis] - points[a * 3 + axis]));
    const v = [0, 1, 2].map((axis) => f(points[c * 3 + axis] - points[a * 3 + axis]));
    const cross = [
        f(f(u[1] * v[2]) - f(u[2] * v[1])),
        f(f(u[2] * v[0]) - f(u[0] * v[2])),
        f(f(u[0] * v[1]) - f(u[1] * v[0])),
    ];
    const squared = f(f(f(cross[0] * cross[0]) + f(cross[1] * cross[1])) + f(cross[2] * cross[2]));
    if (!Number.isFinite(squared)) fail('NONFINITE', at, 'Triangle arithmetic overflows float32.');
    if (squared === 0) fail('DEGENERATE', at, 'Zero-area or float32-collapsed triangle is unsupported.');
}

/** All-or-nothing pure intake. null means no mesh, never a fallback primitive or a manufactured Hull. */
/** Private copied source used by later center/convex updates. Never holds the mutable authored Mesh. */
export type StaticMeshSource = Readonly<Pick<Mesh, 'struct' | 'data'>>;
export function copyStaticMeshSource(mesh: Mesh | StaticMeshSource | null): StaticMeshSource | null {
    if (mesh === null) return null;
    if (!mesh || !mesh.struct || !(mesh.data instanceof Uint8Array) || !(mesh.data.buffer instanceof ArrayBuffer))
        fail('STRUCTURE', 'mesh', 'Expected CPU Mesh data in a non-shared Uint8Array.');
    const struct = snapshot(mesh.struct, 'struct') as unknown as Mesh.IStruct;
    const data = new Uint8Array(mesh.data.buffer, mesh.data.byteOffset, mesh.data.byteLength).slice();
    return Object.freeze({ struct, data });
}

export function copyStaticMeshIntake(
    mesh: Mesh | StaticMeshSource | null,
    options: StaticMeshOptions,
): StaticMeshIntake | null {
    const optionSnapshot = snapshot(options, 'options') as unknown as StaticMeshOptions;
    const { center, scale } = validateOptions(optionSnapshot);
    if (mesh === null) return null;
    if (!mesh || !mesh.struct || !(mesh.data instanceof Uint8Array) || !(mesh.data.buffer instanceof ArrayBuffer))
        fail('STRUCTURE', 'mesh', 'Expected CPU Mesh data in a non-shared Uint8Array.');
    const struct = snapshot(mesh.struct, 'struct') as unknown as Mesh.IStruct;
    // Copies exactly the Mesh view, including its byteOffset, never the backing-buffer prefix or suffix.
    const source = new Uint8Array(mesh.data.buffer, mesh.data.byteOffset, mesh.data.byteLength).slice();
    if (!Array.isArray(struct.vertexBundles) || !Array.isArray(struct.primitives) || !struct.primitives.length)
        fail('STRUCTURE', 'mesh', 'Mesh must contain vertex bundles and submeshes.');
    // Cocos quantized=true denotes readable half-float attributes, not an additional bounds/scale transform.
    // Attribute formats below already supply the complete scalar interpretation; keep this flag in the key.
    if (struct.encoded || struct.compressed || struct.dynamic || struct.morph || struct.cluster)
        fail('FORMAT', 'mesh', 'Decode/deform/dynamic/clustered source layouts are not supported by this proposal.');
    const positions: number[] = [],
        indices: number[] = [];
    const sourceFaces: { submesh: number; primitive: number; flatFace: number }[] = [];
    // Sign parity, NOT a product, so a tiny determinant cannot underflow away a mirror.
    const mirrorFlipped = scale.filter((n) => n < 0).length % 2 === 1;
    const orientedFaces = new Set<string>();
    for (let submesh = 0; submesh < struct.primitives.length; ++submesh) {
        const primitive = struct.primitives[submesh],
            at = `submesh[${submesh}]`;
        if (
            !primitive ||
            ![PrimitiveMode.TRIANGLE_LIST, PrimitiveMode.TRIANGLE_STRIP, PrimitiveMode.TRIANGLE_FAN].includes(
                primitive.primitiveMode,
            )
        )
            fail('TOPOLOGY', at, 'Only triangle list, strip and fan are supported.');
        if (primitive.cluster) fail('FORMAT', at, 'Clustered submeshes are unsupported.');
        const stream = positionStream(struct, primitive, source.byteLength, at);
        const base = positions.length / 3;
        if (base + stream.view.count > Math.floor(0x7fffffff / 3))
            fail('CAPACITY', at, 'Float count exceeds signed int32.');
        const points = readPoints(stream, source, at);
        const elements = readElements(primitive, source, stream.view.count, at);
        if (
            elements.length < 3 ||
            (primitive.primitiveMode === PrimitiveMode.TRIANGLE_LIST && elements.length % 3 !== 0)
        )
            fail('TOPOLOGY', at, 'Triangle element count is incomplete.');
        const faceCount =
            primitive.primitiveMode === PrimitiveMode.TRIANGLE_LIST ? elements.length / 3 : elements.length - 2;
        if (sourceFaces.length + faceCount > Math.floor((0x7fffffff - 1) / 3))
            fail('CAPACITY', at, 'Index count exceeds signed int32.');
        const baked = points.map((n, i) => float32((n + center[i % 3]) * scale[i % 3], `${at}.body-local POSITION`));
        for (let face = 0; face < faceCount; ++face) {
            let a: number, b: number, c: number;
            if (primitive.primitiveMode === PrimitiveMode.TRIANGLE_LIST)
                [a, b, c] = elements.slice(face * 3, face * 3 + 3);
            else if (primitive.primitiveMode === PrimitiveMode.TRIANGLE_FAN)
                [a, b, c] = [elements[0], elements[face + 1], elements[face + 2]];
            else
                [a, b, c] =
                    face % 2 === 0
                        ? [elements[face], elements[face + 1], elements[face + 2]]
                        : [elements[face + 1], elements[face], elements[face + 2]];
            checkTriangle(points, a, b, c, `${at}.source face[${face}]`, false);
            checkTriangle(baked, a, b, c, `${at}.body-local face[${face}]`, true);
            if (mirrorFlipped) [b, c] = [c, b];
            const triple = [a + base, b + base, c + base],
                minimum = triple.indexOf(Math.min(...triple));
            const oriented = [triple[minimum], triple[(minimum + 1) % 3], triple[(minimum + 2) % 3]].join(',');
            if (orientedFaces.has(oriented))
                fail('DUPLICATE_FACE', at, 'Identical oriented index triples have ambiguous source attribution.');
            orientedFaces.add(oriented);
            indices.push(...triple);
            sourceFaces.push(Object.freeze({ submesh, primitive: face, flatFace: sourceFaces.length }));
        }
        for (const n of baked) positions.push(n);
    }
    const key = makeKey(snapshot({ struct, options: optionSnapshot, center, scale, mirrorFlipped }, 'key'), source);
    return Object.freeze({
        kind: 'static-triangle-mesh',
        positions: Object.freeze(positions),
        indices: Object.freeze(indices),
        sourceFaces: Object.freeze(sourceFaces),
        center,
        scale,
        mirrorFlipped,
        nativeScale: Object.freeze([1, 1, 1] as const),
        key,
    });
}
