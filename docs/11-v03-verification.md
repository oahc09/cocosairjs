# V0.2 审查修复与 V0.3 验收

日期：2026-09-12。结论：已完成本版范围内的前置审查修复、资源检查工具、运行时集成与本地静态验证。未提交、发布或同步上游。

> **证据链接可读性说明（V1.2 补）**：本文中指向 `../output/playwright/` 下文件的 Markdown 链接，目标是 **`.gitignore` 排除的瞬态验证目录 `output/`**（见该文件「瞬态验证产物与构建临时目录（V0.3）」条）。V0.3 期的 Playwright 捕获只写在当时的开发机上，**从未随仓库入库**，所以在干净检出的仓库里这些链接不可解析——它们只作为 provenance 指针保留，**不据此判「证据在仓库内可得」**。这批断链已逐条登记在 `tools/v12/doc-refs-baseline.json`（class `v0x-evidence-path`，本文 5 条），由 `npm run verify:doc-refs` 棘轮锁定：新增同类断链即红。

## 基线与归属

- 仓库 HEAD：`cb64da4`（V0.2 RC）。开工时工作区已有外部任务未提交的 README、d.ts 构建工具、引擎 path 修复、glTF 源码/示例/验证资料及构建产物；全部保留。
- V0.2 原始验收：[报告](acceptance-report-v02.md)。审查发现原增量构建与部分 helper 验收不充分，已加更正说明，没有抹去历史结果。
- glTF/GLB 公开入口与生命周期以 [外部交付指南](gltf-runtime.md) 为准。本版只消费已经可用的部分；并行新增的官方模型测试不归本版，也不被本报告推定通过。
- 环境：Windows 11 Pro Insider Preview 10.0.28120，Node v24.14.0，npm 11.11.1，HeadlessChrome 153.0.0.0，800×600，实际 WebGL 2.0。未把旧报告的 WebGL1 结果当作本次新实测。

## Evidence → Finding → Path

| 实际证据 | 问题 | 修复与验证 |
|---|---|---|
| 原 restore-bind-pose 对 child-first joints 的复位坐标误差为 8 | 直接按 joint 索引恢复，会在子关节之后移动父关节 | 仅调整执行顺序为父先子后，不更改 skin 索引；smoke-06 新用例通过 |
| 原 frameObject 相机父节点位移 20 时 world x 从预期 4 变成 24 | 将世界坐标写入 local position | 使用 setWorldPosition；smoke-08 与浏览器正交中心检查通过 |
| 正交 half-height 0.1 在取景后仍为 0.1 | 改距离不能调整正交视野；透视还遗漏较窄视场 | 设置 orthoHeight，考虑 aspect/fovAxis、近远裁面；透视/正交回归通过 |
| 静态示例 model.worldBounds 为 null，画面没有棋盘格 | Mesh 未计算 bounds；纹理宏未开启，光照不适于观察材质 | 生成 bounds、启用 USE_ALBEDO_MAP、调整示例光照；颜色与纹理像素对照通过 |
| ccbuild 的 Rollup options 固定 cache:false；原 L7/L8 报告承认全量重编 | Watch 分类不等于模块增量转换 | 保留 ccbuild 原插件/feature/bundler，进程内接入原生 Rollup cache；冷 618、热 0、单 Air 文件变更 1 个转换 |
| 构建 map.sources 为 ../../src/...，产物却已移到 build 根 | 搬运后相对源码位置失效，map.file 仍为 cc.js | 重定位 sources 并设置实际 file；normal/min 两份各 539 个源路径均存在，sourcesContent 齐全 |
| 原 prelude 查询 FRAMEBUFFER 枚举、反复调用 getError | 诊断会制造 INVALID_ENUM，并吞掉错误状态 | 保留 draw/compile/link 观察，不读取 WebGL 错误队列；模拟上下文确认错误读取次数为 0，浏览器无错误 |
| 页面有原 importmap，dev server 又注入一份 | 浏览器报告重复规则冲突 | 已有 importmap 时不注入；dev-loop 检查恰好一份 |
| 带类型的临时 .ts 经 dev server 返回未转换源码 | 路由正则匹配了 .mt/.mts，遗漏 .ts | 改为 .ts/.mts；带 number 类型代码实际经 esbuild 转换 |
| 快速连续改写 TS 后预期错误 500，实际仍返回旧 200 | 单凭 mtime 缓存漏掉快速保存 | 按源内容缓存转换，验证正常→错误→修复；无引擎重建 |

