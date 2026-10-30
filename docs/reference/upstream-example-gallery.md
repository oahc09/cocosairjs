# U09：互动材质检视展台与专题入口

本页记录 AIR-UPSTREAM-20261022 的 **draft 候选示例**，不是发行说明或浏览器验收结论。新增八个入口复用同一原生展台实现；它们不是八套独立渲染器，也不能作为八次独立功能通过计数。`status` 仍为 `draft`，不新增 `promotion`。`specStatus` 仅在严格静态规格校验后冻结为 `frozen`；这不是浏览器验收或稳定晋级，运行结果仍为 NOT_RUN。

当前环境的真实浏览器执行为 **INFRA_BLOCKED**；移动端、真实 AgentGate 及完整业务验收仍为 **BLOCKED**。源码、元数据校验、CPU 回归和页面存在均不能代替截图、真实 pointer 效果、GPU 结果或完整生命周期证据。已有示例的历史 PASS 不适用于本次候选。

## 入口和教学边界

| 入口                                                                                   | 主要教学目标                                                           | 本入口不能单独证明的内容                                                    |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [asset-request-policy](../../examples/asset-request-policy/index.html)                 | 在原 `GLTFLoader` 上配置请求策略，观察阶段，取消后以新请求重试         | 浏览器 HTTP cache 实际命中、请求先后顺序、受控延迟依赖的服务端日志          |
| [material-contract-lab](../../examples/material-contract-lab/index.html)               | 区分 glTF 输入校验、原生材质实例 uniform 更新及共享模板；调整 UV/虹彩  | 动态状态与直接构造最终状态的 GPU 像素等价、所有极端有限 IOR 的数值稳定性    |
| [render-state-isolation](../../examples/render-state-isolation/index.html)             | 观察单 capture 透射与两个普通离屏目标，区分材质和视图资源所有权        | 完整 A→B→A 像素隔离、任意 resize/DPR/绘制顺序矩阵、同 Scene 多 capture 透射 |
| [skinned-instance-lifecycle](../../examples/skinned-instance-lifecycle/index.html)     | 三个 glTF 实例的独立动画、Morph、选择及销毁/重建                       | 真实跨视锥裁剪、CPU oracle 的全矩阵复现、COLOR_0 morph 支持                 |
| [first-frame-readiness](../../examples/first-frame-readiness/index.html)               | 区分应用加载面板和完整首帧就绪证明，进入独立就绪 fixture               | Shader/Pass 全局 ready、GPU 完成、compositor 已呈现或任意业务状态无副作用   |
| [depth-precision-lab](../../examples/depth-precision-lab/index.html)                   | 从默认原生场景进入显式选择的 depth 诊断和 native depth-texture fixture | 引擎级 Reverse-Z、完整 OIT、WebGPU/移动 GPU 的精度或性能收益                |
| [probe-sh-lab](../../examples/probe-sh-lab/index.html)                                 | 从默认原生场景进入独立串行/atlas 与 SH 研究 fixture                    | 运行时 light-probe baker、生产场景批量捕获、真实遍历开销或驱动峰值显存      |
| [material-inspection-showroom](../../examples/material-inspection-showroom/index.html) | 组合原生场景、资产、材质、交互、透射和资源所有权，检视中等复杂业务场景 | 完整 U09/U10 验收、真实移动端交互、稳定性或发行就绪                         |

各入口的 各自的 main 模块 选择教学主题；实际应用代码位于 [`material-inspection-showroom/src/showroom.ts`](../../examples/material-inspection-showroom/src/showroom.ts)。普通启动只使用主引擎和固定本地资产，不自动启动研究 fixture、DevTools、第二份引擎或实验后端。

## 在仓库运行

在已经允许执行浏览器的环境中，先按 [README](../../README.md) 和 [npm 命令说明](npm-scripts.md) 准备依赖及当前源码构建，再从仓库根目录运行：

