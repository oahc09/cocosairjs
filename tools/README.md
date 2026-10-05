# Cocos AIR 工具

从仓库根目录执行工具。日常入口优先使用 [package.json](../package.json) 的 npm scripts；前置条件、产物和写入行为见 [AGENTS.md](../AGENTS.md#development-workflow)。

## 按任务找工具

| 目录                          | 用途                                       | 入口与写入范围                                                                                                                  |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `build/`                      | 引擎、声明构建与依赖 vendoring             | `build.cjs`、`build-dts.cjs`；写 `build/`。vendoring 工具写 `src/node_modules/` 及登记数据。                                    |
| `dev/`                        | 开发服务与模块解析                         | `dev-server.cjs`；源码变化时重建开发 bundle，示例编译到内存。                                                                   |
| `analyze/`                    | 依赖分析、上游分组导入与源码抽取           | `dep-graph.cjs`、`import-upstream-group.cjs`、`extract-upstream.cjs`；会写清单或源码。抽取不是日常构建，裸跑可能覆盖 AIR 修改。 |
| `baseline/`                   | 上游 Web 引擎基线构建                      | `build-baseline.cjs`；在上游工作目录写 `bin/dev/cc-baseline/`。                                                                 |
| `compare/`                    | 上游与 AIR 基线比较                        | `baseline-compare.cjs`；比较前先准备对应构建与分析输入。                                                                        |
| `examples/`                   | Gallery 清单、API 清单、示例规格与覆盖维护 | `generate-manifest.cjs`、`api-inventory.cjs`、`spec-*.cjs`；可能写示例规格和 docs 清单。                                        |
| `examples/generation/`        | 按选题生成覆盖示例                         | `generate-examples.cjs` 与三份 `topics-*.cjs`；写 `examples/`，不自动构成验收证据。                                             |
| `examples/coverage-bindings/` | 把已执行 API 的源码位置绑定到示例规格      | `bind-*.cjs`；会维护指定示例的 `example.json`，不执行浏览器、不替代证据采集。                                                   |
| `fixtures/`                   | 可重建测试和示例资产                       | 几何、glTF viewer、音频、视频、DragonBones 生成器；写各自目标资产目录。                                                         |
| `debug/`                      | 独立开发工具与诊断页面                     | `agent-session.ts`、`panel.ts`、`probes/`；探针不登记到 Gallery。                                                               |
| `benchmark/`                  | Benchmark / Recipe 目录、运行器与验证器    | 固定编号夹具、冻结参考源码和 TypeScript 合同属于测试输入，不作为临时内容清理。                                                  |
| `verify/`                     | 静态门禁、浏览器验证与消费验证             | 名称不保证只读；浏览器运行器通常会写证据，运行前查看文件头及 npm 命令说明。                                                     |

## 常用直接入口

PAL 的运行时来源固定在 `vendor/pal-source/` 的公开 MIT 快照；
`node tools/build/pal-source.cjs --check` 校验冻结来源及全部生成输出，
`--write` 才会重建 JS、声明和版权 notice。该工具不读取旧 engine-pal npm 包，不下载源码。

| 任务                    | 入口                                                                                              | 产物或副作用                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 生成公开 API 清单       | `npm run gallery:api`                                                                             | 唯一正式生成器为 `examples/api-inventory.cjs --write`；写 `docs/example-api-inventory.json`。试验用 `--out=PATH`。                                                         |
| 按示例回填规格行号      | `node tools/examples/spec-fixlines.cjs --ids=hello-cube --check`                                  | `--check` 仅检查；省略时原地维护指定示例的 `example.json`。                                                                                                                |
| 试跑页面行为探针        | `node tools/verify/trial-probes.cjs --root=tools/debug/probes --ids=lights-hdr-calibration`       | 需要 Playwright 与开发 bundle；结果写系统临时目录，不改正典证据。                                                                                                          |
| Shader 探针             | `node tools/verify/shader-probe.cjs`                                                              | 需要 Playwright 与 bundle；会写 Shader 证据。                                                                                                                              |
| 示例规格浏览器验证      | `node tools/verify/example-spec-browser.cjs`                                                      | 会采集运行证据并按规格处理示例晋级。                                                                                                                                       |
| DevTools 示例验证       | `node tools/verify/devtools-examples.cjs`                                                         | 会写独立 DevTools 示例证据。                                                                                                                                               |
| 静态 Gallery 构建与验证 | `node tools/verify/gallery-artifact.cjs build`                                                    | `build` 写 `build/examples/`；验证子命令见脚本文件头。                                                                                                                     |
| 手册源码一致性          | `node tools/verify/manual-doc-consistency.cjs --strict`                                           | 只读核对手册代码块与示例源码。                                                                                                                                             |
| 文档路径引用            | `npm run verify:doc-refs`                                                                         | 默认只读；使用显式输出参数才写报告。                                                                                                                                       |
| JS/TS 原生签名误用      | `node tools/verify/air-signature-usage.cjs --types <file.ts                                       | file.js> ...`                                                                                                                                                              | 只读指定文件；输出真实类型诊断及Scene组件、addChild返回值、geometry/Mesh误用。自测：`node tools/verify/air-signature-usage.test.cjs`。 |
| 原生输入与场景检查合同  | `node tools/verify/air-input-browser.cjs --browser=all --out=output/playwright/<new-report>.json` | 使用只读临时服务和当前bundle，覆盖默认/自定义canvas、focus/editable/纯输入节点/鼠标转触摸/inspector。报告路径必须未存在；协议touch不等于实体设备。需可解析Playwright。     |
| 原生诊断通道            | `node tools/verify/air-diagnostics-browser.cjs --out=output/playwright/<new-report>.json`         | 三浏览器检查errors/warnings、原生Material警告与独立debug session；只读临时服务，写新报告和截图，不重建bundle。                                                             |
| 蒙皮首帧与变换          | `node tools/verify/air-skinning-browser.cjs --out=output/playwright/<new-report>.json`            | 三浏览器实时/烘焙模式、暂停dt=0首帧、非对称网格SMR/root/ancestor缩放和bounds/像素。需当前bundle、可解析Playwright及匹配浏览器。写新报告/截图，完整范围及未测项由报告列明。 |

## 程序化场景与独立验收工具

纹理行序与UV对照：`node tools/verify/air-texture-uv-basis.cjs --out=output/playwright/<new-report>.json` 使用当前bundle和三浏览器，对照同一Canvas、原始顶优先字节及共享copyCanvasRows在原生Sprite与旋转+90X的plane上的真实像素，并复用原DOM纹理检查上传间状态污染。写指定新JSON及同名`-artifacts/`截图，不重建bundle，不代表所有glTF/纹理源已验。

Effect布局与双贴图：`node tools/verify/air-effect-layout-browser.cjs --out=output/playwright/<new-report>.json` 将声明表在内存中生成effect，显式接入`tools/debug/effect-layout.ts`只读预检，在三浏览器验证两贴图/UBO、MR/SMR注册、宏与负Shader诊断。自动关闭自有只读临时server/browser，写指定新JSON与同名`-artifacts/`截图，不改默认bundle或正式矩阵；可选工具不进默认运行时，范围见自定义Shader手册。

场景切换合同：`node tools/verify/air-scene-switch-browser.cjs --out=output/playwright/<new-report>.json` 三浏览器检查直接替换/显式释放、各100次真实GPU绘制及资产/持久节点/业务监听/timer、SceneStack返回/LRU、真实reload和缺少bundle场景负例。写指定新JSON，自动关闭自有server/browser，不改bundle；记录启动阶段时间和GPU量不可用，不代替10分钟稳定性或外部SceneAsset部署验收。

蒙皮边界：`node tools/verify/air-skinning-capacity-browser.cjs --out=<new.json> [--bundle=<仓库内module.js>]` 检查三浏览器实际设备uniform/256槽纹理容量、合法局部palette与越界诊断。`air-skinning-transforms-browser.cjs`同样接受显式bundle，检查TRS/逆绑定刚性GPU参考、根/祖先反射法线光照、96个激活前后赋值组合、原生clip与公开模式往返及活动传输重绑定。二者自动关闭自有server/browser，写指定新报告；后者另写同名`-artifacts/`截图，不build、不覆盖旧报告、不冒称所有骨混合/设备或最终包通过。`tools/debug/skinning-inspector.ts`是显式只读开发工具，默认runtime不导出。

可见性诊断：`node tools/verify/air-render-visibility-browser.cjs --out=<new.json> [--bundle=<仓库内module.js>]` 检查三浏览器8种层掩码/model标签/视锥/启用状态的真实像素，以及AgentSession重复观察不改变资源引用。写指定新JSON和同名`-artifacts/`截图，自动关闭自有server/browser，不build。`tools/debug/render-visibility.ts`仅读当前原生缓存，最多80个相机，缺数据如实返回未知；过滤通过不保证draw、LOD、shader或GPU量，正常剔除不作为错误。

生命周期稳定性：`air-lifecycle-stability-browser.cjs --out=<new.json> [--bundle=<仓库内module.js>]` 并发运行三个浏览器，各做未run/暂停/真实context lost/恢复失败/5秒cleanup超时负例，再进行600000ms实际运行与期间场景释放。`--context-only`跳过长跑，`--duration-ms=2000`只验证工具流程，不能称十分钟通过。记录真实帧/update/draw、引用、回执、可用的JS heap和不可用GPU量；不作为独立性能benchmark，不build。

组合输入：`air-mixed-input-browser.cjs --out=<new.json> [--bundle=<仓库内module.js>]` 覆盖两后端/两canvas的可信键鼠、合成多指取消、100次repeat/restart和editable/HUD；实际hidden与合成hidden分开，未发生后台状态时记NOT_RUN。`--installed`额外实际打包/离线安装并从安装包分块加载，退出清理自有临时目录；该模式会执行prepack刷新build/npm。glTF取消：`air-gltf-cancellation-browser.cjs`接受bundle/out参数，使用真实延迟HTTP验证子请求abort、独立peer及顶层容器未取消。两者写指定新JSON并关闭自有server/browser，不build、不覆写旧报告。

`port-gap-browser-evidence.cjs --input=<原始.json> --log=<原始.log> --gate=EG3 --type=BROWSER_RENDER_PASS --exit-code=0 --out=<新.json>` 只读取已执行浏览器报告与当前指纹，按PG-34 schema规范化限定范围。原始时间/命令/计数/FAIL/NOT_RUN及合成输入边界保留，漂移或退出码冲突拒绝；仅写显式新报告，不启动浏览器、补跑或将子集标为完整gate。完整gate与子集状态见[报告索引](../docs/evidence/port-gap/README.md)。

以下入口不新增引擎依赖。浏览器工具需要现有 bundle、可解析的 Playwright 及匹配浏览器；
`neon-night-city.cjs` 另需能转译示例TS的HTTP服务。它们不会代为build、pack或安装浏览器。

| 任务                     | 入口                                                                                                                                                                                                            | 产物与写入行为                                                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 从GLSL与声明表生成effect | [build/effect-json.mjs](build/effect-json.mjs)：`node tools/build/effect-json.mjs examples/point-cloud-basics/point.effect-spec.json output/playwright/point.generated.effect.json`                             | 校验通过后写显式指定JSON，不改默认bundle。支持子集与UBO限制见 [自定义Shader手册](../docs/manual/custom-shaders.md#7-从声明表生成-effect-json)。生成JSON不等于GPU编译通过。                                              |
| 夜城满规模独立验收       | [verify/neon-night-city.cjs](verify/neon-night-city.cjs)：`node tools/verify/neon-night-city.cjs --url=http://127.0.0.1:7473/examples/neon-night-city/ --out=output/playwright/neon-night-city-acceptance.json` | 读取现有页面，验证真实计数、像素、车/雨归因、雾、reset和释放；写指定JSON及同名PNG。可用NODE_PATH或`--playwright-module`提供现有模块。                                                                                   |
| 本地服务器代理负控       | [verify/loopback-browser-regression.cjs](verify/loopback-browser-regression.cjs)：`node tools/verify/loopback-browser-regression.cjs`                                                                           | 临时启动本地HTML服务器，在浏览器子进程中模拟失效代理并检查回环绕过；写 `output/playwright/loopback-browser-regression.json`。不改变系统代理，不打印凭据，不忽略网络错误。                                               |
| 矩阵数值区间断言         | [verify/probe-ranges.cjs](verify/probe-ranges.cjs)                                                                                                                                                              | 无独立CLI；验证器组件。只接受有限number及inclusive min/max，缺值和非有限值失败，不写文件。                                                                                                                              |
| 本地回环浏览器环境       | [verify/loopback-browser-env.cjs](verify/loopback-browser-env.cjs)                                                                                                                                              | 无独立CLI；保留现有代理和绕过目标，给浏览器进程补NO_PROXY/no_proxy的回环地址，不改变主进程或系统设置。                                                                                                                  |
| 示例本地模块闭包         | [examples/local-source-closure.cjs](examples/local-source-closure.cjs)                                                                                                                                          | 无独立CLI；规格审计组件。AST读取examples范围内的真实本地导入并解析JS→TS回退，循环去重；生命周期安装检查不把注释、字符串或空声明当调用。                                                                                 |
| 三路线Recipe当前候选重采 | [benchmark/recipes/run-competitive-batching.cjs](benchmark/recipes/run-competitive-batching.cjs)：`node tools/benchmark/recipes/run-competitive-batching.cjs`                                                   | 读取当前bundle/声明与3例，自带只读TS HTTP服务；实际运行8个规模/instancing条件、每组120帧原始采样、像素和释放重建。写 `docs/evidence/recipes/competitive-batching/browser.json` 与8张PNG，不重建SDK。                    |
| 三路线Recipe显式门禁     | `node tools/verify/recipe-review-gate.cjs --scope=competitive-batching`                                                                                                                                         | 校验完整输入/截图SHA、scope、3定义8用例、material/pass/geometry条件、像素、draw、样本与lifecycle；写本scope的 `review-gate.json`。默认`legacy30`仍保留原历史Golden/Catalog/30Recipe门禁，不把本scope PASS当旧全集PASS。 |

独立报告的作用域应按实际运行的示例、视口和候选指纹解释。
CPU提交与rAF观测不能替代GPU耗时或显示present；发布验证仍使用正式规格、矩阵与包消费门禁。

## 命名与历史合同

`tools/debug/render-queue.ts` 是显式导入的开发观察器：`attachAirRenderQueueObserver(director.root, callback)` 在原生相机结束时复制 legacy 已排序队列的实际顺序、节点和 pass 信息；不重算排序。custom pipeline 或私有字段缺失返回 `unavailable`，不覆盖 instancing、UI 或队列外辅助绘制。它不进入默认 SDK，完整调用见[渲染合同](../docs/manual/rendering-contracts.md#查看原生实际排序队列)。

`node tools/verify/rendering-contracts.cjs --out=<new.json> --browser=all`串行检查真实RGBA8/RGBA16F附件、1×/4×MSAA、resolve、浮点读回、深度重建、resize重绑与销毁；自启只读服务,不build、不安装浏览器,拒绝覆盖输出。环境需已配置Playwright/pngjs,报告和截图写到显式路径。GPU计时缺失或disjoint记录null,不转换为呈现FPS。前提与能力边界见[渲染目标合同](../docs/manual/rendering-contracts.md)。

CB21 成本复测使用 [benchmark/prepare-cost-retest.mjs](benchmark/prepare-cost-retest.mjs) 创建新的隔离批次；默认 dry-run，`--execute` 才写入不存在的新目录。候选包、知识、规范、模型配置和预算计数脚本均有独立指纹，不覆盖旧 benchmark。

浏览器矩阵合同可用`probePath`指定示例已有的只读探针,如`__bench.getState`或`__characterProbe`;默认仍为`__probe`。显式路径不存在或不是函数即失败,不会换用别的探针。报告记录合同、运行器和读取函数指纹。该矩阵不替代各例完整交互/插值/生命周期探针。

`node tools/verify/competitive-package-fox.cjs --package-root=<实际安装包目录> --tarball=<冻结tgz> --out=<新报告路径>`启动自己的只读示例服务,串行检查三浏览器中的Fox、原生材质控制与方向ShadowMap,并对照工作区/包/min像素。它不会build或安装包;显式输出报告、截图与来源SHA。当前材质纹理属性为`mainTexture`,shader sampler为`albedoMap`,启用宏为`USE_ALBEDO_MAP`,不要混用。

[benchmark/validate-cost-arm.mjs](benchmark/validate-cost-arm.mjs) 的 `--prepare-instrument` 冻结公开验证器与真实 GPU 浏览器配置；`--check-inputs` 只读检查，正式执行才写该臂的 `independent-validation/`，含规范要求的视频证据。验证器构建与 Agent 构建分别计数，已有结果不覆盖。前置条件与范围见 [成本复测合同](../docs/reference/cost-retest-contract.md)。

工具文件按用途命名，不再用实施阶段作为活跃入口名。例如 `example-spec-browser.cjs`、`dev-tooling.cjs`、`context-loss.cjs`。npm script 名称保持稳定。

`node tools/verify/air-audio-service-browser.cjs --out=<新.json>` 使用已有 tone.wav 与真实鼠标手势，观察 BGM 播放、暂停、续播、停止归零、换曲音量及非法音量。写指定新报告；原生与 DOM audio 后端均以 currentTime 作为判据，不把 playing 标志当作声音或时钟证明。

`node tools/verify/air-tiled-objects-browser.cjs --out=<新.json>` 对照真实 TMX 的原始/换算坐标、class/形状查询和冻结的点，并在三个浏览器复跑 tiledmap-basic 既有 P1–P8 合同。写指定新报告及相邻截图，使用当前 bundle 和可解析 Playwright，不改正式 browser-matrix 报告或截图。

`node tools/verify/air-bmfont-browser.cjs --out=<新.json>` 检查真实单页字体/PNG经原生加载和assembler渲染、双字符偶距、三种字号的非对称颜色字形像素与拥有句柄释放。写新报告和相邻截图，不把原生测试、页面计数或Label宽度当作像素验证。

`node tools/verify/air-ui-mesh-browser.cjs --out=<新.json>` 在三浏览器检查AirUIMesh与Sprite混排、原生Mask、透明度、几何更新/重启用和共享资产释放；写新报告及相邻截图。`node tools/verify/air-billboard-browser.cjs --out=<新.json>` 检查原生Billboard的相机移动、旋转及独占Mesh/Material释放。两者使用当前bundle，不改正式browser-matrix文件，也不代替最终候选或完整发布门禁。

`node tools/verify/air-design-viewport-browser.cjs --out=<新.json>` 用978×846设计矩形检查三浏览器、三档DPR、三种窗口比例的四角像素、原生投影/命中与真实点击，包含首帧及resize。`node tools/verify/air-control-basis-browser.cjs --out=<新.json>` 检查world/vehicle/screen-relative地面控制在三种相机角度下的原生投影和3D标记像素。两者写指定新报告及相邻截图，保持subset/completed披露，不使用外部端口运行结果。

`basic-examples-browser.cjs`、`bundle-variants-*.cjs/js`、`benchmark-browser-matrix.cjs` 等保留原有专项验证范围和前置服务要求；它们不替代当前 `browser-matrix.cjs` 或发布门禁。阶段编号仍可出现在合同、日志和证据文件名中，用来识别历史口径。

一次性 `patch-wave-*` 字符串补丁已移除，修订直接落在生成器选题源文件中；历史实现可由 Git 追溯。工具移动后，已有证据不会自动重采，发布就绪状态仍需对应当前候选的验证。

目录与命名规则见 [仓库组织约定](../docs/reference/repository-layout.md)，计划与台账见 [ai 索引](../ai/README.md)。

`node tools/verify/air-action-input-browser.cjs --out=<新.json>` 采集三浏览器×native/dom×默认/自定义canvas的生产动作reducer与适配器检查，覆盖键盘多源/边沿/编辑控件、HUD所有权、鼠标离开canvas、可信touch tap与session释放。写指定新报告；不等价物理设备多指、OS窗口离开或完整发布验证。

`node tools/verify/air-bootstrap-browser.cjs --out=<新.json>` 检查三浏览器中的 unmin/min/npm-copy 安全入口、首次启动、DPR resize、初始化失败和暂停释放，写指定报告及相邻截图。`npm run verify:consumer -- --bootstrap-browser --browser-out=<新.json>` 另行打包并安装到临时消费者，再用 esbuild 生成分块，检查实际安装包的三浏览器启动/像素/释放；默认 consumer 命令只执行 Node、类型及 bundler 解析检查。浏览器模式需要可解析的 Playwright 与匹配二进制。这些限定探针不替代完整发布或长时间生命周期证据。

- `node tools/verify/air-asset-bank-browser.cjs --out=<new.json>`：三浏览器真实HTTP无后缀JSON/PNG、显式ext分派、共享/取消/迟到释放和404/CORS/CSP。自动启动并关闭只读夹具及资源server；写显式新报告，保留实际请求、预期错误和指纹，不重建/安装引擎；`subset=true / completed=false`，不等于全部PG-32能力验收。

- `node tools/verify/air-test-input-browser.cjs --out=<new.json>`：三浏览器显式工具合成输入经真实PAL/UI/global链，部分UI吞噬、多指取消、单步更新与配对dispose；另采可信协议键盘/tap对照。工具位于 `tools/debug/test-input.ts`，不进默认运行时，不开第二时钟。自动关闭临时server/browser，写新报告；合成结果不证明实体设备或完整PG-10/28。

- `node tools/verify/air-atlas-browser-review.cjs --out=<new.json>`：三浏览器当前公共Atlas的旧/新格式、旋转/修剪/多页索引帧像素与所有权；`--installed`先本地打包、离线临时安装并esbuild分块，使用实际包验证同一合同，禁止以工作区/build替代。自动回收自有临时消费者/server/browser；写新报告及截图，记录tarball/chunk SHA，GPU分配量仍为unavailable，不替代全部PG或发布门禁。

- `node tools/verify/air-gltf-texture-direction-browser.cjs --out=<new.json>`：三浏览器通过公开GLTFLoader解析外部PNG与嵌入image bufferView，实际绘制四角图样、核对nearest/clamp sampler、交错上传后原纹理及非法sampler拒绝与释放。临时HTTP夹具和浏览器自动关闭；写显式新JSON及相邻截图，记录完整输入指纹和实际版本。不会构建或安装运行时；不认证所有UV、sampler、颜色空间或压缩纹理，GPU分配量不可测。

- `node tools/verify/air-texture-source-review.cjs --out=<new.json>`：当前产物三浏览器图片/Canvas/ImageBitmap、顶/底优先字节、helper、IMemoryImageSource在Sprite与+90X原生plane的七输入/20绘制观察，独立拒绝缺失/重复场景，核对上传前后原纹理/帧身份及实际释放。ImageData不强转上传、不计GPU执行。临时server/browser自动关闭；写显式新报告/相邻截图，不覆盖历史texture-orientation截图，不重建SDK或安装依赖。颜色空间/压缩纹理/实体设备与GPU分配量不认证。

`node tools/verify/air-platformer-browser.cjs --browser=all --out=<new.json>`：实际TMX/TSX/PNG与Box2D平台配方，独立检查完整物理/像素/键盘/暂停/restart/退役清理及资产引用。速度按公开PTM转换，摩擦读取真实接触；不以fixture自报verdict或空数组判绿。写指定新报告及相邻`-artifacts/`截图/日志，退出关闭自有server/browser；不build、安装或覆盖历史输出，不认证原作1:1或GPU完整分配量。

`node tools/verify/air-port-recipes-browser.cjs --browser=all --out=<new.json> [--installed]`：六类组合配方的逐阶段原生输入/像素/坐标/音频时钟/引用与终态守卫检查。仓库与安装路径编译同一份公开手册 main.ts 和 optional-recipe.ts；installed 模式本地打包、离线临时安装，实际 TS4.9 检查包内源码，拒绝仓库 /build 请求。可选资产按实际包字节通过独立真实 HTTP 服务交付，未知资产返回真实 404，不回退工作区资源。写新报告及相邻截图/log，记录 tarball/两份源码/资产/chunk/15 份输入 SHA。prepack 刷新既有 npm 副本，不 build/发布；结束后关闭两个 server/browser 并清理自有临时消费者。指针锁或音频时钟未达为 NOT_RUN/整体非零退出，仍是 PG33 子集。air-optional-recipe-browser.cjs 是此共同六类入口的兼容转发，报告范围相同。

`node tools/verify/port-gap-browser-evidence.cjs --input=<raw.json> --log=<raw.log> --gate=EG3 --type=BROWSER_RENDER_PASS --exit-code=<observed> --out=<new.json>`：只读核对已执行原始报告及当前指纹，并以新文件写PG34规范化结果，不启动浏览器。六配方保留浏览器/配方行、截图和具体未达原因；仅未达范围的非零退出保持NOT_RUN，不伪造FAIL或完整PASS。`node tools/verify/port-gap-browser-evidence.test.cjs`用已有实际记录的内存副本做合同回归，仅写并清理自有系统临时目录，不采浏览器证据。
