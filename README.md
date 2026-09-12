# Cocos AIR (cocosair.js)

**Cocos Agent-first Interactive Runtime** — 基于 cocos4 的纯 TypeScript Web 引擎，
脱离 Cocos Creator、Editor 与 Native Engine 的 **Code First** Web 运行时。

```bash
npm install
npm run dev          # Engine Watch + Example Server（http://127.0.0.1:7454）
```

用户只需要：

```ts
import { createAirApp, Scene, Node, Camera, MeshRenderer } from 'cocosair';

const app = await createAirApp({
    canvas: document.querySelector('#GameCanvas')!,
});

const scene = new Scene('Main');
// Code First...
app.run(scene);
```

不需要 Creator、`.scene`、Prefab、Inspector 或任何编辑器资产管线。

## 仓库结构

```
cocosair.js/
├── build/          # 产物：cocosair.module.js / cocosair.module.min.js（ESM）
├── docs/           # 分析与设计文档（含验收报告与证据截图）
├── examples/       # 可运行示例
│   ├── hello-cube/          # Camera + Light + 旋转 Cube（Code First 入门）
│   ├── static-model/        # 运行时 JSON 资产加载 + 程序化纹理 + 标准材质
│   └── skinned-animation/   # 3 骨骼蒙皮 + 骨骼动画（Code First 骨骼链路）
├── src/            # 引擎源码（engine root，与上游 cocos4 相对布局一致）
│   ├── air/                 # Cocos AIR 新增：bootstrap/app/utils/builtin
│   ├── cocos/               # 引擎核心（Web 闭包，749 文件）
│   ├── exports/             # ccbuild feature unit 入口（air.ts 为 bundle 入口）
│   ├── pal/                 # 平台抽象层（Web 实现）
│   └── cc.config.json       # Air 引擎构建配置（由 tools/analyze/make-air-config 派生）
├── test/           # smoke tests（jsdom + HEADLESS 渲染模式）
└── tools/          # build / dev / analyze / verify / baseline
```

## 命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 引擎 watch（src/** 变化自动重建）+ 示例服务器 + 浏览器自动刷新 |
| `npm run build` | Development ESM 构建 → `build/cocosair.module.js` |
| `npm run build:min` | Production ESM 构建 → `build/cocosair.module.min.js` |
| `npm run typecheck` | TypeScript 独立编译校验（0 依赖 Creator） |
| `npm run verify:web-only` | Web-only 依赖守卫（按依赖可达性判定，禁止 native/minigame 泄入） |
| `npm test` | smoke tests（jsdom + HEADLESS 渲染模式） |
| `npm run analyze` | 依赖图 / 抽取清单 / 文件映射再生成（docs/*.json） |
| `npm run baseline` | 上游 Web baseline 复现（验收 L0 证据） |

## Air V0.1 能力边界

**保留**：Core/Math/Scene Graph/Component/Game/Director/Asset/GFX(WebGL2+WebGL1 回退)/
Render Scene/Render Pipeline/Camera/Light/Mesh/Material/Texture/Animation/Skeleton/Skinning/
primitive/tween/Web Input/Web PAL + builtin 材质与效果（Air 程序化注册，见 `src/air/builtin`）。

**不包含**：2D/UI、物理、Spine/DragonBones、音视频、地形、XR、WebGPU、MiniGame、Native。

## Code First 注意事项

- `#GameCanvas` 必须在引擎 import 前存在于 DOM（pal/screen-adapter 为模块顶层单例），
  参考 `examples/hello-cube/index.html` 的模板结构。
- Camera 组件需显式设置 `visibility = Layers.Enum.DEFAULT`（4.0-alpha 的默认值为 undefined）。
- builtin 材质/效果由 `src/air/builtin/register.ts` 程序化注册（无 Creator internal db）。
- `skinned-animation` 示例依赖蒙皮着色器变体（见 docs/acceptance-report.md 的已知限制）。

## 基线与上游

源码基线：`cocos4 @ 4.0.0-alpha.33 (snapshot 2026-09-12)`，MIT 许可。
上游对应关系、抽取清单与修改记录见 `UPSTREAM.md`、`docs/upstream-file-map.json`、
`docs/extraction-manifest.json` 与 `docs/00-upstream-baseline.md`。

## 许可

MIT（见 LICENSE）。第三方许可见 THIRD_PARTY_LICENSES.md。
