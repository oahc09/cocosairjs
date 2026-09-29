/**
 * Cocos Air — webview-basic（LV12-05 · 计划书 A4：iframe 挂载/卸载、事件、与 UI 事件穿透行为）
 *
 * A4 三个验证要点在本文件里的落点（逐条对应 `results.p*`）：
 * ① **iframe 挂载/卸载**（P1/P9）：`createWebView()` 往 `game.container`（Air 的 bootstrap 建的
 *   `#Cocos3dGameContainer`）追加 `div#webview-wrapper > iframe#webview`（web-view-impl-web.ts:71-94），
 *   `removeWebView()` 只在 wrapper 真的还挂在 container 里时才摘（:96-102）⇒
 *   「DOM 里 `#webview-wrapper` 的个数」是真实的泄漏计数器。销毁后 `nativeWebView` 必须是 `null`、
 *   `state` 必须回 `none`（组件 `_impl` 已置 null，web-view.ts:109-112）。
 * ② **事件**（P2/P6）：`__preload` 把 LOADING/LOADED/ERROR 三条装进 `componentEventList`
 *   （web-view.ts:172-178），而 `dispatchEvent` **只在表里有 key 时才改 `_state`**
 *   （web-view-impl.ts:98-104）⇒ `state` 的取值序列就是回调链跑通的证据。另挂一条
 *   `webviewEvents`（EventHandler → 具名组件方法）覆盖序列化那条回调线。
 *   ⚠️ web 端的 `error` 事件**不是**网络错误事件：`_bindDomEvent` 只看
 *   `iframe.contentDocument.body.innerHTML.includes('404')`（web-view-impl-web.ts:49-58），
 *   正文里含「404」字样的正常页面会被判成加载出错，真的 404 反而只在页面正文含 404 时才报。
 *   本示例用一份同源 200 的 `assets/page-error-like.html` 把这条嗅探**确定性地**跑出来（P6）。
 * ③ **与 UI 事件穿透**（P5 + 点击阶段的 `live` 字段）：web 实现是 DOM overlay，引擎不做任何命中屏蔽 ⇒
 *   `document.elementFromPoint(iframe 中心)` 在 enabled 时是 `IFRAME`、`enabled=false` 后是 `CANVAS`；
 *   矩阵的真实鼠标点击落在 iframe 上时，页内计数器 +1，而引擎侧节点触摸事件与 canvas DOM 事件**都是 0**
 *   （`live.iframeClicks` / `live.engineTouchEvents` / `live.canvasDomClicks`）。这就是「穿透」的全部真相：
 *   web 端没有开关，只能靠 `enabled` 整体隐藏。
 *
 * ⚠️ 本示例**故意不触发** `evaluateJS` 的失败路径：`WebViewImplWeb.evaluateJS` 对 `win.eval` 的 catch 里
 *   既 `dispatchEvent(ERROR, e)` 又 `error(e)`（web-view-impl-web.ts:116-128），一条写坏的注入脚本会
 *   同时污染 error 事件通道并留下一条 `console.error` ⇒ 矩阵的 `noConsoleError` 直接判死。
 *   该行为只在诊断脚本里单次取证：三引擎实测各新落 1 条 `console.error`，`state` 由 `loaded` 变 `error`，
 *   事件流尾部多出 `cb:error` + `error`（证据见 `docs/notes/v12-webview-notes.md`）。
 *
 * ⚠️ 几何断言必须等第一次 `syncMatrix` 落地：`__preload` 只把 wrapper `append` 进 container，
 *   CSS `transform/width/height` 要等 `update → syncMatrix` 才写。在那之前读 wrapper 拿到的是 iframe
 *   的内在盒（未定尺寸的 `<iframe>` 默认 300×154 ⇒ 中心 150,281），会把终态几何判红。
 *   故 P1/P9 都先 `waitMatrixSize(FINAL_SIZE)` 再 `nextFrames(2)`（实测 `matrixSizeWithinMs` 107/0/0 与 0/0/0 ms）。
 *
 * 零外网依赖：计划书 A4 明写「内嵌本地静态页」；同时组件默认 `_url` 是 `https://cocos.com`
 * （web-view.ts:50），而 `__preload` 末尾无条件 `loadURL(this._url)`（web-view.ts:178）。
 * ⇒ 必须**显式** inactive 建节点（`new Node()` 的 `_active` 默认为 true，一旦 `addChild` 进 active
 * 父节点当场就触发 `__preload`——诊断 r1 实测 `stateBeforeActivate 'loading'` 即此）→ `addComponent`
 * → 设 `url` → 注册监听 → `addChild` → `active = true`，这样第一次 `loadURL` 就打本地同源页，
 * 绝不发出外网请求（矩阵 `noFailedRequest` 也容不下它）。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Canvas,
    Component,
    EventHandler,
    UITransform,
    Layers,
    Color,
    Label,
    GraphicsComponent,
    WebView,
    game,
    isValid,
    js,
    view,
    ResolutionPolicy,
} from 'cocosair';
import { installAssetLifecycle } from '../shared/asset-lifecycle.js';

const PAGE_URL = './assets/page.html';
const ERROR_LIKE_URL = './assets/page-error-like.html';
const UI_LAYER = Layers.Enum.UI_3D;
/** 最终几何：WebViewHost 在 (0,14)、contentSize 200x150 ⇒ 页面坐标中心 (240,166)，矩阵的 click 打这里。 */
const FINAL_POS = [0, 14];
const FINAL_SIZE = [200, 150];
/**
 * WebView 自己定义的生命周期钩子（P2 逐个回读确实是 own 在 `WebView.prototype` 上，而不是继承来的同名物）：
 * `__preload` 造 impl + 首载、`onEnable/onDisable` 只切 wrapper visibility、`onDestroy` 拆 DOM、`update` 逐帧 syncMatrix。
 */