```sh
npm run dev -- --example material-inspection-showroom --port 7454
```

将 `--example` 替换为上表任一 ID 可切换专题。使用终端提供的开发地址；不能用旧 `build/` 的存在替代本次源码构建。仓库开发服务器负责示例 TypeScript 转换，不能直接将 `.ts` 文件交给普通静态服务器或使用 `file://` 作为等价运行方式。

安装 SDK 的应用应使用真实包名 `cocosair.js`，而非仓库 import map 的 `cocosair` 别名；主入口仍是浏览器入口。TypeScript 4.9 legacy 与现代声明遵循原发布包消费合同，`/math` 才是独立 CPU-only 入口。参阅 [glTF 运行时](../gltf/gltf-runtime.md)、[decoder 部署](../gltf/gltf-decoder-deployment.md) 和 [WebGPU 边界](../guides/webgpu.md)。本页没有建立新的包出口或声称 npm 已发布。

## 展台操作与所有权

默认场景组合一个固定本地 rig glTF 的三个实例、12 个材质样片、一个程序化 crystal glTF、一个 `AirTransmissionCapture` 和两个普通离屏预览。它继续使用原生 `Scene`、`Node`、`Camera`、renderer、`Material` 和 `Animation`，不另建场景图、材质框架或资源管理器。

操作顺序：

1. 等待资源加载面板给出实例可用状态；检查实际 backend、错误及当前选择，不把该状态解释成 compositor 就绪。
2. 拖动视口旋转视角，点击对象或使用控件选中实例/样片。移动 viewport、容器大小和 DPR 改变后的真实命中仍须分别采集。
3. 切换选中实例的材质，调整颜色、UV、虹彩和 Morph；暂停或单步动画。核对选中对象变化与其他实例隔离，不能只统计 handler 被调用。
4. 使用取消、重试、销毁和重建操作观察状态及所有权变化。成功响应仍须经过当前请求代际检查，避免晚到结果重新挂载。
5. 调整主相机 near/far，合法条件为 finite `0 < near < far`；使用 Reverse preview submission order 交换两台预览相机 priority，勾选 Show projected world AABB 查看选中对象投影。近远平面更新不切换 depth format 或 reverse convention；覆盖层不是独立包围盒正确性证明。
6. 在原生 pacer 工作时运行 30 次生命周期循环，保留每轮真实资源观察和错误。此控件的存在不代表 30 轮已通过；不要通过任意 sleep、私有销毁队列 flush 或修改资源有效标志制造成功。

共享的 glTF Mesh、Texture、Skeleton、Clip 仍由资产拥有，实例具有独立节点和动画/Morph 状态。逐个实例销毁不能随意销毁其余实例仍在使用的共享资源。材质实例的立即资源释放用真实 pass/resource 状态判断，而非强行改写对象有效标志；原生延迟销毁继续等待既有 update→draw 边界。生命周期复用 [`examples/shared/asset-lifecycle.js`](../../examples/shared/asset-lifecycle.js)，不建立另一套释放协议。

固定资产位于 [`assets/`](../../examples/material-inspection-showroom/assets/manifest.json)：`inspection-rig.gltf`、`crystal.gltf` 与 `checker.png`。[`manifest.json`](../../examples/material-inspection-showroom/assets/manifest.json) 记录逐文件 SHA-256 和字节数；[`LICENSE.txt`](../../examples/material-inspection-showroom/assets/LICENSE.txt) 记录项目自有程序化来源和 MIT 许可。七个专题复用这些资产，不复制文件或依赖外部模型 URL；各自的 `asset-loaded` 期望仍列出全部三个真实请求路径。

本场景的应用持有资源清单不等同于驱动物理显存。GPU 总量不可测时必须记录不可测；不能将估算的纹理字节数、对象个数或调用 `destroy()` 次数命名为实测显存。

## 请求与材质参数

