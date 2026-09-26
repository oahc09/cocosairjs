/* G4 Shader 探针 — 隔离示例（刻意不登记 examples/files.json，不进 Gallery/覆盖率门禁）。
 *
 * 目的（任务计划书 §3 G4.1）：实测「用户手写 GLSL → EffectAsset 注册 → Material 绑定 →
 * uniform 更新 → WebGL 上屏」全链路，并记录：
 *   A. EffectAsset.register/get/getAll 行为（含引擎引导前注册的时机边界）
 *   B. 用户片元源码真实改变像素（负控：中心像素必须显著区别于深色背景）
 *   C. vec4 uniform（mainColor）运行期更新
 *   D. 时间驱动动画（帧差）
 *   E. float uniform（timeScale=0）冻结动画（边界断言）
 *   F. 故意编译错误 → 诊断可读性 + 页面存活（负控）
 *   G. remove / 重复注册 / 重注册后按 effectName 再绑定
 *   H. Material.destroy / EffectAsset.destroy 行为记录
 *
 * 结论纪律：探针结果记录在 docs/evidence/g4-shader-probe.json；PASS 之前不宣称 SDK
 * 支持用户自定义 Shader。运行器：tools/verify/g4-shader-probe.cjs（双后端：默认 + 强制 WebGL1）。
 *
 * 结构参照：src/air/builtin/register.ts（引擎内建 effect 的注册路径，同源做法）：
 *   Object.assign(new EffectAsset(), json) → 补 glsl4/3/1 源码 → onLoaded()。
 * program-lib 按 gfxAPI 选变体（WebGL2→glsl3，WebGL1→glsl1），运行时源码必须自包含
 * （无 chunk include 系统）。UBO 成员布局与引擎同源（src/air/builtin/builtin-glsl4.ts；
 * CCGlobal 已按 register.ts 注记剔除引擎 4.0 移除的 cc_debug_view_composite_pack_1/2/3）。
 */
import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    Layers,
    Vec3,
    Color,
    Material,
    EffectAsset,
    utils,
    primitives,
    director,
    Director,
    gfx,
} from 'cocosair';

const probe = {
    done: false,
    startedAt: new Date().toISOString(),
    info: {},
    checks: [],
    samples: {},
    consoleErrors: [],
    consoleWarns: [],
};
window.__shaderProbe = probe;

// 引擎诊断（errorID / gl.getShaderInfoLog）都经 console 输出：页内挂钩捕获，供 F 相位判定
const origError = console.error.bind(console);
console.error = function (...args) {
    probe.consoleErrors.push(args.map(String).join(' ').slice(0, 2000));
    origError(...args);
};
const origWarn = console.warn.bind(console);
console.warn = function (...args) {
    probe.consoleWarns.push(args.map(String).join(' ').slice(0, 500));
    origWarn(...args);
};

function check(name, ok, detail) {
    probe.checks.push({
        name,
        result: ok ? 'PASS' : 'FAIL',
        detail: String(detail === undefined ? '' : detail).slice(0, 300),
    });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// GLSL 源码（用户手写面）。三变体：glsl4（Vulkan 风格 set/binding）、glsl3（ESSL3，
// WebGL2）、glsl1（ESSL1，WebGL1）。
// ---------------------------------------------------------------------------

const GLSL4_VERT = `precision highp float;
layout(set = 0, binding = 1) uniform CCCamera {
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
};
layout(set = 2, binding = 0) uniform CCLocal {
  highp mat4 cc_matWorld;
  highp mat4 cc_matWorldIT;
  highp vec4 cc_lightingMapUVParam;
  highp vec4 cc_localShadowBias;
};
in vec3 a_position;
in vec2 a_texCoord;
out mediump vec2 v_uv;
void main () {
  v_uv = a_texCoord;
  gl_Position = cc_matViewProj * cc_matWorld * vec4(a_position, 1.0);
}`;

const GLSL4_FRAG = `precision mediump float;
layout(set = 0, binding = 0) uniform CCGlobal {
  highp   vec4 cc_time;
  mediump vec4 cc_screenSize;
  mediump vec4 cc_nativeSize;
  mediump vec4 cc_debug_view_mode;
};
layout(set = 1, binding = 0) uniform Constants {
  vec4 mainColor;
  float timeScale;
};
in mediump vec2 v_uv;
layout(location = 0) out vec4 cc_FragColor;
void main () {
  float wave = 0.75 + 0.25 * sin((cc_time.x + v_uv.x * 6.2831853) * timeScale);
  cc_FragColor = vec4(mainColor.rgb * wave, mainColor.a);
}`;

// glsl3 = glsl4 去 set/binding（register.ts toGlsl3 同款规则）；frag 输出无 location 限定
const GLSL3_VERT = GLSL4_VERT.replace(/layout\s*\([^)]*\)\s*/g, '');
const GLSL3_FRAG = GLSL4_FRAG.replace(/layout\s*\([^)]*\)\s*/g, '');

