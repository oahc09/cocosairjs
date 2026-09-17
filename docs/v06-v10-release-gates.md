# V0.6 → V1.0 诚实门禁报告

> 本文档由实际执行结果与代码审计生成。不使用"环境限制"替代未验证项。
> 日期 2026-09-16；基线 `4bb0010` → 工作区 HEAD。

---

## 当前真实状态

| 阶段 | 状态 | 阻塞项 |
|---|---|---|
| **V0.6** | **PASS** | 无 |
| **V0.7** | **PASS** | 无（Pattern Mining 完成，无新增 helper） |
| **V0.8** | **BLOCKED** | Browser Matrix / 覆盖门槛 / Agent Gate（见下） |
| **V0.9** | **BLOCKED** | Stable < 30 / Agent Gate / License Audit 需重审 |
| **V1.0.0** | **BLOCKED** | 上游阶段未全过 |

---

## V0.8 阻塞项明细

### BLOCK-1: Browser Matrix 未完整测试

**要求（§84）**：Chrome / Edge / Safari / Firefox 四浏览器覆盖 WebGL2 + WASM + Draco/Meshopt/Basis + WebP + AVIF + Advanced Material + Transmission/Volume/Dispersion。

**当前**：仅 Chromium headless 已测试。Edge 未单独测试（Chromium 内核但品牌版本不同）。Firefox 二进制已安装但 Playwright 版本不匹配导致启动失败。WebKit/Safari 未安装。

**修复路径**：
1. `npx playwright install firefox webkit` 安装匹配版本
2. 对 100 Benchmark 中抽 ≥ 20 项（含 glTF + Compression + Material + Interaction）在 Firefox + WebKit 各运行一轮
3. 记录差异并修复或标记 EXPECTED_UNSUPPORTED（须附带稳定错误码）

### BLOCK-2: Benchmark 覆盖门槛

**要求（§86）**：≥150 Benchmark **或同等覆盖**。

**当前**：100 项。缺少 50 项，缺口领域：Browser Compatibility（B101+）、Invalid Input（B111+）、Stress（B121+）、Security Limits（B131+）。

**修复路径**：
1. 按 §50 分类扩展 50 项新 benchmark（非参数变体）
2. 或提供覆盖等价性证明文档（当前 100 项已覆盖 §86 列出的全部领域 → 需审计确认）

### BLOCK-3: Agent Gate 需要 LLM Provider

**要求（§52 V0.6 / §53 V0.9）**：冻结 LLM Agent Profile，测量真实生成成功率。

**当前**：A001 为脚本化求解档（直接提交冻结参考答案），只能证明 Runner 工作流闭环。

**修复路径**：
1. 实现 Provider Adapter（`tools/benchmark/providers/`，§19 预留）
2. 接入 OpenAI / Claude / Gemini 任一 API
3. 冻结 A002 Profile（Model/Version/Temperature/System Instruction）
4. 以 A002 跑 Golden 10 → 扩展 100 → 记录 §52/§53 指标

---

## V0.9 额外阻塞项

### BLOCK-4: Stable Recipe 数量

**要求（§61/§94）**：Stable Count ≥ 30。

**当前**：20 stable + 10 validated。10 条 validated 缺少 lifecycle 证明（需实际 dispose + 资源释放检查）。

**修复路径**：为 10 条 validated Recipe 添加 lifecycle scenario（dispose + resource-released validator），重跑 Recipe Runner。

### BLOCK-5: License / Repo Cleanup 重审

License Inventory 已建档（`docs/v08-license-inventory.md`），但需审计脚本逐文件验证（fixture hash 与上游一致）。

---

## V1.0 额外阻塞项

全部依赖上游 V0.8/V0.9 阻塞解除。当前无独立新阻塞。

---

## 可行动项优先级

| 优先级 | 行动 | 预估工作量 |
|---|---|---|
| P0 | 安装 Firefox/WebKit 匹配版本 + 跑 Browser Matrix 子集 | 环境 setup + 2-4h |
| P0 | Provider Adapter（OpenAI 或 Claude API） | 代码 1-2 天 + API 费用 |
| P1 | 50 新 Benchmark（Invalid/Stress/Security/Lifecycle） | 2-3 天 |
| P1 | 10 validated Recipe 加 lifecycle 场景 | 1 天 |
| P2 | License 逐文件审计脚本 | 半天 |


---

## API Coverage Report (V1.1)

| 指标 | 值 |
|---|---|
| Coverage Units (Inventory) | 3358 |
| Covered by Examples | 254 (7.6%) |
| Core Gate Rate | 72.7% (8/11 core APIs) |

来源：`docs/api-coverage-report.json`。当前 10 个 examples 覆盖核心 API 的 72.7%。
扩量到 40 examples 预计覆盖 ≥ 15%；到 120 examples 预计覆盖 ≥ 30%。
覆盖差距主要在 Physical Extensions (PBR/Clearcoat/Transmission) 和 Skeletal Animation 的高级方法。

Python 脚本工具：
- `node tools/examples/api-inventory.cjs` → docs/example-api-inventory.json
- `node tools/examples/coverage-report.cjs` → docs/api-coverage-report.json
