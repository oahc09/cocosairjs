/**
 * Cocos AIR Spark 高斯泼溅 bundle 入口（ccbuild feature unit: `spark`）。
 *
 * 可选单元：不进 `air` 聚合、不进默认 bundle（计划 `ai/plans/spark-integration.md` §1.3 体积边界与
 * §SPK-02 判定），使用时以变体构建显式点名，例如
 * `AIR_FEATURES=air,base,gfx-webgl2,spark AIR_OUT_DIR=output/spark-variant npm run build`。
 *
 * 组成（仅集成层自身与冻结运行时的**命名空间**出口）：
 * - AIR 集成层（本仓原创 TS）：渲染桥 `CocosRenderer`、场景图层 `CocosSparkLayer`、PMREM；
 * - 冻结 Spark 运行时子图 `../air/spark/generated/spark-runtime`（由
 *   `tools/build/spark-runtime-tree.cjs` 从 `vendor/spark/src/**` 生成，`three` specifier 指回门面），
 *   以 `sparkRuntime` 命名空间隔离导出，避免与引擎根导出面的同名符号相撞。
 *
 * 相对上游 `@sparkjsdev/spark` 2.3.1 导出面的收窄（剔除 `SparkXr` 与 `hands`，AIR 无 XR 会话层）
 * 及其复议条件，见 `docs/UPSTREAM.md` 与 `ai/ledgers/spark-integration.md`。
 */
// `spark-api-adapter` / `spark-math` 刻意**不**从此处再导出（计划 §SPK-05a 硬约束 1：适配器不得进入
// `cocosair` 根导出面；§复议条件：将来若公开也必须命名空间隔离）。实测代价：ccbuild 把本入口原文合成进
// `cc` 模块后交给 rollup，适配层的 `Scene`/`Camera`/`Color`/`Material`/`Mesh`/`Layers`/`clamp` 与
// `src/exports/base.ts`、`src/exports/air.ts` 的同名引擎导出形成歧义导出，rollup 以
// 「Conflicting namespaces ... (will be ignored)」把**引擎**那一侧丢弃，变体产物运行时 `cc.Scene` 变
// undefined（SPK-INT 探针三浏览器 startupException 实证）。适配器仍经构建期 alias 供冻结子图消费。
export { CocosRenderer } from '../air/spark/cocos-renderer';
export { CocosSparkLayer } from '../air/spark/cocos-spark-layer';
export { PMREMGenerator, pmremLayout, CUBEUV_SAMPLING_GLSL } from '../air/spark/pmrem';
export * as sparkRuntime from '../air/spark/generated/spark-runtime';
