/**
 * camera-lookat — 手写 lookAt：由方向向量求欧拉角并瞄准目标；点击切换目标。
 *
 * 演示：相机默认朝 -Z；瞄准目标的欧拉角可由
 *   pitch = atan2(dy, len(dxz))，yaw = atan2(-dx, -dz)
 * 求出后经 setRotationFromEuler 施加。
 */

import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    DirectionalLight,
    Component,
    input,
    Input,
    Layers,
    Vec3,
    Color,
    Material,
    utils,
    primitives,
} from 'cocosair';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('camera-lookat');

function materialWith(color: Color): Material {
    var material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    return material;
}

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.5, 7));
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT;
camera.priority = 0;
var lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
var light = lightNode.addComponent(DirectionalLight);
light.illuminance = 50000;

var leftSphere = new Node('TargetLeft');
leftSphere.layer = Layers.Enum.DEFAULT;
scene.addChild(leftSphere);
leftSphere.setPosition(new Vec3(-3, 0.6, 0));
var leftRenderer = leftSphere.addComponent(MeshRenderer);
leftRenderer.mesh = utils.createMesh(primitives.sphere(0.7));
leftRenderer.material = materialWith(new Color(65, 155, 235, 255));

var rightSphere = new Node('TargetRight');
rightSphere.layer = Layers.Enum.DEFAULT;
scene.addChild(rightSphere);
rightSphere.setPosition(new Vec3(3, 0.6, 0));
var rightRenderer = rightSphere.addComponent(MeshRenderer);
rightRenderer.mesh = utils.createMesh(primitives.sphere(0.7));
rightRenderer.material = materialWith(new Color(235, 125, 65, 255));

// 手写 lookAt：由"相机→目标"方向向量求欧拉角（相机默认朝 -Z）
function aimAt(from: Vec3, to: Vec3): void {
    var dx = to.x - from.x,
        dy = to.y - from.y,
        dz = to.z - from.z;
    var pitch = (Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * 180) / Math.PI;
    var yaw = (Math.atan2(-dx, -dz) * 180) / Math.PI;
    cameraNode.setRotationFromEuler(pitch, yaw, 0);
}
var targets: Vec3[] = [leftSphere.position, rightSphere.position];
var current = 0;
aimAt(cameraNode.position, targets[current]);

var stateEl = document.createElement('div');
stateEl.style.cssText = 'position:fixed;left:12px;top:10px;color:#9cd;font:13px monospace';
document.body.appendChild(stateEl);
function render() {
    stateEl.textContent = 'aiming: ' + (current === 0 ? 'TargetLeft' : 'TargetRight') + ' — click to switch';
}
render();

input.on(Input.EventType.TOUCH_START, function () {
    current = 1 - current;
    aimAt(cameraNode.position, targets[current]);
    render();
});

app.run(scene);
console.log('[camera-lookat] running');
