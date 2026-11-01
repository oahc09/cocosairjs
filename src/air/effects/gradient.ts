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
import { EffectAsset } from '../../cocos/asset/assets/effect-asset';
import { cclegacy } from '../../cocos/core/global-exports';
import { BlendFactor, CullMode, Format, ShaderStageFlagBit, Type, deviceManager } from '../../cocos/gfx';

let serial = 0;
const PROGRAM = 'air-local-gradient-v1';

// Prefixes of the native UBOs, in their exact engine order. Light intensities are
// already exposure-adjusted by PipelineUBO; do not apply exposure a second time.
const CAMERA = `layout(set = 0, binding = 1) uniform CCCamera {
    mat4 cc_matView; mat4 cc_matViewInv; mat4 cc_matProj; mat4 cc_matProjInv;
    mat4 cc_matViewProj; mat4 cc_matViewProjInv;
    vec4 cc_cameraPos; vec4 cc_surfaceTransform; vec4 cc_screenScale; vec4 cc_exposure;
    vec4 cc_mainLitDir; vec4 cc_mainLitColor; vec4 cc_ambientSky; vec4 cc_ambientGround;
};`;
const VERT = `precision highp float;
${CAMERA}
layout(set = 2, binding = 0) uniform CCLocal { mat4 cc_matWorld; mat4 cc_matWorldIT; };
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 0) out float v_gradientY;
layout(location = 1) out vec3 v_gradientNormal;
void main () {
    v_gradientY = a_position.y;
    v_gradientNormal = mat3(cc_matWorldIT) * a_normal;
    gl_Position = cc_matViewProj * cc_matWorld * vec4(a_position, 1.0);
}`;
const FRAG = `precision highp float;
${CAMERA}
layout(set = 1, binding = 0) uniform Constants {
    vec4 topColor; vec4 bottomColor; vec4 gradient;
};
layout(location = 0) in float v_gradientY;
layout(location = 1) in vec3 v_gradientNormal;
layout(location = 0) out vec4 cc_FragColor;
vec3 encodeSRGB (vec3 color) {
    vec3 c = max(color, vec3(0.0));
    return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, lessThanEqual(c, vec3(0.0031308)));
}
void main () {
    // Same object-space weight as the reference, including extrapolation above 1.
    // The minimum exponent makes zero and negative smoothness well-defined.
    float height = max(v_gradientY * gradient.y + gradient.x, 0.0);
    float weight = pow(height, max(gradient.z, 0.01));
    vec4 color = mix(bottomColor, topColor, weight);
#if !AIR_GRADIENT_UNLIT
    float normalLength = length(v_gradientNormal);
    vec3 normal = v_gradientNormal / max(normalLength, 0.000001);
    vec3 hemisphere = mix(cc_ambientGround.rgb, cc_ambientSky.rgb, normal.y * 0.5 + 0.5);
    vec3 light = hemisphere * cc_ambientSky.w;
    light += cc_mainLitColor.rgb * cc_mainLitColor.w * max(dot(normal, -cc_mainLitDir.xyz), 0.0);
#if AIR_GRADIENT_BABYLON_RESPONSE
    // Opt-in historical GradientMaterial response, not a PBR model.
    color.rgb *= clamp(light * color.rgb, 0.0, 1.0);
#else
    color.rgb *= light;
#endif
#endif
#if AIR_GRADIENT_SRGB_OUTPUT
    color.rgb = encodeSRGB(color.rgb);
#endif
    color.a = clamp(color.a * gradient.w, 0.0, 1.0);
    cc_FragColor = color;
}`;

