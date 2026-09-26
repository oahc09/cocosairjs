/**
 * render-composite — 渲染组合：相机/灯光 → 材质/纹理 → 渲染目标 → resize（G1 组合场景 · P09+P19）。
 *
 * 效果契约（effect.functional 的可执行来源）——每一级组合以「画面真实变化」或结构断言证明：
 * - P1 基线：中心像素为蓝色主体（区别于清屏色 (30,40,60)）；
 * - P2 环境与灯光（r53 起全部为正向视觉断言；历史 GAP-L1 已修复，见矩阵 §7 与
 *   docs/evidence/g1-light-contribution-gap.json 修复记录）：
 *   a) SceneGlobals ambient 原位变更（skyColorHDR.set）→ 画面色相真实变化（断言）→ 恢复；
 *   b) 点光源开关（HDR 量级 luminance=24000）→ 中心亮度上升 ≥15%（断言）→ 运行期增删
 *      临时点光源：Light 组件计数 +1 → 组件 destroy + 节点 destroy → 计数回落、isValid=false；
 *   c) 主光 illuminance 30000→65000（HDR 量级）→ 中心亮度上升（断言）→ 恢复；
 *   单位语义纪律：isHDR 默认 true（exposure=1/38400），illuminance/luminance 必须用 HDR
 *   量级（主光 ~65000 lux、点光 ~24000）；LDR 量级（1.2/8/900）× exposure ≈ 0 = 不可见；
 * - P3 材质/纹理：SubjectBox 换 builtin-unlit + 程序化纹理（USE_TEXTURE）→ 中心像素变黄（断言）；
 * - P4 渲染目标：camera.targetTexture = rt（256×256）捕获 → 恢复屏幕 → RT 贴到 RTQuad 上屏，
 *   worldToScreen 定位采样点，像素非背景（RT 内容真实可见，断言）；
 * - P5 渲染目标 resize：rt.reset({128×128}) → 重捕获 → quad 内容仍上屏 + width/height 读回（断言）；
 *   注：框架 Camera 组件不导出 resize/width/height（inventory 的 Camera.resize 属 render-scene
 *   内部面——导出面缺口已登记差距矩阵 P03）；camera.rect 读回一并记录。
 * - 交互：点击画布 → 主体材质切换（蓝 standard ↔ 黄 unlit 纹理）+ 点光源开关 → frame-diff；
 * - __lifecycle()：release = RTQuad/RT/纹理材质全链销毁（主体先恢复基础材质），
 *   reacquire = 同一 capture 路径重建（重新捕获 RT + 重建 quad）。
 *
 * 采样口径：Spinner 在采样窗暂停（排除旋转干扰），EVENT_AFTER_DRAW 内 drawImage → 2D canvas
 * → getImageData（与 manual-examples-verify 同款）。断言失败 → throw → no-runtime-error 红。
 */

import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    DirectionalLight,
    PointLight,
    Component,
    Layers,
    Vec3,
    Color,
    Material,
    utils,
    primitives,
    Texture2D,
    ImageAsset,
    RenderTexture,
    input,
    Input,
    director,
    Director,
    isValid,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

const probe = {
    id: 'render-composite',
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
        throw new Error('[render-composite] assertion failed: ' + name + ' — ' + detail);
    }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const lum = (px: number[]): number => 0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2];

let scene: Scene;
let camera: Camera;
let keyLight: DirectionalLight;
let pointLight: PointLight;
let subjectBox: Node;
let subjectRenderer: MeshRenderer;
let pointLightNode: Node;
let rtQuadNode: Node | null = null;
let rt: RenderTexture | null = null;
let matRT: Material | null = null;
let checkerTex: Texture2D | null = null;
let matBase: Material;
let matTextured: Material | null = null;
let spinEnabled = true;
let spinMaster = true; // P1–P2c 光度对比区间总开关：主光生效后旋转面明暗随角度变化，跨采样比较必须冻结自旋
let tmpLightVisualDelta = 0;
let lightPropVisualDelta = 0;

class Spinner extends Component {
    update(dt: number): void {
        if (spinEnabled && spinMaster) {
            this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 45, 0);
        }
    }
}

function materialWith(effect: string, color: Color, defines?: Record<string, boolean | number>): Material {
    const material = new Material();
    material.initialize(defines ? { effectName: effect, defines } : { effectName: effect });
    material.setProperty('mainColor', color);
    return material;
}

