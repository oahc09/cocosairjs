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
import { Material } from '../../cocos/asset/assets/material';
import { EffectAsset } from '../../cocos/asset/assets/effect-asset';
import { Format, Type, ShaderStageFlagBit } from '../../cocos/gfx';
import { Vec4 } from '../../cocos/core/math';

export const AIR_INSTANCE_ATTRIBUTES = ['i_airMat0', 'i_airMat1', 'i_airMat2', 'i_airColor'] as const;
let effect: EffectAsset | null = null;
/** Opaque, double-sided unlit instance material. Input RGB is linear; HDR captures bypass display encoding. */
export function createAirInstanceMaterial(baseColor: Readonly<Vec4> = new Vec4(1, 1, 1, 1)): Material {
    if (!effect?.isValid || EffectAsset.get(effect.name) !== effect) {
        const vert = `precision highp float;
layout(set=0,binding=1) uniform CCCamera {mat4 cc_matView;mat4 cc_matViewInv;mat4 cc_matProj;mat4 cc_matProjInv;mat4 cc_matViewProj;};
layout(set=2,binding=0) uniform CCLocal {mat4 cc_matWorld;};
in vec3 a_position;
in vec4 i_airMat0;in vec4 i_airMat1;in vec4 i_airMat2;in vec4 i_airColor;
out vec4 v_color;
void main(){mat4 m=mat4(vec4(i_airMat0.xyz,0),vec4(i_airMat1.xyz,0),vec4(i_airMat2.xyz,0),vec4(i_airMat0.w,i_airMat1.w,i_airMat2.w,1));
gl_Position=cc_matViewProj*cc_matWorld*m*vec4(a_position,1);v_color=i_airColor;}`;
        const frag = `precision highp float;
layout(set=1,binding=0) uniform Constants {vec4 baseColor;};
in vec4 v_color;layout(location=0) out vec4 cc_FragColor;
vec4 CCFragOutput(vec4 color){vec3 c=max(color.rgb,vec3(0));color.rgb=mix(1.055*pow(c,vec3(1.0/2.4))-.055,c*12.92,lessThanEqual(c,vec3(.0031308)));return color;}
void main(){cc_FragColor=CCFragOutput(v_color*baseColor);}`;
        const strip = (s: string) => s.replace(/layout\s*\([^)]*\)\s*/g, '');
        effect = Object.assign(new EffectAsset(), {
            name: 'air-instance-unlit-v1',
            techniques: [
                {
                    passes: [
                        {
                            program: 'air-instance-unlit-v1',
                            rasterizerState: { cullMode: 0 },
                            depthStencilState: { depthTest: true, depthWrite: true },
                            blendState: { targets: [{ blend: false }] },
                            properties: { baseColor: { type: Type.FLOAT4, value: [1, 1, 1, 1] } },
                        },
                    ],
                },
            ],
            shaders: [
                {
                    name: 'air-instance-unlit-v1',
                    glsl4: { vert, frag },
                    glsl3: { vert: strip(vert), frag: strip(frag) },
                    defines: [],
                    builtins: {
                        statistics: {
                            CC_EFFECT_USED_VERTEX_UNIFORM_VECTORS: 36,
                            CC_EFFECT_USED_FRAGMENT_UNIFORM_VECTORS: 1,
                        },
                        globals: {
                            blocks: [{ name: 'CCCamera', set: 0, binding: 1, defines: [] }],
                            samplerTextures: [],
                            buffers: [],
                            images: [],
                        },
                        locals: {
                            blocks: [{ name: 'CCLocal', set: 2, binding: 0, defines: [] }],
                            samplerTextures: [],
                            buffers: [],
                            images: [],
                        },
                    },
                    attributes: [
                        { name: 'a_position', format: Format.RGB32F, location: 0, defines: [] },
                        ...AIR_INSTANCE_ATTRIBUTES.map((name, i) => ({
                            name,
                            format: Format.RGBA32F,
                            location: 8 + i,
                            isInstanced: true,
                            defines: [],
                        })),
                    ],
                    blocks: [
                        {
                            name: 'Constants',
                            set: 1,
                            binding: 0,
                            stageFlags: ShaderStageFlagBit.FRAGMENT,
                            members: [{ name: 'baseColor', type: Type.FLOAT4, count: 1 }],
                        },
                    ],
                },
            ],
            combinations: [],
        });
        effect.onLoaded();
    }
    const material = new Material();
    material.initialize({ effectAsset: effect });
    material.setProperty('baseColor', baseColor);
    return material;
}
