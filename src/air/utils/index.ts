/**
 * Cocos AIR Utilities（V0.1 Phase 15 → V0.2 Task 2-4 正式化）。
 *
 * 四个 DX helper：只是 helper，不修改引擎抽象，不重复封装 Node/Scene/Material。
 * 计划书要求全部从统一入口 'cocosair' 导出（见 src/air/index.ts）。
 *  - loadAssetAsync:    resources.load 的 Promise 包装（+ V0.1 URL 兼容形态）
 *  - buildSkeletonTree: 由骨骼节点层级构建 Skeleton 资产（joints 路径 + bindposes）
 *  - restoreBindPose:   将骨骼复位到 bindposes 记录的静止姿势
 *  - frameObject:       调整相机取景以框住目标节点
 */

export { loadAssetAsync } from './load-asset';
export { buildSkeletonTree } from './skeleton-tree';
export { restoreBindPose } from './restore-bind-pose';
export { frameObject } from './frame-object';
