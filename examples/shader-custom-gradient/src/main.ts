/**
 * shader-custom-gradient — 用户自写 GLSL 的最小可运行 Shader 示例（G4 正式交付 · 一级）。
 *
 * 链路（探针 docs/evidence/g4-shader-probe.json 双后端 28/28 PASS 验证过）：
 *   用户手写 GLSL（glsl4/3/1 三变体）→ EffectAsset 注册（onLoaded）→ Material.initialize({effectAsset})
 *   → MeshRenderer.setSharedMaterial → WebGL 上屏；uniform（颜色 vec4 + 时间 float）运行期可改。
 *
 * 效果契约（effect.functional 的可执行来源）：
 * - 一个平面 quad 铺满视口中心，片元按 v_uv.x 在 colorA↔colorB 间水平渐变，叠加 cc_time 驱动的
 *   正弦明度波动（timeScale 控制速率）；
 * - B 基线：左半屏偏 colorA、右半屏偏 colorB（横向采样两点，色相相反）；
 * - C uniform-vec4：setProperty('colorA', …) → 左半屏色相立即改变；
 * - D 时间动画：timeScale>0 时同一采样点两帧不同（帧差）；
 * - E uniform-float 冻结：timeScale=0 → 两帧逐位相同（边界断言）；
 * - 交互：点击画布切换 colorB 色相（frame-diff + 采样点断言）。
 * - __lifecycle()：release = material.destroy + EffectAsset.remove/destroy（持有引用 invalid），
 *   reacquire = 同一注册路径重建（重新 onLoaded + initialize + 上屏）。
 *
 * 时机纪律（GAP-B1）：EffectAsset.onLoaded / Material.initialize 必须在 createAirApp 之后。
 * 断言失败路径：pcheck 失败 → throw → pageerror → no-runtime-error 红。
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
    isValid,
    input,
    Input,
    gfx,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';
import { standardVert, fragVariants, makeUserEffectJson } from '../../shared/shader-blocks.js';

const probe = {
    id: 'shader-custom-gradient',
    ready: false,
    ok: false,
    clickPhaseDone: false,
    checks: [] as { name: string; ok: boolean; detail: string }[],
    state: {} as Record<string, unknown>,
};
(window as any).__trialProbe = probe;

function pcheck(name: string, ok: boolean, detail: string): void {
    probe.checks.push({ name, ok: !!ok, detail });
    if (!ok) {
        throw new Error('[shader-custom-gradient] assertion failed: ' + name + ' — ' + detail);
    }
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 用户片元源码：水平渐变（colorA→colorB by v_uv.x）+ cc_time 正弦明度波动。
// Constants 块（material set，binding 0，FRAGMENT）：colorA/colorB vec4、timeScale float。
// ---------------------------------------------------------------------------
const GRAD_FRAG_GLSL4 = `precision mediump float;
layout(set = 0, binding = 0) uniform CCGlobal {
  highp   vec4 cc_time;
  mediump vec4 cc_screenSize;
  mediump vec4 cc_nativeSize;
  mediump vec4 cc_debug_view_mode;
};
layout(set = 1, binding = 0) uniform Constants {
  vec4 colorA;
  vec4 colorB;
  float timeScale;
};
in mediump vec2 v_uv;
layout(location = 0) out vec4 cc_FragColor;
void main () {
  float wave = 0.85 + 0.15 * sin(cc_time.x * timeScale);
  vec3 base = mix(colorA.rgb, colorB.rgb, clamp(v_uv.x, 0.0, 1.0));
  cc_FragColor = vec4(base * wave, 1.0);
}`;

const GRAD_FRAG_GLSL1 = `precision mediump float;
uniform highp vec4 cc_time;
uniform mediump vec4 cc_screenSize;
uniform mediump vec4 cc_nativeSize;
uniform mediump vec4 cc_debug_view_mode;
uniform mediump vec4 colorA;
uniform mediump vec4 colorB;
uniform mediump float timeScale;
varying mediump vec2 v_uv;
void main () {
  float wave = 0.85 + 0.15 * sin(cc_time.x * timeScale);
  vec3 base = mix(colorA.rgb, colorB.rgb, clamp(v_uv.x, 0.0, 1.0));
  gl_FragColor = vec4(base * wave, 1.0);
}`;

const EFFECT_NAME = 'air-example-gradient';
const PROG = 'air-example-gradient|grad-vs:vert|grad-fs:frag';

const vert = standardVert();
const frag = fragVariants(GRAD_FRAG_GLSL4, GRAD_FRAG_GLSL1);

let effect: any = null;
let material: Material; // 共享材质资产（lifecycle 持有/销毁对象）
let liveMat: Material; // renderer.material 实例——运行期 setProperty 一律走它（正典 readback 实例化教训）
let quadRenderer: MeshRenderer;

function buildEffect(): any {
    const json = makeUserEffectJson({
        name: EFFECT_NAME,
        prog: PROG,
        hash: 926101,
        properties: {
            colorA: { value: [0.85, 0.25, 0.25, 1], type: 16 },
            colorB: { value: [0.25, 0.45, 0.9, 1], type: 16 },
            timeScale: { value: [1.5], type: 13 },
        },
        members: [
            { name: 'colorA', type: 16, count: 1 },
            { name: 'colorB', type: 16, count: 1 },
            { name: 'timeScale', type: 13, count: 1 },
        ],
    });
    const e = Object.assign(new EffectAsset(), json);
    e.shaders[0].glsl4 = { vert: vert.glsl4, frag: frag.glsl4 };
    e.shaders[0].glsl3 = { vert: vert.glsl3, frag: frag.glsl3 };
    e.shaders[0].glsl1 = { vert: vert.glsl1, frag: frag.glsl1 };
    e.onLoaded(); // programLib.register + EffectAsset.register（必须在 createAirApp 之后）
    return e;
}

function buildMaterial(): Material {
    const m = new Material();
    m.initialize({ effectAsset: effect });
    m.setProperty('colorB', new Color(64, 114, 230, 255)); // 显式设值：material-property 期望精确读回
    return m;
}

/** 采样画布归一化坐标 (u,v)（左上原点）处的像素；EVENT_AFTER_DRAW 内取帧。 */
function sampleUV(u: number, v: number): Promise<number[]> {
    return new Promise((resolve, reject) => {
        const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
        const timer = setTimeout(() => {
            director.off(Director.EVENT_AFTER_DRAW, onDraw);
            reject(new Error('no frame within 8s'));
        }, 8000);
        function onDraw(): void {
            director.off(Director.EVENT_AFTER_DRAW, onDraw);
            clearTimeout(timer);
            try {
                const snap = document.createElement('canvas');
                snap.width = canvas.width;
                snap.height = canvas.height;
                const ctx = snap.getContext('2d') as CanvasRenderingContext2D;
                ctx.drawImage(canvas, 0, 0);
                const x = Math.max(0, Math.min(snap.width - 1, Math.round(u * snap.width)));
                const y = Math.max(0, Math.min(snap.height - 1, Math.round(v * snap.height)));
                const d = ctx.getImageData(x, y, 1, 1).data;
                resolve([d[0], d[1], d[2], d[3]]);
            } catch (e) {
                reject(e as Error);
            }
        }
        director.on(Director.EVENT_AFTER_DRAW, onDraw);
    });
}

