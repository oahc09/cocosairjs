# 端口缺口证据

当前文件是2026-10-04的阶段记录，完整计划尚未完成。执行分工见[台账](../../../ai/ledgers/port-gap-remediation.md)，验收规则见[schema](../../reference/port-gap-evidence-schema.md)。没有暂存、提交或发布。

当前完整scope状态是 `eg0-status-s30.json`至`eg5-status-s30.json`和`aig-status-s30.json`的NOT_RUN，AG1/AG2为待外部材料BLOCKED，共7 NOT_RUN、2 BLOCKED。S30汇总17份组件报告，已记录输入SHA全部与当前文件一致，完整gate通过数仍为0。库存88套件/754测试是Lead S20的实际执行结果，本批没有重跑库存。六类统一仓库/实际安装消费各17 PASS/1 WebKit FPS NOT_RUN；Lead S30已完成隔离原生post九项像素/恢复/资产归还子集。真实hidden、加严WebKit resize呈现、完整能力/配置/部署范围、最终完整冻结及外部验收仍未闭合。Orca Worker S20和S21只读终态已从执行通道确认；S21状态生成时的“未收到”是当时事实，后续审查不改变完整gate未通过的结论。

S15九状态报告保留为当时记录，14组件输入一致与751原生库存是历史时点，不再当作当前库存。S20早期及S20-final分别对应各自字节快照，保留为历史。S21审查16份组件并显式区分默认候选与原生post隔离变体；只有记录的输入SHA一致性，不从文件存在推断所有源码或完整gate已经通过。

历史`eg0-status-s11.json`至`eg5-status-s11.json`、`aig-status-s11.json`记录完整gate为NOT_RUN；`ag1-status-s11.json`和`ag2-status-s11.json`为BLOCKED，缺少外部30项目及应用验收材料。它们不把已通过子集算成全量验收。PG-33、真实hidden、WebKit resize呈现、最终库存/冻结与聚合仍有缺口。

其余`*-s11.json`是实际浏览器子集的PG-34规范化报告：

| 报告范围 | 实际执行来源 | 浏览器场景行 |
| --- | --- | --- |
| EG2 安装包混合输入 | Lead S10实际tarball离线安装，两后端/两canvas；合成触点与可信键鼠分层 | 12 |
| EG3 安装包图集 | Lead S11实际tarball加载，旋转/trim/多页/索引及引用回收 | 3 |
| EG3 蒙皮、容量、UV | Lead当前统一默认运行时及实际GPU观测；每份原报告记录内部断言范围 | 每份3 |
| EG3 原生参考矩阵 | Lead S11粒子/builtin碰撞/Cannon刚体/夜城实例化四例 | 12 |
| EG3 相机可见性 | Lead S9只读过滤诊断与像素，运行时与当前默认产物逐字节相同 | 3 |
| EG4 场景切换 | Lead S11每浏览器100次实际绘制/释放及reload | 3 |
| EG4 稳定性 | Lead S9每浏览器真实十分钟，源码/夹具/runner与当前指纹一致 | 3 |
| EG4 glTF取消 | Lead S9真实延迟HTTP子请求abort，顶层容器明确不中止；相关指纹一致 | 3 |

全部subset=true/completed=false；计数为浏览器场景行，内部断言不重复相加。原始报告/日志路径、实际时间/命令、全部输入指纹和安装包身份在各JSON中可查。规范化不重跑浏览器、不改原日志，也不补偿其他范围的失败；历史失败与后续补偿仍在台账及原始输出中保留。

`eg3-gltf-direction-s12.json`补充当前默认产物的三浏览器glTF外部PNG/嵌入图片方向、实际sampler、交错上传后原纹理复用、非法sampler拒绝和资源释放。首轮探针错误及实际补偿执行由attempts与原始日志保留；仍为三个浏览器场景行的限定子集。合同见[当前UV验证](../../reference/texture-uv-verification.md)。

`eg3-complete-reference-matrix-s12.json`记录完整26条参考矩阵在三个浏览器中78/78通过，原生矩阵报告completed=true/subset=false。其范围仍只是完整EG3的一部分，因此本目录规范化报告保留subset=true/completed=false；不能据此覆盖加严WebKit resize截图失败或其他待测条件。

`eg3-texture-sources-s13.json`记录当前候选七种图片/字节/内存输入在Sprite与原生plane的三浏览器实际绘制（每浏览器20次），以及交错后原纹理/帧身份和真实释放；ImageData为公开类型不适用，由独立TS负例检查，不计GPU执行。规范化计数仍为三个浏览器场景行。历史PG24 run1/run4保留，不覆盖本次当前证据。

`eg3-platformer-s14.json`记录Lead修复后的实际三浏览器TMX/Box2D配方：速度单位换算、原生µ=0.2摩擦、松键空中惯性、单向平台支撑、可信键盘、暂停/restart和退役清理。九次实际attempt和补偿链保留，计数为三个浏览器场景行；不是全EG3或原作1:1比较。

可用`node tools/verify/port-gap-evidence-schema.cjs --report=<本目录报告.json> --verify-paths`核对结构与原始路径。当前原始采集物位于本机`output/playwright/`，不在npm包内；转移报告时必须一并提供这些原始文件，否则路径验证应失败。GPU完整分配量unavailable，不能从引用归零或场景销毁推出永久无泄漏。

`eg3-installed-recipes-s20.json`记录实际离线安装包六配方的18个浏览器/配方行：17已测、1 WebKit FPS未达，NOT_RUN/exit1/subset=true/completed=false。规范化调用当前逐阶段原始校验并验证15输入SHA，保留18截图、实际包两源码/资产身份、12次真实历史attempt和变化的app/collector输入；不伪造完整补偿PASS。两次历史安装资源交付FAIL保留，最终可选服务三浏览器通过。仓库路径另外18行仅在原始报告中，不重复相加为不同配方。

`eg4-native-post-prerequisites-s21.json`记录owner #6(b)批准的隔离变体，candidate明确指向`output/playwright/post-s21-build/cocosair.module.js`，没有使用默认bundle身份替代变体。三浏览器原生注册/配置可达，因effect布局数据和六项原生effect资源缺失而init失败；Bloom/FXAA/ColorGrading按浏览器/效果计9项像素A/B全部NOT_RUN。三次init诊断与失败截图不计为效果像素通过。默认unmin/d.ts/npm前后不变，20原始输入SHA一致；资源清单、堆栈及日志见[后处理前置记录](../../notes/post-process-notes.md)。

`eg4-native-post-s30.json`记录Lead实际执行的隔离变体原生Bloom/FXAA/ColorGrading：三浏览器九项像素A/B全部PASS，27张PNG、逐效果restore和contribute0零差、六颜色CPU oracle零误差，以及每浏览器16实际资产引用1→0和正常销毁。每次执行23输入SHA/bytes稳定，0默认SDK混入、0pageerror；102项原始数据篡改全部拒绝。首轮Chromium失败、当次执行源码归档及后续实际成功补偿保留，S21–S29历史不覆盖。该报告subset=true/completed=false；布局、编译资源和注册包装构成实验候选的一部分，不能据此宣称默认SDK或完整EG4通过。编译器来源为本机cocos-cli实现，GPU完整分配量unavailable。详见[后处理S30验收](../../notes/post-process-notes.md#13-s30-原生三效果像素子集完成2026-10-04lead实际执行)。