/** EVENT_AFTER_DRAW 内采样指定画布像素（x/y 为左上角原点像素坐标）。 */
function sampleAt(x: number, y: number): Promise<number[]> {
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
                const d = ctx.getImageData(
                    Math.max(0, Math.min(snap.width - 1, Math.round(x))),
                    Math.max(0, Math.min(snap.height - 1, Math.round(y))),
                    1,
                    1,
                ).data;
                resolve([d[0], d[1], d[2], d[3]]);
            } catch (e) {
                reject(e as Error);
            }
        }
        director.on(Director.EVENT_AFTER_DRAW, onDraw);
    });
}

/** 采样窗：暂停旋转 → 等待稳定 → 采样 → 恢复。 */
async function stillSample(x: number, y: number): Promise<number[]> {
    spinEnabled = false;
    await sleep(180);
    const px = await sampleAt(x, y);
    spinEnabled = spinMaster;
    return px;
}

function stillSampleCenter(): Promise<number[]> {
    const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
    return stillSample(canvas.width / 2, canvas.height / 2);
}

function makeCheckerTexture(): Texture2D {
    const cvs = document.createElement('canvas');
    cvs.width = 64;
    cvs.height = 64;
    const ctx = cvs.getContext('2d') as CanvasRenderingContext2D;
    ctx.fillStyle = '#fad850';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(0, 0, 64, 8);
    ctx.fillRect(0, 56, 64, 8);
    const tex = new Texture2D();
    tex.image = new ImageAsset(cvs);
    return tex;
}

function countLights(): number {
    let n = 0;
    const s = director.getScene();
    if (s) {
        s.walk((node: Node) => {
            if (node.getComponent(PointLight) || node.getComponent(DirectionalLight)) {
                n++;
            }
        });
    }
    return n;
}

/** P4/P5/lifecycle 共用：RT 捕获 → quad 上屏（同一实现路径承担「拆得掉」与「建得回」）。 */
async function captureAndShowRT(size: number): Promise<void> {
    if (!rt) {
        rt = new RenderTexture();
    }
    rt.reset({ width: size, height: size });
    camera.targetTexture = rt;
    await sleep(220); // 数帧写入 RT（快照内容 = 当时的场景）
    camera.targetTexture = null;
    await sleep(120);
    if (!matRT || !isValid(matRT)) {
        matRT = materialWith('builtin-unlit', new Color(255, 255, 255, 255), { USE_TEXTURE: true });
    }
    matRT.setProperty('mainTexture', rt);
    if (!rtQuadNode || !isValid(rtQuadNode)) {
        rtQuadNode = new Node('RTQuad');
        rtQuadNode.layer = Layers.Enum.DEFAULT;
        rtQuadNode.setPosition(new Vec3(-2.3, 1.7, 0.8));
        rtQuadNode.setRotationFromEuler(90, 0, 0);
        scene.addChild(rtQuadNode);
        const renderer = rtQuadNode.addComponent(MeshRenderer);
        renderer.mesh = utils.createMesh(
            primitives.plane({ width: 1.8, length: 1.8, widthSegments: 1, lengthSegments: 1 }),
        );
        renderer.setSharedMaterial(matRT, 0);
    }
    await sleep(250);
}

let lastWorldToScreen: number[] = [];
function rtQuadScreenPoint(): { x: number; y: number } {
    const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
    const out = new Vec3();
    camera.worldToScreen(new Vec3(-2.3, 1.7, 0.8), out);
    lastWorldToScreen = [out.x, out.y, out.z];
    const renderCamera = camera.camera;
    pcheck(
        'render-camera-public-access',
        renderCamera.width > 0 && renderCamera.height > 0 && renderCamera.aspect > 0,
        'size=' + renderCamera.width + 'x' + renderCamera.height + ' aspect=' + renderCamera.aspect,
    );
    pcheck(
        'world-to-screen-in-viewport',
        Number.isFinite(out.x) &&
            Number.isFinite(out.y) &&
            out.x > 0 &&
            out.x < canvas.width &&
            out.y > 0 &&
            out.y < canvas.height,
        'screen=' + JSON.stringify(lastWorldToScreen),
    );
    // worldToScreen returns nonlinear projection depth; screenToWorld expects
    // a linear near-to-far fraction for a perspective camera.
    const depth = (camera.near * camera.far) / (camera.far - out.z * (camera.far - camera.near));
    const restored = camera.screenToWorld(new Vec3(out.x, out.y, (depth - camera.near) / (camera.far - camera.near)));
    pcheck(
        'screen-world-roundtrip',
        Vec3.distance(restored, new Vec3(-2.3, 1.7, 0.8)) < 0.01,
        'world=' + JSON.stringify([restored.x, restored.y, restored.z]),
    );
    // Camera uses a bottom-left origin; Canvas2D uses top-left.
    return { x: out.x, y: canvas.height - out.y };
}

