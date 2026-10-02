# 示例规格与验证约定

> 依据《Cocos Air — Example Specification 补充执行规范》实施。
> 更新：2026-09-19（第二轮——规格驱动验证 + stable 晋级 + 基础设施证据）。

## 总览

- **实施单位** = Example Specification（不再是名称）：每个 `examples/<id>/example.json` 承载
  §24 完整规格（Gallery Metadata + 实施合同），由机器验收。
- **45 个 Example 全部 status = stable**（40 浏览器矩阵 + 5 DevTools 会话门禁：automation 与 rc-*×4），
  晋级由规格驱动验证的证据驱动（非人工标记）。
- **API 精确绑定（§3/§14）**：primary/supporting/claims 逐字命中
  `docs/example-api-inventory.json`；E012 类（DevTools 会话教学）按 §13 使用
  `DevToolsSession.*` 冻结合同单元，且此类示例必须标 `requiresDevTools: true`
  （`spec-validate.cjs` 强制，避免被当作普通场景示例通过）。
- **API 证据（§12）**：772 条 `api.evidence`（与 772 条 `api.claims` 1:1，去重后 69 个唯一单元，
  其中 64 个落在 inventory 分层），
  行号与 validator 绑定均由 `tools/examples/spec-evidence.cjs` 自动定位/收敛：注释行与 import
  成员表不计为证据，evidence 绑定的 validator 必须在本示例 `ready/validation` 声明集合内
  （否则 DECLARE 补声明或 REBIND 改绑），`--check` 当前 0 drifted / 0 detached / 0 errors。
  冻结门禁 `spec-validate.cjs` 与回填器共用同一 `findSymbolLine` 实现，标准不松于回填器。
- **写盘纪律（F-132）**：`spec-validate.cjs` 的发布证据 `docs/evidence/spec-validation.json` **只由绿跑写出**——
  任何 issue（含故意负控与 `--strict` 下的 draft）一律拒绝覆写正典并提示改落 `--out=<非正典路径>`；
  `--out=` / `--examples-dir=` 供子集与仓库外副本运行（`--examples-dir` 缺 `--out` 直接 `EXIT=2`），
  扫到 0 例判红（反空转）。消费端断言在 jest `smoke-29`，故负控不再污染共享工作树。

## 规格驱动验证器（v2）——验证器真正消费 Example Spec

`tools/verify/example-spec-browser.cjs`（spec-driven-v2）按每个示例的规格逐条执行：

| 合同 | 执行方式 |
|---|---|
| §7 Scene Structure | inspectScene 校验 `scene.expectedGraph.nodes` 逐名在场（glTF 实例 `__N` 后缀兼容）；starter 空场景按 `allowEmpty` |
| §9 Ready | Ready 轮询：等待期望节点在场或节点数稳定（延迟加载示例）；`__airApp` 晚绑定的示例（gltf-meshopt）在模型就绪后才暴露 |
| §10 Functional | node-exists / node-count / asset-loaded（inspectAsset 运行时资产单位>0）/ material-property（materials≥1）/ transform-equals（期望节点变换可读且有限）/ no-runtime-error（错误环形缓冲 + pageerror） |
| 动画/帧差 | `animation-playing` 与 `visual.frame-diff`：多间隔双帧捕获（400/900/1400ms），整帧 readPixels + 步进统计与清屏色的像素差比率（litRatio），位置/尺寸鲁棒 |
| §8 Interaction | `interaction.steps` 非空 → 真实指针点击（预热点击 + 逐点击捕获，切换奇偶性鲁棒）+ 键盘/拖拽电池（键盘驱动示例）；`validation.interaction=frame-diff` 以交互前后帧差证明 |
| Lifecycle | `validation.lifecycle` 声明 `resource-released` → 调用示例页内 `window.__lifecycle()`（`examples/shared/asset-lifecycle.js` 安装）：真实释放持有资源 → 等两帧 + 250ms 让帧末延迟销毁落地 → `isValid` 泄漏核对 → 重新获取并挂回；再核对重载后画面非空、无新增运行期错误、`inspectAsset` 无 `DESTROYED_RESOURCE`，并以重载帧充当 §11 当期截图（11 例 PASS） |
| §10 Capability | `validation.capability` 声明 `capability-status` → 现场实例化 `new cc.GLTFLoader()` 读取 `getExtensionSupport()`，与 `validation.capabilityExpectations` 逐项比对（status 必须在允许集合内，非 `supported` 必须携带 reason）：gltf-draco / gltf-meshopt = `decoder-required`、gltf-clearcoat = `supported`（V0.5 五态合同） |
| 声明-执行一致性 | 规格声明的每个 validator id 必须有执行器真正跑过；否则合成 `declared in Example Spec but no executor ran it` FAIL（杜绝"声明未执行"计入 PASS） |
| §11 Stable 公式 | 全部规格声明检查 PASS → `status: draft→stable` 写回 example.json，`promotionEvidence = specFingerprint`（规范化哈希：排除 status/promotionEvidence，晋级写回不破坏证据绑定；指纹与晋级逻辑由 `tools/verify/example-spec-common.cjs` 单一实现，runner / DevTools 门禁 / coverage-report 共用，不再三处漂移） |