const LIFECYCLE_HOOKS = ['__preload', 'onEnable', 'onDisable', 'onDestroy', 'update'];
/** 组件实例是否真的带 `update` 钩子（引擎每帧经它驱动 impl 的 `syncMatrix`）。 */
const hasUpdateHook = (comp) => typeof comp.update === 'function';
const T0 = performance.now();

const r = (v, n = 3) => Math.round(v * 10 ** n) / 10 ** n;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** 等两帧：`syncMatrix()` 在 `WebView.update()` 里跑，几何断言必须排在渲染帧之后。 */
const nextFrames = (n = 2) =>
    new Promise((resolve) => {
        let left = n;
        const tick = () => (--left > 0 ? requestAnimationFrame(tick) : resolve());
        requestAnimationFrame(tick);
    });

async function waitFor(fn, timeoutMs = 4000, stepMs = 20) {
    const t0 = performance.now();
    for (;;) {
        let hit = false;
        try {
            hit = !!fn();
        } catch (e) {
            hit = false;
        }
        if (hit) {
            return Math.round(performance.now() - t0);
        }
        if (performance.now() - t0 > timeoutMs) {
            return -1;
        }
        await sleep(stepMs);
    }
}

/** DOM 侧唯一的真相源：wrapper 个数（挂载/卸载/泄漏计数器）。 */
const wrappers = () => document.querySelectorAll('#webview-wrapper');
const iframes = () => document.querySelectorAll('#webview');
/** 命中测试：某个页面坐标最上面的元素是谁（穿透行为的机器证据）。 */
function hitTagAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el ? el.tagName : 'NULL';
}

// ---------------------------------------------------------------- 场景
const canvasEl = document.querySelector('#GameCanvas');
const app = await createAirApp({ canvas: canvasEl });
view.setDesignResolutionSize(window.innerWidth, window.innerHeight, ResolutionPolicy.EXACT_FIT);

const scene = new Scene('v12-webview-basic');
const canvasNode = new Node('Canvas');
canvasNode.layer = UI_LAYER;
canvasNode.addComponent(UITransform).width = 480;
canvasNode.getComponent(UITransform).height = 360;
const canvas = canvasNode.addComponent(Canvas);
scene.addChild(canvasNode);

