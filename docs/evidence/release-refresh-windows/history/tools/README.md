# Cocos AIR 工具

## 可选的参考源码审计

`node tools/ci/prepare-shader-reference.cjs` 要求 `output/shaders-absorption/reference/` 已检出 Shader Effects 的固定提交 `dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a` 并包含原始许可证，MaterialX 固定提交 `7b64921ef1d42f2d57871e9d2c43dc11f041f26b` 位于相邻 `materialx-source/`。它从真实上游文件生成既有采集器所需的三个源码副本及确定性哈希收据，并按已登记 SHA/bytes 复制 MaterialX 噪声和许可证到 `reference/ancestors/`；已有内容不同则拒绝覆盖。它不下载、不执行参考源码，也不生成浏览器 PASS。需要该参考审计时，先检出这些固定提交再调用；默认 PR 的构建和核心冒烟不依赖它们。Holographic 的轮廓更正依据使用已入库的专题文档，不依赖某个 worker 的临时笔记。

Code quality 保留构建、类型、格式和核心回归，并使用固定 Playwright Chromium 工具版本运行 Driver、glass-refraction、gltf-viewer、input、Spark 五例。它只生成部分冒烟原件，不检查旧正典作为前置，也不执行全量采集或发布。完整 182 示例通过 `example-evidence.yml` 手动运行；三浏览器矩阵按阶段需要显式执行。`pngjs` 是这些 Node/PNG 合同测试的开发依赖，不进入运行时 bundle。

示例采证使用 [`run-example-evidence-campaign.cjs`](verify/run-example-evidence-campaign.cjs) 的单例有界入口，并遵循[固定快照采证与严格发布流程](../docs/reference/example-evidence-campaign.md)。内部 worker `tools/verify/example-spec-browser.cjs` 的隔离工作区支持 DOM iterable 类型、应用主入口包装和 `.js` 指向 TypeScript 源文件；完整复制跨示例、嵌套模块、参数、recipe 和资产依赖，保留原目录布局，不重写导入或资源路径。规格可用 `bench.startupButtonText` 声明实际启动按钮、`bench.viewport` 声明视口；`bench.apiVariants` 的 `query`、`nodes`、`steps` 声明额外模式，`steps[].drag` 为两个归一化画布坐标。每个模式独立运行全部非 API 检查并保留原始证据，只有真实执行的 API 才能汇总为已执行，截图按模式分别保存。调试入口可从真实 `createAirApp()` 返回值获取；跟踪保留其 Promise 与延迟启动行为。内部 worker 只接受受监督的单 ID，始终输出 partial，不晋级规格。只有完整固定范围的所有模式、原件指纹与真实关闭收据通过严格合并后，才能由专用 publisher 刷新既有 stable 的 promotion；状态保持不变。

`node tools/verify/input-camera-examples.cjs --out=<new.json>`：只读运行现有 SDK，以三浏览器 × DPR 1/2/3 检查相机投影/深度往返、DOM 射线拾取、正交横竖屏完整取景、HTML 标签偏移缩放和输入失焦清理。要求外部 Playwright 与已有浏览器；拒绝覆盖报告，写显式 JSON 及相邻 `-artifacts/` 页面截图，不构建或重采历史矩阵。resize 先由原生 pacer 处理，断言时暂停并单步，避免双时钟；像素合成/present 不是本工具的通过结论。

`node tools/verify/engine-contract-browser.cjs --out=<new.json>`：要求当前开发 bundle 与可用 Playwright 浏览器，以原生 PNG/读回验证 ENG-01–09 的实际更新、颜色、剔除、雾与诊断。只写显式新 JSON 和相邻截图，拒绝覆盖；--browser=<engine> 为子集。不构建、下载、发布；不证明页面合成或显示器 present。详见[合同手册](../docs/manual/engine-contract-hardening.md)。

## 响应式宿主与棋盘配方

- `tools/build/screen-layout-patch.cjs`：PAL 生成器内部补丁，保留冻结上游；由 `node tools/build/pal-source.cjs --write` 生成，`--check` 只读核验，不直接执行补丁文件。
- `tools/recipes/board-state.ts`：可选的局部格子拾取、确定随机/合法滑动打乱、视觉缓存配方；显式导入，不进默认 SDK，不安装监听或修改时钟。
- `node tools/verify/responsive-host-browser.cjs --out=<new.json>`：要求当前开发 bundle、Playwright 与缓存浏览器；三浏览器真实 resize/点击/截图，并运行固定原版负例。写新 JSON 及相邻截图，拒绝覆盖；`--browser=<engine>` 为子集，不构建、下载、发布。
  `--capture=canvas` 显式选择原生 framebuffer PNG，并同时保留页面截图对照；默认 page 通道的失败不因此改成成功。报告记录实际浏览器版本、路径与 Playwright 版本。
- `node tools/verify/integration-attempts.cjs <attempts.json>`：只读核对 provenance、指纹和 UNKNOWN/null，分别聚合共享集成、应用、浏览器验收及协调；不回写历史，不推断缺失成本或首次成功。

使用合同见[响应式配方手册](../docs/manual/responsive-board-recipes.md)。外部 50 游戏工程缺失时，本仓结果不冒称其全量重采。

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

