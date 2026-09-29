# V0.3 独立审查报告（GLTF 加载 + 资源集成）

> 审查人：WorkBuddy（独立于 V0.3 实施会话）
> 审查时间：2026-09-12 17:04–17:35
> 审查对象：`cb64da4..563e6a0` 的 V0.3 交付 + 工作区当前状态
> 依据：[Cocos Air Standalone Asset Pipeline — Asset Integration & Runtime Verification 任务计划书](../ai/Cocos Air — Standalone Asset Pipeline 任务计划书.md) 与 `docs/versions/11-v03-verification.md` 的自验收声明

## 结论

**验收记录基本可信：计划书 L0–L10 全部维持 PASS 判定。**
本审查未发现归属 V0.3 的功能缺陷；提出 1 项非阻断异常与 2 项改进建议（见 §3）。

## 1. 独立复现结果（非复述自验收数据）

| 检查 | 自验收声称 | 本审查独立复现 | 判定 |
|---|---|---|---|
| typecheck | PASS | PASS（0 错误） | ✓ |
| verify:web-only | PASS | PASSED（763 可达） | ✓ |
| jest | 9 suites / 32 tests | 9 / 32 全部 PASS | ✓ |
| build（冷） | 冷 618 转换 | 619 转换，56.4s | ✓ |
| build 缓存复用 | 热 0 转换 | `reused:true, transformed:0, modules:619`，37.9s | ✓（附异常见 §3.1） |
| build:min | PASS | 70.1s，产物 + map | ✓ |
| d.ts consumer | PASS | `test/types/v03.mts` NodeNext 严格模式 0 错误 | ✓ |
| 浏览器 10 页 | 0 错误 + 前景像素 | 自建独立 Playwright 脚本（非 v03-browser.js）10/10 PASS，0 console/page 错误 | ✓ |

**像素交叉印证**：本审查用 draw 时刻帧内采样（每 10 像素取样），结果与验收表格在采样方差内一致——
gltf-viewer 4083×10 ≈ 40885、static-model 16274×10 ≈ 162919、skinned 2177×10 ≈ 21324、hello-cube 1769×10 ≈ 18236。
两组独立测量相互印证，排除「同一实现自证」。

复现脚本：`tools/verify/v03-review-browser.cjs`（本审查新增，未提交）。

## 2. 代码审查（重点文件）

| 文件 | 判定 | 要点 |
|---|---|---|
| `src/air/assets/gltf/loader.ts` | ✓ | downloader/parser/factory 幂等注册；失败时清除 `@native` 缓存避免坏 URL 永久失败；fragment URL 经 extname 修复正确路由 |
| `src/air/assets/gltf/asset.ts` | ✓ | 实例共享原生资产、节点/动画/Morph 状态独立；addRef/decRef 与 NODE_DESTROYED 挂钩；`releaseResources` 等 instances 归零；dispose 幂等 |
| `src/air/assets/gltf/winding.ts` | ✓ | 世界矩阵行列式检测镜像，`overridePipelineStates` 翻转 isFrontFaceCCW，每 renderer 去重 |
| `src/air/utils/restore-bind-pose.ts` | ✓ | 修复正确：按 joints 路径深度排序（父先子后），不改动 skin 索引 |
| `src/air/utils/frame-object.ts` | ✓ | 修复正确：setWorldPosition（父节点变换正确）；orthoHeight=radius×1.15/min(1,aspect) 竖横向均正确；fovAxis 视场拟合公式无误；far 扩展与 near 裁剪保护 |
| `tools/build/incremental.cjs` | ✓ | 配置哈希失效（9 个输入 + node/rollup 版本）、原子写（tmp+rename）、失败即删缓存、finally 恢复 rollup 补丁、构建锁含陈旧 PID 探测；仅 dev ESM 启用（min/system 保守冷构建） |
| `src/cocos/core/utils/path.ts` | ✓ | 上游修改最小（剥离 `#fragment`），已在 upstream-file-map.json 标注 `modified:true` + reason，符合 V0.1 机制 |
| `tools/verify/runtime-assets.js` | ✓ | 只读检查器：不导入 SDK/不创建实例/不销毁对象；显式列出 unchecked（default sampler、custom resolver/proxy）；诊断码 MISSING_DEPENDENCY / TYPE_MISMATCH / ANIMATION_TARGET / DESTROYED_RESOURCE |

**设计边界确认**：单入口导出链（`exports/air.ts → air/index.ts → assets/gltf`）无新顶层目录；
`GLTFLoader/GLTFAsset/GLTFInstance` 未新增 AirNode 类包装；Draco/Meshopt/KTX2 明确列为不支持并告警，不冒充成功。

## 3. 发现的问题

### 3.1 ⚠️ 缓存复用一次性异常（非阻断）

本审查第二次构建出现 `reused:false, transformed:619`（前次已成功保存缓存且 key 经精确复算匹配），紧接着第三次构建即恢复正常 `reused:true, transformed:0`。
两次异常观察之间无任何哈希输入变更，怀疑 94MB `cache.json` 的读取/写入竞态（或外部进程干扰）。
**建议**：key 不匹配时把期望/实际 key 前缀打进日志，便于下次定位；`last-build.json` 里记录 load 失败原因。
不阻断验收：最终稳态行为与自验收声称一致。

### 3.2 建议：验证文档的测试计数口径

`gltf-validation.md` 记录「7 套件 / 25 测试」（glTF 任务当时的运行），`11-v03-verification.md` 记录「9 / 32」。
两份文档各自成立但时间线交错，建议在 gltf-validation.md 加一行指向最新全量结果，避免后续读者误判回归范围。

### 3.3 建议：审查脚本的复用

本审查的独立浏览器脚本 `tools/verify/v03-review-browser.cjs` 与既有 `v03-browser.js`（CLI 回调格式）并存。
建议后续将其并入统一的验收入口（或注明「独立复现用」），避免出现两条各自维护的浏览器验证链。

## 4. 与计划书的符合性

- L3（外部集成）：glTF/GLB 加载实际由「外部任务」在本仓库交付（`src/air/assets/gltf`，1165 行 + 独立 effect + texture-transform），
  V0.3 按修订范围只做使用侧集成——文档口径一致（`docs/10/11`、`gltf-runtime.md`），未见越权重写。
- 官方模型验证（7 个 Khronos 样本 × WebGL1/2、像素探针、alpha 混合误差 ≤1/255）超出计划最低要求；AlphaBlendModeTest 网络超时的 deviation 已如实记录。
- 生命周期验证（scene 替换、双实例隔离、dispose 幂等、引用计数基线 2→2）有 HEADLESS 与浏览器双证据。
- 未验证项全部显式标注（37 关节、builtin sampler、custom proxy 等），无「以报告扩大结论」的情况。

## 5. 最终判定

| 项 | 判定 |
|---|---|
| V0.3 自验收可信度 | **高**（独立复现全绿，像素数据交叉一致） |
| glTF 加载功能 | **可用**（官方 7 模型 × WebGL1/2 通过；已知边界清晰） |
| 阻断问题 | 无 |
| 遗留事项 | §3.1 缓存异常追踪、§3.2 文档口径、§3.3 脚本归并 |

审查产生的未提交变更：`docs/versions/acceptance-review-v03.md`（本文件）、`tools/verify/v03-review-browser.cjs`。
