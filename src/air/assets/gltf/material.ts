import { Material } from '../../../cocos/asset/assets/material';
import { EffectAsset } from '../../../cocos/asset/assets/effect-asset';
import { ImageAsset } from '../../../cocos/asset/assets/image-asset';
import { Texture2D } from '../../../cocos/asset/assets/texture-2d';
import { API, BlendFactor, CullMode, deviceManager, Type, Uniform } from '../../../cocos/gfx';
import { Vec4 } from '../../../cocos/core/math';
import { MacroRecord } from '../../../cocos/render-scene/core/pass-utils';
import { GLTFParserContext } from './parser-context';
import { check, item } from './schema';
import type { TextureInfo } from './schema';
import { GLTFMaterialFeatures, TEXTURE_SLOTS, TextureSlotName } from './material/features';
import { coreTextureCoordinates } from './material/texture-slots';
import type { PhysicalScalars } from './material/features';
import { gltfPhysicalEffect, needsPhysicalEffect, physicalParams, PHYSICAL_CONSTANT, PHYSICAL_COLOR_CONSTANT, CLEARCOAT_CONSTANT, ANISO_CONSTANT } from './material/physical-effect';
import type { DecodedTextureSource } from './decoder/types';
import { KTX2_RAW_MIME } from './decoder/types';
import { SUPPORTED_IMAGE_MIMES, detectImageMime } from './extensions/texture/image-formats';

const UV_SLOTS = [
    ['albedoMap', 'ALBEDO_UV', 'airAlbedo'], ['metallicRoughnessMap', 'PBR_UV', 'airMetallicRoughness'],
    ['normalMap', 'NORMAL_UV', 'airNormal'], ['occlusionMap', 'OCCLUSION_UV', 'airOcclusion'],
    ['emissiveMap', 'EMISSIVE_UV', 'airEmissive'],
    ['specularMap', 'SPECULAR_UV', 'airSpecular'], ['specularColorMap', 'SPECULARCOLOR_UV', 'airSpecularColor'],
    ['clearcoatMap', 'CLEARCOAT_UV', 'airClearcoat'], ['clearcoatRoughnessMap', 'CLEARCOATROUGHNESS_UV', 'airClearcoatRoughness'],
    ['clearcoatNormalMap', 'CLEARCOATNORMAL_UV', 'airClearcoatNormal'], ['anisotropyMap', 'ANISOTROPY_UV', 'airAnisotropy'],
] as const;
const UV_UNIFORMS = UV_SLOTS.map(([, , prefix]) => `${prefix}UV0`).concat(UV_SLOTS.map(([, , prefix]) => `${prefix}UV1`));

