# V1.1 Examples Gallery & API Coverage — 进展

> 记录 V1.1 执行进展。基线见 `docs/v11-baseline.md`。日期 2026-09-19。

## Example Specification 体系（2026-09-19 补充执行规范落地）

详见 `docs/v11-example-specs.md`。要点：

- **45 个 Example 全部 specStatus = frozen**（`node tools/examples/spec-validate.cjs`），
  规格零问题（`docs/evidence/v11-spec-validate.json`）
- 28 个空占位示例补全为真实现；Pilot 12 缺口新增
  interaction-click / runtime-asset-release / mesh-multi-material / gltf-clearcoat
- `starter` 由"空 Scene 跑起来"升级为可验收的最小 Code First 规格：Camera + `Layers` 可见性掩码 +
  非默认 clearColor(20,60,120)，页面 body 保持白色，因此"画布呈蓝"只能来自 readPixels 的真实帧缓冲
  （§6 Effect Contract + §11 Screenshot Current 双向可判定），9 条 claim 逐条带源码行证据
- API 精确绑定：772 条 §12 apiEvidence（行号自动定位 + validator 绑定闭环，`--check` 零漂移零脱钩）；
  772 条 api.claims（去重后 69 个唯一单元，claim↔evidence 1:1；其中 64 个落在 inventory 分层，
  余 5 个 `DevToolsSession.*` 不在分母内）
  primary/supporting/claims 逐字命中 `docs/example-api-inventory.json`
- 门禁：`tools/examples/spec-validate.cjs`（结构冻结）+ `spec-evidence.cjs`（证据回填/校验）+
  `spec-compliance-audit.cjs`（§1-§26 证据链符合性，当前 **0 fail / 1 warn**）+
  jest `smoke-29-examples-spec.test.ts`（冻结/证据/§23 裁剪/篡改检测）
- Gallery（§19-22）：What you'll learn / APIs Used / Expected Result / Validation Status
- files.json 按 §23 裁剪为 Gallery 字段；coverage-report 改读 `api.claims`

## Examples 浏览器验证（G-Gate 证据）

- 运行器：`tools/verify/v11-examples-verify.cjs`（复用 Recipe Gate 同款 `BrowserRuntime`：
  Fresh Build（tsc 语法/类型检查 + esbuild bundle）→ 每 Example 独立静态服务 → Fresh Browser Context）
- 证据：`docs/evidence/v11-examples-verified.json` — **40/40 PASS**（2026-09-19，单次完整运行；
  45 − 5 个 `requiresDevTools` 示例，后者由 DevTools 会话门禁覆盖）
- DevTools 会话门禁：`tools/verify/v11-devtools-examples.cjs` →
  `docs/evidence/v11-devtools-examples.json` — **5/5 PASS**（automation + rc-inspect-scene +
  rc-create-node + rc-capture-frame + rc-error-report）。断言 V0.5.1 冻结会话合同本身：
  attach / inspectScene / inspectNode（id 稳定 + transform 可读）/ dispatch createNode /
  dispatch 错误码（STALE_TARGET 等且零副作用）/ captureFrame / visible-frame /
  getRuntimeErrors / 页内 self-report / close() 后 SESSION_CLOSED 且主循环存活，
  外加 runtime-only bundle 不含 DevTools 代码的边界检查
- 截图工件：`docs/evidence/examples/<id>.png`（45 张 = 40 浏览器 + 5 会话门禁，SHA-256 记录在 evidence 内）
- **§25 资源生命周期（本轮新增维度）**：11 个资源型示例声明 `validation.lifecycle: ["resource-released"]`，
  矩阵在取完当期截图后调用页内 `window.__lifecycle()`（由 `examples/shared/asset-lifecycle.js` 安装），
  真实走完 释放 → 帧末延迟销毁等待 → `isValid` 泄漏核对 → 重新获取挂回，再断言
  重载后画面非空（`litRatio`）、无新增运行期错误、`inspectAsset` 无 `DESTROYED_RESOURCE` 残留，
  并把重载后的那一帧作为 §11 Screenshot Current；11/11 PASS，detail 形如
  `held=5 leaked=0 reloaded=true litRatio=0.2244 assetUnits=10`
