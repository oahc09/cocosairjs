/**
 * physics-interaction — 输入驱动的 3D 物理交互链（G1 组合场景 · P06+P07）。
 *
 * 后端：createAirApp({ physics: 'cannon' })——交付期后端切换（r46 owner 批复 #8(a)/D12），
 * 全量刚体求解器。降级对照在 physics-3d-basic（builtin：不模拟、无碰撞事件）；本例的
 * 「真模拟位移 > 0」断言同时就是后端身份证据（builtin 下恒为 0，直接判红）。
 *
 * 效果契约（effect.functional 的可执行来源）：
 * - 确定性时间线：冻结帧驱动（physics.enable=false），按官方 postUpdate 同序手动步进
 *   （syncSceneToPhysics → step → emitEvents → syncAfterEvents）：
 *   R1 箱塔（3 层）下落堆稳：唯一接触对 = {Ground|Tower1, Tower1|Tower2, Tower2|Tower3}，
 *      30 步后位置逐位稳定（restStable）；
 *   R2 重置复现：销毁箱塔 → 同参数重建 → 同步数重跑 → 静止高度与 R1 逐位一致（r2 相等），
 *      接触对集合复现（重置与降级行为可复现）。
 * - 交互（真实点击）：TOUCH_START → event.getLocation() → camera.screenPointToRay →
 *   physics.raycast 记录首个命中刚体名 → 生成 StrikeBall（水平速度 -7）→ 手动步进 45 步 →
 *   新增含球接触对 ≥1（碰撞事件链）→ UI 状态行实时更新。
 * - __lifecycle()：release = 销毁全部球/塔节点 + mesh/material 资产链，reacquire = 同路径重建。
 *
 * 断言失败路径：pcheck 失败 → throw → pageerror → no-runtime-error 红。
 */

