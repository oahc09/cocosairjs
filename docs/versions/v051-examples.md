# V0.5.1 示例（T2：导航、新学习示例与兼容）

> 示例基线承接 V0.5（gltf-viewer / gltf-catalog / static-model / skinned-animation /
> hello-cube / starter，含 decoder 静态服务与 MIME/worker 路由）；本版只做增量：
> 导航页 + 4 个新学习示例 + 兼容回归，不重建枚举器、不改 dev server 既有路由语义。

## 1. 示例清单与学习内容

| 示例 | 学习内容 | 版本 |
|---|---|---|
| starter | 最小 Code First 场景（默认打开） | V0.2 |
| hello-cube | 基础 3D 渲染（Camera + 灯光 + 旋转 Cube） | V0.2 |
| transform | 层级与局部/世界变换（`worldPosition` 对照打印） | **V0.5.1 新增** |
| camera | 透视/正交切换 + `frameObject` 取景（DOM 按钮） | **V0.5.1 新增** |
| static-model | 纹理与 PBR 材质 | V0.2 |
| gltf-viewer | glTF/GLB 加载器（骨骼/Morph/扩展） | V0.5 |
| skinned-animation | 骨骼动画 | V0.2 |
| input | 键盘/鼠标/触摸（`input.on` + `Input.EventType`） | **V0.5.1 新增** |
| automation | 开发期观察/操作工具闭环（agent session） | **V0.5.1 新增** |
| gltf-catalog | 官方模型目录 | V0.5 |

新增示例均为 `index.html + main.ts + README.md` 三件套；`main.ts` 由 dev server
esbuild 即时编译（与 starter 同机制）。动画一律走 `Component.update(dt)`
（AirApp 不暴露帧回调）。

## 2. 发现与导航

- 导航页固定 URL `/index.html`（`examples/index.html`）；`/` 仍 302 到 `--example`
  默认目标，**旧 URL 语义不变**。
- 示例发现沿用 dev server：`examples/` 下含 `index.html` 的一级目录；排除
  `shared/`（公共代码与 bench 测量页）、`assets/`、缓存与非示例文件。
- 目录名冲突/路径穿越/缺失入口：dev server 沿用 V0.5 的 404/existsSync 路径规则；
  本版新增 `'//'` 归一化防御（协议相对 URL 不再打死 server）。

## 3. 真实浏览器门禁（G2）

`tools/verify/v051-examples-browser.cjs`（Playwright，dev server :7455）：

| 检查 | 结果 |
|---|---|
| 旧示例回归：starter / hello-cube 加载零报错 | ✅ |
| transform：场景渲染 + 控制台 local/world 对照行出现 | ✅ |
| camera：正交/透视切换 + frameObject 点击无异常 | ✅ |
| input：WASD 键盘 + 鼠标拖拽事件分发 | ✅ |
| automation：agent session 闭环 13 pass / 0 fail | ✅ |
| 导航页 11 个链接可达 | ✅ |

画面证据：`output/playwright/v051-*.png`；结果 JSON：
`output/playwright/v051-examples-result.json`。

## 4. 能力边界

- automation 示例依赖 dev server 的 `/__debug/` 路由，静态托管下显式报错不静默；
- 不引入手势框架；input 仅覆盖键鼠/触摸基础事件；
- 示例不进入 npm 包（`files` 白名单）。
