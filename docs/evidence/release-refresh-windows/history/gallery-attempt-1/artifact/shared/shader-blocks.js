/**
 * 用户自定义 Shader 的 UBO 块样板（G4 正式示例共用）。
 *
 * 背景：本引擎快照运行期 program-lib 按 gfxAPI 选源码变体（WebGL2→glsl3、WebGL1→glsl1、
 * 其它→glsl4），且无 chunk include 系统——用户 effect 的每个 shader 必须自带完整源码。
 * 引擎内建 effect 的注册路径（src/air/builtin/register.ts）同样手工携带三变体。
 *
 * 本模块提供与引擎 UBO 布局同源的块声明样板（CCGlobal/CCCamera/CCLocal，成员布局取自
 * src/air/builtin/builtin-glsl4.ts fixtures；CCGlobal 已按 register.ts 注记剔除引擎 4.0
 * 移除的 cc_debug_view_composite_pack_1/2/3），以及 effect JSON 的通用骨架，避免每个
 * 示例重复抄写并漂移。
 *
 * set/binding 约定（src/cocos/rendering/define.ts）：
 *   GLOBAL=0（CCGlobal:0，CCCamera:1）；MATERIAL=1（用户 Constants 块 binding 0 起，采样器顺延）；
 *   LOCAL=2（CCLocal:0）。
 * 数值枚举：gfx.Type FLOAT=13/FLOAT4=16/SAMPLER2D=28；gfx.Format RGB32F=32/RG32F=21；
 *   ShaderStageFlagBit VERTEX=1/FRAGMENT=16。
 */

// ---------------------------------------------------------------- glsl4 块声明

export const UBO_CC_CAMERA_GLSL4 = `layout(set = 0, binding = 1) uniform CCCamera {
  highp   mat4 cc_matView;
  highp   mat4 cc_matViewInv;
  highp   mat4 cc_matProj;
  highp   mat4 cc_matProjInv;
  highp   mat4 cc_matViewProj;
  highp   mat4 cc_matViewProjInv;
  highp   vec4 cc_cameraPos;
  mediump vec4 cc_surfaceTransform;
  mediump vec4 cc_screenScale;
  mediump vec4 cc_exposure;
  mediump vec4 cc_mainLitDir;
  mediump vec4 cc_mainLitColor;
  mediump vec4 cc_ambientSky;
  mediump vec4 cc_ambientGround;
  mediump vec4 cc_fogColor;
  mediump vec4 cc_fogBase;
  mediump vec4 cc_fogAdd;
  mediump vec4 cc_nearFar;
  mediump vec4 cc_viewPort;
};`;

export const UBO_CC_LOCAL_GLSL4 = `layout(set = 2, binding = 0) uniform CCLocal {
  highp mat4 cc_matWorld;
  highp mat4 cc_matWorldIT;
  highp vec4 cc_lightingMapUVParam;
  highp vec4 cc_localShadowBias;
};`;

export const UBO_CC_GLOBAL_GLSL4 = `layout(set = 0, binding = 0) uniform CCGlobal {
  highp   vec4 cc_time;
  mediump vec4 cc_screenSize;
  mediump vec4 cc_nativeSize;
  mediump vec4 cc_debug_view_mode;
};`;

// ---------------------------------------------------------------- glsl1 展开（UBO → 独立 uniform）

export const UBO_CC_CAMERA_GLSL1 = `uniform highp mat4 cc_matView;
uniform highp mat4 cc_matViewInv;
uniform highp mat4 cc_matProj;
uniform highp mat4 cc_matProjInv;
uniform highp mat4 cc_matViewProj;
uniform highp mat4 cc_matViewProjInv;
uniform highp vec4 cc_cameraPos;
uniform mediump vec4 cc_surfaceTransform;
uniform mediump vec4 cc_screenScale;
uniform mediump vec4 cc_exposure;
uniform mediump vec4 cc_mainLitDir;
uniform mediump vec4 cc_mainLitColor;
uniform mediump vec4 cc_ambientSky;
uniform mediump vec4 cc_ambientGround;
uniform mediump vec4 cc_fogColor;
uniform mediump vec4 cc_fogBase;
uniform mediump vec4 cc_fogAdd;
uniform mediump vec4 cc_nearFar;
uniform mediump vec4 cc_viewPort;`;

export const UBO_CC_LOCAL_GLSL1 = `uniform highp mat4 cc_matWorld;
uniform highp mat4 cc_matWorldIT;
uniform highp vec4 cc_lightingMapUVParam;
uniform highp vec4 cc_localShadowBias;`;

export const UBO_CC_GLOBAL_GLSL1 = `uniform highp vec4 cc_time;
uniform mediump vec4 cc_screenSize;
uniform mediump vec4 cc_nativeSize;
uniform mediump vec4 cc_debug_view_mode;`;

// ---------------------------------------------------------------- 顶点/片元骨架

