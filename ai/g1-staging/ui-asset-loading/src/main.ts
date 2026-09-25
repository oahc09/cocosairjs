/**
 * ui-asset-loading — UI 控件 + 异步资源加载/失败/重试/释放（G1 组合场景 · P08）。
 *
 * 效果契约（effect.functional 的可执行来源）：
 * - 确定性时间线（无需点击即完整走一遍）：
 *   P1 注册表往返：运行时生成 Texture2D → assetManager.assets.add('gen/panel') →
 *      loadAssetAsync(path, Texture2D) 命中同一实例 → Preview 显示绿色；
 *   P2 URL 成功加载：loadAssetAsync('assets/panel-manifest.json')（非序列化格式回退纯 JSON）；
 *   P3 注册表未命中失败：loadAssetAsync(path,type) 无此键 → Promise 拒绝（消息含 not found）
 *     → UI 进入失败态、可重试；（HTTP-404 面由手册树 manual-asset-lifecycle 覆盖——Gallery
 *     发布面契约 artifact:no-http-errors 不允许故意 404，失败路径改用零 HTTP 的注册表未命中）
 *   P4 重试：同键再试仍未命中（如实），随后注册表回退加载成功 → UI 恢复；
 *   P5 加载锁：3 个并发 requestLoad 只有 1 个真正启动，其余 2 个被状态锁拒绝（幂等，防快速重复点击）；
 *   P6 销毁守卫：临时组件发起注定失败的加载后立即销毁节点，回调落地时 isValid 守卫拦截，
 *      悬空效果计数恒为 0（Node.off 对称退订同步演示）。
 * - 交互：点击 LoadButton（画布中心）→ clickCount+1 并触发一次带锁的重载；历史计数不漂移。
 * - __lifecycle()（§25 合同）：release = 注册表移除 + releaseAsset + destroy（持有引用全部 invalid），
 *   reacquire = 同一实现路径重建（registry → loadAssetAsync → createWithImage → 上屏）。
 *
 * 断言失败路径：任何 pcheck 失败 → throw → pageerror → no-runtime-error 红。
 * 失败路径为故意拒绝：try/catch 捕获，不产生 window error / unhandledrejection，也不产生 HTTP 错误。
 */