- `request.priority` 是浏览器调度提示。`httpCache` 控制 HTTP 缓存，不会自动关闭所有引擎内存/解析缓存。配置化或可取消 loader 的隔离、同源 header 边界及注入 decoder 所有权以 [请求策略合同](../gltf/request-policy.md) 为准。示例不使用真实凭据或秘密 header。
- 取消后的重试使用新的 `AbortController`/请求代际；第三方不可取消解码仍可在后台结束，丢弃晚到结果不等于物理终止 worker/GPU。
- glTF `iridescenceIor` 的规范下限为 1.0，没有本轮人为添加的上限；不得因 UI 的便捷范围或 GPU 未验证范围声称规范上限。膜厚使用 nm，缺失 thickness texture 时使用 maximum。没有标准 `iridescenceIorTexture`。
- 原生 `airIridescence` 顺序为 factor、IOR、minimum nm、maximum nm。颜色是线性值；每个纹理槽的 UV 仿射行独立，旋转使用 radians。参数关系及非法值按 [材质参数合同](../gltf/material-parameter-contract.md) 验证。
- uniform 调整不自动启用纹理宏、物理 effect 或透明混合状态。共享模板和实例修改不同；普通 alpha blending 本来依赖绘制顺序，不能要求任意层序获得相同画面。
- `inspectAirMaterial` / `inspectAirMeshMaterial` 是只读诊断，不负责编译、预热或渲染，也不能充当首帧证明。

## 独立实验入口

以下实验须由用户明确打开，保持默认 WebGL2 展台不变。在提供完整仓库路径及工具转换的 fixture 服务中访问；Gallery 的受控 example workspace 仅复制 examples/ 与 recipes/，不保证这些仓库外部链接在独立 Gallery 部署内可用。遇到 404 应使用相应 fixture 工作流，不把研究工具复制进默认启动依赖来隐藏问题。

- [首帧 readiness fixture](../../test/fixtures/upstream-readiness/index.html)：区分 engine、resources、pass、submission 与 compositor 证据；冷启动、延迟资源、故障和离屏 case 的正式执行见 [就绪说明](upstream-first-frame-readiness.md)。显示场景和 GPU readback 都不是浏览器呈现证明。
- [孤立 depth 诊断](../../test/fixtures/upstream-depth-experiments/index.html)：显式选择 normal/reverse 与实际可分配格式，点击 Run isolated diagnostic，再保存原始报告。它是独立 WebGL2 数学/像素实验，不切换引擎默认投影。
- [state-isolation fixture](../../test/fixtures/upstream-state-isolation/index.html)：独立原生材质/普通目标/透射状态检查，保留参考、顺序、绑定和资源观察；说明见 [状态隔离合同](upstream-state-isolation.md)。交换展台相机 priority 不会自动完成这套验收。
- [native depth-texture fixture](../../test/fixtures/upstream-experiments-transparency/index.html)：继续使用引擎 normal-Z、D24S8 和现有 `AirRenderTarget` 深度采样路径。详情见 [深度与透明适用性](upstream-depth-experiments.md)；不是 OIT 或原生 Reverse-Z 交付。
- [Probe / SH fixture](../../test/fixtures/upstream-probe-capture/upstream-probe-capture.html)：点击 Run reference capture，比较合成环境的串行/atlas 捕获与独立 SH 参考，再保存报告。详情见 [Probe / SH 研究](upstream-probe-sh-research.md)。真实 Cocos 场景遍历、生产捕获方向校准、GPU 时间和物理显存仍是独立要求。

实验选择失败或后端/格式不支持时应保留错误，不能静默换成默认模式并宣称实验成功。软件适配器不证明真实移动 GPU 的表现。

## 元数据、证据和仍待完成的验收

八个 `example.json` 的 API 名称必须逐字存在于 `docs/example-api-inventory.json`；`api.evidence` 绑定真实共享源码及首个可执行使用行。该绑定只证明静态可追溯性，不提供 API 执行次数或效果证明。控制专属 API 在正式采集中仍需要真实操作、独立状态/画面/资源断言及负控，不得用 harness 直接调用来填充覆盖。

