/**
 * neon-city — 霓虹夜城：实例化楼群 + 车流光条 + 雾雨（Agent Bench E07 参照实现，v2 视觉版）。
 *
 * 能力组合（每个都是真实子系统，非单 API 演示）：
 *   1. GPU 实例化：~450 楼体共享 1 个 mesh + 1 个自定义材质（USE_INSTANCING），1 组 ≤1024 实例 1 draw；
 *   2. 自定义 GLSL ×3：neon-sky（渐变穹顶 + 程序星空 + 地平线光污染）、
 *      neon-facade（按层供电的窗格 + fwidth 抗锯齿 + 距离 LOD 退化平均辉光 + 顶点雾）、
 *      neon-glow（预乘加法混合 + 呼吸脉冲 + 时间槽闪烁 + RAIN_MODE 顶点动画雨）；
 *   3. 车流光条：72 辆双向车沿两条大道移动（CPU 仅更新 transform）；
 *   4. 雨：650 条光丝静态放置，下落动画完全由顶点着色器按 cc_time 计算（CPU 零成本）；
 *   5. 天际线细节：楼顶航空警示灯（红脉冲）、最高楼群天线尖塔、中央光柱、广告牌地面光池；
 *   6. 场景雾：scene.globals.fog（EXP）驱动内建材质（地面），自定义着色器用同参数手动雾；
 *   7. 相机交互：拖拽环绕 / 滚轮缩放；FPS HUD（DOM 覆盖层，EVENT_AFTER_DRAW 计帧）。
 *
 * 契约（Agent Bench 验证通道）：
 *   window.__appReady —— 首帧 AFTER_DRAW 后置 true；
 *   window.__bench = { getState(), reset() } —— getState 返回 {fps, buildings, cars, rainDrops,
 *   billboards, frames, seconds}；reset 以新种子重建城市（共享 mesh/材质不销毁，仅重建节点树）。
 *
 * 实例化纪律（skills/cocosair-performance/references/instancing.md）：
 *   USE_INSTANCING 必须在共享材质 initialize 的 defines 里；renderer.setSharedMaterial（renderer.material
 *   会实例化 Pass 并把宏重置为 false）；>1024 实例自动分组。顶点按引擎内建 CCGetWorldMatrixFull
 *   同款方式从 a_matWorld0/1/2 拼装实例世界矩阵。
 */

import {
    createAirApp,
    createAirPostProcess,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    Layers,
    Vec3,
    Vec4,
    Color,
    utils,
    primitives,
    director,
    Director,
    EffectAsset,
    Billboard,
    Texture2D,
    ImageAsset,
} from 'cocosair';
import {
    UBO_CC_GLOBAL_GLSL4,
    UBO_CC_GLOBAL_GLSL1,
    UBO_CC_CAMERA_GLSL4,
    UBO_CC_CAMERA_GLSL1,
    UBO_CC_LOCAL_GLSL4,
    UBO_CC_LOCAL_GLSL1,
} from '../../shared/shader-blocks.js';

// ===========================================================================
// GLSL — neon-sky / neon-facade / neon-glow
// ===========================================================================

const stripLayout = (src: string): string => src.replace(/layout\s*\([^)]*\)\s*/g, '');

/** 实例化世界矩阵拼装 + 世界缩放提取（与引擎 CCGetWorldMatrixFull 同构）。 */
const MAT_WORLD_HELPERS_GLSL4 = `
mat4 airWorldMatrix () {
  #if USE_INSTANCING
    return mat4(
      vec4(a_matWorld0.xyz, 0.0),
      vec4(a_matWorld1.xyz, 0.0),
      vec4(a_matWorld2.xyz, 0.0),
      vec4(a_matWorld0.w, a_matWorld1.w, a_matWorld2.w, 1.0)
    );
  #else
    return cc_matWorld;
  #endif
}
vec3 airWorldScale (mat4 m) {
  return vec3(length(m[0].xyz), length(m[1].xyz), length(m[2].xyz));
}
float airHash (vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z); // sin-free: D3D large-arg sin ULP instability gets amplified by *43758 into per-pixel dots
}
float airHash11 (float p) {
  return airHash(vec2(p, p * 1.37));
}`;

// ---- neon-sky：渐变穹顶 + 程序星空 + 地平线光污染 ----

const SKY_VERT_GLSL4 = `${UBO_CC_CAMERA_GLSL4}
${UBO_CC_LOCAL_GLSL4}
in vec3 a_position;
out highp vec3 v_dir;
void main () {
  v_dir = a_position;
  gl_Position = cc_matViewProj * cc_matWorld * vec4(a_position, 1.0);
}`;

const SKY_FRAG_GLSL4 = `precision highp float;
${UBO_CC_GLOBAL_GLSL4}
in highp vec3 v_dir;
layout(location = 0) out vec4 cc_FragColor;
float airHashS (vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z); // sin-free：D3D 大参数 sin 的 ULP 不稳定性会被 *43758 放大成逐像素点阵
}
void main () {
  vec3 d = normalize(v_dir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = vec3(0.15, 0.09, 0.28);
  vec3 mid = vec3(0.045, 0.028, 0.105);
  vec3 zenith = vec3(0.006, 0.006, 0.018);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
  col = mix(col, zenith, smoothstep(0.18, 0.65, h));
  // 城市光污染：贴地平线的暖紫辉光
  col += vec3(0.34, 0.13, 0.11) * exp(-h * 13.0) * 0.75;
  // 程序星空：方位/仰角网格 hash，稀疏点 + 闪烁
  if (d.y > 0.015) {
    float az = atan(d.z, d.x) * 57.29578;
    float el = asin(clamp(d.y, -1.0, 1.0)) * 57.29578;
    vec2 g = vec2(az * 0.9, el * 1.5);
    vec2 cell = floor(g);
    float rnd = airHashS(cell);
    float star = step(0.984, rnd);
    vec2 pos = vec2(airHashS(cell + 7.3), airHashS(cell + 3.1)) * 0.6 + 0.2;
    float dd = length(fract(g) - pos);
    float tw = 0.55 + 0.45 * sin(cc_time.x * (0.8 + rnd * 2.6) + rnd * 41.0);
    float amp = smoothstep(0.015, 0.14, d.y) * (0.35 + rnd);
    col += vec3(0.9, 0.95, 1.0) * star * smoothstep(0.22, 0.0, dd) * tw * amp * 1.5;
  }
  cc_FragColor = vec4(col * 0.15, 1.0);
}`;

const SKY_VERT_GLSL1 = `${UBO_CC_CAMERA_GLSL1}
${UBO_CC_LOCAL_GLSL1}
attribute highp vec3 a_position;
varying highp vec3 v_dir;
void main () {
  v_dir = a_position;
  gl_Position = cc_matViewProj * cc_matWorld * vec4(a_position, 1.0);
}`;

