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

let effectSerial = 0;

function hashSource (text: string): number {
    let hash = 2166136261;
    for (let i = 0; i < text.length; ++i) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return hash >>> 0;
}

/**
 * Creates an independently owned WebGL2 unlit effect with per-fragment accurate fog.
 * Initialize AIR builtin assets first. The builtin-unlit template is left unchanged.
 * Its native world matrix, instancing, skinning and morph code is retained.
 */
export function createAirUnlitFogEffect (): EffectAsset {
    const source = EffectAsset.get('builtin-unlit');
    if (!source) throw new Error('[AIR_UNLIT_FOG] initialize AIR builtin assets before creating the effect');
    const effect = new EffectAsset();
    effect.name = `air-unlit-fog-${++effectSerial}`;
    effect.techniques = JSON.parse(JSON.stringify(source.techniques));
    effect.shaders = JSON.parse(JSON.stringify(source.shaders));
    effect.combinations = [];
    for (const shader of effect.shaders) {
        const previousName = shader.name;
        for (const variant of ['glsl3', 'glsl4'] as const) {
            const code = shader[variant];
            const vertexCall = 'CC_TRANSFER_FOG(matWorld * position);';
            const fragmentCall = 'CC_APPLY_FOG(o);';
            if (!code || !code.vert.includes(vertexCall) || !code.frag.includes(fragmentCall)) {
                throw new Error(`[AIR_UNLIT_FOG] incompatible builtin-unlit ${variant} source; no effect was registered`);
            }
            const qualifier = variant === 'glsl4' ? 'layout(location = 3) ' : '';
            const precision = 'precision highp float;';
            if (!code.vert.includes(precision) || !code.frag.includes(precision)) {
                throw new Error(`[AIR_UNLIT_FOG] incompatible builtin-unlit ${variant} precision preamble`);
            }
            code.vert = code.vert.replace(precision, `${precision}\n${qualifier}out highp vec3 air_fogWorldPos;`)
                .split(vertexCall).join(`air_fogWorldPos = (matWorld * position).xyz;\n${vertexCall}`);
            code.frag = code.frag.replace(precision, `${precision}\n${qualifier}in highp vec3 air_fogWorldPos;`)
                .split(fragmentCall).join('CC_APPLY_FOG(o, air_fogWorldPos);');
        }
        shader.hash = hashSource(JSON.stringify([shader.hash, shader.glsl3, shader.glsl4]));
        shader.name = `${previousName}|air-fog:${shader.hash}`;
        for (const technique of effect.techniques) {
            for (const pass of technique.passes) if (pass.program === previousName) pass.program = shader.name;
        }
    }
    effect.onLoaded();
    // This owned specialization has no precompile combinations. Remove only its
    // deferred callback, including calls made after RENDERER_INITED has already fired.
    // Material initialization still compiles the selected shader variant lazily.
    const precompile = (effect as unknown as { _precompile: () => void })._precompile;
    cclegacy.game.off(cclegacy.Game.EVENT_RENDERER_INITED, precompile, effect);
    return effect;
}
