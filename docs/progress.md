# Cocos Air V0.1 — 进展日志

> 基线：`cocos4 @ 4.0.0-alpha.33 (snapshot 2026-09-12)`
> 依据：《Cocos Air V0.1 — cocos4 Web-TS Engine Extraction 任务计划书》
> 详细验收证据见 `docs/acceptance-report.md`。

---

## 2026-09-12（三轮）：Phase 18/19 收尾 → **V0.1 RC**

- **首轮 git commit**：`f1bc676`（960 文件，工作区清洁；未 push，按约定待用户确认）。
- **Phase 18 第二轮裁剪：结论为"无需删除"**。用与 build.cjs 一致的完整 feature 集重建依赖图
  （此前仅用 'air' 单 feature 分析，曾产生 91 个假阳性 UNREACHABLE——包括运行时在用的
  webgl 后端与 legacy pipeline，教训已固化到 dep-graph.cjs 注释）。真实闭包 839/843 可达，
  余 4 个均为必须保留的锚点（module-override 对 ×2、源码统一入口 index.ts、纯类型声明）。
  物理裁剪已在 Phase 4 extraction 完成，当前 src 树即精确闭包——符合"Minimize Diff From Upstream"。
- **Phase 19 License audit 复核**：版权头覆盖 723/788（缺 65 个为上游自身未带头文件，非剥离）；
  上游修改 4 处以 upstream-file-map.json 为权威清单；THIRD_PARTY_LICENSES.md 已同步更新。
- **README 更新**：V0.1 RC 标识、真实闭包数据、Skeleton.joints 路径注意事项、蒙皮示例通过状态。
- **新增 `tools/verify/examples-smoke.cjs`**：三示例浏览器冒烟回归（0 错误 + 内容像素判定），
  RC 验证实测三例 PASS。
- **RC 最终全量验证（全绿）**：typecheck 0 错误；build 45.6s / build:min 61.4s；
  verify:web-only PASSED；test 7/7；三示例浏览器冒烟 PASS。
- **V0.1 RC 标记**（package.json 版本号保持 0.1.0 未变，见版本号策略）。

**计划书 §33 执行顺序 1–24 全部完成。**

---

## 2026-09-12（二轮）：L13 蒙皮动画修复完成 → V0.1 验收矩阵 15/15 PASS

### 结论

**V0.1 全部 15 个验收等级（L0–L14）通过**，Definition of Done 16 项条件中仅剩
流程性收尾（首轮 git commit、License audit、README）。

### L13 三个叠加根因与修复

| # | 层面 | 根因 | 修复 |
|---|---|---|---|
| 1 | 着色器 | glsl4 fixture 的 `u32vec4 a_joints`（Vulkan GLSL 类型）在 Air 降写器剥除扩展后残留，ESSL 编译 `syntax error` → 蒙皮变体程序创建失败（即一轮报告的 "no valid shader program in use"） | `register.ts` 降写器将 `u32vecN → vecN`（匹配 RGBA32F float 属性通路） |
| 2 | 数据绑定 | `register.ts` 的 `LOCAL_BLOCK_BINDINGS` 缺 `CCSkinning` 键，fallback 到 binding 0 与 CCLocal 冲突，`cc_joints` 读到世界矩阵数据 | 映射 `CCSkinning: 3`（= `UBOSkinning.BINDING` = UBO_SKINNING_TEXTURE） |
| 3 | 示例资产 | `skeleton.joints` 需为相对 skinningRoot 的完整路径，示例写了平铺名 → bone1/bone2 未注册，关节矩阵为零 | `examples/skinned-animation/main.js` 改为 `bone0/bone1`、`bone0/bone1/bone2` |

### 附带修复：`npm run build` DebugInfos 解析失败

独立 src 树下 ccbuild（node-resolve）无法解析扩展名less 的 `../../../DebugInfos`
（同工具链对原始 cocos4-vulkan 树可解析）。修复：`debug.ts` import 显式 `.json`
扩展 + 根 tsconfig 增加 `resolveJsonModule`。已记录 upstream-file-map.json。

### 回归结果（全绿）

- `npm run typecheck` — 0 错误
- `npm run build` / `npm run build:min` — 成功（dev ~48s / min ~36s）
- `npm run verify:web-only` — PASSED
- `npm test` — 4 suites / 7 tests 全过
- 浏览器实测：蒙皮变体编译链接成功、3 关节注册、网格逐帧变形
  （4 帧 bbox w=142→176→252→234），证据 `docs/evidence/skinned-animation-pose1~3.png`