const SKY_FRAG_GLSL1 = `precision highp float;
uniform highp vec4 cc_time;
varying highp vec3 v_dir;
float airHashS (vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main () {
  vec3 d = normalize(v_dir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(vec3(0.15, 0.09, 0.28), vec3(0.045, 0.028, 0.105), smoothstep(0.0, 0.22, h));
  col = mix(col, vec3(0.006, 0.006, 0.018), smoothstep(0.18, 0.65, h));
  col += vec3(0.32, 0.12, 0.10) * exp(-h * 16.0) * 0.55;
  gl_FragColor = vec4(col, 1.0);
}`;

// ---- neon-facade：按层供电窗格 + 抗锯齿 + 距离 LOD ----

const FACADE_VERT_BODY_GLSL4 = `${UBO_CC_CAMERA_GLSL4}
${UBO_CC_LOCAL_GLSL4}
layout(set = 1, binding = 0) uniform Constants {
  vec4 fogColor;
  vec4 facadeParams;
};
in vec3 a_position;
in vec3 a_normal;
#if USE_INSTANCING
in vec4 a_matWorld0;
in vec4 a_matWorld1;
in vec4 a_matWorld2;
#endif
${MAT_WORLD_HELPERS_GLSL4}
out highp vec3 v_objPos;
out highp vec3 v_worldPos;
out mediump vec3 v_normalW;
out mediump float v_seed;
out mediump float v_height;
out mediump float v_fog;
out mediump float v_lod;
out mediump vec3 v_tintAvg;
vec3 neonPaletteV (float t) {
  vec3 cyan    = vec3(0.16, 0.90, 1.00);
  vec3 magenta = vec3(1.00, 0.24, 0.94);
  vec3 amber   = vec3(1.00, 0.70, 0.28);
  vec3 white   = vec3(0.82, 0.90, 1.00);
  vec3 c = mix(cyan, magenta, clamp(t * 4.0, 0.0, 1.0));
  c = mix(c, amber, clamp(t * 4.0 - 1.0, 0.0, 1.0));
  c = mix(c, white, clamp(t * 4.0 - 2.0, 0.0, 1.0));
  return c;
}
void main () {
  mat4 world = airWorldMatrix();
  vec3 scale = airWorldScale(world);
  v_objPos = a_position * scale;
  v_worldPos = (world * vec4(a_position, 1.0)).xyz;
  v_normalW = normalize(mat3(world) * a_normal);
  v_seed = airHash(world[3].xz + world[3].y * 0.37);
  v_height = scale.y;
  float dist = distance(v_worldPos, cc_cameraPos.xyz);
  v_fog = clamp(1.0 - exp(-pow(dist * facadeParams.x, 2.0)), 0.0, 1.0);
  v_lod = smoothstep(35.0, 110.0, dist);
  // 该楼的平均窗色（LOD 远景退化为柔和光柱）
  float toneSeed = airHash11(v_seed * 31.0);
  v_tintAvg = neonPaletteV(toneSeed) * (0.05 + 0.11 * airHash11(v_seed * 7.7));
  gl_Position = cc_matViewProj * vec4(v_worldPos, 1.0);
}`;

const FACADE_FRAG_GLSL4 = `precision highp float;
${UBO_CC_GLOBAL_GLSL4}
layout(set = 1, binding = 0) uniform Constants {
  vec4 fogColor;
  vec4 facadeParams;
};
in highp vec3 v_objPos;
in highp vec3 v_worldPos;
in mediump vec3 v_normalW;
in mediump float v_seed;
in mediump float v_height;
in mediump float v_fog;
in mediump float v_lod;
in mediump vec3 v_tintAvg;
layout(location = 0) out vec4 cc_FragColor;
float airHashF (vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z); // sin-free：D3D 大参数 sin 的 ULP 不稳定性会被 *43758 放大成逐像素点阵
}
vec3 neonPalette (float t) {
  vec3 cyan    = vec3(0.16, 0.90, 1.00);
  vec3 magenta = vec3(1.00, 0.24, 0.94);
  vec3 amber   = vec3(1.00, 0.70, 0.28);
  vec3 white   = vec3(0.82, 0.90, 1.00);
  vec3 c = mix(cyan, magenta, clamp(t * 4.0, 0.0, 1.0));
  c = mix(c, amber, clamp(t * 4.0 - 1.0, 0.0, 1.0));
  c = mix(c, white, clamp(t * 4.0 - 2.0, 0.0, 1.0));
  return c;
}
void main () {
  float upN = abs(v_normalW.y);
  float alongX = abs(v_normalW.x);
  float hN = clamp(v_objPos.y / max(v_height, 0.001) + 0.5, 0.0, 1.0);
  vec3 base = mix(vec3(0.020, 0.022, 0.050), vec3(0.055, 0.058, 0.120), hN);
  vec3 col = base;
  if (upN < 0.5) {
    float u = alongX > 0.5 ? v_objPos.z : v_objPos.x;
    vec2 grid = vec2(u / facadeParams.y, v_objPos.y / facadeParams.z);
    vec2 cell = floor(grid);
    vec2 f = fract(grid);
    // 抗锯齿窗框（fwidth 自适应）
    vec2 fw = fwidth(grid) * 0.7 + vec2(0.0008);
    float fx = smoothstep(0.18 - fw.x, 0.18 + fw.x, f.x) * (1.0 - smoothstep(0.82 - fw.x, 0.82 + fw.x, f.x));
    float fy = smoothstep(0.26 - fw.y, 0.26 + fw.y, f.y) * (1.0 - smoothstep(0.88 - fw.y, 0.88 + fw.y, f.y));
    float frame = fx * fy;
    // 按层供电：整层电路 hash 决定，层内窗再抽样 —— 行/列相干，杜绝噪点花斑
    float row = floor(grid.y);
    float rowOn = step(0.34, airHashF(vec2(row * 1.31 + v_seed * 17.0, 7.1)));
    float winOn = step(0.22, airHashF(cell + v_seed * 61.0));
    float lit = frame * rowOn * winOn;
    float tone = airHashF(vec2(row + v_seed * 31.0, 11.3));
    vec3 winColor = neonPalette(tone);
    float bright = 0.78 + 0.22 * airHashF(cell + v_seed * 7.0);
    // 罕见坏灯闪烁（仅近景，远景关闭防频闪）
    float twinkle = (v_lod < 0.45 && airHashF(cell + v_seed) > 0.985)
      ? (0.5 + 0.5 * sin(cc_time.x * 9.0 + airHashF(cell) * 911.0)) : 1.0;
    vec3 pattern = base + winColor * lit * bright * twinkle * 5.0; // Linear HDR radiance.
    // 摩尔纹防线：窗格屏幕尺寸 <~4px 时整体淡出为平均辉光（透视压缩敏感，补距离 LOD 的盲带）
    vec2 fwRaw = fwidth(grid);
    float winPx = min(facadeParams.y / max(fwRaw.x, 1e-5), facadeParams.z / max(fwRaw.y, 1e-5));
    float lod = max(v_lod, 1.0 - smoothstep(2.0, 5.0, winPx));
    col = mix(pattern, base * 0.55 + v_tintAvg, lod);
  } else {
    col = base * 0.5;
  }
  col = mix(col, fogColor.rgb, v_fog);
  cc_FragColor = vec4(col, 1.0);
}`;