证据：`docs/evidence/examples-verified.json`（40/40 PASS，含逐项 validatorResults +
specFingerprint）+ `docs/evidence/examples/<id>.png` 截图工件。

## 规范符合性核查（§1–§26 逐条机器门禁）

结构冻结由 `spec-validate` 保证，但"规范是否真的被执行"需要另一条证据链门禁：
`tools/examples/spec-compliance-audit.cjs` → `docs/evidence/spec-compliance.json`
（45 示例 / **0 fail / 1 warn**，只报告不改写，每条 finding 带规则号 + 示例 id 可复核；
唯一 warn 是 gltf-draco 的 §25 机器可读豁免，见 Deviation-1/7）。

| 规则 | 断言 |
|---|---|
| `S3-API-BIND` / `S5-GOAL-SCOPE` | claim 逐字命中 inventory；`api.primary` 1~3 个 |
| `S6-EFFECT` / `S9-READY` | Effect Contract functional+visual 双备；Ready 不得退化为"仅 scene-ready 且场景无期望节点"的空转等待 |
| `S8-INTERACTION` / `S10-VALIDATION` | steps 与 interaction validator 成对；`validation.functional` 非空（仅 `scene-ready/no-runtime-error/node-count` 时降级 warn） |
| `S12-CLAIM-ORPHAN` / `S12-EVIDENCE` / `S12-VALIDATOR-DETACHED` / `S12-LINE` | claim↔evidence 1:1；evidence 的 validator 必须被本示例声明（否则运行期永不执行 → 不能算 verified）；行号必须落在真实代码行（注释/import 不算） |
| `S11-NO-EVIDENCE` / `S11-STALE-EVIDENCE` / `S11-SCREENSHOT` / `S11-PROMOTION-DRIFT` / `S11-LICENSE` | Stable 公式六项：当期两份门禁按 `requiresDevTools` 各自取证；证据 `specFingerprint` 必须等于当前 example.json；截图工件当期 bytes>0 且文件存在；`promotionEvidence` 与当期证据一致；license 声明存在 |
| `S15-FREEZE` / `S23-MANIFEST` / `S19–S22-GALLERY` | frozen 前置齐备；files.json 只含 Gallery 字段且 status/specStatus/promotionEvidence 与 example.json 一致（防 §23 双份漂移）；Gallery 四段（What you'll learn / APIs Used / Expected Result / Validation Status）逐字段有值 |
| `S25-LIFECYCLE`（**fail**） / `S25-LIFECYCLE-IMPL` | 资源型示例必须有 `validation.lifecycle: ["resource-released"]`（例外条件机器可读：`capabilityExpectations` 全部非 `supported` → 无已解码资产可释放，降为 warn 并给原因，不伪造 PASS）；且声明必须落到实现——示例源码里要真有 `installAssetLifecycle(...)` / `window.__lifecycle =` 安装点 |
| `S-IMPORT-RESOLVE`（fail） | 示例源码里的相对 import 必须在**真实仓库布局**下可解析。浏览器矩阵把示例目录展平到暂存工作区根，`examples/*/src/main.ts` 里写 `../shared/x.js` 在矩阵里恰好能跑、部署后却是 404（"验证器绿、部署物坏"），故用静态解析兜底 |

