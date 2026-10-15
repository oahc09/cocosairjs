# Spark 独立模块

Spark 高斯泼溅现在以独立 ESM 模块提供。它复用默认 Cocos AIR 引擎，不再打包第二份 Cocos、PAL、Scene、Node 或 gfx。

## 构建与文件

先准备默认主引擎，再构建可选模块：

```bash
npm run build
npm run build:spark
```

兼容命令 node tools/build/build.cjs --format esm --spark 也构建独立模块，不再构建整合版。build:spark 不重建主引擎、不推进主引擎 AIR_BUILD_NUMBER；build:all 仍只构建默认 runtime/min/声明及 npm 副本，Spark 按需单独构建。

| 文件                         | 用途                                                              |
| ---------------------------- | ----------------------------------------------------------------- |
| build/spark.module.js        | 独立 Spark 模块，唯一 runtime 外部依赖为相邻的 cocosair.module.js |
| build/spark.module.js.map    | 定位 AIR 集成层与冻结 Spark 代码的源码映射                        |
| build/spark.module.d.ts      | 独立模块公开声明入口                                              |
| build/spark-types/           | 集成层生成声明及冻结上游声明，原生 gfx/数学类型引用主 SDK         |
| build/spark.module.meta.json | 构建依赖图，检查没有打包 Cocos/PAL 实现                           |

旧 cocosair.module.spark.js 与 map 已退役，由独立构建删除。没有再复制主引擎的 JS；部署时将主 JS 和 Spark JS 放在同一目录。使用压缩主引擎时，应保持该 canonical 主入口 URL 指向压缩实现，不能让应用与 Spark 载入两个不同 URL 的引擎副本。

## 使用

```ts
import * as cc from './cocosair.module.js';
import { CocosSparkLayer, sparkRuntime, sparkMath } from './spark.module.js';

const app = await cc.createAirApp({ canvas: '#GameCanvas' });
// scene、camera 使用原生 Cocos API 创建并运行。
const layer = new CocosSparkLayer({ cc, app, camera });
const packed = new sparkRuntime.PackedSplats();
packed.pushSplat(new sparkMath.Vector3(), new sparkMath.Vector3(0.1, 0.1, 0.1),
    new sparkMath.Quaternion(), 1, new sparkMath.Color(1, 0.5, 0.2));
const mesh = layer.add({ node, packedSplats: packed });
await mesh.initialized;
app.session!.own(() => layer.dispose(), 'spark-layer');
```

可运行示例为 examples/spark-splats/，生成 360 个本地程序化泼溅，不依赖在线模型。独立模块导出 CocosRenderer、CocosSparkLayer、PMREMGenerator/pmremLayout/CUBEUV_SAMPLING_GLSL，以及 sparkRuntime、sparkMath 命名空间。数学兼容形状仍委托主引擎的数学实现；不把 Spark 的 Scene/Camera/Color 平铺进主引擎导出，避免同名冲突。

CocosRenderer.create 默认使用已导入的同一主引擎；显式 engineUrl 或构造器注入另一份 gfx 命名空间会报 SPARK_E_ENGINE_IDENTITY。正常只启动一次 createAirApp，scene/camera/device/framebuffer 均来自它。layer.dispose 清理泼溅与桥接资源，不销毁借用的 app；它不会替代应用自己的场景释放。有在途自动排序/读回时，应先停止自动更新并等待排序结束；现有同步 dispose 仍可能使未完成读回抛错，本次没有改写该异步取消边界。示例采用静态数据、手动完成一次更新并等待排序结束后才登记释放回调。

## 声明与边界

AIR 集成层的声明由 TypeScript 从真实源码生成，native-gfx 类型别名复用主声明，不要求用户复制 src/cocos。sparkRuntime 仍沿用冻结上游的 any 声明边界，不能把独立模块拆分说成上游 58 个值全部有强类型。sparkMath 在独立命名空间提供原有适配类的生成声明。

默认主引擎不包含 Spark，也不提供 sparkRuntime/CocosSparkLayer 根导出。独立构建保持冻结 @sparkjsdev/spark 2.3.1 的原算法、XR/hand 家族排除范围和 WASM/fflate 内联方式。

## 来源与发布限制

WASM 是 vendor/spark-rs 中的上游发行字节，未经本环境 Rust 重建；JS/glue/WASM 及 fflate 的来源、许可与 SHA 仍由原 MANIFEST 和资产门禁检查。见 [上游差异](../UPSTREAM.md)、[第三方许可](../THIRD_PARTY_LICENSES.md) 和 docs/license-decisions.json。

spark-rs 静态链接 crate 的转付许可链仍登记为 pending。因此目前提供仓库内构建与本地使用，独立模块尚不纳入 npm files/exports，也不新增 cocosair.js/spark 包子入口。拆分没有解除现有发布限制，不宣称 npm 发布就绪。

## 验证

构建器拒绝依赖图中的 Cocos/PAL 源码输入。现有 spark-cpu-parity 与 spark-pixel-parity 工具已迁移到主引擎加独立 Spark 模块；验收检查真实主设备/GL/framebuffer 身份和原生像素，不靠对象字段存在或类名 alone 认定复用。