const cameraNode = new Node('UICamera');
cameraNode.layer = UI_LAYER;
cameraNode.setPosition(0, 0, 1000);
const cam = cameraNode.addComponent(Camera);
cam.projection = Camera.ProjectionType.ORTHO;
cam.clearColor = new Color(10, 14, 22, 255);
cam.priority = 1073741824;
cam.visibility = UI_LAYER;
canvasNode.addChild(cameraNode);
canvas.cameraComponent = cam;

const statusNode = new Node('Status');
statusNode.layer = UI_LAYER;
statusNode.addComponent(UITransform).width = 460;
statusNode.getComponent(UITransform).height = 40;
statusNode.setPosition(0, 160, 0);
canvasNode.addChild(statusNode);
const status = statusNode.addComponent(Label);
status.string = 'webview: loading';
status.color = new Color(220, 228, 240, 255);
status.fontSize = 14;
status.lineHeight = 17;

const hintNode = new Node('Hint');
hintNode.layer = UI_LAYER;
hintNode.addComponent(UITransform).width = 460;
hintNode.getComponent(UITransform).height = 30;
hintNode.setPosition(0, -162, 0);
canvasNode.addChild(hintNode);
const hint = hintNode.addComponent(Label);
hint.string = 'iframe overlay: clicks inside the box never reach the engine';
hint.color = new Color(140, 150, 168, 255);
hint.fontSize = 12;
hint.lineHeight = 15;

/**
 * 画布侧的「还在渲染」证据必须画在 WebGL 画布里（v11 的 frame-diff/visible-frame 采样的是
 * 默认帧缓冲，DOM iframe 根本不在这张图上）：一条 iframe 矩形描边框 + 一条由 performance.now()
 * 驱动的扫描条，三引擎都有牙。
 */
const guideNode = new Node('FrameGuide');
guideNode.layer = UI_LAYER;
guideNode.addComponent(UITransform).width = 480;
guideNode.getComponent(UITransform).height = 360;
canvasNode.addChild(guideNode);
const guide = guideNode.addComponent(GraphicsComponent);

const clockNode = new Node('Clock');
clockNode.layer = UI_LAYER;
clockNode.addComponent(UITransform).width = 420;
clockNode.getComponent(UITransform).height = 12;
clockNode.setPosition(0, -132, 0);
canvasNode.addChild(clockNode);
const clockGfx = clockNode.addComponent(GraphicsComponent);

class FrameClock extends Component {
    update() {
        const phase = (performance.now() % 2400) / 2400;
        clockGfx.clear();
        clockGfx.fillColor = new Color(28, 200, 120, 255);
        clockGfx.rect(-210 + phase * 400, -6, 20, 12);
        clockGfx.fill();
        clockGfx.strokeColor = new Color(90, 100, 120, 255);
        clockGfx.lineWidth = 1;
        clockGfx.rect(-210, -6, 420, 12);
        clockGfx.stroke();
    }
}
const clockHost = new Node('ClockHost');
clockHost.layer = UI_LAYER;
canvasNode.addChild(clockHost);
clockHost.addComponent(FrameClock);

// iframe 边框：截图里能看到引擎画的框套住了 DOM overlay，几何改动肉眼/机检双向可比。
// 静态画一次即可（DOM overlay 本身不进 WebGL 帧缓冲，frame-diff 的持续变化由 Clock 提供）。
guide.lineWidth = 2;
guide.strokeColor = new Color(255, 209, 102, 255);
guide.rect(-102, -63, 204, 154);
guide.stroke();

/** `webviewEvents` 的目标组件：EventHandler 用**类名字符串**找组件（component-event-handler.ts:156-175）。 */
class WebViewEventLog extends Component {
    onWebViewEvent(viewArg, evtType, customData) {
        eventLog.push('cb:' + evtType);
        handlerHits++;
        lastHandlerArgs = { hasView: !!viewArg, type: evtType, custom: customData };
    }
}
js.setClassName('V12WebViewEventLog', WebViewEventLog);

let hostNode = null;
let webView = null;
let eventLogEpoch = 0;
const eventLog = [];
const stateLog = [];
let handlerHits = 0;
let lastHandlerArgs = null;
let lastErrorArg = null;
let errorEvents = 0;
let engineTouchEvents = 0;
let canvasDomClicks = 0;
const lastMount = { stateBeforeActivate: null, wrappersAtMount: 0 };