const FACADE_VERT_GLSL1 = `${UBO_CC_CAMERA_GLSL1}
${UBO_CC_LOCAL_GLSL1}
uniform mediump vec4 facadeParams;
attribute highp vec3 a_position;
attribute mediump vec3 a_normal;
varying highp vec3 v_objPos;
varying highp vec3 v_worldPos;
varying mediump vec3 v_normalW;
varying mediump float v_seed;
varying mediump float v_height;
varying mediump float v_fog;
varying mediump float v_lod;
varying mediump vec3 v_tintAvg;
void main () {
  v_objPos = a_position;
  v_worldPos = (cc_matWorld * vec4(a_position, 1.0)).xyz;
  v_normalW = normalize(mat3(cc_matWorld) * a_normal);
  v_seed = fract(sin(dot(cc_matWorld[3].xz, vec2(127.1, 311.7))) * 43758.5453);
  v_height = length(cc_matWorld[1].xyz);
  float dist = distance(v_worldPos, cc_cameraPos.xyz);
  v_fog = clamp(1.0 - exp(-pow(dist * facadeParams.x, 2.0)), 0.0, 1.0);
  v_lod = smoothstep(60.0, 170.0, dist);
  v_tintAvg = vec3(0.08, 0.10, 0.14);
  gl_Position = cc_matViewProj * vec4(v_worldPos, 1.0);
}`;

const FACADE_FRAG_GLSL1 = `precision highp float;
uniform highp vec4 cc_time;
uniform mediump vec4 fogColor;
uniform mediump vec4 facadeParams;
varying highp vec3 v_objPos;
varying highp vec3 v_worldPos;
varying mediump vec3 v_normalW;
varying mediump float v_seed;
varying mediump float v_height;
varying mediump float v_fog;
varying mediump float v_lod;
varying mediump vec3 v_tintAvg;
float airHashF (vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 neonPalette (float t) {
  vec3 c = mix(vec3(0.16, 0.90, 1.00), vec3(1.00, 0.24, 0.94), clamp(t * 4.0, 0.0, 1.0));
  c = mix(c, vec3(1.00, 0.70, 0.28), clamp(t * 4.0 - 1.0, 0.0, 1.0));
  c = mix(c, vec3(0.82, 0.90, 1.00), clamp(t * 4.0 - 2.0, 0.0, 1.0));
  return c;
}
void main () {
  float upN = abs(v_normalW.y);
  float alongX = abs(v_normalW.x);
  float hN = clamp(v_objPos.y / max(v_height, 0.001) + 0.5, 0.0, 1.0);
  vec3 base = mix(vec3(0.020, 0.022, 0.050), vec3(0.055, 0.058, 0.120), hN);
  vec3 col = base;
  if (upN < 0.5) {
    float u = alongX > 0.5 ? v_objPos.z : v_objPos.x;
    vec2 grid = vec2(u / facadeParams.y, v_objPos.y / facadeParams.z);
    vec2 cell = floor(grid);
    vec2 f = fract(grid);
    float frame = step(0.18, f.x) * step(f.x, 0.82) * step(0.26, f.y) * step(f.y, 0.88);
    float row = floor(grid.y);
    float rowOn = step(0.34, airHashF(vec2(row * 1.31 + v_seed * 17.0, 7.1)));
    float winOn = step(0.22, airHashF(cell + v_seed * 61.0));
    float lit = frame * rowOn * winOn;
    vec3 winColor = neonPalette(airHashF(vec2(row + v_seed * 31.0, 11.3)));
    float bright = 0.78 + 0.22 * airHashF(cell + v_seed * 7.0);
    col = base + winColor * lit * bright;
  } else {
    col = base * 0.5;
  }
  col = mix(col, fogColor.rgb, v_fog);
  gl_FragColor = vec4(col, 1.0);
}`;

// ---- neon-glow：预乘加法混合 + 脉冲 + 时间槽闪烁 + RAIN_MODE 顶点动画雨 ----

const GLOW_VERT_BODY_GLSL4 = `${UBO_CC_GLOBAL_GLSL4}
${UBO_CC_CAMERA_GLSL4}
${UBO_CC_LOCAL_GLSL4}
in vec3 a_position;
#if USE_INSTANCING
in vec4 a_matWorld0;
in vec4 a_matWorld1;
in vec4 a_matWorld2;
#endif
${MAT_WORLD_HELPERS_GLSL4}
layout(set = 1, binding = 0) uniform Constants {
  vec4 glowColor;
  vec4 glowParams1;  // x=脉冲速率 y=脉冲幅度 z=雨速 w=闪烁开关
  vec4 glowParams2;  // x=雨顶 y=雨程
  vec4 fogParams;    // x=雾密度
};
out mediump float v_seed;
out mediump float v_fog;
void main () {
  mat4 world = airWorldMatrix();
  v_seed = airHash(world[3].xz + world[3].y * 0.61);
  vec3 wp = (world * vec4(a_position, 1.0)).xyz;
  #if RAIN_MODE
    // 下落/回绕在顶点内完成；保留局部 y 偏移，雨丝自身长度不塌缩
    float span = glowParams2.y;
    float fall = mod(cc_time.x * glowParams1.z + v_seed * span, span);
    float localY = wp.y - world[3].y;
    wp.y = glowParams2.x - span + fall + localY;
  #endif
  v_fog = clamp(1.0 - exp(-pow(distance(wp, cc_cameraPos.xyz) * fogParams.x, 2.0)), 0.0, 1.0);
  gl_Position = cc_matViewProj * vec4(wp, 1.0);
}`;

const GLOW_FRAG_GLSL4 = `precision highp float;
${UBO_CC_GLOBAL_GLSL4}
layout(set = 1, binding = 0) uniform Constants {
  vec4 glowColor;
  vec4 glowParams1;
  vec4 glowParams2;
  vec4 fogParams;
};
in mediump float v_seed;
in mediump float v_fog;
layout(location = 0) out vec4 cc_FragColor;
void main () {
  float pulse = 1.0 + glowParams1.y * sin(cc_time.x * glowParams1.x + v_seed * 6.2831);
  // 霓虹招牌断电闪烁：0.5s 粒度时间槽 hash（w>0.5 启用）
  float flick = 1.0;
  if (glowParams1.w > 0.5) {
    float slot = floor(cc_time.x * 2.3 + v_seed * 97.0);
    flick = step(0.12, fract(sin(slot * 91.7) * 43758.5453));
  }
  vec3 c = glowColor.rgb * glowColor.a * pulse * flick * (1.0 - v_fog) * 4.0;
  cc_FragColor = vec4(c, 1.0);
}`;

