/**
 * Cocos AIR Utilities（计划书 Phase 15 / §22）。
 *
 * 四个 DX helper：只是 helper，不修改引擎抽象，不重复封装 Node/Scene/Material。
 *  - loadAssetAsync: fetch + 引擎 deserialize 的运行时资产加载
 *  - buildSkeletonTree: 由骨骼节点层级构建 Skeleton 资产（joints + bindposes）
 *  - restoreBindPose: 将骨骼复位到 bindpose 记录的静止姿势
 *  - frameObject: 调整相机位置以框住目标节点
 */

import { Node } from '../../cocos/scene-graph/node';
import { Skeleton } from '../../cocos/3d/assets/skeleton';
import { Camera } from '../../cocos/misc/camera-component';
import { Mat4, Quat, Vec3 } from '../../cocos/core/math';
import { deserialize } from '../../cocos/serialization';

/**
 * @en Fetch a JSON/binary runtime asset and deserialize it with the engine serializer.
 * @zh 拉取运行时资产文件并用引擎反序列化器还原。
 */
export async function loadAssetAsync <T = unknown> (url: string): Promise<T> {
    const resp = await fetch(url);
    if (!resp.ok) {
        throw new Error(`[cocosair] loadAssetAsync failed: ${url} (${resp.status})`);
    }
    const text = await resp.text();
    try {
        return deserialize(text) as T;
    } catch (e) {
        // 非引擎序列化格式时按纯 JSON 返回
        return JSON.parse(text) as T;
    }
}

/**
 * @en Build a Skeleton asset (joints + bindposes) from a bone hierarchy.
 * @zh 从骨骼节点层级构建 Skeleton 资产。bindpose = inverse(骨骼初始世界矩阵)。
 *      骨骼顺序 = 先序遍历顺序，与 joints 路径一一对应。
 */
export function buildSkeletonTree (root: Node, boneNames: string[]): Skeleton {
    const skeleton = new Skeleton();
    skeleton.joints = boneNames.slice();
    const bindposes: Mat4[] = [];
    for (const name of boneNames) {
        const bone = root.getChildByName(name);
        if (!bone) {
            throw new Error(`[cocosair] buildSkeletonTree: bone '${name}' not found under '${root.name}'`);
        }
        bindposes.push(bone.worldMatrix.clone().invert());
    }
    skeleton.bindposes = bindposes;
    return skeleton;
}

/**
 * @en Reset bone nodes to the rest pose captured in `restPose` (world matrix per bone name).
 * @zh 将骨骼复位到 restPose 记录的静止姿势。
 */
export function restoreBindPose (restPose: Record<string, Mat4>): void {
    for (const name of Object.keys(restPose)) {
        const node = findNodeByPath(name);
        if (node) {
            const m = restPose[name];
            const q = new Quat();
            const pos = new Vec3();
            const scale = new Vec3();
            Mat4.toSRT(m, q, pos, scale);
            node.setPosition(pos);
            node.setRotation(q);
            node.setScale(scale);
        }
    }
}

import { director } from '../../cocos/game';
import { find } from '../../cocos/scene-graph';

function findNodeByPath (path: string): Node | null {
    const scene = director.getScene();
    return scene ? (find(path, scene) as Node | null) : null;
}

/**
 * @en Position a camera so that the target node is centered in view.
 * @zh 沿相机当前视线方向调整距离，使目标节点居中完整显示。
 */
export function frameObject (camera: Camera, target: Node, distance = 6): void {
    const camNode = camera.node;
    const wp = target.worldPosition;
    const dir = new Vec3();
    Vec3.subtract(dir, camNode.worldPosition, wp);
    if (dir.lengthSqr() < 1e-6) { dir.set(0, 0, 1); }
    dir.normalize();
    camNode.setPosition(wp.x + dir.x * distance, wp.y + dir.y * distance, wp.z + dir.z * distance);
    camNode.lookAt(wp);
}
