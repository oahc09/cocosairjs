/** Optional standalone Spark module. Build with npm run build:spark; Cocos stays external.
 * Spark-shaped math is namespaced in this module, never flattened into the main engine.
 */
export { CocosRenderer } from '../air/spark/cocos-renderer';
export { CocosSparkLayer } from '../air/spark/cocos-spark-layer';
export { PMREMGenerator, pmremLayout, CUBEUV_SAMPLING_GLSL } from '../air/spark/pmrem';
export * as sparkRuntime from '../air/spark/generated/spark-runtime';
export * as sparkMath from '../air/spark/spark-math';
