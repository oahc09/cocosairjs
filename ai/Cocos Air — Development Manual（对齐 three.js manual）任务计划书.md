# cocosair 开发手册实施计划（对齐 three.js manual）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 cocosair.js 建立一套成体系开发手册：目录全量对齐 https://threejs.org/manual/（分组/顺序/64 条目一模一样），每篇有能力的条目配一个专属可运行示例，纯 Markdown 交付。

**Architecture:** `docs/manual/` 自包含手册（60 篇文章 + 1 索引页）；示例按用户指定放 `docs/manual/examples/manual-<slug>/`（与 three.js 官方形态一致——manual 示例树与主 examples 产品树分离，45 例门禁/Gallery/覆盖率零改动）；示例为自带 importmap 的纯 JS（index.html + main.js），经 dev server 新增 `/manual/` 静态路由运行；验证走专用轻量浏览器验证器，不进 §24 门禁。

**Tech Stack:** 纯 Markdown + 纯 JS 示例 + dev server 小改（一条静态路由）+ 专用 Playwright 验证脚本。

---

## Context

仓库是 Cocos AIR（cocos4 4.0.0-alpha.33 抽取的 Code First 组件式 Web 运行时），现有文档是 40+ 篇零散的验收/基线/专题文档，没有成体系的"从入门到进阶"手册。用户要求参考 three.js manual 的**内容形式与大的步骤**补齐这块——骨架一模一样，内容映射到 cocosair 真实 API（Cocos 组件式，不是 Three.js API）。

**用户已确认的 5 个决策：**
1. 正文中文，篇目标题保留英文原名对照（如「Materials 材质」）
2. 目录全量对齐：无对应能力的篇目保留条目，正文如实写"当前不包含"+ 指向 README §Air V0.1 能力边界
3. 有能力的篇目**每篇新建专属示例**；确定 N/A 的篇目无示例
4. 纯 Markdown，不做 HTML 手册站
5. **示例位置：`docs/manual/examples/manual-<slug>/`**（第二轮反馈调整；不进 `examples/` 主树）

**条目账（list.json 核实）：** 10 组共 64 条目；Tips 组 8 条中 5 条是单页锚点 → 实际文章 59 个 md + index.md = 60 个文件。示例规划：稳定可写 ~34 例 + Wave 0 冒烟后定去留 ~10 例 + 无例 20 条目（M 元信息页 4 + N/A 篇目 16）。

---

## 一、文件布局

```
docs/manual/
├── index.md                          # 索引页：复刻 three.js list.json 分组/顺序/64 条目（含 --- 分隔线）
├── installation.md …                 # 60 篇文章，直接用 three.js slug 命名
├── tips.md                           # 承接 5 个锚点条目（taking-a-screenshot 等 H2）
└── examples/
    └── manual-<slug>/                # 与现有 45 例零命名冲突；零资产（无 assets/ 目录）
        ├── index.html                # #GameCanvas 在 import 之前 + 自带 importmap
        └── main.js                   # 纯 JS（docs/ 下无 esbuild .ts 编译）；末尾 window.__airApp = app

tools/dev/dev-server.cjs              # 小改：新增 /manual/ → docs/manual/ 静态路由 + watch reload
tools/verify/manual-examples-verify.cjs  # 新增：manual 示例专用浏览器验证器
docs/evidence/manual-spike.md         # Wave 0 冒烟结论（哪些 ⚠ 篇目降 N/A）
docs/evidence/manual-waves.md         # 逐篇诚实台账：PASS/PARTIAL/BLOCKED + 证据指针（append-only）
docs/evidence/manual-examples-verified.json  # 验证器证据（+ docs/evidence/examples/manual-<slug>.png）
```

**与主 examples 树的边界（本次迁移的核心收益）**：`examples/`、`examples/files.json`、§24 规格、Gallery、覆盖率门禁**全部零改动**；manual 示例不进 spec-validate 扫描范围（`spec-validate.cjs:204` 只扫 `examples/` 顶层），因此**不写 example.json**，可运行性由专用验证器如实背书。

