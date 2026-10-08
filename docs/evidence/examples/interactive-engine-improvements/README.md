# 互动引擎补齐：基线与可见性证据

2026-10-08，执行渠道区分为 Lead 实际浏览器采集与 Orca Worker 工具合同测试。

| 文件 | 含义 |
| --- | --- |
| [baseline-s1.json](baseline-s1.json) | S1 时点身份、20 能力存在性与具体去重；默认不将可用测试文件标成执行通过，后续工作区变更不能继承该时点 PASS |
| [native-chain-s1.json](native-chain-s1.json) | Lead 首次规范化三浏览器尝试，Firefox DPR2 reset 截到旧画面，范围 FAIL；保留旧输入指纹与 PNG |
| [native-chain-s2.json](native-chain-s2.json) | Lead 固定两次浏览器绘制等待后的实测，三浏览器×DPR1/2×五状态，30 PNG；原生单时钟与清理检查通过 |
| [native-chain-audit-s2.json](native-chain-audit-s2.json) | Lead 在实际报告内存克隆上做 19 种篡改，全部拒绝；browserRunsAdded=0 |
| [hdr-current-s1-index.json](hdr-current-s1-index.json) | Lead 复用已有 HDR 示例在当前模块 `3a448f02…` 重跑，三浏览器各 15 项检查通过；相邻目录保留原始报告和 PNG |
| [multipass-s3.json](multipass-s3.json) | Orca Worker 实测三浏览器 45 定步状态 + 两路线各三浏览器普通模式，共 51 PNG；Lead 仅重映射路径归档同字节截图 |
| [multipass-s3-raw.json](multipass-s3-raw.json.gz) | Worker 本轮原报告原字节副本；其原始 ignored output 路径不作为干净检出的验证入口 |
| [multipass-s3-audit.json](multipass-s3-audit.json) | Lead 对归档报告重算基线并做 16 种内存篡改，全拒绝；无新增浏览器 |

S2 中每组四个可见状态 PASS，一个遮挡状态可见性 FAIL。独立 scopePassed=true 表示既定正例及预期负例正确处理；不表示所有原工程、12 项任务、实体设备、完整 gate 或 release readiness 已通过。subset=true/completed=false。

PNG 路径、SHA、实际事件/对象/提交/截图时间与指纹均在各报告中。旧报告不能因后来工具修订而冒充当前版本已验；S2 验证器重新读取磁盘和 PNG 并复算位置，不信报告自报成功标志。

Worker 的 S0 首批误收被 Lead 13 条拒绝测试发现，修正版 27 条合同测试通过；Lead 后续增加原生像素/身份与拒绝回归。合成合同测试与本表真实浏览器结果分开。初始基线与完整执行记录见[台账](../../../../ai/ledgers/interactive-engine-improvements.md)。

HDR 本次只复验既有 sRGB/线性对照、双解码反例、浮点 capture 与 tone map、离线 GGX 消费及原有生命周期。HDR S1时Water/透明/斜裁剪增量尚未运行；后续当前增量见本目录Water与color-compare S2，仍不得把这些子集写成IER-03全任务通过。

Multipass 本轮包含完整格式分配矩阵、十轮真实重置、每轮引用退役、节点解绑、原生控件和终态。
GLSL/std140 的实际错误与 descriptor binding/未绑 sampler 的静态一致性检查分开记录。
归还后同步 `isValid` 可能仍为 true；Lead 另在 Chromium 等待 350ms 后确认 buffer/texture 计数回到基线。
native MSAA 采样、长期干扰和原云端参考匹配仍未验；本目录不是 12 项任务或 release readiness 完成证明。

Geometry S7 执行渠道为 Lead（Orca Worker 初稿后由 Lead 修正）。[规范报告](geometry-s7.json)与[原字节报告](geometry-s7-raw.json.gz)保留141张实际PNG：三浏览器111矩阵行=93 PASS/18 WebKit活resize FAIL，雨线6/6、网格3/3、生命周期3/3、普通入口9/9通过。完整 scopePassed=false、实际CLI exit=1，不能用几何误差合格补偿不可见截图。

[独立审计](geometry-s7-audit-final.json)区分“已记录观测结构合规”与“完整范围通过”；内存篡改拒绝不新增浏览器。[S6失败原报告](geometry-s6-failed-raw.json.gz)保留事件漏字段、Escape采证超时和空白误判轨迹，工具/源后来变更不继承旧身份。[无SDK WebGL2对照](resize-control-s4-index.json)附原始记录、脚本原文和六PNG；WebKit resize后GPU红而compositor白，暂不据此归因SDK核心。原soft/Water参考仍NOT_RUN。

