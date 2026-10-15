# build/ — 构建产物目录说明

统一使用主引擎入口。启动、场景、渲染和实验性 HTML 纹理接口均从 cocosair.module.js 导出；不再生成或发布 bootstrap/html-source 独立 JS、map、声明或包子入口。

| 条目 | 用途 | 生成方式 |
| --- | --- | --- |
| cocosair.module.js / .js.map | 未压缩 Web ESM 引擎与源码调试映射 | npm run build |
| cocosair.module.min.js / .js.map | 同一默认功能集的压缩版与源码映射 | npm run build:min |
| cocosair.module.d.ts | SDK 类型声明 | npm run build:dts |
| cocosair.legacy.d.ts | TS <5.0 兼容声明，复用主声明并补充 DOM 类型 | npm run build:dts |
| package.json | type: module，声明本目录 JS 的 ESM 格式 | 默认运行时构建 |
| npm/ | 只有主引擎未压缩/压缩两个发布副本，无 sourceMappingURL | prepack / build:all |
| spark.module.js / .js.map / .d.ts / spark-types/ | 借用主引擎的独立 Spark 模块 | npm run build:spark |
| gltf-decoders/ | 独立维护的 Draco、Meshopt、Basis/KTX2 JS/WASM、许可与哈希清单 | 入库资源，不由默认构建下载 |
| fflate/ | Spark 使用的受审计依赖；不进默认 npm 包 | 入库资源 |
| devtools/ | 可选 agent-session/panel 开发工具；不进默认 runtime 包 | 开发工具构建 |
| reports/ | 分析与验证报告，不参与运行 | 对应分析/验证工具 |
| .tmp-rollup-cache/ | 增量构建缓存 | 构建自动维护 |
| README.md | 本目录说明 | 手写文档 |

普通浏览器应用直接 import 主 JS；npm 消费者使用 cocosair.js 包名，TypeScript 自动选择声明。需要延迟加载时由应用动态 import 主入口。完整引擎不支持无 DOM 的 Node/SSR 导入。

JS 构建不生成主声明，声明构建不生成 JS。完整准备使用 npm run build:all；npm pack 只执行 prepack，不重新编译。每次成功的运行时构建递增 AIR_BUILD_NUMBER，build:all 的 dev/min 各消耗一个序号。

构建、声明与 prepack 会删除旧版的独立 bootstrap/html-source 文件，只清理明确退役文件，保留 decoder、Spark、DevTools 和其他资产。历史证据不因清理而改写为当前通过。

若有 cc.js / cc.js.map，它们是 npm run build:system 生成的 SystemJS 变体，不属于默认 ESM 发布入口。若有 examples/，它是 Gallery 的静态发布站点，由 Gallery 工具单独生成。

临时 .tmp-dev-*、.dts-tmp-*、.dts-before-bundle-* 可在没有构建运行时清理。删除缓存会让下次构建变慢；不能仅凭文件名删除 decoder、许可或验证输入。

完整构建按主机资源设置 V8 堆上限。本轮 Node 24 环境的 4 GiB 堆在 source map 生成时耗尽，使用 NODE_OPTIONS=--max-old-space-size=6144 后 build:all 通过；6 GiB 是本次验证配置，不是整机内存总需求，仍需给子进程、原生缓冲和系统留余量。

各命令的用途和写入行为见 [npm 脚本说明](../docs/reference/npm-scripts.md)，Spark 现状与可选模块方向见 [Spark 入口说明](../docs/reference/spark-optional-entry.md)。
