/**
 * mesh-plane — 平面图元（primitives.plane）+ 旋转对齐 + 上方球体
 *
 * 纯 Code First：无 Creator、无 .scene。canvas id 必须为 'GameCanvas'（sys 按此查找画布）。
 */
import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    DirectionalLight,
    Component,
    Layers,
    Vec3,
    Color,
    Material,
    utils,
    primitives,
} from 'cocosair';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('mesh-plane');

function materialWith(color: Color): Material {
    var material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    return material;
}

class Rotator extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 40, 0);
    }
}

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.4, 6.5));
cameraNode.lookAt(new Vec3(0, 0.6, 0));
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
var floor = new Node('floor');
floor.layer = Layers.Enum.DEFAULT;
scene.addChild(floor);
floor.setPosition(new Vec3(0, 0, 0));
var floorRenderer = floor.addComponent(MeshRenderer);
floorRenderer.mesh = utils.createMesh(primitives.plane({ width: 6, length: 6, widthSegments: 1, lengthSegments: 1 }));
floorRenderer.material = materialWith(new Color(95, 205, 120, 255));
floor.setRotationFromEuler(0, 0, 0);
var marker = new Node('marker');
marker.layer = Layers.Enum.DEFAULT;
scene.addChild(marker);
marker.setPosition(new Vec3(0, 1.2, 0));
var markerRenderer = marker.addComponent(MeshRenderer);
markerRenderer.mesh = utils.createMesh(primitives.sphere(0.5));
markerRenderer.material = materialWith(new Color(235, 205, 75, 255));
marker.addComponent(Rotator);

app.run(scene);
console.log('[mesh-plane] running');