// glsl1 = ESSL1：UBO 展开为独立 uniform、in/out → attribute/varying、输出 → gl_FragColor
const GLSL1_VERT = `precision highp float;
uniform highp mat4 cc_matView;
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
uniform mediump vec4 cc_viewPort;
uniform highp mat4 cc_matWorld;
uniform highp mat4 cc_matWorldIT;
uniform highp vec4 cc_lightingMapUVParam;
uniform highp vec4 cc_localShadowBias;
attribute highp vec3 a_position;
attribute mediump vec2 a_texCoord;
varying mediump vec2 v_uv;
void main () {
  v_uv = a_texCoord;
  gl_Position = cc_matViewProj * cc_matWorld * vec4(a_position, 1.0);
}`;

const GLSL1_FRAG = `precision mediump float;
uniform highp vec4 cc_time;
uniform mediump vec4 cc_screenSize;
uniform mediump vec4 cc_nativeSize;
uniform mediump vec4 cc_debug_view_mode;
uniform mediump vec4 mainColor;
uniform mediump float timeScale;
varying mediump vec2 v_uv;
void main () {
  float wave = 0.75 + 0.25 * sin((cc_time.x + v_uv.x * 6.2831853) * timeScale);
  gl_FragColor = vec4(mainColor.rgb * wave, mainColor.a);
}`;

// F 相位负控：故意语法错误的片元源码（三变体同源错误）
const BROKEN_FRAG1 =
    'precision mediump float;\nvarying mediump vec2 v_uv;\nvoid main () {\n  gl_FragColor = vec4(1.0, 0.0;\n}\n';
const BROKEN_FRAG34 =
    'precision mediump float;\nin mediump vec2 v_uv;\nlayout(location = 0) out vec4 cc_FragColor;\nvoid main () {\n  cc_FragColor = vec4(1.0, 0.0;\n}\n';

