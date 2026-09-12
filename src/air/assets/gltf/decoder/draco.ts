/**
 * Draco adapter. Wraps an official `draco3d` module (`createDecoderModule` result) and maps
 * glTF semantics to Draco attribute ids, producing the shared `DecodedPrimitive` float output.
 * The adapter never leaks Draco objects: every temporary is destroyed after extraction.
 */
import { GLTFError } from '../diagnostics';
import type { DecodedPrimitive, DracoAttributeInfo, GLTFDracoDecoder } from './types';

interface DracoArrayLike { GetValue (index: number): number; }
interface DracoStatusLike { ok (): boolean; code?(): number; }
interface DracoAttributeLike { num_components?(): number; }
interface DracoMeshLike { num_points (): number; num_faces (): number; }
interface DracoBufferLike { Init (data: Int8Array | Uint8Array, length: number): void; }

/** Structural type of the official decoder module (subset actually used). */
export interface DracoDecoderModule {
    Decoder: new () => DracoDecoderLike;
    DecoderBuffer?: new () => DracoBufferLike;
    Mesh: new () => DracoMeshLike;
    DracoFloat32Array: new (size?: number) => DracoArrayLike;
    DracoInt32Array?: new (size?: number) => DracoArrayLike;
    DracoUInt32Array: new (size?: number) => DracoArrayLike;
    TRIANGULAR_MESH?: number;
    /** Emscripten modules release wasm-owned objects through `destroy(obj)`. */
    destroy?(object?: unknown): void;
}
export interface DracoDecoderLike {
    GetEncodedGeometryType (buffer: DracoBufferLike): number;
    DecodeArrayToMesh (data: Int8Array | Uint8Array, length: number, mesh: DracoMeshLike): DracoStatusLike;
    DecodeBufferToMesh (buffer: DracoBufferLike, mesh: DracoMeshLike): DracoStatusLike;
    GetAttributeByUniqueId (mesh: DracoMeshLike, id: number): DracoAttributeLike | null;
    GetAttributeFloatForAllPoints (mesh: DracoMeshLike, attribute: DracoAttributeLike, out: DracoArrayLike): boolean;
    GetAttributeInt32ForAllPoints?(mesh: DracoMeshLike, attribute: DracoAttributeLike, out: DracoArrayLike): boolean;
    GetTrianglesUInt32Array (mesh: DracoMeshLike, out: DracoArrayLike): boolean;
    GetFaceFromMesh? (mesh: DracoMeshLike, face: number, out: DracoArrayLike): boolean;
}

/** Accepts a ready module or a factory (e.g. `draco3d.createDecoderModule({})`). */
export type DracoDecoderProvider = DracoDecoderModule | (() => DracoDecoderModule | Promise<DracoDecoderModule>);

/** Component count per glTF semantic; Draco's own `num_components()` wins when available. */
function semanticComponents (semantic: string): number {
    if (semantic === 'POSITION' || semantic === 'NORMAL') { return 3; }
    if (/^TEXCOORD_\d+$/.test(semantic)) { return 2; }
    return 4;
}

/**
 * Creates a Draco decoder provider for `GLTFLoaderOptions.dracoDecoder`. The module is
 * created on the first Draco primitive and released by `dispose()`.
 */
export function createDracoDecoder (provider: DracoDecoderProvider): GLTFDracoDecoder {
    let modulePromise: Promise<DracoDecoderModule> | undefined;
    let moduleRef: DracoDecoderModule | undefined;
    let decoder: DracoDecoderLike | undefined;
    const init = (): Promise<DracoDecoderModule> => {
        modulePromise = modulePromise ?? Promise.resolve(typeof provider === 'function' ? provider() : provider)
            .then((module) => { moduleRef = module; return module; });
        return modulePromise;
    };
    return {
        async decodePrimitive (data, attributes) {
            const module = await init();
            decoder = decoder ?? new module.Decoder();
            const mesh = new module.Mesh();
            const buffer = module.DecoderBuffer ? new module.DecoderBuffer() : undefined;
            try {
                const bytes = new Int8Array(data);
                // The geometry type must be read before decoding: the buffer is consumed by decode.
                if (buffer) {
                    buffer.Init(bytes, bytes.byteLength);
                    const geometryType = decoder.GetEncodedGeometryType(buffer);
                    if (geometryType !== (module.TRIANGULAR_MESH ?? 1)) {
                        throw new GLTFError('GLTF_DECODE_FAILED', `Draco: unsupported geometry type ${geometryType}`, 'KHR_draco_mesh_compression');
                    }
                }
                const status = buffer
                    ? decoder.DecodeBufferToMesh(buffer, mesh)
                    : decoder.DecodeArrayToMesh(bytes, bytes.byteLength, mesh);
                checkStatus(status, 'decode failed');
                const count = mesh.num_points();
                const result: Record<string, Float32Array | Uint16Array | Uint32Array> = {};
                for (const info of attributes) {
                    result[info.semantic] = readAttribute(module, decoder, mesh, info);
                }
                const faces = mesh.num_faces();
                const primitive: DecodedPrimitive = { attributes: result };
                if (faces > 0) {
                    primitive.indices = readIndices(module, decoder, mesh, count);
                }
                return primitive;
            } finally {
                module.destroy?.(mesh);
                if (buffer) { module.destroy?.(buffer); }
            }
        },
        dispose () {
            if (moduleRef && decoder) { moduleRef.destroy?.(decoder); }
            decoder = undefined;
            modulePromise = undefined;
        },
    };
}

