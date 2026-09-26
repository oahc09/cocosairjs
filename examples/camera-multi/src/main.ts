/**
 * camera-multi — 多相机叠加：visibility 层级过滤 + priority 渲染次序 + DEPTH_ONLY 叠加。
 *
 * 演示：
 *  - BaseCamera（priority 0）：渲染 DEFAULT 层（蓝球 + 地面）；
 *  - OverlayCamera（priority 1）：只渲染 UI_2D 层的橙球，DEPTH_ONLY 保留颜色缓冲叠加其上
 *    （官方语义："只清理深度…常用于 UI 相机"）。
 */

import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    DirectionalLight,
    Layers,
    Vec3,
    Color,
    Material,
    utils,
    primitives,
} from 'cocosair';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('camera-multi');

function materialWith(color: Color): Material {
    var material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    return material;
}

var lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
var light = lightNode.addComponent(DirectionalLight);
light.illuminance = 50000;

// 地面 + 蓝球：DEFAULT 层（仅 BaseCamera 可见）
var floor = new Node('Floor');
floor.layer = Layers.Enum.DEFAULT;
scene.addChild(floor);
floor.setPosition(new Vec3(0, 0, 0));
var floorRenderer = floor.addComponent(MeshRenderer);
floorRenderer.mesh = utils.createMesh(primitives.plane({ width: 12, length: 12, widthSegments: 1, lengthSegments: 1 }));
floorRenderer.material = materialWith(new Color(80, 90, 110, 255));

var blueSphere = new Node('BlueSphere');
blueSphere.layer = Layers.Enum.DEFAULT;
scene.addChild(blueSphere);
blueSphere.setPosition(new Vec3(-1.2, 0.6, 0));
var blueRenderer = blueSphere.addComponent(MeshRenderer);
blueRenderer.mesh = utils.createMesh(primitives.sphere(0.8));
blueRenderer.material = materialWith(new Color(65, 155, 235, 255));

// 橙球：UI_2D 层（仅 OverlayCamera 可见，叠加渲染）
var orangeSphere = new Node('OrangeSphere');
orangeSphere.layer = Layers.Enum.UI_2D;
scene.addChild(orangeSphere);
orangeSphere.setPosition(new Vec3(1.4, 0.6, 0));
var orangeRenderer = orangeSphere.addComponent(MeshRenderer);
orangeRenderer.mesh = utils.createMesh(primitives.sphere(0.8));
orangeRenderer.material = materialWith(new Color(235, 125, 65, 255));

// 相机 A：DEFAULT 层全场景
var baseCamNode = new Node('BaseCamera');
scene.addChild(baseCamNode);
baseCamNode.setPosition(new Vec3(0, 2.2, 6.5));
baseCamNode.lookAt(new Vec3(0.1, 0.6, 0));
var baseCamera = baseCamNode.addComponent(Camera);
baseCamera.projection = Camera.ProjectionType.PERSPECTIVE;
baseCamera.fov = 45;
baseCamera.near = 0.1;
baseCamera.far = 1000;
baseCamera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
baseCamera.clearColor = new Color(30, 40, 60, 255);
baseCamera.visibility = Layers.makeMaskInclude([Layers.Enum.DEFAULT]);
baseCamera.priority = 0;

// 相机 B：只渲染 UI_2D 层；DEPTH_ONLY 保留 A 的颜色输出，实现叠加
var overlayCamNode = new Node('OverlayCamera');
scene.addChild(overlayCamNode);
overlayCamNode.setPosition(new Vec3(0, 2.2, 6.5));
overlayCamNode.lookAt(new Vec3(0.1, 0.6, 0));
var overlayCamera = overlayCamNode.addComponent(Camera);
overlayCamera.projection = Camera.ProjectionType.PERSPECTIVE;
overlayCamera.fov = 45;
overlayCamera.near = 0.1;
overlayCamera.far = 1000;
overlayCamera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
overlayCamera.visibility = Layers.makeMaskInclude([Layers.Enum.UI_2D]);
overlayCamera.priority = 1;

app.run(scene);
console.log('[camera-multi] running — visibility(DEFAULT|UI_2D) + priority 0/1 + DEPTH_ONLY overlay');
