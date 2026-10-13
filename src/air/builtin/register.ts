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
/**
 * AIR builtin assets for the WebGL 2-only runtime.
 * Convert upstream glsl4 into ESSL 3.00 (glsl3) while retaining UBO layout.
 * WebGL 1 shader lowering was retired with the browser support policy.
 */

import { builtinResMgr } from '../../cocos/asset/asset-manager';
import { Material } from '../../cocos/asset/assets/material';
import { EffectAsset } from '../../cocos/asset/assets/effect-asset';
import { effects } from './builtin-effects';
import { glsl4 } from './builtin-glsl4';
import { initBuiltinMaterial } from './builtin-material';

/**
 * glsl4(ESSL3+set 风格) → glsl3(ESSL3，WebGL2 设备)。去 set/binding 限定符、
 * UBO 块加 std140、attribute location 交给 bindAttribLocation。
 * 另：fixture 的 CCGlobal 仍含 cc_debug_view_composite_pack_1/2/3（引擎 4.0 已从
 * UBOGlobal 移除），若保留会使 shader 块大于引擎 UBO（"uniform buffer too small"）。
 */
function toGlsl3 (src: string): string {
    return src
        .replace(/#extension[^\n]*\n/g, '')
        .replace(/^[^\n]*cc_debug_view_composite_pack_\d+;[^\n]*$/gm, '')
        .replace(/layout\s*\(([^)]*)\)\s*/g, (m, inner: string) => (inner.indexOf('std140') !== -1 ? 'layout(std140) ' : ''))
        // Vulkan GLSL 的显式 int 类型（依赖 GL_EXT_shader_explicit_arithmetic_types_int32，
        // 扩展已在上面剥除）：ESSL 3.00 无 u32vecN。WebGL2 顶点属性按 float 格式
        // （glVertexAttribPointer）驱动，蒙皮 a_joints 网格格式为 RGBA32F，
        // 因此映射为 vecN（与上游引擎 glsl3 目标的 float joints 声明一致）。
        .replace(/\bu32vec([234])\b/g, 'vec$1');
}

/**
 * 块与采样器的 set/binding 分配（与引擎 layout graph 对齐：
 * rendering/define.ts 的 PipelineGlobalBindings / ModelLocalBindings / SetIndex）。
 * fixtures 的 builtins 未携带 set/binding（测试从不走设备创建路径），需在此补齐。
 */
const SET_GLOBAL = 0; // SetIndex.GLOBAL
const SET_MATERIAL = 1; // SetIndex.MATERIAL
const SET_LOCAL = 2; // SetIndex.LOCAL

// PipelineGlobalBindings: UBO_GLOBAL=0, UBO_CAMERA=1, UBO_SHADOW=2, UBO_CSM=3,
// SAMPLER_SHADOWMAP=4, SAMPLER_ENVIRONMENT=5, SAMPLER_SPOT_SHADOW_MAP=6, SAMPLER_DIFFUSEMAP=7
const GLOBAL_BLOCK_BINDINGS: Record<string, number> = {
    CCGlobal: 0, CCCamera: 1, CCShadow: 2, UBOCSM: 3,
};
const GLOBAL_SAMPLER_BINDINGS: Record<string, number> = {
    cc_shadowMap: 4, cc_environment: 5, cc_spotShadowMap10: 6, cc_spotShadowMap25: 6, cc_spotShadowMap50: 6, cc_diffuseMap: 7,
};
// ModelLocalBindings: UBO_LOCAL=0, UBO_FORWARD_LIGHTS=1, UBO_SKINNING_ANIMATION=2,
// UBO_SKINNING_TEXTURE=3, UBO_MORPH=4
// 注意：CCSkinning（实时非烘焙蒙皮的 uniform joints 块）与 UBOSkinning.NAME 同名，
// 引擎将 joints buffer 绑定在 UBO_SKINNING_TEXTURE 槽位（UBOSkinning.BINDING=3，
// 见 skinning-model.ts _updateLocalDescriptors），必须映射到 3，否则 fallback 到 0
// 会与 CCLocal 冲突，cc_joints 读到 CCLocal 的数据（表现为静止在 bind pose）。
const LOCAL_BLOCK_BINDINGS: Record<string, number> = {
    CCLocal: 0, CCForwardLight: 1, CCSkinningAnimation: 2, CCSkinning: 3, CCSkinningTexture: 3, CCMorph: 4,
};
const LOCAL_SAMPLER_BINDINGS: Record<string, number> = {
    cc_jointsTexture: 7, cc_morphPositionTexture: 8, cc_morphNormalTexture: 9, cc_morphTangentTexture: 10,
};