/**
 * Create an independently owned local-Y two-color gradient EffectAsset after AIR
 * startup. Use native Material.initialize({ effectAsset, technique, defines }).
 *
 * Techniques: 0 opaque/depth-writing; 1 straight-alpha blending/no depth writes.
 * Properties: topColor/bottomColor (linear Vec4 or Color), offset (0), scale (1),
 * smoothness (1, shader minimum .01), alpha (1). Colors default to red/blue.
 * The weight is pow(max(localY * scale + offset, 0), max(smoothness, .01));
 * it extrapolates above one. Supply finite properties; use alpha in [0, 1].
 *
 * Defines (all false unless supplied): AIR_GRADIENT_UNLIT bypasses scene light;
 * AIR_GRADIENT_BABYLON_RESPONSE opts into the reference's extra RGB multiply;
 * AIR_GRADIENT_SRGB_OUTPUT encodes linear RGB for an LDR display target.
 * Raw output is the default, matching the reference and linear render targets.
 * Scene lighting is native ambient hemisphere + main directional diffuse only.
 * No shadows, fog, additional lights, skinning, morphing, instancing or textures.
 * Detach consumers, destroy materials, then remove/destroy the owned effect.
 */
export function createAirGradientEffect(): EffectAsset {
    if (!deviceManager.gfxDevice) {
        throw new Error('[AIR_GRADIENT] initialize createAirApp() before creating the effect');
    }
    const strip = (source: string): string => source.replace(/layout\s*\([^)]*\)\s*/g, '');
    const properties = {
        topColor: { type: Type.FLOAT4, value: [1, 0, 0, 1] },
        bottomColor: { type: Type.FLOAT4, value: [0, 0, 1, 1] },
        gradient: { type: Type.FLOAT4, value: [0, 1, 1, 1] },
        offset: { type: Type.FLOAT, handleInfo: ['gradient', 0, Type.FLOAT], value: [0] },
        scale: { type: Type.FLOAT, handleInfo: ['gradient', 1, Type.FLOAT], value: [1] },
        smoothness: { type: Type.FLOAT, handleInfo: ['gradient', 2, Type.FLOAT], value: [1] },
        alpha: { type: Type.FLOAT, handleInfo: ['gradient', 3, Type.FLOAT], value: [1] },
    };
    const effect = Object.assign(new EffectAsset(), {
        name: `${PROGRAM}-${++serial}`,
        techniques: [false, true].map((transparent) => ({
            passes: [
                {
                    program: PROGRAM,
                    properties: JSON.parse(JSON.stringify(properties)),
                    rasterizerState: { cullMode: CullMode.BACK },
                    depthStencilState: { depthTest: true, depthWrite: !transparent },
                    blendState: {
                        targets: [
                            {
                                blend: transparent,
                                blendSrc: BlendFactor.SRC_ALPHA,
                                blendDst: BlendFactor.ONE_MINUS_SRC_ALPHA,
                                blendSrcAlpha: BlendFactor.ONE,
                                blendDstAlpha: BlendFactor.ONE_MINUS_SRC_ALPHA,
                            },
                        ],
                    },
                },
            ],
        })),
        shaders: [
            {
                name: PROGRAM,
                glsl4: { vert: VERT, frag: FRAG },
                glsl3: { vert: strip(VERT), frag: strip(FRAG) },
                defines: ['AIR_GRADIENT_UNLIT', 'AIR_GRADIENT_BABYLON_RESPONSE', 'AIR_GRADIENT_SRGB_OUTPUT'].map(
                    (name) => ({ name, type: 'boolean' }),
                ),
                builtins: {
                    globals: { blocks: [{ name: 'CCCamera', set: 0, binding: 1, defines: [] }] },
                    locals: { blocks: [{ name: 'CCLocal', set: 2, binding: 0, defines: [] }] },
                },
                attributes: [
                    { name: 'a_position', format: Format.RGB32F, location: 0, defines: [] },
                    { name: 'a_normal', format: Format.RGB32F, location: 1, defines: [] },
                ],
                blocks: [
                    {
                        name: 'Constants',
                        set: 1,
                        binding: 0,
                        stageFlags: ShaderStageFlagBit.FRAGMENT,
                        members: ['topColor', 'bottomColor', 'gradient'].map((name) => ({
                            name,
                            type: Type.FLOAT4,
                            count: 1,
                        })),
                    },
                ],
            },
        ],
        combinations: [],
    });
    effect.onLoaded();
    // No eager variants: avoid a deferred precompile listener retaining this asset.
    const precompile = (effect as unknown as { _precompile: () => void })._precompile;
    cclegacy.game.off(cclegacy.Game.EVENT_RENDERER_INITED, precompile, effect);
    return effect;
}
