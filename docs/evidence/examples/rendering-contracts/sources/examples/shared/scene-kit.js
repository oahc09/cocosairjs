/**
 * Cocos AIR — examples/shared（V0.2 Task 12 / 计划书 §20）
 *
 * 仅放 Demo 复用代码，不属于 Runtime API（计划书 §10/§26 的边界）。
 * 若某能力被多个 Example 重复使用并验证稳定，V0.3 再评估是否提升为 src/air 公共 helper。
 */

import { Node, Camera, DirectionalLight, Layers, Vec3, Color } from 'cocosair';

/**
 * 创建标准 Code First 相机（透视投影 + SOLID_COLOR 清屏）。
 * @param {Scene} scene
 * @param {object} [opts] position/rotationEuler/lookAt/fov/near/far/clearColor
 *   lookAt 给出主体中心世界坐标时优先使用：固定俯角只在特定机位/主体高度下才居中，
 *   主体落在地面之上（y=半高）会让画面整体偏上，对准中心才与视口宽高比无关。
 * @returns {Camera} 挂载在新建节点上的 Camera 组件
 */
export function setupCamera(
    scene,
    {
        position = [0, 2.4, 6.5],
        rotationEuler = [-20, 0, 0],
        lookAt = null,
        fov = 45,
        near = 0.1,
        far = 1000,
        clearColor = [30, 40, 60, 255],
    } = {},
) {
    const cameraNode = new Node('Main Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(new Vec3(position[0], position[1], position[2]));
    if (lookAt) {
        cameraNode.lookAt(new Vec3(lookAt[0], lookAt[1], lookAt[2]));
    } else {
        cameraNode.setRotationFromEuler(rotationEuler[0], rotationEuler[1], rotationEuler[2]);
    }
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.PERSPECTIVE;
    camera.fov = fov;
    camera.near = near;
    camera.far = far;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
    camera.visibility = Layers.Enum.DEFAULT;
    return camera;
}

/**
 * 创建标准平行光。
 * illuminance 使用默认 HDR 管线的 lux 量级（50000）；不要传入 LDR 强度 2。
 * @param {Scene} scene
 * @param {object} [opts] position/rotationEuler/illuminance
 * @returns {DirectionalLight}
 */
export function setupDirectionalLight(
    scene,
    { position = [0, 8, 0], rotationEuler = [-45, -30, 0], illuminance = 50000 } = {},
) {
    const lightNode = new Node('Main Light');
    scene.addChild(lightNode);
    lightNode.setPosition(new Vec3(position[0], position[1], position[2]));
    lightNode.setRotationFromEuler(rotationEuler[0], rotationEuler[1], rotationEuler[2]);
    const light = lightNode.addComponent(DirectionalLight);
    light.illuminance = illuminance;
    return light;
}
