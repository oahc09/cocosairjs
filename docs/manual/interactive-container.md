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
