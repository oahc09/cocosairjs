/**
 * shader-dissolve — 用户自写 GLSL 的进阶 Shader 示例：贴图采样 + 溶解动画 + 交互（G4 正式交付 · 二级）。
 *
 * 在 shader-custom-gradient（一级：纯色渐变 + uniform）之上叠加：
 * - sampler2D：用户 shader 内 texture2D(mainTexture, v_uv) 采样程序化棋盘纹理（贴图绑定路径）；
 * - 溶解：16×16 单元 hash 噪声 vs threshold uniform → discard；边界单元以 edgeColor 发光；
 * - 动画：DissolveAnimator 组件每帧 setProperty('threshold', …)（运行期逐帧 uniform 更新路径）；
 * - 交互：点击切换 edgeColor 色相并跳到半溶解态。
 *
 * 效果契约（effect.functional 的可执行来源）：
 * - T1 threshold=0：完整贴图——相邻两采样点为棋盘互补色（青/橙），证明 sampler 绑定与 UV 正确；
 * - T2 threshold=0.99：近乎全溶解——采样点回落到清屏色（discard 生效）；
 * - T3 threshold=0.5：中心区域品红边缘发光像素 ≥30（edge band 可见）；
 * - T4 动画：threshold 循环 [0,0.92) 时同点两帧不同（帧差）；
 * - 交互：点击 → edgeColor 品红↔青柠切换 + threshold 跳 0.5（frame-diff）；
 * - __lifecycle()：release = material/texture/effect 全链销毁 + EffectAsset.remove，
 *   reacquire = 同一路径重建（重注册 + 重初始化 + 重绑贴图）。
 *
 * 时机纪律（GAP-B1）：注册/材质初始化必须在 createAirApp 之后。
 * 断言失败：pcheck → throw → pageerror → no-runtime-error 红。
 */

import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    Component,
    Layers,
    Vec3,
    Color,
    Material,
    EffectAsset,
    Texture2D,
    ImageAsset,
    utils,
    primitives,
    director,
    Director,
    isValid,
    input,
    Input,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';
import { standardVert, fragVariants, makeUserEffectJson } from '../../shared/shader-blocks.js';

const probe = {
    id: 'shader-dissolve',
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
        throw new Error('[shader-dissolve] assertion failed: ' + name + ' — ' + detail);
    }
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 用户片元源码：棋盘贴图 × 溶解（hash 单元噪声 vs threshold）+ 边缘发光。
// Constants（set1 binding0，FRAGMENT）：mainColor/edgeColor vec4、threshold/speed float；
// mainTexture：sampler2D（set1 binding1）。
// ---------------------------------------------------------------------------
const DISSOLVE_FRAG_GLSL4 = `precision mediump float;
layout(set = 0, binding = 0) uniform CCGlobal {
  highp   vec4 cc_time;
  mediump vec4 cc_screenSize;
  mediump vec4 cc_nativeSize;
  mediump vec4 cc_debug_view_mode;
};
layout(set = 1, binding = 0) uniform Constants {
  vec4 mainColor;
  vec4 edgeColor;
  float threshold;
};
layout(set = 1, binding = 1) uniform sampler2D mainTexture;
in mediump vec2 v_uv;
layout(location = 0) out vec4 cc_FragColor;
float cellHash (vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main () {
  vec4 tex = texture(mainTexture, v_uv);
  float n = cellHash(floor(v_uv * 16.0));
  if (n < threshold) { discard; }
  float edge = (threshold > 0.001 && n >= threshold && n < threshold + 0.08) ? 1.0 : 0.0; // threshold=0 时关闭边缘带（完整贴图态）
  cc_FragColor = mix(tex * mainColor, edgeColor, edge);
}`;

const DISSOLVE_FRAG_GLSL1 = `precision mediump float;
uniform highp vec4 cc_time;
uniform mediump vec4 cc_screenSize;
uniform mediump vec4 cc_nativeSize;
uniform mediump vec4 cc_debug_view_mode;
uniform mediump vec4 mainColor;
uniform mediump vec4 edgeColor;
uniform mediump float threshold;
uniform sampler2D mainTexture;
varying mediump vec2 v_uv;
float cellHash (vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main () {
  vec4 tex = texture2D(mainTexture, v_uv);
  float n = cellHash(floor(v_uv * 16.0));
  if (n < threshold) { discard; }
  float edge = (threshold > 0.001 && n >= threshold && n < threshold + 0.08) ? 1.0 : 0.0; // threshold=0 时关闭边缘带（完整贴图态）
  gl_FragColor = mix(tex * mainColor, edgeColor, edge);
}`;

