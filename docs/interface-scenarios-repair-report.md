# 接口场景、开发范式与 Shader 验收修复

日期：2026-09-26；修复基线：`b07a191`。本记录覆盖任务计划 G0–G4 的验收遗留项，不把本轮完成等同于 V1.1 全量 API 覆盖目标达成。

## 改动

- G3 格式与工程布局：格式化自有示例，排除第三方资产和根目录 `src/`；修正 `.prettierignore` 对所有嵌套 `src/` 的误排除；统一 EditorConfig 与 Prettier 缩进，加入格式 CI。
- 样板迁移：`starter/src/main.ts`；`hello-cube/src/components/Rotator.ts`；`scene-switch-reentry/src/components/Ticker.ts`。保持原生 Component，通过激活前注入依赖实现复用。开发服务器支持 `.js` 导入解析至对应 `.ts` 源文件。
- 证据完整性：`src/**` 递归进入源码指纹；场景探针超时、空断言或失败均阻断正典验证，证据保存具体场景断言。格式化后同步 API 引用行号、期望值出处和手册全文源码。
- GAP-C1：纠正 `worldToScreen(worldPos, out?)` 参数顺序；按真实投影位置采样 RT，增加透视深度换算后的往返误差断言。原“输出零向量”是探针用法错误。
- GAP-C2：通过公开 `camera.camera` 读取渲染相机尺寸，文档说明组件与渲染相机的区别。没有增加平行接口，也没有缩小覆盖分母。
- GAP-M1：RT 手册例改用 `USE_TEXTURE`，修正主光强度，增加快照内蓝色立方体像素断言，避免纯白 quad 通过弱视觉检查。
- G2 视觉修复：俄罗斯方块、消消乐、坦克大战、魂斗罗的 Canvas2D 像素上传统一按行翻转；修复整幅游戏画面上下颠倒及输入与显示行方向不一致。已检查正向截图。
- WebKit：优先选择与当前 Playwright 匹配且已安装的浏览器。媒体请求在 WebKit 中可能缺少 ResourceTiming 和 Playwright response 事件，验证器补记浏览器请求所对应、服务端完成发送的响应状态及字节数；404/空响应仍失败。
- 手册：索引新增脚本组件与 Shader 工作流，更新 Shader 集成状态及小游戏升级导航。生命周期边界保留明确用法与资产所有权要求。

## 验证

**统一复验通过，候选 `8746fc59b6aa0408`。** 145 个示例源码与 11 个关键验证工具在采证期间均无漂移；已保留并验证合并后的灯光、相机等改动。机器汇总见 [统一复验记录](evidence/g3-unified-summary.json)。全量 API 覆盖目标仍按原计划分批推进。

| 检查 | 结果与证据 |
| --- | --- |
| Chromium 正典 | 140/140 PASS，completed=true、partial=false；[记录](evidence/v11-examples-verified.json) |
| DevTools | 5/5 PASS；[记录](evidence/v11-devtools-examples.json) |
| Gallery 独立部署 | 209/209 PASS，含 140 例启动与 43 个生命周期合同；[记录](evidence/v11-gallery-artifact.json) |
| 格式、类型与上游映射 | format:check、typecheck、verify:file-map 均 PASS |
| Jest | 单次全量 32 套/263 用例全部通过 |
| API 证据 | verified=439，stale=0，schema gap=0；Core 295/816（36.2%，call 293/read 2），Important 33/1773（1.9%，call 31/read 2），分母与门槛未改 |
| 规格与引用 | 145 frozen；3470 API 引用零漂移；证据链检查 PASS；文档零断链；手册全文一致性 PASS（29 个教学片段提示） |
| 格式化阶段历史核对 | 合并后续功能改动之前，181 份规范化编译结果相同，0 个非预期差异；[记录](evidence/g3-repair-format-semantics.json) |
| 开发服务器样板 | 3/3 PASS，独立组件加载、旋转更新及场景复入点击；[记录](evidence/g3-dev-samples.json) |
| 手册示例 | 44/44 PASS，含 RT 像素探针；[记录](evidence/manual-examples-verified.json) |
| Firefox 扩展矩阵 | 21/21 PASS；[记录](evidence/g3-repair-firefox.json) |
| WebKit 扩展矩阵 | 21/21 PASS；[记录](evidence/g3-repair-webkit.json) |
| Shader 探针 | WebGL2/WebGL1 双后端 PASS；[记录](evidence/g4-shader-probe.json) |
| 工具负控 | 嵌套组件修改使指纹失效；`.js` 与 `.ts` 模块优先级；非对称纹理行方向；HTTP 404 与零字节拒绝，均 PASS |

Firefox/WebKit 的 21 例包含本计划原有 13 例，加本次涉及的 8 个灯光、相机、材质等回归用例，不能代替全部 Gallery 的三浏览器验证。格式 CI 已加入仓库；远端 Actions 的首次运行需在后续提交/推送后发生。

## 复验入口

```powershell
npm run format:check
npm run typecheck
npm run verify:g3-tooling
npm run verify:file-map
node tools/examples/spec-evidence.cjs --check
node tools/examples/spec-validate.cjs --strict
node tools/verify/manual-doc-consistency.cjs --strict
```

浏览器运行器需要可解析的 `playwright` 包。本轮使用 Playwright 1.61.0，Chromium 1228、Firefox 1543、WebKit 2311；工具会优先采用 Playwright 对应且已安装的版本，必要时使用现有缓存回退。

```powershell
npm run verify:g3-dev
node tools/verify/v11-examples-verify.cjs
node tools/verify/v11-devtools-examples.cjs
node tools/verify/g4-shader-probe.cjs
```

跨浏览器调用必须显式指定 `--browser`、`--ids`、独立的 `--out` 与 `--artifact-dir`，不能覆盖 Chromium 正典证据。

## 范围

运行时源码未改，本轮复用现有引擎 bundle，重新编译并验证 Gallery 和样板，没有重新执行引擎 build/min。没有改动上游抽取源码、公开 API 分母或覆盖门槛；没有提交、推送或发布。本轮诊断运行中断和证据重建时的暂态失败不作为验收结果，验收以最终完成批次为准。

既有 `gltf-draco` 解码器未配置的生命周期提示继续保留（compliance 0 fail / 1 warn），不影响本次新增场景的验收；Core 100% / Important 90% 的远期覆盖目标尚未达到。
