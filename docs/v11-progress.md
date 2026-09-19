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
  772 条 api.claims（去重后 68 个唯一单元，claim↔evidence 1:1；其中 63 个落在 inventory 分层，
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

## API Coverage（基线，目标差距）

- `tools/examples/api-inventory.cjs`：4729 覆盖单元（core 717 / important 793 / advanced 3219）
- `tools/examples/coverage-report.cjs` → `docs/api-coverage-report.json`；verified 口径同时消费
  浏览器矩阵与 DevTools 会话门禁两份证据（`v11-examples-verified.json` + `v11-devtools-examples.json`），
  并要求 `specFingerprint` 与当前 `example.json` 一致，否则视为陈旧证据
- 当前（verified 口径，非 claimed；2026-09-19 全链路当期取数）：core 49/717（6.8%）·
  important 6/793（0.8%）· advanced 8/3219（0.2%）。772 条 api.claims 去重后 68 个唯一单元，
  其中 63 个进入 inventory 分层统计（core 49 / important 6 / advanced 8）且全部 verified、0 条 stale；
  余 5 个 `DevToolsSession.*` 属
  V0.5.1 会话合同、不在 API inventory 分母内
- 目标（§25/§26，不得下调）：**core 100% verified / important ≥ 90% verified / advanced ≥ 80% verified**，
  且 Advanced `documented-only ≤ 20%`、`uncovered = 0`（§26 明确禁止用
  `verified + documented-only ≥ 80%` 充当门禁，documented-only 不入分子）。三道门禁当前均为 **FAIL**，
  差距以新增示例补足（内容型工作，按 Wave 推进）
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
  于是 `src/main.ts` 里写 `../shared/x.js` 也能解析，而真实布局 `examples/<dir>/src/` 与
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
