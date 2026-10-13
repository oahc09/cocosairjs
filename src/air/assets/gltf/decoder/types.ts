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
    /** Encoded raster mime (png/jpeg/webp/avif) OR the raw sentinel 'image/ktx2-decoded'. */
    mimeType: string;
    /** Required when mimeType === 'image/ktx2-decoded': raw memory image source geometry. */
    width?: number;
    height?: number;
    /** GFX Format numeric enum value for the transcoded pixels. */
    format?: number;
    /** True for compressed block formats, false for raw RGBA. Only meaningful with the raw sentinel. */
    compressed?: boolean;
    /** Concatenated per-mip byte lengths (level 0 first). Empty/undefined means single level. */
    mipmapLevelDataSize?: number[];
}

/** Raw-image sentinel returned by KTX2 transcoding (not a browser-decodable raster). */
export const KTX2_RAW_MIME = 'image/ktx2-decoded';

/** Logical transcode targets, decoupled from any single engine/wasm enum. */
export type KTX2TargetFormat = 'BC7_SRGB' | 'BC7' | 'ETC2_SRGB8_ALPHA8' | 'ETC2_RGBA8' | 'ETC2_SRGB8' | 'ETC2_RGB8' | 'ASTC_4x4_SRGB' | 'ASTC_4x4' | 'RGBA8_SRGB' | 'RGBA8';

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
    /** Transcode a full KTX2 payload (zstd supercompression handled inside the provider).
     *  Choose among supportedFormats (device priority order) and fall back to RGBA8. */
    transcode (data: ArrayBuffer, supportedFormats?: readonly KTX2TargetFormat[]): Promise<DecodedTextureSource>;
    dispose?(): void | Promise<void>;
}