import {
  createAirApp, Scene, Node, Camera, Canvas, Component, MeshRenderer, DirectionalLight,
  Material, Layers, Color, Vec3, primitives, utils, geometry, isValid, Label, UITransform,
  Widget, view, ResolutionPolicy,
  physics as physicsNS, ERigidBodyType, RigidBody, BoxCollider, SphereCollider,
  input, Input,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

const r2 = (v: number): number => Math.round(v * 100) / 100;
const FIXED_STEP = 1 / 60;
const UI_LAYER = Layers.Enum.UI_3D;

const probe = {
  id: 'physics-interaction',
  ready: false,
  ok: false,
  clickPhaseDone: false,
  checks: [] as { name: string; ok: boolean; detail: string }[],
  state: {} as Record<string, unknown>,
};
(window as any).__trialProbe = probe;

function pcheck (name: string, ok: boolean, detail: string): void {
  probe.checks.push({ name, ok: !!ok, detail });
  if (!ok) { throw new Error('[physics-interaction] assertion failed: ' + name + ' — ' + detail); }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- 状态

const state = {
  phase: 'boot',
  clicks: 0,
  ballsSpawned: 0,
  strikeEnters: 0,
  lastRayHit: '(none)',
  enterPairsRun1: [] as string[],
  enterPairsRun2: [] as string[],
  restY1: [] as number[],
  restY2: [] as number[],
  exitTotal: 0,
  resetReproducible: false,
};

let scene: Scene;
let camera: Camera;
let physics: any;
let world: any;
let statusLabel: Label;
let towers: Node[] = [];
let groundNode: Node | null = null;
let ringNode: Node | null = null;

const enterPairs = new Set<string>();
const ownedAssets: { name: string; ref: any }[] = [];

// ---------------------------------------------------------------- 构建 helpers

function standardMaterial (label: string, color: Color): Material {
  const material = new Material();
  material.initialize({ effectName: 'builtin-standard' });
  material.setProperty('mainColor', color);
  ownedAssets.push({ name: 'Material:' + label, ref: material });
  return material;
}

function makeNode (name: string, x: number, y: number, z: number): Node {
  const node = new Node(name);
  node.layer = Layers.Enum.DEFAULT;
  node.setPosition(new Vec3(x, y, z));
  return node;
}

function bindVisual (node: Node, label: string, buildData: () => any, color: Color): MeshRenderer {
  const renderer = node.addComponent(MeshRenderer);
  const mesh = utils.createMesh(buildData());
  ownedAssets.push({ name: 'Mesh:' + label, ref: mesh });
  renderer.mesh = mesh;
  renderer.material = standardMaterial(label, color);
  return renderer;
}

function pairName (event: any): string {
  const a = event.selfCollider.node.name;
  const b = event.otherCollider.node.name;
  return [a, b].sort().join('|');
}

function onEnter (event: any): void { enterPairs.add(pairName(event)); }
function onExit (): void { state.exitTotal++; }

/** 箱塔：3 层 1×1×1 动态箱（同名同参重建 = 重置复现的前提）。 */
function buildTower (): Node[] {
  const nodes: Node[] = [];
  for (let i = 0; i < 3; i++) {
    const name = 'Tower' + (i + 1);
    const n = makeNode(name, 0, 0.6 + i * 1.05, 0);
    scene.addChild(n);
    bindVisual(n, name, () => primitives.box({ width: 1, height: 1, length: 1 }), new Color(200, 160, 90, 255));
    const rb = n.addComponent(RigidBody);
    rb.type = ERigidBodyType.DYNAMIC;
    const col = n.addComponent(BoxCollider);
    col.size = new Vec3(1, 1, 1);
    col.on('onCollisionEnter', onEnter);
    col.on('onCollisionExit', onExit);
    nodes.push(n);
  }
  return nodes;
}

function spawnStrikeBall (): Node {
  state.ballsSpawned++;
  const name = 'StrikeBall' + state.ballsSpawned;
  const n = makeNode(name, 4.2, 2.2, 0);
  scene.addChild(n);
  bindVisual(n, name, () => primitives.sphere(0.45), new Color(230, 90, 70, 255));
  const rb = n.addComponent(RigidBody);
  rb.type = ERigidBodyType.DYNAMIC;
  rb.setLinearVelocity(new Vec3(-7, -0.5, 0));
  const col = n.addComponent(SphereCollider);
  col.radius = 0.45;
  col.on('onCollisionEnter', onEnter);
  return n;
}

/** Ground + SpinRing 构建（lifecycle release/reacquire 与首次构建共用同一路径）。 */
let ringYaw = 0;
class Spinner extends Component {
  update(dt: number): void {
    ringYaw += dt * 90;
    this.node.setRotationFromEuler(0, ringYaw, 0);
  }
}
function buildGroundAndRing(): void {
  // Ground：静态盒（顶面 y=0）——不订阅事件（接触对由塔/球侧计数，避免双发重复）
  groundNode = makeNode('Ground', 0, -0.5, 0);
  scene.addChild(groundNode);
  bindVisual(groundNode, 'Ground', () => primitives.box({ width: 12, height: 1, length: 12 }), new Color(64, 96, 72, 255));
  const groundBody = groundNode.addComponent(RigidBody);
  groundBody.type = ERigidBodyType.STATIC;
  const groundCollider = groundNode.addComponent(BoxCollider);
  groundCollider.size = new Vec3(12, 1, 12);
  // SpinRing：与模拟无关的持续帧间变化（frame-diff 护栏，physics-3d-collision 同款）
  ringNode = makeNode('SpinRing', -4, 2.4, 0);
  scene.addChild(ringNode);
  bindVisual(ringNode, 'SpinRing', () => primitives.torus(0.5, 0.18), new Color(150, 150, 160, 255));
  ringNode.addComponent(Spinner);
}

// ---------------------------------------------------------------- 手动步进（官方 postUpdate 同序）

function stepWorld (steps: number): void {
  for (let i = 0; i < steps; i++) {
    physics.syncSceneToPhysics();
    physics.step(FIXED_STEP);
    physics.emitEvents();
    world.syncAfterEvents();
  }
}

function restHeights (): number[] {
  return towers.map((n) => r2(n.position.y));
}

function updateStatus (): void {
  if (statusLabel) {
    statusLabel.string = 'phase ' + state.phase + ' · pairs ' + enterPairs.size
      + ' · clicks ' + state.clicks + ' · balls ' + state.ballsSpawned
      + ' · hit ' + state.lastRayHit;
  }
}

// ---------------------------------------------------------------- 交互：射线 + 投球

function onTouchStart (event: any): void {
  const loc = event.getLocation();
  const ray = camera.screenPointToRay(loc.x, loc.y, new geometry.Ray());
  const hit = physics.raycast(ray, 0xffffffff, 30);
  const results = hit ? physics.raycastResults.slice().sort((a: any, b: any) => a.distance - b.distance) : [];
  state.clicks++;
  state.lastRayHit = results.length > 0 ? String(results[0].collider.node.name) : '(none)';

  const pairsBefore = enterPairs.size;
  spawnStrikeBall();
  stepWorld(45); // 0.75 模拟秒：球飞完 4.2 → 命中塔身
  const newPairs = [...enterPairs].slice(pairsBefore);
  state.strikeEnters = enterPairs.size - pairsBefore;

  if (!probe.clickPhaseDone) {
    probe.clickPhaseDone = true;
    pcheck('ray-hit-identified', results.length > 0, 'raycast results=' + results.length + ' first=' + state.lastRayHit);
    pcheck('strike-collision-events', state.strikeEnters >= 1,
      'newPairs=' + newPairs.join(',') + ' (strikeEnters=' + state.strikeEnters + ')');
  }
  state.phase = 'clicked';
  updateStatus();
}

// ---------------------------------------------------------------- 主流程

async function main (): Promise<void> {
  const app = await createAirApp({ canvas: '#GameCanvas', physics: 'cannon' });
  (window as any).__airApp = app;
  physics = physicsNS.PhysicsSystem.instance;
  physics.enable = true;
  physics.autoSimulation = true;
  physics.allowSleep = true;
  physics.maxSubSteps = 1;
  physics.fixedTimeStep = FIXED_STEP;
  physics.gravity = new Vec3(0, -10, 0);

  scene = new Scene('physics-interaction');

  const cameraNode = makeNode('Main Camera', 0, 4.2, 9.8);
  scene.addChild(cameraNode);
  cameraNode.lookAt(new Vec3(0, 1.2, 0));
  camera = cameraNode.addComponent(Camera);
  camera.projection = Camera.ProjectionType.PERSPECTIVE;
  camera.fov = 45;
  camera.near = 0.1;
  camera.far = 100;
  camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
  camera.clearColor = new Color(18, 26, 34, 255);
  camera.visibility = Layers.Enum.DEFAULT;
  camera.priority = 0;

  const lightNode = makeNode('Main Light', 0, 8, 0);
  scene.addChild(lightNode);
  lightNode.setRotationFromEuler(-45, -30, 0);
  const light = lightNode.addComponent(DirectionalLight);
  light.illuminance = 20000;

  buildGroundAndRing();

  towers = buildTower();

  // ---- UI 状态行（引擎 Label；DEPTH_ONLY 相机叠加在 3D 之上） --------------------
  view.setDesignResolutionSize(window.innerWidth, window.innerHeight, ResolutionPolicy.EXACT_FIT);
  const canvasNode = new Node('Canvas');
  canvasNode.layer = UI_LAYER;
  const canvasT = canvasNode.addComponent(UITransform);
  canvasT.setContentSize(window.innerWidth, window.innerHeight);
  const canvasComp = canvasNode.addComponent(Canvas);
  const canvasWidget = canvasNode.addComponent(Widget);
  canvasWidget.isAlignLeft = canvasWidget.isAlignRight = true;
  canvasWidget.isAlignTop = canvasWidget.isAlignBottom = true;
  canvasWidget.left = canvasWidget.right = canvasWidget.top = canvasWidget.bottom = 0;
  canvasWidget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
  scene.addChild(canvasNode);

  const uiCamNode = new Node('UICamera');
  uiCamNode.layer = UI_LAYER;
  uiCamNode.addComponent(UITransform);
  canvasNode.addChild(uiCamNode);
  const uiCamera = uiCamNode.addComponent(Camera);
  uiCamera.projection = Camera.ProjectionType.ORTHO;
  uiCamera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
  uiCamera.visibility = UI_LAYER;
  uiCamera.near = 1;
  uiCamera.far = 2000;
  uiCamera.priority = 10;
  canvasComp.cameraComponent = uiCamera;

  const statusNode = new Node('StatusLabel');
  statusNode.layer = UI_LAYER;
  const statusT = statusNode.addComponent(UITransform);
  statusT.setContentSize(760, 30);
  statusNode.setPosition(0, 300, 0);
  canvasNode.addChild(statusNode);
  statusLabel = statusNode.addComponent(Label);
  statusLabel.string = 'phase boot';
  statusLabel.fontSize = 20;
  statusLabel.lineHeight = 25;
  statusLabel.color = new Color(255, 236, 160, 255);
  statusLabel.overflow = Label.Overflow.NONE;
  statusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

  app.run(scene);
  await sleep(350); // 激活 + onLoad 刚体入世界

  // ---- R1：冻结帧驱动，箱塔下落堆稳（真模拟 = 后端身份证据） ----------------------
  physics.enable = false;
  world = physics.physicsWorld;
  state.phase = 'r1-settle';
  stepWorld(120);
  const rest1 = restHeights();
  stepWorld(30);
  const rest1b = restHeights();
  const stable1 = rest1.every((v, i) => v === rest1b[i]);
  state.restY1 = rest1b;
  state.enterPairsRun1 = [...enterPairs];
  pcheck('cannon-simulates-displacement', rest1b[0] < 0.6 && rest1b[0] > 0.3,
    'Tower1 rest y=' + rest1b[0] + '（builtin 恒 0.6 不动 → 后端非 cannon 即判红）');
  pcheck('contact-pairs-run1', enterPairs.size === 3
    && enterPairs.has('Ground|Tower1') && enterPairs.has('Tower1|Tower2') && enterPairs.has('Tower2|Tower3'),
    'pairs=' + [...enterPairs].join(','));
  pcheck('rest-stable-run1', stable1 && state.exitTotal === 0,
    'stable=' + stable1 + ' exits=' + state.exitTotal + ' heights=' + JSON.stringify(rest1b));
  updateStatus();

  // ---- R2：重置复现（销毁 → 同参重建 → 同步数重跑 → 逐位一致） --------------------
  state.phase = 'r2-reset';
  const oldTowers = towers;
  towers = [];
  oldTowers.forEach((n) => n.destroy());
  await sleep(300); // 帧末延迟销毁落地（刚体随 onDestroy 出世界）
  pcheck('old-towers-destroyed', oldTowers.every((n) => !isValid(n)), 'isValid 全 false=' + oldTowers.every((n) => !isValid(n)));
  enterPairs.clear();
  towers = buildTower();
  await sleep(120); // 新组件 onLoad 刚体入世界
  stepWorld(120);
  stepWorld(30);
  const rest2 = restHeights();
  state.restY2 = rest2;
  state.enterPairsRun2 = [...enterPairs];
  state.resetReproducible = rest2.every((v, i) => v === state.restY1[i]) && enterPairs.size === 3;
  pcheck('reset-reproducible', state.resetReproducible,
    'run1=' + JSON.stringify(state.restY1) + ' run2=' + JSON.stringify(rest2) + ' pairs=' + enterPairs.size);
  updateStatus();

  // ---- 交互订阅（真实点击 → 射线 → 投球 → 步进 → 事件计数） ------------------------
  input.on(Input.EventType.TOUCH_START, onTouchStart);

  // ---- §25 Lifecycle 合同 -------------------------------------------------------
  installAssetLifecycle({
    label: 'physics-interaction',
    hold: () => {
      const held: { name: string; ref: object }[] = ownedAssets
        .filter((a) => isValid(a.ref))
        .map((a) => ({ name: a.name, ref: a.ref }));
      towers.forEach((n, i) => held.push({ name: 'TowerNode' + (i + 1), ref: n }));
      if (groundNode) { held.push({ name: 'GroundNode', ref: groundNode }); }
      if (ringNode) { held.push({ name: 'SpinRingNode', ref: ringNode }); }
      return held;
    },
    release: () => {
      input.off(Input.EventType.TOUCH_START, onTouchStart);
      towers.forEach((n) => n.destroy());
      towers = [];
      scene.children.filter((n) => n.name.startsWith('StrikeBall')).forEach((n) => n.destroy());
      // Ground/SpinRing 节点必须先于其 mesh/material 资产销毁——否则存活渲染器引用已毁资产，
      // agent-session inspectRuntimeAssets 会在 mesh.struct=null 上崩（正典批次实测教训）
      if (groundNode) { groundNode.destroy(); groundNode = null; }
      if (ringNode) { ringNode.destroy(); ringNode = null; }
      for (const a of ownedAssets) {
        if (isValid(a.ref)) { a.ref.destroy(); }
      }
      ownedAssets.length = 0;
    },
    reacquire: async () => {
      await sleep(300); // 等销毁落地再重建（同名节点不撞车）
      buildGroundAndRing();
      towers = buildTower();
      await sleep(120);
      input.on(Input.EventType.TOUCH_START, onTouchStart);
      updateStatus();
      const held: { name: string; ref: object }[] = ownedAssets.map((a) => ({ name: a.name, ref: a.ref }));
      towers.forEach((n, i) => held.push({ name: 'TowerNode' + (i + 1), ref: n }));
      if (groundNode) { held.push({ name: 'GroundNode', ref: groundNode }); }
      if (ringNode) { held.push({ name: 'SpinRingNode', ref: ringNode }); }
      return held;
    },
  });

  state.phase = 'ready';
  updateStatus();
  probe.state = Object.assign({}, state, {
    towersValid: towers.map((n) => isValid(n)),
    livePairs: [...enterPairs],
  });
  probe.ready = true;
  probe.ok = probe.checks.every((c) => c.ok);
}

main().catch((e) => {
  probe.ready = true;
  probe.ok = false;
  probe.state.fatal = String((e && e.message) || e);
  throw e; // pageerror 通道捕获 → no-runtime-error 红
});
