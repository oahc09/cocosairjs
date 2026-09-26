/**
 * mesh-torus — 圆环图元（primitives.torus）+ 倾斜自转
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
var scene = new Scene('mesh-torus');

function materialWith(color: Color): Material {
    var material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    return material;
}

class TiltedRotator extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(this.node.eulerAngles.x, this.node.eulerAngles.y + dt * 60, 12);
    }
}

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.4, 6.5));
cameraNode.lookAt(new Vec3(0, 0.4, 0));
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
var torus = new Node('torus');
torus.layer = Layers.Enum.DEFAULT;
scene.addChild(torus);
torus.setPosition(new Vec3(0, 0.4, 0));
var torusRenderer = torus.addComponent(MeshRenderer);
torusRenderer.mesh = utils.createMesh(primitives.torus(0.9, 0.3));
torusRenderer.material = materialWith(new Color(235, 125, 65, 255));
torus.addComponent(TiltedRotator);

app.run(scene);
console.log('[mesh-torus] running');
