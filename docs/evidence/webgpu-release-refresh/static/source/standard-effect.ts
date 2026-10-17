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
import { EffectAsset } from '../../../../cocos/asset/assets/effect-asset';
import { Type, Uniform } from '../../../../cocos/gfx';
import { check } from '../schema';

export const UV_SLOTS = [
    ['albedoMap', 'ALBEDO_UV', 'airAlbedo'],
    ['metallicRoughnessMap', 'PBR_UV', 'airMetallicRoughness'],
    ['normalMap', 'NORMAL_UV', 'airNormal'],
    ['occlusionMap', 'OCCLUSION_UV', 'airOcclusion'],
    ['emissiveMap', 'EMISSIVE_UV', 'airEmissive'],
    ['specularMap', 'SPECULAR_UV', 'airSpecular'],
    ['specularColorMap', 'SPECULARCOLOR_UV', 'airSpecularColor'],
    ['clearcoatMap', 'CLEARCOAT_UV', 'airClearcoat'],
    ['clearcoatRoughnessMap', 'CLEARCOATROUGHNESS_UV', 'airClearcoatRoughness'],
    ['clearcoatNormalMap', 'CLEARCOATNORMAL_UV', 'airClearcoatNormal'],
    ['anisotropyMap', 'ANISOTROPY_UV', 'airAnisotropy'],
    ['iridescenceMap', 'IRIDESCENCE_UV', 'airIridescence'],
    ['iridescenceIorMap', 'IRIDESCENCEIOR_UV', 'airIridescenceIor'],
    ['iridescenceThicknessMap', 'IRIDESCENCETHICKNESS_UV', 'airIridescenceThickness'],
    ['bumpMap', 'BUMP_UV', 'airBump'],
    ['transmissionMap', 'TRANSMISSION_UV', 'airTransmission'],
    ['volumeThicknessMap', 'VOLUMETHICKNESS_UV', 'airVolumeThickness'],
] as const;
const UV_UNIFORMS = UV_SLOTS.map(([, , prefix]) => `${prefix}UV0`).concat(
    UV_SLOTS.map(([, , prefix]) => `${prefix}UV1`),
);