双向链接约定：文章「运行示例」节链接 `../examples/manual-<slug>/`（相对路径，md 直接浏览可点）；manual-<slug>/index.html 的 `<title>` 回指本篇文章文件名。

## 二、文章骨架模板

### FULL 篇模板（代码块与 docs/manual/examples/manual-<slug>/main.js 逐行一致）

```markdown
# <英文原名> <中文标题>

> 一句话定义：本篇在 Cocos AIR 中对应什么能力。（开篇 2-3 句，比照 three.js 范式）

> 前置阅读：[上一篇](./<prev>.md) · [入门：Creating a Scene](./creating-a-scene.md)

## 概念对照
（三行以内小表：three.js 概念 ↔ AIR 真实 API，如 Mesh+Material ↔ MeshRenderer+builtin 材质）

## 小节 1 …（H2 递进：每节在前一节代码上增量，代码块完整可运行，纯 JS）
## 小节 N …

## 运行示例
```bash
npm run dev
# → http://127.0.0.1:7454/manual/examples/manual-<slug>/
```
示例工程：`docs/manual/examples/manual-<slug>/`（index.html + main.js，零外部资产）。

## API 参考
API 以 `build/cocosair.module.d.ts` 为准；相关专题文档见延伸阅读。

## 下一步
下一篇：[<next>](./<next>.md)
```

### N/A 篇诚实模板（无「运行示例」节）

```markdown
# <英文原名> <中文标题>
> 开篇定义段（说明 three.js 中这是什么、AIR 为何当前不包含）。
## 当前不包含
（如实陈述；引用 README §Air V0.1 能力边界）
## 近似替代
（指向最近的真实能力：如 How to use Post Processing → ToneMappingType 色调映射单项；
 Using Shadertoy shaders → 自定义 effect 机制 docs/gltf-extension-reference.md）
## 下一步
```

### 模式锁定：manual-creating-a-scene 完整代码（Wave 1 首篇，后续所有示例照此结构转写）

`docs/manual/examples/manual-creating-a-scene/index.html`：
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Creating a Scene — 创建场景（docs/manual/creating-a-scene.md）</title>
    <script type="importmap">
        { "imports": { "cocosair": "/build/cocosair.module.js" } }
    </script>
</head>
<body>
    <canvas id="GameCanvas"></canvas>
    <script type="module" src="./main.js"></script>
</body>
</html>
```

`docs/manual/examples/manual-creating-a-scene/main.js`（**底本 = `examples/hello-cube/main.ts` 转写为 JS**，import 名与组件属性名以底本和 `build/cocosair.module.d.ts` 为准，转写时不臆造）：
```js
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer,
         primitives, Layers } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' }); // #GameCanvas 已在 import 前存在
const scene = new Scene('Main');

const cameraNode = new Node('MainCamera');
cameraNode.addComponent(Camera);
cameraNode.setPosition(0, 2, 8);
cameraNode.lookAt(0, 0, 0);            // 写法以 examples/camera-lookat 为准
cameraNode.addComponent(Camera).visibility = Layers.Enum.DEFAULT; // 必显式，见 README 坑 1
scene.appendChild(cameraNode);

const lightNode = new Node('MainLight');
const light = lightNode.addComponent(DirectionalLight);
light.illumination.set(1, 1, 1);       // 具体属性名以 hello-cube 为准
scene.appendChild(lightNode);

const cubeNode = new Node('Cube');
const renderer = cubeNode.addComponent(MeshRenderer);
// Mesh + builtin 材质装配写法以 hello-cube / docs/06 为准
scene.appendChild(cubeNode);

