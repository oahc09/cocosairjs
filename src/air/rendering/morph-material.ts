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
import { AIR_INSTANCE_ATTRIBUTES } from './instance-material';

let effect: EffectAsset | null = null;
export function createMorphMaterial(): Material {
    if (!effect?.isValid || EffectAsset.get(effect.name) !== effect) {
        const constants =
            'layout(set=1,binding=0) uniform Constants {vec4 morphControl; vec4 atlasInfo; vec4 display;};';
        const cameraBlock =
            'layout(set=0,binding=1) uniform CCCamera {mat4 cc_matView;mat4 cc_matViewInv;mat4 cc_matProj;mat4 cc_matProjInv;mat4 cc_matViewProj;};';
        const vert = `precision highp float;precision highp int;
${cameraBlock}
layout(set=2,binding=0) uniform CCLocal {mat4 cc_matWorld;};
${constants}
layout(set=1,binding=1) uniform highp sampler2D shapePositions;
layout(set=1,binding=2) uniform highp sampler2D shapeColors;
in vec3 a_position;in vec3 a_normal;
in vec4 i_airMat0;in vec4 i_airMat1;in vec4 i_airMat2;in vec4 i_airColor;
out vec4 v_color;out vec2 v_uv;out vec3 v_world;out vec3 v_normal;out vec3 v_macro;
vec3 decodeNormal(vec2 e){vec3 n=vec3(e,1.-abs(e.x)-abs(e.y));float t=max(-n.z,0.);n.xy+=vec2(n.x>=0.?-t:t,n.y>=0.?-t:t);return normalize(n);}
ivec2 address(float shape){int id=int(i_airColor.x+.5)+int(shape)*int(atlasInfo.z);int width=int(atlasInfo.x);return ivec2(id%width,id/width);}
void main(){
ivec2 from=address(morphControl.x),to=address(morphControl.y);
vec4 p0=texelFetch(shapePositions,from,0),p1=texelFetch(shapePositions,to,0),c0=texelFetch(shapeColors,from,0),c1=texelFetch(shapeColors,to,0);
vec3 position=mix(p0.xyz,p1.xyz,morphControl.z);
mat4 m=mat4(vec4(i_airMat0.xyz,0),vec4(i_airMat1.xyz,0),vec4(i_airMat2.xyz,0),vec4(i_airMat0.w,i_airMat1.w,i_airMat2.w,1));
vec3 center=(m*vec4(position,1)).xyz;
v_color=vec4(mix(c0.rgb,c1.rgb,morphControl.z)*display.x,1);v_uv=a_position.xy;
mat3 world=mat3(cc_matWorld);
if(determinant(world)==0.){gl_Position=vec4(2,2,2,1);return;}
mat3 inv=inverse(world);
vec3 n0=decodeNormal(vec2(p0.w,c0.w)),n1=decodeNormal(vec2(p1.w,c1.w));vec3 macro=mix(n0,n1,morphControl.z);if(dot(macro,macro)<1e-8)macro=n0;
v_macro=normalize(transpose(inv)*macro);v_normal=normalize(transpose(inv)*a_normal);
if(atlasInfo.w<.5){
vec3 right=normalize(inv*cc_matViewInv[0].xyz),up=normalize(inv*cc_matViewInv[1].xyz);
center+=(right*a_position.x+up*a_position.y)*morphControl.w;
}else{center+=a_position*morphControl.w;if(display.y<.5)v_color.rgb*=.6+.4*max(dot(a_normal,normalize(vec3(.6,.9,.8))),0.);}
v_world=(cc_matWorld*vec4(center,1)).xyz;gl_Position=cc_matViewProj*vec4(v_world,1);
}`;
        const frag = `precision highp float;
${constants}
${cameraBlock}
in vec4 v_color;in vec2 v_uv;in vec3 v_world;in vec3 v_normal;in vec3 v_macro;layout(location=0) out vec4 cc_FragColor;
vec4 CCFragOutput(vec4 color){vec3 c=max(color.rgb,vec3(0));color.rgb=mix(1.055*pow(c,vec3(1.0/2.4))-.055,c*12.92,lessThanEqual(c,vec3(.0031308)));return color;}
vec3 studio(vec3 r,float rough){
vec3 environment=mix(vec3(.012,.018,.028),vec3(.22,.29,.38),smoothstep(-.6,.9,r.y));
float key=pow(max(dot(r,normalize(vec3(-.55,.65,1))),0.),mix(180.,10.,rough));
float fill=pow(max(dot(r,normalize(vec3(.95,.2,.6))),0.),mix(100.,8.,rough));
float strip=(1.-smoothstep(.035+rough*.08,.07+rough*.2,abs(dot(r,normalize(vec3(.95,0.,.3)))+.16)))*smoothstep(-.1,.4,r.y)*smoothstep(-.2,.4,r.z);
return environment+vec3(7.5,6.9,5.7)*key+vec3(.5,2.1,4.2)*fill+vec3(3.8,4.1,4.5)*strip;
}
void main(){
float disk=dot(v_uv,v_uv);if(atlasInfo.w<.5&&disk>.25)discard;
vec3 color=v_color.rgb;
if(display.y>.5){
vec3 V=normalize(cc_matViewInv[3].xyz-v_world),macro=normalize(v_macro),N=normalize(v_normal);
if(dot(macro,V)<0.)macro=-macro;
if(atlasInfo.w<.5){vec2 q=v_uv*2.;vec3 bead=normalize(cc_matViewInv[0].xyz*q.x+cc_matViewInv[1].xyz*q.y+cc_matViewInv[2].xyz*sqrt(max(0.,1.-dot(q,q))));N=normalize(mix(macro,bead,.24));}
else{if(dot(N,V)<0.)N=-N;N=normalize(mix(macro,N,.7));}
vec3 base=clamp(color/max(display.x,1e-6),vec3(0),vec3(1)),f0=mix(vec3(.04),base,.82);
float facing=max(dot(N,V),0.),rim=pow(1.-facing,5.);
vec3 fresnel=f0+(1.-f0)*rim;
float diffuse=max(dot(N,normalize(vec3(-.5,.8,1))),0.);
color=base*(.07+.22*diffuse)+studio(reflect(-V,N),display.z)*fresnel;
color+=vec3(.12,.3,.45)*rim*.6;
vec3 macroReflection=reflect(-V,macro);
float coat=pow(max(dot(macroReflection,normalize(vec3(-.55,.65,1))),0.),mix(75.,8.,display.z));
float ribbon=(1.-smoothstep(.045+display.z*.1,.09+display.z*.2,abs(macroReflection.y-.3)))*smoothstep(.2,.6,macroReflection.z);
color+=vec3(2.8,3.,3.3)*coat*(1.-display.z*.65)+vec3(.65,.72,.85)*ribbon;
color*=display.x;
}
cc_FragColor=CCFragOutput(vec4(color,1));}`;
        const strip = (s: string) => s.replace(/layout\s*\([^)]*\)\s*/g, '');
        const resourceBlock = (name: string, set: number, binding: number) => ({ name, set, binding, defines: [] });
        effect = Object.assign(new EffectAsset(), {
            name: 'air-morph-field-v1',
            techniques: [
                {
                    passes: [
                        {
                            program: 'air-morph-field-v1',
                            rasterizerState: { cullMode: 0 },
                            depthStencilState: { depthTest: true, depthWrite: true },
                            blendState: { targets: [{ blend: false }] },
                            properties: {
                                morphControl: { type: Type.FLOAT4, value: [0, 0, 0, 0.1] },
                                atlasInfo: { type: Type.FLOAT4, value: [1, 1, 1, 0] },
                                display: { type: Type.FLOAT4, value: [1, 0, 0, 0] },
                                shapePositions: { type: Type.SAMPLER2D, value: 'white' },
                                shapeColors: { type: Type.SAMPLER2D, value: 'white' },
                            },
                        },
                    ],
                },
            ],
            shaders: [
                {
                    name: 'air-morph-field-v1',
                    glsl4: { vert, frag },
                    glsl3: { vert: strip(vert), frag: strip(frag) },
                    defines: [],
                    builtins: {
                        statistics: {
                            CC_EFFECT_USED_VERTEX_UNIFORM_VECTORS: 39,
                            CC_EFFECT_USED_FRAGMENT_UNIFORM_VECTORS: 23,
                        },
                        globals: {
                            blocks: [resourceBlock('CCCamera', 0, 1)],
                            samplerTextures: [],
                            buffers: [],
                            images: [],
                        },
                        locals: {
                            blocks: [resourceBlock('CCLocal', 2, 0)],
                            samplerTextures: [],
                            buffers: [],
                            images: [],
                        },
                    },
                    attributes: [
                        { name: 'a_position', format: Format.RGB32F, location: 0, defines: [] },
                        { name: 'a_normal', format: Format.RGB32F, location: 1, defines: [] },
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
                            stageFlags: ShaderStageFlagBit.VERTEX | ShaderStageFlagBit.FRAGMENT,
                            members: ['morphControl', 'atlasInfo', 'display'].map((name) => ({
                                name,
                                type: Type.FLOAT4,
                                count: 1,
                            })),
                        },
                    ],
                    samplerTextures: ['shapePositions', 'shapeColors'].map((name, i) => ({
                        name,
                        set: 1,
                        binding: i + 1,
                        type: Type.SAMPLER2D,
                        count: 1,
                        stageFlags: ShaderStageFlagBit.VERTEX,
                        defines: [],
                    })),
                },
            ],
            combinations: [],
        });
        effect.onLoaded();
    }
    const material = new Material();
    material.initialize({ effectAsset: effect });
    return material;
}