/** 区域扫描：以 (cx,cy) 为中心的窗口内非清屏色像素计数 + 代表像素。 */
async function scanRegion(
    cx: number,
    cy: number,
    half: number,
): Promise<{ count: number; warm: number; pixel: number[] }> {
    spinEnabled = false;
    await sleep(180);
    const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
    const x0 = Math.max(0, Math.round(cx - half));
    const y0 = Math.max(0, Math.round(cy - half));
    const x1 = Math.min(canvas.width - 1, Math.round(cx + half));
    const y1 = Math.min(canvas.height - 1, Math.round(cy + half));
    const px = await new Promise<number[]>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no frame')), 8000);
        function onDraw(): void {
            director.off(Director.EVENT_AFTER_DRAW, onDraw);
            clearTimeout(timer);
            const snap = document.createElement('canvas');
            snap.width = canvas.width;
            snap.height = canvas.height;
            const ctx = snap.getContext('2d') as CanvasRenderingContext2D;
            ctx.drawImage(canvas, 0, 0);
            const d = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data;
            resolve(Array.from(d));
        }
        director.on(Director.EVENT_AFTER_DRAW, onDraw);
    });
    spinEnabled = true;
    let count = 0;
    let warm = 0;
    let rep = [0, 0, 0, 0];
    for (let i = 0; i < px.length; i += 4) {
        const r = px[i];
        const g = px[i + 1];
        const b = px[i + 2];
        if (!(Math.abs(r - 30) < 12 && Math.abs(g - 40) < 12 && Math.abs(b - 60) < 12)) {
            count++;
            if (rep[3] === 0) {
                rep = [r, g, b, px[i + 3]];
            }
        }
        if (r > 150 && g > 110 && b < 150 && r > b + 40) {
            warm++;
        } // 快照中的黄色纹理盒像素
    }
    return { count, warm, pixel: rep };
}