### 剩余已知事项（非阻塞）

1. 蒙皮材质 `setProperty('mainColor')` 未生效（外观级，属性名与 fixtures 对齐问题）
2. WebGL 每帧 `INVALID_ENUM: getParameter` 警告（能力查询路径，待查）
3. WebGL1 为当前设备主路径（API.WEBGL），WebGL2 源已备好未启用
4. AnimationClip 曲线资产仍需 Creator 管线（V0.1 以 Code First 骨骼驱动替代）

### 下一步（按计划书 §33）

1. **首轮 git commit**（当前仓库 0 commit，全部文件 untracked——版本锚点缺失）
2. Phase 18 第二轮源码裁剪（L 全通过后允许开始）
3. Phase 19 License / Third-Party audit
4. README → V0.1 RC

---

## 2026-09-12（一轮）：V0.1 主体完成

- Phase 0–3：基线记录（UPSTREAM.md / 00-upstream-baseline.md，上游 SHA 不可得记
  Deviation-01）、Web Feature Set 实测（01-web-feature-set.md）、依赖图
  （749/839 文件）、Extraction Manifest + upstream-file-map
- Phase 4–8：src/ 独立树（841 文件，闭包较上游 -40%）、native/editor/jsb 物理移除、
  typecheck / build / verify:web-only 全部通过
- Phase 9–14：Air Bootstrap、hello-cube、static-model、dev loop（23.8s 全链路）、
  baseline 对比（17-baseline-comparison.md）全部 PASS
- L13 蒙皮动画当时为部分通过（骨骼/蒙皮/动画数据链路 OK，蒙皮变体光栅化失败）——
  已于二轮修复（见上）

---

## 2026-09-12（V0.2）：Code First DX & SDK 化 → **V0.2 RC**

依据《Cocos Air V0.2 — Code First DX & SDK 化任务计划书（与 V0.1 连续版）》，L0–L17 全部通过：

- **Task 1/6/7 核心 API**：`createAirApp` 支持 `canvas: string(selector) | HTMLCanvasElement`，
  新增 `AirApp.getScene()`；`src/air/utils/` 新增 `load-asset.ts`（Promise Asset Helper）、
  `skeleton-tree.ts` / `restore-bind-pose.ts`（骨骼工具集）、`frame-object.ts`（相机取景）。
- **Task 12 examples**：新增 `examples/starter/`（最小模板）与 `examples/shared/scene-kit.js`；
  static-model / skinned-animation 改用 V0.2 helper 重写，四示例浏览器验证 ALL-PASS
  （starter 0 错误空场景；hello-cube 205 / static-model 236 / skinned 202 draws，均 0 错误）。
- **Task 7/8/9/10 dev loop**：dev-server 三频道分类（engine/air/example），
  example 变更仅 reload（服务端 <1ms，绝不触发构建）；example .ts 用 esbuild 即时编译
  （target es2022，支持 top-level await）+ importmap 注入（`cocosair` → bundle）；
  构建失败浏览器顶部错误横幅 + `/__build_status`；频道耗时 `/__stats`。
- **Task 10/11 Source Map + d.ts**：dev 构建附 `.map`（10.5MB，修正 sourceMappingURL 指向）；
  `npm run build:dts`（ccbuild dtsBundler）→ `build/cocosair.module.d.ts`，
  package.json 增加 `types` 字段。
- **Task 16/17 性能基线**：docs/05（Cold 52.1s / Air rebuild 114.4s / Min 127.1s / d.ts 81.2s /
  Example reload <1ms）；ccbuild 无增量缓存如实记录，未更换 bundler。
- **测试**：新增 smoke-05（promise asset helper）、smoke-06（skeleton utils）；
  全量 jest 7 suites / 22 tests PASS；typecheck 0 错误（顺带修复 air/assets/gltf 死代码的
  up4 相对路径与 es2019 API 兼容）；verify:web-only PASSED。
- **过程修复**：`@babel/preset-env` 顶层依赖显式化（npm 重排导致缺失）；starter 的
  GameCanvas id 约束（引擎 import 阶段即查找，文档化于 docs/06）；build.cjs/dts 脚本
  对本机 safe-delete shim 的批量删除拦截做降级（唯一 tmp 目录 / rename 移出 / finally 拷贝产物）。
- **文档**：docs/05–09 连续编号 + `docs/acceptance-report-v02.md` + README Quick Start 增补。
- **V0.2 RC 标记**（package.json 版本号保持 0.1.0 未变；commit 后本地 tag `v0.2.0-rc.1`，不 push）。
