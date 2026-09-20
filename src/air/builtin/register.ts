/**
 * Air 内建资产注册（glsl1 适配）。
 *
 * 本引擎快照的 Web 设备为 WebGL1（API.WEBGL，见 src/cocos/gfx/webgl/webgl-swapchain.ts
 * getContext('webgl')），着色器版本为 glsl1（ESSL 1.00）。引擎测试 fixtures
 * （builtin-effects/builtin-glsl4，与本引擎同源）只提供 glsl4 源码，因此这里内置一个
 * glsl4 → glsl1 降写器：去 set/binding/layout 限定符、UBO 展开为独立 uniform、
 * in/out → attribute/varying、texture() → texture2D()、fragment 输出映射到 gl_FragColor。
 *
 * 注册时机：EVENT_POST_SUBSYSTEM_INIT（effects 先于材质），
 * 材质 pass 编译由 fixtures 的 builtin-material.ts 在 EVENT_GAME_INITED 完成。
 */

import { builtinResMgr } from '../../cocos/asset/asset-manager';
import { Material } from '../../cocos/asset/assets/material';
import { EffectAsset } from '../../cocos/asset/assets/effect-asset';
import { effects } from './builtin-effects';
import { glsl4 } from './builtin-glsl4';
import { initBuiltinMaterial } from './builtin-material';

type GLSLSource = { vert: string; frag: string };

/** UBO 成员展开：`layout(std140) uniform CCGlobal { highp mat4 cc_matView; ... };` → 逐条 `uniform` 声明 */
function expandUniformBlocks (src: string, blockName: string): string {
    // 匹配（可能带修饰的）uniform block：uniform BlockName { ... };
    const re = new RegExp(`uniform\\s+${blockName}\\s*\\{([^}]*)\\}\\s*;`, 'g');
    return src.replace(re, (_m, body: string) => body
        .split(';')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
            // 成员形如 `highp mat4 cc_matView` / `mediump vec4 cc_screenSize[2]`
            const m = line.match(/^([a-zA-Z]+\s+)?([a-zA-Z_0-9]+\s+)([a-zA-Z_0-9]+(\[[0-9]+\])?)$/);
            if (!m) return '';
            const precision = (m[1] || '').trim();
            const type = m[2].trim();
            const name = m[3];
            return `uniform ${precision ? precision + ' ' : ''}${type} ${name};`;
        })
        .join('\n'));
}

function expandAllUniformBlocks (src: string): string {
    // 已去掉 set/binding 修饰后，形如 `uniform NAME { ... };` 的块
    const names: string[] = [];
    const re = /uniform\s+([A-Za-z_0-9]+)\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) names.push(m[1]);
    let out = src;
    for (const n of names) out = expandUniformBlocks(out, n);
    return out;
}

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

function toGlsl1 (src: string, stage: 'vert' | 'frag'): string {
    let out = src;
    // 0. 去掉扩展声明（ESSL1 不认识 ESSL3 的扩展）与已废弃的 composite pack 成员
    out = out.replace(/#extension[^\n]*\n/g, '');
    out = out.replace(/^[^\n]*cc_debug_view_composite_pack_\d+;[^\n]*$/gm, '');
    // 0.1 Vulkan GLSL 显式 int 类型 → ESSL1 合法类型（u32vec4 a_joints 为蒙皮顶点属性，
    //     网格格式 RGBA32F，映射为 vec4 后由 glsl1 的 attribute float 通路读取）
    out = out.replace(/\bu32vec([234])\b/g, 'vec$1');
    // 1. 去掉 Vulkan 风格 set/binding 与 location 限定符（仅限行内括号段）
    out = out.replace(/layout\s*\(([^)]*)\)\s*/g, '');
    // 2. 展开所有 uniform block 为独立 uniform
    out = expandAllUniformBlocks(out);
    // 3. 纹理采样函数名
    out = out.replace(/\btexture\s*\(/g, 'texture2D(');
    // 4. stage 特有处理：行首全局声明优先；再兜底处理紧跟在语句后的同 Line 声明
    if (stage === 'vert') {
        out = out.replace(/^\s*in\s+/gm, 'attribute ');
        out = out.replace(/([;}\n])\s*in\s+/g, '$1attribute ');
        out = out.replace(/^\s*out\s+/gm, 'varying ');
        out = out.replace(/([;}\n])\s*out\s+/g, '$1varying ');
    } else {
        out = out.replace(/^\s*in\s+/gm, 'varying ');
        out = out.replace(/([;}\n])\s*in\s+/g, '$1varying ');
    }
    // 5. 清理残留空行
    out = out.replace(/\n\s*\n\s*\n/g, '\n\n');
    return out;
}

/** fragment 输出变量重命名：删除 `out vec4 <name>;` 声明并把该变量名改写为 gl_FragColor */
function renameFragOutput (fragSrc: string): string {
    const names: string[] = [];
    const src = fragSrc.replace(/\bout\s+vec4\s+([A-Za-z_0-9]+)\s*;/g, (_m, name: string) => {
        names.push(name);
        return '';
    });
    if (!names.length) return fragSrc;
    let out = src;
    for (const name of names) {
        out = out.replace(new RegExp(`\\b${name}\\b`, 'g'), 'gl_FragColor');
    }
    return out;
}

function makeGlsl1 (source: GLSLSource): GLSLSource {
    const vert = renameFragOutput(toGlsl1(source.vert, 'vert'));
    const frag = renameFragOutput(toGlsl1(source.frag, 'frag'));
    return { vert, frag };
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
    // 1. 注册 builtin effects：glsl4 为引擎同源源码；glsl3 供 WebGL2 设备、
    //    glsl1 供 WebGL1 回退设备（均为 Air 侧降写生成）
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
                shaderInfo.glsl1 = makeGlsl1(source);
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
