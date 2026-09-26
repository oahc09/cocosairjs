# tools/debug/probes — 隔离探针与标定页

引擎诊断页常驻地（2026-09-26 自 `ai/g1-staging/` 清退，先驻 `ai/probes/`、同日按 owner
反馈落定 `tools/debug/probes/`，owner-decisions §10）。
**纪律：不登记 files.json / Gallery manifest，不进覆盖率与发布门禁**——页面使用
仓库根绝对路径 importmap（`/build/...`），不满足 Gallery 工件的相对路径合同。

| 目录 | 用途 | 运行器 |
| --- | --- | --- |
| `shader-probe/` | 用户 Shader 全链路探针（注册/uniform/动画/冻结/编译错误/销毁，双后端） | `tools/verify/g4-shader-probe.cjs`（默认根即本目录） |
| `tmp-light-probe/` | GAP-L1 光贡献诊断复现页（13 相位像素采样） | `tools/verify/g1-trial-run.cjs --root=tools/debug/probes --ids=tmp-light-probe` |
| `tmp-lights-hdr/` | manual-lights 四型光源 HDR 量级标定页（r53） | `tools/verify/g1-trial-run.cjs --root=tools/debug/probes --ids=tmp-lights-hdr` |

运行需 `NODE_PATH=<含 playwright 的 node_modules>` 与 `build/cocosair.module.js`。
计划线实施台账见 `ai/Cocos Air — 接口场景覆盖、开发范式与 Shader 示例实施台账.md`。
