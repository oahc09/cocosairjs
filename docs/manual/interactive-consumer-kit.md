# 实际安装包中的小型互动示例集

2026-10-08，Lead实际执行。[生成副本](examples/interactive-kit/README.md)来自五个权威examples目录：多通道、几何/投影、混合输入、容器和可取消形变/音频。18份包内文件（16份来源代码/合法音频/许可加manifest与README）按字节收入现有npm manual目录；复制清单记录SHA和限制，不新增公共runtime API，也不自动给宿主安装工具。

[第二轮实际报告](../evidence/examples/interactive-engine-improvements/kit-consumer-s2.json)包含本地npm pack、系统临时目录offline install、已安装声明的TS4.9 strict noEmit和实际package entry经esbuild分块。15个浏览器入口全部真实从已安装包字节加载，零仓库/build请求、零workspace fallback、零page/console error，默认开发/声明/npm三身份前后不变。报告附tarball及实际SDK分块，临时消费目录随后安全清理。

每例记录initial→可信控件→Reset→viewport resize→释放，共60张PNG。collector独立复算Canvas区域目标像素，查模型/session/原生帧、终态和资产引用。容器要等帧、camera尺寸与导航token就绪；控件必须实际可见并用可信点击，滚动后回到Canvas采证。首轮容器150ms过早及屏外控件漏收的原报告保留，首次尝试数不是零。

第二轮55/60PNG通过，五张WebKit活布局PNG失败（multipass/geometry的resize与container的narrow/wide/viewport resize）。模型与终态检查通过，但完整scopePassed=false、CLI exit1；不能以runtime导入成功替代可见性，也不能把五例统一包装为全平台认证。其他source完整collector仍为各例主要验收范围；本安装批只覆盖上述普通路径，不补偿WebAudio缺失或实体设备未验。

[tarball独立字节复核](../evidence/examples/interactive-engine-improvements/kit-consumer-s2-tarball-audit.json)确认16份来源文件和npm模块在压缩包内逐字节匹配已安装记录。

[15种实际行篡改](../evidence/examples/interactive-engine-improvements/kit-consumer-s2-audit.json)全部拒绝，无新增浏览器。用户用包接入时保持每例index.html DOM、asset相对路径及importmap，把cocosair指向已安装cocosair.js主入口。原云端参考不在包内，新音轨许可单独记录。限制包括18组教学部件、本地499秒终点、受限切割、解析反射与环境反射区别及当前浏览器受限范围。

```powershell
node tools/examples/interactive-kit.cjs --write
node tools/examples/interactive-kit.cjs --check
node tools/verify/interactive-kit-consumer.cjs --out=<new.json>
node tools/verify/interactive-kit-consumer.cjs --verify=<report.json>
node tools/verify/interactive-kit-audit.cjs --report=<report.json> --out=<new-audit.json>
```

write刷新生成副本，check只读比较。consumer执行本地pack（prepack会刷新npm release副本）、临时offline install和浏览器采集；不下载依赖、不发布，显式写新报告/artifacts，关闭服务并清理自己创建的临时目录。verify只读；audit只写新JSON。原始工程、实体设备与发布验收不在这份受限结果中。