const GLOW_VERT_GLSL1 = `${UBO_CC_CAMERA_GLSL1}
${UBO_CC_LOCAL_GLSL1}
${UBO_CC_GLOBAL_GLSL1}
attribute highp vec3 a_position;
uniform mediump vec4 glowParams2;
uniform mediump vec4 fogParams;
varying mediump float v_seed;
varying mediump float v_fog;
void main () {
  v_seed = fract(sin(dot(cc_matWorld[3].xz, vec2(127.1, 311.7))) * 43758.5453);
  vec3 wp = (cc_matWorld * vec4(a_position, 1.0)).xyz;
  v_fog = clamp(1.0 - exp(-pow(distance(wp, cc_cameraPos.xyz) * fogParams.x, 2.0)), 0.0, 1.0);
  gl_Position = cc_matViewProj * vec4(wp, 1.0);
}`;

const GLOW_FRAG_GLSL1 = `precision highp float;
uniform highp vec4 cc_time;
uniform mediump vec4 glowColor;
uniform mediump vec4 glowParams1;
varying mediump float v_seed;
varying mediump float v_fog;
void main () {
  float pulse = 1.0 + glowParams1.y * sin(cc_time.x * glowParams1.x + v_seed * 6.2831);
  gl_FragColor = vec4(glowColor.rgb * glowColor.a * pulse * (1.0 - v_fog), 1.0);
}`;

// ===========================================================================
// Effect JSON 构建
// ===========================================================================

const TYPE_FLOAT4 = 16;
const FORMAT_RGB32F = 32;
const FORMAT_RGBA32F = 44;

function buildEffectJson(opts: {
    name: string;
    prog: string;
    defines: Array<{ name: string; type: string }>;
    attributes: Array<Record<string, unknown>>;
    members: Array<{ name: string; type: number; count: number }>;
    properties: Record<string, { value: number[]; type: number }>;
    additive?: boolean;
    noDepth?: boolean;
    cullFront?: boolean;
    priority?: number;
}): Record<string, unknown> {
    return {
        name: opts.name,
        techniques: [
            {
                passes: [
                    {
                        program: opts.prog,
                        priority: opts.priority ?? 0,
                        rasterizerState: { cullMode: opts.cullFront ? 2 : 0 }, // 2 = CullMode.FRONT（穹顶内视）
                        depthStencilState: { depthTest: !opts.noDepth, depthWrite: !(opts.additive || opts.noDepth) },
                        blendState: {
                            targets: [
                                opts.additive
                                    ? {
                                          blend: true,
                                          blendSrc: 1, // BlendFactor.ONE（片元已预乘 alpha）
                                          blendDst: 1,
                                          blendSrcAlpha: 1,
                                          blendDstAlpha: 1,
                                      }
                                    : { blend: false },
                            ],
                        },
                        properties: opts.properties,
                    },
                ],
            },
        ],
        shaders: [
            {
                name: opts.prog,
                hash: undefined,
                builtins: {
                    statistics: {
                        CC_EFFECT_USED_VERTEX_UNIFORM_VECTORS: 47,
                        CC_EFFECT_USED_FRAGMENT_UNIFORM_VECTORS: 8,
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
                defines: opts.defines,
                attributes: opts.attributes,
                blocks: opts.members.length
                    ? [
                          {
                              name: 'Constants',
                              set: 1,
                              binding: 0,
                              members: opts.members,
                              stageFlags: 17,
                          },
                      ]
                    : [], // 空 Constants 会触发引擎建 0 字节 UBO 而崩溃
                samplerTextures: [],
                samplers: [],
                textures: [],
                buffers: [],
                images: [],
                subpassInputs: [],
                descriptors: [],
            },
        ],
        combinations: [],
    } as Record<string, unknown>;
}

/** instanced 矩阵属性声明（与 builtin-effects 同构；format 44 = RGBA32F，location 9/10/11）。 */
const INSTANCED_ATTRS = [0, 1, 2].map((i) => ({
    name: `a_matWorld${i}`,
    defines: ['USE_INSTANCING'],
    format: FORMAT_RGBA32F,
    isInstanced: true,
    location: 9 + i,
}));

const BASE_ATTRS = [
    { name: 'a_position', defines: [], format: FORMAT_RGB32F, location: 0 },
    { name: 'a_normal', defines: [], format: FORMAT_RGB32F, location: 1 },
];
const POS_ONLY_ATTRS = [{ name: 'a_position', defines: [], format: FORMAT_RGB32F, location: 0 }];

const FOG_COLOR = new Color(24, 14, 46, 255);
const FOG_DENSITY = 0.004;

// ===========================================================================
// 场景状态
// ===========================================================================

const CITY = {
    grid: 21,
    cell: 9,
    rainDrops: 800,
    carsPerLane: 18,
    rainTop: 88,
    rainRange: 80,
    rainSpeed: 30,
    maxBuildings: 760,
};

interface BuildingSpec {
    x: number;
    z: number;
    w: number;
    d: number;
    h: number;
}

interface CarSpec {
    axis: 'x' | 'z';
    dir: 1 | -1;
    lane: number;
    pos: number;
    speed: number;
}

interface BillboardSpec {
    x: number;
    y: number;
    z: number;
    axis: 'x' | 'z';
    side: 1 | -1;
    w: number;
    h: number;
    colorIdx: number;
    pulse: number;
}

const state = {
    fps: 0,
    frames: 0,
    startedAt: 0,
    buildings: 0,
    cars: 0,
    rainDrops: 0,
    billboards: 0,
    seed: 20871,
};

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

let scene: Scene;
let cityRoot: Node;
let unitBox: ReturnType<typeof utils.createMesh>;
let skyEffect: any;
let facadeEffect: any;
let glowEffect: any;
let skyMaterial: Material;
let facadeMaterial: Material;
let carMaterialA: Material;
let carMaterialB: Material;
let rainMaterial: Material;
let streetMaterialA: Material;
let streetMaterialB: Material;
const beaconPulses: Billboard[] = []; // 楼顶警示灯柔光点（尺寸呼吸在 AFTER_UPDATE 驱动）
let spireMaterial: Material;
const billboardMaterials: Material[] = [];
const billboardPalette = [
    new Color(70, 245, 255, 235),
    new Color(255, 80, 235, 215),
    new Color(255, 180, 70, 190),
    new Color(150, 170, 255, 205),
];

function makeMaterial(effect: any, defines: Record<string, boolean> | undefined): Material {
    const m = new Material();
    m.initialize(defines ? { effectAsset: effect, defines } : { effectAsset: effect });
    return m;
}

// ---- 径向柔光纹理（程序化，应用侧持有；Billboard.onDestroy 只置空引用不销毁）----
const glowTextures: Record<string, Texture2D> = {};

function makeGlowTexture(name: string, r: number, g: number, b: number): Texture2D {
    const S = 48;
    const data = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const dx = ((x + 0.5) / S) * 2 - 1;
            const dy = ((y + 0.5) / S) * 2 - 1;
            const d = Math.sqrt(dx * dx + dy * dy);
            const t = Math.max(0, 1 - d);
            const a = t * t * (3 - 2 * t); // smoothstep 衰减：中心实、边缘净
            const i = (y * S + x) * 4;
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = Math.round(255 * a);
        }
    }
    const tex = new Texture2D();
    tex.image = new ImageAsset({
        width: S,
        height: S,
        _data: data,
        _compressed: false,
        format: Texture2D.PixelFormat.RGBA8888,
    });
    glowTextures[name] = tex;
    return tex;
}

