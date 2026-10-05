/**
 * bench — V0.5.1 T6 Runtime Baseline 测量页（examples/shared，非示例：示例发现排除 shared/）。
 *
 * 指标口径（计划书 §8，页面内标记全部用 performance.now()）：
 *  - startup        ：本模块脚本起点 → createAirApp resolve；
 *  - scene ready    ：app.run(scene) 调用 → runSceneImmediate 返回（场景激活完成，同步）；
 *  - first visible  ：scene ready → 首次画面满足已知条件（画布中心像素 ≠ 清屏色）的渲染帧，
 *                     以 readPixels 判定（不以 rAF 到达代替）；
 *  - asset load     ：GLTFLoader 公开入口（fetch bytes → parseAsync）；冷缓存 no-store、
 *                     热缓存同 bytes 重复 parse 分开报告；
 *  - debug overhead ：同一场景同一操作序列（inspectScene/inspectNode ×N）面板开/关对比；
 *  - memory         ：performance.memory（不可用则记 unavailable）。
 *
 * 页面在 window.__benchReady 上暴露结果，供 tools/verify/runtime-baseline.cjs 采集。
 */
import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    DirectionalLight,
    Layers,
    Vec3,
    Color,
    utils,
    primitives,
    builtinResMgr,
} from 'cocosair';

const t0 = performance.now();
const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;

const app = await createAirApp({ canvas });
const tStartup = performance.now() - t0;

// 最小场景（与 hello-cube 同构：Camera + DirectionalLight + Cube）
const scene = new Scene('bench');
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2, 6));
cameraNode.setRotationFromEuler(-15, 0, 0);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 10, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
(lightNode.addComponent(DirectionalLight) as { illuminance: number }).illuminance = 50000;
const cube = new Node('Cube');
cube.layer = Layers.Enum.DEFAULT;
scene.addChild(cube);
const renderer = cube.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
renderer.material = builtinResMgr.get('builtin-standard-material');

app.run(scene);
(window as unknown as { __airApp: unknown }).__airApp = app; // 面板显式绑定（不猜测隐藏状态）
const tSceneReady = performance.now();

// ---- first visible frame：readPixels 判定画面条件（中心出现非清屏色前景）----
const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext;
const firstFrame = await new Promise<number>((resolve, reject) => {
    const deadline = performance.now() + 15000;
    const poll = (): void => {
        const pixels = new Uint8Array(4);
        gl.readPixels(
            Math.floor(canvas.width / 2),
            Math.floor(canvas.height / 2),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixels,
        );
        const bg = [30, 40, 60]; // clearColor
        const isForeground =
            Math.abs(pixels[0] - bg[0]) + Math.abs(pixels[1] - bg[1]) + Math.abs(pixels[2] - bg[2]) > 24;
        if (isForeground) {
            resolve(performance.now());
            return;
        }
        if (performance.now() > deadline) {
            reject(new Error('first visible frame timeout'));
            return;
        }
        requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
});
const tFirstVisible = firstFrame - tSceneReady;

// ---- asset load：冷/热缓存分开（官方字节校验副本 BoxTextured.glb）----
const { GLTFLoader } = await import('cocosair');
const assetUrl = '/gltf-viewer/assets/BoxTextured.glb';
const coldRuns: number[] = [];
for (let i = 0; i < 5; i++) {
    const response = await fetch(`${assetUrl}?cold=${i}`, { cache: 'no-store' });
    const bytes = await response.arrayBuffer();
    const loader = new GLTFLoader();
    const start = performance.now();
    const asset = await loader.parseAsync(bytes);
    coldRuns.push(performance.now() - start);
    asset.destroy();
    await new Promise((r) => setTimeout(r, 20));
}
const warmBytes = (await fetch(assetUrl, { cache: 'no-store' })).clone();
const warmBuffer = await warmBytes.arrayBuffer();
const warmRuns: number[] = [];
for (let i = 0; i < 5; i++) {
    const loader = new GLTFLoader();
    const start = performance.now();
    const asset = await loader.parseAsync(warmBuffer.slice(0));
    warmRuns.push(performance.now() - start);
    asset.destroy();
    await new Promise((r) => setTimeout(r, 20));
}

// ---- debug overhead：同一操作序列，面板关/开 ----
const panelModule = await import('/__debug/panel.js');
const ops = (session: { inspectScene(): unknown; inspectNode(id: string): unknown }, rootId: string): number => {
    const start = performance.now();
    for (let i = 0; i < 50; i++) {
        session.inspectScene();
        session.inspectNode(rootId);
    }
    return performance.now() - start;
};
const probe = panelModule.createDebugPanel({}); // 先建一个 probe session 用于拿到 rootId 形态
const rootNodeId = probe.session
    .inspectScene()
    .nodes.map((n: { id: string; name: string }) => n)
    .find((n: { name: string }) => n.name === 'Cube')?.id as string;
const opsOff1 = ops(probe.session, rootNodeId);
probe.close(); // 面板完全关闭（DOM/rAF/session 清理）

const panel = panelModule.createDebugPanel({});
const sessionOn = panel.session;
const opsOn1 = ops(sessionOn, rootNodeId);
// 面板开着时再测一组：包含面板自身自动刷新在跑的稳态
await new Promise((r) => setTimeout(r, 2000));
const opsOn2 = ops(sessionOn, rootNodeId);
const fpsOn = await new Promise<number>((resolve) => {
    let frames = 0;
    const start = performance.now();
    const count = (): void => {
        frames++;
        if (performance.now() - start < 2000) {
            requestAnimationFrame(count);
        } else {
            resolve((frames * 1000) / (performance.now() - start));
        }
    };
    requestAnimationFrame(count);
});
panel.close();
const fpsOff = await new Promise<number>((resolve) => {
    let frames = 0;
    const start = performance.now();
    const count = (): void => {
        frames++;
        if (performance.now() - start < 2000) {
            requestAnimationFrame(count);
        } else {
            resolve((frames * 1000) / (performance.now() - start));
        }
    };
    requestAnimationFrame(count);
});

const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;

(window as unknown as { __benchReady: unknown }).__benchReady = {
    startupMs: tStartup,
    sceneReadyMs: tSceneReady - t0 - tStartup, // run() 调用→返回（同步激活）
    sceneReadyFromT0Ms: tSceneReady - t0,
    firstVisibleFrameMs: tFirstVisible,
    assetColdMs: coldRuns,
    assetWarmMs: warmRuns,
    debugOverhead: {
        opsOffMs: opsOff1,
        opsOnMs: [opsOn1, opsOn2],
        fpsOff,
        fpsOn,
    },
    memory: mem ? { usedJSHeapSize: mem.usedJSHeapSize } : 'unavailable',
    ua: navigator.userAgent.slice(0, 120),
    webgl2: !!gl.getParameter && /webgl2/i.test(String(gl.getParameter(gl.VERSION))),
};
