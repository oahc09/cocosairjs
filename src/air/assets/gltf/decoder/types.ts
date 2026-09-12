/**
 * Decoder provider contracts. Decoders never ship inside the main bundle: applications
 * configure a provider explicitly via GLTFLoaderOptions / configureGLTFLoaderDefaults.
 * Implementations manage their own workers/WASM and must release them in dispose().
 */
import type { GLTFDocument } from '../schema';

/** Decode result consumed by the shared mesh construction path (float components). */
export interface DecodedPrimitive {
    attributes: Record<string, Float32Array | Uint16Array | Uint32Array>;
    indices?: Uint16Array | Uint32Array;
}

/** Texture payload produced by KTX2 transcoding; consumed like a core image source. */
export interface DecodedTextureSource {
    data: Uint8Array;
    mimeType: string;
}

/** Draco attribute description from the glTF JSON (compressed attribute ids). */
export interface DracoAttributeInfo { semantic: string; id: number; }

export interface GLTFDracoDecoder {
    decodePrimitive (data: ArrayBuffer, attributes: readonly DracoAttributeInfo[], document?: GLTFDocument): Promise<DecodedPrimitive>;
    dispose?(): void | Promise<void>;
}

export interface GLTFMeshoptDecoder {
    /**
     * Official `meshoptimizer` argument order: (count, byteStride, source, mode, filter).
     * mode is 'ATTRIBUTES' | 'TRIANGLES' | 'INDICES'; filter is
     * 'NONE' | 'OCTAHEDRAL' | 'QUATERNION' | 'EXPONENTIAL'.
     */
    decodeGltfBufferAsync (count: number, byteStride: number, source: Uint8Array, mode: string,
        filter?: string): Promise<ArrayBuffer | Uint8Array>;
    dispose?(): void | Promise<void>;
}

export interface GLTFKTX2Transcoder {
    /** Transcoder selects among device-supported compressed formats and falls back to RGBA8. */
    transcode (data: ArrayBuffer, supportedFormats?: readonly string[]): Promise<DecodedTextureSource>;
    dispose?(): void | Promise<void>;
}
