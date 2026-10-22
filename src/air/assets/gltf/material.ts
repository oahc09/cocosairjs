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
import { Material } from '../../../cocos/asset/assets/material';
import { EffectAsset } from '../../../cocos/asset/assets/effect-asset';
import { ImageAsset } from '../../../cocos/asset/assets/image-asset';
import { Texture2D } from '../../../cocos/asset/assets/texture-2d';
import { API, BlendFactor, CullMode, deviceManager } from '../../../cocos/gfx';
import { Vec4 } from '../../../cocos/core/math';
import { MacroRecord } from '../../../cocos/render-scene/core/pass-utils';
import { GLTFParserContext } from './parser-context';
import { check, item } from './schema';
import type { TextureInfo } from './schema';
import { GLTFMaterialFeatures, TEXTURE_SLOTS, TextureSlotName } from './material/features';
import { coreTextureCoordinates } from './material/texture-slots';
import type { PhysicalScalars } from './material/features';
import { gltfPhysicalEffect, needsPhysicalEffect, physicalParams, PHYSICAL_CONSTANT, PHYSICAL_COLOR_CONSTANT, CLEARCOAT_CONSTANT, ANISO_CONSTANT, IRIDESCENCE_CONSTANT, BUMP_CONSTANT, TRANSMISSION_CONSTANT, ATTENUATION_CONSTANT } from './material/physical-effect';
import { transmissionPipelineAvailable } from './material/transmission-capability';
import type { DecodedTextureSource } from './decoder/types';
import { KTX2_RAW_MIME } from './decoder/types';
import { abortError } from './request-policy';
import { SUPPORTED_IMAGE_MIMES, detectImageMime } from './extensions/texture/image-formats';

import { gltfEffect, UV_SLOTS } from './material/standard-effect';
export { gltfEffect } from './material/standard-effect';