// ---------------------------------------------------------------------------
// effect JSON（编译后形态，与 src/air/builtin/builtin-effects.ts fixtures 同构）。
// 数值枚举：gfx.Type FLOAT4=16 / FLOAT=13；gfx.Format RGB32F=32 / RG32F=21；
// ShaderStageFlagBit FRAGMENT=16；set/binding 按 rendering/define.ts：
// GLOBAL=0（CCGlobal:0, CCCamera:1）、MATERIAL=1（Constants:0）、LOCAL=2（CCLocal:0）。
// ---------------------------------------------------------------------------
function makeEffectJson(name, prog, hash, mainColor) {
    return {
        name,
        techniques: [
            {
                passes: [
                    {
                        program: prog,
                        rasterizerState: { cullMode: 0 },
                        depthStencilState: { depthTest: true, depthWrite: true },
                        blendState: { targets: [{ blend: false }] },
                        properties: {
                            mainColor: { value: mainColor, type: 16 },
                            timeScale: { value: [2], type: 13 },
                        },
                    },
                ],
            },
        ],
        shaders: [
            {
                name: prog,
                hash,
                builtins: {
                    statistics: {
                        CC_EFFECT_USED_VERTEX_UNIFORM_VECTORS: 47,
                        CC_EFFECT_USED_FRAGMENT_UNIFORM_VECTORS: 6,
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
                defines: [],
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
                        members: [
                            { name: 'mainColor', type: 16, count: 1 },
                            { name: 'timeScale', type: 13, count: 1 },
                        ],
                    },
                ],
                samplerTextures: [],
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

function attachGlsl(effect, fragOverride) {
    const s = effect.shaders[0];
    s.glsl4 = { vert: GLSL4_VERT, frag: fragOverride ? BROKEN_FRAG34 : GLSL4_FRAG };
    s.glsl3 = {
        vert: GLSL3_VERT,
        frag: fragOverride ? BROKEN_FRAG34.replace(/layout\s*\([^)]*\)\s*/g, '') : GLSL3_FRAG,
    };
    s.glsl1 = { vert: GLSL1_VERT, frag: fragOverride ? BROKEN_FRAG1 : GLSL1_FRAG };
}

// 中心像素采样：EVENT_AFTER_DRAW 内 drawImage→2D canvas→getImageData
//（与 manual-examples-verify 同款口径；引擎 preserveDrawingBuffer:true）
function sampleCenter() {
    return new Promise((resolve, reject) => {
        const canvas = document.getElementById('GameCanvas');
        const timer = setTimeout(() => {
            director.off(Director.EVENT_AFTER_DRAW, onDraw);
            reject(new Error('no rendered frame within 8s'));
        }, 8000);
        function onDraw() {
            director.off(Director.EVENT_AFTER_DRAW, onDraw);
            clearTimeout(timer);
            try {
                const snap = document.createElement('canvas');
                snap.width = canvas.width;
                snap.height = canvas.height;
                const ctx = snap.getContext('2d');
                ctx.drawImage(canvas, 0, 0);
                const d = ctx.getImageData(snap.width >> 1, snap.height >> 1, 1, 1).data;
                resolve([d[0], d[1], d[2], d[3]]);
            } catch (e) {
                reject(e);
            }
        }
        director.on(Director.EVENT_AFTER_DRAW, onDraw);
    });
}

async function main() {
    probe.info.exports = {
        EffectAsset: typeof EffectAsset,
        register: typeof EffectAsset.register,
        remove: typeof EffectAsset.remove,
        get: typeof EffectAsset.get,
        getAll: typeof EffectAsset.getAll,
    };

    // ---- 注册时机边界（如实记录）：device 未初始化时 onLoaded 的行为 -----------
    try {
        const early = Object.assign(
            new EffectAsset(),
            makeEffectJson('probe-early', 'probe-early|p-vs:vert|p-fs:frag', 925000, [1, 1, 1, 1]),
        );
        attachGlsl(early, null);
        early.onLoaded();
        probe.info.registerBeforeBoot = 'no-throw';
        EffectAsset.remove('probe-early');
        early.destroy();
    } catch (e) {
        probe.info.registerBeforeBoot = 'throws: ' + String((e && e.message) || e).slice(0, 200);
    }

    // ---- 引擎启动（注册 EffectAsset 需要 device 已初始化：内建注册也发生在
    // EVENT_POST_SUBSYSTEM_INIT 时机，探针同款顺序 —— 先行 onLoaded 会踩
    // WebProgramLibrary.init 的空 device，这本身就是探针要记录的行为边界）----
    const app = await createAirApp({ canvas: '#GameCanvas' });
    window.__airApp = app;

    // ---- A：注册 -----------------------------------------------------------
    const effect = Object.assign(
        new EffectAsset(),
        makeEffectJson('probe-unlit', 'probe-unlit|probe-vs:vert|probe-fs:frag', 925001, [1, 0.4, 0.1, 1]),
    );
    attachGlsl(effect, null);
    const allBefore = Object.keys(EffectAsset.getAll()).length;
    effect.onLoaded(); // 引擎内建注册同款入口：programLib.register + EffectAsset.register
    probe.info.allBefore = allBefore;
    probe.info.allAfter = Object.keys(EffectAsset.getAll()).length;
    probe.info.registerGet = EffectAsset.get('probe-unlit') === effect;
    check('A1-register-get', probe.info.registerGet, 'EffectAsset.get("probe-unlit") === 注册实例');
    check('A2-getAll-grew', probe.info.allAfter === allBefore + 1, `getAll ${allBefore} -> ${probe.info.allAfter}`);

    // ---- 场景组装 ----------------------------------------------------------
    const scene = new Scene('shader-probe');
    const camNode = new Node('cam');
    scene.addChild(camNode);
    camNode.setPosition(new Vec3(0, 0, 8));
    const camera = camNode.addComponent(Camera);
    camera.visibility = Layers.Enum.DEFAULT;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(20, 24, 32, 255);

    const boxNode = new Node('box');
    boxNode.layer = Layers.Enum.DEFAULT;
    scene.addChild(boxNode);
    const renderer = boxNode.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: 2.4, height: 2.4, length: 2.4 }));
    const mat = new Material();
    mat.initialize({ effectAsset: effect });
    renderer.setSharedMaterial(mat, 0);
    app.run(scene);

    const canvas = document.getElementById('GameCanvas');
    // 后端如实记录：引擎已持有上下文，getContext 需按同类型查询才有返回值
    const gl2 = canvas.getContext('webgl2');
    const glc = gl2 || canvas.getContext('webgl');
    probe.info.glContext = gl2 ? 'webgl2' : glc ? 'webgl' : 'none';
    probe.info.glVersion = glc ? String(glc.getParameter(glc.VERSION)) : 'none';
    probe.info.glRenderer = glc ? String(glc.getParameter(glc.RENDERER)) : 'none';
    try {
        const device = director.root && director.root.device;
        probe.info.gfxAPIValue = device ? device.gfxAPI : null;
        probe.info.gfxAPIName =
            device && gfx && gfx.API
                ? Object.keys(gfx.API).find((k) => gfx.API[k] === device.gfxAPI) || String(device.gfxAPI)
                : 'unknown';
    } catch (e) {
        probe.info.gfxAPIName = 'query-threw: ' + String((e && e.message) || e);
    }

    // ---- B：用户片元源码上屏（负控：显著区别于背景 (20,24,32)）--------------
    await sleep(900);
    const px0 = await sampleCenter();
    probe.samples.firstFrame = px0;
    check(
        'B1-user-frag-on-screen',
        px0[0] > 120 && px0[0] - px0[1] > 50 && px0[0] - px0[2] > 50,
        'center=' + JSON.stringify(px0) + '（预期橙色系 r 主导，背景 (20,24,32)）',
    );

    // ---- C：vec4 uniform 运行期更新 ----------------------------------------
    mat.setProperty('mainColor', new Color(0, 255, 64, 255));
    await sleep(300);
    const px1 = await sampleCenter();
    probe.samples.afterColorUniform = px1;
    check(
        'C1-uniform-vec4-update',
        px1[1] > 120 && px1[1] - px1[0] > 50 && px1[1] - px1[2] > 50,
        'center=' + JSON.stringify(px1) + '（预期绿色系 g 主导）',
    );

    // ---- D：时间 uniform 驱动动画（帧差） -----------------------------------
    const d0 = await sampleCenter();
    await sleep(150);
    const d1 = await sampleCenter();
    await sleep(150);
    const d2 = await sampleCenter();
    const diff = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
    const maxDiff = Math.max(diff(d0, d1), diff(d1, d2), diff(d0, d2));
    probe.samples.animDiff = { d0, d1, d2, maxDiff };
    check('D1-time-animation-frame-diff', maxDiff >= 2, 'maxDiff=' + maxDiff);

    // ---- E：float uniform 冻结（边界断言） ----------------------------------
    mat.setProperty('timeScale', 0);
    await sleep(250);
    const f0 = await sampleCenter();
    await sleep(220);
    const f1 = await sampleCenter();
    probe.samples.frozen = { f0, f1 };
    check(
        'E1-uniform-float-freeze',
        f0.every((v, i) => v === f1[i]),
        'f0=' + JSON.stringify(f0) + ' f1=' + JSON.stringify(f1),
    );
    mat.setProperty('timeScale', 2);

    // ---- F：故意编译错误 → 诊断可读性 + 页面存活（负控） ----------------------
    const errBefore = probe.consoleErrors.length;
    const broken = Object.assign(
        new EffectAsset(),
        makeEffectJson('probe-broken', 'probe-broken|probe-vs:vert|probe-fs:frag', 925002, [1, 0, 0, 1]),
    );
    attachGlsl(broken, true);
    broken.onLoaded();
    const badNode = new Node('bad');
    badNode.layer = Layers.Enum.DEFAULT;
    badNode.setPosition(new Vec3(2, 0, 2.5)); // 视锥内、不遮挡中心采样点
    scene.addChild(badNode);
    const badRenderer = badNode.addComponent(MeshRenderer);
    badRenderer.mesh = renderer.mesh; // 只读共享网格
    const badMat = new Material();
    badMat.initialize({ effectAsset: broken });
    badRenderer.setSharedMaterial(badMat, 0); // 下一次绘制触发编译
    await sleep(700);
    const newErrors = probe.consoleErrors.slice(errBefore);
    probe.samples.brokenErrors = newErrors.slice(0, 8);
    const hasDiag = newErrors.some((m) => /probe-broken/i.test(m) || /ERROR:/i.test(m) || /\b1632[34]\b/.test(m));
    check(
        'F1-compile-error-diagnostic',
        hasDiag,
        'errors+=' + newErrors.length + ' first=' + (newErrors[0] || '(none)').slice(0, 200),
    );
    const pxAfter = await sampleCenter();
    probe.samples.afterBroken = pxAfter;
    check('F2-page-survives-broken-shader', pxAfter[1] > 120, 'center=' + JSON.stringify(pxAfter) + '（好盒子仍绿）');
    badNode.destroy();

    // ---- G：remove / 重复注册 / 重注册再绑定 ---------------------------------
    EffectAsset.remove('probe-unlit');
    probe.info.afterRemoveGet = EffectAsset.get('probe-unlit') === null;
    check(
        'G1-remove',
        probe.info.afterRemoveGet === true,
        'remove 后 get → ' + (probe.info.afterRemoveGet ? 'null' : '仍存在'),
    );

    const effect2 = Object.assign(
        new EffectAsset(),
        makeEffectJson('probe-unlit', 'probe-unlit|probe-vs:vert|probe-fs:frag', 925003, [0.1, 0.3, 1, 1]),
    );
    attachGlsl(effect2, null);
    effect2.onLoaded();
    let dupThrew = null;
    try {
        EffectAsset.register(effect2);
        effect2.onLoaded();
    } catch (e) {
        dupThrew = String((e && e.message) || e);
    }
    probe.info.duplicateRegisterThrew = dupThrew;
    probe.info.getAfterDup = EffectAsset.get('probe-unlit') === effect2;
    check(
        'G2-duplicate-register-survives',
        dupThrew === null && probe.info.getAfterDup === true,
        'threw=' + dupThrew + ' get===effect2: ' + probe.info.getAfterDup,
    );

    const mat2 = new Material();
    mat2.initialize({ effectName: 'probe-unlit' }); // 按名字走静态表 → effect2（蓝色默认）
    renderer.setSharedMaterial(mat2, 0);
    await sleep(450);
    const px2 = await sampleCenter();
    probe.samples.afterReregister = px2;
    check(
        'G3-reregister-renders',
        px2[2] > 120 && px2[2] - px2[0] > 50 && px2[2] - px2[1] > 30,
        'center=' + JSON.stringify(px2) + '（预期蓝色系 b 主导）',
    );

    // ---- H：销毁行为记录 -----------------------------------------------------
    let matDestroyThrew = null;
    try {
        probe.info.materialDestroyReturn = mat.destroy();
    } catch (e) {
        matDestroyThrew = String((e && e.message) || e);
    }
    await sleep(250);
    const px3 = await sampleCenter();
    check(
        'H1-material-destroy-no-crash',
        matDestroyThrew === null && px3[2] > 120,
        'threw=' + matDestroyThrew + ' center=' + JSON.stringify(px3),
    );

    let effectDestroyThrew = null;
    try {
        probe.info.effectDestroyReturn = effect2.destroy();
        probe.info.getAfterEffectDestroy = EffectAsset.get('probe-unlit') === null;
    } catch (e) {
        effectDestroyThrew = String((e && e.message) || e);
    }
    check(
        'H2-effect-destroy-no-throw',
        effectDestroyThrew === null,
        'threw=' +
            effectDestroyThrew +
            ' destroy=' +
            probe.info.effectDestroyReturn +
            ' get→null: ' +
            probe.info.getAfterEffectDestroy,
    );
    await sleep(250);
    const px4 = await sampleCenter();
    probe.samples.final = px4;
    check('H3-page-alive-final', !!px4 && px4[3] > 0, 'center=' + JSON.stringify(px4));

    probe.finishedAt = new Date().toISOString();
    probe.done = true;
}

main().catch((e) => {
    probe.fatal = String((e && e.stack) || e);
    probe.finishedAt = new Date().toISOString();
    probe.done = true;
});