只在专用输出目录执行静态规格校验：

```sh
node tools/examples/spec-validate.cjs --out=output/upstream-update/m3-gallery/spec-validation.json
```

这是所有示例的规格检查，不是浏览器执行。保持 `draft` 意味着严格冻结检查应拒绝新增候选；不能将其改为 `frozen` 来获取绿色结果。重新运行保留旧报告，使用新的文件名。

本次已核对固定 main tree 的原始 Git blob：既有 `batching-dynamic`、`batching-merged`、`batching-shared` 存在七处 `shared/batching-routes.ts` API 锚点漂移；旧 manifest 与原 `example.json` 另有 184 个 promotion 字段和三个 status 差异。它们记为 **BASELINE_DOCUMENT_DRIFT**，不是本轮已修复或可忽略的全门禁 PASS。原文件身份核对、完整失败报告与新八例的隔离规格结果分别保留。

仅在新增八份规格的静态结构校验通过后，将原版 generator 在临时目录生成的八个 draft 条目增量并入 manifest。保留原 188 个对象及其 status/promotion，不借目录更新改写历史证据；Gallery 数量增为 196 个，原五个 DevTools 示例的边界不变。计数增长不是覆盖增长，完整规格门禁仍保留上述既有失败。

候选浏览器采集器 [`tools/verify/upstream-showroom.cjs`](../../tools/verify/upstream-showroom.cjs) 通过显式 --browser=chromium|firefox|webkit 选择浏览器，面向共享展台准备了 desktop DPR1/DPR2 与 mobile-viewport DPR2 的真实交互、uniform/截图、实例操作、容器缩放、依赖取消和生命周期观察。它不等于八个入口的全 campaign，不把 mobile viewport 当成真实移动 GPU；当前环境尚未得到该采集器的真实浏览器结果。启用前仍须审核当前源码、全体指纹、场景状态、采集和关闭边界，使用新的输出目录并保留失败。

完整 U09 仍需要：

1. 当前候选、依赖、SDK、示例及工具指纹闭合，并证明实际服务字节与源码一致。完成并真实执行面向这些控件的专用 collector：通用 frame-diff/按钮点击检查不足以证明逐实例状态、参数效果、提交顺序或 30 轮资源趋势。
2. 真实桌面与移动 viewport 的 pointer、DPR/容器变化、选中位置和可见效果；空白截图、handler 计数或桌面模拟不能替代移动设备结论。
3. 请求阶段的服务端观察、取消后无晚到挂载、成功重试及受控 HTTP 缓存证据。
4. 材质动态更新与最终状态重建、非法输入、真实 shader/pixel 输出；两个普通目标的 A→B→A 参考、相机/背景/尺寸隔离和单 capture 状态恢复。
5. 三个骨骼实例的独立姿态、Morph、移动、bounds 可视化与真实裁剪；这与 [已有 CPU oracle](upstream-skinning-lifecycle.md) 是不同证据层。
6. 30 次完整加载/切换/释放的逐轮资源与监听器记录，固定测量边界、趋势判断、失败留存及可靠 physical-close 证明。
7. 独立首帧及实验报告达到各自冻结合同；不能因为展台可以启动就消除 U07/U08 的 BLOCKED。

完整证据发布遵循 [固定快照 campaign](example-evidence-campaign.md)，不改写 canonical PASS、不复用旧候选结果、不缩小 manifest/模式范围，也不通过批量提升 stable 代替实测。本页不变更 acceptance ledger、CI、runtime 或已有 promotion。

Firefox 的移动 viewport 配置不设置 Playwright 不支持的 isMobile 标记，仍使用相同 CSS 尺寸、DPR 与触摸输入。三种浏览器的桌面/viewport 结果始终不能替代 Android 真机。