const EFFECT_NAME = 'air-example-dissolve';
const PROG = 'air-example-dissolve|dissolve-vs:vert|dissolve-fs:frag';
const CLEAR = [16, 18, 24]; // 相机清屏色（采样回落基准）

const vert = standardVert();
const frag = fragVariants(DISSOLVE_FRAG_GLSL4, DISSOLVE_FRAG_GLSL1);

let effect: any = null;
let material: Material; // 共享材质资产（lifecycle 持有/销毁对象）
let liveMat: Material; // renderer.material 实例——所有运行期 setProperty 走它（正典 readback 会创建实例，共享材质更新会与画面脱钩）
let checkerTex: Texture2D | null = null;
let quadRenderer: MeshRenderer;
let animator: DissolveAnimator;
let toggled = false;

// 动画常开（正典批次教训：启动慢 + ready 轮询提前 → 长静窗与 frame-diff 捕获窗重叠判 static）；
// 采样瞬间才短暂关窗，静窗占比 <10%。
const anim = { threshold: 0, animating: true, t: 0 };

function buildEffect(): any {
    const json = makeUserEffectJson({
        name: EFFECT_NAME,
        prog: PROG,
        hash: 926201,
        properties: {
            mainColor: { value: [1, 1, 1, 1], type: 16 },
            edgeColor: { value: [1, 0.16, 0.78, 1], type: 16 },
            threshold: { value: [0], type: 13 },
            mainTexture: { value: 'grey', type: 28 },
        },
        members: [
            { name: 'mainColor', type: 16, count: 1 },
            { name: 'edgeColor', type: 16, count: 1 },
            { name: 'threshold', type: 13, count: 1 },
        ],
        samplerTextures: [{ name: 'mainTexture', type: 28, binding: 1 }],
    });
    const e = Object.assign(new EffectAsset(), json);
    e.shaders[0].glsl4 = { vert: vert.glsl4, frag: frag.glsl4 };
    e.shaders[0].glsl3 = { vert: vert.glsl3, frag: frag.glsl3 };
    e.shaders[0].glsl1 = { vert: vert.glsl1, frag: frag.glsl1 };
    e.onLoaded();
    return e;
}

/** 程序化棋盘纹理（8×8 青/橙单元）：uv(0.3,·) 与 uv(0.45,·) 落在互补色单元。 */
function makeCheckerTexture(): Texture2D {
    const cvs = document.createElement('canvas');
    cvs.width = 128;
    cvs.height = 128;
    const ctx = cvs.getContext('2d') as CanvasRenderingContext2D;
    for (let cy = 0; cy < 8; cy++) {
        for (let cx = 0; cx < 8; cx++) {
            ctx.fillStyle = (cx + cy) % 2 === 0 ? '#28c8be' : '#f0963c';
            ctx.fillRect(cx * 16, cy * 16, 16, 16);
        }
    }
    const tex = new Texture2D();
    tex.image = new ImageAsset(cvs);
    return tex;
}

function buildMaterial(): Material {
    const m = new Material();
    m.initialize({ effectAsset: effect });
    m.setProperty('mainColor', new Color(255, 255, 255, 255)); // 显式设置：getProperty 只回读 setProperty 过的 uniform（d.ts Material 注记）
    m.setProperty('mainTexture', checkerTex as Texture2D);
    m.setProperty('edgeColor', new Color(255, 40, 200, 255));
    m.setProperty('threshold', anim.threshold);
    return m;
}

class DissolveAnimator extends Component {
    update(dt: number): void {
        if (!anim.animating) {
            return;
        }
        anim.t += dt;
        anim.threshold = (anim.t * 0.2) % 0.92; // 循环且永不完全溶解（ready 态画面持续可见）
        liveMat.setProperty('threshold', anim.threshold);
    }
}

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

/** 中心区域快照（RGBA 数组，50% 中央区域）。 */
function captureCenterRegion(): Promise<number[]> {
    return new Promise((resolve, reject) => {
        const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
        const timer = setTimeout(() => {
            director.off(Director.EVENT_AFTER_DRAW, onDraw);
            reject(new Error('no frame'));
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
                const x0 = Math.round(snap.width * 0.25);
                const y0 = Math.round(snap.height * 0.25);
                const d = ctx.getImageData(x0, y0, Math.round(snap.width * 0.5), Math.round(snap.height * 0.5)).data;
                resolve(Array.from(d));
            } catch (e) {
                reject(e as Error);
            }
        }
        director.on(Director.EVENT_AFTER_DRAW, onDraw);
    });
}