export async function loadGLTFTextures (context: GLTFParserContext, textures: Texture2D[], images: ImageAsset[]): Promise<void> {
    const imageCache = new Map<number, ImageAsset>();
    const decodeImage = async (key: number, bytes: Uint8Array, mime: string): Promise<ImageAsset | null> => {
        context.throwIfAborted();
        const cached = imageCache.get(key);
        if (cached) { return cached; }
        const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        try {
            const element = await new Promise<HTMLImageElement | null>((resolve, reject) => {
                const img = new Image();
                const cleanup = (): void => {
                    img.onload = null; img.onerror = null;
                    context.signal?.removeEventListener('abort', aborted);
                };
                const aborted = (): void => {
                    cleanup();
                    // Stop native image loading where supported; a queued old event cannot
                    // construct an ImageAsset after this promise has rejected.
                    img.src = ''; reject(abortError());
                };
                img.onload = (): void => { cleanup(); resolve(img); };
                img.onerror = (): void => { cleanup(); resolve(null); };
                context.signal?.addEventListener('abort', aborted, { once: true });
                if (context.signal?.aborted) { aborted(); } else { img.src = url; }
            });
            context.throwIfAborted();
            if (!element) { return null; }
            const image = new ImageAsset(element); images.push(image); imageCache.set(key, image);
            return image;
        } finally { URL.revokeObjectURL(url); }
    };
    // Mimes whose native decoding failed this parse; later textures fall back immediately.
    const brokenMimes = new Set<string>();
    for (const [index, source] of (context.json.textures || []).entries()) {
        context.throwIfAborted();
        let image: ImageAsset | undefined;
        // Candidate order: extension sources (handler-provided, e.g. WebP/AVIF) before core.
        let decoded: DecodedTextureSource | undefined;
        for (const handler of context.handlers) {
            decoded = await context.wait(() => handler.resolveTextureSource?.(index, context)) ?? undefined;
            if (decoded) { break; }
        }
        const candidates: Array<{ label: string; cacheKey: number; mime: string; declaredMime?: string; bytes: () => Promise<Uint8Array | null> }> = [];
        if (decoded) {
            if (decoded.mimeType === KTX2_RAW_MIME) {
                // Raw transcode result: build the memory image source directly (no browser decode).
                const imageAsset = new ImageAsset({
                    _data: decoded.data,
                    _compressed: decoded.compressed ?? false,
                    width: decoded.width!,
                    height: decoded.height!,
                    format: decoded.format!,
                    mipmapLevelDataSize: decoded.mipmapLevelDataSize ?? [],
                });
                imageAsset._uuid = `air-gltf-ktx2-${index}`;
                images.push(imageAsset);
                image = imageAsset;
            } else if (SUPPORTED_IMAGE_MIMES.includes(decoded.mimeType)) {
                candidates.push({ label: 'extension', cacheKey: -1 - index, mime: decoded.mimeType, bytes: async () => decoded!.data });
            } else {
                throw new Error(`[glTF] texture ${index}: unsupported decoded source '${decoded.mimeType}'`);
            }
        }
        if (source.source !== undefined) {
            const imageSource = item(context.json.images, source.source, 'image');
            candidates.push({ label: 'core', cacheKey: source.source, mime: '', declaredMime: imageSource.mimeType, bytes: async () => {
                if (imageCache.has(source.source!)) { return null; }
                check((imageSource.uri !== undefined) !== (imageSource.bufferView !== undefined), 'image requires exactly one URI/bufferView');
                return imageSource.uri !== undefined ? new Uint8Array(await context.request(imageSource.uri)) : context.bufferView(imageSource.bufferView!);
            } });
        }
        if (!image) {
        if (!candidates.length) { throw new Error(`[glTF] texture ${index}: no image source`); }
        for (const candidate of candidates) {
            if (imageCache.has(candidate.cacheKey)) { image = imageCache.get(candidate.cacheKey); break; }
            let bytes: Uint8Array | null = await context.wait(candidate.bytes);
            if (!bytes) { continue; } // core source already cached
            let mime = candidate.mime;
            if (!mime) {
                mime = detectImageMime(bytes) || '';
                check(!!mime, `texture ${index}: unsupported core image encoding (only PNG/JPEG/WebP/AVIF)`);
                check(!candidate.declaredMime || candidate.declaredMime === mime, 'image MIME mismatch');
            } else {
                check(detectImageMime(bytes) === mime, `texture ${index}: ${mime} magic mismatch`);
            }
            if (brokenMimes.has(mime)) {
                context.warn(`texture ${index}: ${candidate.label} ${mime} previously failed to decode, skipping`);
                continue;
            }
            image = await decodeImage(candidate.cacheKey, bytes, mime) || undefined;
            if (image) { break; }
            brokenMimes.add(mime);
            context.warn(`texture ${index}: ${candidate.label} ${mime} failed to decode${candidate === candidates[candidates.length - 1] ? '' : ', trying fallback source'}`);
        }
        if (!image) { throw new Error(`[glTF] texture ${index}: all image sources failed to decode`); }
        }
        context.throwIfAborted();
        const sampler = source.sampler === undefined ? {} : item(context.json.samplers, source.sampler, 'sampler');
        const texture = new Texture2D(); textures.push(texture); texture.name = source.name || `texture_${index}`;
        const min = sampler.minFilter ?? 9987; const mag = sampler.magFilter ?? 9729;
        check([9728, 9729, 9984, 9985, 9986, 9987].includes(min) && [9728, 9729].includes(mag), 'invalid texture filter');
        const wrap = (value: number): number => {
            check([33071, 33648, 10497].includes(value), 'invalid texture wrap');
            return value === 33071 ? Texture2D.WrapMode.CLAMP_TO_EDGE : value === 33648 ? Texture2D.WrapMode.MIRRORED_REPEAT : Texture2D.WrapMode.REPEAT;
        };
        texture.setFilters([9728, 9984, 9986].includes(min) ? Texture2D.Filter.NEAREST : Texture2D.Filter.LINEAR,
            mag === 9728 ? Texture2D.Filter.NEAREST : Texture2D.Filter.LINEAR);
        texture.setMipFilter(min < 9984 ? Texture2D.Filter.NONE : min <= 9985 ? Texture2D.Filter.NEAREST : Texture2D.Filter.LINEAR);
        texture.setWrapMode(wrap(sampler.wrapS ?? 10497), wrap(sampler.wrapT ?? 10497));
        const powerOfTwo = (n: number): boolean => n > 0 && (n & (n - 1)) === 0;
        if (deviceManager.gfxDevice.gfxAPI === API.WEBGL && (!powerOfTwo(image.width) || !powerOfTwo(image.height))) {
            context.warn(`texture ${index}: WebGL1 NPOT sampler changed to clamp/no mipmaps`);
            texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
            texture.setMipFilter(Texture2D.Filter.NONE);
        }
        // Upload without flipY: glTF UVs and HTML image rows both start at the top.
        texture.image = image;
    }
}

