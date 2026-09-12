import { Material } from '../../../cocos/asset/assets/material';
import { EffectAsset } from '../../../cocos/asset/assets/effect-asset';
import { ImageAsset } from '../../../cocos/asset/assets/image-asset';
import { Texture2D } from '../../../cocos/asset/assets/texture-2d';
import { API, BlendFactor, CullMode, deviceManager } from '../../../cocos/gfx';
import { Vec4 } from '../../../cocos/core/math';
import { MacroRecord } from '../../../cocos/render-scene/core/pass-utils';
import { GLTFContext } from './context';
import { check, GLTFMaterial, item } from './schema';

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
    // glTF factors are already linear; Cocos's authored material colors are normally sRGB.
    for (const technique of effect.techniques) {
        for (const pass of technique.passes) {
            for (const property of Object.values(pass.properties || {})) { delete property.linear; }
        }
    }
    for (const shader of effect.shaders) {
        const oldName = shader.name;
        shader.name = `${name}|${oldName}`;
        shader.hash = (shader.hash ^ 0x5a17c001) >>> 0;
        for (const technique of effect.techniques) {
            for (const pass of technique.passes) { if (pass.program === oldName) { pass.program = shader.name; } }
        }
        shader.defines.push({ name: 'AIR_GLTF_UNLIT', type: 'boolean' }, { name: 'AIR_GLTF_OPAQUE', type: 'boolean' },
            { name: 'OCCLUSION_UV', type: 'string', options: ['v_uv', 'v_uv1'] });
        for (const language of ['glsl1', 'glsl3', 'glsl4'] as const) {
            if (!shader[language]) { continue; }
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
        }
    }
    // Unlit must not accumulate additional lighting passes. The primary pass still handles skin and morph.
    effect.onLoaded();
    return effect;
}

export async function loadGLTFTextures (context: GLTFContext, textures: Texture2D[], images: ImageAsset[]): Promise<void> {
    const imageCache = new Map<number, ImageAsset>();
    for (const [index, source] of (context.json.textures || []).entries()) {
        check(source.source !== undefined, `texture ${index}: no core image fallback`);
        const imageSource = item(context.json.images, source.source, 'image');
        let image = imageCache.get(source.source);
        if (!image) {
            check((imageSource.uri !== undefined) !== (imageSource.bufferView !== undefined), 'image requires exactly one URI/bufferView');
            const bytes = imageSource.uri !== undefined ? new Uint8Array(await context.request(imageSource.uri)) : context.bufferView(imageSource.bufferView!);
            const png = bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
            const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
            check(png || jpeg, 'only PNG and JPEG images are supported');
            const mime = png ? 'image/png' : 'image/jpeg';
            check(!imageSource.mimeType || imageSource.mimeType === mime, 'image MIME mismatch');
            const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
            try {
                const element = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = () => reject(new Error(`[glTF] image ${source.source}: decode failed`));
                    img.src = url;
                });
                image = new ImageAsset(element); images.push(image); imageCache.set(source.source, image);
            } finally { URL.revokeObjectURL(url); }
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

export function createGLTFMaterial (source: GLTFMaterial, textures: readonly Texture2D[], vertexColor: boolean): Material {
    const pbr = source.pbrMetallicRoughness || {};
    const unlit = !!source.extensions?.KHR_materials_unlit;
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
    const maps = [
        [pbr.baseColorTexture, 'mainTexture', 'USE_ALBEDO_MAP', 'ALBEDO_UV'],
        [pbr.metallicRoughnessTexture, 'metallicRoughnessMap', 'USE_METALLIC_ROUGHNESS_MAP', 'PBR_UV'],
        [source.normalTexture, 'normalMap', 'USE_NORMAL_MAP', 'NORMAL_UV'],
        [source.occlusionTexture, 'occlusionMap', 'USE_OCCLUSION_MAP', 'OCCLUSION_UV'],
        [source.emissiveTexture, 'emissiveMap', 'USE_EMISSIVE_MAP', 'EMISSIVE_UV'],
    ] as const;
    for (const [info, , macro, uv] of maps) {
        defines[macro] = !!info;
        if (info) {
            check(info.texCoord === undefined || info.texCoord === 0 || info.texCoord === 1, 'only UV0/UV1 are supported');
            defines[uv] = info.texCoord === 1 ? 'v_uv1' : 'v_uv';
            if (info.texCoord === 1) { defines.HAS_SECOND_UV = true; }
        }
    }
    const material = new Material();
    try {
        const effect = gltfEffect();
        // Use a single forward base pass for BLEND/unlit, avoiding opaque additive/shadow passes.
        let selectedEffect = effect;
        if (alpha === 'BLEND' || unlit) {
            const variantName = 'air-gltf-standard-single-pass';
            selectedEffect = EffectAsset.get(variantName)!;
            if (!selectedEffect) {
                selectedEffect = new EffectAsset(); selectedEffect.name = variantName;
                selectedEffect.shaders = effect.shaders;
                selectedEffect.techniques = [{ passes: [effect.techniques[0].passes[0]] }];
                selectedEffect.onLoaded();
            }
        }
        material.initialize({ effectAsset: selectedEffect, defines,
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
        material.setProperty('emissiveScaleParam', new Vec4(1, 1, 1, source.normalTexture?.scale ?? 1));
        for (const [info, property] of maps) { if (info) { material.setProperty(property, item(textures, info.index, 'texture')); } }
        return material;
    } catch (error) { material.destroy(); throw error; }
}
