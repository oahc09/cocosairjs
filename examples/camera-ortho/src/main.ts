/**
 * camera-ortho — 透视/正交投影切换（ProjectionType + orthoHeight）。
 *
 * 演示：同一立方体在 PERSPECTIVE 与 ORTHO 下的不同观感；
 * 正交模式用 orthoHeight 控制取景高度，无近大远小。
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
var scene = new Scene('camera-ortho');

function materialWith(color: Color): Material {
    var material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    return material;
}

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.2, 6.5));
cameraNode.lookAt(new Vec3(0, 0.5, -2));
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.orthoHeight = 2.2;
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

// 排成深度一行的一组方块：透视下近大远小，正交下等大
for (var i = 0; i < 3; i++) {
    var cube = new Node('DepthCube-' + i);
    cube.layer = Layers.Enum.DEFAULT;
    scene.addChild(cube);
    cube.setPosition(new Vec3(0, 0.5, -i * 2));
    var renderer = cube.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
    renderer.material = materialWith(new Color(95, 205, 120, 255 - i * 40));
}

var stateEl = document.createElement('div');
stateEl.style.cssText = 'position:fixed;left:12px;top:10px;color:#9cd;font:13px monospace';
document.body.appendChild(stateEl);
function render() {
    stateEl.textContent =
        'projection: ' +
        (camera.projection === Camera.ProjectionType.ORTHO ? 'ORTHO (orthoHeight=2.2)' : 'PERSPECTIVE (fov=45)') +
        ' — click to toggle';
}
render();

input.on(Input.EventType.TOUCH_START, function () {
    camera.projection =
        camera.projection === Camera.ProjectionType.ORTHO
            ? Camera.ProjectionType.PERSPECTIVE
            : Camera.ProjectionType.ORTHO;
    (window as any).__projection = camera.projection === Camera.ProjectionType.ORTHO ? 'ORTHO' : 'PERSPECTIVE';
    render();
});

app.run(scene);
console.log('[camera-ortho] running');