Input S3（Lead）：[报告](input-s3.json)保留400次真实操作/400 PNG和62条补充检查，全部功能/像素子项通过；32项NOT_RUN与Chromium SDK两条不可取消touchcancel原生PAL诊断使完整scopePassed=false、exit=1。[审计](input-s3-audit.json)29/29新增拒绝；[失败尝试索引](input-failed-attempts-index.json)保留历史原始身份。普通HTML对照零SDK请求，不混入mouse替代touch、原参考或实体设备验收。

Container S6（Lead）：[报告](container-s6.json)63状态48 PASS/15 WebKit活布局FAIL；[原报告](container-s6-raw.json.gz)、90 PNG和[24种拒绝审计](container-s6-audit.json)保留。27无SDK对照中的六个WebKit resized截图失败，GPU仍红；不据此归因SDK。冷导航与释放通过，原Puzzle50 NOT_RUN；[尝试索引](container-attempts-index.json)保留失败轨迹。


当前增量全部由Lead执行（2026-10-08）：[Water](water-runtime-s1.json)三引擎117检查通过；[颜色/透明/斜裁剪](color-compare-s2.json.gz)15状态/PNG通过，两路径图像同色，首轮法线/字段失败保留。[时间轴](timeline-s4.json)6形变/6滚动通过及CH/FF48音频落点，共118PNG；WK两WebAudio行NOT_RUN，完整exit1。

[性能试跑](performance-pilot-s1.json)36个5秒窗口采集完整但LIMITED，首窗口并发PNG审计影响明确保留；实体设备与3×60秒验收NOT_RUN。[实际包消费](kit-consumer-s2.json)15入口类型/运行/终态通过，60PNG有5 WK活布局失败，完整exit1。raw字节、tarball、SDK分块、日志及审计在盘，规范报告只迁移artifact路径，不将历史错误改写成成功。原资料缺失、实体设备及完整12项/release仍未达。


最终本机集成：[121套1080测试、1076通过/4旧失败](final-test-inventory-s1.log)，[11份报告101输入无漂移](final-current-input-review-s1.json)，[归档后独立复算](final-archive-validation-s1.json)保留两WK WebAudio NOT_RUN/五安装PNG失败而非伪造全绿；[tarball实际字节](kit-consumer-s2-tarball-audit.json)与来源/安装一致。完整12项与release未通过。工具CLI和写行为见tools/README；本机实现已提交于 `5a967c7`。

2026-10-08 按用户要求清理体积：[清理记录](storage-cleanup-2026-10-08.json)保留删除前的 SHA256、字节数和恢复提交。颜色 S2 的完整像素数组、15 PNG、输入身份及判定不变，JSON 改为紧凑格式；重复 raw 副本删除。S1 失败记录改为[诊断摘要](color-compare-s1-failed-summary.json)，保留错误、原生状态、读回摘要及日志，不再保存完整旧像素数组，也不能用摘要重新裁定像素通过。原始文件可从 `5a967c7` 恢复；其他报告的 raw、安装 tarball 及验证器所需分块仍保留。

同日继续[无损压缩](storage-compression-2026-10-08.json)：九份大文件改为 `.json.gz`，解压后逐字节一致；七份规范报告精简空白及 raw 存储位置，观测数据不变。清单分别记录压缩文件与解压内容的字节数和 SHA256，不能混用。PNG、tarball、SDK 分块、采集代码与既有失败判定均保留。

颜色审计直接接受压缩报告：

```powershell
node tools/verify/interactive-color-compare-audit.cjs --report=docs/evidence/examples/interactive-engine-improvements/color-compare-s2.json.gz --out=output/color-compare-audit-new.json
```

其他原始归档可用 Node 内置 zlib 解压到一个新路径，再交给对应审计工具；不需要安装解压包，也不覆盖已有文件：

```powershell
node -e "const fs=require('fs'),z=require('zlib');fs.writeFileSync(process.argv[2],z.gunzipSync(fs.readFileSync(process.argv[1])),{flag:'wx'});" docs/evidence/examples/interactive-engine-improvements/timeline-s4-raw.json.gz output/timeline-s4-original-new.json
```