/**
 * Reads the decoded triangle indices. The batched typed-array getter is preferred; builds
 * where it is unavailable fall back to a per-face query (slower, same result).
 */
function readIndices (module: DracoDecoderModule, decoder: DracoDecoderLike, mesh: DracoMeshLike,
    count: number): Uint16Array | Uint32Array {
    const faces = mesh.num_faces();
    const batched = new module.DracoUInt32Array(faces * 3);
    try {
        if (decoder.GetTrianglesUInt32Array(mesh, batched)) {
            return packIndices(readValues(batched, faces * 3), count);
        }
    } finally { module.destroy?.(batched); }
    if (typeof decoder.GetFaceFromMesh !== 'function') {
        throw new GLTFError('GLTF_DECODE_FAILED', 'Draco: no triangle extraction API available', 'KHR_draco_mesh_compression');
    }
    const face = new module.DracoUInt32Array(3);
    const values: number[] = [];
    try {
        for (let i = 0; i < faces; ++i) {
            checkStatus(decoder.GetFaceFromMesh(mesh, i, face), `face ${i} extraction failed`);
            values.push(face.GetValue(0), face.GetValue(1), face.GetValue(2));
        }
    } finally { module.destroy?.(face); }
    return packIndices(values, count);
}
function readValues (out: DracoArrayLike, length: number): number[] {
    const values: number[] = [];
    for (let i = 0; i < length; ++i) { values.push(out.GetValue(i)); }
    return values;
}
function packIndices (values: number[], count: number): Uint16Array | Uint32Array {
    if (!values.every((index) => index < count)) {
        throw new GLTFError('GLTF_DECODE_FAILED', 'Draco: index exceeds decoded vertex count', 'KHR_draco_mesh_compression');
    }
    return values.every((index) => index < 65536) ? new Uint16Array(values) : new Uint32Array(values);
}
function readAttribute (module: DracoDecoderModule, decoder: DracoDecoderLike, mesh: DracoMeshLike,
    info: DracoAttributeInfo): Float32Array {
    const attribute = decoder.GetAttributeByUniqueId(mesh, info.id);
    if (!attribute) {
        throw new GLTFError('GLTF_DECODE_FAILED', `Draco: attribute ${info.semantic} (id ${info.id}) not found`, 'KHR_draco_mesh_compression');
    }
    const components = attribute.num_components?.() || semanticComponents(info.semantic);
    const length = mesh.num_points() * components;
    const values = new Float32Array(length);
    // Joint indices are integers; every other glTF semantic is read as float.
    if (/^JOINTS_\d+$/.test(info.semantic) && typeof decoder.GetAttributeInt32ForAllPoints === 'function'
        && module.DracoInt32Array) {
        const out = new module.DracoInt32Array(length);
        try {
            checkStatus(decoder.GetAttributeInt32ForAllPoints(mesh, attribute, out), `failed to read ${info.semantic}`);
            for (let i = 0; i < length; ++i) { values[i] = out.GetValue(i); }
        } finally { module.destroy?.(out); }
        return values;
    }
    const out = new module.DracoFloat32Array(length);
    try {
        checkStatus(decoder.GetAttributeFloatForAllPoints(mesh, attribute, out), `failed to read ${info.semantic}`);
        for (let i = 0; i < length; ++i) { values[i] = out.GetValue(i); }
    } finally { module.destroy?.(out); }
    return values;
}

function checkStatus (ok: boolean | DracoStatusLike, message: string): void {
    if (typeof ok === 'boolean' ? !ok : !ok.ok()) {
        const code = typeof ok === 'boolean' ? undefined : ok.code?.();
        throw new GLTFError('GLTF_DECODE_FAILED', `Draco: ${message}${code === undefined ? '' : ` (status ${code})`}`, 'KHR_draco_mesh_compression');
    }
}
