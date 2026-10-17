# 全仓发布门禁证据刷新

## 2026-10-17：本机可执行项刷新

本轮已刷新当前候选的 API 清单、派生覆盖率、DevTools 独立证据、Gallery 和完整三引擎 browser-matrix。包版本仍为 `1.0.0`，构建计数保持 169；未暂存、提交、推送或发布。使用已有真实构建 168/169 的相同 SDK 字节，并重新核对 dev/min 各 938 个源映射和 Spark 的 63 个源映射。

| 项目              | 当前结果                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| API 清单          | 13,515 单元，required 1,439；与当前声明匹配                                                                                                    |
| 普通 API 冻结采证 | **BLOCKED**；完整范围为 183 个示例、184 个会话。新版托管要求 Linux `/proc` 与子进程收割，本机无可用 WSL/Docker；用户选择保留环境阻塞           |
| DevTools 独立证据 | **5/5 PASS**；`--preserve-metadata` 保留全部规格、状态、promotion 与 manifest 字节；不填补普通 API 采证缺口                                    |
| Gallery           | **303/303 PASS**；188 条清单、183 个场景启动、91 项资源释放；页面错误、外部请求与原生 GPU 校验错误均为 0                                       |
| browser-matrix    | **78/78 PASS**；三个引擎，`completed=true`、`subset=false`；81 张截图哈希与字节数核对通过，包括 Windows WebKit 视频循环                        |
| 输入守卫          | 采集期间输入摘要一致，189 份规格/manifest 原始字节无变化；这是本机证据输入清单，未冒充正式 API freeze                                          |
| 覆盖率            | 当前仅认可有效证据中的 18 个单元（call 16 / read 2），其中 Core 17/964（call 15 / read 2）、Important 0/283、Advanced 0/192；严格阈值保持 FAIL |
| 真实 Safari       | 外部 **NOT_RUN**                                                                                                                               |

发布门禁实际退出 1，仍为 **NOT READY**。当前 9 条消息由两类原因产生：普通 API 的合规采证及派生覆盖率链阻塞，以及用户要求保留的未提交工作区。清单声明失配、Gallery bundle 失配和 browser-matrix bundle 失配已消除。缺证据的 API 不使用旧 PASS、文档状态变更或 Gallery/矩阵结果代签。

本轮保留旧正典、全部日志、失败的首轮 Gallery 空筛选尝试及其实际生成物。空环境变量导致 0 示例的调用错误已在启动包装器中修正，未改 Gallery 断言或延长超时。CPU 仅执行 3 个相关冻结范围/拒绝控制用例，另 94 个未选择；没有声称全仓 Jest 或 Linux 托管套件通过。

[当前机器汇总及证据哈希](../evidence/release-refresh-windows/report.json)、[本轮原始回执](../evidence/release-refresh-windows/receipts.json)、[Linux 环境阻塞](../evidence/release-refresh-windows/api-preflight.log)、[当前门禁日志](../evidence/release-refresh-windows/release-readiness.log)。

## 2026-10-16 历史快照

以下是旧候选的原始验收记录，PASS、全仓测试数量及“唯一阻塞”仅适用于当时的候选，不能签署上述新候选。

2026-10-16。Windows WebKit 视频循环阻塞已修复，完整 browser-matrix 与全仓测试均已通过。版本保持 `1.0.0`，npm scripts 保持 48 个；不暂存、不提交、不推送、不发布。发布门禁仍为 NOT READY，唯一阻塞是用户要求保留的未提交工作区。真实 Safari 继续保留外部 NOT_RUN。

[机器汇总与证据哈希](../evidence/release-gate-refresh/report.json) 绑定本轮 API、Gallery、矩阵、WebGPU 归档、测试清单和实际全仓日志。候选包含原有未提交改动，整包大小和结果不能归因于单一 WebGPU 改动。

## 已修复