app.run(scene);
window.__airApp = app;                 // 每个示例末尾固定，供控制台探查与验证器使用
```

## 三、64 条目逐篇映射表（总账）

状态：F=FULL｜P=PARTIAL｜N=NA｜M=元信息页无示例｜⚠=Wave 0 冒烟定去留。逐篇的**示例场景与文章骨架在 §五 各 Wave 表内**，此处只留组级账：

| 组 | 条目数 | F | P | N | M | 示例数 |
|---|---|---|---|---|---|---|
| Getting Started | 10 | 4 | 2 | 1 | 3 | 6 |
| Next Steps | 7 | 4 | 2 | 1 | 0 | 6 |
| Basics | 4 | 3 | 0 | 0 | 1 | 3 |
| Fundamentals | 11 | 9 | 1 | 1 | 0 | 10 |
| Tips | 8 | 2 | 6 | 1 | 0 | 2-4 |
| Optimization | 3 | 0 | 2 | 1 | 0 | 2 |
| Solutions | 15 | 6 | 6 | 3 | 0 | 11-12 |
| WebGPU / WebXR | 5 | 0 | 0 | 5 | 0 | 0 |
| Reference | 1 | 1 | 0 | 0 | 0 | 0 |

## 四、示例工程化（docs/manual/examples/）

**每例 2 件套，零资产、零构建依赖：**
- `index.html`：自带 `<script type="importmap">{ "imports": { "cocosair": "/build/cocosair.module.js" } }</script>`（dev server `/build/*` 路由全局可达，`dev-server.cjs:349`）；`<canvas id="GameCanvas">` 在所有模块 import 之前；不依赖 dev server 的 importmap 注入——**任何以仓库根为 web 根的静态服务器都能跑**
- `main.js`：纯 ES module，无 TS 语法（docs/ 下无 esbuild transform）；末尾 `window.__airApp = app`
- 零资产原则：几何用 `primitives.*`/`utils.createMesh`，glTF 用 inline JSON 字符串——不落 assets/、不引 decoder，绕开资产溯源/MIME/license 整条问题链
- API 写法纪律：每例动手前先查对应现有示例底本（§五 表中"复用思路"列）与 `build/cocosair.module.d.ts`，禁止凭 three.js 记忆臆造 API

**dev server 小改（tools/dev/dev-server.cjs）**：
- 加 `MANUAL_DIR = docs/manual`，路由：`p.startsWith('/manual/')` → 解析 `MANUAL_DIR` 下静态文件（`.html/.js/.md`，带正确 MIME；路径规范化防目录穿越）；`/manual/` 无尾路径时 302 到 `/manual/index.md` 或目录列表
- watch 增加 docs/manual 频道 → 仅 bump reload token（同 examples 频道模式，绝不触发构建）
- 改动 ~15 行，`/examples/` 现有路由与注入逻辑不动

**验证（专用验证器 `tools/verify/manual-examples-verify.cjs`）**：
- 复用 v11-examples-verify.cjs 的模式：外部 `NODE_PATH` Playwright、headless Chromium、软件光栅化参数（`--use-gl=angle --enable-unsafe-swiftshader`）、把 `docs/manual/examples/manual-*/` 展平到暂存工作区
- 判定：0 console/着色器错误 + visible-frame（非背景像素/双帧差）；截图 → `docs/evidence/examples/manual-<slug>.png`；证据 → `docs/evidence/manual-examples-verified.json`（每例 pass/errors/screenshot 字段）
- 支持 `--ids=manual-fog,manual-skybox` 子集跑（台账标注口径）；终验全量不带 --ids
- **不写 example.json、不进 spec-validate/覆盖门禁**——文章与验证器的双向绑定靠"代码块 = main.js 逐行一致 + 验证器截图"背书

## 五、分波执行（逐篇具体内容）

**每篇的固定六步回路（Wave 1-6 通用，各波条目套用）：**
- [ ] 1. 写 `docs/manual/examples/manual-<slug>/index.html` + `main.js`（底本见行内标注；对照 §二 模式锁定代码）
- [ ] 2. dev server 目视：`http://127.0.0.1:7454/manual/examples/manual-<slug>/` 画面/交互符合预期
- [ ] 3. `NODE_PATH=E:/AIProMax/Y2026M08/AIShaderBenchmark/node_modules node tools/verify/manual-examples-verify.cjs --ids=manual-<slug>` → PASS + 截图
- [ ] 4. 写 `docs/manual/<slug>.md`（§二 FULL/N-A 模板；代码块从 main.js/index.html 原样拷贝，不手打）
- [ ] 5. 一致性自查：文章代码块与 main.js 逐行 diff 为零；「下一步」链接指向组内下一篇
- [ ] 6. 台账 append `docs/evidence/manual-waves.md`：本篇 PASS/PARTIAL/BLOCKED + 证据（截图 png / 验证 json / spike 结论），写完复读