| 任务                    | 入口                                                                                                                                      | 产物或副作用                                                                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 生成公开 API 清单       | `npm run gallery:api`                                                                                                                     | 唯一正式生成器为 `examples/api-inventory.cjs --write`；写 `docs/example-api-inventory.json`。试验用 `--out=PATH`。                                                                               |
| 按示例回填规格行号      | `node tools/examples/spec-fixlines.cjs --ids=hello-cube --check`                                                                          | `--check` 仅检查；省略时原地维护指定示例的 `example.json`。                                                                                                                                      |
| 试跑页面行为探针        | `node tools/verify/trial-probes.cjs --root=tools/debug/probes --ids=lights-hdr-calibration`                                               | 需要 Playwright 与开发 bundle；结果写系统临时目录，不改正典证据。                                                                                                                                |
| Shader 探针             | `node tools/verify/shader-probe.cjs`                                                                                                      | 需要 Playwright 与 bundle；会写 Shader 证据。                                                                                                                                                    |
| 示例规格浏览器验证      | `node tools/verify/run-example-evidence-campaign.cjs --freeze=<freeze.json> --id=<id> --out=<new-attempt-directory> --execute-authorized` | 前先执行 CPU preflight 与 freeze；每次只采固定范围的一例、保留全部模式及真实关闭原件，写外置 partial；完整合并后单独严格发布。见[固定快照流程](../docs/reference/example-evidence-campaign.md)。 |
| DevTools 示例验证       | `node tools/verify/devtools-examples.cjs`                                                                                                 | 会写独立 DevTools 示例证据。                                                                                                                                                                     |
| 静态 Gallery 构建与验证 | `node tools/verify/gallery-artifact.cjs build`                                                                                            | `build` 写 `build/examples/`；验证子命令见脚本文件头。                                                                                                                                           |
| 手册源码一致性          | `node tools/verify/manual-doc-consistency.cjs --strict`                                                                                   | 只读核对手册代码块与示例源码。                                                                                                                                                                   |
| 文档路径引用            | `npm run verify:doc-refs`                                                                                                                 | 默认只读；使用显式输出参数才写报告。                                                                                                                                                             |
| JS/TS 原生签名误用      | `node tools/verify/air-signature-usage.cjs --types <file.ts                                                                               | file.js> ...`                                                                                                                                                                                    | 只读指定文件；输出真实类型诊断及Scene组件、addChild返回值、geometry/Mesh误用。自测：`node tools/verify/air-signature-usage.test.cjs`。 |
| 原生输入与场景检查合同  | `node tools/verify/air-input-browser.cjs --browser=all --out=output/playwright/<new-report>.json`                                         | 使用只读临时服务和当前bundle，覆盖默认/自定义canvas、focus/editable/纯输入节点/鼠标转触摸/inspector。报告路径必须未存在；协议touch不等于实体设备。需可解析Playwright。                           |
| 原生诊断通道            | `node tools/verify/air-diagnostics-browser.cjs --out=output/playwright/<new-report>.json`                                                 | 三浏览器检查errors/warnings、原生Material警告与独立debug session；只读临时服务，写新报告和截图，不重建bundle。                                                                                   |
| 蒙皮首帧与变换          | `node tools/verify/air-skinning-browser.cjs --out=output/playwright/<new-report>.json`                                                    | 三浏览器实时/烘焙模式、暂停dt=0首帧、非对称网格SMR/root/ancestor缩放和bounds/像素。需当前bundle、可解析Playwright及匹配浏览器。写新报告/截图，完整范围及未测项由报告列明。                       |

## 程序化场景与独立验收工具

WebGL2 图形合同：`node tools/verify/webgl2-gfx-contracts.cjs --browser=all --out=<new.json>` 使用现有 SDK 和 public gfx 验证格式能力、sampler、depth bias、整数 clear/attribute、分层附件及读回。必须指定未存在的报告路径；写相邻截图及原始数值，自动关闭自有服务和浏览器，不构建、安装或下载。可用 `--playwright=<existing-module-path>` 指定已有工具；`--sdk=<bundle-relative-path>`、`--cases=<comma-separated-case-ids>`、`--variant=<name>` 选择明确候选/子集/撤销控制，子集不等于九项完整验收。合同与支持边界见 [WebGL2 gfx 合同](../docs/reference/webgl2-gfx-contracts.md)，执行及证据见 [专项台账](../ai/ledgers/webgl2-gfx-contract-remediation.md)。

逐机制负控：`node tools/verify/webgl2-gfx-controls.cjs --prefix=<new-prefix>` 从现有开发 bundle 生成隔离副本和 manifest，写入 `output/webgl2-gfx-contracts/variants/`，拒绝覆盖，不修改共享 SDK 或源码。使用上述 collector 的 `--control-manifest=<manifest.json>`、`--sdk=<variant.js>`、`--variant=<name>` 和指定 `--cases=` 采集对应反例；负控的预期失败独立记录，不等于正常候选通过。

普通 GPU 回归：`node tools/verify/webgl2-gfx-regressions.cjs --browser=all --out=<new.json>` 使用现有 SDK 验证原生实时蒙皮、MSAA resolve、resize 后读回→绘制→blit 与释放，支持 `--playwright=<existing-module-path>`。写显式新 JSON 和相邻截图，关闭自有浏览器与服务，不构建、安装或下载。截图是明确标注的 public GPU 读回预览，不代表直接 compositor 验收。

非默认状态恢复补证：`node tools/verify/webgl2-gfx-state-restoration.cjs --browser=all --out=<new.json>` 在独立夹具中检查 PACK/PBO、不同 READ/DRAW framebuffer 的成功、整体预检失败及 `GL_BEFORE` 执行失败恢复，并继续 public gfx 绘制/读回。raw GL 写操作仅用于明确标注的外部状态 setup/fault injection/释放，原九项夹具约束不变。支持 `--playwright=<existing-module-path>`、`--sdk=/build/<bundle.js>`；`--negative-control=omit-pack-pbo-finally --sdk=/output/webgl2-gfx-contracts/variants/<new.js>` 从现有开发 bundle 生成单机制撤销副本及 manifest，拒绝覆盖，不改共享 SDK，检出预期负控失败。写显式新报告和相邻截图，关闭自有服务/浏览器，不构建、安装或下载。

