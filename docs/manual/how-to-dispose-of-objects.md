# 销毁对象（How to dispose of Objects）

> 对象不用了怎么把 GPU/内存真正还回去。
> 配套可运行示例：[`examples/manual-dispose-objects/`](examples/manual-dispose-objects/)（生长/排空循环同页演示 NodePool 回收、`destroy()` 真销毁、资产引用计数三条路径）。

核心警告：JS 的 GC 不管 GPU 内存，资产不用了必须自己还。AIR 的对象模型是 Cocos 式 **节点/组件 + 资产** 双层：
节点侧靠 `destroy()` 与 `NodePool`，资产侧靠引用计数（`addRef` / `decRef`）与 `assetManager.releaseAsset`。
两层**生命周期独立**，分开管。

## 1. 三条路径与 API 面

| 路径     | API                                                                            | d.ts                                | 语义                                                                                  |
| -------- | ------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------- |
| 回收复用 | `NodePool`：`size()` / `put(node)` / `get(...)` / `clear()`                    | 26643 起（26672/26677/26690/26700） | 节点摘离场景进池，`get` 再挂回；**不触发 destroy**，组件状态保留                      |
| 真销毁   | `node.destroy()`（`CCObject.destroy`）                                         | 185 / 517                           | **延迟到帧末**生效；当帧内 `isValid` 仍为 true，下一周期读回才为 false（实测，§2）    |
| 资产释放 | `Asset.addRef()` / `decRef()` / `refCount`；`assetManager.releaseAsset(asset)` | 23006 / 23017 / 22994 / 24477       | 引用计数归零可自动释放；`releaseAsset` 直接销毁资产（**不在缓存里也照毁**，实测，§2） |

示例的排空分支把前两条路径交替跑：

```ts
            if (this._tick % 2 === 0) {
                pool.put(node); // 回收复用：不 destroy
            } else {
                node.destroy(); // 真销毁：帧末生效
                destroyedTotal++;
                lastDestroyed = node;
            }
```

取回时池优先、无池才新建：

```js
            const node = pool.size() > 0 ? pool.get() : makeCube();
            if (!node.parent) scene.addChild(node);
            node.active = true;
```

## 2. 实测读数（覆盖层探针 dump，t≈9s）

```
dispose: NodePool put/get + node.destroy() + assetManager.releaseAsset
alive: 2  pooled: 2  spawned: 5  destroyed: 1  phase: drain
texture refCount: base=0 addRef→1 decRef→0
after releaseAsset: isValid=false (ok)
lastDestroyed.isValid (read next cycle): false
```

四条实测结论：

- **新建未入缓存的资产 `refCount` 从 0 起**（base=0），`addRef`/`decRef` 对称回到 0——
  与"加载来的资产 refCount≥1"的直觉不同，手工 `new Texture2D()` 的资产要自己管计数。
- **`releaseAsset` 对不在缓存里的资产同样执行销毁**（`isValid=false`，无异常）——
  它不是"仅移缓存"的温和操作，别拿它当 `map.delete` 用。
- **`destroy()` 帧末生效**：销毁当周期 `isValid` 仍 true，下一周期读回 `false`——
  依赖"销毁后立刻不可见"的逻辑要跨帧判断。
- **NodePool 计数与场景节点数互补**（alive 2 + pooled 2 + destroyed 1 = spawned 5），回收路径零新建。

## 3. 共享资产是节点销毁的前提

示例里 `cubeMesh` 与 `cubeMaterial` **全例共享**，节点随便 destroy/pool 不牵动它们：

```js
const cubeMesh = utils.createMesh(primitives.box({ width: 0.9, height: 0.9, length: 0.9 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(95, 205, 120, 255));
```

反过来：**每个节点私有一份 Material/Texture 的写法，节点 destroy 并不会释放那份资产**
（资产生命周期独立于节点）——那才是 AIR 里需要手动归还资产的责任区：
私有资产不用时 `decRef()` 归零或 `assetManager.releaseAsset()`。共享优先、私有必还，是本页的总原则。

## 4. 资源回收要点

- AIR 的清理面分两层：节点侧一个 `destroy()` 覆盖组件树，资产侧走引用计数——**没有逐 geometry 的 dispose 调用面**。
- 对象池是引擎内置的：`NodePool` 且带 `poolHandlerComp` 钩子（unuse/reuse 回调，d.ts 26648），
  高频生成物（子弹/特效）应优先池化。
- **没有**图形上下文级的清理入口；上下文生命周期随 `createAirApp` / 页面，用户代码不碰。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-dispose-objects        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-dispose-objects/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-dispose-objects
```

示例目录：`docs/manual/examples/manual-dispose-objects/`。
验证器 4/4：`app-contract` / `visible-frame` / `no-runtime-error` / `frame-diff` 全 PASS（3.7s，子集运行 partial；
立方体自转 40°/s 保证双帧不同）；截图 `docs/evidence/examples/manual-dispose-objects.png`（排空中段，画面 2 颗 cube 与 alive=2 自洽）。
覆盖层探针 dump 见 §2（含 9s 延迟读取的 destroy 读回）。

## 附：示例源码（逐字）

`examples/manual-dispose-objects/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Dispose Objects — 销毁对象（docs/manual/how-to-dispose-of-objects.md）</title>
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

