# WebGL Compatibility Check WebGL 兼容性检查

> 当前支持范围（2026-09-30）：浏览器渲染要求 WebGL 2；WebGL 1 已正式退役。启动不可用时返回 `WEBGL2_REQUIRED`，不会回退到空渲染设备。详见 [支持策略](../webgl2-only.md)。


> 在跑渲染之前，先问清楚当前环境到底支持什么、支持到什么程度。
> Cocos AIR 里这件事分**三层**，缺一不可：浏览器原生能力（`canvas.getContext('webgl2')`）、引擎枚举（`gfx.API.*` 的数值）、以及**引擎实际跑在哪个后端 + 硬件上限**（`device.constructor.name` + `device.capabilities`）。
> 本篇给一个只做检测、不渲染花哨内容的页面，把三层全部问出来打到覆盖层，并解释为什么不能只看 `gfx.API`。

> 前置阅读：[Installation 安装与引入](./installation.md) §5

## 概念要点

| Cocos AIR                                                 | 说明                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| `!!canvas.getContext('webgl2')`                           | 浏览器原生探针，不经过引擎                                       |
| `device.capabilities.maxTextureSize`                      | 注意是 `capabilities`，**不是** `caps`                           |
| `device.numDrawCalls` / `numTris` / `capabilities`        | 见 [Drawing Lines](./drawing-lines.md) 成本对照                  |
| `device.constructor.name`（`WebGL2Device` / WebGPU 设备） | `game.renderType` 在 AIR 里是 `-1`，**不可用**，判后端看设备类名 |

## 1. 三层检测

**第一层：浏览器原生能力。** 不经过引擎，直接问 DOM：

```js
const probeCanvas = document.createElement('canvas');
const nativeGL2 = safe(() => !!probeCanvas.getContext('webgl2'), false);
```

**第二层：引擎枚举。** `gfx.API` 是"有哪些后端可选"的定义，不是"当前用了哪个"：

```js
const apiWebgl2 = safe(() => gfx.API.WEBGL2, 'n/a');
const apiWebgpu = safe(() => gfx.API.WEBGPU, 'n/a');
```

**第三层：实际后端 + 硬件上限。** 这才是"当前设备到底能干什么"：

```ts
const device = safe(() => director.root && director.root.device, null);
const caps: Record<string, any> = safe(() => device && device.capabilities, {}) || {};
const cap = (k: string) => (caps[k] === undefined ? 'n/a' : caps[k]);
```

把三层拼进覆盖层：

```ts
    '--- WebGL compatibility check ---',
    `native canvas.getContext('webgl2'): ${nativeGL2}`,
    `gfx.API.WEBGL2=${apiWebgl2}  gfx.API.WEBGPU=${apiWebgpu}`,
    `active device: ${safe(() => device.constructor.name, 'n/a')}`,
    `sys: ${sys.platform} / ${sys.browserType} / ${sys.os} / mobile=${sys.isMobile}`,
    `maxTextureSize=${cap('maxTextureSize')}  maxColorRenderTargets=${cap('maxColorRenderTargets')}`,
    `maxVertexAttributes=${cap('maxVertexAttributes')}  dpr=${screen.devicePixelRatio}`,
    `caps keys: ${Object.keys(caps).join(',')}`,
].join('\n');
```

## 2. 本页实测输出

在 Chromium（SwiftShader 软件光栅）下，覆盖层实测为：

```text
--- WebGL compatibility check ---
native canvas.getContext('webgl2'): true
gfx.API.WEBGL2=7  gfx.API.WEBGPU=8
active device: WebGL2Device
sys: DESKTOP_BROWSER / chrome / Windows / mobile=false
maxTextureSize=16384  maxColorRenderTargets=0
maxVertexAttributes=16  dpr=1
caps keys: maxVertexAttributes,maxVertexUniformVectors,maxFragmentUniformVectors,maxTextureUnits,maxImageUnits,maxVertexTextureUnits,maxColorRenderTargets,maxShaderStorageBufferBindings,maxShaderStorageBlockSize,maxUniformBufferBindings,maxUniformBlockSize,maxTextureSize,maxCubeMapTextureSize,maxArrayTextureLayers,max3DTextureSize,uboOffsetAlignment,maxComputeSharedMemorySize,maxComputeWorkGroupInvocations,maxComputeWorkGroupSize,maxComputeWorkGroupCount,supportQuery,supportVariableRateShading,supportSubPassShading,clipSpaceMinZ,screenSpaceSignY,clipSpaceSignY
```

