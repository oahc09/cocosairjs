import type { GLTFMaterial, TextureInfo } from '../schema';
import { coreTextureCoordinates, TextureCoordinates } from './texture-slots';

/** Texture slot names shared by feature population and material construction. */
export const TEXTURE_SLOTS = ['baseColor', 'metallicRoughness', 'normal', 'occlusion', 'emissive',
    'specular', 'specularColor'] as const;
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