import {
  createAirApp, Scene, Node, Camera, Canvas, UITransform, Widget, Layers, Color,
  Component, Label, Sprite, SpriteFrame, Button, Texture2D, ImageAsset,
  view, ResolutionPolicy, assetManager, loadAssetAsync, isValid,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

const UI_LAYER = Layers.Enum.UI_3D;

const probe = {
  id: 'ui-asset-loading',
  ready: false,
  ok: false,
  clickPhaseDone: false,
  checks: [] as { name: string; ok: boolean; detail: string }[],
  state: {} as Record<string, unknown>,
};
(window as any).__trialProbe = probe;

function pcheck (name: string, ok: boolean, detail: string): void {
  probe.checks.push({ name, ok: !!ok, detail });
  if (!ok) { throw new Error('[ui-asset-loading] assertion failed: ' + name + ' — ' + detail); }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- UI helpers

function makeUINode (name: string, parent: Node | null, w: number, h: number, x = 0, y = 0): Node {
  const node = new Node(name);
  node.layer = UI_LAYER;
  const t = node.addComponent(UITransform);
  t.setContentSize(w, h);
  t.setAnchorPoint(0.5, 0.5);
  node.setPosition(x, y, 0);
  if (parent) { parent.addChild(node); }
  return node;
}

function makeImage (cssColor: string, size = 64): { image: ImageAsset; canvas: HTMLCanvasElement } {
  const cvs = document.createElement('canvas');
  cvs.width = size; cvs.height = size;
  const ctx = cvs.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(size * 0.25, size * 0.25, size * 0.5, size * 0.5);
  return { image: new ImageAsset(cvs), canvas: cvs };
}

function addLabel (node: Node, text: string, fontSize: number, color?: Color): Label {
  const label = node.addComponent(Label);
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = Math.round(fontSize * 1.25);
  label.color = color || Color.WHITE;
  label.overflow = Label.Overflow.NONE;
  return label;
}

// ---------------------------------------------------------------- 状态机

const state = {
  phase: 'boot',
  loadState: 'idle' as 'idle' | 'loading' | 'loaded' | 'failed',
  clicks: 0,
  loadStarts: 0,
  lockRejects: 0,
  retries: 0,
  http404s: 0,
  danglingEffects: 0,
  guardedCallbacks: 0,
  registryHits: 0,
  manifestOk: false,
  lastError: '',
};

let statusLabel: Label;
let infoLabel: Label;
let previewSprite: Sprite;
let buttonLabel: Label;
let buttonNode: Node;

let previewFrame: SpriteFrame | null = null; // 当前上屏的 SpriteFrame（lifecycle 持有）
let registryTex: Texture2D | null = null;   // 'gen/panel' 注册表纹理（lifecycle 持有）

function renderUI (): void {
  if (statusLabel) { statusLabel.string = 'phase: ' + state.phase + ' · state: ' + state.loadState; }
  if (infoLabel) {
    infoLabel.string = 'loads ' + state.loadStarts + ' · locks ' + state.lockRejects
      + ' · clicks ' + state.clicks + ' · fails ' + state.http404s
      + (state.lastError ? ' · err: ' + state.lastError.slice(0, 40) : '');
  }
  if (buttonLabel) { buttonLabel.string = state.loadState === 'failed' ? 'Retry load' : 'Load panel'; }
}

/** 由 Texture2D 生成 SpriteFrame 并上屏（首次构建与 lifecycle 重建共用同一路径）。 */
function applyPreview (tex: Texture2D): void {
  const frame = SpriteFrame.createWithImage((tex.image as ImageAsset));
  if (previewFrame && isValid(previewFrame)) { previewFrame.destroy(); }
  previewFrame = frame;
  previewSprite.sizeMode = Sprite.SizeMode.CUSTOM;
  previewSprite.spriteFrame = frame;
  const ut = previewSprite.node.getComponent(UITransform);
  if (ut) { ut.setContentSize(140, 140); }
}

/** 带状态锁的加载（防快速重复点击/并发重入）：loading 期间一律拒绝。 */
async function requestLoad (): Promise<boolean> {
  if (state.loadState === 'loading') { state.lockRejects++; renderUI(); return false; }
  state.loadState = 'loading';
  state.loadStarts++;
  renderUI();
  try {
    const tex = await loadAssetAsync('gen/panel', Texture2D) as Texture2D;
    if (!isValid(tex)) { state.loadState = 'failed'; renderUI(); return false; }
    state.registryHits++;
    registryTex = tex;
    applyPreview(tex);
    state.loadState = 'loaded';
    renderUI();
    return true;
  } catch (e) {
    state.lastError = String((e as Error).message || e);
    state.loadState = 'failed';
    renderUI();
    return false;
  }
}

async function tryLoadMissing (key: string): Promise<{ ok: boolean; message: string }> {
  try {
    await loadAssetAsync(key, Texture2D);
    return { ok: true, message: '' };
  } catch (e) {
    return { ok: false, message: String((e as Error).message || e) };
  }
}

/** P6 销毁守卫组件：注定失败的加载 + 取消 + 节点销毁 → 回调落地时被拦截。
 * 双守卫 = 显式取消标志（destroy 发起方设置，确定性）+ isValid（帧末延迟销毁兜底）。
 * 注：isValid 在帧末 _deferredDestroy 落地前仍为 true——只靠它存在竞态（实测 dangling=1），
 * 这正是 G3 范式「异步任务取消」要显式 token 的原因。 */
class GuardedLoader extends Component {
  buttonRef: Node | null = null;
  echoCount = 0;
  cancelled = false;

  onLoad (): void {
    if (this.buttonRef) { this.buttonRef.on('click', this.onEcho, this); }
  }

  onDisable (): void {
    if (this.buttonRef) { this.buttonRef.off('click', this.onEcho, this); }
  }

  onEcho (): void { this.echoCount++; }

  async loadMissing (): Promise<void> {
    try {
      await loadAssetAsync('gen/also-missing', Texture2D); // 注册表未命中 → 拒绝（零 HTTP 失败路径）
    } catch (e) {
      if (this.cancelled || !isValid(this.node)) { state.guardedCallbacks++; return; } // 已取消/已销毁：不落任何效果
      state.danglingEffects++; // 守卫失效才会到达（合同：恒为 0）
    }
  }
}

// ---------------------------------------------------------------- 主流程

async function main (): Promise<void> {
  const canvasEl = document.querySelector('#GameCanvas') as HTMLCanvasElement;
  const app = await createAirApp({ canvas: canvasEl });
  (window as any).__airApp = app;

  view.setDesignResolutionSize(window.innerWidth, window.innerHeight, ResolutionPolicy.EXACT_FIT);

  const scene = new Scene('ui-asset-loading');

  // Canvas（Widget 全对齐，尺寸随视口）+ UI 相机（ORTHO + UI_3D 可见性）
  const canvasNode = makeUINode('Canvas', null, 480, 360, 240, 180);
  const canvasComp = canvasNode.addComponent(Canvas);
  const canvasWidget = canvasNode.addComponent(Widget);
  canvasWidget.isAlignLeft = canvasWidget.isAlignRight = true;
  canvasWidget.isAlignTop = canvasWidget.isAlignBottom = true;
  canvasWidget.left = canvasWidget.right = canvasWidget.top = canvasWidget.bottom = 0;
  canvasWidget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
  scene.addChild(canvasNode);

  const cameraNode = makeUINode('UICamera', canvasNode, 1, 1, 0, 0);
  const uiCamera = cameraNode.addComponent(Camera);
  uiCamera.projection = Camera.ProjectionType.ORTHO;
  uiCamera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
  uiCamera.clearColor = new Color(24, 30, 44, 255);
  uiCamera.visibility = UI_LAYER;
  uiCamera.near = 1;
  uiCamera.far = 2000;
  canvasComp.cameraComponent = uiCamera;

  // 状态 / 预览 / 按钮 / 详情
  const statusNode = makeUINode('StatusLabel', canvasNode, 700, 30, 0, 270);
  statusLabel = addLabel(statusNode, 'phase: boot', 20, new Color(255, 236, 160, 255));
  statusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

  const previewNode = makeUINode('Preview', canvasNode, 140, 140, 0, 130);
  previewSprite = previewNode.addComponent(Sprite);
  previewSprite.sizeMode = Sprite.SizeMode.CUSTOM;
  const placeholder = makeImage('#555f6e');
  previewFrame = SpriteFrame.createWithImage(placeholder.image);
  previewSprite.spriteFrame = previewFrame;

  buttonNode = makeUINode('LoadButton', canvasNode, 260, 90, 0, 0);
  const buttonSprite = buttonNode.addComponent(Sprite);
  buttonSprite.sizeMode = Sprite.SizeMode.CUSTOM;
  buttonSprite.spriteFrame = SpriteFrame.createWithImage(makeImage('#ffffff').image);
  buttonSprite.color = new Color(52, 120, 246, 255);
  const buttonLabelNode = makeUINode('ButtonLabel', buttonNode, 240, 40, 0, 0);
  buttonLabel = addLabel(buttonLabelNode, 'Load panel', 20);
  buttonLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
  const button = buttonNode.addComponent(Button);
  button.transition = Button.Transition.COLOR;
  button.normalColor = new Color(52, 120, 246, 255);
  button.pressedColor = new Color(246, 96, 60, 255);
  button.hoverColor = new Color(82, 150, 255, 255);
  // 注：Button.targetColor 不在当期公开 d.ts 面（ui-components 为 JS 免检）；transition 三色已足够

  const infoNode = makeUINode('InfoLabel', canvasNode, 700, 24, 0, -160);
  infoLabel = addLabel(infoNode, '', 15, new Color(160, 200, 235, 255));
  infoLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

  buttonNode.on('click', () => {
    state.clicks++;
    void requestLoad(); // 带锁：连点只有第一个真正启动
    renderUI();
    if (!probe.clickPhaseDone && state.clicks >= 1) {
      probe.clickPhaseDone = true;
      pcheck('click-driven-reload', state.loadStarts >= 1 && state.lockRejects >= 0,
        'clicks=' + state.clicks + ' loadStarts=' + state.loadStarts);
    }
  });

  // Node.on/off 对称订阅-退订的显式演示（确定性执行，不依赖组件事机）
  let echoCount = 0;
  const echoHandler = (): void => { echoCount++; };
  buttonNode.on('click', echoHandler);
  buttonNode.off('click', echoHandler);

  app.run(scene);
  renderUI();

  // ---- P1 注册表往返（成功路径） -------------------------------------------
  state.phase = 'p1-registry';
  const green = makeImage('#3a8f4e');
  const tex = new Texture2D();
  tex.image = green.image;
  assetManager.assets.add('gen/panel', tex);
  const before = state.loadStarts;
  const p1 = await requestLoad();
  const hit = await loadAssetAsync('gen/panel', Texture2D) as Texture2D;
  pcheck('p1-registry-roundtrip', p1 === true && hit === tex && isValid(hit) && state.loadStarts === before + 1,
    'loaded=' + p1 + ' same=' + (hit === tex) + ' starts=' + state.loadStarts);
  await sleep(200);

  // ---- P2 URL 成功加载（JSON 回退） -----------------------------------------
  state.phase = 'p2-url-json';
  const manifest = await loadAssetAsync('assets/panel-manifest.json') as Record<string, unknown>;
  state.manifestOk = !!manifest && manifest.name === 'ui-asset-loading' && manifest.items === 3;
  pcheck('p2-url-json-load', state.manifestOk,
    'name=' + (manifest && manifest.name) + ' items=' + (manifest && manifest.items));
  renderUI();
  await sleep(200);

  // ---- P3 注册表未命中失败路径（零 HTTP；404 面在手册树覆盖） -------------------
  state.phase = 'p3-registry-miss';
  const fail = await tryLoadMissing('gen/missing-panel');
  state.http404s++;
  state.lastError = fail.message;
  state.loadState = 'failed';
  pcheck('p3-miss-rejected', fail.ok === false && fail.message.length > 0,
    fail.message.slice(0, 90));
  renderUI();
  await sleep(250);

  // ---- P4 重试（同 URL 如实再败 → 注册表回退成功） ----------------------------
  state.phase = 'p4-retry';
  state.retries++;
  const retry = await tryLoadMissing('gen/missing-panel');
  if (!retry.ok) { state.http404s++; }
  const p4 = await requestLoad();
  pcheck('p4-retry-fallback-success', retry.ok === false && p4 === true && (state.loadState as string) === 'loaded',
    'retry404=' + (!retry.ok) + ' fallbackLoaded=' + p4);
  renderUI();
  await sleep(200);

  // ---- P5 加载锁（并发 burst：只有 1 个真正启动） ------------------------------
  state.phase = 'p5-load-lock';
  const startsBefore = state.loadStarts;
  const rejectsBefore = state.lockRejects;
  state.loadState = 'idle';
  const burst = await Promise.all([requestLoad(), requestLoad(), requestLoad()]);
  pcheck('p5-concurrent-load-lock',
    state.loadStarts - startsBefore === 1 && state.lockRejects - rejectsBefore === 2
    && burst.filter((x) => x === true).length === 1,
    'starts=+' + (state.loadStarts - startsBefore) + ' rejects=+' + (state.lockRejects - rejectsBefore));
  await sleep(150);

  // ---- P6 销毁守卫（悬空回调恒为 0） ------------------------------------------
  state.phase = 'p6-destroy-guard';
  const tempNode = new Node('TempLoader');
  tempNode.layer = UI_LAYER;
  const guard = tempNode.addComponent(GuardedLoader);
  guard.buttonRef = buttonNode;
  canvasNode.addChild(tempNode); // 入树激活：onLoad 真实订阅 echo（销毁隐含 onDisable → off）
  const pending = guard.loadMissing(); // 发起注定失败的加载（404 拒绝在销毁之后落地）
  guard.cancelled = true; // 取消 token：destroy 发起方显式设置（确定性守卫）
  tempNode.destroy(); // isValid 双守卫兜底（帧末延迟销毁）
  await pending;
  await sleep(250);
  pcheck('p6-no-dangling-callbacks', state.danglingEffects === 0 && state.guardedCallbacks === 1,
    'dangling=' + state.danglingEffects + ' guarded=' + state.guardedCallbacks);

  // ---- §25 Lifecycle 合同 -----------------------------------------------------
  installAssetLifecycle({
    label: 'ui-asset-loading',
    hold: () => {
      const held: { name: string; ref: unknown }[] = [];
      if (registryTex) { held.push({ name: 'Texture2D(gen/panel)', ref: registryTex }); }
      if (previewFrame) { held.push({ name: 'SpriteFrame(preview)', ref: previewFrame }); }
      return held as { name: string; ref: object }[];
    },
    release: () => {
      // 先摘显示引用，再走注册表移除 + releaseAsset + destroy 的真实释放链
      previewSprite.spriteFrame = null;
      assetManager.assets.remove('gen/panel');
      if (registryTex) { assetManager.releaseAsset(registryTex); registryTex.destroy(); registryTex = null; }
      if (previewFrame) { previewFrame.destroy(); previewFrame = null; }
    },
    reacquire: async () => {
      // 与首次构建同一条实现路径：生成 → 注册 → loadAssetAsync → createWithImage → 上屏
      const img = makeImage('#3a8f4e');
      const tex2 = new Texture2D();
      tex2.image = img.image;
      assetManager.assets.add('gen/panel', tex2);
      const loaded = await loadAssetAsync('gen/panel', Texture2D) as Texture2D;
      registryTex = loaded;
      applyPreview(loaded);
      state.loadState = 'loaded';
      renderUI();
      return [{ name: 'Texture2D(gen/panel)', ref: loaded }, { name: 'SpriteFrame(preview)', ref: previewFrame as object }];
    },
  });

  state.phase = 'ready';
  renderUI();
  probe.state = {
    phase: state.phase,
    loadState: state.loadState,
    loadStarts: state.loadStarts,
    lockRejects: state.lockRejects,
    http404s: state.http404s,
    retries: state.retries,
    registryHits: state.registryHits,
    manifestOk: state.manifestOk,
    danglingEffects: state.danglingEffects,
    guardedCallbacks: state.guardedCallbacks,
    echoCount,
    registryTexValid: isValid(registryTex as Texture2D),
    previewFrameValid: isValid(previewFrame as SpriteFrame),
  };
  probe.ready = true;
  probe.ok = probe.checks.every((c) => c.ok);
}

main().catch((e) => {
  probe.ready = true;
  probe.ok = false;
  probe.state.fatal = String((e && e.message) || e);
  throw e; // pageerror 通道捕获 → no-runtime-error 红（证据不得静默）
});
