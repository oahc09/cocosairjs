/** AIR native mesh preflight. Validation is independent of DEBUG and occurs before mutation. */
import { AttributeName, FormatInfos } from '../../gfx';
import type { IDynamicGeometry, ICreateDynamicMeshOptions, IGeometry } from '../../primitive/define';
import type { Mesh } from '../assets/mesh';

export function meshFailure (code: string, message: string, details: Record<string, unknown> = {}): never {
    throw Object.assign(new Error(`[${code}] ${message}`), { code, ...details });
}

export function validateStaticIndices (geometry: IGeometry): void {
    if (!geometry || typeof geometry !== 'object') meshFailure('AIR_E_MESH_GEOMETRY', 'createMesh requires geometry');
    if ('indices16' in geometry || 'indices32' in geometry) meshFailure('AIR_E_MESH_INDEX_KEY', 'createMesh uses indices; dynamic indices16/32 belong to createDynamicMesh/updateSubMesh');
    if (geometry.indices !== undefined) {
        const count = geometry.positions.length / 3;
        if (!Number.isInteger(count)) meshFailure('AIR_E_MESH_ATTRIBUTE', 'positions must contain XYZ triples');
        for (const index of geometry.indices) if (!Number.isSafeInteger(index) || index < 0 || index >= count)
            meshFailure('AIR_E_MESH_INDEX_RANGE', 'index is outside positions', { index, vertexCount: count });
    }
}

export function dynamicOptions (value?: ICreateDynamicMeshOptions): ICreateDynamicMeshOptions {
    const result = value === undefined ? { maxSubMeshes: 1, maxSubMeshVertices: 1024, maxSubMeshIndices: 1024 } : { ...value };
    for (const key of ['maxSubMeshes', 'maxSubMeshVertices', 'maxSubMeshIndices'] as const) {
        if (!Number.isSafeInteger(result[key]) || (key === 'maxSubMeshIndices' ? result[key] < 0 : result[key] <= 0))
            meshFailure('AIR_E_MESH_CAPACITY', `${key} must be a positive safe integer; provide all three capacity fields`, { field: key });
    }
    return result;
}

