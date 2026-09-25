/**
 * scene-switch-reentry — 动态场景切换与复入（G1 组合场景 · P01）。
 *
 * 效果契约（effect.functional 的可执行来源）：
 * - 确定性时间线：Scratch 树操作演示 → SceneA(gen1，绿色立方体) → SceneB(gen2，绿色球体，
 *   autoReleaseAssets=true) → SceneA'(gen3，复入)。三场景结构同名（Main Camera / Main Light /
 *   Ticker），任意采样时刻结构断言稳定；几何体差异提供"新场景可见"的视觉证据。
 * - 切换即销毁：runSceneImmediate 销毁旧场景 → 旧 Ticker 的 update 计数冻结、
 *   onDisable/onDestroy 恰好落地、isValid(scene)===false。
 * - 监听不残留：Ticker 在 onEnable 订阅 input TOUCH_START、onDisable 退订；切换后的真实点击
 *   只计入当代 gen3，gen1/gen2 计数恒为 0（残留即 throw → no-runtime-error 红）。
 * - 复入全新：gen3 的 onLoad/start 计数从 1 重新开始（不复用旧组件状态）。
 * - __lifecycle()（§25 合同）：release = 切走当前场景（引擎销毁持有引用），泄漏核对 = isValid，
 *   reacquire = 复入新 SceneA 并回报新持有。
 *
 * 断言失败路径：任何行为断言失败 → throw → pageerror → no-runtime-error FAIL（证据不得静默）。
 */

