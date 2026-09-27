/**
 * light-sphere — 经典"光照球"：单一平行光斜照球体，旋转观察明暗过渡。
 *
 * 演示：DirectionalLight 只由方向决定照明（与位置无关），球面呈现明确的明暗交界。
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
    SphereLight,
    Component,
    input,
    Input,
    Layers,
    Vec3,
    Color,
    Material,
    utils,
    primitives,
    frameObject,
} from 'cocosair';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('light-sphere');

function materialWith(color: Color): Material {
    var material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    return material;
}

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.6, 7.5));
cameraNode.setRotationFromEuler(-20, 0, 0);
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT;
camera.priority = 0;

// 平行光：斜上方 45°/-30° 照射（方向敏感，位置无关）
var lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
var light = lightNode.addComponent(DirectionalLight);
light.illuminance = 50000;

var shadingSphere = new Node('ShadingSphere');
shadingSphere.layer = Layers.Enum.DEFAULT;
scene.addChild(shadingSphere);
shadingSphere.setPosition(new Vec3(0, 0.8, 0));
var renderer = shadingSphere.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.sphere(1.1));
renderer.material = materialWith(new Color(230, 230, 235, 255));

class Spin extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 50, 0);
    }
}
shadingSphere.addComponent(Spin);
frameObject(camera, shadingSphere); // 相机取景：目标居中（§21 Expected Result）

app.run(scene);
const sphereProbe = { ready: false, ok: false, checks: [] as { name: string; ok: boolean; detail: string }[] };
(window as any).__trialProbe = sphereProbe;
requestAnimationFrame(async () => {
    const probeNode = new Node('SphereLightApiProbe');
    const sphere = probeNode.addComponent(SphereLight);
    sphere.enabled = false;
    const values: Record<string, unknown> = {
        SphereLight: typeof SphereLight,
        'SphereLight.constructor': typeof SphereLight.prototype.constructor,
        'SphereLight.luminousFlux': sphere.luminousFlux,
        'SphereLight.luminance': sphere.luminance,
        'SphereLight.term': sphere.term,
        'SphereLight.size': sphere.size,
        'SphereLight.range': sphere.range,
    };
    for (const [name, value] of Object.entries(values)) {
        const type = typeof value;
        const ok =
            value === null ||
            type === 'string' ||
            type === 'boolean' ||
            type === 'function' ||
            (type === 'number' && Number.isFinite(value)) ||
            type === 'object';
        sphereProbe.checks.push({ name, ok, detail: `${type}:${String(value)}` });
    }
    probeNode.destroy();
    sphereProbe.ok = sphereProbe.checks.every((check) => check.ok);
    sphereProbe.ready = true;
});
console.log('[light-sphere] running');