/**
 * Billboard 柔光点（builtin-billboard：camera-facing quad，SRC_ALPHA/ONE 加法）。
 * 契约（skills/cocosair-2d-subsystems/references/billboard.md）：
 *   width/height 默认 0 不可见，必须显式设；尺寸走 cc_size_rotation uniform，
 *   node scale 不生效；需要 3D camera visibility 含节点 layer；纹理由应用持有。
 */
function addBillboardGlow(root: Node, name: string, pos: Vec3, size: number, texture: Texture2D): Billboard {
    const n = new Node(name);
    n.layer = Layers.Enum.DEFAULT;
    root.addChild(n);
    n.setPosition(pos);
    const bb = n.addComponent(Billboard);
    bb.texture = texture;
    bb.width = size;
    bb.height = size;
    return bb;
}

// ===========================================================================
// 城市生成
// ===========================================================================

function generateCity(seed: number): { buildings: BuildingSpec[]; cars: CarSpec[]; billboards: BillboardSpec[] } {
    const rng = mulberry32(seed);
    const half = (CITY.grid * CITY.cell) / 2;
    const mid = Math.floor(CITY.grid / 2);
    const buildings: BuildingSpec[] = [];
    const billboards: BillboardSpec[] = [];
    const maxD = half * 1.2;

    for (let iz = 0; iz < CITY.grid; iz++) {
        for (let ix = 0; ix < CITY.grid; ix++) {
            if (ix === mid || iz === mid) continue;
            if (buildings.length >= CITY.maxBuildings) break;
            const cx = -half + (ix + 0.5) * CITY.cell;
            const cz = -half + (iz + 0.5) * CITY.cell;
            if (rng() < 0.08) continue;
            const dist = Math.sqrt(cx * cx + cz * cz);
            const boost = 1 + (1 - Math.min(dist / maxD, 1)) * 1.1;
            const isLandmark = Math.abs(ix - mid) === 2 && Math.abs(iz - mid) === 2 && rng() < 0.5;
            const twin = !isLandmark && rng() < 0.18;
            const count = twin ? 2 : 1;
            for (let k = 0; k < count; k++) {
                const w = isLandmark ? 5.8 + rng() * 1.4 : 3.0 + rng() * 3.2;
                const d = isLandmark ? 5.8 + rng() * 1.4 : 3.0 + rng() * 3.2;
                const h = isLandmark ? 48 + rng() * 16 : (6 + rng() * 9 + Math.pow(rng(), 2.6) * 32) * boost;
                const ox = twin ? (k === 0 ? -2.2 : 2.2) : 0;
                const oz = twin ? (k === 0 ? -2.2 : 2.2) : 0;
                buildings.push({ x: cx + ox, z: cz + oz, w, d, h: Math.min(h, 70) });
            }
        }
    }

    const sorted = [...buildings].sort((a, b) => b.h - a.h).slice(0, 14);
    sorted.forEach((b, i) => {
        const axis: 'x' | 'z' = rng() < 0.5 ? 'x' : 'z';
        const side: 1 | -1 = rng() < 0.5 ? 1 : -1;
        const reach = axis === 'x' ? b.w / 2 + 0.35 : b.d / 2 + 0.35;
        billboards.push({
            x: b.x + (axis === 'x' ? side * reach : 0),
            y: b.h * (0.6 + rng() * 0.25),
            z: b.z + (axis === 'z' ? side * reach : 0),
            axis,
            side,
            w: axis === 'x' ? 0.45 : 2.8 + rng() * 2.0,
            h: 4.6 + rng() * 3.4,
            colorIdx: i % billboardPalette.length,
            pulse: 0.7 + rng() * 1.5,
        });
    });

    const cars: CarSpec[] = [];
    const halfLane = 2.2;
    (['x', 'z'] as const).forEach((axis) => {
        ([1, -1] as const).forEach((dir) => {
            for (let i = 0; i < CITY.carsPerLane; i++) {
                cars.push({
                    axis,
                    dir,
                    lane: halfLane * (dir === 1 ? -1 : 1),
                    pos: -half + rng() * half * 2,
                    speed: 10 + rng() * 10,
                });
            }
        });
    });
    return { buildings, cars, billboards };
}

interface CityRuntime {
    root: Node;
    buildings: BuildingSpec[];
    cars: CarSpec[];
    carNodes: Node[];
    billboards: BillboardSpec[];
}

function addGlowBox(root: Node, name: string, pos: Vec3, scale: Vec3, material: Material): void {
    const n = new Node(name);
    n.layer = Layers.Enum.DEFAULT;
    root.addChild(n);
    n.setPosition(pos);
    n.setScale(scale);
    const r = n.addComponent(MeshRenderer);
    r.mesh = unitBox;
    r.setSharedMaterial(material, 0);
}