实际屏幕呈现：`node tools/verify/webgl2-gfx-presentation.cjs --browser=all --out=<new.json>` 通过原生 pacer 绘制屏幕 Canvas，分别核对初始、两次 resize 的实际页面 PNG 像素和独立 GPU 对照。支持 `--playwright=<existing-module-path>` 与 `--webkit-compositor=default|accelerated`；后者仅在 Windows WebKit 排除 Playwright 默认 `--disable-accelerated-compositing` 参数，完整记录启动条件，不修改共享 launcher 或主机配置。写新 JSON、实际截图及单列诊断导出后关闭自有资源。条件 profile 通过不表示默认环境已修复。

Shader 吸收基线：`node tools/verify/shaders-runtime-preflight.cjs --out=<new.json>` 使用现有 SDK，在 Chromium、Firefox、WebKit 的 720p、1080p 和移动 DPR 2 配置中验证单 Canvas 原生空场景启动、定步与关闭；写显式新报告，自动关闭浏览器和临时服务，不构建或安装。扩展发现不是 GPU 时间测量，空场景通过不是效果 Engine Gate。参数及独立 Engine/Agent 证据合同见 [effect-contract.md](../docs/effects/effect-contract.md)；`node tools/verify/shaders-effect-contract.cjs --selftest` 只验证合成合同，不启动浏览器。

Wave 1 当前状态和十三项交付见 [wave1-performance-followup-delivery.md](../docs/effects/wave1-performance-followup-delivery.md)，最初冻结交付保留于 [wave1-delivery.md](../docs/effects/wave1-delivery.md)。历史只读入口为 `shaders-noise-dissolve-precision-closure.cjs --verify=output/shaders-absorption/e01-engine-precision-final.json`、`shaders-thin-film-summary.cjs --verify=docs/evidence/shaders-absorption/e02-thin-film-summary.json`、`shaders-sparkle-final.cjs --verify=docs/evidence/shaders-absorption/e06-final-summary.json`（均以 `node tools/verify/` 为命令前缀）。需要可解析pngjs的tooling/NODE_PATH，不启动浏览器或写报告；历史报告若输入指纹已漂移会被拒绝，exit0仅证明证据/分类一致，三个效果整体仍BLOCKED，不等于Wave或Agent Gate通过。E01 summary工具仅支持显式新路径生成，不支持--verify。

Sparkle补充性能采集：`node tools/verify/shaders-sparkle-environment-performance.cjs --phase=performance --browser=all --authorization=<Lead串行窗口标识> --out=<new.json>` 通过真实HTTP隔离代理与导航后DPR核对，按原生帧执行30帧预热和60帧稳态，写显式新报告及相邻`-artifacts/`内9份raw JSON；保留失败并关闭页面、浏览器和服务，不构建/安装。`--verify=<report.json>` 独立重算当前输入、原始计时、清理及raw SHA/行绑定，只读且不启动浏览器。当前范围与环境限制见 [环境补充记录](../docs/effects/wave1-environment-followup.md)；Performance通过不解除WebKit活resize或Wave阻塞。

Noise Dissolve的补充入口为 `node tools/verify/shaders-noise-dissolve-environment-performance.cjs --phase=performance --browser=all --authorization=<Lead串行窗口标识> --out=<new.json>`；复用相同真实隔离环境，调用原例子30/60帧计时，写新报告及相邻9份raw文件。`--verify=<report.json>`只读核对源/SDK/工具身份、原始数组映射、释放、raw SHA与行绑定。CPU原始数组由例子内部汇总，不能宣称独立逐调用trace；该范围同样不解除Runtime/Wave阻塞。两工具均拒绝覆盖已有报告/产物。

`node tools/verify/shaders-resize-diagnostic.cjs --out=<new.json>` 独立采集单Cocos Canvas的builtin-unlit、同坐标GPU/Canvas导出/页面PNG及CSS/body底色对照；写显式新JSON和相邻PNG，关闭自有服务/浏览器，不build/install。最后canvas-reinsert阶段因布局改变为无效尝试，不能用于判断恢复；采集exit0不代表compositor或效果Runtime PASS。

Wave 1 原生效果的独立采集入口如下，均需现有 SDK、可解析的 Playwright/pngjs 和匹配浏览器。新报告和相邻原始输出只写显式新路径，不覆盖失败尝试；采集结束关闭自有浏览器与服务，不构建或安装 SDK。

- `node tools/verify/shaders-noise-dissolve.cjs --browser=all --out=<new.json>`：gradient noise、输入 Alpha、端点、普通控件、同页 resize 和百轮实例。性能仅在其他自有浏览器及测试停止的串行窗口启用 `--performance-authorized`。
- `node tools/verify/shaders-thin-film-browser.cjs --browser=all --phase=functional --out=<new.json>`：SDF 虹彩、未混合线性 RGBA、页面 PNG、边界及百轮退役；`--phase=performance` 在单独串行窗口采集三个分辨率配置。
- `node tools/verify/shaders-sparkle-browser.cjs --phase=functional --out=<new.json>`：双网格星芒、线性亮度、结构变体、背景混合、可信控件及资源；`node tools/verify/shaders-sparkle-performance.cjs --authorization=<quiet-window-reference> --out=<new.json>` 单独采集三浏览器性能。

各效果的 `--verify=<report.json>` 及独立 oracle 只读复算身份、数值、PNG 和范围。scoped 验证命令的实际 exit 0 只表示已采证子项通过独立复核；报告另存原采集命令及其实际退出码，不能改写失败采集为成功。WebKit 同页 resize 呈现未达保持 `INFRA_FAILURE/BLOCKED`，不能用 GPU 读回、Canvas 导出或新页面替代。当前状态与复跑说明见[效果索引](../docs/effects/README.md)。

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

`node tools/verify/air-bootstrap-browser.cjs --out=<新.json>` 检查三浏览器中的 unmin/min/npm-copy 主入口、首次启动、DPR resize、初始化失败和暂停释放，写指定报告及相邻截图。`npm run verify:consumer -- --bootstrap-browser --browser-out=<新.json>` 另行打包并安装到临时消费者，再用 esbuild 生成分块，检查实际安装包的三浏览器启动/像素/释放；默认 consumer 命令只执行 Node、类型及 bundler 解析检查。浏览器模式需要可解析的 Playwright 与匹配二进制。这些限定探针不替代完整发布或长时间生命周期证据。