---

### Wave 0：骨架 + 冒烟（先行，决定 ⚠ 篇目去留）
- [ ] 建 `docs/manual/index.md`（64 条目完整目录，分组/顺序/`---` 分隔照搬 list.json）+ FULL/N-A 两套模板
- [ ] 改 `tools/dev/dev-server.cjs` 加 `/manual/` 路由 + watch；验证 `/manual/examples/` 可访问、`/build/` importmap 在该路径下解析成功
- [ ] 冒烟 10 项（各写最小 throwaway 页或并入后续示例首版），结论记 `docs/evidence/manual-spike.md` 并回填 §五 各表：
  ①shadows ②fog ③skybox ④ToneMappingType ⑤resize 自适应 ⑥worldToScreen/screenPointToRay 确切签名 ⑦BatchingUtility.batchStaticModel ⑧LODGroup ⑨canvas→ImageAsset 每帧上传 ⑩双实例多画布
- [ ] 写 `tools/verify/manual-examples-verify.cjs`，用 manual-creating-a-scene 打通"验证→截图→证据 json"全链路

### Wave 1：Getting Started + Basics（14 条目 → 10 篇文章含 4 篇 M，9 例）

| 文章 | 状态 | 示例场景（manual-<slug>/main.js 具体做什么） | 文章 H2 骨架（除模板固定节外） |
|---|---|---|---|
| installation | F | 最小引入页：importmap + createAirApp + 一盏灯一个 cube 静止展示；overlay div 显示引擎版本/后端 | 获取构建产物（npm run build）→ importmap 引入 → GameCanvas 约束 → createAirApp 选项表 → d.ts 类型提示 |
| creating-a-scene | F | starter 等价 + cube 每帧自转（自定义组件 update）；§二模式锁定代码即本例 | 三件套（App/Scene/Camera）→ 加光 → 加网格 → 每帧更新 → 完整清单 |
| drawing-lines | P | 红/绿/蓝三根细长 box 拼 XYZ 坐标轴 + 一个普通 cube 展示轴向 | three.js 的 LineSegments → AIR 无线图元的现状 → thin-box 模拟实现 → 局限（线宽/数量成本）→ 替代方案 |
| loading-models | F | inline glTF JSON（单 mesh+材质+可选 20 帧骨骼动画）→ GLTFLoader 解析 → instantiate 挂场景 → 自转展示 | glTF 与 GLTFLoader → inline JSON 加载全码 → loadAssetAsync 资产路径 → 材质/动画入口 → decoder 边界（Draco 不内嵌，指向 gltf-decoder-deployment） |
| uniform-types | P | 三 cube 同材质 clone，setProperty 分别改颜色(Color)/平铺(vec2)/发光(float)，并排对比 | 材质属性即 uniform → 类型对照表（number/Color/Vec2/Vec4/Texture）→ setProperty 三连示例 → 命名以 builtin effect 为准 |
| webgl-compat | F | 页面顶部 overlay 显示：renderMode 结果、WebGL 版本、DeviceCaps 关键项；不支持的浏览器显示降级提示 | WebGL2 优先/WebGL1 回退 → 如何查询能力（DeviceCaps 路径以 d.ts 为准）→ 失败时的用户提示模板 |
| fundamentals | F | hello-cube 加全景注释版：相机/光/网格各一段命名注释，静态展示 | AIR 渲染结构（文字图）→ App↔Scene↔Node↔Component 对照大表 → 一帧的旅程（culling→材质→绘制）|
| responsive-design | F⚠ | 窗口任意缩放，canvas 铺满且画面不变形；页面显示当前像素尺寸（spike ⑤ 定 API） | canvas 尺寸从哪来 → 窗口变化时引擎做什么 → devicePixelRatio 与清晰度 → 常见拉伸错因 |
| setup | F | starter 复刻（重点在文章，示例仅作跑通载体） | dev server 启动 → 三频道 watch 表 → 构建错误横幅与 /​__build_status → 静态部署（prepare-static） |
| FAQ（M） / Libraries and Plugins（M） / Useful Links（M） / Prerequisites（M） | M | 无示例 | FAQ：GameCanvas/visibility/decoder/黑屏排查 Q&A 列表；Libraries：examples/shared/ 与 decoder 注入点；Useful Links：docs/ 索引 + gltf-catalog + Khronos viewer；Prerequisites：TS/ESM/WebGL 前置知识 |

