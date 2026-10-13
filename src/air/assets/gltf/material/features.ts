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
import type { GLTFMaterial, TextureInfo } from '../schema';
import { coreTextureCoordinates, TextureCoordinates } from './texture-slots';

/** Texture slot names shared by feature population and material construction. */
export const TEXTURE_SLOTS = ['baseColor', 'metallicRoughness', 'normal', 'occlusion', 'emissive',
    'specular', 'specularColor', 'clearcoat', 'clearcoatRoughness', 'clearcoatNormal', 'anisotropy',
    'iridescence', 'iridescenceIor', 'iridescenceThickness', 'bump', 'transmission', 'volumeThickness'] as const;
export type TextureSlotName = (typeof TEXTURE_SLOTS)[number];

/**
 * Normalized material feature state: handlers populate it via extendMaterial and the
 * material builder consumes it, never reading extension objects directly.
 */
export interface GLTFMaterialFeatures {
    readonly index: number;
    readonly source: GLTFMaterial;
    /** Base UV coordinates per texture slot (core texCoord selection, identity transform). */
    readonly uv: Record<TextureSlotName, TextureCoordinates | undefined>;
    /** T5 physical extensions extend this record with normalized scalar/vector features. */
    readonly physical: Record<string, unknown>;
    unlit: boolean;
}

/** Normalized scalar features populated by KHR_materials_* handlers. */
export interface PhysicalScalars {
    /** KHR_materials_emissive_strength: linear multiplier >= 1 applied to emissive. */
    emissiveStrength?: number;
    /** KHR_materials_ior: index of refraction >= 1 (drives dielectric F0). */
    ior?: number;
    /** KHR_materials_specular: strength factor (2x) + optional per-channel RGB color. */
    specular?: { factor0: number; factor1: number; color?: number[] };
    /** KHR_materials_clearcoat: second GGX layer ([0,1] scalars, layer F0 fixed 0.04). */
    clearcoat?: { factor: number; roughness: number; normalScale: number };
    /** KHR_materials_anisotropy: tangent-aligned anisotropic specular ([0,1] strength). */
    anisotropy?: { strength: number; rotation: number };
    /** KHR_materials_iridescence: thin-film layer (factor [0,1], ior [1.3,2.3333], nm range). */
    iridescence?: { factor: number; ior: number; thicknessMin: number; thicknessMax: number };
    /** EXT_materials_bump: derivative-based height perturbation (factor >= 0). */
    bump?: { factor: number };
    /** KHR_materials_transmission: light passing through the opaque background ([0,1], R texture channel). */
    transmission?: { factor: number };
    /** KHR_materials_volume: medium thickness (texture scales [0, max] via G) + attenuation. */
    volume?: { thicknessFactor: number; attenuationDistance: number; attenuationColor: number[] };
    /** KHR_materials_dispersion: Abbe-like dispersion strength (>= 0), refractive splitting. */
    dispersion?: { factor: number };
}

/** Type-narrowing helper for the shared physical record. */
export function physicalScalars (features: GLTFMaterialFeatures): PhysicalScalars {
    return features.physical as PhysicalScalars;
}

/** Slot → TextureInfo mapping shared by feature population, mesh UV checks and material build. */
export function slotTextureInfo (source: GLTFMaterial, slot: TextureSlotName): TextureInfo | undefined {
    switch (slot) {
    case 'baseColor': return source.pbrMetallicRoughness?.baseColorTexture;
    case 'metallicRoughness': return source.pbrMetallicRoughness?.metallicRoughnessTexture;
    case 'normal': return source.normalTexture;
    case 'occlusion': return source.occlusionTexture;
    case 'emissive': return source.emissiveTexture;
    case 'specular': return (source.extensions?.KHR_materials_specular as
        { specularTexture?: TextureInfo } | undefined)?.specularTexture;
    case 'specularColor': return (source.extensions?.KHR_materials_specular as
        { specularColorTexture?: TextureInfo } | undefined)?.specularColorTexture;
    case 'clearcoat': return (source.extensions?.KHR_materials_clearcoat as
        { clearcoatTexture?: TextureInfo } | undefined)?.clearcoatTexture;
    case 'clearcoatRoughness': return (source.extensions?.KHR_materials_clearcoat as
        { clearcoatRoughnessTexture?: TextureInfo } | undefined)?.clearcoatRoughnessTexture;
    case 'clearcoatNormal': return (source.extensions?.KHR_materials_clearcoat as
        { clearcoatNormalTexture?: TextureInfo } | undefined)?.clearcoatNormalTexture;
    case 'anisotropy': return (source.extensions?.KHR_materials_anisotropy as
        { anisotropyTexture?: TextureInfo } | undefined)?.anisotropyTexture;
    case 'iridescence': return (source.extensions?.KHR_materials_iridescence as
        { iridescenceTexture?: TextureInfo } | undefined)?.iridescenceTexture;
    case 'iridescenceIor': return (source.extensions?.KHR_materials_iridescence as
        { iridescenceIorTexture?: TextureInfo } | undefined)?.iridescenceIorTexture;
    case 'iridescenceThickness': return (source.extensions?.KHR_materials_iridescence as
        { iridescenceThicknessTexture?: TextureInfo } | undefined)?.iridescenceThicknessTexture;
    case 'bump': return (source.extensions?.EXT_materials_bump as
        { bumpTexture?: TextureInfo } | undefined)?.bumpTexture;
    case 'transmission': return (source.extensions?.KHR_materials_transmission as
        { transmissionTexture?: TextureInfo } | undefined)?.transmissionTexture;
    case 'volumeThickness': return (source.extensions?.KHR_materials_volume as
        { thicknessTexture?: TextureInfo } | undefined)?.thicknessTexture;
    }
}

/** Core feature state before any extension handler runs. */
export function createMaterialFeatures (index: number, source: GLTFMaterial): GLTFMaterialFeatures {
    const uv = {} as Record<TextureSlotName, TextureCoordinates | undefined>;
    for (const slot of TEXTURE_SLOTS) {
        const info = slotTextureInfo(source, slot);
        uv[slot] = info ? coreTextureCoordinates(info) : undefined;
    }
    return { index, source, uv, physical: {}, unlit: false };
}