三个读法要点：

1. **`native ... webgl2: true` 但 `active device: WebGL2Device` 才是结论。** 前者只说明浏览器"能"开 WebGL2 上下文；后者说明引擎"确实"跑在 WebGL2 后端上。两者都可能与预期不符（例如浏览器支持但引擎因 `renderMode` 走了 headless）。
2. **`maxColorRenderTargets=0` 是软件光栅的真实上报**，不是引擎 bug。MRT（多渲染目标，GBuffer/后处理依赖它）在这种环境不可用；做后处理前先读它（见 [Post Processing 后处理](./post-processing.md)）。
3. **`sys.browser` 不存在**，用 `sys.browserType` / `sys.browserVersion`；`sys.platform` / `sys.os` / `sys.isMobile` 才是平台判断的正路。

## 3. 什么时候该做这个检查

- **上线前 gate**：把本页的输出贴进 CI/发布记录，作为"目标环境能力基线"。
- **降级决策**：`maxColorRenderTargets`、`maxTextureSize`、`supportVariableRateShading` 等直接决定要不要开后处理/大贴图/VRS。
- **排障第一站**：用户报"黑屏/花屏"时，先让他跑本页，三层输出能立刻区分"浏览器不支持""引擎走了别的后端""硬件上限不够"三种完全不同的病因。

## 运行示例

```bash
npm run dev
# → http://127.0.0.1:7454/manual/examples/manual-webgl-compat/
```

示例工程：`docs/manual/examples/manual-webgl-compat/`（index.html + main.ts，零外部资产；一个橙色参照 cube + 地面保证画面非空）。
验证记录：`docs/evidence/manual-examples-verified.json` 中 `manual-webgl-compat`（`app-contract` / `visible-frame` / `no-runtime-error` PASS，3.3s；本页静止，不参与 `frame-diff`），截图 `docs/evidence/examples/manual-webgl-compat.png`。

## 完整 index.html

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>WebGL Compatibility Check — WebGL 兼容性检查（docs/manual/webgl-compatibility-check.md）</title>
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

## 完整 main.ts

```ts
/**
 * Cocos AIR 开发手册 — WebGL Compatibility Check（WebGL 兼容性检查）
 * 配套文章：docs/manual/webgl-compatibility-check.md
 *
 * 这一页不渲染花哨内容，只做一件事：把"当前环境到底支持什么、引擎实际跑在哪个后端"
 * 全部问出来打到覆盖层。分三层：
 *   1. 浏览器原生能力：document.createElement('canvas').getContext('webgl2') 是否为真
 *   2. 引擎枚举：gfx.API.WEBGL2 / gfx.API.WEBGPU 的数值
 *   3. 引擎实际后端 + 硬件上限：device.constructor.name + device.capabilities
 *
 * 为什么不能只看 gfx.API：那是"枚举定义"，不代表当前设备。判断实际后端要用
 * device.constructor.name（game.renderType 在 AIR 里是 -1，不可用）。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    Layers,
    Vec3,
    Color,
    utils,
    primitives,
    gfx,
    sys,
    screen,
    director,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('webgl-compat');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 5.2));
cameraNode.lookAt(new Vec3(0, 0.4, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 24, 34, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 光源 ----
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ---- 一个参照 cube + 地面（保证画面非空且颜色足够，visible-frame 可验） ----
const cubeNode = new Node('Reference Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0, 0.5, 0));
scene.addChild(cubeNode);
const cubeRenderer = cubeNode.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(230, 130, 50, 255));
cubeRenderer.material = cubeMaterial;

const groundNode = new Node('Ground');
groundNode.layer = Layers.Enum.DEFAULT;
groundNode.setPosition(new Vec3(0, -0.02, 0));
scene.addChild(groundNode);
const groundRenderer = groundNode.addComponent(MeshRenderer);
groundRenderer.mesh = utils.createMesh(primitives.plane({ width: 12, length: 12 }));
const groundMaterial = new Material();
groundMaterial.initialize({ effectName: 'builtin-standard' });
groundMaterial.setProperty('mainColor', new Color(70, 90, 80, 255));
groundRenderer.material = groundMaterial;

window.__airApp = app;
app.run(scene);

// ============ 兼容性报告（覆盖层） ============

function safe(fn: () => any, fallback: any): any {
    try {
        const v = fn();
        return v === undefined || v === null ? fallback : v;
    } catch (e) {
        return fallback;
    }
}

// 1) 浏览器原生 WebGL2 探针（不经过引擎）
const probeCanvas = document.createElement('canvas');
const nativeGL2 = safe(() => !!probeCanvas.getContext('webgl2'), false);

// 2) 引擎枚举（定义，非当前设备）
const apiWebgl2 = safe(() => gfx.API.WEBGL2, 'n/a');
const apiWebgpu = safe(() => gfx.API.WEBGPU, 'n/a');

// 3) 引擎实际后端 + 硬件上限
const device = safe(() => director.root && director.root.device, null);
const caps: Record<string, any> = safe(() => device && device.capabilities, {}) || {};
const cap = (k: string) => (caps[k] === undefined ? 'n/a' : caps[k]);

(document.querySelector('#info') as HTMLElement).textContent = [
    '--- WebGL compatibility check ---',
    `native canvas.getContext('webgl2'): ${nativeGL2}`,
    `gfx.API.WEBGL2=${apiWebgl2}  gfx.API.WEBGPU=${apiWebgpu}`,
    `active device: ${safe(() => device.constructor.name, 'n/a')}`,
    `sys: ${sys.platform} / ${sys.browserType} / ${sys.os} / mobile=${sys.isMobile}`,
    `maxTextureSize=${cap('maxTextureSize')}  maxColorRenderTargets=${cap('maxColorRenderTargets')}`,
    `maxVertexAttributes=${cap('maxVertexAttributes')}  dpr=${screen.devicePixelRatio}`,
    `caps keys: ${Object.keys(caps).join(',')}`,
].join('\n');

console.log('[manual/webgl-compat] running on cocosair');
```