- `node tools/verify/air-asset-bank-browser.cjs --out=<new.json>`：三浏览器真实HTTP无后缀JSON/PNG、显式ext分派、共享/取消/迟到释放和404/CORS/CSP。自动启动并关闭只读夹具及资源server；写显式新报告，保留实际请求、预期错误和指纹，不重建/安装引擎；`subset=true / completed=false`，不等于全部PG-32能力验收。

- `node tools/verify/air-test-input-browser.cjs --out=<new.json>`：三浏览器显式工具合成输入经真实PAL/UI/global链，部分UI吞噬、多指取消、单步更新与配对dispose；另采可信协议键盘/tap对照。工具位于 `tools/debug/test-input.ts`，不进默认运行时，不开第二时钟。自动关闭临时server/browser，写新报告；合成结果不证明实体设备或完整PG-10/28。

- `node tools/verify/air-atlas-browser-review.cjs --out=<new.json>`：三浏览器当前公共Atlas的旧/新格式、旋转/修剪/多页索引帧像素与所有权；`--installed`先本地打包、离线临时安装并esbuild分块，使用实际包验证同一合同，禁止以工作区/build替代。自动回收自有临时消费者/server/browser；写新报告及截图，记录tarball/chunk SHA，GPU分配量仍为unavailable，不替代全部PG或发布门禁。

- `node tools/verify/air-gltf-texture-direction-browser.cjs --out=<new.json>`：三浏览器通过公开GLTFLoader解析外部PNG与嵌入image bufferView，实际绘制四角图样、核对nearest/clamp sampler、交错上传后原纹理及非法sampler拒绝与释放。临时HTTP夹具和浏览器自动关闭；写显式新JSON及相邻截图，记录完整输入指纹和实际版本。不会构建或安装运行时；不认证所有UV、sampler、颜色空间或压缩纹理，GPU分配量不可测。

- `node tools/verify/air-texture-source-review.cjs --out=<new.json>`：当前产物三浏览器图片/Canvas/ImageBitmap、顶/底优先字节、helper、IMemoryImageSource在Sprite与+90X原生plane的七输入/20绘制观察，独立拒绝缺失/重复场景，核对上传前后原纹理/帧身份及实际释放。ImageData不强转上传、不计GPU执行。临时server/browser自动关闭；写显式新报告/相邻截图，不覆盖历史texture-orientation截图，不重建SDK或安装依赖。颜色空间/压缩纹理/实体设备与GPU分配量不认证。

`node tools/verify/air-platformer-browser.cjs --browser=all --out=<new.json>`：实际TMX/TSX/PNG与Box2D平台配方，独立检查完整物理/像素/键盘/暂停/restart/退役清理及资产引用。速度按公开PTM转换，摩擦读取真实接触；不以fixture自报verdict或空数组判绿。写指定新报告及相邻`-artifacts/`截图/日志，退出关闭自有server/browser；不build、安装或覆盖历史输出，不认证原作1:1或GPU完整分配量。

`node tools/verify/air-port-recipes-browser.cjs --browser=all --out=<new.json> [--installed]`：六类组合配方的逐阶段原生输入/像素/坐标/音频时钟/引用与终态守卫检查。仓库与安装路径编译同一份公开手册 main.ts 和 optional-recipe.ts；installed 模式本地打包、离线临时安装，实际 TS4.9 检查包内源码，拒绝仓库 /build 请求。可选资产按实际包字节通过独立真实 HTTP 服务交付，未知资产返回真实 404，不回退工作区资源。写新报告及相邻截图/log，记录 tarball/两份源码/资产/chunk/15 份输入 SHA。prepack 刷新既有 npm 副本，不 build/发布；结束后关闭两个 server/browser 并清理自有临时消费者。指针锁或音频时钟未达为 NOT_RUN/整体非零退出，仍是 PG33 子集。air-optional-recipe-browser.cjs 是此共同六类入口的兼容转发，报告范围相同。

`node tools/verify/port-gap-browser-evidence.cjs --input=<raw.json> --log=<raw.log> --gate=EG3 --type=BROWSER_RENDER_PASS --exit-code=<observed> --out=<new.json>`：只读核对已执行原始报告及当前指纹，并以新文件写PG34规范化结果，不启动浏览器。六配方保留浏览器/配方行、截图和具体未达原因；仅未达范围的非零退出保持NOT_RUN，不伪造FAIL或完整PASS。`node tools/verify/port-gap-browser-evidence.test.cjs`用已有实际记录的内存副本做合同回归，仅写并清理自有系统临时目录，不采浏览器证据。

- `node tools/verify/k0-r2-examples.cjs --browser=all --out=<new.json>`：正式 K0 R2 合同示例与动态批处理、glTF 蒙皮、手册线条示例的三浏览器限定验收。真实按钮控制、PNG 颜色/变化、暂停与重置、默认蒙皮材质和实例循环、引用归还、移动视口；写显式新 JSON 和相邻截图，关闭临时服务器与浏览器。使用当前 bundle，不构建/安装 SDK，不发布。`node node_modules/typescript/bin/tsc -p tools/verify/k0-r2-examples.tsconfig.json` 对这四份源码做独立严格 noEmit 检查（JS 共用 helper 不启用 checkJs）。