const results = { phase: 'init', startedAtMs: 0 };

/**
 * 挂载一个 WebView：**节点先 inactive**，`addComponent` 后设 `url`，`addChild` + 注册监听，最后 `active = true`。
 * 顺序决定成败：`new Node()` 的 `_active` 默认就是 true，`addChild` 一进 active 父节点就立刻满足
 * activeInHierarchy ⇒ `__preload` 当场跑（造 wrapper 并 `loadURL(_url)`）。诊断 r1 实测 `stateBeforeActivate 'loading'`
 * 就是这个原因；而彼时若还没设 `url`，第一次请求就是组件默认值 `https://cocos.com`（外网 + 矩阵 `noFailedRequest` 判死）。
 * 监听同理必须排在激活之前：`loading` 事件在 `__preload` 那一帧就已发出，晚一行注册就永远收不到
 * （诊断 r1 的 `loadingWithinMs -1`、`businessSequence 'loaded'` 缺 `loading` 即此缺陷的现场）。
 */
function mountWebView(pos, size) {
    hostNode = new Node('WebViewHost');
    hostNode.layer = UI_LAYER;
    hostNode.active = false;
    hostNode.addComponent(UITransform).setContentSize(size[0], size[1]);
    hostNode.setPosition(pos[0], pos[1], 0);
    webView = hostNode.addComponent(WebView);
    webView.url = PAGE_URL;
    const eh = new EventHandler();
    eh.target = hostNode;
    eh.component = 'V12WebViewEventLog';
    eh.handler = 'onWebViewEvent';
    eh.customEventData = 'viaWebViewEvents';
    webView.webviewEvents = [eh];
    hostNode.addComponent(WebViewEventLog);
    for (const name of ['loading', 'loaded', 'error']) {
        hostNode.on(name, (viewArg, args) => {
            eventLog.push(name);
            stateLog.push(webView.state);
            if (name === 'error') {
                errorEvents++;
                lastErrorArg = args;
            }
        });
    }
    hostNode.on(Node.EventType.TOUCH_START, () => {
        engineTouchEvents++;
    });
    hostNode.on(Node.EventType.TOUCH_END, () => {
        engineTouchEvents++;
    });
    canvasNode.addChild(hostNode);
    // 已挂进 active 父节点，但 `hostNode.active === false` 仍压着 ⇒ activeInHierarchy 为假：
    // 此刻既没有 `#webview-wrapper`，`state` 也还是默认的 `none`（下面两行就是这条时序的读数）。
    lastMount.stateBeforeActivate = webView.state;
    lastMount.wrappersAtMount = wrappers().length;
    eventLogEpoch = eventLog.filter((e) => e === 'loaded').length;
    hostNode.active = true;
    return webView;
}

function frameStats() {
    const iframe = webView ? webView.nativeWebView : null;
    const domRect = iframe ? iframe.getBoundingClientRect() : null;
    return {
        wrapperCount: wrappers().length,
        iframeCount: iframes().length,
        iframeCenter: domRect
            ? [Math.round(domRect.left + domRect.width / 2), Math.round(domRect.top + domRect.height / 2)]
            : null,
    };
}

/** 只认「本次挂载之后」的 loaded；epoch 由 mountWebView 推进，避免拿到上一实例的残留状态。 */
async function waitLoaded() {
    return waitFor(
        () =>
            webView &&
            webView.state === WebView.EventType.LOADED &&
            eventLog.filter((e) => e === 'loaded').length > eventLogEpoch,
    );
}
async function waitError(epoch) {
    return waitFor(() => errorEvents > epoch, 4000);
}
/**
 * 等 `WebView.update → syncMatrix()` 第一次把 contentSize 写进 wrapper 的 `style.width`。
 * 挂载/重建后的那一瞬，wrapper 还是「未定位 + iframe 固有盒」状态（`position:absolute; bottom:0; left:0`
 * 且宽度 auto ⇒ 300x154），各引擎走到读数那一行时所过的帧数不同 ⇒ 不等稳态就是在测调度时机，
 * 不是在测引擎行为（诊断 r3 的 chromium `p9Unload.finalCenter '150,281'` 即此现场）。
 */