interface BuiltinsLike { globals?: BlockSetLike; locals?: BlockSetLike }
interface BlockSetLike { blocks?: { name: string; set?: number; binding?: number }[]; samplerTextures?: { name: string; set?: number; binding?: number }[] }

function assignEffectBindings (effect: EffectAsset): void {
    const b = (effect as unknown as { builtins?: BuiltinsLike }).builtins;
    if (!b) return;
    if (b.globals) {
        if (b.globals.blocks) b.globals.blocks.forEach((blk): void => {
            blk.set = SET_GLOBAL;
            blk.binding = GLOBAL_BLOCK_BINDINGS[blk.name] ?? 0;
        });
        if (b.globals.samplerTextures) b.globals.samplerTextures.forEach((st: any): void => {
            st.set = SET_GLOBAL;
            st.binding = GLOBAL_SAMPLER_BINDINGS[st.name] ?? 0;
        });
    }
    if (b.locals) {
        if (b.locals.blocks) b.locals.blocks.forEach((blk): void => {
            blk.set = SET_LOCAL;
            blk.binding = LOCAL_BLOCK_BINDINGS[blk.name] ?? 0;
        });
        if (b.locals.samplerTextures) b.locals.samplerTextures.forEach((st: any): void => {
            st.set = SET_LOCAL;
            st.binding = LOCAL_SAMPLER_BINDINGS[st.name] ?? 7;
        });
    }
    // 材质集采样器（mainTexture / albedoMap 等）：每 shader 内按声明顺序分配 binding
    effect.shaders.forEach((shaderInfo): void => {
        let materialBinding = 0;
        (shaderInfo.samplerTextures || []).forEach((st: any): void => {
            if (st.set === undefined) {
                st.set = SET_MATERIAL;
                st.binding = materialBinding++;
            }
        });
    });
}

export function registerBuiltinAirAssets (): void {
    // 1. 注册 builtin effects：glsl4 为引擎同源源码；glsl3 供 WebGL2 设备。
    effects.forEach((e, effectIndex) => {
        const effect = Object.assign(new EffectAsset(), e);
        effect.shaders.forEach((shaderInfo, shaderIndex) => {
            const source = glsl4[effectIndex][shaderIndex];
            if (source) {
                shaderInfo.glsl4 = source;
                shaderInfo.glsl3 = {
                    vert: toGlsl3(source.vert),
                    frag: toGlsl3(source.frag),
                };
            }
        });
        assignEffectBindings(effect);
        effect.hideInEditor = true;
        effect.onLoaded();
    });

    // 2. 注册 builtin 材质（missing/particle/sprite/standard 等）
    initBuiltinMaterial();

    // 3. Air 附加：标准 PBR / 无光照材质（Creator 中来自 internal db；独立引擎由 Air 提供）
    const standardMtl = new Material();
    standardMtl._uuid = 'builtin-standard-material';
    standardMtl.initialize({ effectName: 'builtin-standard' });
    builtinResMgr.addAsset(standardMtl._uuid, standardMtl);

    const unlitMtl = new Material();
    unlitMtl._uuid = 'builtin-unlit-material';
    unlitMtl.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: false } });
    builtinResMgr.addAsset(unlitMtl._uuid, unlitMtl);
}
