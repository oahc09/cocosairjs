/**
 * model-character-interaction — 模型角色交互：双实例 glTF（G1 组合场景 · P04+P05）。
 *
 * 效果契约（effect.functional 的可执行来源）：
 * - 加载 Khronos SimpleSkin（.gltf + 外部 bin）→ 同一 GLTFAsset instantiate 两份（CharA/CharB）
 *   → 各自独立 Animation：A 速度 1、B 速度 2 → tB > 1.4×tA（状态隔离自证）；
 * - B pause → time 冻结 → resume → 继续推进（Animation.pause/resume/getState 真实链路）；
 * - 点击/射线选择：input TOUCH_START → event.getLocation() → camera.screenPointToRay →
 *   geometry.intersect.rayAABB 命中判定 → 选中者换高亮材质；画布中心点击必选 CharA（相机对准 A）；
 * - 材质反馈隔离：选中 A 时 B 的 sharedMaterial 引用不变（逐渲染器核对）；
 * - 销毁一份：instanceB.dispose() 后 isValid(root)=false，A 动画时间继续推进、无运行期错误；
 * - __lifecycle()：release = A 实例/材质/资产全链释放，reacquire = 同一 acquire 路径重建 CharA。
 *
 * 断言失败路径：pcheck 失败 → throw → pageerror → no-runtime-error 红。
 */

