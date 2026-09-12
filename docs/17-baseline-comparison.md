# 17 — cocos4 baseline 对比报告（Phase 17 / 验收 L14）

> 基线：`cocos4 @ 4.0.0-alpha.33 (snapshot 2026-09-12)`
> 对比对象：上游 Web baseline 构建（`bin/dev/cc-baseline`，见 docs/03）vs Cocos Air 构建（`build/cocosair.module.js`）

## 1. 构建产物对比

| 项 | cocos4 Web baseline | Cocos Air V0.1 |
|---|---|---|
| 构建器 | @cocos/ccbuild（同一工具链） | @cocos/ccbuild（同一工具链） |
| 格式 | SystemJS（split chunks） | **ESM**（three.js 风格单文件） |
| 体积 | 27 MB（约 100 个 chunk） | **3.2 MB**（单文件，未压缩） |
| 压缩版 | —（build:min 另行验证） | **2.0 MB**（cocosair.module.min.js） |
| 加载方式 | Creator preview 环境 | `import { createAirApp } from 'cocosair'` |

## 2. 源码闭包对比（Q1：Web Engine Source Closure 有多大）

| 项 | 上游全量 | Air 闭包（可从 docs/web-dependency-graph.json 复现） |
|---|---|---|
| 扫描文件 | 1535 | 839（src/ 独立树） |
| 可达（Web 闭包） | ~1250+ | **748** |
| NATIVE_ONLY | 80 | **0** |
| MINIGAME_ONLY | 52 | **0** |
| 其它平台（nodejs） | 28 | **0** |

（Q1 答案：Air V0.1 的 Web 源码闭包 ≈ 748 文件；较上游 Web 全量闭包缩减约 40%，主要来自 2D/UI/物理/Spine/视频等 feature 的裁剪。）

## 3. 平台与模块删除清单（Q2）

已从 Air 闭包中物理删除：
- `native/`（855MB 原生引擎、CMake、JSB 绑定）
- `editor/`（Creator Editor Runtime；src/editor 仅保留 ccbuild 占位）
- pal 的 native/minigame/nodejs 实现（仅保留 web + non-minigame + 共享）
- 全部 `*.jsb.ts` 变体（80 个）
- cocos 的 2d/ui/physics/spine/dragonbones/video/webview/terrain/xr/gi/particle 模块（feature 未选择）
- gfx 的 webgpu 模块

## 4. 原以为 Native-only、实际 Web 依赖的公共模块（Q3）

- `cocos/native-binding/`（`internal:native` 虚拟模块的 web 空实现 impl.ts）— Web 闭包必需 ✓
- `cocos/2d/renderer/native-2d-empty.ts`（override 锚点）
- `cocos/animation/marionette/runtime-exports.ts` 及 `pose-graph/runtime-exports(.ts/-empty)`（override 锚点对）
- 大量含 `if (NATIVE)` 分支的公共源码 — 依靠常量折叠剔除（不做物理删除）

## 5. Runtime Asset 兼容性（Q7）

| 资产类型 | 状态 | 验证位置 |
|---|---|---|
| Mesh | ✓ | hello-cube（createMesh）、static-model（runtime JSON + createMesh） |
| Texture | ✓ | static-model（程序化 checkerboard ImageAsset→Texture2D） |
| Material | ✓ | hello-cube/static-model（builtin-standard + 纹理/颜色属性） |
| Skeleton | ✓ | skinned-animation（joints + bindposes Code First） |
| Animation | 部分 | skinned-animation（Component 驱动骨骼动画）；AnimationClip 曲线资产需 Creator 导入，V0.1 未覆盖 |

## 6. Missing Runtime Capability（Q8）

- 预期"无"，实测发现 1 项 + 证据：
  - **蒙皮着色器变体绑定失败**（skinned-animation）：SkinnedModel 建立成功、draw 提交，但蒙皮变体程序未通过创建（"no valid shader program in use"）。证据链见 docs/acceptance-report.md L13 节。需 Creator 4.0 资产管线的 CSM/蒙皮变体数据或图形调试器继续定位。其余（Camera/Light/Mesh/Material/Texture/Animation 驱动/循环）全部实测通过。

## 7. 行为一致性对比（同一代码路径）

| 行为 | baseline 构建 | Air 构建 | 结论 |
|---|---|---|---|
| game.init 全阶段 | ✓（Init Base→Project 日志一致） | ✓ | 一致 |
| 屏幕适配（GameDiv/Canvas resize） | ✓ | ✓（CSS+adapter） | 一致 |
| legacy 前向管线 clear | ✓ | ✓（clearColor 生效） | 一致 |
| drawElements 提交 | ✓ | ✓（36 idx/frame） | 一致 |
| WebGL1 设备 | ✓（但着色器变体数据不全） | 同 | Air 主用 WebGL2 设备规避 |
| WebGL2 设备 | ✓ | ✓（WebGL2Device 激活） | 一致 |

## 8. 构建系统历史包袱（Q6，列出不改）

1. `native-pack-tool`（postinstall 的 native 构建链）— Air 已移除。
2. `build-engine`/`quick-compiler` 双工具链合并的历史过渡层。
3. `exports/` 目录即 feature unit 的隐式约定（文件名=feature 名）。
4. pal 以"预编译 JS + postinstall 复制"发布的形式（Air 改为源内提取）。
5. `scripts/` 中大量 Creator 专用脚本（Air 仅保留所需 4 个）。
