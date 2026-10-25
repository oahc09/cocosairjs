# Terrain source candidate 检查点（2026-10-25）

**仅为开发分支源码候选，不是已取得原生或运行时资格的 Terrain 功能。**

## 来源与候选

- 当前远端开发分支基线：`7c5eb572a8b6080d64c85ee6e59421cf0894205d`；核心 runtime producer：`b089d223aad1bb4be4a81f187eceb341510d766a`。
- 冻结 overlay 共 **27 个文件**；本报告单独追加，不修改冻结候选。
- Overlay manifest SHA-256：`014e3435cc70709eec7afa463dd971f49ce806e54d5ff42f236da37cc61787b5`。
- Overlay patch SHA-256：`8c3a3ba0fcbeecceaee69bc51825a0d41a0130b790b97f7876a2034e72496229`。
- 对外为 `TerrainCollider`，原生 shape kind 为 **mesh**；不得宣称原生 heightfield 已实现。cook/destroy 计数是 mesh 生命周期事件，**不是 malloc/free 或无内存泄漏证明**。

## 已完成的源码层检查

- **10 项 TypeScript mock CPU + 11 项 fixture CPU 检查通过**，并经独立复核。精度边界、旧 schema 拒绝及落球 fixture 假阳性相关修正纳入候选；CPU/mock 通过不等于真实物理验证。
- 第三次 DTS candidate 检查完成 **7/7**：fresh emit、3 组 strict consumer、3 组 fixture，均 exit 0；记录耗时 **39.670727539 秒**，abort null，物理关闭 `ECHILD_AND_NO_GROUP_MEMBERS`。
- 输入漂移、意外输入、旧 SDK 产物漂移均为 0；未替换 SDK223 JS/WASM/DTS 分发产物。
- 前两次检查保留：第一次因缺失 PAL 支撑在前置检查失败；第二次出现监测 TOCTOU，已安全终止并保留残留证据。不得描述为历史仅一次尝试或完全没有失败。
- optional sourceTsc：**NOT_RUN**。

## 尚未取得的资格与交付边界

- native 编译、ABI 匹配 ST WASM、新 SDK224 runtime、真实 C17/C19、query 及落球物理资格：**全部 NOT_RUN / 未取得**。
- 候选 registration 仅为后续 **新 ABI ST + SDK224** 资格检查启用；禁止与 SDK223 或旧 native 分发混用，不能据此宣称 supported。
- 本次仅提交开发分支 source candidate：**不部署、不合入 main、不覆盖 SDK223 产物**。
- 原生 compiler 安装许可尚待用户确认；没有完成日期或运行时通过承诺。

## 保留证据的哈希

以下名称为保留证据包内的相对路径，不表示本报告提交已携带原件：

| 原件 | SHA-256 |
|---|---|
| `SOURCE-RESULT.json` | `801e8b8a7984a60da9fdde483ebb591f71b546d0e7c6a1de57c76a4623b8795b` |
| `dts-check-224-candidate-attempt3/SUMMARY.json` | `e541746cfae1387e5b22c074ceacbff404694d9fa45c2b24088100157cf721a6` |
| `terrain-overlay-manifest.json` | `014e3435cc70709eec7afa463dd971f49ce806e54d5ff42f236da37cc61787b5` |

仅提交本简报及既定 27 文件源码；不复制全量 raw 或生成的 DTS 产物。原件与较早失败证据保持不变，哈希摘要不能替代完整复核材料。
