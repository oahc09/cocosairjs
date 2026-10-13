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
 * Cocos AIR — Skeleton Tree Helper（V0.2 Task 3 / 计划书 §8）。
 *
 * 将已验证的 Skeleton.joints + Skeleton.bindposes 构建逻辑正式化为 helper。
 * 完全使用公开 Runtime 数据：不读取 Prefab、不依赖 Editor。
 *
 * 注意（L13 修复经验）：joints 是**相对 root 的路径**（getChildByPath 解析），
 * 层级骨骼必须写完整路径，如 'bone0/bone1'。
 */

import { Node } from '../../cocos/scene-graph/node';
import { Skeleton } from '../../cocos/3d/assets/skeleton';
import { Mat4 } from '../../cocos/core/math';

/**
 * @en Build a Skeleton asset (joints + bindposes) from a bone hierarchy.
 *     Bindpose = inverse(bone world matrix at capture time) → rest pose restorable.
 * @zh 从骨骼节点层级构建 Skeleton 资产。bindpose = inverse(骨骼当前世界矩阵)，
 *     静止姿势可由 restoreBindPose 还原。joints 为相对 root 的路径，顺序与 bindposes 一一对应。
 *
 * @example
 * ```ts
 * const skeleton = buildSkeletonTree(armature, ['bone0', 'bone0/bone1', 'bone0/bone1/bone2']);
 * ```
 */
export function buildSkeletonTree (root: Node, jointPaths: string[]): Skeleton {
    const skeleton = new Skeleton();
    skeleton.joints = jointPaths.slice();
    const bindposes: Mat4[] = [];
    for (const path of jointPaths) {
        const bone = root.getChildByPath(path);
        if (!bone) {
            throw new Error(`[cocosair] buildSkeletonTree: joint path '${path}' not found under '${root.name}'`);
        }
        bindposes.push(bone.worldMatrix.clone().invert());
    }
    skeleton.bindposes = bindposes;
    return skeleton;
}