## Coverage：claimed / verified 严格分离

`tools/examples/coverage-report.cjs` 重写：

- **claimed** — api.claims 与 inventory 精确匹配（声明）；
- **verified** — claim 所属示例在浏览器矩阵或 DevTools 会话门禁中 PASS **且** 证据 specFingerprint
  与当前 example.json 规范化哈希一致（陈旧证据不冒充）。
- 当前：core **claimed 49 = verified 49**（717）· important 6/6 · advanced 8/8 ——
  全部声明均有运行证据支撑，零"claimed 冒充 verified"（`staleEvidenceExamples: []`）。
- verified 门禁按任务书阈值：core 100% / important ≥90% / advanced ≥80% ——
  当前诚实 FAIL（差距属 Wave 1-3 示例内容扩量，不得以 claimed 冲抵）。

## 基础设施证据（G1）

| 项 | 交付 |
|---|---|
| Gallery 发布 Artifact | `tools/verify/gallery-artifact.cjs build` → `build/examples/` 自包含静态部署物（引擎 + 解码器 + 45 示例 + files.json + 45 张缩略图；入口 esbuild 预编译为 main.boot.js，全部路径相对化） |
| 嵌套部署 + 路由回归 | `verify` 模式以 `/apps/gallery/` 嵌套前缀自宿主，Playwright 回归 13/13：静态 200 ×4 + 缩略图 ×3 + Gallery 列表渲染（45 链接）+ `#deep-link` 路由 + 3 个示例在 artifact 内真实启动 + 零页面错误（`docs/evidence/gallery-artifact.json`） |
| DevTools 示例证据 | `tools/verify/devtools-examples.cjs`：规格驱动的 V0.5.1 会话门禁，覆盖全部 5 个 `requiresDevTools` 示例（automation + rc-inspect-scene / rc-create-node / rc-capture-frame / rc-error-report）→ 5/5 PASS（详见下节） |

## DevTools 会话门禁（requiresDevTools 示例）

`tools/verify/devtools-examples.cjs` 消费每个示例自己的 Example Spec，经 bench 会话桥
（`/__debug/agent-session.js`，`BrowserRuntime` 注入 `window.__benchSession`）断言冻结合同本身，
而非"场景是否跑起来"：

| 断言 | 内容 |
|---|---|
| `attach` | 会话可得且 `app` 绑定 |
| `scene-ready` | inspectScene 返回可命名的运行中场景（非仅 DOM 就绪） |
| `node-exists` / `node-count` / `transform-equals` | inspectScene 的 `sceneId`/`nodeCount`/节点名与 `scene.expectedGraph` 比对；inspectNode 读取的局部变换三分量有限且节点名一致 |
| `inspectNode:id-stable` | 同一节点两次快照 id 一致（会话内 id 稳定性合同） |
| `dispatch:createNode` | 对真实 targetId 创建节点并复核在场 |
| `dispatch:error-code` | 直连 `__benchSession.dispatch` 打非法 targetId：必须 `ok=false` + 稳定错误码（STALE_TARGET / INVALID_ARGUMENT / OUT_OF_SCOPE）且节点数不变（零副作用） |
| `captureFrame` / `visible-frame` | PNG > 512B；中心像素非清屏色 |
| `material-property` / `asset-loaded` | inspectAsset 报告：Material 计数达标且无 MISSING_DEPENDENCY / DESTROYED_RESOURCE / TYPE_MISMATCH 诊断（与浏览器矩阵同语义） |
| `getRuntimeErrors` / `no-runtime-error` | 错误环形缓冲结构合法且为空 + 无 pageerror |
| `session-self-report` | 示例页内 `__rcState` 存在、`fail===0`、无 `false` 值（把示例自己的断言计入门禁，console FAIL 不再静默通过） |
| `detach:SESSION_CLOSED` / `detach:loop-alive` | `close()` 后再 dispatch 必须返回 SESSION_CLOSED；detach 后主渲染循环仍存活（`Director.EVENT_AFTER_DRAW` 帧计数增长） |
| `screenshot-current` | 当期必须取帧并写入 `docs/evidence/examples/<id>.png`（bytes>0），旧截图不得冒充证据 |
| 声明-执行一致性 | 规格 `ready/validation` 声明的每个 validator id 必须由本门禁执行器真正跑过，否则合成 FAIL（与浏览器矩阵同一规则） |
| `runtime-bundle-boundary` | 全局：runtime-only bundle 不含 DevTools/agent-session 实现 |

