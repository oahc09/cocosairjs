# Asset Loading and Lifetime 资源加载与生命周期

> **状态：FULL（能力）/ 本篇为统一叙述入口。** 官方 [asset/dynamic-load-resources] 与
> [asset/release-manager] 讲资源加载与释放；AIR 的 Code First 形态下入口有三个——
> 全局 `loadAssetAsync`、`assetManager`、`GLTFLoader`——本篇写清各自的适用边界、
> 失败路径、引用计数与释放语义（示例 `manual-asset-lifecycle`，9 条断言自证）。
> 局部片段见 [Load a .GLTF file](./load-gltf.md)、[Textures](./textures.md)、[Freeing Resources](./cleanup.md)。

## 三个加载入口的适用边界（AIR 实测）

| 入口                           | 形态                                                                                                             | 适用                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `loadAssetAsync(url)`          | HTTP 拉取 → 引擎 `deserialize`（非序列化格式回退纯 JSON）                                                        | Code First 加载运行时 JSON/文本资产文件；失败按 HTTP 状态拒绝                                                   |
| `loadAssetAsync(path, type)`   | `assetManager.resources` bundle 可用则走 resources.load；否则按 **path 为键**查 `assetManager.assets` 全局注册表 | Creator 工程形态与 Code First 注册表形态；未命中/类型不符 → 拒绝（消息含 not found）                            |
| `GLTFLoader().loadAsync(path)` | glTF/GLB 解析 → `GLTFAsset`；`loadAssetAsync` 对 `.gltf/.glb` 路径自动路由到这里                                 | 3D 模型；加载、instantiate、释放链路见 [examples/runtime-asset-release/](../../examples/runtime-asset-release/) |

失败路径两条（实测拒绝消息）：

- HTTP 失败：`loadAssetAsync('assets/does-not-exist.json')` → Promise 拒绝，
  消息 `[cocosair] loadAssetAsync failed: <url> (<status>)`（示例实跑 404 分支，浏览器网络日志豁免在案）。
- 注册表未命中：`loadAssetAsync('no/such/path', Texture2D)` → 拒绝，
  消息含 `not found`，并提示用 `assetManager.assets.add(path, asset)` 注册。

## 生命周期语义（示例逐条断言）

1. **缓存命中**：`assetManager.assets.add(path, tex)` 后 `loadAssetAsync(path, Texture2D)`
   返回**同一实例**——注册表即缓存。
2. **destroy() 帧末生效**：`texture.destroy()` 当帧 `isValid` 仍真，下一拍才翻假
   （与组件销毁同一套延迟语义，见 [Component Lifecycle](./component-lifecycle.md)）。
3. **已销毁资产仍会被注册表交出**（缓存隐患）：销毁后 `loadAssetAsync(path, type)` 照样返回旧实例——
   使用前必须 `isValid(asset)` 自查。
4. **清键**：`assetManager.assets.remove(path)` 后 `get` 返回空——重载前先清键，
   否则 `add` 同键会撞上已销毁实例。
5. **重载**：重建资产重注册同键 → 加载回**全新实例**（`isValid` 真、与旧实例引用不同）。

## 手册示例：manual-asset-lifecycle

零外部资产依赖之外仅带两个自写的 manifest JSON（`assets/air-manifest*.json`，程序化生成、无第三方许可面）。
异步序列跑完六拍：URL 成功加载（绿）→ 注册表往返 → 404 拒绝 → 注册表未命中 → 销毁/自查/清键 →
重载（琥珀，立方体颜色随 manifest 切换，视觉可辨）。断言经 `window.__manualProbe()` 暴露；
故意失败请求的日志仅在本例、`/assets/does-not-exist.json` 路径和 HTTP 404 三项同时匹配时豁免；其余网络或运行错误仍判红。规则见验证器的 `isAllowedNetworkError`。

`index.html`（逐字节与 `docs/manual/examples/manual-asset-lifecycle/index.html` 一致）：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Asset Loading and Lifetime — 资源加载与生命周期（docs/manual/asset-loading-and-lifetime.md）</title>
        <style>
            html,
            body {
                margin: 0;
                padding: 0;
                width: 100%;
                height: 100%;
                overflow: hidden;
                background: #fff;
            }
            #GameDiv {
                width: 100%;
                height: 100%;
            }
            #Cocos3dGameContainer {
                width: 100%;
                height: 100%;
            }
            #GameCanvas {
                width: 100%;
                display: block;
                height: 100%;
            }
            #info {
                position: absolute;
                left: 8px;
                top: 8px;
                z-index: 10;
                font:
                    12px/1.6 ui-monospace,
                    Consolas,
                    monospace;
                color: #e8eef7;
                background: rgba(10, 16, 26, 0.78);
                padding: 6px 10px;
                border-radius: 4px;
                white-space: pre;
            }
        </style>
        <script type="importmap">
            { "imports": { "cocosair": "/build/cocosair.module.js" } }
        </script>
    </head>
    <body>
        <!-- 官方模板 DOM 结构：pal/screen-adapter 依赖这些 id 做全屏适配 -->
        <div id="GameDiv">
            <div id="Cocos3dGameContainer">
                <!-- #GameCanvas 必须在引擎 import 前存在（pal/screen-adapter 为模块顶层单例） -->
                <canvas id="GameCanvas"></canvas>
            </div>
        </div>
        <div id="info">loading…</div>
        <script type="module" src="./main.ts"></script>
    </body>