/** 中心区域扫描：统计品红边缘发光像素（r>150,b>120,g<110）。 */
async function scanEdgePixels(): Promise<number> {
    return new Promise((resolve, reject) => {
        const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
        const timer = setTimeout(() => {
            director.off(Director.EVENT_AFTER_DRAW, onDraw);
            reject(new Error('no frame'));
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
                const x0 = Math.round(snap.width * 0.25);
                const y0 = Math.round(snap.height * 0.25);
                const w = Math.round(snap.width * 0.5);
                const h = Math.round(snap.height * 0.5);
                const d = ctx.getImageData(x0, y0, w, h).data;
                let count = 0;
                for (let i = 0; i < d.length; i += 4) {
                    if (d[i] > 150 && d[i + 2] > 120 && d[i + 1] < 110) {
                        count++;
                    }
                }
                resolve(count);
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

    // ---- 注册 + 资产（引擎启动后，GAP-B1 纪律） ---------------------------------
    effect = buildEffect();
    pcheck(
        'effect-registered',
        EffectAsset.get(EFFECT_NAME) === effect && effect.validate() === true,
        'get===' + (EffectAsset.get(EFFECT_NAME) === effect) + ' validate=' + effect.validate(),
    );
    checkerTex = makeCheckerTexture();

    scene = new Scene('shader-dissolve');
    const cameraNode = new Node('Main Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(new Vec3(0, 0, 5));
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 1.6;
    camera.near = 0.1;
    camera.far = 20;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(CLEAR[0], CLEAR[1], CLEAR[2], 255);
    camera.visibility = Layers.Enum.DEFAULT;
    camera.priority = 0;

    const quad = new Node('DissolveQuad');
    quad.layer = Layers.Enum.DEFAULT;
    quad.setPosition(new Vec3(0, 0, 0));
    quad.setRotationFromEuler(90, 0, 0);
    scene.addChild(quad);
    quadRenderer = quad.addComponent(MeshRenderer);
    quadRenderer.mesh = utils.createMesh(
        primitives.plane({ width: 5, length: 3, widthSegments: 1, lengthSegments: 1 }),
    );
    material = buildMaterial();
    quadRenderer.setSharedMaterial(material, 0);
    liveMat = quadRenderer.material as Material; // 取得材质实例（与验证器 readback 同一对象）
    animator = quad.addComponent(DissolveAnimator);

    // ---- 交互：edgeColor 切换 + 跳半溶解（订阅前置：正典交互窗可能早于时间线尾部） ----
    const onToggle = (): void => {
        if (!liveMat || !isValid(liveMat)) {
            return;
        }
        toggled = !toggled;
        liveMat.setProperty('edgeColor', toggled ? new Color(180, 255, 60, 255) : new Color(255, 40, 200, 255));
        anim.t = 2.5;
        if (!probe.clickPhaseDone) {
            probe.clickPhaseDone = true;
            pcheck('click-toggles-edge-color', true, 'toggled=' + toggled + '（青柠↔品红）');
        }
        renderPanel();
    };
    input.on(Input.EventType.TOUCH_START, onToggle);

    app.run(scene);
    await sleep(700);

    // ---- T1 threshold=0：棋盘贴图完整（相邻采样点互补色；静窗=采样瞬间） -------------
    anim.animating = false;
    anim.threshold = 0;
    liveMat.setProperty('threshold', 0);
    await sleep(150);
    const c1 = await sampleUV(0.3, 0.56); // v=0.5 恰在棋盘单元边界（双线性混色），取单元内部
    const c2 = await sampleUV(0.45, 0.56);
    anim.animating = true;
    probe.state.checkerSamples = { c1, c2 };
    const isTeal = (p: number[]): boolean => p[1] > 120 && p[2] > 110 && p[0] < 110;
    const isOrange = (p: number[]): boolean => p[0] > 150 && p[1] > 80 && p[2] < 120;
    pcheck(
        'texture-bound-checker',
        (isTeal(c1) && isOrange(c2)) || (isOrange(c1) && isTeal(c2)),
        'c1=' + JSON.stringify(c1) + ' c2=' + JSON.stringify(c2) + '（预期青/橙互补）',
    );
    await sleep(200);

    // ---- T2 threshold=0.99：近乎全溶解（discard → 清屏色） -----------------------
    anim.animating = false;
    liveMat.setProperty('threshold', 0.99);
    await sleep(150);
    const gone = await sampleUV(0.375, 0.5);
    anim.animating = true;
    probe.state.dissolvedSample = gone;
    pcheck(
        'dissolve-to-background',
        Math.abs(gone[0] - CLEAR[0]) < 12 && Math.abs(gone[1] - CLEAR[1]) < 12 && Math.abs(gone[2] - CLEAR[2]) < 12,
        'center=' + JSON.stringify(gone) + '（预期≈清屏色 ' + CLEAR.join(',') + '）',
    );
    await sleep(200);

    // ---- T3 threshold=0.5：边缘发光可见 ------------------------------------------
    anim.animating = false;
    liveMat.setProperty('threshold', 0.5);
    await sleep(150);
    const edgePx = await scanEdgePixels();
    anim.animating = true;
    probe.state.edgePixels = edgePx;
    pcheck('edge-glow-visible', edgePx >= 30, 'edge pixels=' + edgePx);

    // ---- T4 动画：threshold 循环 → 区域帧差（单点对 cell 边界/哈希窗口不鲁棒） --------
    anim.threshold = 0.5;
    anim.t = 2.5; // (2.5*0.2)%0.92 = 0.5 → 从半溶解起步（动画常驻 = visual frame-diff 的来源）
    const frame0 = await captureCenterRegion();
    await sleep(300);
    const frame1 = await captureCenterRegion();
    let changedPx = 0;
    for (let i = 0; i < frame0.length; i += 4) {
        if (
            Math.abs(frame0[i] - frame1[i]) +
                Math.abs(frame0[i + 1] - frame1[i + 1]) +
                Math.abs(frame0[i + 2] - frame1[i + 2]) >=
            12
        ) {
            changedPx++;
        }
    }
    probe.state.animDiff = { changedPx, thresholdNow: Number(anim.threshold.toFixed(3)) };
    pcheck(
        'dissolve-animation-frame-diff',
        changedPx >= 50,
        'changedPx=' + changedPx + ' threshold=' + anim.threshold.toFixed(3),
    );

    // ---- §25 Lifecycle 合同 --------------------------------------------------------
    installAssetLifecycle({
        label: 'shader-dissolve',
        hold: () => {
            const held: { name: string; ref: object }[] = [];
            if (effect) {
                held.push({ name: 'EffectAsset(dissolve)', ref: effect });
            }
            if (material) {
                held.push({ name: 'Material(dissolve)', ref: material });
            }
            if (checkerTex) {
                held.push({ name: 'Texture2D(checker)', ref: checkerTex });
            }
            return held;
        },
        release: () => {
            input.off(Input.EventType.TOUCH_START, onToggle);
            anim.animating = false;
            quadRenderer.setSharedMaterial(null, 0);
            if (material) {
                material.destroy();
            }
            if (checkerTex) {
                checkerTex.destroy();
                checkerTex = null;
            }
            if (effect) {
                EffectAsset.remove(effect);
                effect.destroy();
                effect = null;
            }
        },
        reacquire: async () => {
            await sleep(250);
            effect = buildEffect();
            checkerTex = makeCheckerTexture();
            material = buildMaterial();
            quadRenderer.setSharedMaterial(material, 0);
            liveMat = quadRenderer.material as Material; // setSharedMaterial 已销毁旧实例——重新取得
            anim.animating = true;
            input.on(Input.EventType.TOUCH_START, onToggle);
            return [
                { name: 'EffectAsset(dissolve)', ref: effect },
                { name: 'Material(dissolve)', ref: material },
                { name: 'Texture2D(checker)', ref: checkerTex as object },
            ];
        },
    });

    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;left:10px;top:8px;color:#9cd;font:13px monospace;z-index:10';
    document.body.appendChild(panel);
    function renderPanel(): void {
        panel.textContent =
            'shader-dissolve · threshold ' +
            anim.threshold.toFixed(2) +
            ' · edge ' +
            (toggled ? 'lime' : 'magenta') +
            ' — click to toggle';
    }
    renderPanel();
    setInterval(renderPanel, 400);

    probe.state.effectValid = isValid(effect);
    probe.state.animatorAlive = isValid(animator);
    probe.ready = true;
    probe.ok = probe.checks.every((c) => c.ok);
}

main().catch((e) => {
    probe.ready = true;
    probe.ok = false;
    probe.state.fatal = String((e && e.message) || e);
    throw e;
});
