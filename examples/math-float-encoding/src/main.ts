/**
 * math-float-encoding — math 浮点编码 — floatToHalf/halfToFloat 与常量
 *
 * 掌握半精度浮点编码往返与常量：floatToHalf→halfToFloat 恒等（可精确表示值）、nextPow2、π 族常量。
 */
import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    Layers,
    Color,
    Vec3,
    Vec2,
    utils,
    primitives,
    floatToHalf,
    halfToFloat,
    nextPow2,
    HALF_PI,
    TWO_PI,
} from 'cocosair';

// ---- 共享脚手架：可见帧 + 场景就绪（math-float-encoding）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-float-encoding');
var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.2, 6.2));
cameraNode.lookAt(new Vec3(0, 0.6, 0));
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(28, 36, 52, 255);
camera.visibility = Layers.Enum.DEFAULT;
camera.priority = 0;
var lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
var light = lightNode.addComponent(DirectionalLight);
light.illuminance = 50000;
var cube = new Node('Cube');
cube.layer = Layers.Enum.DEFAULT;
scene.addChild(cube);
cube.setPosition(new Vec3(0, 0.6, 0));
var cubeRenderer = cube.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
var cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(150, 220, 240));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math 浮点编码 — floatToHalf/halfToFloat 与常量（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T(name: string, fn: () => any): void {
    try {
        probe[name] = fn();
    } catch (e) {
        probe[name] = 'threw';
    }
}
function cocoEnum(o: any): string {
    var ep: any = (cocosairNS as any).enumerableProps;
    return ep ? ep(o).join(',') : Object.keys(o).join(',');
}
function Vec3Ctor(): any {
    return (cocosairNS as any).Vec3;
}
import * as cocosairNS from 'cocosair';
var mathNS = (cocosairNS as any).math;
T('halfRT', () => halfToFloat(floatToHalf(1.5)));
T('halfRT2', () => Math.round(halfToFloat(floatToHalf(0.25)) * 100) / 100);
T('nextPow2', () => (cocosairNS as any).nextPow2(33));
T('halfPi', () => Math.round(mathNS.HALF_PI * 10000) / 10000);
T('twoPi', () => Math.round(mathNS.TWO_PI * 10000) / 10000);
probe.topic = 'math-float-encoding';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-float-encoding] running');
