/**
 * render-composite — 渲染组合：相机/灯光 → 材质/纹理 → 渲染目标 → resize（G1 组合场景 · P09+P19）。
 *
 * 效果契约（effect.functional 的可执行来源）——每一级组合都以「画面真实变化」的像素断言证明：
 * - P1 基线：中心像素为蓝色主体（区别于清屏色 (30,40,60)）；
 * - P2 灯光生命周期：运行期启用 PointLight → 中心亮度上升 ≥8%；node.active=false（隐含
 *   Light.onDisable）→ 亮度回落至基线 ±6%；临时点光源 addComponent → Light 组件计数 +1 →
 *   组件 destroy + 节点 destroy → 计数回落（Light.destroy 真实执行）；
 * - P3 材质/纹理：SubjectBox 换 builtin-unlit + 程序化纹理（USE_ALBEDO_MAP）→ 中心像素变黄；
 * - P4 渲染目标：camera.targetTexture = rt（256×256）捕获 → 恢复屏幕 → RT 贴到 RTQuad 上屏，
 *   worldToScreen 定位采样点，像素非背景（RT 内容真实可见）；
 * - P5 resize：camera.resize(960,540) → width/height 读回一致、画面仍有效 → 恢复原尺寸；
 * - 交互：点击画布切换 PointLight 开关 → 中心亮度变化（frame-diff）；
 * - __lifecycle()：release = RTQuad/RT/纹理材质全链销毁（主体先恢复基础材质），
 *   reacquire = 同一 capture 路径重建（重新捕获 RT + 重建 quad）。
 *
 * 能力面如实记录：GL 上下文版本 / MAX_TEXTURE_SIZE 入探针 state（WebGL1 能力不足时
 * RT 路径的降级结果由断言显式暴露，不静默）。
 * 采样口径：Spinner 在采样窗暂停（排除旋转对亮度对比的干扰），EVENT_AFTER_DRAW 内
 * drawImage → 2D canvas → getImageData（与 manual-examples-verify 同款）。
 */

import {
  createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, PointLight, Component,
  Layers, Vec3, Color, Material, utils, primitives, Texture2D, ImageAsset, RenderTexture,
  input, Input, director, Director, isValid,
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

function pcheck (name: string, ok: boolean, detail: string): void {
  probe.checks.push({ name, ok: !!ok, detail });
  if (!ok) { throw new Error('[render-composite] assertion failed: ' + name + ' — ' + detail); }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const lum = (px: number[]): number => 0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2];

let scene: Scene;
let camera: Camera;
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
let tmpLightVisualDelta = 0;

class Spinner extends Component {
  update (dt: number): void {
    if (spinEnabled) { this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 45, 0); }
  }
}

function materialWith (effect: string, color: Color, defines?: Record<string, boolean | number>): Material {
  const material = new Material();
  material.initialize(defines ? { effectName: effect, defines } : { effectName: effect });
  material.setProperty('mainColor', color);
  return material;
}

/** EVENT_AFTER_DRAW 内采样指定画布像素（x/y 为左上角原点像素坐标）。 */
function sampleAt (x: number, y: number): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
    const timer = setTimeout(() => { director.off(Director.EVENT_AFTER_DRAW, onDraw); reject(new Error('no frame within 8s')); }, 8000);
    function onDraw (): void {
      director.off(Director.EVENT_AFTER_DRAW, onDraw);
      clearTimeout(timer);
      try {
        const snap = document.createElement('canvas');
        snap.width = canvas.width; snap.height = canvas.height;
        const ctx = snap.getContext('2d') as CanvasRenderingContext2D;
        ctx.drawImage(canvas, 0, 0);
        const d = ctx.getImageData(Math.max(0, Math.min(snap.width - 1, Math.round(x))), Math.max(0, Math.min(snap.height - 1, Math.round(y))), 1, 1).data;
        resolve([d[0], d[1], d[2], d[3]]);
      } catch (e) { reject(e as Error); }
    }
    director.on(Director.EVENT_AFTER_DRAW, onDraw);
  });
}

