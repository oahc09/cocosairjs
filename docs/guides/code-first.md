# Code First 入门

> 创建场景并在浏览器运行。最小模板见 `examples/starter/`。

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
# → http://127.0.0.1:7454/（或 --port 指定端口）
```

## API 速览

### `createAirApp(options) → Promise<AirApp>`

| options      | 类型                          | 说明                                 |
| ------------ | ----------------------------- | ------------------------------------ |
| `canvas`     | `HTMLCanvasElement \| string` | 画布元素或 CSS selector              |
| `renderMode` | `number`                      | 浏览器默认 WebGL2；3 为测试用 HEADLESS |

| AirApp 成员  | 说明                                      |
| ------------ | ----------------------------------------- |
| `run(scene)` | 运行场景（可多次调用切换）                |
| `getScene()` | 当前运行中的 `Scene \| null`（V0.2 新增） |

## 约束与说明

1. 默认模板使用 `GameCanvas`（`GameDiv` / `Cocos3dGameContainer` / `GameCanvas`）。
   自定义 id 时，先将 canvas 元素赋给 `globalThis.__CC_CANVAS__`，再动态 import 引擎；
   ScreenAdapter 和输入源在 import 阶段绑定它。`createAirApp` 不改写 canvas id，
   缺少预绑定会明确报错。
2. `createAirApp` 是 async：内部走标准 `game.init` 链路（Base → Infrastructure → Subsystem）。
3. 场景、节点、组件、材质等继续直接使用 Cocos 原生 API（Code First 原则，不二次封装），
   完整类型提示来自 `build/cocosair.module.d.ts`（`npm run build:dts` 生成）。

## 下一步

- [资源加载](asset-loading.md)
- [骨骼工具](skinned-model.md)
- [开发循环](engine-development.md)
- [完整开发手册](../manual/index.md)