export function createGLTFMaterial (features: GLTFMaterialFeatures, textures: readonly Texture2D[], vertexColor: boolean): Material {
    const source = features.source;
    const pbr = source.pbrMetallicRoughness || {};
    const unlit = features.unlit;
    const alpha = source.alphaMode || 'OPAQUE';
    check(['OPAQUE', 'MASK', 'BLEND'].includes(alpha), 'invalid alphaMode');
    const factor = pbr.baseColorFactor || [1, 1, 1, 1];
    const emissive = source.emissiveFactor || [0, 0, 0];
    check(factor.length === 4 && factor.every((v) => Number.isFinite(v) && v >= 0 && v <= 1), 'invalid baseColorFactor');
    check(emissive.length === 3 && emissive.every((v) => Number.isFinite(v) && v >= 0 && v <= 1), 'invalid emissiveFactor');
    const scalar = (v: number, name: string): number => { check(Number.isFinite(v) && v >= 0 && v <= 1, `invalid ${name}`); return v; };
    const defines: MacroRecord = { USE_VERTEX_COLOR: vertexColor, USE_TWOSIDE: !!source.doubleSided,
        USE_ALPHA_TEST: alpha === 'MASK', ALPHA_TEST_CHANNEL: 'a', AIR_GLTF_OPAQUE: alpha === 'OPAQUE', AIR_GLTF_UNLIT: unlit,
        CC_FORCE_FORWARD_SHADING: true };
    const slots: TextureSlotName[] = [...TEXTURE_SLOTS];
    const specExt = source.extensions?.KHR_materials_specular as { specularTexture?: TextureInfo; specularColorTexture?: TextureInfo } | undefined;
    const ccExt = source.extensions?.KHR_materials_clearcoat as { clearcoatTexture?: TextureInfo; clearcoatRoughnessTexture?: TextureInfo; clearcoatNormalTexture?: TextureInfo } | undefined;
    const anisoExt = source.extensions?.KHR_materials_anisotropy as { anisotropyTexture?: TextureInfo } | undefined;
    const iriExt = source.extensions?.KHR_materials_iridescence as { iridescenceTexture?: TextureInfo; iridescenceIorTexture?: TextureInfo; iridescenceThicknessTexture?: TextureInfo } | undefined;
    const bumpExt = source.extensions?.EXT_materials_bump as { bumpTexture?: TextureInfo } | undefined;
    const transmissionExt = source.extensions?.KHR_materials_transmission as { transmissionTexture?: TextureInfo } | undefined;
    const volumeExt = source.extensions?.KHR_materials_volume as { thicknessTexture?: TextureInfo } | undefined;
    const maps = [
        [pbr.baseColorTexture, 'mainTexture', 'USE_ALBEDO_MAP', 'ALBEDO_UV'],
        [pbr.metallicRoughnessTexture, 'metallicRoughnessMap', 'USE_METALLIC_ROUGHNESS_MAP', 'PBR_UV'],
        [source.normalTexture, 'normalMap', 'USE_NORMAL_MAP', 'NORMAL_UV'],
        [source.occlusionTexture, 'occlusionMap', 'USE_OCCLUSION_MAP', 'OCCLUSION_UV'],
        [source.emissiveTexture, 'emissiveMap', 'USE_EMISSIVE_MAP', 'EMISSIVE_UV'],
        [specExt?.specularTexture, 'specularMap', 'USE_AIR_SPECULAR_MAP', 'SPECULAR_UV'],
        [specExt?.specularColorTexture, 'specularColorMap', 'USE_AIR_SPECULAR_COLOR_MAP', 'SPECULARCOLOR_UV'],
        [ccExt?.clearcoatTexture, 'clearcoatMap', 'USE_AIR_CLEARCOAT_MAP', 'CLEARCOAT_UV'],
        [ccExt?.clearcoatRoughnessTexture, 'clearcoatRoughnessMap', 'USE_AIR_CLEARCOAT_ROUGHNESS_MAP', 'CLEARCOATROUGHNESS_UV'],
        [ccExt?.clearcoatNormalTexture, 'clearcoatNormalMap', 'USE_AIR_CLEARCOAT_NORMAL_MAP', 'CLEARCOATNORMAL_UV'],
        [anisoExt?.anisotropyTexture, 'anisotropyMap', 'USE_AIR_ANISOTROPY_MAP', 'ANISOTROPY_UV'],
        [iriExt?.iridescenceTexture, 'iridescenceMap', 'USE_AIR_IRIDESCENCE_MAP', 'IRIDESCENCE_UV'],
        [iriExt?.iridescenceIorTexture, 'iridescenceIorMap', 'USE_AIR_IRIDESCENCE_IOR_MAP', 'IRIDESCENCEIOR_UV'],
        [iriExt?.iridescenceThicknessTexture, 'iridescenceThicknessMap', 'USE_AIR_IRIDESCENCE_THICKNESS_MAP', 'IRIDESCENCETHICKNESS_UV'],
        [bumpExt?.bumpTexture, 'bumpMap', 'USE_AIR_BUMP', 'BUMP_UV'],
        [transmissionExt?.transmissionTexture, 'transmissionMap', 'USE_AIR_TRANSMISSION_MAP', 'TRANSMISSION_UV'],
        [volumeExt?.thicknessTexture, 'volumeThicknessMap', 'USE_AIR_VOLUME_THICKNESS_MAP', 'VOLUMETHICKNESS_UV'],
    ] as const;
    for (const [index, [info, , macro, uv]] of maps.entries()) {
        defines[macro] = !!info;
        if (info) {
            const { texCoord } = features.uv[slots[index]]!;
            defines[uv] = texCoord === 1 ? 'v_uv1' : 'v_uv';
            if (texCoord === 1) { defines.HAS_SECOND_UV = true; }
        }
    }
    // Physical material surface (KHR_materials_* scalars); unlit ignores BRDF modifiers.
    const physical = features.physical as PhysicalScalars;
    const ior = physical.ior ?? 1.5;
    const specularFactor0 = physical.specular?.factor0 ?? 1;
    const emissiveStrength = physical.emissiveStrength ?? 1;
    const specularColor = physical.specular?.color;
    const colorActive = !!specularColor && specularColor.some((v) => Math.abs(v - 1) > 1e-6);
    const physicalScalar = !unlit && (needsPhysicalEffect(ior, specularFactor0, emissiveStrength) || colorActive);
    const clearcoat = physical.clearcoat;
    const clearcoatScalar = !unlit && !!clearcoat && clearcoat.factor > 0;
    const anisotropy = physical.anisotropy;
    const anisotropyScalar = !unlit && !!anisotropy && anisotropy.strength > 0;
    const iridescence = physical.iridescence;
    const iridescenceScalar = !unlit && !!iridescence && iridescence.factor > 0;
    const bump = physical.bump;
    const bumpActive = !unlit && !!bump && !!bumpExt?.bumpTexture;
    const transmission = physical.transmission;
    const volume = physical.volume;
    const dispersion = physical.dispersion;
    // Refractive sampling requires the scene-color pipeline (an active AirTransmissionCapture
    // on WebGL2); unarmed, materials build without the defines and the loader already reported
    // device-dependent (required) or warned (optional) — never a silent opaque fake.
    const transmissionArmed = !unlit && transmissionPipelineAvailable().available;
    const transmissionScalar = transmissionArmed && !!transmission && transmission.factor > 0;
    const physicalMaps = !!specExt?.specularTexture || !!specExt?.specularColorTexture
        || !!ccExt?.clearcoatTexture || !!ccExt?.clearcoatRoughnessTexture || !!ccExt?.clearcoatNormalTexture
        || !!anisoExt?.anisotropyTexture || !!bumpExt?.bumpTexture
        || (transmissionArmed && (!!transmissionExt?.transmissionTexture || !!volumeExt?.thicknessTexture));
    const usePhysical = physicalScalar || clearcoatScalar || anisotropyScalar || iridescenceScalar || transmissionScalar || (!unlit && physicalMaps);
    const definesForPhysical: MacroRecord = {};
    if (physicalScalar) { definesForPhysical.USE_AIR_SPECULAR_COLOR = colorActive; }
    // Specular extension presence gates the energy-conservation diffuse attenuation (the
    // airDielectric Fresnel term), separate from USE_AIR_SPECULAR_COLOR which gates the color mix.
    definesForPhysical.USE_AIR_SPECULAR = !!specExt;
    if (!unlit && clearcoat) {
        definesForPhysical.USE_AIR_CLEARCOAT = clearcoat.factor > 0 || defines.USE_AIR_CLEARCOAT_MAP === true
            || defines.USE_AIR_CLEARCOAT_ROUGHNESS_MAP === true || defines.USE_AIR_CLEARCOAT_NORMAL_MAP === true;
    }
    if (!unlit && anisotropy) {
        definesForPhysical.USE_AIR_ANISOTROPY = anisotropy.strength > 0 || defines.USE_AIR_ANISOTROPY_MAP === true;
    }
    if (!unlit && iridescence) {
        definesForPhysical.USE_AIR_IRIDESCENCE = iridescence.factor > 0
            || defines.USE_AIR_IRIDESCENCE_MAP === true;
    }
    if (transmissionArmed && transmission) {
        definesForPhysical.USE_AIR_TRANSMISSION = transmission.factor > 0 || defines.USE_AIR_TRANSMISSION_MAP === true;
        definesForPhysical.USE_AIR_VOLUME = !!volume && transmission.factor > 0;
        definesForPhysical.USE_AIR_DISPERSION = !!dispersion && dispersion.factor > 0 && !!volume && transmission.factor > 0;
    }
    const material = new Material();
    try {
        const effect = usePhysical ? gltfPhysicalEffect() : gltfEffect();
        // Use a single forward base pass for BLEND/unlit, avoiding opaque additive/shadow passes.
        let selectedEffect = effect;
        if (alpha === 'BLEND' || unlit) {
            const variantName = `${effect.name}-single-pass`;
            selectedEffect = EffectAsset.get(variantName)!;
            if (!selectedEffect) {
                selectedEffect = new EffectAsset(); selectedEffect.name = variantName;
                selectedEffect.shaders = effect.shaders;
                selectedEffect.techniques = [{ passes: [effect.techniques[0].passes[0]] }];
                selectedEffect.onLoaded();
            }
        }
        material.initialize({ effectAsset: selectedEffect, defines: { ...defines, ...definesForPhysical },
            states: { rasterizerState: { cullMode: source.doubleSided ? CullMode.NONE : CullMode.BACK },
                // Opaque/masked materials retain native per-pass depth and blend states:
                // forward-add must accumulate ONE/ONE without rewriting depth. Applying
                // the base pass's blend=false to every pass overwrites the lit base image.
                // BLEND uses a single main pass, so its alpha state is safe to override.
                ...(alpha === 'BLEND' ? {
                    depthStencilState: { depthTest: true, depthWrite: false },
                    blendState: { targets: [{ blend: true, blendSrc: BlendFactor.SRC_ALPHA,
                        blendDst: BlendFactor.ONE_MINUS_SRC_ALPHA, blendSrcAlpha: BlendFactor.ONE,
                        blendDstAlpha: BlendFactor.ONE_MINUS_SRC_ALPHA }] },
                } : {}) } });
        material.name = source.name || 'glTF material';
        material.setProperty('albedo', new Vec4(...factor as [number, number, number, number]));
        material.setProperty('albedoScaleAndCutoff', new Vec4(1, 1, 1, source.alphaCutoff ?? 0.5));
        material.setProperty('pbrParams', new Vec4(scalar(source.occlusionTexture?.strength ?? 1, 'occlusion strength'),
            scalar(pbr.roughnessFactor ?? 1, 'roughness'), scalar(pbr.metallicFactor ?? 1, 'metallic'), 0.5));
        material.setProperty('emissive', new Vec4(emissive[0], emissive[1], emissive[2], 1));
        check(Number.isFinite(source.normalTexture?.scale ?? 1), 'invalid normal scale');
        if (usePhysical) {
            material.setProperty(PHYSICAL_CONSTANT, physicalParams(ior, specularFactor0, emissiveStrength));
            if (clearcoat) { material.setProperty(CLEARCOAT_CONSTANT, new Vec4(clearcoat.factor, clearcoat.roughness, clearcoat.normalScale, 1)); }
            if (anisotropy) { material.setProperty(ANISO_CONSTANT, new Vec4(anisotropy.strength, Math.cos(anisotropy.rotation), Math.sin(anisotropy.rotation), 1)); }
            if (iridescence) { material.setProperty(IRIDESCENCE_CONSTANT, new Vec4(iridescence.factor, iridescence.ior, iridescence.thicknessMin, iridescence.thicknessMax)); }
            if (bump) { material.setProperty(BUMP_CONSTANT, new Vec4(bump.factor, 0, 0, 1)); }
            if (definesForPhysical.USE_AIR_TRANSMISSION && transmission) {
                material.setProperty(TRANSMISSION_CONSTANT, new Vec4(transmission.factor, ior, volume?.thicknessFactor ?? 0, dispersion?.factor ?? 0));
                material.setProperty(ATTENUATION_CONSTANT, new Vec4(volume?.attenuationColor?.[0] ?? 1, volume?.attenuationColor?.[1] ?? 1,
                    volume?.attenuationColor?.[2] ?? 1, Number.isFinite(volume?.attenuationDistance ?? Infinity) ? volume!.attenuationDistance : 1e6));
            }
            if (colorActive) { material.setProperty(PHYSICAL_COLOR_CONSTANT, new Vec4(specularColor![0], specularColor![1], specularColor![2], 1)); }
        }
        material.setProperty('emissiveScaleParam', new Vec4(1, 1, 1, source.normalTexture?.scale ?? 1));
        for (const [info, property] of maps) { if (info) { material.setProperty(property, item(textures, info.index, 'texture')); } }
        maps.forEach((_, index) => {
            const coordinates = features.uv[slots[index]] ?? coreTextureCoordinates();
            const prefix = UV_SLOTS[index][2];
            material.setProperty(`${prefix}UV0`, coordinates.row0);
            material.setProperty(`${prefix}UV1`, coordinates.row1);
        });
        return material;
    } catch (error) { material.destroy(); throw error; }
}
