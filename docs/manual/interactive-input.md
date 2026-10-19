# 混合 Canvas、HTML 与滚动输入

## 当前选定浏览器诊断

--browser=chromium|firefox|webkit 只限制真实采集范围，默认 all 三引擎要求保持。checkSelectedReport 验证完整选定行和每个实测补充，但仍保留协议/焦点 NOT_RUN；valid=true 不等于 scopePassed=true，存在 NOT_RUN 时 collector 仍 exit1。独立 auditor 使用相同明确选择，要求有效正基线后逐个拒绝篡改，不用其它浏览器空行填充覆盖。

SDK CI 保存原 exitCode 并严格验证它仅对应完整有效收据中的 NOT_RUN；这个诊断步骤通过只说明记录可信，不表示混合输入全部完成。真实窗口焦点、页面隐藏和实体多触点仍单列。当前技术摘要和原始观察范围见 ../evidence/sdk-backlog/input-selected-local-20261019.json。

## 2026-10-19 补充证据合同修复

报告层现在对每个已执行的 blur/hidden 补充行调用已有 checkSupplementary，检查 before/after/新手势、退场代次与旧回调拒绝。此前以空 stages 代替 NOT_RUN 不增加错误的负控已复现；新增七个正负合同检查后拒绝该伪证。共享生命周期模块及 auditor 纳入输入身份。

这是 CPU 合同回归，保留原 32 个协议/环境 NOT_RUN 和真实窗口/页面可见性限制，不构成新混合输入浏览器或实体设备验收。公开技术摘要见 docs/evidence/sdk-backlog/input-supplementary-contract-20261019.json。

详见 [interactive-input 示例说明](../../examples/interactive-input/README.md)。该页复用 ActionInput DOM 后端与 session gate，不新增全局输入框架。普通运行使用原生 pacer，无引擎 HTML 对照通过 `?control=html` 选择。

采集命令：

```powershell
$env:NODE_PATH='output/playwright/tooling/node_modules'
node tools/verify/interactive-input-browser.cjs --out=<new.json>
node tools/verify/interactive-input-browser.cjs --verify=<recorded.json>
```

首次命令启动三个浏览器、只读服务现有 bundle，写显式报告与相邻 `-artifacts/` PNG；已有报告路径拒绝覆盖。第二条只重算当前输入 SHA、原始事件、模型/pose、提交、PNG/质心及取消/滚动/释放，不启动浏览器或改报告。范围仍有 NOT_RUN 时 exit=1，不将合同合规转换成完整 PASS。

可见性 oracle 使用原生相机 VP 将模型位置投影到 CSS，并解码 compositor PNG。按钮节点稳定性、原生键盘可达、会话取消、新手势恢复、双触点身份、wheel 消费范围和实际引用分别记录。无引擎页严格要求零 SDK 请求；复制同样 DOM 作为环境对照。

SDK 提交、PNG 截图及物理显示是不同观察位置。原始工程/触摸硬件、Firefox/WebKit 的多触点移动/cancel 协议、headless 未产生的 blur/hidden 均单独披露；不以合成事件或普通鼠标替代。

当前 [S3 报告](../evidence/examples/interactive-engine-improvements/input-s3.json)：400/400 操作与PNG通过，62条补充检查通过；完整scopePassed=false/exit1，32项NOT_RUN和两条PAL诊断如实保留。见示例说明的分项范围与 [29种审计](../evidence/examples/interactive-engine-improvements/input-s3-audit.json)。

本包消费者副本及安装说明见[interactive-kit](examples/interactive-kit/README.md)；上面的examples路径和dev命令适用于仓库检出，不假设npm包带开发服务器。