声明“不是模块”的问题已由外部任务修复，本版保留其 build-dts.cjs 修改；新增 actual-package consumer 验证，不声称这是本版实现。

## 命令验证

| 检查 | 本次结果 |
|---|---|
| `npm run typecheck` | PASS |
| `node node_modules/jest/bin/jest.js --runInBand` | 9 suites / 32 tests PASS |
| `npm run build` 对应原构建脚本 | PASS；normal ESM + map |
| `npm run build:min` 对应原构建脚本 | PASS；minified ESM + map |
| `npm run verify:web-only` | PASS；763 可达文件，保留既有 mesh-codec 常量折叠白名单 |
| `tsc ... --module NodeNext --moduleResolution NodeNext test/types/v03.mts` | PASS；从 cocosair.js 公共包入口导入，而非 src |
| `tools/verify/build-cache.cjs` | PASS；真实模块缓存、依赖变更、失败恢复、配置失效 |
| `tools/verify/dev-loop.cjs` | PASS；TS 编译恢复、reload token、零引擎重建、诊断无错误消费 |
| `tools/verify/source-maps.cjs` | PASS；normal/min 各 539 个源码路径存在，file/URL/content 一致 |
| `tools/verify/v03-browser.js` | PASS；10 组静态页面，0 console/page/WebGL 错误 |

类型消费命令完整参数见 [操作文档](10-v03-runtime-integration.md)。skipLibCheck 用于检查业务消费与预期类型错误，不代表全部上游 d.ts 无诊断。本版没有新增 SDK API，因此复用外部已生成声明并验证消费，没有重新生成另一套声明或修改外部声明构建工具。

缓存验收是“转换数量确实减少”，不宣称 TS program 与链接均零成本。独立缓存用例为冷 2、热 0、依赖变更 1、失败恢复冷 2、配置失效冷 2；实际引擎为冷 618、热 0、单 Air 文件变更 1。单次样本耗时约 19.5s / 11.5s / 13.0s，仅记录，不作为跨机性能承诺。锁等待或并发负载会影响端到端耗时。

原 ccbuild 仍输出 noSideEffectFile 指向未抽取平台文件等历史工具告警；未删除配置、降低检查或屏蔽告警。本版的 module cache bridge 针对当前 ccbuild 2.3.21/Rollup 4.29.1，升级工具链时须复跑缓存、构建和浏览器用例。损坏缓存或失败重建会失效缓存；配置/锁文件变化触发冷转换，生产 min/system 不使用该缓存。

## 浏览器与生命周期结果

站点只含引擎产物、编译后的示例和静态资源，部署前缀为 `/nested/demo/{normal|minified}/`。普通服务器没有源码回退、导入器或 dev 注入。

| 示例 | normal 前景像素 | minified 前景像素 | 附加验证 |
|---|---:|---:|---|
| starter | 0 | 0 | 空场景为预期，Scene 已运行 |
| hello-cube | 18236 | 18120 | 相机/光照/旋转网格；帧时机不同不做逐像素相等断言 |
| static-model | 162919 | 162919 | 棋盘纹理、材质颜色和 parented 正交取景 |
| skinned-animation | 21324 | 21365 | 既有三关节程序化示例，仍不等于真实模型导入覆盖 |
| gltf-viewer | 40885 | 40885 | BoxTextured 初始画面；另跑 combined 动画/生命周期 |

