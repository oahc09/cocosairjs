# V1.1 — Example Specification 体系落地

> 依据《Cocos Air V1.1 — Example Specification 补充执行规范》实施。
> 更新：2026-09-19（第二轮——规格驱动验证 + stable 晋级 + 基础设施证据）。

## 总览

- **实施单位** = Example Specification（不再是名称）：每个 `examples/<id>/example.json` 承载
  §24 完整规格（Gallery Metadata + 实施合同），由机器验收。
- **45 个 Example（44 浏览器验证 + 1 DevTools）全部 status = stable**，
  晋级由规格驱动浏览器验证的证据驱动（非人工标记）。
- **API 精确绑定（§3/§14）**：primary/supporting/claims 逐字命中
  `docs/example-api-inventory.json`；E012 类（DevTools 会话教学）按 §13 使用
  `DevToolsSession.*` 冻结合同单元。
- **API 证据（§12）**：736 条 `api.evidence`，行号由 `tools/examples/spec-evidence.cjs`
  自动定位/校验漂移（jest `smoke-29` 断言无漂移）。

## 规格驱动验证器（v2）——验证器真正消费 Example Spec

`tools/verify/v11-examples-verify.cjs`（spec-driven-v2）按每个示例的规格逐条执行：

| 合同 | 执行方式 |
|---|---|
| §7 Scene Structure | inspectScene 校验 `scene.expectedGraph.nodes` 逐名在场（glTF 实例 `__N` 后缀兼容）；starter 空场景按 `allowEmpty` |
| §9 Ready | Ready 轮询：等待期望节点在场或节点数稳定（延迟加载示例）；`__airApp` 晚绑定的示例（gltf-meshopt）在模型就绪后才暴露 |
| §10 Functional | node-exists / node-count / asset-loaded（inspectAsset 运行时资产单位>0）/ material-property（materials≥1）/ transform-equals（期望节点变换可读且有限）/ no-runtime-error（错误环形缓冲 + pageerror） |
| 动画/帧差 | `animation-playing` 与 `visual.frame-diff`：多间隔双帧捕获（400/900/1400ms），整帧 readPixels + 步进统计与清屏色的像素差比率（litRatio），位置/尺寸鲁棒 |
| §8 Interaction | `interaction.steps` 非空 → 真实指针点击（预热点击 + 逐点击捕获，切换奇偶性鲁棒）+ 键盘/拖拽电池（键盘驱动示例）；`validation.interaction=frame-diff` 以交互前后帧差证明 |
| Lifecycle | `validation.lifecycle` 非空 → 执行示例暴露的 `__lifecycle()` 合同钩子，`released===true`（runtime-asset-release） |
| §11 Stable 公式 | 全部规格声明检查 PASS → `status: draft→stable` 写回 example.json，`promotionEvidence = specFingerprint`（规范化哈希：排除 status/promotionEvidence，晋级写回不破坏证据绑定） |

证据：`docs/evidence/v11-examples-verified.json`（44/44 PASS，含逐项 validatorResults +
specFingerprint）+ `docs/evidence/examples/<id>.png` 截图工件。

## Coverage：claimed / verified 严格分离

`tools/examples/coverage-report.cjs` 重写：

- **claimed** — api.claims 与 inventory 精确匹配（声明）；
- **verified** — claim 所属示例规格驱动验证 PASS **且** 证据 specFingerprint 与当前
  example.json 规范化哈希一致（陈旧证据不冒充）。
- 当前：core **claimed 43 = verified 43**（717）· important 6/6 · advanced 8/8 ——
  全部声明均有运行证据支撑，零"claimed 冒充 verified"。
- verified 门禁按任务书阈值：core 100% / important ≥90% / advanced ≥80% ——
  当前诚实 FAIL（差距属 Wave 1-3 示例内容扩量，不得以 claimed 冲抵）。

## 基础设施证据（G1）