import {
  createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Component,
  input, Input, Layers, Vec3, Color, Material, utils, primitives, director, isValid,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

interface TickerRec {
  generation: number;
  variant: string;
  updates: number;
  clicks: number;
  onLoad: number;
  onEnable: number;
  start: number;
  onDisable: number;
  onDestroy: number;
}

const registry: TickerRec[] = [];
let generation = 0;
let toggled = false;
let residualChecked = false;

const probe = {
  id: 'scene-switch-reentry',
  ready: false,
  ok: false,
  clickPhaseDone: false,
  checks: [] as { name: string; ok: boolean; detail: string }[],
  state: {} as Record<string, unknown>,
};
(window as any).__trialProbe = probe;

function pcheck (name: string, ok: boolean, detail: string): void {
  probe.checks.push({ name, ok: !!ok, detail });
  if (!ok) { throw new Error('[scene-switch-reentry] assertion failed: ' + name + ' — ' + detail); }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function materialWith (r: number, g: number, b: number): Material {
  const material = new Material();
  material.initialize({ effectName: 'builtin-standard' });
  material.setProperty('mainColor', new Color(r, g, b, 255));
  return material;
}

// 材质必须在引擎引导后创建（Material.initialize 依赖 device/programLib——与
// EffectAsset.onLoaded 同款时机边界，见 docs/evidence/g4-shader-probe.json registerBeforeBoot）
let matGreen: Material;
let matOrange: Material;

class Ticker extends Component {
  rec!: TickerRec;
  gen = 0;
  variant = 'A';

  onLoad (): void {
    this.rec = {
      generation: this.gen, variant: this.variant,
      updates: 0, clicks: 0, onLoad: 1, onEnable: 0, start: 0, onDisable: 0, onDestroy: 0,
    };
    registry.push(this.rec);
  }

  onEnable (): void {
    this.rec.onEnable++;
    input.on(Input.EventType.TOUCH_START, this.onClick, this);
  }

  start (): void { this.rec.start++; }

  update (): void { this.rec.updates++; }

  onDisable (): void {
    this.rec.onDisable++;
    input.off(Input.EventType.TOUCH_START, this.onClick, this);
  }

  onDestroy (): void { this.rec.onDestroy++; }

  onClick (): void {
    this.rec.clicks++;
    // 材质切换：真实点击 → 可观察帧差（绿 ↔ 橙）
    toggled = !toggled;
    const renderer = this.getComponent(MeshRenderer);
    if (renderer) { renderer.setSharedMaterial(toggled ? matOrange : matGreen, 0); }
    // 残留断言：历史世代的点击计数必须恒为 0（监听随场景销毁退订）
    if (!residualChecked) {
      residualChecked = true;
      const stale = registry.filter((r) => r.generation !== this.rec.generation && r.clicks !== 0);
      probe.clickPhaseDone = true;
      pcheck('no-residual-listeners', stale.length === 0,
        'stale generations with clicks: ' + stale.map((r) => 'gen' + r.generation + '=' + r.clicks).join(','));
    }
    renderPanel();
  }
}

/** Scratch：Node 树操作 + 非运行场景的显式 Scene.destroy（不依赖场景切换路径）。
 * destroy() 帧末落地（CCObject._deferredDestroy 由主循环驱动）：isValid 断言延后到
 * 引擎运行后执行——这本身就是生命周期语义的一部分。 */
function scratchTreeDemo (): Scene {
  const scratch = new Scene('Scratch');
  const root = new Node('ScratchRoot');
  scratch.addChild(root);
  const a = new Node('A');
  const b = new Node('B');
  const c = new Node('C');
  root.addChild(a);
  root.addChild(b);
  root.insertChild(c, 0);
  pcheck('tree-insertChild', root.getChildByName('C') === c && root.children.length === 3,
    'children=' + root.children.length);
  a.setParent(b);
  pcheck('tree-setParent', a.getParent() === b, 'a.parent=' + (a.getParent() && a.getParent().name));
  a.removeFromParent();
  pcheck('tree-removeFromParent', a.getParent() === null, 'parent not null after remove');
  let walked = 0;
  root.walk(() => { walked++; });
  pcheck('tree-walk', walked === 3, 'walked=' + walked + ' (expect root+b+c=3)');
  root.removeAllChildren();
  pcheck('tree-removeAllChildren', root.children.length === 0, 'children=' + root.children.length);
  a.destroy();
  b.destroy();
  c.destroy();
  root.destroy();
  scratch.destroy();
  return scratch;
}

function addCameraAndLight (scene: Scene): void {
  const cameraNode = new Node('Main Camera');
  scene.addChild(cameraNode);
  cameraNode.setPosition(new Vec3(0, 1.6, 6));
  cameraNode.lookAt(new Vec3(0, 0.8, 0));
  const camera = cameraNode.addComponent(Camera);
  camera.projection = Camera.ProjectionType.PERSPECTIVE;
  camera.fov = 45;
  camera.near = 0.1;
  camera.far = 1000;
  camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
  camera.clearColor = new Color(30, 40, 60, 255);
  camera.visibility = Layers.Enum.DEFAULT;
  camera.priority = 0;
  const lightNode = new Node('Main Light');
  scene.addChild(lightNode);
  lightNode.setPosition(new Vec3(0, 8, 0));
  lightNode.setRotationFromEuler(-45, -30, 0);
  const light = lightNode.addComponent(DirectionalLight);
  light.illuminance = 2;
}

function buildSceneA (): { scene: Scene; node: Node } {
  const scene = new Scene('SceneA');
  addCameraAndLight(scene);
  const ticker = new Node('Ticker');
  ticker.layer = Layers.Enum.DEFAULT;
  scene.addChild(ticker);
  ticker.setPosition(new Vec3(0, 0.8, 0));
  const renderer = ticker.addComponent(MeshRenderer);
  renderer.mesh = utils.createMesh(primitives.box({ width: 1.6, height: 1.6, length: 1.6 }));
  renderer.setSharedMaterial(matGreen, 0);
  const comp = ticker.addComponent(Ticker);
  generation++;
  comp.gen = generation;
  comp.variant = 'A';
  return { scene, node: ticker };
}

function buildSceneB (): { scene: Scene; node: Node } {
  const scene = new Scene('SceneB');
  scene.autoReleaseAssets = true; // 切换离开时由引擎自动释放场景依赖（探针记录真实值）
  addCameraAndLight(scene);
  const ticker = new Node('Ticker');
  ticker.layer = Layers.Enum.DEFAULT;
  scene.addChild(ticker);
  ticker.setPosition(new Vec3(0, 0.8, 0));
  const renderer = ticker.addComponent(MeshRenderer);
  renderer.mesh = utils.createMesh(primitives.sphere(0.9));
  renderer.setSharedMaterial(matGreen, 0);
  const comp = ticker.addComponent(Ticker);
  generation++;
  comp.gen = generation;
  comp.variant = 'B';
  return { scene, node: ticker };
}

const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;left:10px;top:8px;color:#9cd;font:13px monospace;z-index:10';
document.body.appendChild(panel);
function renderPanel (): void {
  const live = registry[registry.length - 1];
  const sceneName = director.getScene() ? director.getScene()!.name : '-';
  panel.textContent = 'scene: ' + sceneName + ' · gen ' + generation
    + ' · updates ' + (live ? live.updates : 0)
    + ' · clicks ' + (live ? live.clicks : 0) + ' — click canvas toggles color';
}

let current: { scene: Scene; node: Node } | null = null;

async function main (): Promise<void> {
  const app = await createAirApp({ canvas: '#GameCanvas' });
  (window as any).__airApp = app;
  matGreen = materialWith(95, 205, 120);
  matOrange = materialWith(255, 170, 60);

  const scratch = scratchTreeDemo();

  // ---- gen1：SceneA 运行 ---------------------------------------------------
  const a1 = buildSceneA();
  current = a1;
  app.run(a1.scene);
  await sleep(500);
  pcheck('scene-destroy-invalidates', !isValid(scratch), 'scratch scene still valid after engine frames ran');
  const rec1 = registry[registry.length - 1];
  pcheck('gen1-running', rec1.updates > 0 && rec1.generation === 1, 'updates=' + rec1.updates);
  pcheck('gen1-lifecycle-once', rec1.onLoad === 1 && rec1.start === 1 && rec1.onEnable === 1,
    'onLoad=' + rec1.onLoad + ' start=' + rec1.start + ' onEnable=' + rec1.onEnable);

  // ---- gen2：切换到 SceneB（引擎销毁 SceneA + autoRelease） ------------------
  const b = buildSceneB();
  const autoReleaseB = b.scene.autoReleaseAssets;
  app.run(b.scene);
  current = b;
  await sleep(450);
  const rec2 = registry[registry.length - 1];
  pcheck('gen2-running', rec2.updates > 0 && rec2.generation === 2, 'updates=' + rec2.updates);
  pcheck('autoReleaseAssets-recorded', autoReleaseB === true, 'SceneB.autoReleaseAssets=' + autoReleaseB);
  const u1 = rec1.updates;
  await sleep(300);
  pcheck('gen1-frozen', rec1.updates === u1, 'gen1 updates ' + u1 + ' → ' + rec1.updates + ' after switch');
  pcheck('gen1-scene-destroyed', !isValid(a1.scene), 'isValid(SceneA gen1)=' + isValid(a1.scene));
  pcheck('gen1-lifecycle-closure', rec1.onDisable === rec1.onEnable && rec1.onDestroy === 1,
    'onDisable=' + rec1.onDisable + ' onDestroy=' + rec1.onDestroy);

  // ---- gen3：复入 SceneA（全新组件状态） ------------------------------------
  const a2 = buildSceneA();
  app.run(a2.scene);
  current = a2;
  await sleep(450);
  const rec3 = registry[registry.length - 1];
  pcheck('gen3-running', rec3.updates > 0 && rec3.generation === 3, 'updates=' + rec3.updates);
  const u2 = rec2.updates;
  await sleep(250);
  pcheck('gen2-frozen', rec2.updates === u2, 'gen2 updates ' + u2 + ' → ' + rec2.updates);
  pcheck('gen2-scene-destroyed', !isValid(b.scene), 'isValid(SceneB)=' + isValid(b.scene));
  pcheck('reentry-fresh-state', rec3.onLoad === 1 && rec3.start === 1 && rec3.clicks === 0,
    'onLoad=' + rec3.onLoad + ' start=' + rec3.start + ' clicks=' + rec3.clicks);
  pcheck('scene-live-is-a2', director.getScene() === a2.scene,
    'director.getScene()=' + (director.getScene() ? director.getScene()!.name : 'null'));

  // ---- §25 Lifecycle 合同：release = 切走（引擎销毁），reacquire = 复入 -------
  installAssetLifecycle({
    label: 'scene-switch-reentry',
    hold: () => (current ? [{ name: 'Scene(' + current.scene.name + ')', ref: current.scene }, { name: 'Ticker', ref: current.node }] : []),
    release: () => {
      const b2 = buildSceneB();
      app.run(b2.scene); // runSceneImmediate 销毁被持有的旧场景
      current = b2;
    },
    reacquire: async () => {
      const a3 = buildSceneA();
      app.run(a3.scene);
      current = a3;
      await sleep(200);
      return [{ name: 'Scene(SceneA gen' + a3.scene.name + ')', ref: a3.scene }, { name: 'Ticker', ref: a3.node }];
    },
  });

  probe.state = {
    generation,
    liveScene: director.getScene() ? director.getScene()!.name : null,
    autoReleaseB,
    registry: registry.map((r) => ({ gen: r.generation, variant: r.variant, updates: r.updates, clicks: r.clicks, onDisable: r.onDisable, onDestroy: r.onDestroy })),
    sceneA1Valid: isValid(a1.scene),
    sceneBValid: isValid(b.scene),
  };
  probe.ready = true;
  probe.ok = probe.checks.every((c) => c.ok);
  renderPanel();
  setInterval(renderPanel, 500);
}

main().catch((e) => {
  probe.ready = true;
  probe.ok = false;
  probe.state.fatal = String((e && e.message) || e);
  throw e; // 让 pageerror 通道捕获 → no-runtime-error 红（证据不得静默）
});