- `node tools/verify/interactive-improvement-baseline.cjs --out=<new.json>` / `--verify=<report.json>`：复用 candidate snapshot 记录当前 SDK/声明、Git/AIR/源码/runner/合同/产物身份、导出与历史任务去重；默认不把测试文件存在记成执行通过。out 仅写显式新路径；verify 只读并拒绝漂移。source-map 是规范化后的六源抽样，不证明所有源码对应。
- `node tools/verify/interactive-improvement-evidence.cjs --verify=<records.json>`：只读证据合同校验，解码 PNG；PASS 还需要调用方冻结的像素 oracle 和当前 app/sdk/harness SHA。通用 CLI 不推断像素预期，实际浏览器报告使用下一条专用验证入口；NOT_RUN 合规不等于功能通过。
- `node tools/verify/interactive-improvement-browser.cjs --browser=all --out=<new.json>` / `--verify=<report.json>`：独立原生 fixture 的输入→对象→提交→compositor PNG 三浏览器/DPR1/2 回归，包含遮挡负例、重置与释放；写显式新 JSON 和相邻 `-artifacts/` PNG/log，关闭自有服务/浏览器。不 build/install，不覆盖历史。verify 模式只读并重新计算 PNG 与当前指纹。`node node_modules/typescript/bin/tsc -p tools/verify/interactive-improvement-browser.tsconfig.json` 独立严格 noEmit 检查夹具。
- `node tools/verify/interactive-improvement-evidence-audit.cjs --report=<actual.json> --out=<new.json>`：只读实际原生报告，并在内存克隆中植入身份、事件、PNG、提交、遮挡与清理篡改；仅写显式新审计 JSON，不启动浏览器。观测边界见[输入到画面示范](../docs/manual/interactive-evidence-chain.md)。
- `node tools/verify/interactive-multipass-browser.cjs --browser=all --out=<new.json>` / `--verify=<report.json>`：相机 capture 与 gfx/mip 两路线的三浏览器/DPR1/2 采集，加测普通模式控件、重置循环、格式/MSAA 分配矩阵与负例。采集写新 JSON 和相邻 `-artifacts/` PNG/log；verify 只读复算当前指纹和像素。不会 build/install，native MSAA 采样保持 NOT_RUN，静态 binding 检测单独披露。`node node_modules/typescript/bin/tsc -p examples/interactive-multipass/tsconfig.json` 检查例的 SDK 声明消费。
- `node tools/verify/interactive-multipass-audit.cjs --report=<actual.json> [--out=<new.json>]`：Lead 独立读取实际报告，在内存中做 16 种身份、覆盖、事件/帧与清理篡改；没有 out 则只打印，显式 out 以 wx 写新文件，不启动浏览器。说明见[多 Pass 与 Mip](../docs/manual/interactive-multipass.md)。

### 动态几何与投影增量验证

- `node tools/verify/interactive-geometry-browser.cjs --browser=all --out=<new.json>`：采集透视/正交、DPR、相机、同页活resize与容器偏移111行，附雨线、静态/动态网格、取消/十轮reset和普通原生模式控件。写显式新JSON与相邻 `-artifacts/` PNG，关闭自有服务器/浏览器；不build/install、不覆盖旧结果。`--verify=<report.json>`只读复算当前指纹、实际上传/输入与PNG；存在受限FAIL时退出1。
- `node tools/verify/interactive-geometry-audit.cjs --report=<actual.json> [--out=<new.json>]`：内存克隆篡改审计，无out只读打印，显式out以wx写新JSON，不启动浏览器。结构合规与完整scope通过分别记录。
- `node node_modules/typescript/bin/tsc -p examples/interactive-geometry/tsconfig.json`：独立严格noEmit声明消费检查。范围与WebKit呈现对照见[动态Mesh手册](../docs/manual/interactive-geometry.md)。

### 互动输入与容器回归（IER-05/06）

- `node tools/verify/interactive-input-browser.cjs --out=<new.json>`：只读服务现有SDK，启动三浏览器的SDK/普通HTML两路径，采集可信点击/触摸、取消、滚动、提交和PNG；写显式报告及相邻-artifacts，已有路径拒绝覆盖。`--verify=<report.json>`只读重算身份、事件、模型/pose与PNG。NOT_RUN或已记录诊断不会变为完整PASS。
- `node tools/verify/interactive-input-audit.cjs --report=<report.json> --out=<new.json>`：不运行浏览器，按实际成功子项及基线新增错误验证篡改拒绝；只写显式新路径。完整基线失败保持失败。参见[混合输入说明](../docs/manual/interactive-input.md)。
- `node tools/verify/interactive-container-browser.cjs --out=<new.json>`：当前container启动/隐藏/父class布局/代次和无SDK WebGL2对照；只读服务现有bundle，不构建、不写screen.windowSize，写显式报告及PNG。`--verify=<report.json>`只读检查。原Puzzle50材料缺失仍NOT_RUN，不冒称原反例已关闭。

- `node tools/verify/interactive-container-audit.cjs --report=<report.json> --out=<new.json>`：只读复算真实成功子项并验证24种篡改拒绝；保留基线15受限失败，不运行浏览器。写显式新报告。参见[容器说明](../docs/manual/interactive-container.md)。

- `node tools/verify/interactive-timeline-browser.cjs --out=<new.json>`：服务既有SDK，采集原生/定步形变、实际section滚动、WebAudio空闲/压力12落点和释放，写显式JSON/PNG；`--verify=`只读检查。WebAudio缺失保持NOT_RUN。
- `node tools/verify/interactive-timeline-audit.cjs --report=<report.json> --out=<new.json>`：不启动浏览器，在实际成功子项上复算和篡改审计；仅写新路径，完整范围受限保持受限。
- `node tools/verify/interactive-misuse-browser.cjs --out=<new.json>`：五类实际消费负例、原生状态、只读inspector与清理；临时生成effect JSON后清理，显式报告。`--verify=`只读。详见[误用诊断](../docs/manual/interactive-diagnostics.md)，不代表像素健康。

### 当前颜色、性能与包内示例（IER-03/09/11）

