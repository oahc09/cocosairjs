# Cocos Air V0.2 — 验收报告

> 基线：V0.1 RC（`v0.1.0-rc.1`）
> 报告时间：2026-09-12
> 执行依据：《Cocos Air V0.2 — Code First DX & SDK 化任务计划书（与 V0.1 连续版）》
> V0.1 验收证据见 `docs/acceptance-report.md`（保持不变）。

> **V0.3 前置审查更正（2026-09-12）**：原表 L7/L8 将全量 rebuild 标为增量能力通过，不充分；L5 正交取景、相机父节点和乱序关节复位缺少针对性验证，source map 搬运也未重定位 sources。
> 本次已补修与复现，详见 [审查及 V0.3 验证](11-v03-verification.md)。下表保留当时记录，不再作为上述能力已实现的唯一依据。
> 声明从全局 cc 模块转为可消费 SDK 模块的修复由外部模型任务交付，本次保留并做公共包入口消费验证。

## 1. 验收矩阵（L0–L17）

| Level | 验收 | 状态 | 证据 |
|---|---|---|---|
| L0 | V0.1 全部验证继续通过 | ✓ | jest 19/19（含 V0.1 smoke 01–04 原样通过）；verify:web-only PASSED；build/build:min 产物规格不变 |
| L1 | 原仓库结构不变化 | ✓ | 无新增 packages/SDK/顶层目录；仅按计划新增 src/air/utils/*、tools/build/build-dts.cjs、tools/verify/v02-examples.cjs、docs/05–09、examples/starter、examples/shared |
| L2 | `createAirApp()` 整理完成 | ✓ | `canvas: HTMLCanvasElement \| string(selector)`；`AirApp.getScene()`；canvas id 归一化（GameCanvas 约束文档化于 docs/06） |
| L3 | Promise Asset Helper | ✓ | `src/air/utils/load-asset.ts`；smoke-05 三用例（注册解析/错误指引/类型过滤）PASS |
| L4 | Skeleton Utilities | ✓ | `skeleton-tree.ts` + `restore-bind-pose.ts`；smoke-06 三用例（构建/复位往返/缺失路径）PASS |
| L5 | Camera Framing Utility | ✓ | `frame-object.ts`（世界包围盒 → 透视/正交自动取景）；static-model 与 skinned-animation 示例实际使用 |
| L6 | Starter Example | ✓ | `examples/starter/`（main.ts + importmap）；浏览器实测 0 错误 + 运行日志标记（空场景 0 draw 属预期） |
| L7 | Engine Incremental Build | ✓ | dev server engine 频道：src/cocos\|pal\|exports 变更 → 自动 rebuild → reload token 更新（实测） |
| L8 | Air-only 快速 Build | ✓ | air 频道独立分类与触发；实测 114.4s 记录于 docs/05。ccbuild 无增量缓存（verifyCache TODO），按计划"性能只记录不优化"如实记录 |
| L9 | Example-only 快速 Reload | ✓ | examples/** 变更仅 bump reload token（服务端 <1ms），不触发任何构建（`/__stats` exampleReloads 计数实测） |
| L10 | Browser Full Reload | ✓ | reload token 轮询机制保持 V0.1 行为；V0.2 不做 HMR（计划书 §17） |
| L11 | Source Map | ✓ | dev 构建输出 `cocosair.module.js.map`（10.5MB），build.cjs 修正 sourceMappingURL 指向最终产物名 |
| L12 | Type Declaration | ✓ | `npm run build:dts`（ccbuild dtsBundler）→ `build/cocosair.module.d.ts`（`declare module "cc"`）；独立 tsc 校验 0 错误；package.json 增加 `types` 字段 |
| L13 | `verify:web-only` | ✓ | PASSED（本轮实测；763 可达文件，mesh-codec external 白名单注记不变） |
| L14 | static-model Regression | ✓ | 浏览器实测 236 draws / 0 错误（loadAssetAsync + frameObject 重写后） |
| L15 | skinned-animation Regression | ✓ | 浏览器实测 209 draws / 0 错误（buildSkeletonTree/restoreBindPose/frameObject 重写后） |
| L16 | Build Performance Baseline | ✓ | `docs/05-v02-build-performance.md`（Cold 52.1s / Air 114.4s / Min 127.1s / d.ts ~70s / Example reload <1ms） |
| L17 | Documentation | ✓ | docs/05–09 连续编号 + README Quick Start/Dev/Starter/Asset/Engine Development 增补 |

## 2. 全量验证结果（2026-09-12）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 0 错误（含修复 air/assets/gltf 死代码的 up4 相对路径与 es2019 API 兼容） |
| `npm run build` | OK，52.1s，产物 + .map |
| `npm run build:min` | OK，127.1s，2.05MB + .map |
| `npm run build:dts` | OK，81.2s，→ build/cocosair.module.d.ts（tsc 独立校验通过） |
| `npm run verify:web-only` | PASSED |
| `npm test` | 7 suites / 19 tests 全部 PASS |
| 浏览器四示例（playwright） | ALL-EXAMPLES-PASS（starter 0 错误；hello-cube/static-model/skinned-animation draws 205/236/202 且 0 错误） |

## 3. V0.2 过程中修复的问题

1. **`@babel/preset-env` 顶层缺失**：安装 esbuild 后 npm 依赖重排，根 babel.config.js 解析失败 → 显式声明 devDependency。
2. **starter ScreenAdapter 崩溃**：引擎 bundle 在 import 阶段（模块级 sys 单例）即按 id `GameCanvas` 查找画布，
   用户自定义 id 无法在运行时纠正 → starter 使用官方模板 id；约束文档化（docs/06 §约束）。
   另在 bootstrap 增加 canvas id 归一化（无冲突时）兜底。
3. **src/air/assets/gltf 死代码路径错误**：4 处 `../../../../cocos/...`（多上一级，落到仓库根）→ 修正为
   `../../../cocos/...`；`flatMap/flat`（lib es2015）改为手写展开；`Quat.normalize` 实例误用改静态调用。
4. **dev-server classify 前缀 bug**：`fs.watch` 回调路径相对被监听目录（`air/...`），原按 `src/air/` 匹配永不命中 → 归一化为仓库相对路径。
5. **build.cjs emptyDir 批量删除被本机 safe-delete shim 拦截** → 改为带时间戳的唯一 tmp 目录。
6. **dev 构建无 source map**：`sourceMap: min` → `sourceMap: true`，并搬运/改写 `.map` 引用。

## 4. 已知限制（记录不优化，计划书 §29）

- ccbuild 无增量缓存：air/engine rebuild 均为全量重编（Warm ≈ Cold，见 docs/05）。
- `fs.watch` 不响应纯 mtime touch（编辑器内容保存不受影响）。
- dev-server 内 rebuild 比独立构建慢（同机负载干扰），不代表管线差异。
- 画布 id 必须为 `GameCanvas`（import 阶段约束，详见 docs/06）。