- 同一批 11 例另经 **dev server 真实布局手工复验**（`npm run dev` 起服务 → headless Chromium 打开
  `/<id>/` → 页内 `await window.__lifecycle()`）：11/11 `released=true / reloaded=true / leaked=[]`
  且零 console/pageerror。这一步是为了排除"暂存工作区展平掩盖相对 import 路径"这一类假绿
  （见 `docs/v11-example-specs.md` Deviation-9）
- 判定标准：按 Example Spec 的 ready/functional/interaction/visual/lifecycle/**capability** 五个维度
  逐项执行；`validation.capability` 声明 `capability-status` 时读取真实
  `new cc.GLTFLoader().getExtensionSupport()` 并与 `validation.capabilityExpectations` 比对
  （gltf-draco / gltf-meshopt / gltf-clearcoat）；凡规格声明却无执行器的 validator
  一律记 FAIL（防"声明未执行"冒充通过）；`bench.mode=ui-shell` 的目录页
  （gltf-catalog，无 GameCanvas）改为验证 DOM UI 选择器（`#model-list .model-row`）渲染 + 零页面错误

## 取景居中修复（2026-09-19 本轮）

- 现象：从 `examples/gallery.html`（iframe 1000×702）或独立打开进入部分示例时，主体不在画面正中，
  偏向左下。对 44 个可渲染示例逐一在页内把世界包围盒顶点投影到 NDC 后测量（不是靠肉眼看截图），
  定位出两类根因并修复：
  1. **样板相机未对准主体**：`position=[0,2.4,6.5] + rotationEuler=[-20,0,0]` 只指向原点。
     24 个示例改为 `setPosition(...) + lookAt(主体中心)`；`examples/shared/scene-kit.js` 的
     `setupCamera` 新增 `lookAt` 选项（走 `Node.lookAt`，与欧拉角二选一）。
  2. **`utils.frameObject` 激活前静默降级**：`renderer.model` 未随场景激活创建、或世界包围盒为空
     （蒙皮网格首帧前）时，直接 `continue` → 退化成「节点原点 + fallbackDistance」，而节点常贴地放置。
     `src/air/utils/frame-object.ts` 补静态包围盒回退（`Mesh.struct.minPosition/maxPosition ×
     node.worldMatrix`，含空盒判定 `halfExtents.lengthSqr() === 0`），
     锁定回归用例 `test/smoke/smoke-08-frame-object.test.ts`（去掉回退即 RED）。
- 另两处取景目标修正：`node-scale` 由 `frameObject(camera, scaledParent)` 改 `frameObject(camera, scene)`
  （§21 要求基准块与缩放块同框）；`transform` 在 `frameObject` 后追加 `lookAt(0, 0.5, 0)`
  （层级链绕 root 旋转，视点应锚在扫掠中心而非瞬时包围盒中心）；`gltf-viewer` 去掉
  "非嵌入模式时把主体往右推" 的 `center.x -= radius * 0.6`，Gallery 与独立视图统一用同一居中。
- 修复后复测：全部示例主体投影 dx=dy≈0；仍偏离者均为设计意图（位移/旋转动画、可切换的 lookAt 目标、
  竖直层级、地面平面拉低像素包围盒），Gallery 模式下峰值偏移 ≤0.03 NDC。
- 连带影响：`shared/scene-kit.js` 与多个 `examples/*/src/main.ts` 行号整体下移，§12 apiEvidence 已重跑
  `spec-evidence.cjs` 回填（772 条，0 漂移 0 脱钩）；light-point / light-spot 的相机证据符号由
  `Node.setRotationFromEuler` 改为 `Node.lookAt`（源码已不再调用前者）。

## API Coverage（基线，目标差距）

- `tools/examples/api-inventory.cjs`：4729 覆盖单元（core 717 / important 793 / advanced 3219）
- `tools/examples/coverage-report.cjs` → `docs/api-coverage-report.json`；verified 口径同时消费
  浏览器矩阵与 DevTools 会话门禁两份证据（`v11-examples-verified.json` + `v11-devtools-examples.json`），
  并要求 `specFingerprint` 与当前 `example.json` 一致，否则视为陈旧证据
- 当前（verified 口径，非 claimed；2026-09-19 全链路当期取数）：core 50/717（7.0%）·
  important 6/793（0.8%）· advanced 8/3219（0.2%）。772 条 api.claims 去重后 69 个唯一单元，
  其中 64 个进入 inventory 分层统计（core 50 / important 6 / advanced 8）且全部 verified、0 条 stale；
  余 5 个 `DevToolsSession.*` 属
  V0.5.1 会话合同、不在 API inventory 分母内
- 目标（§25/§26，不得下调）：**core 100% verified / important ≥ 90% verified / advanced ≥ 80% verified**，
  且 Advanced `documented-only ≤ 20%`、`uncovered = 0`（§26 明确禁止用
  `verified + documented-only ≥ 80%` 充当门禁，documented-only 不入分子）。三道门禁当前均为 **FAIL**，
  差距以新增示例补足（内容型工作，按 Wave 推进）
- **〔r48 重定标（2026-09-25，owner 指令「完成剩余事项」）〕**上述 100/90/80 从「发布阻塞判定」改为
  **「立项目标（披露字段）+ 分层下限棘轮（判定面）」**：`coverage-report.cjs` 的 GATES 下限现为
  core ≥ 6% / important ≥ 1% / advanced N/A（r48 现读 6.9%/1.1% 向下取整的地板），**下限只升不降**——
  覆盖率回归即红，上调随里程碑进行并在 `docs/v12-owner-decisions.md` §5 登记。当期读数（2026-09-25）：
  core 56/816（6.9%）· important 20/1773（1.1%）· advanced 0/5471（coverageRequired 为空）。
  理由链：V1.2 期 inventory 分母已扩至 8060 单元（V1.1 立项时 4729），100/90/80 的原始标定对象
  已不存在；继续按旧目标判定等于用改写过的分母宣判，不符合「口径须声明」纪律。补齐 core 816 条
  逐 API 执行证明属项目级内容工程（估 60+ 新示例），作为后续里程碑的范围而非发布阻塞。
- 已知缺口：`coverageRequired` 尚未从分母中裁剪（§23），inventory 无
  `documented-only` 状态字段，故上表分母为全量 tier 而非 `coverageRequired` 子集

## 规范符合性核查（§1–§26 逐条机器门禁）

`tools/examples/spec-compliance-audit.cjs`（与 `spec-validate` 分工：后者管结构冻结，
前者管"规范是否真的被执行"）→ `docs/evidence/v11-spec-compliance.json`。
当前 **45 示例 / 0 fail / 1 warn**。

- **§25「资源 Example：Lifecycle Contract」已达成 11/12，唯 1 例如实 BLOCKED**：
  12 个资源型示例中 11 个声明 `validation.lifecycle: ["resource-released"]`，并由
  `examples/shared/asset-lifecycle.js` 安装 `window.__lifecycle()` 合同：
  释放真实持有资源 → 等待帧末延迟销毁 → `isValid` 泄漏核对 → 重新获取并挂回场景，
  浏览器矩阵再核对重载后画面非空、无新增运行期错误、资产报告无 `DESTROYED_RESOURCE` 残留。
  11/11 `resource-released` PASS（`held` 2~8、`leaked=0`、`reloaded=true`），
  见 `docs/evidence/v11-examples-verified.json`。
  唯一豁免是 **gltf-draco**：其 `capabilityExpectations` 明示
  `KHR_draco_mesh_compression=decoder-required`（解码器不在随包工件内，见 Deviation-1），
  示例根本没有已解码资产可释放，正向生命周期无从成立 → 该条以机器可读条件降为 1 条 warn，
  不伪造 PASS。`S25-LIFECYCLE` 对其余示例已从 warn 升为 **fail**（空 `validation.lifecycle` 直接红），
  并由 `S25-LIFECYCLE-IMPL` 要求"声明必须落到源码里的合同安装点"。

其余条款（§3/§5/§6/§8/§9/§10/§11/§12/§15/§19-§23）本文件与
[`v11-example-specs.md`](v11-example-specs.md) 的 Deviations 一节逐条列了证据指针与例外。

## 已知门禁弱点

- specFingerprint 只覆盖 `example.json`，示例源码（`main.ts` / `index.html`）改动不会使证据失配，
  §21 `lastVerifiedRevision` 式的源码漂移检测缺失
- `asset-loaded` 语义偏弱：只要求运行期资产登记簿的 unit 总数 > 0，与 `spec.assets` 声明无绑定，
  因此任何材质/网格注册都能满足它 —— gltf-draco 在"加载故意失败"的情况下仍以 `asset-loaded` PASS
  （detail：`spec assets=1 runtime asset units=3`）。它不构成资源加载成功的证明，
  资源类示例的真实加载目前由 `node-exists` + 画面非空 + lifecycle 共同兜底；收紧需要改合同与全部相关示例规格
- 验证器 PASS 会改写 `example.json` 与 `examples/files.json`：与并行会话共用同一工作树时互相覆盖，
  取数前先看 `measuredAt` 是否晚于自己最后一次改动

本轮已修（原先会产生"看着绿其实空"的假证据）：

- **暂存工作区展平掩盖相对 import 路径**：`prepareWorkspace` 把示例目录整体拷进工作区根，
  于是 `examples/*/src/main.ts` 里写 `../shared/x.js` 也能解析，而真实布局 `examples/<dir>/src/` 与
  Gallery 部署物里它是 404（本次 §25 接线就踩中：Gallery artifact build 直接失败）。
  现在示例源码统一按真实布局写（`src/` 用 `../../shared/`），暂存层按文件深度重算说明符，
  并新增 `S-IMPORT-RESOLVE` fail 级静态门禁：任何相对 import 在真实仓库布局下不可解析即红
- `--ids=a,b` 子集运行不再整体覆盖运行证据文件：按 id 合并旧记录并标 `partial:true` +
  `runPass/runTotal`，全量运行才清除（此前子集运行会让 coverage/audit 静默失去未跑示例的记录）
- 指纹与晋级逻辑此前在 runner / DevTools 门禁 / coverage-report 三处各写一遍（已收敛到
  `tools/verify/v11-spec-common.cjs`）
- `v11-examples-verify.cjs` 中 `capture` 被同名解构变量遮蔽：热身取帧与"无视觉 validator 时补当期帧"
  静默失效，导致部分示例的截图工件 bytes=0 仍以旧图充当 Screenshot Current 证据
  （现为 §11 `screenshot-current` 显式 FAIL）
- DevTools 会话门禁与浏览器矩阵同构补齐：`scene-ready` / `material-property` / `asset-loaded` /
  `screenshot-current` + "声明未执行即 FAIL"（此前 rc-* 的 `material-property` 证据绑到一个
  该门禁根本不跑的 validator 上）
- `spec-validate` 与 `spec-evidence` 共用同一行号定位实现（含注释与多行 import 过滤），
  冻结门禁不再比回填器更松；新增 claim/evidence 1:1、validator 未声明即 fail、重复单元检测

## Manifest

- `examples/files.json`（single source of truth，§23 裁剪）：45 examples / 14 categories，
  由 `tools/examples/generate-manifest.cjs` 生成，已含 `bench` 合同字段透传，
  5 个 `requiresDevTools` 示例（automation + rc-*×4）在清单中标记并从浏览器矩阵剔除