import {
  createAirApp, Scene, Node, Camera, DirectionalLight, Animation, AnimationClip,
  SkinnedMeshRenderer, Material, Layers, Vec3, Color, GLTFLoader, input, Input,
  isValid, geometry,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

const probe = {
  id: 'model-character-interaction',
  ready: false,
  ok: false,
  clickPhaseDone: false,
  checks: [] as { name: string; ok: boolean; detail: string }[],
  state: {} as Record<string, unknown>,
};
(window as any).__trialProbe = probe;

function pcheck (name: string, ok: boolean, detail: string): void {
  probe.checks.push({ name, ok: !!ok, detail });
  if (!ok) { throw new Error('[model-character-interaction] assertion failed: ' + name + ' — ' + detail); }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let scene: Scene;
let camera: Camera;
let asset: any = null;
let instanceA: any = null;
let instanceB: any = null;
let matANormal: Material;
let matAHighlight: Material;
let matBNormal: Material;
let clipName = '';

const sel = { selected: null as string | null, clicks: 0, isolatedViolations: 0 };

function materialWith (r: number, g: number, b: number): Material {
  const material = new Material();
  material.initialize({ effectName: 'builtin-standard' });
  material.setProperty('mainColor', new Color(r, g, b, 255));
  return material;
}

/** SimpleSkin 无材质（默认黑）：给实例内全部蒙皮渲染器挂指定共享材质。 */
function applyMaterial (instance: any, material: Material): void {
  instance.root.walk((node: Node) => {
    const skin = node.getComponent ? node.getComponent(SkinnedMeshRenderer) : null;
    if (skin) { skin.setSharedMaterial(material, 0); }
  });
}

function skinMaterialsOf (instance: any): (Material | null)[] {
  const list: (Material | null)[] = [];
  instance.root.walk((node: Node) => {
    const skin = node.getComponent ? node.getComponent(SkinnedMeshRenderer) : null;
    if (skin) { list.push(skin.getSharedMaterial(0)); }
  });
  return list;
}

/** CharA/CharB 世界包围盒（SimpleSkin 为 1×1 四边形，动画绕关节摆动；盒取宽松余量）。 */
function aabbOfA (): any {
  return new geometry.AABB(0.5, 0.5, 0, 1.1, 1.1, 1.1);
}
function aabbOfB (): any {
  return new geometry.AABB(2.9, 0.5, 0, 1.1, 1.1, 1.1);
}

// ---------------------------------------------------------------- 点击 → 射线选择

function onTouchStart (event: any): void {
  const loc = event.getLocation();
  const ray = camera.screenPointToRay(loc.x, loc.y, new geometry.Ray());
  sel.clicks++;
  const hitA = instanceA && isValid(instanceA.root) ? geometry.intersect.rayAABB(ray, aabbOfA()) : 0;
  const hitB = instanceB && isValid(instanceB.root) ? geometry.intersect.rayAABB(ray, aabbOfB()) : 0;
  const before = instanceB && isValid(instanceB.root) ? skinMaterialsOf(instanceB) : null;

  if (hitA > 0 && (hitB <= 0 || hitA <= hitB)) {
    sel.selected = 'CharA';
    applyMaterial(instanceA, matAHighlight);
  } else if (hitB > 0) {
    sel.selected = 'CharB';
    if (instanceB && isValid(instanceB.root)) { applyMaterial(instanceB, matAHighlight); }
  } else {
    sel.selected = null;
    applyMaterial(instanceA, matANormal);
  }

  // 材质反馈隔离：选中 A 时 B 的材质引用必须逐一不变
  if (sel.selected === 'CharA' && before) {
    const after = skinMaterialsOf(instanceB);
    if (before.length !== after.length || before.some((m, i) => m !== after[i])) { sel.isolatedViolations++; }
  }

  if (!probe.clickPhaseDone) {
    probe.clickPhaseDone = true;
    pcheck('click-selects-charA', sel.selected === 'CharA',
      'selected=' + sel.selected + ' hitA=' + hitA + ' hitB=' + hitB);
    pcheck('material-feedback-isolated', sel.isolatedViolations === 0,
      'violations=' + sel.isolatedViolations);
  }
  renderPanel();
}

// ---------------------------------------------------------------- 面板

const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;left:10px;top:8px;color:#9cd;font:13px monospace;z-index:10';
document.body.appendChild(panel);
function renderPanel (): void {
  panel.textContent = 'selected: ' + (sel.selected || '-') + ' · clicks ' + sel.clicks
    + (instanceB && isValid(instanceB.root) ? ' · B alive' : ' · B disposed') + ' — click a character';
}

// ---------------------------------------------------------------- 构建/释放路径

async function acquireA (): Promise<void> {
  if (!asset || !isValid(asset)) {
    const jsonText = await (await fetch('./assets/SimpleSkin.gltf')).text();
    asset = await new GLTFLoader().parseAsync(jsonText, './assets/');
  }
  instanceA = asset.instantiate();
  instanceA.root.name = 'CharA';
  instanceA.root.setPosition(new Vec3(0, 0, 0));
  scene.addChild(instanceA.root);
  applyMaterial(instanceA, matANormal);
  // 双路径都真实执行（短路会让 getComponentInChildren 缺失执行证据）
  const animDirect: Animation | null = instanceA.root.getComponent(Animation);
  const animNested: Animation | null = instanceA.root.getComponentInChildren(Animation);
  const animation: Animation | null = animDirect || animNested;
  if (animation && animation.clips.length > 0) {
    animation.clips.forEach((clip: AnimationClip) => { clip.wrapMode = AnimationClip.WrapMode.Loop; });
    clipName = animation.clips[0].name;
    animation.play(clipName);
  }
}

async function main (): Promise<void> {
  const app = await createAirApp({ canvas: '#GameCanvas' });
  (window as any).__airApp = app;
  scene = new Scene('model-character-interaction');

  const cameraNode = new Node('Main Camera');
  scene.addChild(cameraNode);
  cameraNode.setPosition(new Vec3(0.5, 1.2, 4.5));
  cameraNode.lookAt(new Vec3(0.5, 0.5, 0));
  camera = cameraNode.addComponent(Camera);
  camera.projection = Camera.ProjectionType.PERSPECTIVE;
  camera.fov = 60;
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
  const light = lightNode.addComponent(DirectionalLight);
  light.illuminance = 2.4;

  matANormal = materialWith(220, 220, 228);
  matAHighlight = materialWith(255, 170, 60);
  matBNormal = materialWith(120, 190, 235);

  app.run(scene);

  // ---- 加载 + 实例化两份 ------------------------------------------------------
  const jsonText = await (await fetch('./assets/SimpleSkin.gltf')).text();
  asset = await new GLTFLoader().parseAsync(jsonText, './assets/');
  probe.state.assetFace = {
    animations: (asset.animations || []).length,
    meshes: (asset.meshes || []).length,
    materials: (asset.materials || []).length,
    textures: (asset.textures || []).length,
    skeletons: (asset.skeletons || []).length,
    images: (asset.images || []).length,
    sceneNames: (asset.sceneNames || []).slice(0, 4),
    owned: typeof asset.owned,
  };

  instanceA = asset.instantiate();
  instanceA.root.name = 'CharA';
  instanceA.root.setPosition(new Vec3(0, 0, 0));
  scene.addChild(instanceA.root);
  applyMaterial(instanceA, matANormal);

  instanceB = asset.instantiate();
  instanceB.root.name = 'CharB';
  instanceB.root.setPosition(new Vec3(2.4, 0, 0));
  scene.addChild(instanceB.root);
  applyMaterial(instanceB, matBNormal);

  // 双路径都真实执行（短路会让 getComponentInChildren 缺失执行证据）
  const animADirect: Animation | null = instanceA.root.getComponent(Animation);
  const animANested: Animation | null = instanceA.root.getComponentInChildren(Animation);
  const animBDirect: Animation | null = instanceB.root.getComponent(Animation);
  const animBNested: Animation | null = instanceB.root.getComponentInChildren(Animation);
  const animA: Animation | null = animADirect || animANested;
  const animB: Animation | null = animBDirect || animBNested;
  pcheck('two-instances-animated', !!animA && !!animB && animA !== animB && animA.clips.length > 0,
    'animA=' + !!animA + ' animB=' + !!animB);
  animA!.clips.forEach((clip: AnimationClip) => { clip.wrapMode = AnimationClip.WrapMode.Loop; });
  animB!.clips.forEach((clip: AnimationClip) => { clip.wrapMode = AnimationClip.WrapMode.Loop; });
  clipName = animA!.clips[0].name;
  animA!.play(clipName);
  animB!.play(clipName);
  const stateB = animB!.getState(clipName);
  stateB.speed = 2; // B 双倍速：独立时钟的直接证据

  // ---- 独立动画：tB > 1.4 × tA ------------------------------------------------
  // 轮询等待动画时钟起步（插桩构建下首帧时点漂移——固定 sleep 曾在正典批次量得 tA=0）
  for (let i = 0; i < 160 && animA!.getState(clipName).time < 0.1; i++) {
    await sleep(50);
  }
  const tA0 = animA!.getState(clipName).time;
  pcheck('animation-clock-started', tA0 > 0, 'tA=' + tA0.toFixed(3) + '（8s 内动画时钟未起步）');
  await sleep(600);
  const tA1 = animA!.getState(clipName).time - tA0;
  const tB1 = stateB.time;
  pcheck('independent-animation-clocks', tA1 > 0.3 && tB1 > tA1 * 1.4,
    'tA=' + tA1.toFixed(3) + ' tB=' + tB1.toFixed(3) + ' ratio=' + (tB1 / Math.max(tA1, 1e-6)).toFixed(2));

  // ---- pause / resume：B 时间冻结再恢复 ---------------------------------------
  animB!.pause();
  const tPaused = stateB.time;
  await sleep(320);
  const tStill = stateB.time;
  pcheck('pause-freezes-time', Math.abs(tStill - tPaused) < 0.02,
    'paused=' + tPaused.toFixed(3) + ' after320ms=' + tStill.toFixed(3));
  animB!.resume();
  await sleep(320);
  const tResumed = stateB.time;
  pcheck('resume-advances-time', tResumed > tStill + 0.05,
    'still=' + tStill.toFixed(3) + ' resumed=' + tResumed.toFixed(3));

  // ---- 销毁一份：B 释放，A 不受影响 --------------------------------------------
  input.on(Input.EventType.TOUCH_START, onTouchStart);
  const tA2 = animA!.getState(clipName).time;
  const disposedRoot = instanceB.root;
  instanceB.dispose(); // dispose 走帧末延迟销毁：settle 后再断言 isValid（与 shared/asset-lifecycle 同口径）
  instanceB = null;
  await sleep(400);
  pcheck('instanceB-disposed', !isValid(disposedRoot), 'isValid(CharB root)=' + isValid(disposedRoot));
  const tA3 = animA!.getState(clipName).time;
  pcheck('charA-unaffected-by-B-release', tA3 > tA2 && isValid(instanceA.root),
    'tA ' + tA2.toFixed(3) + ' → ' + tA3.toFixed(3));
  renderPanel();

  // ---- §25 Lifecycle 合同：A 全链释放 → 同路径重建 ------------------------------
  installAssetLifecycle({
    label: 'model-character-interaction',
    hold: () => {
      const held: { name: string; ref: object }[] = [];
      if (asset) { held.push({ name: 'GLTFAsset(SimpleSkin)', ref: asset }); }
      if (instanceA) { held.push({ name: 'instanceA.root', ref: instanceA.root }); }
      held.push({ name: 'Material(normal)', ref: matANormal });
      held.push({ name: 'Material(highlight)', ref: matAHighlight });
      return held;
    },
    release: () => {
      input.off(Input.EventType.TOUCH_START, onTouchStart);
      if (instanceA) { instanceA.dispose(); instanceA = null; }
      matANormal.destroy();
      matAHighlight.destroy();
      matBNormal.destroy();
      if (asset) { asset.destroy(); asset = null; }
    },
    reacquire: async () => {
      matANormal = materialWith(220, 220, 228);
      matAHighlight = materialWith(255, 170, 60);
      matBNormal = materialWith(120, 190, 235);
      await acquireA(); // 与首次构建完全同一条实现路径（重新 parse → instantiate → 材质 → 播放）
      input.on(Input.EventType.TOUCH_START, onTouchStart);
      sel.selected = null;
      return [
        { name: 'GLTFAsset(SimpleSkin)', ref: asset },
        { name: 'instanceA.root', ref: instanceA.root },
        { name: 'Material(normal)', ref: matANormal },
      ];
    },
  });

  probe.state.timeline = {
    clipName,
    tA: animA!.getState(clipName).time,
    tB: tResumed,
    charBValid: isValid(disposedRoot),
    charAValid: isValid(instanceA.root),
    clicks: sel.clicks,
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