### Wave 2：Fundamentals（11 条目 → 11 篇文章，10 例）

| 文章 | 状态 | 示例场景 | 文章 H2 骨架 |
|---|---|---|---|
| primitives | F | 2×3 网格排布 primitives 全家福（box/sphere/plane/cylinder/torus/capsule…以 d.ts 实际清单为准），各自缓慢自转 | 内置图元清单 → 参数（segments/尺寸）→ 统一摆放代码 → 超出清单时用 createMesh |
| scenegraph | F | root→组→子 cube 三层：旋转父组带动全部子节点；一个子节点 setActive(false) 演示隐藏 | Scene 与 Node 树 → position/rotation/scale 的继承 → 激活开关 → 与 three.js Object3D 的差异点 |
| materials | F | 三 cube 并排挂 basic/unlit/standard 三种 builtin 材质，同一光源下对比质感 | 材质=effect+uniforms → builtin 材质清单（src/air/builtin）→ 获取途径（builtinResMgr/实例化）→ setProperty → 与 MeshRenderer 绑定 |
| textures | F | 程序化画 8×8 棋盘格 ImageAsset → Texture2D → 贴 cube，旋转展示六面同图 | 纹理从哪来（文件/程序化）→ ImageAsset→Texture2D 两步 → 采样与平铺参数 → 换图更新 |
| lights | F | 单球体 + 按钮轮换 Directional/Point/Spot/Sphere 光，页面显示当前光型 | 四种光源 → 各自关键属性（强度/范围/角度）→ 光与 builtin 材质的交互 → 多光并存 |
| cameras | F | 一场景透视/正交双相机按键切换；frameObject 包围盒自动取景演示 | Camera 组件 → 投影类型对比 → visibility 层过滤（必显式坑）→ frameObject 自动取景 |
| shadows | F⚠ | 地面 plane + 三个 cube + DirectionalLight 开阴影（spike ①：shadows.enabled/ShadowsType/PCF 路径全通才 F） | 开阴影三步（globals/光源/材质接收）→ 阴影类型 → 调参 → 已知限制如实列 |
| fog | F⚠ | 一排 10 个 cube 渐远 + 线性雾（spike ②：FogType/起止参数通才 F），背景同色渐隐 | FogType → 起止距离/密度 → 与背景色配合 → WebGL1 差异 |
| render-targets | P⚠ | spike ③ 后定：captureCubemap 环境球 或 降 N 纯文章 | （若 P）RT 在哪能用 → captureCubemap 示例 → 不暴露通用 RT 的边界；（若 N）诚实模板 |
| custom-geometry | F | utils.createMesh 造四面体（顶点/索引/法线手写）+ standard 材质受光展示 | 顶点布局 → 索引 → 法线与光照 → 与 primitives 的关系 → MeshUtils |
| physics | N | 无 | 诚实模板：能力边界 + 指向 README；近似替代：距离判定/手动积分（预告 mini-game 篇） |