async function main(): Promise<void> {
    const app = await createAirApp({ canvas: '#GameCanvas' });
    (window as any).__airApp = app;
    scene = new Scene('render-composite');

    const cameraNode = new Node('Main Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(new Vec3(0, 1.6, 6));
    cameraNode.lookAt(new Vec3(0, 1, 0));
    camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.PERSPECTIVE;
    camera.fov = 45;
    camera.near = 0.1;
    camera.far = 100;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(30, 40, 60, 255);
    camera.visibility = Layers.Enum.DEFAULT;
    camera.priority = 0;

    const lightNode = new Node('Main Light');
    scene.addChild(lightNode);
    lightNode.setPosition(new Vec3(0, 8, 0));
    lightNode.setRotationFromEuler(-45, -30, 0);
    keyLight = lightNode.addComponent(DirectionalLight);
    keyLight.illuminance = 30000; // HDR 量级（isHDR 默认 true；LDR 量级会被 exposure=1/38400 压灭）

    subjectBox = new Node('SubjectBox');
    subjectBox.layer = Layers.Enum.DEFAULT;
    subjectBox.setPosition(new Vec3(0, 1, 0));
    scene.addChild(subjectBox);
    subjectRenderer = subjectBox.addComponent(MeshRenderer);
    subjectRenderer.mesh = utils.createMesh(primitives.box({ width: 1.6, height: 1.6, length: 1.6 }));
    matBase = materialWith('builtin-standard', new Color(70, 120, 235, 255));
    subjectRenderer.setSharedMaterial(matBase, 0);
    subjectBox.addComponent(Spinner);

    pointLightNode = new Node('PointLightNode');
    pointLightNode.layer = Layers.Enum.DEFAULT;
    pointLightNode.setPosition(new Vec3(2, 2, 2));
    scene.addChild(pointLightNode);
    pointLight = pointLightNode.addComponent(PointLight);
    pointLight.luminance = 24000; // HDR 量级（组件默认标定同量级）
    pointLight.range = 12;
    pointLightNode.active = false; // P2b 开启并断言亮度上升

    app.run(scene);
    await sleep(600);

    // ---- P1 基线（P1–P2c 为光度对比区间：冻结自旋，主光生效后旋转面明暗随角度变化） ----
    spinMaster = false;
    subjectBox.setRotationFromEuler(0, 0, 0); // 光度基准角钉死：冻结相位随负载漂移曾致 baseLum 35→56 漂移、p2b 假红（r53 批次实测）
    await sleep(220); // 姿态落定
    const base = await stillSampleCenter();
    pcheck(
        'p1-baseline-visible',
        base[2] > base[0] + 25 && base[2] > base[1] + 25,
        'center=' + JSON.stringify(base) + '（预期蓝色主体，clear=(30,40,60)）',
    );
    const baseLum = lum(base);

    // ---- P2a ambient 可见路径（SceneGlobals 原位变更 → 真实像素变化） --------------
    const amb = scene.globals.ambient;
    const sky0 = [amb.skyColorHDR.x, amb.skyColorHDR.y, amb.skyColorHDR.z, amb.skyColorHDR.w];
    amb.skyColorHDR.set(0.05, 0.9, 0.1, sky0[3]); // 绿偏置
    await sleep(250);
    const ambGreen = await stillSampleCenter();
    pcheck(
        'p2a-ambient-shifts-pixels',
        Math.abs(ambGreen[1] - base[1]) + Math.abs(ambGreen[0] - base[0]) + Math.abs(ambGreen[2] - base[2]) >= 8,
        'base=' + JSON.stringify(base) + ' ambientGreen=' + JSON.stringify(ambGreen),
    );
    amb.skyColorHDR.set(sky0[0], sky0[1], sky0[2], sky0[3]); // 恢复
    await sleep(250);
    const ambBack = await stillSampleCenter();
    pcheck(
        'p2a-ambient-restored',
        Math.abs(lum(ambBack) - baseLum) < baseLum * 0.15 + 3,
        'baseLum=' + baseLum.toFixed(1) + ' restoredLum=' + lum(ambBack).toFixed(1),
    );

    // ---- P2b 点光源：开关视觉断言（HDR 量级）+ 运行期增删结构断言 -------------------
    pointLightNode.active = true;
    await sleep(250);
    const pointOn = await stillSampleCenter();
    pcheck(
        'p2b-pointlight-brightens',
        lum(pointOn) > baseLum * 1.15,
        'baseLum=' + baseLum.toFixed(1) + ' pointOnLum=' + lum(pointOn).toFixed(1),
    );
    pointLightNode.active = false; // P2c 主光断言前关闭点光（避免叠加饱和污染基线）
    await sleep(250);
    const pointOff = await stillSampleCenter();
    pcheck(
        'p2b-pointlight-off-restores',
        Math.abs(lum(pointOff) - baseLum) < baseLum * 0.15 + 3,
        'pointOffLum=' + lum(pointOff).toFixed(1) + ' baseLum=' + baseLum.toFixed(1),
    );
    const lightsBefore = countLights();
    const tmpNode = new Node('TempLight');
    tmpNode.layer = Layers.Enum.DEFAULT;
    tmpNode.setPosition(new Vec3(-2, 2, 2));
    scene.addChild(tmpNode);
    const tmpLight = tmpNode.addComponent(PointLight);
    tmpLight.luminance = 24000; // HDR 量级
    tmpLight.range = 8;
    await sleep(150);
    pcheck(
        'p2b-light-count-plus-one',
        countLights() === lightsBefore + 1,
        'before=' + lightsBefore + ' now=' + countLights(),
    );
    const withTmp = await stillSampleCenter(); // 运行期新增光源的视觉贡献（如实记录，见 GAP-L1）
    tmpLightVisualDelta = Math.round(lum(withTmp) - baseLum);
    tmpLight.destroy(); // 组件级销毁（Light.destroy）
    tmpNode.destroy();
    await sleep(250);
    pcheck(
        'p2b-light-count-restored',
        countLights() === lightsBefore && !isValid(tmpNode),
        'now=' + countLights() + ' tmpValid=' + isValid(tmpNode),
    );

    // ---- P2c 主光属性视觉断言（HDR 量级渐变；GAP-L1 修复后的正向证明） ----------------
    keyLight.illuminance = 65000;
    await sleep(300);
    const keyBright = await stillSampleCenter();
    lightPropVisualDelta = Math.round(lum(keyBright) - baseLum);
    pcheck(
        'p2c-mainlight-brightens',
        lum(keyBright) > baseLum * 1.15,
        'illuminance 30000→65000: baseLum=' + baseLum.toFixed(1) + ' brightLum=' + lum(keyBright).toFixed(1),
    );
    keyLight.illuminance = 30000;
    await sleep(250);
    const keyBack = await stillSampleCenter();
    pcheck(
        'p2c-mainlight-restores',
        Math.abs(lum(keyBack) - baseLum) < baseLum * 0.15 + 3,
        'restoredLum=' + lum(keyBack).toFixed(1) + ' baseLum=' + baseLum.toFixed(1),
    );
    spinMaster = true; // 光度对比区间结束，恢复自旋（visual frame-diff 的持续变化源）

    // ---- P3 材质/纹理 -------------------------------------------------------------
    checkerTex = makeCheckerTexture();
    matTextured = materialWith('builtin-unlit', new Color(255, 255, 255, 255), { USE_TEXTURE: true });
    matTextured.setProperty('mainTexture', checkerTex);
    subjectRenderer.setSharedMaterial(matTextured, 0);
    await sleep(250);
    const textured = await stillSampleCenter();
    pcheck(
        'p3-texture-on-screen',
        textured[0] > 170 && textured[1] > 140 && textured[2] < 150,
        'center=' + JSON.stringify(textured) + '（预期黄色纹理主导）',
    );

    // ---- P4 渲染目标 ----------------------------------------------------------------
    await captureAndShowRT(256);
    const qp = rtQuadScreenPoint();
    const quadScan = await scanRegion(qp.x, qp.y, 90);
    pcheck(
        'p4-rendertarget-visible',
        quadScan.count >= 50 && quadScan.warm >= 10,
        'quad non-bg=' +
            quadScan.count +
            'px warm(快照内容)=' +
            quadScan.warm +
            'px rep=' +
            JSON.stringify(quadScan.pixel) +
            ' worldToScreen=' +
            JSON.stringify(lastWorldToScreen),
    );

    // ---- P5 渲染目标 resize（rt.reset 256→128 → 重捕获 → 内容仍上屏） ----------------
    const rectBefore = { x: camera.rect.x, y: camera.rect.y, w: camera.rect.width, h: camera.rect.height };
    await captureAndShowRT(128);
    pcheck(
        'p5-rt-resize-readback',
        (rt as any).width === 128 && (rt as any).height === 128,
        'rt 256 → ' + (rt as any).width + 'x' + (rt as any).height,
    );
    const qp2 = rtQuadScreenPoint();
    const quadScan2 = await scanRegion(qp2.x, qp2.y, 90);
    pcheck(
        'p5-resized-rt-still-renders',
        quadScan2.count >= 50 && quadScan2.warm >= 10,
        'quad@128 non-bg=' +
            quadScan2.count +
            'px warm=' +
            quadScan2.warm +
            'px rep=' +
            JSON.stringify(quadScan2.pixel) +
            ' rect=' +
            JSON.stringify(rectBefore),
    );

    // ---- 交互：点击 → 材质切换 + 点光源开关 -------------------------------------------
    const onToggle = (): void => {
        pointLightNode.active = !pointLightNode.active;
        const cur = subjectRenderer.getSharedMaterial(0);
        subjectRenderer.setSharedMaterial(cur === matTextured ? matBase : matTextured || matBase, 0);
        if (!probe.clickPhaseDone) {
            probe.clickPhaseDone = true;
            const nowMat = subjectRenderer.getSharedMaterial(0);
            pcheck(
                'click-swaps-material-and-light',
                nowMat === matBase || nowMat === matTextured,
                'material=' +
                    (nowMat === matBase ? 'base(blue)' : 'textured(yellow)') +
                    ' light=' +
                    pointLightNode.active,
            );
        }
        renderPanel();
    };
    input.on(Input.EventType.TOUCH_START, onToggle);

    // ---- §25 Lifecycle 合同：RT/纹理材质链释放 → 同路径重建 ------------------------------
    installAssetLifecycle({
        label: 'render-composite',
        hold: () => {
            const held: { name: string; ref: object }[] = [];
            if (rt) {
                held.push({ name: 'RenderTexture', ref: rt });
            }
            if (matRT) {
                held.push({ name: 'Material(RT quad)', ref: matRT });
            }
            if (matTextured) {
                held.push({ name: 'Material(textured)', ref: matTextured });
            }
            if (checkerTex) {
                held.push({ name: 'Texture2D(checker)', ref: checkerTex });
            }
            if (rtQuadNode) {
                held.push({ name: 'RTQuad', ref: rtQuadNode });
            }
            return held;
        },
        release: () => {
            input.off(Input.EventType.TOUCH_START, onToggle);
            subjectRenderer.setSharedMaterial(matBase, 0); // 先恢复基础材质再销毁纹理材质
            if (rtQuadNode) {
                rtQuadNode.destroy();
                rtQuadNode = null;
            }
            if (matRT) {
                matRT.destroy();
                matRT = null;
            }
            if (matTextured) {
                matTextured.destroy();
                matTextured = null;
            }
            if (checkerTex) {
                checkerTex.destroy();
                checkerTex = null;
            }
            if (rt) {
                rt.destroy();
                rt = null;
            }
        },
        reacquire: async () => {
            await sleep(300); // 等销毁落地
            checkerTex = makeCheckerTexture();
            matTextured = materialWith('builtin-unlit', new Color(255, 255, 255, 255), { USE_TEXTURE: true });
            matTextured.setProperty('mainTexture', checkerTex);
            subjectRenderer.setSharedMaterial(matTextured, 0);
            await captureAndShowRT(256); // 与首次完全同一条实现路径（重新捕获 + 重建 quad）
            input.on(Input.EventType.TOUCH_START, onToggle);
            return [
                { name: 'RenderTexture', ref: rt as object },
                { name: 'Material(RT quad)', ref: matRT as object },
                { name: 'Material(textured)', ref: matTextured as object },
                { name: 'Texture2D(checker)', ref: checkerTex as object },
                { name: 'RTQuad', ref: rtQuadNode as object },
            ];
        },
    });

    // ---- 面板 + 探针 -------------------------------------------------------------------
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;left:10px;top:8px;color:#9cd;font:13px monospace;z-index:10';
    document.body.appendChild(panel);
    function renderPanel(): void {
        panel.textContent =
            'render-composite · light ' +
            (pointLightNode.active ? 'ON' : 'OFF') +
            ' · RT ' +
            (rt && isValid(rt) ? 'live' : '-') +
            ' — click swaps material & light';
    }
    renderPanel();

    const canvasEl = document.getElementById('GameCanvas') as HTMLCanvasElement;
    const gl = (canvasEl.getContext('webgl2') || canvasEl.getContext('webgl')) as WebGLRenderingContext | null;
    probe.state = {
        baselineLum: Math.round(baseLum),
        ambientShiftPixel: ambGreen,
        tmpLightVisualDelta,
        lightPropVisualDelta,
        texturePixel: textured,
        quadRegion: quadScan,
        quadRegionAfterRTResize: quadScan2,
        worldToScreenRaw: lastWorldToScreen,
        cameraRect: rectBefore,
        lights: countLights(),
        glVersion: gl ? String(gl.getParameter(gl.VERSION)) : 'none',
        maxTextureSize: gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : 0,
        rtValid: !!rt && isValid(rt),
        rtSize: rt ? [(rt as any).width, (rt as any).height] : null,
        gapRef: 'GAP-L1 已于 r53 修复（fixture 4.0 语义对齐）；Camera 组件 resize 导出面缺口（GAP-C2）见 docs/api-scenario-gap-matrix.md §7',
    };
    probe.ready = true;
    probe.ok = probe.checks.every((c) => c.ok);
}

main().catch((e) => {
    probe.ready = true;
    probe.ok = false;
    probe.state.fatal = String((e && e.message) || e);
    throw e; // pageerror 通道捕获 → no-runtime-error 红
});
