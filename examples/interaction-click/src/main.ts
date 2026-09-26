/**
 * interaction-click — Pointer 点击 → 状态变化（E010 interaction-click）。
 *
 * 每次点击：目标角 += 90°；方块以缓动方式在约 0.5s 内到达；
 * 真实输入链：input.on(Input.EventType.TOUCH_START)，不允许直接调 handler。
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
var scene = new Scene('interaction-click');

function materialWith(color: Color): Material {
    var material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    return material;
}

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.2, 6.5));
cameraNode.lookAt(new Vec3(0, 0.6, 0.4));
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

var cube = new Node('ClickableCube');
cube.layer = Layers.Enum.DEFAULT;
scene.addChild(cube);
cube.setPosition(new Vec3(0, 0.6, 0));
var renderer = cube.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1.6, height: 1.6, length: 1.6 }));
renderer.material = materialWith(new Color(95, 205, 120, 255));

// 非对称标记：让 90° 旋转在画面上可观察（纯色立方体 90° 自映射不可辨）
var marker = new Node('RotationMarker');
marker.layer = Layers.Enum.DEFAULT;
cube.addChild(marker);
marker.setPosition(new Vec3(0, 0, 0.82));
var markerRenderer = marker.addComponent(MeshRenderer);
markerRenderer.mesh = utils.createMesh(primitives.box({ width: 0.5, height: 0.5, length: 0.2 }));
markerRenderer.material = materialWith(new Color(230, 60, 60, 255));

var targetAngle = 0;
var clicks = 0;
class EaseToTarget extends Component {
    update(dt: number): void {
        var current = this.node.eulerAngles.y;
        var next = current + (targetAngle - current) * Math.min(1, dt * 10);
        if (Math.abs(targetAngle - next) < 0.5) {
            next = targetAngle;
        }
        this.node.setRotationFromEuler(0, next, 0);
    }
}
cube.addComponent(EaseToTarget);

input.on(Input.EventType.TOUCH_START, function () {
    targetAngle += 90;
    clicks++;
    render();
});

var panel2 = document.createElement('div');
panel2.style.cssText = 'position:fixed;left:10px;top:8px;color:#9cd;font:13px monospace';
document.body.appendChild(panel2);
function render() {
    panel2.textContent = 'clicks: ' + clicks + '  target: ' + targetAngle + '° — click canvas';
}
render();

(window as any).__clickState = function () {
    return { clicks: clicks, targetAngle: targetAngle, currentAngle: cube.eulerAngles.y };
};

app.run(scene);
console.log('[interaction-click] running');