- `node tools/verify/interactive-water-browser.cjs --out=<new.json>`：只读服务既有SDK，异步逐引擎运行现有Water实际runtime验证（非shader-only）；写显式JSON及相邻原报告/log/PNG，不build/install，结束关闭服务。
- `node tools/verify/interactive-color-compare-browser.cjs --out=<new.json>`：固定RGBA8目标比较原生oblique/discard及base/instance透明阴影，写新JSON/15PNG，关闭服务/浏览器；strict noEmit用interactive-color-compare.tsconfig.json。`interactive-color-compare-audit.cjs --report=<report.json或report.json.gz> --out=<new.json>`自动解压 gzip，只读身份/PNG/原始颜色并做10种篡改，写新审计，见[颜色对照](../docs/manual/interactive-color-controls.md)。
- `node tools/verify/interactive-performance.cjs --out=<new.json>`：冻结36个5秒本机窗口，真实raw帧回调/CPU markers/工具成本，写新JSON及截图；result LIMITED，不是3×60秒实体设备验收。`interactive-performance-audit.cjs --report=<report.json> --out=<new.json>`只读重算/身份/释放及篡改，写新审计，见[性能边界](../docs/manual/interactive-performance.md)。
- `node tools/examples/interactive-kit.cjs --write`刷新manual中的生成副本；`--check`只读逐字节比对，不改权威examples。`node tools/verify/interactive-kit-consumer.cjs --out=<new.json>`执行本地pack/prepack、临时offline install/已安装类型/esbuild与三浏览器普通路径，写tarball/chunks/JSON/60PNG后关闭并清理临时消费目录，不下载依赖或发布。`--verify=<report.json>`只读原始模型、PNG和身份。`interactive-kit-audit.cjs --report=<report.json> --out=<new.json>`只读实际行并做15种篡改，写新审计。详见[实际安装示例](../docs/manual/interactive-consumer-kit.md)。

时间轴采集与音频/滚动边界见[时间轴手册](../docs/manual/interactive-timeline.md)。完整范围失败/NOT_RUN不会因只读审计通过变成PASS。

### Shader Wave 1 当前 Gate 与 Gallery

- `node tools/verify/shaders-wave1-gate.cjs --bindings=<paths.json> --out=<new.json>`：读取三效果功能/性能及 Gallery 七份原始报告，复算数值/PNG/当前指纹、实际 OS 回执与非重叠窗口，写显式新汇总；不启动浏览器、构建或安装。`--verify=<gate.json>`只读重算当前身份，漂移拒绝。当前 [R20/R21 Gate](../docs/evidence/shaders-absorption/wave1-r21-current-gate.json) 已 PASS，Agent Gate 仍 NOT_RUN。
- `node tools/verify/shaders-gallery-lifecycle.cjs --out=<new.json>`：三例×三浏览器×step/native 的真实退役重建、终态与 PNG 验证，写新JSON和相邻 artifacts；关闭自有页面/浏览器/服务器。`--verify=<report.json>`只读重算18精确tuple、SHA/尺寸/PNG差异和资源清理。
- `shaders-browser-launch.cjs` 是 scoped 启动选项纯 helper：仅 Windows WebKit 排除 Playwright 默认禁用合成加速参数。`shaders-browser-environment.cjs` 提供真实 HTTP 隔离代理及导航后 DPR 修复，不改主机设置。

实际执行渠道、性能范围、失败保留与限制见[当前十三项交付](../docs/effects/wave1-resize-gallery-closure-delivery.md)。历史 BLOCKED/LIMITED 描述以各批次身份解释，不再作为当前裁定。

### Shader Wave 2 独立门禁

`NODE_PATH=output/playwright/tooling/node_modules node tools/verify/shaders-wave2-gate.cjs --verify=<effect-gate.json>` 只读核对单效果的六维状态、原始功能/性能报告、SHA/bytes、外层 OS 回执和冻结输入，并要求页面/控制台错误数组明确存在且为空；缺失数组不能当作无错误。重复三个 `--verify` 则验证精确 E03/E04/E05 覆盖，少一例拒绝。纯导出可用于内存篡改测试，不启动浏览器、不构建、不安装、不写报告。

E03/E04/E05 当前六维子集全部PASS，完整Wave2 Engine Gate通过；Agent Gate仍NOT_RUN。`--verify-wave=docs/evidence/shaders-absorption/wave2-current-gate.json`只读重算三叶级Gate、Wave1前置、当前verifier指纹、实际范围计数和Wave/项目/Agent状态；不写报告、不启动浏览器。原始采集仍走各 `shaders-<effect>-browser.cjs --phase=functional|performance --browser=all --out=<new.json>`，写新报告和截图；性能还需 `--authorization=<Lead token>` 且串行安静窗口。见[Wave2十三项交付](../docs/effects/wave2-validation-delivery.md)。

### Shader Wave 3 独立门禁

`node tools/verify/shaders-wave3-gate.cjs --verify=<effect-gate.json>`只读核对单例原始报告/OS/指纹与六维；重复三个`--verify`要求精确E07/E08/E09覆盖，缺项不能解锁Wave4。`--verify-wave=<wave.json>`另外复核Wave2前置与范围状态；当前尚无通过的Wave3汇总。均不启动浏览器、构建、安装或写报告，PNG复核需同一NODE_PATH工具环境。

E07性能采集按`shaders-liquid-metal-browser.cjs --phase=performance --browser=all --authorization=<token> --out=<new.json>`串行执行18窗口（三profile×两quality×三引擎），写新报告与日志；`--verify=<raw.json>`只读。汇总门禁额外核对真实参数状态和完整可信动作，详见[Liquid Metal交付](../docs/effects/liquid-metal-validation-delivery.md)。

