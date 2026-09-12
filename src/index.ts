/**
 * Cocos AIR 统一公共入口（源码形态）。
 *
 * 构建产物（build/cocosair.module.js）以 src/exports/air.ts 为入口，
 * 两者导出面保持一致：Code First API + 引擎公共类型。
 */

export * from './air';
export * from './exports/base';
export * from './exports/3d';
export * from './exports/animation';
export * from './exports/skeletal-animation';
export * from './exports/primitive';
export * from './exports/tween';