export function planDynamicUpdate (struct: Mesh.IStruct, bytes: Uint8Array, primitiveIndex: number, value: Partial<IDynamicGeometry>) {
    if (!struct.dynamic) meshFailure('AIR_E_MESH_NOT_DYNAMIC', 'updateSubMesh requires a dynamic mesh', { primitiveIndex });
    if (!Number.isSafeInteger(primitiveIndex) || primitiveIndex < 0 || primitiveIndex >= struct.primitives.length)
        meshFailure('AIR_E_MESH_PRIMITIVE', 'invalid primitiveIndex', { primitiveIndex });
    const channels = dynamicChannels(value), primitive = struct.primitives[primitiveIndex], info = struct.dynamic.info;
    const bundles = primitive.vertexBundelIndices.map(i => struct.vertexBundles[i]);
    if (bundles.some(b => !b || b.attributes.length !== 1)) meshFailure('AIR_E_MESH_LAYOUT', 'dynamic updates require one attribute per stream', { primitiveIndex });
    const position = bundles.find(b => b.attributes[0].name === AttributeName.ATTR_POSITION);
    if (!position) meshFailure('AIR_E_MESH_LAYOUT', 'dynamic mesh has no position stream', { primitiveIndex });
    const vertexCount = value.positions ? value.positions.length / 3 : position.view.count;
    if (vertexCount > info.maxSubMeshVertices) meshFailure('AIR_E_MESH_CAPACITY', 'vertices exceed reserved capacity', { primitiveIndex, requested: vertexCount, capacity: info.maxSubMeshVertices });
    for (const name of channels.keys()) if (!bundles.some(b => b.attributes[0].name === name))
        meshFailure('AIR_E_MESH_ATTRIBUTE', 'attribute was not reserved in this mesh', { primitiveIndex, attribute: name });
    const streams: { stream: number; bundle: Mesh.IVertexBundle; values: Float32Array; count: number }[] = [];
    bundles.forEach((bundle, stream) => {
        const name = bundle.attributes[0].name, values = channels.get(name);
        const count = values ? values.byteLength / bundle.view.stride : bundle.view.count;
        if (!Number.isInteger(count) || (vertexCount !== 0 && count !== vertexCount))
            meshFailure('AIR_E_MESH_ATTRIBUTE_COUNT', 'updated and retained streams must agree with positions', { primitiveIndex, attribute: name, count, vertexCount });
        if (!values) return;
        if (values.byteLength > bundle.view.length || bundle.view.offset + values.byteLength > bytes.byteLength)
            meshFailure('AIR_E_MESH_CAPACITY', 'attribute update exceeds reserved stream bytes', { primitiveIndex, attribute: name });
        streams.push({ stream, bundle, values, count });
    });
    if (value.primitiveMode !== undefined && value.primitiveMode !== primitive.primitiveMode)
        meshFailure('AIR_E_MESH_TOPOLOGY', 'updateSubMesh cannot change the reserved topology', { primitiveIndex });
    const indexView = primitive.indexView, supplied = value.indices16 ?? value.indices32;
    if (!indexView && supplied !== undefined) meshFailure('AIR_E_MESH_INDEX_LAYOUT', 'mesh was created without an index buffer', { primitiveIndex });
    if (indexView && ((value.indices16 && indexView.stride !== 2) || (value.indices32 && indexView.stride !== 4)))
        meshFailure('AIR_E_MESH_INDEX_TYPE', 'index width must match the reserved buffer', { primitiveIndex });
    if (supplied && (supplied.length > info.maxSubMeshIndices || supplied.byteLength > indexView!.length))
        meshFailure('AIR_E_MESH_CAPACITY', 'indices exceed reserved capacity', { primitiveIndex });
    const effectiveIndices = supplied ?? (indexView ? (indexView.stride === 2
        ? new Uint16Array(bytes.buffer, bytes.byteOffset + indexView.offset, indexView.count)
        : new Uint32Array(bytes.buffer, bytes.byteOffset + indexView.offset, indexView.count)) : undefined);
    if (effectiveIndices) for (const index of effectiveIndices) if (index >= vertexCount)
        meshFailure('AIR_E_MESH_INDEX_RANGE', 'updated or retained index outside positions', { primitiveIndex, index, vertexCount });
    return { streams, indices: supplied, vertexCount, primitive };
}