E08 `shaders-cursor-trail-browser.cjs --phase=functional --browser=all --out=<new.json>`写新JSON、构建日志和截图，检查CPU host replay、真实鼠标/协议触摸、参数、同页resize及100轮退役；`--phase=performance --authorization=<token>`改为9个串行活轨迹窗口（每稳态帧64 texel/512字节）。`--verify=<raw.json>`只读。`shaders-cursor-trail-gate.cjs --verify=docs/evidence/shaders-absorption/e08-cursor-trail-current-gate-r2.json`额外检查OS/冻结身份、37类真实报告审计、计数与实际原生pass/draw；不启动浏览器、不写报告。详见[Cursor Trail十三项交付](../docs/effects/cursor-trail-validation-delivery.md)。E09和完整Wave3当前状态见独立汇总交付。

E09 `shaders-glass-browser.cjs --phase=functional --browser=all --out=<new.json>`写新JSON/构建日志/截图；`--phase=performance --authorization=<token>`运行9个串行原生双遍毛玻璃窗口（blur8/aberration0.5），写实际时钟、pass/draw和释放证据；`--verify=<raw.json>`只读。`shaders-glass-gate.cjs --verify=docs/evidence/shaders-absorption/e09-glass-current-gate.json`只读重算OS/身份/计数/35类审计及六维，不启动浏览器。`shaders-wave3-closure.cjs --verify=docs/evidence/shaders-absorption/wave3-current-gate.json`额外绑定当前三个叶级、Wave2前置、141 PNG计数和性能窗口不重叠；不写报告、不推进后续Wave或Agent Gate。见[Glass交付](../docs/effects/glass-validation-delivery.md)和[Wave3交付](../docs/effects/wave3-validation-delivery.md)。

### Shader Wave4 组合

C02 `shaders-film-neon-browser.cjs --phase=functional --browser=all --out=<new.json>`写新JSON、strict/bundle日志和48张截图；`--phase=performance --authorization=<token>`运行九个串行原生单遍窗口，写实际workload/环境/时钟/释放；`--verify=<raw.json>`只读。`shaders-film-neon-gate.cjs --verify=docs/evidence/shaders-absorption/c02-film-neon-current-gate.json`只读复算OS/冻结输入/当前指纹/六维范围/44类真实审计/共享中心SDF，不启动浏览器、不写报告。C02声明子集PASS不解锁Wave5；完整Wave4和Agent仍NOT_RUN，见[Film+Neon交付](../docs/effects/film-neon-validation-delivery.md)。

C01 `shaders-laser-card-browser.cjs --phase=functional --browser=all --out=<new.json>`写新JSON、strict/bundle日志及48张截图，检查三段原生组合、实际纹素warp、DPR、可信控件、同页resize及100轮七引用退役。`--phase=performance --authorization=<token>`串行运行九窗口，DPR修复后先在计时外同步两RT；计时窗口要求每帧至少三次原生pass和三次GL draw、readPixels=0。`--verify=<raw.json>`只读。`shaders-laser-card-gate.cjs --verify=docs/evidence/shaders-absorption/c01-laser-card-current-gate.json`只读复算自然OS退出、38输入+11参考、六维、56类真实审计、3→2旁路及原始性能数据；不启动浏览器、不写报告。见[Laser Card十三项交付](../docs/effects/laser-card-validation-delivery.md)。C01/C02子集通过，C03/C04和完整Wave4/Agent仍待验。

C03 `shaders-glass-trail-browser.cjs --phase=functional --browser=all --out=<new.json>`写新JSON、strict/bundle日志和48 PNG，验证完整Trail→RGBA8 RT→Glass链、可信Pointer、完整512字节上传回放、变体/诊断材质退役与resize；`--phase=performance --authorization=<token>`串行采集九个独立诊断窗口，逐帧绑定实际dt/参数/会话/原生上传和双pass/draw，禁止计时内readPixels。`--verify=<raw.json>`只读复算输入/参考/PNG与原始账本。`shaders-glass-trail-gate.cjs --verify=docs/evidence/shaders-absorption/c03-glass-trail-current-gate.json`另核对自然OS退出、阶段不重叠、当前冻结身份、真实报告篡改审计、六维计数及性能重算，不写报告或运行浏览器。见[Glass Trail十三项交付](../docs/effects/glass-trail-validation-delivery.md)。C03叶级收口不解锁Wave5；完整Wave4、独立Gallery与Agent仍待验，旧SDK证据不继承当前身份PASS。

C04 `shaders-input-dissolve-browser.cjs --phase=functional --browser=all --out=<new.json>`写新 JSON、strict/bundle 日志和相邻 artifacts，冻结三路线合计81视觉/90边界/21非法/300资源/9活resize/90PNG；`--phase=performance --authorization=<token>`串行采集三引擎×三profile×三输入路线的27窗口，使用真实HTTP隔离、DPR修复与完整时钟校准。两模式写新文件，已有路径拒绝覆盖，关闭自有页面/浏览器/代理/服务器，不构建SDK或安装依赖。`--verify=<raw.json>`只读重算完整输入/参考、PNG、原始观测与性能；`shaders-input-dissolve-gate.cjs --verify=docs/evidence/shaders-absorption/c04-input-dissolve-current-gate.json`另核对自然OS退出、冻结身份、阶段不重叠、实际44类篡改审计、引用配对与性能统计，不写报告或运行浏览器。PNG需要相同NODE_PATH工具环境。见[C04十三项交付](../docs/effects/input-dissolve-validation-delivery.md)。

2026-10-11 C01/C02随后完成当前SDK重采，C03因源码/元数据漂移也完整重采，当前叶级只读路径分别为 `c01-laser-card-current-sdk-gate.json`、`c02-film-neon-current-sdk-gate.json`、`c03-glass-trail-current-sdk-gate.json` 与原C04路径。旧文件保持历史身份，没有覆写。

`node tools/verify/shaders-wave4-gate.cjs --verify=docs/evidence/shaders-absorption/wave4-current-gate.json`只读重算四叶级Gate、当前SDK一致性、实际总范围与前置Wave3当前校验，不启动浏览器、不构建、不安装、不写报告。`ok=true/exit=0`表示汇总诚实合规，不能代替其status：当前四组合PASS/完整Wave4 BLOCKED/nextWaveEligible=false，前置源码/SDK证据需刷新。Agent/独立Gallery仍NOT_RUN，见[Wave4十三项交付](../docs/effects/wave4-validation-delivery.md)。

