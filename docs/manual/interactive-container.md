# 嵌入容器的启动与恢复

见[interactive-container说明](../../examples/interactive-container/README.md)。顺序为DOM可见且非零→原生布局/buffer/相机→对应提交→PNG目标可见，前一阶段通过不代替后一阶段。

```powershell
$env:NODE_PATH='output/playwright/tooling/node_modules'
node tools/verify/interactive-container-browser.cjs --out=<new.json>
node tools/verify/interactive-container-browser.cjs --verify=<recorded.json>
node tools/verify/interactive-container-audit.cjs --report=<recorded.json> --out=<new-audit.json>
```

采集启动浏览器，服务现有SDK，写显式报告及相邻PNG。verify/audit不启动浏览器，重算当前SHA、原始布局/提交/模型、PNG及实际范围；audit只写显式新路径。所有输出拒绝覆盖。页面导航采用可信浏览器mouse协议及DOM命中检查；不依赖WebKit后台帧停顿时的locator RAF稳定检查，不合成DOM click。

当前[S6报告](../evidence/examples/interactive-engine-improvements/container-s6.json)48/63场景可见，15个WebKit父容器resize后画面失败原样保留，CLI exit1。无SDKWebGL2对照同样6个PNG不可见但GPU读回正常。既有SDK、声明和npm字节未变；原Puzzle50及实体设备旋转仍NOT_RUN。

本包消费者副本及安装说明见[interactive-kit](examples/interactive-kit/README.md)；上面的examples路径和dev命令适用于仓库检出，不假设npm包带开发服务器。

## 2026-10-19 原 Puzzle50 最小反例复核

已取得原私有最小夹具，固定工程 `aaecb78f17f5a1af05f658e8421b3653ef93467f` 与当前 main `a21d49bd4f68054e22242609bca2da50eccd054d`，仅在 HTTP 响应替换 SDK 字节，原 HTML/JS/CSS 保持不变。Cloud WebKit 26.5、DPR 1/2 下分别运行旧 SDK 无 workaround、旧 SDK 原 fix 按钮及当前 SDK 无 workaround。六会话共 30 阶段覆盖初始、viewport、CSS-only、隐藏再显现和重复相同尺寸；旧无 workaround 的后四阶段 buffer/真实点击失败，旧 workaround 与当前 main 全通过。当前 CSS-only/显现截图及旧负控均已人工查看。

[公开技术摘要](../evidence/sdk-backlog/puzzle50-resize-main-20261019.json) 保留精确输入与运行期 hash、原生 backing buffer/点击结果及截图 hash，不公开原私有源码或图像。此结果覆盖原最小反例；50 个游戏全量、真实设备及 observer 退出释放仍未验收。旧报告中“原 Puzzle50 尚未取得”的记载保留为历史，不再作为当前阻碍。