### Wave 3：Next Steps（7 条目 → 7 篇文章，6 例）

| 文章 | 状态 | 示例场景 | 文章 H2 骨架 |
|---|---|---|---|
| animation-system | F | 一个 cube 走 tween 位移+缩放，旁边一个骨骼模型走 Animation clip 循环（skinned-animation 简化） | Animation 组件与 clip → 播放/暂停/切换 → tween 系统并行动画 → 两条系统的分工 |
| color-management | P | 三球：HEX 直设 / HSL 调整 / 两色 lerp 连续渐变动画 | Color 的创建姿势（rgb/hex/hsv）→ lerp 与渐变 → gamma 与光照下的观感（如实说明引擎不做色彩管理管线） |
| how-to-dispose-of-objects | F | 按钮"生成 10 / 销毁 10"：destroy + 帧末延迟回收；页面实时显示 isValid 计数（runtime-asset-release 思路） | destroy 语义 → 帧末延迟销毁 → 资源 isValid 核对 → 泄漏排查姿势 |
| how-to-update-things | F | 自定义组件 update：cube 位置正弦漂移 + 颜色随时间变化 | 组件生命周期（onLoad/start/update）→ 每帧更新的正确姿势 → 与 tween 的取舍 → 常见错误模式 |
| how-to-use-post-processing | P⚠ | spike ④ 后定：同场景 ToneMappingType 切换对比页；不通降 N（诚实模板，近似替代指向 ToneMapping 单项） | （若 P）管线后处理现状 → ToneMapping 切换示例 → 与 three.js EffectComposer 的差距如实写 |
| matrix-transformations | F | 用 Mat4 手动算出四个 cube 的摆位（平移×旋转×缩放链），旁边显示运算式；坐标轴用 thin-box | Vec3/Quat/Mat4 速览 → transformMat4 链式变换 → 与 Node TRS 的关系 → 何时需要手动矩阵 |
| how-to-create-vr-content | N | 无 | 诚实模板：无 WebXR；能力边界回链 |

### Wave 4：Solutions（15 条目 → 15 篇文章，12 例）