async function waitMatrixSize(size) {
    const want = size[0] + 'px';
    return waitFor(() => {
        const w = wrappers()[0];
        return !!w && w.style.width === want;
    }, 3000);
}

// ---------------------------------------------------------------- 阶段序列
async function runSequence() {
    results.startedAtMs = Math.round(T0);

    // ---- P1 iframe 挂载
    results.p1Mount = {
        wrappersBefore: wrappers().length,
        iframesBefore: iframes().length,
    };
    mountWebView(FINAL_POS, FINAL_SIZE);
    results.p1Mount.stateBeforeActivate = lastMount.stateBeforeActivate;
    results.p1Mount.wrappersAtMount = lastMount.wrappersAtMount;
    const wrapper = wrappers()[0];
    const iframe = webView.nativeWebView;
    results.p1Mount.loadingWithinMs = await waitFor(() => eventLog.includes('loading'), 1000);
    results.p1Mount.loadedWithinMs = await waitLoaded();
    // 几何读数一律排在「第一次 syncMatrix 落地」之后（否则测的是调度时机，见 waitMatrixSize 的注释）
    results.p1Mount.matrixSizeWithinMs = await waitMatrixSize(FINAL_SIZE);
    await nextFrames(2);
    results.p1Mount.mountedWrapperCount = wrappers().length;
    results.p1Mount.mountedIframeCount = iframes().length;
    results.p1Mount.wrapperId = wrapper ? wrapper.id : null;
    results.p1Mount.iframeTag = iframe ? iframe.tagName : null;
    results.p1Mount.iframeId = iframe ? iframe.id : null;
    results.p1Mount.nativeIsSameNode = iframe === document.getElementById('webview');
    results.p1Mount.parentId = wrapper && wrapper.parentElement ? wrapper.parentElement.id : null;
    results.p1Mount.gameContainerId = game.container ? game.container.id : null;
    results.p1Mount.stylePosition = wrapper ? wrapper.style.position : null;
    results.p1Mount.styleBottom = wrapper ? wrapper.style.bottom : null;
    results.p1Mount.styleLeft = wrapper ? wrapper.style.left : null;
    results.p1Mount.styleOrigin = wrapper ? wrapper.style.transformOrigin : null;
    results.p1Mount.iframeStyleBorder = iframe ? iframe.style.border : null;
    results.p1Mount.iframeStyleWH = iframe ? [iframe.style.width, iframe.style.height].join('/') : null;
    results.p1Mount.urlGetter = webView.url;
    results.p1Mount.iframePathname = iframe ? new URL(iframe.src).pathname : null;
    results.p1Mount.iframeSrcHasNoExternalHost = iframe ? !/cocos\.com/.test(iframe.src) : null;
    // r46 加固：与 P9 同款 node 就绪等待——gallery 部署验收长序列下 P1 也观测到一次
    // component.node 为 null 的页错（链/矩阵从未复现，属调度时序敏感）。
    for (let i = 0; i < 30 && !(webView && webView.node && webView.node.getComponent(UITransform)); i++) {
        await nextFrames(1);
    }
    const p1Node = webView && webView.node && webView.node.getComponent(UITransform);
    results.p1Mount.contentSize = p1Node ? [p1Node.width, p1Node.height].join('x') : 'node-not-ready';
    results.p1Mount.stateAfterLoad = webView.state;
    results.p1Mount.wrapperOffsetWH = wrapper ? [wrapper.offsetWidth, wrapper.offsetHeight].join('x') : null;

    // ---- P2 事件链
    results.p2Events = {
        rawEventLogHead: eventLog.slice(0, 4).join(','),
        businessSequence: eventLog.filter((e) => !e.startsWith('cb:')).join(','),
        handlerHits,
        handlerTypes: eventLog.filter((e) => e.startsWith('cb:')).join(','),
        lastHandlerArgsType: lastHandlerArgs ? lastHandlerArgs.type : null,
        lastHandlerArgsCustom: lastHandlerArgs ? lastHandlerArgs.custom : null,
        lastHandlerHasView: lastHandlerArgs ? lastHandlerArgs.hasView : null,
        stateSequence: stateLog.join(','),
        eventListKeys: eventLog.length > 0 ? 'has-events' : 'none',
        // 生命周期钩子确实是 WebView 自己定义的（不是继承来的同名物）：见 `LIFECYCLE_HOOKS` 的逐项回读。
        lifecycleSurface: LIFECYCLE_HOOKS.map(
            (k) =>
                k +
                '=' +
                (Object.prototype.hasOwnProperty.call(WebView.prototype, k) ? 'own' : 'inherited:' + typeof webView[k]),
        ).join(','),
        updateHookCallable: hasUpdateHook(webView),
    };

    // ---- P3 几何由 syncMatrix 驱动（节点变换 → DOM transform）
    await nextFrames(3);
    const before = frameStats();
    const styleBefore = {
        w: wrappers()[0].style.width,
        h: wrappers()[0].style.height,
        t: wrappers()[0].style.transform,
    };
    hostNode.setPosition(-70, -30, 0);
    hostNode.getComponent(UITransform).setContentSize(160, 120);
    await nextFrames(4);
    const after = frameStats();
    const styleAfter = {
        w: wrappers()[0].style.width,
        h: wrappers()[0].style.height,
        t: wrappers()[0].style.transform,
    };
    results.p3Geometry = {
        styleBeforeWH: [styleBefore.w, styleBefore.h].join('/'),
        styleAfterWH: [styleAfter.w, styleAfter.h].join('/'),
        transformChanged: styleBefore.t !== styleAfter.t,
        transformAfterPrefix: String(styleAfter.t).slice(0, 24),
        centerBefore: before.iframeCenter ? before.iframeCenter.join(',') : null,
        centerAfter: after.iframeCenter ? after.iframeCenter.join(',') : null,
        centerMoved:
            !!before.iframeCenter && !!after.iframeCenter && before.iframeCenter.join() !== after.iframeCenter.join(),
    };
    // 复位到最终几何（矩阵的 click 坐标按它算）
    hostNode.setPosition(FINAL_POS[0], FINAL_POS[1], 0);
    hostNode.getComponent(UITransform).setContentSize(FINAL_SIZE[0], FINAL_SIZE[1]);
    await nextFrames(3);
    results.p3Geometry.restoredWH = [wrappers()[0].style.width, wrappers()[0].style.height].join('/');
    results.p3Geometry.finalCenter = frameStats().iframeCenter ? frameStats().iframeCenter.join(',') : null;
    results.p3Geometry.finalWrapperWH = [wrappers()[0].offsetWidth, wrappers()[0].offsetHeight].join('x');

    // ---- P4 evaluateJS：同源脚本注入，双向读写
    const doc0 = webView.nativeWebView.contentDocument;
    results.p4EvalJS = {
        sameOriginDoc: !!doc0,
        pageDatasetReady: doc0 ? String(doc0.body.dataset.ready) : null,
        pageName: doc0 ? String(doc0.body.dataset.page) : null,
        titleBefore: webView.nativeWebView.contentDocument.title,
        clicksBefore: webView.nativeWebView.contentWindow.__clicks,
    };
    webView.evaluateJS(
        "document.title = 'AIR-EVAL-' + (6 * 7); window.__engineStamp = 99; document.body.dataset.fromEngine = 'injected';",
    );
    const doc1 = webView.nativeWebView.contentDocument;
    results.p4EvalJS.titleAfter = doc1.title;
    results.p4EvalJS.stampAfter = String(doc1.defaultView.__engineStamp);
    results.p4EvalJS.datasetAfter = String(doc1.body.dataset.fromEngine);
    results.p4EvalJS.stateAfterEval = webView.state;

    // ---- P5 命中测试与 enabled 开关（穿透行为的静态面）
    const c = frameStats().iframeCenter;
    results.p5HitTest = {
        centerPoint: c ? c.join(',') : null,
        hitWhenEnabled: c ? hitTagAt(c[0], c[1]) : null,
        hitOutsideIframe: hitTagAt(6, 6),
        wrapperVisibilityBeforeDisable: wrappers()[0].style.visibility || 'visible-default',
    };
    const transformBeforeDisable = wrappers()[0].style.transform;
    webView.enabled = false;
    await nextFrames(2);
    results.p5HitTest.visibilityAfterDisable = wrappers()[0].style.visibility;
    results.p5HitTest.hitWhenDisabled = c ? hitTagAt(c[0], c[1]) : null;
    // 隐藏期间移动节点：`syncMatrix` 在 hidden 时早退（web-view-impl-web.ts:139）⇒ DOM transform 不动；
    // 重新启用后必须由下一次 update 追平，否则就是几何错位缺陷（用「只属于旧位置」的点判别）。
    hostNode.setPosition(20, 40, 0);
    await nextFrames(3);
    results.p5HitTest.transformFrozenWhileHidden = wrappers()[0].style.transform === transformBeforeDisable;
    webView.enabled = true;
    await nextFrames(4);
    results.p5HitTest.hitAtNewCenter = hitTagAt(260, 140);
    results.p5HitTest.hitAtOldOnlyPoint = hitTagAt(150, 230);
    results.p5HitTest.transformCaughtUpAfterEnable = wrappers()[0].style.transform !== transformBeforeDisable;
    // 复位必须是本文件最后一处**字面量** setPosition：§12 的 transform-equals 合同按源码里
    // 最后一次字面量赋值取终态几何（中途探测用的 MOVE_A/MOVE_B 走变量，不参与静态推断）。
    hostNode.setPosition(0, 14, 0);
    await nextFrames(4);
    results.p5HitTest.hitBackAtFinalCenter = (() => {
        const p = frameStats().iframeCenter;
        return p ? hitTagAt(p[0], p[1]) : null;
    })();

    // ---- P6 error 事件的真实语义（正文嗅探，HTTP 200）
    const errEventsBefore = errorEvents;
    webView.url = ERROR_LIKE_URL;
    results.p6ErrorBranch = {
        errorWithinMs: await waitError(errEventsBefore),
        errorEvents,
        stateAfterError: webView.state,
        urlAfterError: webView.url,
        errorArgIsArray: Array.isArray(lastErrorArg),
        errorArgMentions404: lastErrorArg ? String(JSON.stringify(lastErrorArg)).includes('404') : null,
        errorArgLen: lastErrorArg ? String(JSON.stringify(lastErrorArg)).length : null,
        loadedStillReportedOnce: eventLog.filter((e) => e === 'loaded').length,
    };
    webView.url = PAGE_URL;
    results.p6ErrorBranch.recoveredState = (await waitLoaded()) >= 0 ? webView.state : 'timeout';
    results.p6ErrorBranch.businessSequenceAfterRecover = eventLog.filter((e) => !e.startsWith('cb:')).join(',');

    // ---- P7 web 端的 no-op API（只 warn，不抛错、不改状态）
    const stateBeforeNoop = webView.state;
    const jsCallbackHits = { n: 0 };
    results.p7WebNoopApis = {
        setJavascriptInterfaceSchemeReturn: String(webView.setJavascriptInterfaceScheme('js://air')),
        setOnJSCallbackReturn: String(
            webView.setOnJSCallback(() => {
                jsCallbackHits.n++;
            }),
        ),
        stateUnchangedAfterNoop: webView.state === stateBeforeNoop,
        jsCallbackFired: jsCallbackHits.n,
        stateAfterNoop: webView.state,
    };

    // ---- P9 卸载 → 重建（wrapper 计数器双向归零）
    const componentRef = webView;
    hostNode.destroy();
    await nextFrames(3);
    results.p9Unload = {
        wrappersAfterDestroy: wrappers().length,
        iframesAfterDestroy: iframes().length,
        nativeWebViewAfterDestroy: String(componentRef.nativeWebView),
        stateAfterDestroy: componentRef.state,
        hitAfterDestroy: hitTagAt(240, 166),
        isValidAfterDestroy: isValid(componentRef),
    };
    mountWebView(FINAL_POS, FINAL_SIZE);
    results.p9Unload.reloadedWithinMs = await waitLoaded();
    // r46 加固：gallery 部署验收长序列下实测一次「重建后 component.node 仍为 null → getComponent
    // 页错」（仅时序敏感，链/矩阵从未复现）。等 node 就绪再读几何——探针契约值不变。
    for (let i = 0; i < 30 && !(webView && webView.node && webView.node.getComponent(UITransform)); i++) {
        await nextFrames(1);
    }
    // 同 P1：重建后的几何读数必须等第一次 syncMatrix 落地（诊断 r3 里 chromium 就是在这里读到未定位的
    // `150,281` —— 那一刻 wrapper 还是 iframe 固有盒，矩阵尚未写过它）
    results.p9Unload.matrixSizeWithinMs = await waitMatrixSize(FINAL_SIZE);
    await nextFrames(2);
    results.p9Unload.wrappersAfterRebuild = wrappers().length;
    results.p9Unload.iframesAfterRebuild = iframes().length;
    results.p9Unload.stateAfterRebuild = webView.state;
    results.p9Unload.hitAfterRebuild = hitTagAt(240, 166);
    results.p9Unload.wrapperCountIsExactlyOne = wrappers().length === 1;
    results.p9Unload.finalCenter = frameStats().iframeCenter ? frameStats().iframeCenter.join(',') : null;
    const p9Node = webView && webView.node && webView.node.getComponent(UITransform);
    results.p9Unload.contentSizeAfterRebuild = p9Node ? [p9Node.width, p9Node.height].join('x') : 'node-not-ready';

    results.phase = 'done';
    results.sequenceComplete = true;
    results.sequenceMs = Math.round(performance.now() - T0);
    status.string = 'webview mounted — clicks land in iframe';
}

