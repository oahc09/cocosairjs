/**
 * light-point — PointLight 点光源与距离衰减（range/illuminance）。
 *
 * 演示：一个点光源悬停在三块板上，距离越远照度越低。
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
var scene = new Scene('light-point');

function materialWith(color: Color): Material {
    var material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    return material;
}

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.6, 7.5));
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

// 点光源：悬停在场景上方，range 控制衰减半径
var lightNode = new Node('PointLightNode');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 3.2, 0));
var pointLight = lightNode.addComponent(PointLight);
pointLight.luminance = 24000; // HDR 亮度，与相机曝光匹配。
pointLight.range = 8;

var Floor = new Node('Floor');
Floor.layer = Layers.Enum.DEFAULT;
scene.addChild(Floor);
Floor.setPosition(new Vec3(0, 0, 0));
var FloorRenderer = Floor.addComponent(MeshRenderer);
FloorRenderer.mesh = utils.createMesh(primitives.plane({ width: 10, length: 10, widthSegments: 1, lengthSegments: 1 }));
FloorRenderer.material = materialWith(new Color(80, 90, 110, 255));
var Left = new Node('Left');
Left.layer = Layers.Enum.DEFAULT;
scene.addChild(Left);
Left.setPosition(new Vec3(-2.2, 0.4, 0));
var LeftRenderer = Left.addComponent(MeshRenderer);
LeftRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 0.8, length: 1 }));
LeftRenderer.material = materialWith(new Color(65, 155, 235, 255));
var Center = new Node('Center');
Center.layer = Layers.Enum.DEFAULT;
scene.addChild(Center);
Center.setPosition(new Vec3(0, 0.4, 0));
var CenterRenderer = Center.addComponent(MeshRenderer);
CenterRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 0.8, length: 1 }));
CenterRenderer.material = materialWith(new Color(95, 205, 120, 255));
var Right = new Node('Right');
Right.layer = Layers.Enum.DEFAULT;
scene.addChild(Right);
Right.setPosition(new Vec3(2.2, 0.4, 0));
var RightRenderer = Right.addComponent(MeshRenderer);
RightRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 0.8, length: 1 }));
RightRenderer.material = materialWith(new Color(235, 125, 65, 255));

class Orbit extends Component {
    private t = 0;
    update(dt: number): void {
        this.t += dt;
        lightNode.setPosition(Math.sin(this.t * 0.8) * 2.2, 3.2, Math.cos(this.t * 0.8) * 2.2);
    }
}
lightNode.addComponent(Orbit);

app.run(scene);
const pointProbe = { ready: false, ok: false, checks: [] as { name: string; ok: boolean; detail: string }[] };
(window as any).__trialProbe = pointProbe;
requestAnimationFrame(() => {
    const values: Record<string, unknown> = {
        'PointLight.constructor': typeof PointLight.prototype.constructor,
        'PointLight.luminousFlux': pointLight.luminousFlux,
        'PointLight.luminance': pointLight.luminance,
        'PointLight.term': pointLight.term,
        'PointLight.range': pointLight.range,
    };
    for (const [name, value] of Object.entries(values)) {
        const type = typeof value;
        const ok =
            value === null ||
            type === 'string' ||
            type === 'boolean' ||
            type === 'function' ||
            (typeof value === 'number' && Number.isFinite(value)) ||
            type === 'object';
        pointProbe.checks.push({ name, ok, detail: `${type}:${String(value)}` });
    }
    pointProbe.ok = pointProbe.checks.every((check) => check.ok);
    pointProbe.ready = true;
});
console.log('[light-point] running');
