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
import { Type, Uniform, ShaderStageFlagBit } from '../../cocos/gfx';

let serial = 0;

/** Use the native sprite vertex format/stencil path with a per-material dark color. */
export function createBone2dTintEffect(crop = false): EffectAsset {
    const template = EffectAsset.get('builtin-sprite');
    if (!template) throw new Error('AIR_E_BONE2D_TWO_COLOR: sprite effect unavailable');
    const effect = new EffectAsset();
    effect.name = `air-bone2d-two-color-${++serial}`;
    effect.techniques = JSON.parse(JSON.stringify(template.techniques));
    effect.shaders = JSON.parse(JSON.stringify(template.shaders));
    effect.combinations = [];
    try {
        for (const shader of effect.shaders) {
            const original = shader.name;
            const binding = Math.max(-1, ...shader.blocks.map((b) => b.binding), ...shader.samplerTextures.map((s) => s.binding)) + 1;
            shader.blocks.push({
                name: 'Bone2dTint', binding, stageFlags: ShaderStageFlagBit.FRAGMENT,
                members: [new Uniform('bone2dDark', Type.FLOAT4, 1)],
            });
            if (crop) shader.blocks[shader.blocks.length - 1].members.push(new Uniform('bone2dCrop', Type.FLOAT4, 1));
            for (const variant of ['glsl3', 'glsl4'] as const) {
                const code = shader[variant];
                const precision = 'precision highp float;';
                const multiply = 'o *= color;';
                if (!code?.frag.includes(precision) || !code.frag.includes(multiply))
                    throw new Error(`AIR_E_BONE2D_TWO_COLOR: unexpected ${variant} sprite fragment`);
                const sample = 'CCSampleWithAlphaSeparated(cc_spriteTexture, uv0)';
                if (crop && !code.frag.includes(sample))
                    throw new Error(`AIR_E_BONE2D_TWO_COLOR: unexpected ${variant} sprite sampler`);
                const qualifier = variant === 'glsl4' ? `layout(set = 1, binding = ${binding}) ` : '';
                code.frag = code.frag.replace(precision, `${precision}\n${qualifier}uniform Bone2dTint { vec4 bone2dDark; ${crop ? 'vec4 bone2dCrop; ' : ''}};`)
                    .replace(multiply, 'vec3 bone2dDarkContribution = (vec3(1.0) - o.rgb) * bone2dDark.rgb;\no *= color;\no.rgb += bone2dDarkContribution;');
                if (crop) code.frag = code.frag.replace(sample,
                    'CCSampleWithAlphaSeparated(cc_spriteTexture, clamp(uv0, bone2dCrop.xy, bone2dCrop.zw))');
            }
            let hash = 2166136261;
            const source = shader.glsl3.frag + shader.glsl4.frag;
            for (let i = 0; i < source.length; ++i) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
            shader.hash = hash >>> 0;
            shader.name = `${original}|air-bone2d-two-color:${shader.hash}`;
            for (const technique of effect.techniques) for (const pass of technique.passes) {
                if (pass.program !== original) continue;
                pass.program = shader.name;
                pass.properties = { ...pass.properties, bone2dDark: { value: [0, 0, 0, 0], type: Type.FLOAT4 },
                    ...(crop ? { bone2dCrop: { value: [0, 0, 1, 1], type: Type.FLOAT4 } } : {}),
                };
            }
        }
        effect.onLoaded();
        cclegacy.game.off(cclegacy.Game.EVENT_RENDERER_INITED,
            (effect as unknown as { _precompile: () => void })._precompile, effect);
        return effect;
    } catch (error) {
        effect.destroy();
        throw error;
    }
}