- 静态材质：红/绿 mainColor 对照变化 4313 像素；白纹理/棋盘纹理对照变化 5021 像素。
- 正交相机：相机挂在平移父节点下，目标屏幕中心约 `[400,300]`，orthoHeight 约 1.618；单测另覆盖竖屏 aspect=0.5 的较窄视野。
- combined：原生动画在 `0` 与 `duration×0.37` 间变化 18953 像素；两个实例播放状态独立。
- 释放一份实例并重复 dispose 后，另一份节点/mesh 仍有效；恢复播放能推进；释放两份后父资产引用计数从基线 2 回到 2。不是仅靠进程内存或一次 GC 判定。
- 同一使用侧检查能发现注入的缺失 mesh 和不存在的动画 target，返回 MISSING_DEPENDENCY / ANIMATION_TARGET；检查器不创建材质实例。
- smoke-02 验证 app.run 替换 scene，getScene 返回新场景、旧场景销毁、game.run 只调用一次。

原始结果：[浏览器 JSON](../output/playwright/v03-browser-result.json)、[dev loop JSON](../output/playwright/v03-dev-loop.json)。画面：[纹理与取景](../output/playwright/v03-normal-static-model.png)、[模型与动画](../output/playwright/v03-normal-gltf-viewer.png)、[蒙皮回归](../output/playwright/v03-normal-skinned-animation.png)。

## V0.3 验收矩阵

| ID | 状态 | 依据 |
|---|---|---|
| L0 V0.2 交接 | PASS，含审查更正 | 当前 HEAD、前置修复表与原报告附注 |
| L1 原有示例 | PASS | 4 个旧示例 × 2 种构建 |
| L2 生命周期 | PASS | scene 替换、多实例状态、释放与引用基线 |
| L3 外部集成 | PASS（已交付子集） | GLTFLoader/GLTFAsset 原入口，BoxTextured 与 combined |
| L4 静态运行 | PASS | 嵌套 URL、无源码服务、normal/minified |
| L5 类型/依赖边界 | PASS | actual-package consumer + Web-only；检查工具不进 SDK export |
| L6 文档 | PASS | 资源指南、审查与复现证据 |
| L7 关系/索引 | PASS | 资源来源/构造/依赖/所有权表，沿用外部集合与 URL |
| L8 Inspect/Validate | PASS | 只读资源遍历、正常/损坏/错误类型/销毁与绑定用例 |
| L9 角色组装 | PASS（复用已有示例） | 原 Node/Renderer/Animation 与外部 instance，无新增模型抽象 |
| L10 Dev Loop | PASS | 独立 dev-loop 回归、单 Air 模块实际增量转换 |

## 限制与 Deviations

1. 外部 glTF/GLB 支持范围、格式错误处理与官方样本兼容性由对应任务负责；本次不重新解析、转换或扩张其验收。
2. 检查器显式列出 unchecked：builtin/default sampler、custom path resolver/value proxy 执行；只读报告不能证明这些运行时行为。GPU 验证通过也不代表全部设备兼容。
3. 不将三关节程序化动画表述为 37 关节回归；本版已按修订任务书取消新增关节/clip 数硬指标。
4. 静态示例修复了原来未实际触发的纹理和 bounds；视觉变化属于正确性修复，未修改 glTF 示例或 loader。
5. ccbuild 无公开 cache 参数：通过限定在单次构建进程中的 Rollup export bridge 注入原生 cache，finally 恢复，未修改 node_modules。保留现有构建器、插件链、feature 集与产物名，缓存升级风险已记录。
6. 没有新增 character-runtime，因为外部 gltf-viewer 已覆盖组合演示；没有新增 manifest/Asset CLI 产品，检查入口位于 tools/verify。
7. 本地静态验证目录是临时产物，准备命令可以重建；源资源来源与许可仍由 [外部来源清单](../examples/gltf-viewer/assets/SOURCES.md) 记录。
