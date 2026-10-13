/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
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
