# build/ — SDK 文件与部署清单

不要把整个 build 目录当作每个应用都必须下载的资源。它同时保留运行入口、类型、可选后端、npm 副本与构建验证数据。启动与 HTML 纹理 API 均在主入口，不生成 bootstrap/html-source 独立入口。

## 最小使用集

| 使用方式 | 需要的文件 |
| --- | --- |
| 普通浏览器 JavaScript | `cocosair.module.js` 或 `cocosair.module.min.js`，二选一；另加应用自身资产 |
| TypeScript 开发 | 上述 JS，加 `cocosair.module.d.ts`；TS <5.0 还需 `cocosair.legacy.d.ts`（它引用主声明） |
| 仅 CPU 数学运算 | `cocosair.math.js`；TS 另需对应 math 声明及其引用的主声明，不需要加载主引擎 JS |
| Spark 高斯泼溅 | `spark.module.js` 和它固定引用的 `cocosair.module.js` 同目录；TS 另需 Spark 声明与完整 `spark-types/`、主声明 |
| npm 消费 | 使用包入口 `cocosair.js` / `cocosair.js/math`；由包导出选择 JS 和声明，无需手工复制整个 build |

`.map` 和 `.d.ts` 都不是浏览器运行必需。浏览器直接用 ESM 不读取 package.json；Node/bundler 消费这些 `.js` 时应保留最近的 `package.json` 的 `type: module` 约定。完整主引擎仍不支持无 DOM 的 Node/SSR 导入。

声明文件需要带齐引用关系，但业务只配置对应的类型入口：TS >=5 选主声明，TS <5 选 legacy 入口，不必手工 import 两套声明。

## 按功能部署

| 条目 | 什么时候需要 | 仓库内是否保留 |
| --- | --- | --- |
| `webgpu/` | 显式使用实验性 WebGPU 后端的 shader 翻译资产 | 保留，默认 WebGL2 不需要加载 |
| `box2d3/` | 显式选择 Box2D 3 WASM 后端 | 保留；普通 JS 物理不需要部署 |
| `gltf-decoders/` | 使用 Draco、Meshopt、KTX2 等压缩资产时部署对应解码器、依赖和许可 | 保留，默认构建不会下载或重建这些受审计资产 |
| `spark-types/` | Spark 的 TypeScript 开发 | 保留；运行 JS 不读取声明 |
| `fflate/` | 重建/审计 Spark 时的源依赖 | 保留；所需代码已打进 Spark 模块，直接部署 Spark 不需另复制本目录 |
| `box2d3-samples/` | 官方样例与物理后端回归 | 保留验证资产，不是业务运行必需 |

解码器中的编码器、许可和哈希表可能用于夹具重建与审计，不按“运行时没加载”直接删除。具体部署参见 [glTF 解码器](../docs/gltf/gltf-decoder-deployment.md)、[Spark](../docs/reference/spark-optional-entry.md) 与 [WebGPU](../docs/guides/webgpu.md)。

## 构建、发布与调试数据

| 条目 | 用途与生成方式 |
| --- | --- |
| 主引擎 JS / min JS / `.map` | `build` / `build:min`。本地调试和浏览器校验需要 map，生产可不部署；npm 副本已去掉 map 引用 |
| 主 / legacy 声明 | `build:dts`；JS 构建不会自动更新它们 |
| math JS / 两份声明 | 由 `prepack` / `build:all` 的数学入口构建生成 |
| Spark JS / map / 声明 / `spark-types/` | `build:spark`；借用主引擎，不重复打包 Cocos |
| `npm/` | 发布用的三份 JS：主引擎、压缩主引擎、math，以及可选后端资产副本。类型和解码器仍在 build 的其他位置，不能把 npm/ 单独当作完整 SDK |
| `metadata/math-build.json` | 数学入口输入/输出哈希收据，CI 和复现校验需要，应用不加载 |
| `metadata/spark.module.meta.json` | Spark 构建依赖图，检查未重复打包 Cocos；应用不加载 |
| `devtools/` | 可选调试工具，应用明确启用时才部署，不进默认 runtime 包 |
| `examples/` | 可再生成的 Gallery 静态站点，不是引擎依赖，不进默认 npm 包 |
| `reports/` | 分析报告，不是运行依赖；按生产脚本管理，历史材料不冒称当前验收 |
| `.tmp-rollup-cache/` | 可复用的增量缓存；删除会使后续构建变慢 |

完整准备运行 `npm run build:all`，Spark 另运行 `npm run build:spark`。`npm pack` 只触发 prepack，不重新编译主引擎。成功的主引擎 JS 构建递增 AIR_BUILD_NUMBER；build:all 的 dev/min 各消耗一次，数学入口与 Spark 不递增。

没有构建正在使用时，可清理 `.tmp-dev-*`、`.tmp-min-*`、`.dts-*` 等暂存目录。`metadata/` 是校验输入，不能当临时文件清除。若有 `cc.js` / map，它们是可选 SystemJS 变体。默认构建只移除明确退役的入口与已迁移的旧收据，不删除可选资产或改写历史证据。

脚本用途与写入行为见 [npm 脚本说明](../docs/reference/npm-scripts.md)。