</html>
```

`main.ts`（逐字节与 `docs/manual/examples/manual-asset-lifecycle/main.ts` 一致）：

```ts
/**
 * Cocos AIR 开发手册 — Asset Loading and Lifetime（资源加载与生命周期）
 * 配套文章：docs/manual/asset-loading-and-lifetime.md
 *
 * loadAssetAsync 三种形态 + 注册表生命周期的连续实测（异步序列，wait 分拍）：
 *  1) 成功：loadAssetAsync(url) 拉取本例 assets/air-manifest.json（deserialize 失败回退纯 JSON）；
 *  2) 注册表往返：assetManager.assets.add(path, tex) → loadAssetAsync(path, Texture2D) 命中同一实例；
 *  3) 失败·HTTP：加载不存在的 URL → fetch 404 → Promise 拒绝（消息含状态码）；
 *  4) 失败·注册表未命中：loadAssetAsync(path, type) 无此键 → 拒绝（消息含 not found）；
 *  5) 释放：texture.destroy() 后 isValid 翻假；注册表仍交出已销毁实例（必须用 isValid 自查，
 *     再 assets.remove 清键，否则缓存会把已销毁资产复用给后续加载）；
 *  6) 重载：重建纹理重注册同键 → 加载回全新实例（isValid 真、与旧实例不同），
 *     并按新 manifest 切换立方体颜色（视觉面：绿→琥珀）。
 * 立方体持续自旋兜底 frame-diff。断言经 window.__manualProbe() 读回（9 条）。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    Component,
    Layers,
    Vec3,
    Color,
    utils,
    primitives,
    Texture2D,
    ImageAsset,
    assetManager,
    loadAssetAsync,
    isValid,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('asset-lifecycle');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(3.4, 2.8, 5.6));
cameraNode.lookAt(new Vec3(0, 0.6, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 22, 30, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 方向光 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2;

// ---- 被试立方体：颜色由加载到的 manifest 驱动（绿→琥珀的视觉面） ----
const cubeNode = new Node('Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
scene.addChild(cubeNode);
const cubeRenderer = cubeNode.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1.4, height: 1.4, length: 1.4 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(95, 205, 120, 255));
cubeRenderer.material = cubeMaterial;

class Spinner extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 40, 0);
    }
}
cubeNode.addComponent(Spinner);

// ---- 观测与断言 ----
type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];
const expect = (name: string, pass: boolean, detail: string): void => {
    checks.push({ name, pass, detail });
};

let phase = 'p1-url-load';
let done = false;
let seqError = '';

const info = document.querySelector('#info') as HTMLElement;
function showInfo(): void {
    info.textContent = [
        `asset-lifecycle: ${phase}${done ? ' (done)' : ''}`,
        `checks: ${checks.filter((c) => c.pass).length}/${checks.length} pass`,
        ...checks.map((c) => `${c.pass ? ' PASS' : ' FAIL'} ${c.name} | ${c.detail}`),
    ].join('\n');
}

const wait = (s: number): Promise<void> => new Promise((r) => setTimeout(r, s * 1000));
function makeTexture(cssColor: string): Texture2D {
    const cvs = document.createElement('canvas');
    cvs.width = 16;
    cvs.height = 16;
    const ctx = cvs.getContext('2d') as CanvasRenderingContext2D;
    ctx.fillStyle = cssColor;
    ctx.fillRect(0, 0, 16, 16);
    const tex = new Texture2D();
    tex.image = new ImageAsset(cvs);
    return tex;
}
function setCube(cssColor: string): void {
    const [r, g, b] = [
        parseInt(cssColor.slice(1, 3), 16),
        parseInt(cssColor.slice(3, 5), 16),
        parseInt(cssColor.slice(5, 7), 16),
    ];
    cubeMaterial.setProperty('mainColor', new Color(r, g, b, 255));
}

async function runSequence(): Promise<void> {
    // P1 成功：URL 拉取 + deserialize（非序列化格式回退纯 JSON）
    phase = 'p1-url-load';
    const manifest = (await loadAssetAsync('assets/air-manifest.json')) as Record<string, unknown>;
    expect(
        'p1-url-json-load',
        manifest && manifest.name === 'manual-asset-lifecycle' && manifest.items === 3,
        `name=${manifest && manifest.name} items=${manifest && manifest.items}`,
    );
    setCube(String(manifest.tone || '#5fcd78'));
    showInfo();
    await wait(0.9);

    // P2 注册表往返：add 后按 (path, type) 加载命中同一实例
    phase = 'p2-registry-roundtrip';
    const texGreen = makeTexture('#3a8f4e');
    assetManager.assets.add('gen/tex', texGreen);
    const hit = (await loadAssetAsync('gen/tex', Texture2D)) as Texture2D;
    expect(
        'p2-cache-hit-same-instance',
        hit === texGreen && isValid(hit),
        `same=${hit === texGreen} isValid=${isValid(hit)}`,
    );
    showInfo();
    await wait(0.9);

    // P3 失败·HTTP：不存在的 URL → 404 拒绝
    phase = 'p3-http-404';
    let http404 = '';
    try {
        await loadAssetAsync('assets/does-not-exist.json');
    } catch (e) {
        http404 = String((e as Error).message || e);
    }
    expect('p3-404-rejected', /404|failed/.test(http404), http404.slice(0, 90));
    showInfo();
    await wait(0.9);

    // P4 失败·注册表未命中
    phase = 'p4-registry-miss';
    let miss = '';
    try {
        await loadAssetAsync('no/such/tex', Texture2D);
    } catch (e) {
        miss = String((e as Error).message || e);
    }
    expect('p4-not-found-rejected', /not found/.test(miss), miss.slice(0, 90));
    showInfo();
    await wait(0.9);

    // P5 释放：destroy 后 isValid 翻假；注册表仍交出已销毁实例 → 必须自查 + remove 清键
    phase = 'p5-release';
    texGreen.destroy();
    await wait(0.15); // destroy() 帧末才真正销毁：等一拍再读 isValid（同帧读仍是 true）
    const stale = (await loadAssetAsync('gen/tex', Texture2D)) as Texture2D;
    expect(
        'p5-destroyed-invalid',
        isValid(texGreen) === false && texGreen.isValid === false,
        `isValid()=${isValid(texGreen)} .isValid=${texGreen.isValid}`,
    );
    expect(
        'p5-stale-cache-hazard',
        stale === texGreen && !isValid(stale),
        `registry still returned the destroyed instance: same=${stale === texGreen} valid=${isValid(stale)}`,
    );
    assetManager.assets.remove('gen/tex');
    expect(
        'p5-key-removed',
        assetManager.assets.get('gen/tex') === undefined || assetManager.assets.get('gen/tex') === null,
        `after remove: ${String(assetManager.assets.get('gen/tex'))}`,
    );
    showInfo();
    await wait(0.9);

    // P6 重载：重建纹理重注册同键 → 全新实例；manifest-alt 驱动琥珀色（视觉面）
    phase = 'p6-reload';
    const alt = (await loadAssetAsync('assets/air-manifest-alt.json')) as Record<string, unknown>;
    const texAmber = makeTexture('#c8871e');
    assetManager.assets.add('gen/tex', texAmber);
    const reloaded = (await loadAssetAsync('gen/tex', Texture2D)) as Texture2D;
    expect(
        'p6-fresh-instance',
        reloaded === texAmber && reloaded !== texGreen && isValid(reloaded) === true,
        `same-as-new=${reloaded === texAmber} differs-old=${reloaded !== texGreen} isValid=${isValid(reloaded)}`,
    );
    expect(
        'p6-alt-manifest',
        alt && alt.tone === 'amber' && alt.items === 5,
        `tone=${alt && alt.tone} items=${alt && alt.items}`,
    );
    setCube(String(alt.tone || '#c8871e'));
    done = true;
    phase = 'done';
    showInfo();
}

runSequence().catch((e) => {
    seqError = String((e as Error).message || e).slice(0, 200);
    console.error('[asset-lifecycle] sequence error', e);
    done = true;
    showInfo();
});

window.__airApp = app;
window.__manualProbe = () => ({
    ready: done,
    ok: done && !seqError && checks.length > 0 && checks.every((c) => c.pass),
    name: 'asset-lifecycle',
    phase,
    driverError: seqError,
    checks: [...checks],
});
app.run(scene);

console.log('[manual/asset-lifecycle] running on cocosair');
```

运行：`npm run dev` 后访问 `http://127.0.0.1:7454/manual/examples/manual-asset-lifecycle/`；
或 `NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-asset-lifecycle`。

## 已验证的主示例深链

- [examples/runtime-asset-release/](../../examples/runtime-asset-release/)——GLTFAsset 加载/释放/重载全链路
  （`window.__lifecycle` 读回 released/leaked/reloaded）。
- [examples/gltf-viewer/](../../examples/gltf-viewer/)——URL 参数驱动的模型加载与剪辑播放。
- [examples/audio-basic/](../../examples/audio-basic/)——`assetManager.loadRemote` 拉取音频并构建运行时 `AudioClip`。

## 下一步

- 组件销毁与资源释放的关系：[Freeing Resources 释放资源](./cleanup.md)、[How to dispose of Objects](./how-to-dispose-of-objects.md)
- 场景切换（`director.loadScene`）：[Multiple Canvases, Multiple Scenes](./multiple-scenes.md)

---

上一篇：[Input and Events 输入与事件](./input-and-events.md) ｜ 下一篇：[2D/UI 快速上手](./2d-ui.md)