// ---------------------------------------------------------------- §25 生命周期合同：真卸载 + 真重建
function heldAssets() {
    return webView ? [{ name: 'webViewComponent', ref: webView }] : [];
}

installAssetLifecycle({
    label: 'webview-basic',
    hold: heldAssets,
    release: async () => {
        hostNode.destroy();
        hostNode = null;
        await nextFrames(3);
    },
    reacquire: async () => {
        mountWebView(FINAL_POS, FINAL_SIZE);
        await waitLoaded();
        return heldAssets();
    },
});

window.__airApp = app;
window.__runSequence = runSequence;
/** 诊断脚本入口（`docs/notes/v12-webview-notes.md` 用它单次取证 `evaluateJS` 的失败路径，示例本身不触发）。 */
window.__webView = () => webView;
window.__assets = () => ({
    wrapperCount: wrappers().length,
    iframeCount: iframes().length,
    state: webView ? webView.state : null,
    url: webView ? webView.url : null,
    held: heldAssets().map((e) => e.name),
});
app.run(scene);

window.__probe = async () => {
    const iframe = webView ? webView.nativeWebView : null;
    const doc = iframe ? iframe.contentDocument : null;
    const domRect = iframe ? iframe.getBoundingClientRect() : null;
    const cx = domRect ? Math.round(domRect.left + domRect.width / 2) : 0;
    const cy = domRect ? Math.round(domRect.top + domRect.height / 2) : 0;
    return {
        summary: status.string,
        phaseKeys: Object.keys(results).filter((k) => k.startsWith('p')).length,
        results,
        eventLog: eventLog.slice(),
        live: {
            state: webView ? webView.state : null,
            wrapperCount: wrappers().length,
            iframeCount: iframes().length,
            hitAtIframeCenter: hitTagAt(cx, cy),
            centerPoint: [cx, cy].join(','),
            domRect: domRect ? [r(domRect.width, 1), r(domRect.height, 1)].join('x') : null,
            wrapperStyleWH: wrappers()[0] ? [wrappers()[0].style.width, wrappers()[0].style.height].join('/') : null,
            iframeClicks: doc ? String(doc.defaultView.__clicks) : null,
            iframeClicksDataset: doc ? String(doc.body.dataset.clicks || '0') : null,
            engineTouchEvents,
            canvasDomClicks,
            url: webView ? webView.url : null,
            iframePathname: iframe ? new URL(iframe.src).pathname : null,
            titleNow: doc ? doc.title : null,
            engineStampNow: doc ? String(doc.defaultView.__engineStamp) : null,
            elapsedMs: Math.round(performance.now() - T0),
        },
    };
};

canvasEl.addEventListener('click', () => {
    canvasDomClicks++;
});

await runSequence();