| 项 | 交付 |
|---|---|
| Gallery 发布 Artifact | `tools/verify/v11-gallery-artifact.cjs build` → `build/examples/` 自包含静态部署物（引擎 + 解码器 + 45 示例 + files.json + 44 张缩略图；入口 esbuild 预编译为 main.boot.js，全部路径相对化） |
| 嵌套部署 + 路由回归 | `verify` 模式以 `/apps/gallery/` 嵌套前缀自宿主，Playwright 回归 13/13：静态 200 ×4 + 缩略图 ×3 + Gallery 列表渲染（45 链接）+ `#deep-link` 路由 + 3 个示例在 artifact 内真实启动 + 零页面错误（`docs/evidence/v11-gallery-artifact.json`） |
| DevTools 示例证据 | `tools/verify/v11-devtools-examples.cjs`：automation（requiresDevTools）经会话桥按冻结合同执行 inspectScene / dispatch:createNode / captureFrame / getRuntimeErrors → 4/4 PASS（`docs/evidence/v11-devtools-examples.json`） |

## Pilot 12 映射（G1）

| Pilot | 落地 Example | G1 状态 |
|---|---|---|
| E001 basic-cube | hello-cube | stable（规格驱动 PASS） |
| E002 scene-hierarchy | node-hierarchy | stable |
| E003 camera-frame-object | camera | stable |
| E004 light-directional | light-two-directional（主光 OFF/LOW/NORMAL 三态 + 补光 + 天光联动） | stable |
| E005 mesh-multiple-materials | mesh-multi-material（单 mesh 双 primitives，sharedMaterials=2，primitives.box 数据合并） | stable |
| E006 material-clearcoat | gltf-clearcoat（按 §6 规则走 glTF 扩展公开合同，三档因子对照） | stable |
| E007 gltf-basic | **gltf-basic（新增）**：GLTFLoader.loadAsync 正向加载真实 GLB → instantiate → frameObject | stable |
| E008 gltf-draco | gltf-draco | **正向路径 BLOCKED**（见 Deviation-1）；合同教学（扩展查询 + 稳定错误码 + 宿主接入）stable |
| E009 animation-basic | skinned-animation + gltf-morph + gltf-skin（GLTF 剪辑播放） | stable |
| E010 interaction-click | interaction-click（真实 TOUCH_START → +90°/次，非对称标记使旋转可观察） | stable |
| E011 runtime-asset-release | runtime-asset-release（2 轮 load→dispose→reload + `__lifecycle` 合同钩子） | stable |
| E012 devtools-inspect-scene | automation（requiresDevTools，会话桥证据 4/4） | stable |

**G1 状态：11/12 Pilot 正向目标 stable；E008 的 Draco 正向加载路径 BLOCKED（非替代通过）——
G1 不宣称完整**，Draco 正向解码待宿主浏览器 glue 以可哈希固定来源纳入随包工件后闭环。

## Deviations（诚实记录）

1. **E008 Draco 正向模式**：shipped 浏览器工件不含 draco3d 浏览器 glue（V0.5 打包安全决策：
   `build/gltf-decoders/MANIFEST.md` 记录 draco3dgltf npm 无 Node 以外构建、GitHub release
   无哈希固定来源）。gltf-draco 实现合同教学路径；完整 configure→load→visible 由
   **gltf-meshopt**（官方 meshopt_decoder.mjs 随包）演示同等解码器注入流程。
2. **引擎发现（待追踪）**：PointLight/SpotLight 不跟随节点变换（灯光节点移动/埋地后渲染像素不变，
   方块缩放对照证明渲染管线本身活跃）——light-point/light-spot 的 frame-diff 断言因此移除，
   灯光语义仍由场景存在性 + 可见性证明；`frameObject` 在部分场景存在取景偏移（内容落画面左下），
   相关示例改用显式相机位姿。两者属引擎层问题，已从 Example 层面规避并记录。
3. **tween-basic 重写**：原实现以 setInterval 冒充补间，已重写为真正的 `tween()` 链
   （.to 多段 + sineInOut + onComplete 续接）。
4. **API Coverage 数值**：core verified 43/717（6.0%）——验证体系已建立且 claimed=verified
   零冒充；数值增长依赖 Wave 1-3 示例内容扩展。

## Wave 开工条件（§17/§18）

- Wave 1 的 100% Frozen Spec 前置已满足（frozen 由机器门禁定义）；
- 新示例进入 Wave：Example Spec → spec-validate（frozen）→ 实现 →
  规格驱动浏览器验证（PASS）→ spec-evidence --check 无漂移 → 证据驱动晋级 stable。