function buildCity(seed: number): CityRuntime {
    const root = new Node('City');
    scene.addChild(root);
    beaconPulses.length = 0; // reset 重建时清空（Billboard.onDestroy 只置空纹理引用，纹理应用持有可复用）
    const { buildings, cars, billboards } = generateCity(seed);

    // ---- 楼群：共享 mesh + 共享 facade 材质（USE_INSTANCING）→ 单组 ≤1024 实例 1 draw ----
    for (const b of buildings) {
        const n = new Node('b');
        n.layer = Layers.Enum.DEFAULT;
        root.addChild(n);
        n.setPosition(new Vec3(b.x, b.h / 2, b.z));
        n.setScale(new Vec3(b.w, b.h, b.d));
        const r = n.addComponent(MeshRenderer);
        r.mesh = unitBox;
        r.setSharedMaterial(facadeMaterial, 0);
    }

    // ---- 车流光条 + 车头柔光晕（billboard 挂车节点，位移随父节点零成本跟随）----
    const carNodes: Node[] = [];
    for (const c of cars) {
        const n = new Node('car');
        n.layer = Layers.Enum.DEFAULT;
        root.addChild(n);
        n.setScale(c.axis === 'x' ? new Vec3(4.2, 0.16, 0.42) : new Vec3(0.42, 0.16, 4.2));
        const r = n.addComponent(MeshRenderer);
        r.mesh = unitBox;
        r.setSharedMaterial(c.dir === 1 ? carMaterialA : carMaterialB, 0);
        // 光晕点在行进前端：billboard 尺寸不吃 node scale，但子节点 position 会被父 scale 缩放，故按比例抵消
        const head = new Node('car-glow');
        head.layer = Layers.Enum.DEFAULT;
        n.addChild(head);
        head.setPosition(c.axis === 'x' ? new Vec3((c.dir * 4.4) / 4.2, 0, 0) : new Vec3(0, 0, (c.dir * 4.4) / 4.2));
        const headBB = head.addComponent(Billboard);
        headBB.texture = c.dir === 1 ? glowTextures.cyan : glowTextures.red;
        headBB.width = 3.2;
        headBB.height = 3.2;
        carNodes.push(n);
    }

    // ---- 霓虹广告牌 + 地面光池（同色材质，招牌闪烁时光池同步——湿路反射感）----
    billboards.forEach((bb) => {
        addGlowBox(
            root,
            'billboard',
            new Vec3(bb.x, bb.y, bb.z),
            new Vec3(bb.axis === 'x' ? bb.w : bb.h * 0.55, bb.h, bb.axis === 'x' ? bb.h * 0.55 : bb.w),
            billboardMaterials[bb.colorIdx],
        );
        addGlowBox(
            root,
            'light-pool',
            new Vec3(bb.x, 0.07, bb.z),
            new Vec3(bb.h * 1.3, 0.05, bb.h * 1.3),
            billboardMaterials[bb.colorIdx],
        );
    });

    // ---- 天际线性格：中央光柱 + 最高楼群天线 + 楼顶航空警示灯 ----
    const byHeight = [...buildings].sort((a, b) => b.h - a.h);
    const tallest = byHeight[0];
    if (tallest) {
        addGlowBox(
            root,
            'beacon-beam',
            new Vec3(tallest.x, tallest.h + 22, tallest.z),
            new Vec3(0.8, 44, 0.8),
            billboardMaterials[0],
        );
        addGlowBox(
            root,
            'beacon-cap',
            new Vec3(tallest.x, tallest.h + 0.8, tallest.z),
            new Vec3(2.2, 0.7, 2.2),
            billboardMaterials[1],
        );
    }
    byHeight.slice(0, 8).forEach((b, i) => {
        const len = 6 + (i % 4) * 2.4;
        addGlowBox(root, 'spire', new Vec3(b.x, b.h + len / 2, b.z), new Vec3(0.14, len, 0.14), spireMaterial);
    });
    byHeight
        .filter((b) => b.h >= 34)
        .slice(0, 26)
        .forEach((b) => {
            // 楼顶航空警示灯：Billboard 柔光点（尺寸呼吸在主循环驱动），替代硬边小盒
            const bb = addBillboardGlow(root, 'rooftop-beacon', new Vec3(b.x, b.h + 0.6, b.z), 2.2, glowTextures.red);
            beaconPulses.push(bb);
        });

    // ---- 街面光晕：中央光柱脚下 + 大道交叉点的柔光池 ----
    if (tallest) {
        addBillboardGlow(root, 'beam-halo', new Vec3(tallest.x, 1.2, tallest.z), 26, glowTextures.cyan);
    }
    addBillboardGlow(root, 'cross-halo', new Vec3(0, 1.0, 0), 34, glowTextures.warm);

    // ---- 雨：静态放置，顶点着色器驱动下落（RAIN_MODE + USE_INSTANCING）----
    const rngRain = mulberry32(seed ^ 0x5f3759df);
    for (let i = 0; i < CITY.rainDrops; i++) {
        const n = new Node('rain');
        n.layer = Layers.Enum.DEFAULT;
        root.addChild(n);
        n.setPosition(new Vec3((rngRain() - 0.5) * 350, 0, (rngRain() - 0.5) * 350));
        n.setScale(new Vec3(0.13, 2.6, 0.13));
        const r = n.addComponent(MeshRenderer);
        r.mesh = unitBox;
        r.setSharedMaterial(rainMaterial, 0);
    }

    return { root, buildings, cars, carNodes, billboards };
}

// ===========================================================================
// 主流程
// ===========================================================================

let cityRt: CityRuntime;
let cameraNode: Node;
const orbit = { theta: 0.68, pitch: 0.34, radius: 168, target: new Vec3(0, 16, 0) };

function applyOrbit(): void {
    const cp = Math.cos(orbit.pitch);
    cameraNode.setPosition(
        new Vec3(
            orbit.target.x + orbit.radius * cp * Math.sin(orbit.theta),
            orbit.target.y + orbit.radius * Math.sin(orbit.pitch),
            orbit.target.z + orbit.radius * cp * Math.cos(orbit.theta),
        ),
    );
    cameraNode.lookAt(orbit.target);
}

function registerEffects(): void {
    const attach = (e: any, v4: { vert: string; frag: string }, v1: { vert: string; frag: string }): any => {
        e.shaders[0].glsl4 = v4;
        e.shaders[0].glsl3 = { vert: stripLayout(v4.vert), frag: stripLayout(v4.frag) };
        e.shaders[0].glsl1 = v1;
        e.onLoaded();
        EffectAsset.register(e); // onLoaded 已注册；显式 register 同名覆盖不抛错（G4 正典写法）
        return e;
    };

    skyEffect = attach(
        Object.assign(
            new EffectAsset(),
            buildEffectJson({
                name: 'air-neon-sky',
                prog: 'air-neon-sky|sky-vs:vert|sky-fs:frag',
                defines: [],
                attributes: POS_ONLY_ATTRS,
                members: [],
                properties: {},
                noDepth: true,
                cullFront: true,
            }),
        ) as any,
        { vert: 'precision highp float;\n' + SKY_VERT_GLSL4, frag: SKY_FRAG_GLSL4 },
        { vert: SKY_VERT_GLSL1, frag: SKY_FRAG_GLSL1 },
    );

    facadeEffect = attach(
        Object.assign(
            new EffectAsset(),
            buildEffectJson({
                name: 'air-neon-facade',
                prog: 'air-neon-facade|facade-vs:vert|facade-fs:frag',
                defines: [{ name: 'USE_INSTANCING', type: 'boolean' }],
                attributes: [...BASE_ATTRS, ...INSTANCED_ATTRS],
                members: [
                    { name: 'fogColor', type: TYPE_FLOAT4, count: 1 },
                    { name: 'facadeParams', type: TYPE_FLOAT4, count: 1 },
                ],
                properties: {
                    fogColor: {
                        value: [FOG_COLOR.r / 255, FOG_COLOR.g / 255, FOG_COLOR.b / 255, 1],
                        type: TYPE_FLOAT4,
                    },
                    facadeParams: { value: [FOG_DENSITY, 2.3, 3.6, 0.56], type: TYPE_FLOAT4 },
                },
            }),
        ) as any,
        { vert: 'precision highp float;\n' + FACADE_VERT_BODY_GLSL4, frag: FACADE_FRAG_GLSL4 },
        { vert: FACADE_VERT_GLSL1, frag: FACADE_FRAG_GLSL1 },
    );

    glowEffect = attach(
        Object.assign(
            new EffectAsset(),
            buildEffectJson({
                name: 'air-neon-glow',
                prog: 'air-neon-glow|glow-vs:vert|glow-fs:frag',
                defines: [
                    { name: 'USE_INSTANCING', type: 'boolean' },
                    { name: 'RAIN_MODE', type: 'boolean' },
                ],
                attributes: [...BASE_ATTRS, ...INSTANCED_ATTRS],
                members: [
                    { name: 'glowColor', type: TYPE_FLOAT4, count: 1 },
                    { name: 'glowParams1', type: TYPE_FLOAT4, count: 1 },
                    { name: 'glowParams2', type: TYPE_FLOAT4, count: 1 },
                    { name: 'fogParams', type: TYPE_FLOAT4, count: 1 },
                ],
                properties: {
                    glowColor: { value: [0.5, 0.85, 1, 0.6], type: TYPE_FLOAT4 },
                    glowParams1: { value: [1.2, 0.18, 0, 0], type: TYPE_FLOAT4 },
                    glowParams2: { value: [88, 80, 0, 0], type: TYPE_FLOAT4 },
                    fogParams: { value: [FOG_DENSITY, 0, 0, 0], type: TYPE_FLOAT4 },
                },
                additive: true,
                priority: 128,
            }),
        ) as any,
        { vert: 'precision highp float;\n' + GLOW_VERT_BODY_GLSL4, frag: GLOW_FRAG_GLSL4 },
        { vert: GLOW_VERT_GLSL1, frag: GLOW_FRAG_GLSL1 },
    );
}