`examples/manual-dispose-objects/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — How to dispose of Objects（销毁对象）
 * 配套文章：docs/manual/how-to-dispose-of-objects.md
 *
 * 三条销毁路径同页演示：
 *  1) NodePool 回收复用（put/get，不触发 destroy）；
 *  2) node.destroy() 真销毁（延迟到帧末，isValid 下一周期读回为 false）；
 *  3) 资产侧 assetManager.releaseAsset + addRef/decRef 引用计数（一次性纹理实测）。
 * 立方体自转保证任意 400ms 双帧不同（frame-diff）。
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
    NodePool,
    ImageAsset,
    Texture2D,
    assetManager,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('dispose-objects');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(3.0, 3.2, 6.2));
cameraNode.lookAt(new Vec3(0, 1.2, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 22, 30, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一盏方向光 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2;

// ---- 立方体工厂（mesh 与 material 全例共享：节点销毁不牵动共享资产） ----
const cubeMesh = utils.createMesh(primitives.box({ width: 0.9, height: 0.9, length: 0.9 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(95, 205, 120, 255));
let spawned = 0;
function makeCube(): Node {
    const node = new Node(`Cube-${spawned++}`);
    node.layer = Layers.Enum.DEFAULT;
    scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = cubeMesh;
    renderer.material = cubeMaterial;
    node.addComponent(Spinner);
    return node;
}

class Spinner extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 40, 0);
    }
}

// ---- 资产侧实测：引用计数 + releaseAsset ----
const throwaway = new Texture2D();
throwaway.image = new ImageAsset({
    width: 4,
    height: 4,
    _data: new Uint8Array(4 * 4 * 4),
    _compressed: false,
    format: Texture2D.PixelFormat.RGBA8888,
});
const refBase = throwaway.refCount;
throwaway.addRef();
const refAdded = throwaway.refCount;
throwaway.decRef();
const refBack = throwaway.refCount;
let releaseNote = 'ok';
try {
    assetManager.releaseAsset(throwaway);
} catch (e) {
    releaseNote = `throw: ${String((e && e.message) || e).slice(0, 60)}`;
}

// ---- 回收池 + 生长/排空循环 ----
const pool = new NodePool();
const alive: Node[] = [];
let destroyedTotal = 0;
let lastDestroyed: Node | null = null;
let lastDestroyedValid = 'n/a';
let phase = 'grow';

class Cycler extends Component {
    private _t = 0;
    private _tick = 0;
    constructor() {
        super();
        this._t = 0;
        this._tick = 0;
    }
    update(dt: number): void {
        this._t += dt;
        if (this._t < 1.2) return;
        this._t = 0;
        this._tick++;
        if (lastDestroyed) {
            lastDestroyedValid = String(lastDestroyed.isValid);
        }
        if (phase === 'grow') {
            const node = pool.size() > 0 ? pool.get() : makeCube();
            if (!node.parent) scene.addChild(node);
            node.active = true;
            node.setPosition(new Vec3((alive.length - 2) * 1.4, 0.9, 0));
            alive.push(node);
            if (alive.length >= 5) phase = 'drain';
        } else {
            const node = alive.shift() as Node;
            if (this._tick % 2 === 0) {
                pool.put(node); // 回收复用：不 destroy
            } else {
                node.destroy(); // 真销毁：帧末生效
                destroyedTotal++;
                lastDestroyed = node;
            }
            if (alive.length <= 1) phase = 'grow';
        }
        showDispose();
    }
}

// ---- 覆盖层 ----
const info = document.querySelector('#info') as HTMLElement;
function showDispose(): void {
    info.textContent = [
        'dispose: NodePool put/get + node.destroy() + assetManager.releaseAsset',
        `alive: ${alive.length}  pooled: ${pool.size()}  spawned: ${spawned}  destroyed: ${destroyedTotal}  phase: ${phase}`,
        `texture refCount: base=${refBase} addRef→${refAdded} decRef→${refBack}`,
        `after releaseAsset: isValid=${throwaway.isValid} (${releaseNote})`,
        `lastDestroyed.isValid (read next cycle): ${lastDestroyedValid}`,
    ].join('\n');
}
cameraNode.addComponent(Cycler);
showDispose();

window.__airApp = app;
app.run(scene);

console.log('[manual/dispose-objects] running on cocosair');
```

---

上一篇：[创建 VR 内容（How to create VR content）](how-to-create-vr-content.md) ｜ 下一篇：[每帧更新（How to update Things）](how-to-update-things.md)
