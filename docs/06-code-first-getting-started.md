# 06 — Code First Getting Started

> V0.2 文档 06：最小入门模板。对应 `examples/starter/`。

## 最小应用

```html
<!-- index.html -->
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <script type="importmap">
        { "imports": { "cocosair": "/build/cocosair.module.js" } }
    </script>
</head>
<body>
    <canvas id="GameCanvas"></canvas>
    <script type="module">
        import { createAirApp, Scene } from 'cocosair';
        const app = await createAirApp({ canvas: '#GameCanvas' });
        app.run(new Scene('Main'));
    </script>
</body>
</html>
```

本地开发直接用 dev server（自动注入 importmap，无需手写）：

```bash
npm run dev -- --example starter
# → http://127.0.0.1:7456/（或 --port 指定端口）
```

## API 速览

### `createAirApp(options) → Promise<AirApp>`

| options | 类型 | 说明 |
|---|---|---|
| `canvas` | `HTMLCanvasElement \| string` | 画布元素或 CSS selector |
| `renderMode` | `number` | 渲染后端（3 = WebGL2 优先，同 V0.1） |

| AirApp 成员 | 说明 |
|---|---|
| `run(scene)` | 运行场景（可多次调用切换） |
| `getScene()` | 当前运行中的 `Scene \| null`（V0.2 新增） |

## 约束与说明

1. **canvas id 必须为 `GameCanvas`**（或使用官方 Web 模板 DOM：`GameDiv` / `Cocos3dGameContainer` / `GameCanvas`）。
   引擎 bundle 在 import 阶段（模块级 `sys` 单例）即由 ScreenAdapter 按 id 查找画布，
   这发生在任何用户代码之前，因此 `createAirApp` 无法事后纠正。
2. `createAirApp` 是 async：内部走标准 `game.init` 链路（Base → Infrastructure → Subsystem）。
3. 场景、节点、组件、材质等继续直接使用 Cocos 原生 API（Code First 原则，不二次封装），
   完整类型提示来自 `build/cocosair.module.d.ts`（`npm run build:dts` 生成）。

## 下一步

- 资产加载：见 `07-asset-loading.md`
- 蒙皮模型：见 `08-skinned-model.md`
- 引擎开发循环：见 `09-engine-development.md`