- 冻结 builtin 重建保留原有 21 个 effect 入口，补入同一冻结提交的 glTF 私有模板，合计 22 个 effect / 50 个 shader，包括 Profiler、skybox、splash 等 pipeline/util 入口。
- glTF 物理材质从冻结 `legacy/standard.effect` 派生，恢复 `StandardSurface` 扩展钩子；补全 glsl4 sampler 布局、消除独立 sampler 偏移冲突，按实际 shader 变体延迟创建原生 descriptor layout。
- WebGPU 二维颜色上传纹理补充原生 attachment usage；canvas 上传纳入第 17 项资源回归，Profiler 文字通过真实截图验证。雾效 helper 保留冻结模板的无雾 planar-shadow stage。
- Windows WebKit 在原生 loop 回绕后误停时，仅在 seeked 后恢复仍有效的播放意图，不改循环时间、不伪造事件；显式控制和换源能取消恢复。失败播放 Promise 不再迟到校准，过期 ended 回调检查当前原生状态。预加载零位置赋值按实际 seeking 状态记账。
- 视频示例源码指纹、矩阵合同及原 H.264 资产保持不变；循环期间 COMPLETED 仍严格要求 0，回绕后必须持续前进。诊断、取消边界和 dev/min 真实解码补验见 [视频专项](webkit-video-loop.md)。
- 采集器支持显式 `AIR_CHROMIUM_PATH`，使用正确媒体 Range 响应，绑定跨示例 shader 依赖，并拒绝采集期间的源码、规格及候选漂移。Gallery 修复嵌套部署、配方源码、入口就绪及 WebGPU 资产校验。
- 188 个示例规格完整冻结，4,670 条 API 绑定无漂移；experimental 成熟度及专用 Agent/Gallery Gate 边界保持。

## 当前验收

| 范围                     | 结果                                                                    | 证据                                                                                            |
| ------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| dev / min / declarations | PASS，构建计数 164/165；JS/map 源码一致                                 | `output/playwright/webkit-video-loop-r4/build.log`                                              |
| API 清单                 | 13,514 units，1,439 required，revision `9aa223482b9ae1f3`               | [API 清单](../example-api-inventory.json)                                                       |
| 通用 API 浏览器采集      | 183/183 PASS；完整当前候选                                              | [逐 API 证据](../evidence/examples-verified.json)                                               |
| DevTools                 | 5/5 PASS                                                                | [DevTools 证据](../evidence/devtools-examples.json)                                             |
| WebGPU 桌面及安装包      | Chrome / Edge / Firefox 及安装包 dev/min 各 21/21；17 项资源合同通过    | [归档清单](../evidence/webgpu-release-refresh/manifest.json)                                    |
| 静态及针对性回归         | 19 条命令通过；含启动/glTF 56、物理材质 40、雾效 3、视频 16、D10 4      | [静态回执](../evidence/webgpu-release-refresh/static/report.json)                               |
| Gallery                  | 303/303 PASS；183 个场景、91 项释放合同                                 | [Gallery 证据](../evidence/gallery-artifact.json)                                               |
| browser-matrix           | 78/78，completed=true、subset=false                                     | [三引擎矩阵](../evidence/browser-matrix/browser-matrix.json)                                    |
| 全仓 Jest / 测试清单     | 197/197 套件、3,105/3,105 项通过；清单已更新，无遗漏或跳过              | [实际日志](../evidence/release-gate-refresh/test-inventory.log)、[清单](../test-inventory.json) |
| 全仓格式                 | PASS；采集后 188 个规格排版前后，规范化源码、候选及 WebGPU 指纹均无漂移 | [机器汇总](../evidence/release-gate-refresh/report.json)                                        |
| 发布门禁                 | NOT READY；仅未提交工作区 1 项阻塞                                      | `output/playwright/webkit-video-loop-r4/readiness.log`                                          |
| 真实 Safari              | NOT_RUN，保留外部验收                                                   | [环境说明](webgpu-environment.md)                                                               |

Core 964/964（call 849 / read 115）、Important 273/283（call 246 / read 27）、Advanced 180/192（call 161 / read 19）均达到覆盖率门禁。全清单 verified 1,627，其中 call 1,442、read 185、unknown 0；stale/schema gap 均为 0。读取证明不等于函数调用。新增的两个内部覆盖方法反映在清单 revision 中，required 分母不变。

## 媒体与历史边界

原生无 AIR 对照仍能重现 Windows WebKit 回绕后暂停；本轮通过的是运行时兼容路径，没有修改浏览器二进制，也未用替换视频资产或放宽断言消除失败。dev 既有播放器、dev 新建播放器和 min 新建播放器均连续跨过 3 次循环，分别采到 38/38/36 个不同真实解码帧；均为 0 COMPLETED、0 额外 seek。日志、截图及源码快照在 [视频专项证据](../evidence/webkit-video-loop/manifest.json)。

Windows Playwright WebKit 不等同于真实 Safari。Safari、移动设备及其他 GPU 的外部范围未由本机结果补签。WebKit 原生 WebGPU 缺失仍保留 BLOCKED，不以 WebGL2 对照补签 WebGPU。

上一轮构建 160/161 的 77/78、全仓 3 条矩阵断言失败及未改写测试清单的记录，连同旧 WebGPU 归档，保留在 `output/playwright/webkit-video-loop-r4/history/`。本轮独立重新采集并完整复跑后更新测试清单，没有把历史失败改标为 PASS。
