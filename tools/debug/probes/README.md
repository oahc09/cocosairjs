# tools/debug/probes — 隔离探针与标定页

引擎诊断页常驻地。目录迁移历史见 `docs/reference/owner-decisions.md` §10；当前入口以下表为准。
**纪律：不登记 files.json / Gallery manifest，不进覆盖率与发布门禁**——页面使用
仓库根绝对路径 importmap（`/build/...`），不满足 Gallery 工件的相对路径合同。

| 目录                        | 用途                                                                   | 运行器                                                                                   |
| --------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `shader-probe/`             | 用户 Shader 全链路探针（注册/uniform/动画/冻结/编译错误/销毁，双后端） | `tools/verify/shader-probe.cjs`（默认根即本目录）                                        |
| `light-contribution-probe/` | GAP-L1 光贡献诊断复现页（13 相位像素采样）                             | `tools/verify/trial-probes.cjs --root=tools/debug/probes --ids=light-contribution-probe` |
| `lights-hdr-calibration/`   | manual-lights 四型光源 HDR 量级标定页（r53）                           | `tools/verify/trial-probes.cjs --root=tools/debug/probes --ids=lights-hdr-calibration`   |
| `context-loss-probe/`       | WebGL2 上下文丢失与恢复状态合同                                        | `tools/verify/context-loss.cjs`                                                          |
| `coldstart-probe/`          | 独立浏览器上下文的冷启动与复启                                         | `tools/verify/coldstart.cjs`                                                             |
| `capture-probe/`            | 截图时机、像素与 DPR 矩阵                                              | `tools/verify/capture.cjs`                                                               |
| `canvas-binding-probe/`     | 显式画布绑定、焦点与触摸输入                                           | `tools/verify/canvas-binding.cjs`                                                        |
| `coordinate-spaces-probe/`  | 输入、屏幕与节点坐标空间                                               | `tools/verify/coordinate-spaces.cjs`                                                     |
| `label-semantics-probe/`    | Label 溢出、布局、对齐与字影                                           | `tools/verify/label-semantics.cjs`                                                       |
| `step-clock-probe/`         | 单时钟手动步进与确定性                                                 | `tools/verify/step-clock.cjs`                                                            |
| `assembly-probe/`           | UI、AssetBank、SceneStack 与音频装配                                   | `tools/verify/assembly.cjs`                                                              |

运行需 `NODE_PATH=<含 playwright 的 node_modules>` 与 `build/cocosair.module.js`。
`trial-probes.cjs` 写系统临时目录；其他表列运行器会写各自的 `docs/evidence/` JSON，部分还写截图。诊断或 HDR 标定可能保留不通过的候选相位，不能把页面就绪等同于全部合同通过。
计划线实施台账见 `ai/ledgers/api-scenarios-shaders.md`。

## Label shadow 回归

`label-shadow-probe/` 检查影开关前后的字形像素、逻辑尺寸、anchor 更新和 RichText 重建。测试构建仅在隔离源码副本中导出 RichText，公共 SDK 入口保持原有范围。

```bash
node tools/verify/build-label-shadow.cjs
node tools/verify/label-shadow-server.cjs build/reports/label-shadow/runtime/cocosair.module.js
npx --yes --package @playwright/cli playwright-cli -s=label-shadow open about:blank --browser chrome
npx --yes --package @playwright/cli playwright-cli -s=label-shadow run-code --filename=tools/verify/label-shadow-browser.js
```

服务器在独立终端运行；截图和测试构建位于 build/reports/label-shadow/。源码单测使用 `node node_modules/jest/bin/jest.js --runInBand test/smoke/smoke-33-label-shadow.test.ts`。
