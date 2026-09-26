/**
 * light-spot — SpotLight 聚光灯（size/range/angleAttenuationStrength）。
 *
 * 演示：聚光灯从上方向地板投射光锥，中央亮斑边界清晰。
 */
import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    DirectionalLight,
    PointLight,
    SpotLight,
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
var scene = new Scene('light-spot');

function materialWith(color: Color): Material {
    var material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    return material;
}

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.6, 7.5));
cameraNode.lookAt(new Vec3(0, 0.5, 0));
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT;
camera.priority = 0;

// 聚光灯：垂直向下照射地板
var lightNode = new Node('SpotLightNode');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 4.5, 0));
lightNode.setRotationFromEuler(-90, 0, 0);
var spot = lightNode.addComponent(SpotLight);
spot.luminance = 24000; // HDR 亮度，与相机曝光匹配。
spot.range = 12;
spot.size = 0.15;

var Floor = new Node('Floor');
Floor.layer = Layers.Enum.DEFAULT;
scene.addChild(Floor);
Floor.setPosition(new Vec3(0, 0, 0));
var FloorRenderer = Floor.addComponent(MeshRenderer);
FloorRenderer.mesh = utils.createMesh(primitives.plane({ width: 10, length: 10, widthSegments: 1, lengthSegments: 1 }));
FloorRenderer.material = materialWith(new Color(80, 90, 110, 255));
var Pedestal = new Node('Pedestal');
Pedestal.layer = Layers.Enum.DEFAULT;
scene.addChild(Pedestal);
Pedestal.setPosition(new Vec3(0, 0.5, 0));
var PedestalRenderer = Pedestal.addComponent(MeshRenderer);
PedestalRenderer.mesh = utils.createMesh(primitives.box({ width: 1.2, height: 1, length: 1.2 }));
PedestalRenderer.material = materialWith(new Color(205, 90, 190, 255));

class Sweep extends Component {
    private t = 0;
    update(dt: number): void {
        this.t += dt;
        lightNode.setPosition(Math.sin(this.t * 0.6) * 1.5, 4.5, Math.cos(this.t * 0.6) * 1.5);
    }
}
lightNode.addComponent(Sweep);

app.run(scene);
console.log('[light-spot] running');