function glowMaterial(
    defines: Record<string, boolean> | undefined,
    color: Color,
    p1: number[],
    p2: number[],
): Material {
    const m = makeMaterial(glowEffect, defines);
    m.setProperty('glowColor', new Vec4(color.r / 255, color.g / 255, color.b / 255, color.a / 255));
    m.setProperty('glowParams1', new Vec4(p1[0], p1[1], p1[2], p1[3] || 0));
    m.setProperty('glowParams2', new Vec4(p2[0], p2[1], p2[2] || 0, p2[3] || 0));
    m.setProperty('fogParams', new Vec4(FOG_DENSITY, 0, 0, 0));
    return m;
}

async function main(): Promise<void> {
    // Capture linear HDR; configure offscreen samples on createAirPostProcess.
    const app = await createAirApp({ canvas: '#GameCanvas' });
    (window as any).__airApp = app;
    scene = new Scene('neon-city');

    // ---- 场景雾（驱动内建材质；自定义着色器用同参数手动雾）----
    const fog = (scene.globals as any).fog;
    fog.enabled = true;
    fog.type = 1; // FogType.EXP
    fog.fogColor = new Color(FOG_COLOR.r, FOG_COLOR.g, FOG_COLOR.b, 255);
    fog.fogDensity = FOG_DENSITY;

    // ---- 相机（默认城外观天际线）----
    cameraNode = new Node('Main Camera');
    scene.addChild(cameraNode);
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.PERSPECTIVE;
    camera.fov = 52;
    camera.near = 0.5;
    camera.far = 2000;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(FOG_COLOR.r, FOG_COLOR.g, FOG_COLOR.b, 255);
    camera.visibility = Layers.Enum.DEFAULT;
    applyOrbit();
    const post = createAirPostProcess(camera, {
        levels: 5,
        toneMapping: 'aces',
        exposure: 0.65,
        bloom: { intensity: 0.7, threshold: 1, softKnee: 0.5, scatter: 0.7 },
    });
    (window as any).__airPostProcess = post;
    const bloomControl = document.querySelector<HTMLInputElement>('#bloom')!;
    const toneControl = document.querySelector<HTMLSelectElement>('#tone')!;
    const exposureControl = document.querySelector<HTMLInputElement>('#exposure')!;
    bloomControl.addEventListener('change', () => post.setOptions({ bloom: { enabled: bloomControl.checked } }));
    toneControl.addEventListener('change', () =>
        post.setOptions({ toneMapping: toneControl.value as 'aces' | 'reinhard' | 'none' }),
    );
    exposureControl.addEventListener('input', () => {
        post.setOptions({ exposure: Number(exposureControl.value) });
        document.querySelector('#exposure-value')!.textContent = exposureControl.value;
    });

    // ---- 暗月光（仅照亮 builtin-standard 地面，楼体为自定义着色器不受光）----
    const moonNode = new Node('Moon');
    scene.addChild(moonNode);
    moonNode.setPosition(new Vec3(-40, 90, 30));
    moonNode.lookAt(new Vec3(0, 0, 0));
    const moon = moonNode.addComponent(DirectionalLight);
    moon.illuminance = 1400;
    if ('color' in moon) (moon as any).color = new Color(140, 160, 255, 255);

    // ---- 地面（builtin-standard 受雾受光）----
    const groundNode = new Node('Ground');
    groundNode.layer = Layers.Enum.DEFAULT;
    scene.addChild(groundNode);
    groundNode.setPosition(new Vec3(0, -0.5, 0));
    const groundRenderer = groundNode.addComponent(MeshRenderer);
    groundRenderer.mesh = utils.createMesh(primitives.box({ width: 700, height: 1, length: 700 }));
    const groundMaterial = new Material();
    groundMaterial.initialize({ effectName: 'builtin-standard' });
    groundMaterial.setProperty('mainColor', new Color(14, 13, 22, 255));
    groundMaterial.setProperty('metallic', 0.15);
    groundMaterial.setProperty('roughness', 0.55);
    groundRenderer.material = groundMaterial;

    // ---- 天穹（渐变 + 星空，内视大球，depthWrite 关闭）----
    const skyNode = new Node('SkyDome');
    skyNode.layer = Layers.Enum.DEFAULT;
    scene.addChild(skyNode);
    const skyRenderer = skyNode.addComponent(MeshRenderer);
    skyRenderer.mesh = utils.createMesh(primitives.sphere(900));

    // ---- 自定义效果与材质（必须在 createAirApp 之后注册）----
    registerEffects();
    unitBox = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
    skyMaterial = makeMaterial(skyEffect, undefined);
    skyRenderer.setSharedMaterial(skyMaterial, 0);

    // ---- Billboard 柔光纹理（程序化径向衰减；颜色烧进纹理，因为组件材质不可达只能用默认 tint）----
    makeGlowTexture('red', 255, 60, 60);
    makeGlowTexture('cyan', 150, 240, 255);
    makeGlowTexture('warm', 255, 170, 90);

    facadeMaterial = makeMaterial(facadeEffect, { USE_INSTANCING: true });
    facadeMaterial.setProperty('fogColor', new Vec4(FOG_COLOR.r / 255, FOG_COLOR.g / 255, FOG_COLOR.b / 255, 1));
    facadeMaterial.setProperty('facadeParams', new Vec4(FOG_DENSITY, 2.3, 3.6, 0.56));

    carMaterialA = glowMaterial({ USE_INSTANCING: true }, new Color(165, 245, 255, 235), [0, 0, 0, 0], [0, 0, 0, 0]);
    carMaterialB = glowMaterial({ USE_INSTANCING: true }, new Color(255, 110, 75, 225), [0, 0, 0, 0], [0, 0, 0, 0]);
    rainMaterial = glowMaterial(
        { USE_INSTANCING: true, RAIN_MODE: true },
        new Color(165, 195, 255, 135),
        [0, 0, CITY.rainSpeed, 0],
        [CITY.rainTop, CITY.rainRange, 0, 0],
    );
    streetMaterialA = glowMaterial(undefined, new Color(60, 220, 255, 190), [0.6, 0.12, 0, 0], [0, 0, 0, 0]);
    streetMaterialB = glowMaterial(undefined, new Color(255, 80, 240, 165), [0.5, 0.1, 0, 0], [0, 0, 0, 0]);
    spireMaterial = glowMaterial(undefined, new Color(190, 215, 255, 150), [0, 0, 0, 0], [0, 0, 0, 0]);
    billboardPalette.forEach((c, i) => {
        billboardMaterials[i] = glowMaterial(undefined, c, [0.7 + i * 0.23, 0.16, 0, 1], [0, 0, 0, 0]);
    });

    // ---- 大道发光标线 ----
    const halfExtent = (CITY.grid * CITY.cell) / 2;
    const streetX = new Node('street-x');
    streetX.layer = Layers.Enum.DEFAULT;
    scene.addChild(streetX);
    streetX.setPosition(new Vec3(0, 0.05, 0));
    streetX.setScale(new Vec3(halfExtent * 2, 0.06, 0.85));
    const rsx = streetX.addComponent(MeshRenderer);
    rsx.mesh = unitBox;
    rsx.setSharedMaterial(streetMaterialA, 0);
    const streetZ = new Node('street-z');
    streetZ.layer = Layers.Enum.DEFAULT;
    scene.addChild(streetZ);
    streetZ.setPosition(new Vec3(0, 0.05, 0));
    streetZ.setScale(new Vec3(0.85, 0.06, halfExtent * 2));
    const rsz = streetZ.addComponent(MeshRenderer);
    rsz.mesh = unitBox;
    rsz.setSharedMaterial(streetMaterialB, 0);

    // ---- 城市 ----
    cityRt = buildCity(state.seed);
    state.buildings = cityRt.buildings.length;
    state.cars = cityRt.cars.length;
    state.rainDrops = CITY.rainDrops;
    state.billboards = cityRt.billboards.length;

    // ---- 每帧：车流位移 + 警示灯尺寸呼吸（AFTER_UPDATE）----
    director.on(Director.EVENT_AFTER_UPDATE, () => {
        const half = halfExtent + 6;
        for (let i = 0; i < cityRt.cars.length; i++) {
            const c = cityRt.cars[i];
            const n = cityRt.carNodes[i];
            c.pos += c.speed * c.dir;
            if (c.pos > half) c.pos = -half;
            if (c.pos < -half) c.pos = half;
            if (c.axis === 'x') n.setPosition(new Vec3(c.pos, 0.4, c.lane));
            else n.setPosition(new Vec3(c.lane, 0.4, c.pos));
        }
        // 航空警示灯呼吸：cc_size_rotation 每帧写 width/height（约 26 个，CPU 可忽略）
        const t = director.root!.cumulativeTime;
        for (let i = 0; i < beaconPulses.length; i++) {
            const bb = beaconPulses[i];
            const s = 1.9 + 0.7 * Math.sin(t * 1.7 + i * 0.83);
            bb.width = s;
            bb.height = s;
        }
    });

    // ---- FPS 与就绪契约（AFTER_DRAW）----
    const hud = document.getElementById('hud') as HTMLDivElement;
    let windowFrames = 0;
    let windowStart = performance.now();
    director.on(Director.EVENT_AFTER_DRAW, () => {
        state.frames++;
        windowFrames++;
        const now = performance.now();
        if (now - windowStart >= 500) {
            state.fps = Math.round((windowFrames * 1000) / (now - windowStart));
            windowFrames = 0;
            windowStart = now;
            hud.textContent = `fps ${state.fps}  |  bld ${state.buildings}  car ${state.cars}  rain ${state.rainDrops}`;
        }
        if (!(window as any).__appReady) {
            (window as any).__appReady = true;
            state.startedAt = now;
            hud.textContent = `HDR ready | bld ${state.buildings}  car ${state.cars}  rain ${state.rainDrops}`;
        }
    });

    // ---- 相机交互：拖拽环绕 / 滚轮缩放（DOM 指针事件，引擎无关）----
    const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    canvas.addEventListener('pointerdown', (e) => {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        orbit.theta -= (e.clientX - lastX) * 0.005;
        orbit.pitch = Math.min(1.35, Math.max(0.08, orbit.pitch + (e.clientY - lastY) * 0.004));
        lastX = e.clientX;
        lastY = e.clientY;
        applyOrbit();
    });
    canvas.addEventListener('pointerup', (e) => {
        dragging = false;
        try {
            canvas.releasePointerCapture(e.pointerId);
        } catch {
            /* 已释放 */
        }
    });
    canvas.addEventListener(
        'wheel',
        (e) => {
            e.preventDefault();
            orbit.radius = Math.min(260, Math.max(30, orbit.radius + e.deltaY * 0.08));
            applyOrbit();
        },
        { passive: false },
    );

    // ---- Agent Bench 契约 ----
    (window as any).__bench = {
        getState: () => ({
            fps: state.fps,
            frames: state.frames,
            seconds: Math.round((performance.now() - state.startedAt) / 100) / 10,
            buildings: state.buildings,
            cars: state.cars,
            rainDrops: state.rainDrops,
            billboards: state.billboards,
            fog: { enabled: true, type: 1, density: FOG_DENSITY },
        }),
        reset: () => {
            cityRt.root.destroy(); // 仅销毁节点树；共享 mesh/材质保留
            state.seed = (state.seed * 1103515245 + 12345) % 2147483647;
            cityRt = buildCity(state.seed);
            state.buildings = cityRt.buildings.length;
            state.cars = cityRt.cars.length;
            state.billboards = cityRt.billboards.length;
            return state.seed;
        },
    };

    app.run(scene);
}

main().catch((e) => {
    console.error('[neon-city] fatal:', e);
    const hud = document.getElementById('hud');
    if (hud) hud.textContent = 'fatal: ' + String(e);
});