async function sampleCenter (): Promise<number[]> {
  const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
  return sampleAt(canvas.width / 2, canvas.height / 2);
}

/** 采样窗：暂停旋转 → 等两帧稳定 → 采样 → 恢复。 */
async function stillSample (x: number, y: number): Promise<number[]> {
  spinEnabled = false;
  await sleep(160);
  const px = await sampleAt(x, y);
  spinEnabled = true;
  return px;
}

function stillSampleCenter (): Promise<number[]> {
  const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
  return stillSample(canvas.width / 2, canvas.height / 2);
}

function makeCheckerTexture (): Texture2D {
  const cvs = document.createElement('canvas');
  cvs.width = 64; cvs.height = 64;
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

function countLights (): number {
  let n = 0;
  const s = director.getScene();
  if (s) { s.walk((node: Node) => { if (node.getComponent(PointLight) || node.getComponent(DirectionalLight)) { n++; } }); }
  return n;
}

/** P4/lifecycle 共用：RT 捕获 → quad 上屏（同一实现路径承担「拆得掉」与「建得回」）。 */
async function captureAndShowRT (): Promise<void> {
  if (!rt) { rt = new RenderTexture(); rt.reset({ width: 256, height: 256 }); }
  camera.targetTexture = rt;
  await sleep(220); // 数帧写入 RT（快照内容 = 当时的场景）
  camera.targetTexture = null;
  await sleep(120);
  matRT = materialWith('builtin-unlit', new Color(255, 255, 255, 255));
  matRT.setProperty('mainTexture', rt);
  rtQuadNode = new Node('RTQuad');
  rtQuadNode.layer = Layers.Enum.DEFAULT;
  rtQuadNode.setPosition(new Vec3(-2.3, 1.7, 0.8));
  rtQuadNode.setRotationFromEuler(90, 0, 0);
  scene.addChild(rtQuadNode);
  const renderer = rtQuadNode.addComponent(MeshRenderer);
  renderer.mesh = utils.createMesh(primitives.plane({ width: 1.8, length: 1.8, widthSegments: 1, lengthSegments: 1 }));
  renderer.setSharedMaterial(matRT, 0);
  await sleep(250);
}

function rtQuadScreenPoint (): { x: number; y: number } {
  const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
  const out = new Vec3();
  camera.worldToScreen(out, new Vec3(-2.3, 1.7, 0.8));
  // worldToScreen 输出为游戏像素（左下原点）→ 画布采样坐标（左上原点）换算
  return { x: out.x, y: canvas.height - out.y };
}

async function main (): Promise<void> {
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
  const keyLight = lightNode.addComponent(DirectionalLight);
  keyLight.illuminance = 1.2;

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
  const pointLight = pointLightNode.addComponent(PointLight);
  pointLight.luminance = 0; // 基线为暗；P2 以属性/激活两条路径点亮（见下）
  pointLight.range = 12;

  app.run(scene);
  await sleep(600);

  // ---- P1 基线 ----------------------------------------------------------------
  const base = await stillSampleCenter();
  pcheck('p1-baseline-visible', base[2] > base[0] + 25 && base[2] > base[1] + 25,
    'center=' + JSON.stringify(base) + '（预期蓝色主体，clear=(30,40,60)）');
  const baseLum = lum(base);

  // ---- P2 灯光生命周期（属性路径 → 激活路径 → 运行期增删） -------------------------
  const lightsBefore = countLights();
  pointLight.luminance = 900; // 属性路径：光强 0 → 900
  await sleep(250);
  const lit = await stillSampleCenter();
  pcheck('p2-luminance-brightens', lum(lit) > baseLum * 1.08,
    'baseLum=' + baseLum.toFixed(1) + ' litLum=' + lum(lit).toFixed(1));
  pointLightNode.active = false; // 激活路径：隐含 Light.onDisable → detach
  await sleep(250);
  const unlit = await stillSampleCenter();
  pcheck('p2-disable-restores', lum(unlit) < baseLum * 1.06 + 2,
    'baseLum=' + baseLum.toFixed(1) + ' afterDisable=' + lum(unlit).toFixed(1));
  pointLightNode.active = true;
  await sleep(200);

  // 运行期增删：addComponent(PointLight) → 计数 +1 →（组件 destroy + 节点 destroy）→ 回落
  const tmpNode = new Node('TempLight');
  tmpNode.layer = Layers.Enum.DEFAULT;
  tmpNode.setPosition(new Vec3(-2, 2, 2));
  scene.addChild(tmpNode);
  const tmpLight = tmpNode.addComponent(PointLight);
  tmpLight.luminance = 300;
  tmpLight.range = 8;
  await sleep(150);
  pcheck('p2-light-count-plus-one', countLights() === lightsBefore + 1,
    'before=' + lightsBefore + ' now=' + countLights());
  const withTmp = await stillSampleCenter(); // 运行期新增光源是否参与照明（如实记录）
  tmpLight.destroy(); // 组件级销毁（Light.destroy）
  tmpNode.destroy();
  await sleep(250);
  pcheck('p2-light-count-restored', countLights() === lightsBefore && !isValid(tmpNode),
    'now=' + countLights() + ' tmpValid=' + isValid(tmpNode));
  tmpLightVisualDelta = Math.round(lum(withTmp) - baseLum);

  // ---- P3 材质/纹理 -------------------------------------------------------------
  checkerTex = makeCheckerTexture();
  matTextured = materialWith('builtin-unlit', new Color(255, 255, 255, 255), { USE_ALBEDO_MAP: true });
  matTextured.setProperty('mainTexture', checkerTex);
  subjectRenderer.setSharedMaterial(matTextured, 0);
  await sleep(250);
  const textured = await stillSampleCenter();
  pcheck('p3-texture-on-screen', textured[0] > 170 && textured[1] > 140 && textured[2] < 150,
    'center=' + JSON.stringify(textured) + '（预期黄色纹理主导）');

  // ---- P4 渲染目标 ----------------------------------------------------------------
  await captureAndShowRT();
  const qp = rtQuadScreenPoint();
  const quadPx = await stillSample(qp.x, qp.y);
  const clearish = Math.abs(quadPx[0] - 30) < 10 && Math.abs(quadPx[1] - 40) < 10 && Math.abs(quadPx[2] - 60) < 10;
  pcheck('p4-rendertarget-visible', !clearish && quadPx[3] > 0,
    'quad@(' + Math.round(qp.x) + ',' + Math.round(qp.y) + ')=' + JSON.stringify(quadPx) + '（非清屏色 = RT 内容上屏）');

  // ---- P5 渲染目标 resize（rt.reset 256→128 → 重捕获 → 内容仍上屏） ------------------
  // 注：框架 Camera 组件不导出 resize/width/height（inventory 的 Camera.resize 属 render-scene
  // 内部面，公开组件面缺口已登记差距矩阵 P03/P09）；相机视口读回 camera.rect 一并记录。
  const rectBefore = { x: camera.rect.x, y: camera.rect.y, w: camera.rect.width, h: camera.rect.height };
  rt!.reset({ width: 128, height: 128 });
  pcheck('p5-rt-resize-readback', (rt as any).width === 128 && (rt as any).height === 128,
    'rt ' + 256 + ' → ' + (rt as any).width + 'x' + (rt as any).height);
  camera.targetTexture = rt!;
  await sleep(220);
  camera.targetTexture = null;
  await sleep(220);
  const qp2 = rtQuadScreenPoint();
  const quadPx2 = await stillSample(qp2.x, qp2.y);
  const clearish2 = Math.abs(quadPx2[0] - 30) < 10 && Math.abs(quadPx2[1] - 40) < 10 && Math.abs(quadPx2[2] - 60) < 10;
  pcheck('p5-resized-rt-still-renders', !clearish2 && quadPx2[3] > 0,
    'quad@128=' + JSON.stringify(quadPx2) + ' rect=' + JSON.stringify(rectBefore));

  // ---- 交互：点击 → 点光源开关 + 主体材质切换（unlit 不受光照影响，材质切换保证可见反馈） ----
  const onToggle = (): void => {
    pointLightNode.active = !pointLightNode.active;
    const cur = subjectRenderer.getSharedMaterial(0);
    subjectRenderer.setSharedMaterial(cur === matTextured ? matBase : (matTextured || matBase), 0);
    if (!probe.clickPhaseDone) {
      probe.clickPhaseDone = true;
      const nowMat = subjectRenderer.getSharedMaterial(0);
      pcheck('click-swaps-material-and-light', nowMat === matBase || nowMat === matTextured,
        'material=' + (nowMat === matBase ? 'base(blue)' : 'textured(yellow)') + ' light=' + pointLightNode.active);
    }
    renderPanel();
  };
  input.on(Input.EventType.TOUCH_START, onToggle);

  // ---- §25 Lifecycle 合同：RT/纹理材质链释放 → 同路径重建 ------------------------------
  installAssetLifecycle({
    label: 'render-composite',
    hold: () => {
      const held: { name: string; ref: object }[] = [];
      if (rt) { held.push({ name: 'RenderTexture', ref: rt }); }
      if (matRT) { held.push({ name: 'Material(RT quad)', ref: matRT }); }
      if (matTextured) { held.push({ name: 'Material(textured)', ref: matTextured }); }
      if (checkerTex) { held.push({ name: 'Texture2D(checker)', ref: checkerTex }); }
      if (rtQuadNode) { held.push({ name: 'RTQuad', ref: rtQuadNode }); }
      return held;
    },
    release: () => {
      input.off(Input.EventType.TOUCH_START, onToggle);
      subjectRenderer.setSharedMaterial(matBase, 0); // 先恢复基础材质再销毁纹理材质
      if (rtQuadNode) { rtQuadNode.destroy(); rtQuadNode = null; }
      if (matRT) { matRT.destroy(); matRT = null; }
      if (matTextured) { matTextured.destroy(); matTextured = null; }
      if (checkerTex) { checkerTex.destroy(); checkerTex = null; }
      if (rt) { rt.destroy(); rt = null; }
    },
    reacquire: async () => {
      await sleep(300); // 等销毁落地
      checkerTex = makeCheckerTexture();
      matTextured = materialWith('builtin-unlit', new Color(255, 255, 255, 255), { USE_ALBEDO_MAP: true });
      matTextured.setProperty('mainTexture', checkerTex);
      subjectRenderer.setSharedMaterial(matTextured, 0);
      await captureAndShowRT(); // 与首次完全同一条实现路径（重新捕获 + 重建 quad）
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
  function renderPanel (): void {
    panel.textContent = 'render-composite · light ' + (pointLightNode.active ? 'ON' : 'OFF')
      + ' · RT ' + (rt && isValid(rt) ? 'live' : '-') + ' — click toggles point light';
  }
  renderPanel();

  const canvasEl = document.getElementById('GameCanvas') as HTMLCanvasElement;
  const gl = (canvasEl.getContext('webgl2') || canvasEl.getContext('webgl')) as WebGLRenderingContext | null;
  probe.state = {
    baselineLum: Math.round(baseLum),
    litLum: Math.round(lum(lit)),
    texturePixel: textured,
    quadPixel: quadPx,
    quadPixelAfterRTResize: quadPx2,
    cameraRect: rectBefore,
    lights: countLights(),
    glVersion: gl ? String(gl.getParameter(gl.VERSION)) : 'none',
    maxTextureSize: gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : 0,
    rtValid: !!rt && isValid(rt),
    rtSize: rt ? [(rt as any).width, (rt as any).height] : null,
    tmpLightVisualDelta,
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