export function dynamicChannels (value: Partial<IDynamicGeometry>): Map<string, Float32Array> {
    if (!value || typeof value !== 'object') meshFailure('AIR_E_MESH_GEOMETRY', 'dynamic geometry must be an object');
    if ('indices' in value) meshFailure('AIR_E_MESH_INDEX_KEY', 'dynamic geometry uses indices16/indices32, not indices');
    const result = new Map<string, Float32Array>();
    const add = (name: string, data: Float32Array, count: number): void => {
        if (!(data instanceof Float32Array) || data.length % count || !data.every(Number.isFinite))
            meshFailure('AIR_E_MESH_ATTRIBUTE', `${name} requires finite Float32Array values in groups of ${count}`, { attribute: name });
        if (result.has(name)) meshFailure('AIR_E_MESH_ATTRIBUTE', `duplicate attribute ${name}`, { attribute: name });
        result.set(name, data);
    };
    for (const [field, name, count] of [
        ['positions', AttributeName.ATTR_POSITION, 3], ['normals', AttributeName.ATTR_NORMAL, 3],
        ['uvs', AttributeName.ATTR_TEX_COORD, 2], ['tangents', AttributeName.ATTR_TANGENT, 4], ['colors', AttributeName.ATTR_COLOR, 4],
    ] as const) if (Object.prototype.hasOwnProperty.call(value, field)) add(name, value[field]!, count);
    for (const custom of value.customAttributes ?? []) {
        const info = FormatInfos[custom.attr?.format];
        if (!custom.attr?.name || !info || info.size !== info.count * 4)
            meshFailure('AIR_E_MESH_ATTRIBUTE', 'custom dynamic attributes require named 32-bit component formats');
        add(custom.attr.name, custom.values, info.count);
    }
    if (value.indices16 !== undefined && !(value.indices16 instanceof Uint16Array)) meshFailure('AIR_E_MESH_INDEX_TYPE', 'indices16 requires Uint16Array');
    if (value.indices32 !== undefined && !(value.indices32 instanceof Uint32Array)) meshFailure('AIR_E_MESH_INDEX_TYPE', 'indices32 requires Uint32Array');
    if (value.indices16 !== undefined && value.indices32 !== undefined) meshFailure('AIR_E_MESH_INDEX_TYPE', 'choose exactly one index width');
    if ((value.minPos === undefined) !== (value.maxPos === undefined)) meshFailure('AIR_E_MESH_BOUNDS', 'provide both minPos and maxPos');
    if (value.minPos && value.maxPos) for (const axis of ['x', 'y', 'z'] as const) {
        if (!Number.isFinite(value.minPos[axis]) || !Number.isFinite(value.maxPos[axis]) || value.minPos[axis] > value.maxPos[axis])
            meshFailure('AIR_E_MESH_BOUNDS', 'bounds must be finite and ordered', { axis });
    }
    return result;
}

export function validateDynamicCreation (geometry: IDynamicGeometry, options: ICreateDynamicMeshOptions, primitiveIndex: number): void {
    const channels = dynamicChannels(geometry);
    if (!channels.has(AttributeName.ATTR_POSITION)) meshFailure('AIR_E_MESH_ATTRIBUTE', 'creation requires positions');
    if (!Number.isSafeInteger(primitiveIndex) || primitiveIndex < 0 || primitiveIndex >= options.maxSubMeshes)
        meshFailure('AIR_E_MESH_PRIMITIVE', 'primitiveIndex is outside maxSubMeshes', { primitiveIndex });
    const count = geometry.positions.length / 3;
    const sizes: Record<string, number> = { [AttributeName.ATTR_POSITION]: 3, [AttributeName.ATTR_NORMAL]: 3,
        [AttributeName.ATTR_TEX_COORD]: 2, [AttributeName.ATTR_TANGENT]: 4, [AttributeName.ATTR_COLOR]: 4 };
    for (const custom of geometry.customAttributes ?? []) sizes[custom.attr.name] = FormatInfos[custom.attr.format].count;
    for (const [name, data] of channels) if (data.length / sizes[name] !== count)
        meshFailure('AIR_E_MESH_ATTRIBUTE_COUNT', 'all initial attributes must have the same vertex count', { attribute: name });
    if (count > options.maxSubMeshVertices) meshFailure('AIR_E_MESH_CAPACITY', 'initial vertices exceed maxSubMeshVertices', { requested: count, capacity: options.maxSubMeshVertices });
    const indices = geometry.indices16 ?? geometry.indices32;
    if (indices && indices.length > options.maxSubMeshIndices) meshFailure('AIR_E_MESH_CAPACITY', 'initial indices exceed maxSubMeshIndices');
    if (indices) for (const index of indices) if (index >= count) meshFailure('AIR_E_MESH_INDEX_RANGE', 'initial index outside positions', { index, vertexCount: count });
    const bytes = options.maxSubMeshes * (options.maxSubMeshVertices * [...channels.keys()].reduce((n, key) => n + sizes[key] * 4, 0)
        + options.maxSubMeshIndices * (geometry.indices32 ? 4 : geometry.indices16 ? 2 : 0) + 4);
    if (!Number.isSafeInteger(bytes) || bytes > 512 * 1024 * 1024) meshFailure('AIR_E_MESH_CAPACITY', 'dynamic reservation exceeds the 512 MiB safety limit', { bytes });
}
