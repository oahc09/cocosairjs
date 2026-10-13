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
import { Material } from '../../cocos/asset/assets/material';
import type { TextureBase } from '../../cocos/asset/assets/texture-base';
import { Sprite } from '../../cocos/2d/components/sprite';
import { SpriteFrameEvent } from '../../cocos/2d/assets/sprite-frame';
import { Vec4 } from '../../cocos/core/math';
import { cclegacy } from '../../cocos/core/global-exports';
import { Type, ShaderStageFlagBit, Uniform, SampleType } from '../../cocos/gfx';

export interface AirSpriteMaskOptions {
    channel?: 'alpha' | 'red';
    mode?: 'soft' | 'threshold';
    threshold?: number;
    inverted?: boolean;
}
let serial = 0;
/** Per-sprite mask in normalized content UVs; supports trimmed/rotated atlas frames. */
export function attachAirSpriteMask(sprite: Sprite, texture: TextureBase, options: AirSpriteMaskOptions = {}): {
    readonly material: Material; update(): void; dispose(): void;
} {
    if (!['alpha', 'red'].includes(options.channel ?? 'alpha') || !['soft', 'threshold'].includes(options.mode ?? 'soft')
        || !Number.isFinite(options.threshold ?? 0.1) || (options.threshold ?? 0.1) < 0 || (options.threshold ?? 0.1) > 1
        || !sprite.spriteFrame || !texture.isValid) throw new Error('AIR_E_SPRITE_MASK_OPTIONS');
    if (sprite.customMaterial) throw new Error('AIR_E_SPRITE_MASK_MATERIAL: detach the existing custom material first');
    const source = EffectAsset.get('builtin-sprite'); if (!source) throw new Error('AIR_E_SPRITE_MASK_BUILTIN');
    const effect = new EffectAsset(); effect.name = `air-sprite-mask-${++serial}`;
    effect.techniques = JSON.parse(JSON.stringify(source.techniques)); effect.shaders = JSON.parse(JSON.stringify(source.shaders)); effect.combinations = [];
    const fragment = `
        vec2 air_maskUV = vec2(dot(airMaskRow0.xyz, vec3(uv0, 1.0)), dot(airMaskRow1.xyz, vec3(uv0, 1.0)));
        vec4 air_sample = texture(airMaskTexture, clamp(air_maskUV, 0.0, 1.0));
        float air_visibility = mix(air_sample.a, air_sample.r, airMaskParams.x);
        air_visibility *= step(0.0, air_maskUV.x) * step(air_maskUV.x, 1.0) * step(0.0, air_maskUV.y) * step(air_maskUV.y, 1.0);
        air_visibility = mix(air_visibility, 1.0 - air_visibility, airMaskParams.w);
        if (airMaskParams.y > 0.5) { if (air_visibility < airMaskParams.z) discard; }
        else o.a *= air_visibility;
    `;
    for (const shader of effect.shaders) {
        const original = shader.name;
        shader.blocks.push({ name: 'AirMask', binding: 1, stageFlags: ShaderStageFlagBit.FRAGMENT, members: [
            new Uniform('airMaskRow0', Type.FLOAT4, 1), new Uniform('airMaskRow1', Type.FLOAT4, 1), new Uniform('airMaskParams', Type.FLOAT4, 1),
        ] });
        shader.samplerTextures.push({ name: 'airMaskTexture', binding: 0, type: Type.SAMPLER2D, count: 1, stageFlags: ShaderStageFlagBit.FRAGMENT, sampleType: SampleType.FLOAT });
        for (const variant of ['glsl3', 'glsl4'] as const) {
            const code = shader[variant]; if (!code?.frag.includes('ALPHA_TEST(o);')) throw new Error('AIR_E_SPRITE_MASK_TEMPLATE');
            const header = `${variant === 'glsl4' ? 'layout(set = 1, binding = 1) ' : ''}uniform AirMask { vec4 airMaskRow0; vec4 airMaskRow1; vec4 airMaskParams; };\n${variant === 'glsl4' ? 'layout(set = 1, binding = 0) ' : ''}uniform sampler2D airMaskTexture;`;
            code.frag = code.frag.replace('precision highp float;', `precision highp float;\n${header}`).replace('ALPHA_TEST(o);', fragment + '\nALPHA_TEST(o);');
        }
        let hash = 2166136261; const code = JSON.stringify([shader.glsl3, shader.glsl4]);
        for (let i = 0; i < code.length; i++) hash = Math.imul(hash ^ code.charCodeAt(i), 16777619);
        shader.hash = hash >>> 0; shader.name = `${original}|air-mask:${shader.hash}`;
        for (const technique of effect.techniques) for (const pass of technique.passes) {
            if (pass.program === original) pass.program = shader.name;
            pass.properties = { ...pass.properties, airMaskRow0: { value: [1, 0, 0, 0], type: Type.FLOAT4 }, airMaskRow1: { value: [0, 1, 0, 0], type: Type.FLOAT4 }, airMaskParams: { value: [0, 0, 0.1, 0], type: Type.FLOAT4 }, airMaskTexture: { value: 'white', type: Type.SAMPLER2D } };
        }
    }
    effect.onLoaded();
    cclegacy.game.off(cclegacy.Game.EVENT_RENDERER_INITED, (effect as unknown as { _precompile: () => void })._precompile, effect);
    const material = new Material();
    try { material.initialize({ effectAsset: effect, defines: { USE_TEXTURE: true, USE_ALPHA_TEST: false, CC_USE_EMBEDDED_ALPHA: false } }); }
    catch (error) { material.destroy(); effect.destroy(); throw error; }
    material.setProperty('airMaskTexture', texture);
    material.setProperty('airMaskParams', new Vec4(options.channel === 'red' ? 1 : 0, options.mode === 'threshold' ? 1 : 0, options.threshold ?? 0.1, options.inverted ? 1 : 0));
    let disposed = false, frame = sprite.spriteFrame;
    const update = (): void => {
        if (disposed) throw new Error('AIR_E_SPRITE_MASK_DISPOSED');
        if (!sprite.isValid || !sprite.spriteFrame) throw new Error('AIR_E_SPRITE_MASK_FRAME');
        if (frame !== sprite.spriteFrame) { frame?.off(SpriteFrameEvent.UV_UPDATED, update); frame = sprite.spriteFrame; frame.on(SpriteFrameEvent.UV_UPDATED, update); }
        const uv = frame.uv;
        // Frame UV corners: bottom-left, bottom-right, top-left, top-right.
        const ox = uv[4], oy = uv[5], ux = uv[6] - ox, uy = uv[7] - oy, vx = uv[0] - ox, vy = uv[1] - oy;
        const determinant = ux * vy - uy * vx;
        if (!Number.isFinite(determinant) || determinant === 0) throw new Error('AIR_E_SPRITE_MASK_UV');
        material.setProperty('airMaskRow0', new Vec4(vy / determinant, -vx / determinant, (vx * oy - vy * ox) / determinant, 0));
        material.setProperty('airMaskRow1', new Vec4(-uy / determinant, ux / determinant, (uy * ox - ux * oy) / determinant, 0));
    };
    try { update(); } catch (error) { material.destroy(); effect.destroy(); throw error; }
    texture.addRef(); frame.on(SpriteFrameEvent.UV_UPDATED, update); sprite.customMaterial = material;
    return { material, update, dispose() {
        if (disposed) return; disposed = true; frame?.off(SpriteFrameEvent.UV_UPDATED, update);
        if (sprite.isValid && sprite.customMaterial === material) sprite.customMaterial = null;
        material.destroy(); effect.destroy(); texture.decRef(false);
    } };
}
