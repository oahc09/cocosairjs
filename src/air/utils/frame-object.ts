/**
 * Cocos AIR — Camera Framing Helper（V0.2 Task 4 / 计划书 §9）。
 *
 * 沿相机当前视线调整距离，使目标节点居中并尽量充满视野。
 * 实现只依赖 Bounds / Transform / Camera 公开 API，不修改 Engine Camera。
 * 用途：Code First demo、Model preview、Agent prototype。
 */

import { Node } from '../../cocos/scene-graph/node';
import { Camera } from '../../cocos/misc/camera-component';
import { MeshRenderer } from '../../cocos/3d';
import { Vec3, geometry } from '../../cocos/core';

const DEFAULT_DISTANCE = 6;
const v3_dir = new Vec3();
const v3_center = new Vec3();
const aabb_local = geometry.AABB.create();
const aabb_world = geometry.AABB.create();

/**
 * @en Position the camera along its current view direction so the target node
 *     is centered and fits the view. Distance is estimated from the target's
 *     render bounds when available; otherwise `fallbackDistance` is used.
 * @zh 沿相机当前视线方向调整距离与朝向，使目标节点居中完整显示。
 *     距离优先按目标渲染包围盒估算（MeshRenderer.model.worldBounds 并集）；
 *     无可用包围盒时使用 fallbackDistance。
 *     取景考虑 fovAxis、视口宽高比及相机父节点的世界变换。
 *
 * @example
 * ```ts
 * frameObject(camera, modelRoot);        // 按包围盒自动取景
 * frameObject(camera, modelRoot, 8);     // 无包围盒时的回退距离
 * ```
 */
export function frameObject (camera: Camera, target: Node, fallbackDistance = DEFAULT_DISTANCE): void {
    const camNode = camera.node;
    const worldCenter = target.worldPosition;
    let distance = fallbackDistance;

    const bounds = collectWorldBounds(target);
    if (bounds) {
        const fov = (camera.fov > 0 ? camera.fov : 45) * Math.PI / 180;
        const radius = Math.max(bounds.halfExtents.lengthSqr() > 0 ? bounds.halfExtents.length() : 0, 1e-3);
        const rawAspect = camera.camera ? camera.camera.aspect : 1;
        const aspect = Number.isFinite(rawAspect) && rawAspect > 0 ? rawAspect : 1;
        const halfFov = Math.min(fov / 2, Math.PI / 2 - 1e-3);
        const otherHalfFov = Math.atan(Math.tan(halfFov)
            * (camera.fovAxis === Camera.FOVAxis.HORIZONTAL ? 1 / aspect : aspect));
        const fit = radius / Math.sin(Math.min(halfFov, otherHalfFov));
        if (camera.projection === Camera.ProjectionType.ORTHO) {
            // orthoHeight is a vertical half-height; moving the camera does not zoom.
            camera.orthoHeight = radius * 1.15 / Math.min(1, aspect);
        }
        distance = Math.max(fit * 1.15, 0.5);
        distance = Math.max(distance, camera.near + radius * 1.15);
        camera.far = Math.max(camera.far, distance + radius * 1.15);
        Vec3.copy(v3_center, bounds.center);
    } else {
        Vec3.copy(v3_center, worldCenter);
    }

    // 沿当前视线方向放置（视线 = 相机位置 - 目标中心）
    Vec3.subtract(v3_dir, camNode.worldPosition, v3_center);
    if (v3_dir.lengthSqr() < 1e-6) {
        v3_dir.set(0, 0, 1);
    }
    v3_dir.normalize();
    camNode.setWorldPosition(
        v3_center.x + v3_dir.x * distance,
        v3_center.y + v3_dir.y * distance,
        v3_center.z + v3_dir.z * distance,
    );
    camNode.lookAt(v3_center);
}

/**
 * 汇集 target 及其子孙所有 MeshRenderer 的世界包围盒并集（世界空间）。
 * model 尚未创建（场景激活前调用）时退回 Mesh 静态包围盒 × 节点世界矩阵。
 */
function collectWorldBounds (target: Node): geometry.AABB | null {
    let result: geometry.AABB | null = null;
    const renderers: MeshRenderer[] = [];
    const self = target.getComponent(MeshRenderer);
    if (self) { renderers.push(self); }
    const children = target.getComponentsInChildren(MeshRenderer);
    for (const r of children) { if (renderers.indexOf(r) === -1) { renderers.push(r); } }

    for (const r of renderers) {
        let b: geometry.AABB | null = null;
        if (r.model) {
            r.model.updateWorldBound();
            b = r.model.worldBounds;
        }
        // model 尚未随场景激活创建、或包围盒还没算出来（蒙皮网格在首帧前是空盒）时，
        // 退回 Mesh 静态包围盒 × 节点世界矩阵；直接跳过会静默降级成
        // fallbackDistance + 节点原点，而节点常放在地面处，主体中心就偏出画面了。
        const struct = r.mesh ? r.mesh.struct : null;
        if ((!b || b.halfExtents.lengthSqr() === 0) && struct && struct.minPosition && struct.maxPosition) {
            geometry.AABB.fromPoints(aabb_local, struct.minPosition, struct.maxPosition);
            geometry.AABB.transform(aabb_world, aabb_local, r.node.worldMatrix);
            b = aabb_world;
        }
        if (!b || b.halfExtents.lengthSqr() === 0) { continue; }
        if (!result) {
            result = b.clone();
        } else {
            geometry.AABB.merge(result, result, b);
        }
    }
    return result;
}
