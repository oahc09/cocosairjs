# Wave 1 活 resize 呈现诊断

> 2026-10-10 更新：以下是原始失败与追查历史。R16 scoped WebKit 启动对照已恢复同页 compositor；R20 三效果、性能和 Gallery 当前全部通过，见 [当前十三项交付](wave1-resize-gallery-closure-delivery.md) 与 [正式 Gate](../evidence/shaders-absorption/wave1-r21-current-gate.json)。旧失败未改写。
> 2026-10-09，执行渠道：Lead。分类为当前浏览器环境的 `INFRA_FAILURE`；完整 Runtime resize 验证保持 `BLOCKED`，不能用 GPU 读回或 Canvas 导出补偿 compositor 截图。

## 最小原生场景

独立于三个效果，使用当前 SDK 的 `createAirApp`、原生 Scene、Camera、MeshRenderer、`utils.createMesh` 和 `builtin-unlit` 材质，在唯一的 `GameCanvas` 绘制红色四边形。没有自定义效果着色器、第二个 Canvas、外部 runtime 或额外 GL draw。

实际命令：

```powershell
$env:NODE_PATH='output/playwright/tooling/node_modules'
node output/shaders-absorption/lead-wave1-resize-diagnostic.cjs --out=output/shaders-absorption/lead-wave1-resize-diagnostic-attempt1.json
node output/shaders-absorption/lead-wave1-resize-layer-diagnostic.cjs --out=output/shaders-absorption/lead-wave1-resize-layer-diagnostic-attempt1.json
```

两次收集均 exit 0，仅表示诊断流程完成，不表示 resize 验证通过。报告保存启动/结束时间、命令、SDK/脚本前后 SHA、真实浏览器版本、错误、截图和自有资源释放。CLI 输出使用新路径；复跑需换新的 `--out`，不得覆写原尝试。

第二次实际执行脚本的逐字节相同副本现保存在 [shaders-resize-diagnostic.cjs](../../tools/verify/shaders-resize-diagnostic.cjs)，供后续环境复测：`node tools/verify/shaders-resize-diagnostic.cjs --out=<new.json>`。原采集命令和脚本身份不改写；新入口仍只采诊断，不推效果 Gate。它也保留下述不适用于裁定的最后一步，报告使用方必须明确排除该步骤。

## 同坐标观测

初始页面 640×400、DPR 1；在同页改为 480×320。所有有效阶段的 Canvas CSS 原点均为 (0,0)，display 为 block、visibility 为 visible、opacity 为 1，GPU backing 与 viewport 为 480×320。截图与 Canvas 导出由 Node `pngjs` 解码，没有创建另一个渲染 Canvas。

| 引擎                   | 初始 GL / 页面 PNG 中心       | resize 后 GL / Canvas 导出中心 | resize 后页面 PNG 中心 |
| ---------------------- | ----------------------------- | ------------------------------ | ---------------------- |
| Chromium 149.0.7827.55 | [229,0,0,255] / [229,0,0,255] | [229,0,0,255] / [229,0,0,255]  | [229,0,0,255]          |
| Firefox 155.0          | [229,0,0,255] / [229,0,0,255] | [229,0,0,255] / [229,0,0,255]  | [229,0,0,255]          |
| WebKit 26.6            | [229,0,0,255] / [229,0,0,255] | [229,0,0,255] / [229,0,0,255]  | [255,255,255,255]      |

五次受控 step、双浏览器 RAF、随后原生 pacer 连续运行，以及重新创建原生材质均未恢复 WebKit 页面截图。将 body 底色改为绿色后，WebKit 页面 PNG 中心变为 [0,255,0,255]，GL 与 Canvas 导出仍红；改变 Canvas 的 translateZ 合成样式也未恢复。故三个效果失败图中的深蓝/黑色与其 HTML body 底色一致，不能解释为正确呈现了 GPU 清屏背景。

第二份报告的最后 `resized-canvas-reinsert` 阶段将 Canvas 移到了 body，CSS y 变为 320、越出当前 viewport。这个诊断动作不保留原始布局，**不用于判断 resize 或任何修复效果**；仅前六阶段提供有效对照。该尝试原样保留，没有删掉无效阶段。

## 边界与资源

三浏览器页面错误均为零；每个原生控制场景的自有 Mesh/Material 引用均 1→0，应用关闭，默认 SDK 及声明 SHA 前后不变。这里没有执行百轮资源或性能验证，也不代替 E01/E02/E06 的六维报告。

上述结果证实此环境下原生绘制数据与页面合成截图不一致；没有定位到 Cocos 引擎核心的具体错误行，也不声称所有 WebKit 或实体 Safari 都有该行为。未找到有效恢复方案前，保留三个效果的 resize 呈现缺口，Wave 1 不通过，Wave 2 不开始。Canvas 导出只用于故障定位，不能升级 Runtime/Visual Gate。

既有[动态几何说明](../manual/interactive-geometry.md)也记录了 WebKit 26.6 在无 SDK 的纯 WebGL2 控制中 resize 后读回仍红、截图白色的对照；[容器说明](../manual/interactive-container.md)保留同类失败。这些历史记录只提供故障背景，不继承为当前效果的 PASS，也不替代本轮原生控制采集。
