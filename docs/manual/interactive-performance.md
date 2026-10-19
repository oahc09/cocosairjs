# 互动场景性能原始样本与测量边界

## 2026-10-19 采集合同修复

纯 CPU 合同反例证实，旧审计器只计输入数，重复合法 fingerprint 可替代真正必需来源；将未冻结帧预算写成任意值也未被拒绝。schema/2 现在要求精确且唯一的当前来源，包括动态生命周期 JS/声明及 auditor，并锁定未测预算状态，校验首个原始 interval/nativeFrame 和 screenshot 操作归因。collector 结束时复用同一审计器决定 measurementComplete。

新增合同夹具明确标 SYNTHETIC_CPU_CONTRACT，不能作为测量数据。当前没有新 36 窗口或 3×60 秒性能结果。目标实体设备和预先帧时间/可见画质预算仍未提供，保持 LIMITED/NOT_RUN；不假设 60fps。旧 schema/1 报告继续作为历史原件，不冒充新校验器验收。

## 历史 2026-10-08 试跑

2026-10-08，执行渠道Lead。本机[试跑报告](../evidence/examples/interactive-engine-improvements/performance-pilot-s1.json)是 LIMITED，不是设备性能达标。用户尚未提供目标实体设备、浏览器与帧时间/画质预算；任务建议的3×60秒设备验收保持NOT_RUN，不假设60fps或把掉帧数补零。

测量前冻结本机短窗口设计：Chromium、DPR1/2、idle/每500ms目标切换/真实音频三个负载、截图关闭/开启两个工具条件，各3轮；每轮预热1秒，记录5秒，共36窗口。开启截图时约每秒抓取一张，单独记录Playwright wall-time。浏览器渲染器原始值保存在各行，不能将软件渲染结果归因实体GPU。

AFTER_DRAW间隔是帧回调间隔；BEFORE/AFTER_UPDATE及BEFORE/AFTER_DRAW分别记录CPU回调区间与提交区间，包含相应回调开销，不是GPU执行时间。GPU timer unavailable。每帧timestamp、nativeFrame、interval、updateMs、submitMs和每截图wall-time全部保留；p50/p95/p99使用排序后下取整阶次 `floor((n-1)*q)`，worst不剔除长帧。

36窗口完整采集，无页面错误，三资产每轮1→0。主机未隔离；首窗口期间另一个只读时间轴PNG审计仍运行约10秒，这一并发活动不能用于纯SDK归因，也不能事后删除该轮美化统计。截图开销对照仅供定位采集成本，独立时间轴像素证据负责画质，不用平均帧时间替代可见性。

[独立审计](../evidence/examples/interactive-engine-improvements/performance-pilot-s1-audit.json)从raw重算统计、验证窗口组合/帧序列、PNG身份/解码和释放；篡改拒绝不新增浏览器。设备与预算到位后应预先冻结长窗口、质量条件、工具隔离与接受阈值，再运行正式测试。

```powershell
node tools/verify/interactive-performance.cjs --out=<new-pilot.json>
node tools/verify/interactive-performance-audit.cjs --report=<pilot.json> --out=<new-audit.json>
```

两命令只写显式新输出。collector使用当前已构建SDK与[时间轴](interactive-timeline.md)，不安装、不构建或发布。报告exit0只表示短试跑采集完整，result仍LIMITED。