/** 标准 MVP 顶点（a_position loc0 RGB32F + a_texCoord loc2 RG32F → v_uv）。 */
export function standardVert() {
    const body4 = `in vec3 a_position;
in vec2 a_texCoord;
out mediump vec2 v_uv;
void main () {
  v_uv = a_texCoord;
  gl_Position = cc_matViewProj * cc_matWorld * vec4(a_position, 1.0);
}`;
    return {
        glsl4: 'precision highp float;\n' + UBO_CC_CAMERA_GLSL4 + '\n' + UBO_CC_LOCAL_GLSL4 + '\n' + body4,
        glsl3:
            'precision highp float;\n' +
            UBO_CC_CAMERA_GLSL4.replace(/layout\s*\([^)]*\)\s*/g, '') +
            '\n' +
            UBO_CC_LOCAL_GLSL4.replace(/layout\s*\([^)]*\)\s*/g, '') +
            '\n' +
            body4,
        glsl1: `precision highp float;
${UBO_CC_CAMERA_GLSL1}
${UBO_CC_LOCAL_GLSL1}
attribute highp vec3 a_position;
attribute mediump vec2 a_texCoord;
varying mediump vec2 v_uv;
void main () {
  v_uv = a_texCoord;
  gl_Position = cc_matViewProj * cc_matWorld * vec4(a_position, 1.0);
}`,
    };
}

/** 片元三变体包装：调用方给出 glsl4 主体（含 Constants 块与 cc_FragColor 输出）。
 * glsl3 = 去 set/binding；glsl1 需调用方手写（texture2D/gl_FragColor/varying 差异不可正则安全降写）。 */
export function fragVariants(glsl4Frag, glsl1Frag) {
    return {
        glsl4: glsl4Frag,
        glsl3: glsl4Frag.replace(/layout\s*\([^)]*\)\s*/g, ''),
        glsl1: glsl1Frag,
    };
}

// ---------------------------------------------------------------- effect JSON 骨架

/** 与 src/air/builtin/builtin-effects.ts fixtures 同构的编译后 effect JSON。
 * @param opts { name, prog, hash, properties: {name:{value,type}}, members: [{name,type,count}],
 *               samplerTextures: [{name,type,binding}], defines: [] } */
export function makeUserEffectJson(opts) {
    const members = opts.members || [];
    const samplers = (opts.samplerTextures || []).map((st, i) => ({
        name: st.name,
        type: st.type || 28,
        count: st.count || 1,
        defines: [],
        stageFlags: 16,
        set: 1,
        binding: st.binding !== undefined ? st.binding : i,
    }));
    return {
        name: opts.name,
        techniques: [
            {
                passes: [
                    {
                        program: opts.prog,
                        rasterizerState: { cullMode: 0 },
                        depthStencilState: { depthTest: true, depthWrite: true },
                        blendState: { targets: [{ blend: false }] },
                        properties: opts.properties || {},
                    },
                ],
            },
        ],
        shaders: [
            {
                name: opts.prog,
                hash: opts.hash,
                builtins: {
                    statistics: {
                        CC_EFFECT_USED_VERTEX_UNIFORM_VECTORS: 47,
                        CC_EFFECT_USED_FRAGMENT_UNIFORM_VECTORS: 4 + members.length + samplers.length * 4,
                    },
                    globals: {
                        blocks: [
                            { name: 'CCGlobal', defines: [], set: 0, binding: 0 },
                            { name: 'CCCamera', defines: [], set: 0, binding: 1 },
                        ],
                        samplerTextures: [],
                        buffers: [],
                        images: [],
                    },
                    locals: {
                        blocks: [{ name: 'CCLocal', defines: [], set: 2, binding: 0 }],
                        samplerTextures: [],
                        buffers: [],
                        images: [],
                    },
                },
                defines: opts.defines || [],
                attributes: [
                    { name: 'a_position', defines: [], format: 32, location: 0 },
                    { name: 'a_texCoord', defines: [], format: 21, location: 2 },
                ],
                blocks: [
                    {
                        name: 'Constants',
                        defines: [],
                        binding: 0,
                        stageFlags: 16,
                        members,
                    },
                ],
                samplerTextures: samplers,
                buffers: [],
                images: [],
                textures: [],
                samplers: [],
                subpassInputs: [],
            },
        ],
        combinations: [],
        hideInEditor: false,
    };
}

/** 注册入口（探针验证过的顺序纪律）：必须在 createAirApp 之后调用（GAP-B1）。 */
export function registerUserEffect(EffectAssetCtor, json, glsl) {
    const effect = Object.assign(new EffectAssetCtor(), json);
    effect.shaders[0].glsl4 = { vert: glsl.vert.glsl4, frag: glsl.frag.glsl4 };
    effect.shaders[0].glsl3 = { vert: glsl.vert.glsl3, frag: glsl.frag.glsl3 };
    effect.shaders[0].glsl1 = { vert: glsl.vert.glsl1, frag: glsl.frag.glsl1 };
    effect.onLoaded(); // programLib.register + EffectAsset.register（引擎内建同款入口）
    return effect;
}
