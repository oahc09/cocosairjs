# V1.1 G0 — 基线交接

> V1.1 开工前真实基线记录。日期 2026-09-16。

## Revision

- HEAD: `6731f34`（V0.7-V1.0 诚实门禁报告）
- Release Version: `0.1.0`

## Working Tree

- Clean（0 dirty files）

## Latest Gate Report

- 来源 `docs/evidence/v06-review-gate.json`
- status: BLOCKED
- blockers: Recipe 缺少完整场景运行证据（30 draft）

## 前置成果状态模型（§2）

### Runtime

| 项 | 状态 | 值 |
|---|---|---|
| Engine boot | verified | 28 suites / 202 tests |
| createAirApp / Scene / Node / Camera / Mesh / Material | verified | 100 Benchmark Reference Track |
| glTF (Core + Draco + Meshopt + KTX2 + PBR) | verified | V0.5 21 套件全绿 |
| Animation / Skeleton | verified | V0.5 + B061/B064 |
| Input (Keyboard / Pointer) | verified | B085/B086/B090 |
| DevTools / Agent Session | verified | smoke-22/23 + V0.5.1 |

### Benchmark

| 项 | 状态 | 值 |
|---|---|---|
| catalog100 | verified | 100 项，十能力域 |
| Reference Track | verified | 100/100 PASS |
| Agent Track (A001) | verified | Golden 10 双轨 10/10 |
| A002+ (LLM Provider) | **not-delivered** | Provider Adapter 未实现 |

### Recipe

| 项 | 状态 | 值 |
|---|---|---|
| Catalog | verified | 30 条定义 |
| Scenario Runner | verified | 30/30 浏览器场景 PASS |
| validated | **in-progress** | 20 stable（targetStatus）；status=draft 待 evidence 晋级写入 |
| stable | **in-progress** | 同上 |

### Coverage

| 项 | 状态 | 值 |
|---|---|---|
| API Inventory | **not-delivered** | V1.1 新增 |
| API Coverage Matrix | **not-delivered** | V1.1 新增 |
| Browser Matrix (Firefox/WebKit) | **in-progress** | 已安装，可见性验证待修复 |
| 50 Invalid/Stress/Security Benchmark | **not-delivered** | V0.8 BLOCK-2 |

### License

| 项 | 状态 | 值 |
|---|---|---|
| License Inventory 文档 | verified | `docs/v08-license-inventory.md` |
| 逐文件审计脚本 | **not-delivered** | V0.9 BLOCK-5 |

## Examples Current Inventory

| 目录 | 类型 | 状态 |
|---|---|---|
| starter | 入门 | V0.2 可运行 |
| hello-cube | 基础 | V0.2 可运行 |
| static-model | 纹理/PBR | V0.2 可运行 |
| skinned-animation | 骨骼动画 | V0.2 可运行 |
| gltf-viewer | glTF 加载器 | V0.5 可运行 |
| gltf-catalog | 官方模型目录 | V0.5 可运行 |
| transform | 层级/变换 | V0.5.1 新增 |
| camera | 相机/取景 | V0.5.1 新增 |
| input | 输入交互 | V0.5.1 新增 |
| automation | Agent Session 闭环 | V0.5.1 新增 |
| shared/ | 公共代码 | 不计入 example |
| index.html | 导航页 | V0.5.1 新增 |

**合计 10 个 example**。V1.1 需扩展至 40+。

## Dev Server

- `node tools/dev/dev-server.cjs --example <name>`
- 递归 watch src/ + examples/ + tools/debug/
- esbuild 即时编译 .ts
- importmap 注入
- debug button 注入（/__debug-button.js）
- 构建错误横幅（/__build_status）
- 端口默认 7454

## Capabilities

- 来源：`build/capabilities.json`
- 上次生成：`tools/verify/update-capabilities.cjs`

## License Manifest

- 来源：`docs/v08-license-inventory.md`
- 逐文件验证脚本：**not-delivered**

---

## 历史快照（G0 记录时刻，V0.6 阶段末）

以下为 V1.1 开工时的**历史快照**，不代表当前执行目标：

| 项 | G0 快照值 |
|---|---|
| Example 数量 | 10 |
| Recipe validated/stable | 0 / 0（draft 待 evidence 晋级） |
| API Coverage | 未建立 |
| Gallery | 导航页（无 search/category/iframe） |

## 当前执行目标（V1.1 §98 DoD）

| 目标 | 说明 |
|---|---|
| Example ≥ 40（Pilot 12 → Wave 1 → Wave 2 → Wave 3） | 含 example.json + Gallery manifest |
| API Coverage Core ≥ 80% verified | 冻结清单 100% 验证 |
| API Coverage Important ≥ 60% claimed | |
| API Coverage Advanced ≥ 30% claimed | |
| Gallery（Search/Category/iframe/Source） | |
| 30 stable Recipe（V0.9 需求，V1.1 继承） |
