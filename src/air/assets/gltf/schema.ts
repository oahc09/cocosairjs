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
/** glTF 2.0 wire types. Unknown extension data is retained, never executed. */
export interface Property { name?: string; extensions?: Record<string, unknown>; extras?: unknown; }
export interface TextureInfo extends Property { index: number; texCoord?: number; scale?: number; strength?: number; }
export interface GLTFMaterial extends Property {
    pbrMetallicRoughness?: { baseColorFactor?: number[]; baseColorTexture?: TextureInfo; metallicFactor?: number;
        roughnessFactor?: number; metallicRoughnessTexture?: TextureInfo; };
    normalTexture?: TextureInfo; occlusionTexture?: TextureInfo; emissiveTexture?: TextureInfo;
    emissiveFactor?: number[]; alphaMode?: string; alphaCutoff?: number; doubleSided?: boolean;
}
export interface Primitive extends Property { attributes: Record<string, number>; indices?: number; material?: number;
    mode?: number; targets?: Record<string, number>[]; }
export interface GLTFNode extends Property { children?: number[]; mesh?: number; skin?: number; camera?: number;
    matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; weights?: number[]; }
export interface Accessor extends Property { bufferView?: number; byteOffset?: number; componentType: number;
    normalized?: boolean; count: number; type: string; min?: number[]; max?: number[];
    sparse?: { count: number; indices: { bufferView: number; byteOffset?: number; componentType: number };
        values: { bufferView: number; byteOffset?: number } }; }
export interface GLTFDocument extends Property {
    asset: { version: string; minVersion?: string }; extensionsRequired?: string[]; extensionsUsed?: string[];
    buffers?: { uri?: string; byteLength: number }[];
    bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; extensions?: Record<string, unknown> }[];
    accessors?: Accessor[];
    images?: (Property & { uri?: string; bufferView?: number; mimeType?: string })[];
    textures?: (Property & { source?: number; sampler?: number })[];
    samplers?: { magFilter?: number; minFilter?: number; wrapS?: number; wrapT?: number }[];
    materials?: GLTFMaterial[];
    meshes?: (Property & { primitives: Primitive[]; weights?: number[] })[];
    nodes?: GLTFNode[];
    skins?: (Property & { joints: number[]; inverseBindMatrices?: number; skeleton?: number })[];
    animations?: (Property & { samplers: { input: number; output: number; interpolation?: string }[];
        channels: { sampler: number; target: { node?: number; path: string } }[] })[];
    scenes?: (Property & { nodes?: number[] })[]; scene?: number; cameras?: unknown[];
}

/**
 * `KHR/EXT_meshopt_compression` bufferView payload. mode/filter are strings in the EXT
 * and KHR_meshopt_compression final schema; the earlier KHR draft also allowed integers.
 */
export interface MeshoptCompressionDef {
    buffer: number;
    byteOffset?: number;
    byteLength: number;
    byteStride: number;
    count: number;
    mode: string | number;
    filter?: string | number;
}

/** `KHR_draco_mesh_compression` primitive payload: attribute semantic → Draco attribute id. */
export interface DracoCompressionDef {
    bufferView: number;
    attributes: Record<string, number>;
}

export function check (condition: unknown, message: string): asserts condition {
    if (!condition) { throw new Error(`[glTF] ${message}`); }
}
export function item<T> (array: readonly T[] | undefined, index: number, label: string): T {
    check(Number.isSafeInteger(index) && index >= 0 && array && index < array.length, `${label}: invalid index ${index}`);
    return array[index];
}
export function integer (value: number, label: string): number {
    check(Number.isSafeInteger(value) && value >= 0, `${label}: expected non-negative integer`);
    return value;
}
