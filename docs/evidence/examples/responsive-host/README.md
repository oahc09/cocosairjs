# 响应式宿主定向证据

本轮原生 canvas PNG、输入与生命周期合同结果见 [index.json](index.json) 和 [native-report.json](native-report.json)。原始 JSON 按字节保留，内部 output 路径通过索引 origin → stored 映射定位；历史失败未改写为成功，未补造不存在的早期 source/SDK 快照。

15 个配置行原生范围 PASS；DPR1/2 六行各 42 项，另验证三浏览器安全入口、cap1.5、窗口/默认策略。pageCompositionPassed=false 保留，尤其当前 Windows WebKit 页面截图与正确 GPU/原生 PNG 不一致。两通道不能互相替代，原生范围 PASS 不是页面合成通过。

当前 bundle、源文件、测试/工具、报告和 PNG 的 SHA256 在索引中。没有外部 50 游戏/707 场景重采或整仓发布就绪结论；详细范围见[实施台账](../../../../ai/ledgers/responsive-host-remediation.md)。