## 上下文丢失（Context Loss）与 AIR 生命周期合同

移动端 GPU 驱动回收、标签页休眠或驱动崩溃都会触发 `webglcontextlost`——所有 GPU 资源（纹理/buffer/program/FBO）即刻失效。上游引擎对此只打印告警（`warnID(11000)`），渲染循环继续向已死的上下文提交调用。AIR 在**不动上游 gfx 文件**的前提下，于画布层挂接同一标准事件，提供显式状态机：

| 状态          | 进入时机                     | AIR 行为                                                                       |
| ------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `healthy`     | 启动后                       | 正常运行                                                                       |
| `lost`        | `webglcontextlost`           | `event.preventDefault()`（为受控恢复留门）+ `game.pause()`：rAF、渲染、业务时钟、音频全部暂停——不再向失效上下文提交无效 GL 调用 |
| `restoring`   | `webglcontextrestored`（瞬时）| 状态机观测点，立即进入下态                                                      |
| `failed`      | 恢复事件到达后               | **如实判定**：AIR 本期不重建 GPU 资源（全量重建属引擎级能力，上游 Web 端同样缺失），恢复到的空上下文不能继续正确渲染；给出 `suggestion: 'reload'` 与受控重载入口。不宣称「自愈」 |

```ts
const app = await createAirApp({ canvas: '#GameCanvas' });

app.contextHealth.onChange((snap) => {
    // snap.state / .backend / .lostCount / .isContextLost / .gamePaused / .reason / .suggestion
    if (snap.state === 'failed') {
        // 受控重载（自定义确认 UI / 上报埋点后再调）：
        app.contextHealth.requestReload(); // 默认 window.location.reload()，可经 contextLoss.reload 注入替代
    }
});
```

要点：

- `requestReload()` 有门掣：`healthy` 态调用返回 `false` 且不动作；仅 `failed` 态真正执行。
- 测试注入：`createAirApp({ contextLoss: { reload: () => recordCall() } })` 可在不真实导航的前提下断言重载合同。
- 人为复现：`WEBGL_lose_context` 扩展（`gl.getExtension('WEBGL_lose_context')` → `loseContext()` / `restoreContext()`）。
- 回归锁定：`tools/verify/context-loss.cjs`（双后端 × 全相位，证据 `docs/evidence/w01-context-loss.json`）。

## API 参考

`gfx.API`（`WEBGL2:7` / `WEBGPU:8`）、`director.root.device`（`.constructor.name` / `.capabilities` / `.numDrawCalls` / `.numTris`）、`sys`（`platform` / `browserType` / `browserVersion` / `os` / `isMobile`；**无** `sys.browser`）、`screen.devicePixelRatio`。以 `build/cocosair.module.d.ts` 为准。

## 下一步

下一篇：[Fundamentals 基本概念](./fundamentals.md) —— 把 App / Scene / Node / Component 的结构和一帧的旅程讲透。