/** Isolated standard effect variant: glTF vertex colors, AO strength, UV sets and unlit semantics. */
export function gltfEffect (): EffectAsset {
    const name = 'air-gltf-standard';
    const existing = EffectAsset.get(name);
    if (existing) { return existing; }
    const standard = EffectAsset.get('builtin-standard');
    check(standard, 'initialize createAirApp() before loading models');
    const effect = new EffectAsset(); effect.name = name;
    effect.shaders = JSON.parse(JSON.stringify(standard.shaders));
    effect.techniques = JSON.parse(JSON.stringify(standard.techniques));
    for (const technique of effect.techniques) {
        for (const pass of technique.passes) {
            if (!pass.properties) { continue; }
            for (const name of UV_UNIFORMS) { pass.properties[name] = { type: Type.FLOAT4, value: name.endsWith('0') ? [1, 0, 0, 0] : [0, 1, 0, 0] }; }
        }
    }
    // glTF factors are already linear; Cocos's authored material colors are normally sRGB.
    for (const technique of effect.techniques) {
        for (const pass of technique.passes) {
            for (const property of Object.values(pass.properties || {})) { delete property.linear; }
        }
    }
    for (const shader of effect.shaders) {
        const oldName = shader.name;
        shader.name = `${name}|${oldName}`;
        shader.hash = (shader.hash ^ 0x5a17c002) >>> 0;
        // Extend the existing material block, preserving its binding and std140 vec4 alignment.
        const blocks = shader.blocks.slice();
        for (const descriptor of shader.descriptors || []) { blocks.push(...(descriptor.blocks || [])); }
        for (const block of blocks) {
            if (block.name !== 'Constants') { continue; }
            for (const name of UV_UNIFORMS) {
                if (!block.members.some((member) => member.name === name)) { block.members.push(new Uniform(name, Type.FLOAT4, 1)); }
            }
        }
        for (const technique of effect.techniques) {
            for (const pass of technique.passes) { if (pass.program === oldName) { pass.program = shader.name; } }
        }
        shader.defines.push({ name: 'AIR_GLTF_UNLIT', type: 'boolean' }, { name: 'AIR_GLTF_OPAQUE', type: 'boolean' },
            { name: 'OCCLUSION_UV', type: 'string', options: ['v_uv', 'v_uv1'] });
        for (const language of ['glsl1', 'glsl3', 'glsl4'] as const) {
            if (!shader[language]) { continue; }
            for (const stage of ['vert', 'frag'] as const) {
                if (language === 'glsl1') {
                    shader[language][stage] = `${UV_UNIFORMS.map((name) => `uniform highp vec4 ${name};`).join('\n')}\n${shader[language][stage]}`;
                } else {
                    shader[language][stage] = shader[language][stage].replace(/(uniform Constants\s*\{)([^}]*)(\})/g,
                        (_match, start, body, end) => `${start}${body}${UV_UNIFORMS.map((name) => `vec4 ${name};`).join('\n')}\n${end}`);
                }
            }
            shader[language].vert = shader[language].vert.replace('v_tangent.w = In.tangent.w;',
                'v_tangent.w = In.tangent.w * sign(dot(cross(matWorld[0].xyz, matWorld[1].xyz), matWorld[2].xyz));');
            if (language === 'glsl3') {
                shader[language].vert = shader[language].vert.replace(/\bgl_VertexIndex\b/g, 'gl_VertexID');
            } else if (language === 'glsl1') {
                shader[language].vert = shader[language].vert
                    .replace('int getVertexId() {', 'attribute float a_vertexId;\nint getVertexId() {')
                    .replace(/\bgl_VertexIndex\b/g, 'int(a_vertexId)')
                    .replace(/ivec2 texSize = textureSize\(tex, 0\);\s*return texelFetch\(tex, ivec2\(pixelIndex % texSize.x, pixelIndex \/ texSize.x\), 0\);/g,
                        'return texture2D(tex, getPixelCoordFromLocation(getPixelLocation(cc_displacementTextureInfo.xy, pixelIndex), cc_displacementTextureInfo.xy));');
                // The bundled UBO flattener only retains arrays with literal sizes; skinning
                // uses a macro expression. Restore its native uniform without altering builtins.
                if (!/uniform\s+(?:highp\s+)?vec4\s+cc_joints\s*\[/.test(shader[language].vert)) {
                    shader[language].vert = '#if CC_USE_SKINNING && !CC_USE_BAKED_ANIMATION && !CC_USE_REAL_TIME_JOINT_TEXTURE\n'
                        + 'uniform highp vec4 cc_joints[CC_JOINT_UNIFORM_CAPACITY * 3];\n#endif\n' + shader[language].vert;
                }
            }
            shader[language].frag = shader[language].frag
                .replace('baseColor.rgb *= SRGBToLinear(v_color.rgb);', 'baseColor.rgb *= v_color.rgb;')
                .replace(/pbr.x \*= (texture2D|texture)\(occlusionMap, PBR_UV\).r;/g,
                    'pbr.x = mix(1.0, $1(occlusionMap, OCCLUSION_UV).r, pbrParams.x);')
                .replace('s.occlusion = pbr.x;', '#if !USE_OCCLUSION_MAP\npbr.x = 1.0;\n#endif\ns.occlusion = pbr.x;')
                .replace('s.albedo = baseColor;', '#if AIR_GLTF_OPAQUE\nbaseColor.a = 1.0;\n#endif\ns.albedo = baseColor;')
                .replace('vec4 color = CCStandardShadingBase(s, v_shadowPos);',
                    '#if AIR_GLTF_UNLIT\nvec4 color = s.albedo;\n#else\nvec4 color = CCStandardShadingBase(s, v_shadowPos);\n#endif')
                .replace(/return gamma \* gamma;/g,
                    'return mix(gamma / 12.92, pow((gamma + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), gamma));');
            // Apply independently at each textureInfo sampling site, including alpha-tested shadows.
            for (const [sampler, uv, prefix] of UV_SLOTS) {
                const expression = `vec2(dot(${prefix}UV0.xyz, vec3(${uv}, 1.0)), dot(${prefix}UV1.xyz, vec3(${uv}, 1.0)))`;
                shader[language].frag = shader[language].frag.replace(new RegExp(`((?:texture|texture2D)\\(\\s*${sampler}\\s*,\\s*)${uv}(?=\\s*\\))`, 'g'), `$1${expression}`);
            }
        }
    }
    // Unlit must not accumulate additional lighting passes. The primary pass still handles skin and morph.
    effect.onLoaded();
    return effect;
}