证据：`docs/evidence/devtools-examples.json`（per-example `result`/`specFingerprint`/
`validatorResults`/`artifact`，与浏览器矩阵同构，故 coverage-report 可直接消费）+
`docs/evidence/examples/rc-*.png`。

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
| E012 devtools-inspect-scene | automation + rc-inspect-scene / rc-create-node / rc-capture-frame / rc-error-report（requiresDevTools，会话门禁证据 5/5） | stable |

**G1 状态：11/12 Pilot 正向目标 stable；E008 的 Draco 正向加载路径 BLOCKED（非替代通过）——
G1 不宣称完整**，Draco 正向解码待宿主浏览器 glue 以可哈希固定来源纳入随包工件后闭环。

## Deviations（诚实记录）

1. **E008 Draco 正向模式**：shipped 浏览器工件不含 draco3d 浏览器 glue（V0.5 打包安全决策：
   `build/gltf-decoders/MANIFEST.md` 记录 draco3dgltf npm 无 Node 以外构建、GitHub release
   无哈希固定来源）。gltf-draco 实现合同教学路径；完整 configure→load→visible 由
   **gltf-meshopt**（官方 meshopt_decoder.mjs 随包）演示同等解码器注入流程。
2. **引擎发现（待追踪）**：PointLight/SpotLight 不跟随节点变换（灯光节点移动/埋地后渲染像素不变，
   方块缩放对照证明渲染管线本身活跃）——light-point/light-spot 的 frame-diff 断言因此移除，
   灯光语义仍由场景存在性 + 可见性证明。属引擎层问题，已从 Example 层面规避并记录。
2b. **取景偏移已修复（不再是偏离项，记为已闭环）**：Gallery/独立打开时主体落画面左下，根因两条：
   ① 大量示例用固定俯仰的样板相机位姿而未对准主体，已改为 `setPosition(...) + lookAt(主体中心)`
   （24 例；`shared/scene-kit.js` 的 `setupCamera` 新增 `lookAt` 选项）；
   ② `utils.frameObject` 在 `renderer.model` 尚未随场景激活创建（或包围盒为空，如蒙皮网格首帧前）时
   静默降级为「节点原点 + fallbackDistance」，而节点常放在地面处 → 中心偏出画面。已在
   `src/air/utils/frame-object.ts` 补静态包围盒回退（`Mesh.struct.minPosition/maxPosition × node.worldMatrix`），
   回归用例见 `test/smoke/smoke-08-frame-object.test.ts`「framing uses mesh static bounds when
   renderer.model is not created yet」（移除该回退即 RED，已做负向控制）。
   `node-scale`（改 `frameObject(camera, scene)` 使基准块同框）与 `transform`（视点锚在旋转扫掠中心）
   为同类修正。修复后全 44 例逐帧测量主体投影偏移 dx=dy≈0，残留位移均为设计意图（运动/旋转动画、
   可切换 lookAt 目标、竖直层级、地面平面）。
3. **tween-basic 重写**：原实现以 setInterval 冒充补间，已重写为真正的 `tween()` 链
   （.to 多段 + sineInOut + onComplete 续接）。
4. **API Coverage 数值**：core verified 50/717（7.0%）——验证体系已建立且 claimed=verified
   零冒充（64 个入分母的唯一单元全部当期取证）；数值增长依赖 Wave 1-3 示例内容扩展。
