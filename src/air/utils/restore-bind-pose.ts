/**
 * Cocos AIR — BindPose Restore Helper（V0.2 Task 3 / 计划书 §8）。
 *
 * 将骨骼复位到 skeleton.bindposes 记录的静止姿势。
 * 只使用公开 Runtime 数据（bindpose = inverse(world) → world = inverse(bindpose)，
 * 再换算为局部 SRT 设置节点），不读取 Prefab、不依赖 Editor。
 */

import { Node } from '../../cocos/scene-graph/node';
import { Skeleton } from '../../cocos/3d/assets/skeleton';
import { Mat4, Quat, Vec3 } from '../../cocos/core/math';

const m4_world = new Mat4();
const m4_parentInv = new Mat4();
const m4_local = new Mat4();
const q_rot = new Quat();
const v_pos = new Vec3();
const v_scale = new Vec3();

/**
 * @en Restore the bone hierarchy to the rest pose recorded in `skeleton.bindposes`.
 * @zh 将骨骼复位到 skeleton.bindposes 记录的静止姿势。
 *
 * 算法：world_i = inverse(bindpose_i)；local_i = inverse(parent.world) * world_i，
 * 分解为 SRT 后设置节点（父级有变换时依然正确）。
 *
 * @param root skinningRoot（joints 路径的解析起点，须与 buildSkeletonTree 一致）
 * @param skeleton buildSkeletonTree 构建或等效来源的 Skeleton 资产
 */
export function restoreBindPose (root: Node, skeleton: Skeleton): void {
    const joints = skeleton.joints;
    const bindposes = skeleton.bindposes;
    // Restore ancestors before descendants without reordering the skin's joint indices.
    const order = joints.map((path, index) => ({ index, depth: path.split('/').length }))
        .sort((a, b) => a.depth - b.depth);
    for (const { index: i } of order) {
        const bindpose = bindposes[i];
        if (!bindpose) { continue; }
        const node = root.getChildByPath(joints[i]);
        if (!node) { continue; }

        // world = inverse(bindpose)
        Mat4.invert(m4_world, bindpose);
        // local = inverse(parent.world) * world
        const parent = node.parent;
        if (parent) {
            Mat4.invert(m4_parentInv, parent.worldMatrix);
            Mat4.multiply(m4_local, m4_parentInv, m4_world);
        } else {
            Mat4.copy(m4_local, m4_world);
        }
        Mat4.toSRT(m4_local, q_rot, v_pos, v_scale);
        node.setPosition(v_pos);
        node.setRotation(q_rot);
        node.setScale(v_scale);
    }
}