### Shader Wave5 文档与 Pilot

`node tools/examples/shaders-effect-docs.cjs --write` 从十三例实际参数定义生成五份类型、文档和验证元数据；`--check` 只读检查源码合同与产物字节。它绑定所读取的 SDK 声明，不读取运行时 JS，也不授予 Engine/Agent 状态。详见[文档生成交付](../docs/effects/wave5-docs-generation-delivery.md)。

`node tools/verify/shaders-driver-pilot-browser.cjs --phase=functional --browser=all --out=<new.json>` 写三浏览器、两消费者、DPR1/2 的实际功能报告、构建日志和96张PNG；`--phase=performance --authorization=<token>` 串行测量18个窗口，写实际CPU/GPU、时钟、环境和资源证据；`--verify=<raw.json>`只读复算。`shaders-driver-pilot-gate.cjs --verify=docs/evidence/shaders-absorption/wave5-driver-pilot-frozen-gate.json`验证39文件候选清单、两阶段自然OS退出、完整六维、34类真实篡改及源指纹；当前交付是冻结候选PASS，不能升级成工作区当前SDK通过。见[Driver交付](../docs/effects/driver-pilot-validation-delivery.md)。

`node tools/verify/shaders-wave5-gate.cjs --out=<new.json>` 读取现有Driver、融合和Wave4证据，重算当前SDK一致性、Driver候选验证和文档合同，写新的汇总文件，拒绝覆盖；不启动浏览器或重建SDK。`--verify=<report.json>`只读重算。即使诚实的BLOCKED报告结构验证返回`ok=true`，CLI仍退出1，且`nextWaveEligible=false`。当前[Wave5汇总](../docs/evidence/shaders-absorption/wave5-current-r2-gate.json)存在三项SDK字节阻塞，不进入Wave6；[融合交付](../docs/effects/uv-fusion-pilots-validation-delivery.md)保留GPU回退结果，不默认启用融合。PNG复算需要同一NODE_PATH工具环境。

## Build layout and startup lifecycle

WebGPU 的冻结 shader/builtin 资产校验、重建、浏览器及安装包命令见 [npm 脚本写入说明](../docs/reference/npm-scripts.md#webgpu-接入的资产写入) 和 [专项验收](../docs/reference/webgpu-acceptance.md)。浏览器采集默认写 `output/webgpu-backend/`；无 adapter 的环境返回 BLOCKED，不自动回退。

- `node tools/build/build.cjs --format esm --spark`: rebuild the full default feature set plus Spark directly as `build/spark.module.js` and its correctly named map. This increments the build counter once, does not overwrite default/npm copies, and accepts AIR_OUT_DIR for an isolated destination. Do not combine --spark with AIR_FEATURES, --min or SystemJS.
- `tools/build/startup-binding-patch.cjs`: internal checked PAL adaptation; only pal-source --write changes generated PAL outputs.
- `node tools/verify/build-layout-consumer.cjs --modern-ts=/path/to/tsc --out=new.json`: real tarball installation, clean/upgrade npm-copy regeneration, recursive exports, single main entry, consumer bundler resolution, and isolated TS4.9/modern subpath checks. Writes build/npm and temporary consumers; optional report refuses overwrite. Does not build runtime JS or change the build number.
- `node tools/verify/startup-browser-supervisor.cjs --browser=chromium --out=new.json`: bounded, single-engine startup regression; 15-second outer startup watchdog, 300-second default overall limit, actual child/browser exit+close receipts. Requires Playwright and a matching usable browser; Linux can select AIR_CHROMIUM_PATH/AIR_WEBKIT_PATH. Writes a new supervisor report, adjacent log/probe report; no build or publication. CPU-only --self-test=normal/timeout verifies supervisor cleanup.
- `node tools/verify/test-inventory-additions.cjs --report=focused.json --discovery=all-suites.json --out=new.json`: generate an additive inventory from real passing new-suite results and complete Jest discovery. Preserves all old titles, refuses removed/renamed suites and failing/pending tests, sets fullRunVerified=false and does not manufacture full-run totals. Only writes the explicit new output; the full inventory execution gate is unchanged.

- `node tools/verify/prepare-startup-browser.cjs --out=output/build-layout/browser-fixtures`: CPU-only, new-directory preparation of an actual installed tarball, real split bundler consumer, and five-entry Gallery subset with byte equality. Writes only generated npm copies, the new fixture directory and a temporary Gallery directory; does not compile runtime JS or launch a browser. Run the supervisor with --fixtures=<that directory>.
- `node tools/verify/source-maps.cjs --out=new.json`: verifies all five tracked JS/map pairs using ECMAScript line counting and actual generated-token mappings into multiple sources, real VM line-ending controls, corrupted-map negative controls, and npm-copy equality. Retains the original relocation checks; reports sampled mapping coverage rather than claiming every segment is certified.

## WebGPU Windows 专项收尾

`node tools/verify/webgpu-completion-runner.cjs --out=<新目录>` 运行原生环境预检、三浏览器双后端与 Windows WebKit 边界、安装包 dev/min 全矩阵；新目录保存实际退出码与日志，不构建或发布。`--resume=<旧目录>` 只复用同候选/同采集器的完整成功证据，原退出码、时间和来源保留。

`node tools/verify/webgpu-acceptance.cjs --reports=<输出目录>` 默认只读重算；显式 `--archive=<新目录>` 才复制证据。该 Windows 范围通过与 Safari 外部 NOT_RUN、全仓 release NOT READY 分开。命令前置、Firefox 的临时刷新/遮挡配置与写入见[环境说明](../docs/reference/webgpu-environment.md)及[npm 命令目录](../docs/reference/npm-scripts.md)。