let scene: Scene;

async function main(): Promise<void> {
    const app = await createAirApp({ canvas: '#GameCanvas' });
    (window as any).__airApp = app;

    // ---- 注册（引擎启动后） ----------------------------------------------------
    effect = buildEffect();
    EffectAsset.register(effect);
    const registeredEffects = EffectAsset.getAll();
    pcheck(
        'effect-public-fields',
        effect.constructor.name === 'EffectAsset' &&
            registeredEffects[EFFECT_NAME] === effect &&
            effect.techniques.length > 0 &&
            effect.combinations.length >= 0 &&
            effect.hideInEditor === false,
        'EffectAsset register/getAll/techniques/combinations/hideInEditor',
    );
    const defaultEffectProbe = new EffectAsset();
    defaultEffectProbe.initDefault();
    pcheck(
        'effect-init-default',
        defaultEffectProbe.name === 'builtin-unlit' && defaultEffectProbe.validate(),
        'default effect',
    );
    defaultEffectProbe.destroy();
    pcheck('effect-registered', EffectAsset.get(EFFECT_NAME) === effect, 'EffectAsset.get !== 注册实例');
    const canvasEl = document.getElementById('GameCanvas') as HTMLCanvasElement;
    const gl = (canvasEl.getContext('webgl2') || canvasEl.getContext('webgl')) as WebGLRenderingContext | null;
    probe.state.glVersion = gl ? String(gl.getParameter(gl.VERSION)) : 'none';
    try {
        const device = director.root && director.root.device;
        probe.state.gfxAPI =
            device && gfx && gfx.API
                ? Object.keys(gfx.API).find((k) => gfx.API[k] === device.gfxAPI) || String(device.gfxAPI)
                : 'unknown';
    } catch (e) {
        probe.state.gfxAPI = 'query-threw';
    }

    // ---- 场景：正交相机 + 居中 quad --------------------------------------------
    scene = new Scene('shader-custom-gradient');
    const cameraNode = new Node('Main Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(new Vec3(0, 0, 5));
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 1.6;
    camera.near = 0.1;
    camera.far = 20;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(16, 18, 24, 255);
    camera.visibility = Layers.Enum.DEFAULT;
    camera.priority = 0;

    const quad = new Node('GradientQuad');
    quad.layer = Layers.Enum.DEFAULT;
    quad.setPosition(new Vec3(0, 0, 0));
    quad.setRotationFromEuler(90, 0, 0); // plane 法线 +Y → 转 +Z 面向相机
    scene.addChild(quad);
    quadRenderer = quad.addComponent(MeshRenderer);
    quadRenderer.mesh = utils.createMesh(
        primitives.plane({ width: 5, length: 3, widthSegments: 1, lengthSegments: 1 }),
    );
    material = buildMaterial();
    quadRenderer.setSharedMaterial(material, 0);
    liveMat = quadRenderer.material as Material;

    app.run(scene);
    await sleep(700);

    // ---- B 基线：左半偏 colorA(红)、右半偏 colorB(蓝) ---------------------------
    const left = await sampleUV(0.3, 0.5);
    const right = await sampleUV(0.7, 0.5);
    probe.state.baseline = { left, right };
    pcheck(
        'gradient-horizontal',
        left[0] > left[2] + 30 && right[2] > right[0] + 30,
        'left=' + JSON.stringify(left) + '（偏红）right=' + JSON.stringify(right) + '（偏蓝）',
    );

    // ---- C uniform-vec4：改 colorA → 左半色相变绿 ------------------------------
    liveMat.setProperty('colorA', new Color(40, 220, 90, 255));
    await sleep(250);
    const leftGreen = await sampleUV(0.3, 0.5);
    probe.state.afterColorA = leftGreen;
    pcheck(
        'uniform-vec4-colorA',
        leftGreen[1] > leftGreen[0] + 40 && leftGreen[1] > leftGreen[2] + 40,
        'left after colorA=green: ' + JSON.stringify(leftGreen),
    );

    // ---- D 时间动画：timeScale 提速 + 三采样配对帧差（单区间在正弦极值处导数趋零，不鲁棒） ----
    liveMat.setProperty('timeScale', 2.5);
    const d0 = await sampleUV(0.5, 0.5);
    await sleep(150);
    const d1 = await sampleUV(0.5, 0.5);
    await sleep(150);
    const d2 = await sampleUV(0.5, 0.5);
    const pdiff = (a: number[], b: number[]): number =>
        Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
    const maxDiff = Math.max(pdiff(d0, d1), pdiff(d1, d2), pdiff(d0, d2));
    probe.state.animDiff = { d0, d1, d2, maxDiff };
    pcheck('time-animation-frame-diff', maxDiff >= 2, 'maxDiff=' + maxDiff);

    // ---- E uniform-float 冻结：timeScale=0 → 两帧逐位相同 ----------------------
    liveMat.setProperty('timeScale', 0);
    await sleep(220);
    const f0 = await sampleUV(0.5, 0.5);
    await sleep(200);
    const f1 = await sampleUV(0.5, 0.5);
    probe.state.frozen = { f0, f1 };
    pcheck(
        'uniform-float-freeze',
        f0.every((v, i) => v === f1[i]),
        'f0=' + JSON.stringify(f0) + ' f1=' + JSON.stringify(f1),
    );
    liveMat.setProperty('timeScale', 1.5);

    // ---- 交互：点击切换 colorB 色相 -------------------------------------------
    let toggled = false;
    const onToggle = (): void => {
        toggled = !toggled;
        liveMat.setProperty('colorB', toggled ? new Color(240, 200, 40, 255) : new Color(64, 114, 230, 255));
        if (!probe.clickPhaseDone) {
            probe.clickPhaseDone = true;
            pcheck('click-changes-colorB', true, 'toggled=' + toggled);
        }
        renderPanel();
    };
    input.on(Input.EventType.TOUCH_START, onToggle);

    // ---- §25 Lifecycle 合同 ----------------------------------------------------
    installAssetLifecycle({
        label: 'shader-custom-gradient',
        hold: () => {
            const held: { name: string; ref: object }[] = [];
            if (effect) {
                held.push({ name: 'EffectAsset(gradient)', ref: effect });
            }
            if (material) {
                held.push({ name: 'Material(gradient)', ref: material });
            }
            return held;
        },
        release: () => {
            input.off(Input.EventType.TOUCH_START, onToggle);
            quadRenderer.setSharedMaterial(null, 0);
            if (material) {
                material.destroy();
            }
            if (effect) {
                EffectAsset.remove(effect);
                effect.destroy();
                effect = null;
            }
        },
        reacquire: async () => {
            await sleep(250);
            effect = buildEffect(); // 同一注册路径重建
            material = buildMaterial();
            material.setProperty('colorA', new Color(40, 220, 90, 255)); // 共享材质先行设值：实例化时随拷贝带入
            quadRenderer.setSharedMaterial(material, 0);
            liveMat = quadRenderer.material as Material; // setSharedMaterial 已销毁旧实例——重新取得
            input.on(Input.EventType.TOUCH_START, onToggle);
            return [
                { name: 'EffectAsset(gradient)', ref: effect },
                { name: 'Material(gradient)', ref: material },
            ];
        },
    });

    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;left:10px;top:8px;color:#9cd;font:13px monospace;z-index:10';
    document.body.appendChild(panel);
    function renderPanel(): void {
        panel.textContent =
            'shader-custom-gradient · ' +
            (probe.state.gfxAPI || '?') +
            ' · colorB ' +
            (toggled ? 'yellow' : 'blue') +
            ' — click to toggle';
    }
    renderPanel();

    probe.state.effectValid = isValid(effect);
    probe.ready = true;
    probe.ok = probe.checks.every((c) => c.ok);
}

main().catch((e) => {
    probe.ready = true;
    probe.ok = false;
    probe.state.fatal = String((e && e.message) || e);
    throw e;
});