| 文章 | 状态 | 示例场景 | 文章 H2 骨架 |
|---|---|---|---|
| load-obj | N | 无 | 诚实模板：无 OBJ 加载器；近似替代：转 glTF（给转换工具链接） |
| load-gltf | F | inline glTF：两个 mesh + 两种材质 + 一段 morph/骨骼动画（gltf-basic 等价），加载/实例化/播放全流程 | GLTFLoader 全流程五步 → 实例化挂载 → 动画与材质入口 → 错误处理（GLTFError）→ decoder 边界 |
| backgrounds | P⚠ | spike ③ 后定：scene.globals.skybox 程序化环境或纯色背景渐变 | （若 P）skybox 设置 → 无 env 资产的现实与程序化替代 → 背景色；（若 N）诚实模板 |
| transparency | F | 玻璃感外球（半透明）套内实心 cube，旋转展示排序效果 | 半透明材质两步 → 渲染顺序谁说了算 → 常见伪影与规避 |
| multiple-scenes | P⚠ | spike ⑩ 后定：双 canvas 双 AirApp 各跑独立场景同步动画 | （若 P）多实例创建 → 各自生命周期 → 事件隔离；（若不成）降 P 纯文字引 docs/10 |
| picking | F | 4 个不同色 cube，鼠标点击变亮并显示命中名（interaction-click 思路：screenPointToRay+相交） | 屏幕坐标→射线 → 相交检测 → 命中后反馈 → 与 UI 事件的关系 |
| post-processing | N | 无 | 诚实模板，回链 how-to-use-post-processing |
| shadertoy | N | 无 | 诚实模板：无对应机制；近似替代：自定义 effect 机制（gltf-extension-reference） |
| align-html-elements-to-3d | F⚠ | 3D 节点上方的 HTML 名牌：每帧 worldToScreen 投影 → div 定位跟随（spike ⑥ 定 API 名） | worldToScreen → 每帧同步循环 → 缩放/遮挡的取舍 |
| indexed-textures | P | 4×4 调色板小纹理按 uv 分区给平面着色，演示"一张图管一片区域" | 调色板纹理思路 → uv 规划 → 应用场景（地形/标注） |
| canvas-textures | P⚠ | 页面 canvas 每秒画随机图形 → ImageAsset → 贴 cube，画面持续变化（spike ⑨ 定上传 API） | canvas 纹理三步 → 动态更新与上传 → 性能注意 |
| billboards | P | 三个平面 billboard 用 Quat 每帧朝向相机，环绕相机飞行 | 朝向计算（lookAt/Quat）→ 每帧同步时机 → 应用：指示牌/粒子 |
| cleanup | F | 两套材质/纹理在场景 A/B 间切换，页面显示 isValid 状态，复用 dispose 篇姿势 | 释放清单（材质/纹理/网格）→ 释放与复用的边界 → 与资产生命周期的衔接 |
| voxel-geometry | F | 12×12 高度图生成体素方块 → createMesh 合并单 Mesh，页面显示 draw call 意义说明 | 体素数据结构 → 合并几何构建 → 一次 draw 的意义 → 扩展：挖洞/着色 |
| game | F | 键盘移动小球（input）吃金币（距离判定+tween 消失+计分 div） | 游戏循环拆解 → 输入 → 简化碰撞（距离）→ 计分与 HUD → 打包交给 Installation |

### Wave 5：Tips + Optimization（10 条目 → 4 篇文件（rendering-on-demand/debugging-javascript/debugging-glsl/tips.md）+ 2 篇 Optimization，5-6 例）

| 文章 | 状态 | 示例场景 | 文章 H2 骨架 |
|---|---|---|---|
| rendering-on-demand | P⚠ | spike：主循环 pause/resume；示例默认静止、按钮触发单帧渲染 → 不成降 M 纯文字 | （若 P）何时需要按需渲染 → pause/resume/单帧 → 与 tween 的冲突；（若 M）现状说明 |
| debugging-javascript | F | debug 面板演示页：Alt+D 打开面板 + 控制台 window.__airApp 探查演示脚本 | debug 面板（Alt+D）→ __airApp 控制台探查 → 常见报错对照（README 踩坑清单）→ /​__build_status |
| debugging-glsl | N | 无 | 诚实模板：无 GLSL 调试设施；给排查法：最小复现/二分注释/参考 gltf-validation 记录 |
| tips.md（5 锚点） | 逐节 P/F⚠ | 单例 manual-tips-keyboard：方向键移动 cube（input 模块）；其余锚点纯文字节 | Taking a screenshot（rc-capture-frame 思路，DevTools 限制如实写）→ Prevent Canvas Being Cleared（清屏行为说明）→ Keyboard Input（配示例）→ Transparent Canvas（P⚠ alpha 背景）→ 3D 作 HTML 背景（布局模板） |
| optimize-lots-of-objects | P⚠ | 1000 个独立 cube vs 合并/批处理后的对比，页面显示帧率（spike ⑦ BatchingUtility 通则用之，不通则手写 createMesh 合并版仍 F 收尾） | 数量问题的本质 → 批处理 API（或手动合并）→ 对比数据 → 网格合并的取舍 |
| optimize-lots-of-objects-animated | P⚠ | spike ⑧ LODGroup：近/中/远三档细节切换演示；不通则纯文字 + 蒙皮成本说明 | 动画对象的成本 → LOD 思路（spike 结果）→ 蒙皮实例的替代策略 |
| offscreencanvas | N | 无 | 诚实模板：不支持 OffscreenCanvas worker 渲染 |