/** Isolated standard effect variant: glTF vertex colors, AO strength, UV sets and unlit semantics. */
export function gltfEffect(): EffectAsset {
    const name = 'air-gltf-standard';
    const existing = EffectAsset.get(name);
    if (existing) {
        return existing;
    }
    // The frozen modern builtin uses SurfacesMaterialData; glTF's existing physical
    // extensions derive from the same revision's official legacy StandardSurface model.
    const standard = EffectAsset.get('air-gltf-template');
    check(standard, 'initialize createAirApp() before loading models');
    const effect = new EffectAsset();
    effect.name = name;
    effect.shaders = JSON.parse(JSON.stringify(standard.shaders));
    effect.techniques = JSON.parse(JSON.stringify(standard.techniques));
    for (const technique of effect.techniques) {
        for (const pass of technique.passes) {
            if (!pass.properties) {
                continue;
            }
            for (const name of UV_UNIFORMS) {
                pass.properties[name] = { type: Type.FLOAT4, value: name.endsWith('0') ? [1, 0, 0, 0] : [0, 1, 0, 0] };
            }
        }
    }
    // glTF factors are already linear; Cocos's authored material colors are normally sRGB.
    for (const technique of effect.techniques) {
        for (const pass of technique.passes) {
            for (const property of Object.values(pass.properties || {})) {
                delete property.linear;
            }
        }
    }
    for (const shader of effect.shaders) {
        const oldName = shader.name;
        shader.name = `${name}|${oldName}`;
        shader.hash = (shader.hash ^ 0x5a17c002) >>> 0;
        // Extend the existing material block, preserving its binding and std140 vec4 alignment.
        const blocks = shader.blocks.slice();
        for (const descriptor of shader.descriptors || []) {
            blocks.push(...(descriptor.blocks || []));
        }
        for (const block of blocks) {
            if (block.name !== 'Constants') {
                continue;
            }
            for (const name of UV_UNIFORMS) {
                if (!block.members.some((member) => member.name === name)) {
                    block.members.push(new Uniform(name, Type.FLOAT4, 1));
                }
            }
        }
        for (const technique of effect.techniques) {
            for (const pass of technique.passes) {
                if (pass.program === oldName) {
                    pass.program = shader.name;
                }
            }
        }
        shader.defines.push(
            { name: 'AIR_GLTF_UNLIT', type: 'boolean' },
            { name: 'AIR_GLTF_OPAQUE', type: 'boolean' },
            { name: 'OCCLUSION_UV', type: 'string', options: ['v_uv', 'v_uv1'] },
        );
        for (const language of ['glsl1', 'glsl3', 'glsl4'] as const) {
            if (!shader[language]) {
                continue;
            }
            for (const stage of ['vert', 'frag'] as const) {
                if (language === 'glsl1') {
                    shader[language][stage] =
                        `${UV_UNIFORMS.map((name) => `uniform highp vec4 ${name};`).join('\n')}\n${shader[language][stage]}`;
                } else {
                    shader[language][stage] = shader[language][stage].replace(
                        /(uniform Constants\s*\{)([^}]*)(\})/g,
                        (_match, start, body, end) =>
                            `${start}${body}${UV_UNIFORMS.map((name) => `vec4 ${name};`).join('\n')}\n${end}`,
                    );
                }
            }
            shader[language].vert = shader[language].vert.replace(
                'v_tangent.w = In.tangent.w;',
                'v_tangent.w = In.tangent.w * sign(dot(cross(matWorld[0].xyz, matWorld[1].xyz), matWorld[2].xyz));',
            );
            if (language === 'glsl3') {
                shader[language].vert = shader[language].vert.replace(/\bgl_VertexIndex\b/g, 'gl_VertexID');
            } else if (language === 'glsl1') {
                shader[language].vert = shader[language].vert
                    .replace('int getVertexId() {', 'attribute float a_vertexId;\nint getVertexId() {')
                    .replace(/\bgl_VertexIndex\b/g, 'int(a_vertexId)')
                    .replace(
                        /ivec2 texSize = textureSize\(tex, 0\);\s*return texelFetch\(tex, ivec2\(pixelIndex % texSize.x, pixelIndex \/ texSize.x\), 0\);/g,
                        'return texture2D(tex, getPixelCoordFromLocation(getPixelLocation(cc_displacementTextureInfo.xy, pixelIndex), cc_displacementTextureInfo.xy));',
                    );
                // The bundled UBO flattener only retains arrays with literal sizes; skinning
                // uses a macro expression. Restore its native uniform without altering builtins.
                if (!/uniform\s+(?:highp\s+)?vec4\s+cc_joints\s*\[/.test(shader[language].vert)) {
                    shader[language].vert =
                        '#if CC_USE_SKINNING && !CC_USE_BAKED_ANIMATION && !CC_USE_REAL_TIME_JOINT_TEXTURE\n' +
                        'uniform highp vec4 cc_joints[CC_JOINT_UNIFORM_CAPACITY * 3];\n#endif\n' +
                        shader[language].vert;
                }
            }
            shader[language].frag = shader[language].frag
                .replace('baseColor.rgb *= SRGBToLinear(v_color.rgb);', 'baseColor.rgb *= v_color.rgb;')
                .replace(
                    /pbr.x \*= (texture2D|texture)\(occlusionMap, PBR_UV\).r;/g,
                    'pbr.x = mix(1.0, $1(occlusionMap, OCCLUSION_UV).r, pbrParams.x);',
                )
                .replace('s.occlusion = pbr.x;', '#if !USE_OCCLUSION_MAP\npbr.x = 1.0;\n#endif\ns.occlusion = pbr.x;')
                .replace(
                    's.albedo = baseColor;',
                    '#if AIR_GLTF_OPAQUE\nbaseColor.a = 1.0;\n#endif\ns.albedo = baseColor;',
                )
                .replace(
                    'vec4 color = CCStandardShadingBase(s, v_shadowPos);',
                    '#if AIR_GLTF_UNLIT\nvec4 color = s.albedo;\n#else\nvec4 color = CCStandardShadingBase(s, v_shadowPos);\n#endif',
                )
                .replace(
                    /return gamma \* gamma;/g,
                    'return mix(gamma / 12.92, pow((gamma + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), gamma));',
                );
            // Apply independently at each textureInfo sampling site, including alpha-tested shadows.
            for (const [sampler, uv, prefix] of UV_SLOTS) {
                const expression = `vec2(dot(${prefix}UV0.xyz, vec3(${uv}, 1.0)), dot(${prefix}UV1.xyz, vec3(${uv}, 1.0)))`;
                shader[language].frag = shader[language].frag.replace(
                    new RegExp(`((?:texture|texture2D)\\(\\s*${sampler}\\s*,\\s*)${uv}(?=\\s*\\))`, 'g'),
                    `$1${expression}`,
                );
            }
        }
    }
    // Unlit must not accumulate additional lighting passes. The primary pass still handles skin and morph.
    effect.onLoaded();
    return effect;
}