export async function loadGLTFTextures (context: GLTFParserContext, textures: Texture2D[], images: ImageAsset[]): Promise<void> {
    const imageCache = new Map<number, ImageAsset>();
    const decodeImage = async (key: number, bytes: Uint8Array, mime: string): Promise<ImageAsset | null> => {
        const cached = imageCache.get(key);
        if (cached) { return cached; }
        const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        try {
            const element = await new Promise<HTMLImageElement | null>((resolve) => {
                const img = new Image();
                img.onload = (): void => resolve(img);
                img.onerror = (): void => resolve(null);
                img.src = url;
            });
            if (!element) { return null; }
            const image = new ImageAsset(element); images.push(image); imageCache.set(key, image);
            return image;
        } finally { URL.revokeObjectURL(url); }
    };
    // Mimes whose native decoding failed this parse; later textures fall back immediately.
    const brokenMimes = new Set<string>();
    for (const [index, source] of (context.json.textures || []).entries()) {
        let image: ImageAsset | undefined;
        // Candidate order: extension sources (handler-provided, e.g. WebP/AVIF) before core.
        let decoded: DecodedTextureSource | undefined;
        for (const handler of context.handlers) {
            decoded = await handler.resolveTextureSource?.(index, context) ?? undefined;
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
            let bytes: Uint8Array | null = await candidate.bytes();
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
    const physicalMaps = !!specExt?.specularTexture || !!specExt?.specularColorTexture
        || !!ccExt?.clearcoatTexture || !!ccExt?.clearcoatRoughnessTexture || !!ccExt?.clearcoatNormalTexture
        || !!anisoExt?.anisotropyTexture;
    const usePhysical = physicalScalar || clearcoatScalar || anisotropyScalar || (!unlit && physicalMaps);
    const definesForPhysical: MacroRecord = {};
    if (physicalScalar) { definesForPhysical.USE_AIR_SPECULAR_COLOR = colorActive; }
    if (!unlit && clearcoat) {
        definesForPhysical.USE_AIR_CLEARCOAT = clearcoat.factor > 0 || defines.USE_AIR_CLEARCOAT_MAP === true
            || defines.USE_AIR_CLEARCOAT_ROUGHNESS_MAP === true || defines.USE_AIR_CLEARCOAT_NORMAL_MAP === true;
    }
    if (!unlit && anisotropy) {
        definesForPhysical.USE_AIR_ANISOTROPY = anisotropy.strength > 0 || defines.USE_AIR_ANISOTROPY_MAP === true;
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
                depthStencilState: { depthTest: true, depthWrite: alpha !== 'BLEND' },
                blendState: { targets: [{ blend: alpha === 'BLEND', blendSrc: BlendFactor.SRC_ALPHA,
                    blendDst: BlendFactor.ONE_MINUS_SRC_ALPHA, blendSrcAlpha: BlendFactor.ONE, blendDstAlpha: BlendFactor.ONE_MINUS_SRC_ALPHA }] } } });
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