### Wave 6：WebGPU / WebXR / Reference（6 条目 → 6 篇文章，0 例）+ 衔接 + 终验
- [ ] webgpurenderer.md / webgpu-postprocessing.md / webxr-basics.md / webxr-look-to-select.md / webxr-point-to-select.md：5 篇 N 诚实模板（WebGPU→当前 GFX 是 WebGL2/WebGL1；WebXR 三篇→无 XR 设备 API，近似替代指向相机交互篇）
- [ ] material-table.md：builtin 材质 × 关键属性 × glTF 扩展映射大表（底本 docs/gltf-extension-reference.md），无示例
- [ ] README.md「文档」区块加开发手册入口一行
- [ ] 终验（命令见 §八）

## 六、与现有文档衔接（最小侵入）

- `README.md`「文档」区块首行加一条：`- [开发手册](docs/manual/index.md) — 对齐 three.js manual 的 60 篇体系教程`
- 旧教程不迁移：manual 对应篇「延伸阅读」回链（06→creating-a-scene/setup、07→loading-models、08→animation-system、09→setup/debugging-javascript）
- N/A 篇目统一回链 README §Air V0.1 能力边界

## 七、风险与已证陷阱（执行时逐条对照）

1. **#GameCanvas 必须在引擎 import 前存在**（模块级 ScreenAdapter 单例）——所有 index.html 固定顺序；Camera 组件显式 `visibility = Layers.Enum.DEFAULT`。
2. **纯 JS 约束**：docs/ 下无 esbuild .ts 编译——main.js 禁用 TS 语法；文章代码块与 main.js 逐行一致（改代码先改 main.js 再同步文章）。
3. **API 写法纪律**：每例以「复用思路」底本示例 + `build/cocosair.module.d.ts` 为准，禁止凭 three.js 记忆臆造 API；拿不准的进 Wave 0 spike。
4. **dev server 路由安全**：/manual/ 路由必须做路径规范化 + 限定在 docs/manual/ 前缀内（防目录穿越，对齐现有 examples 分支行为）。
5. **绝不弱化验证器断言**（visible-frame/双帧差）来让 ⚠ 篇目转绿；spike 不过就如实降 P/N。
6. **`--ids=` 子集跑证据口径**：台账必须标注子集范围；对外宣称 PASS 前必须终验全量。
7. **并行审计会话共树**：本计划改动面 = 全新路径（docs/manual/**、tools/verify/manual-examples-verify.cjs、docs/evidence/manual-*）+ dev-server.cjs 一处小改 + README 一行；不触碰 examples/、files.json、§24 门禁——暂存前 `git status` 核对，台账只 append、写完复读。
8. WebGL1 回退：涉 shader 的示例正文注明 WebGL1 差异。
9. **提交纪律**：**不主动 commit/push，逐次等用户明确授权**。

## 八、验证（端到端）

1. `tools/verify/manual-examples-verify.cjs` 全量：manual-* 逐例 0 错误 + visible-frame PASS + 截图落 `docs/evidence/examples/manual-*.png`
2. `http://127.0.0.1:7454/manual/examples/manual-<slug>/` 目视抽查 ≥5 例：画面与文章代码块一致
3. `docs/manual/index.md` 64 条目逐一有落点（文章/锚点/NA 声明），与 three.js list.json 分组顺序 diff 为零差异
4. `npm run typecheck && npx jest` 全绿（dev-server 改动无回归）；`node tools/examples/spec-validate.cjs` 读数与基线一致（主树零扰动）
5. 台账 `docs/evidence/manual-waves.md` 无未闭环 BLOCKED