5. **specFingerprint 只覆盖 example.json**：示例源码（`main.ts` / `index.html`）改动不会使
   既有证据失配，§21 `lastVerifiedRevision` 式源码漂移检测尚未建立。本轮为 automation / rc-*
   补写页内 `__rcState` 自检即为一例：源码已变而指纹不变，只能靠人工重跑会话门禁才刷新。
6. **coverageRequired 未裁剪分母**：tier 统计仍以全量 inventory（core 717 / important 793 /
   advanced 3219）为分母，未按 §23 `coverageRequired` 子集裁剪；inventory 亦无
   `documented-only` 状态字段，故 §26 的 documented-only/uncovered 两项暂无法机器度量。
7. **§25「资源 Example：Lifecycle Contract」**：12 个资源型示例中 **11 个已闭环**（gltf-basic /
   clearcoat / meshopt / morph / skin / viewer、material-transparent、mesh-multi-material、
   static-model、texture-basic、runtime-asset-release）：`validation.lifecycle: ["resource-released"]`
   + `examples/shared/asset-lifecycle.js` 安装 `window.__lifecycle()`，浏览器矩阵真实执行
   释放→泄漏核对→重新获取，11/11 PASS（`held` 2~8、`leaked=0`、`reloaded=true`）。
   **gltf-draco 仍 BLOCKED（非 PASS）**：E008 的解码器不在随包工件内（Deviation-1），示例从未持有
   已解码资产，生命周期合同无从成立；`spec-compliance-audit` 以机器可读条件
   （`capabilityExpectations` 全部非 `supported`）把它降为 1 条 warn，其余资源示例空 lifecycle 直接 fail。
   因此 §25 的诚实口径是 **11/12 verified + 1 BLOCKED**，不是 12/12。
8. **`asset-loaded` 语义偏弱（已知弱点，未修）**：验证器只要求运行期资产登记簿 unit 总数 > 0，
   与 `spec.assets` 声明无绑定 —— gltf-draco 在"加载故意失败"下仍以 `asset-loaded` PASS
   （detail `spec assets=1 runtime asset units=3`，计数来自材质/网格等注册项）。因此
   `asset-loaded` 单独不构成"资源加载成功"的证明；资源类示例目前由 `node-exists` + 画面非空 +
   lifecycle 合同共同兜底。收紧需要改 validator 合同并重写所有相关示例规格（另轮处理）。
9. **暂存展平会掩盖相对 import 路径**：`prepareWorkspace` 把示例目录整体拷进工作区根，
   `examples/*/src/main.ts` 写 `../shared/x.js` 在矩阵里恰好可解析，而真实布局与 Gallery 部署物里是 404
   （§25 接线时踩中：artifact build 直接失败）。现示例源码统一按真实布局写 `../../shared/`，
   暂存层按文件深度重算说明符，并加 `S-IMPORT-RESOLVE` fail 门禁兜底；
   但这只覆盖相对 import，`fetch('...')` 等字符串路径仍无同类检查。
10. **gltf-viewer 不声明 `animation-playing`**：其 `sample(0)` 设计为"播后即停"（拖动时间轴看单帧），
   且默认模型 `BoxTextured.glb` 不含任何剪辑 → 该示例默认状态下任何动画运行期断言都不可能成立。
   `Animation` / `AnimationClip` 两条证据因此绑到当期真实执行的 `asset-loaded`（claims 声明保留、
   代码行证据保留），而不是伪造一个通过的 `animation-playing`；若要恢复动画合同，需改示例行为
   （自动播放或换带剪辑的默认模型）后重新声明。

## Wave 开工条件（§17/§18）

- Wave 1 的 100% Frozen Spec 前置已满足（frozen 由机器门禁定义）；
- 新示例进入 Wave：Example Spec → spec-validate（frozen）→ 实现 →
  规格驱动验证（浏览器矩阵或 DevTools 会话门禁 PASS）→ spec-evidence --check 无漂移无脱钩 →
  证据驱动晋级 stable → `spec-compliance-audit` 0 fail（§11 当期证据链闭环）。
