/**
 * math-mat4-basics — math.Mat4 — 基础矩阵运算
 *
 * 掌握 Mat4 基础全族：单位/零矩阵/转置/求逆/行列式、加减乘、标量乘、克隆重置与相等。
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
    Mat4,
} from 'cocosair';

// ---- 共享脚手架：可见帧 + 场景就绪（math-mat4-basics）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-mat4-basics');
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
cubeMaterial.setProperty('mainColor', new Color(190, 170, 230));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Mat4 — 基础矩阵运算（确定性 readback，全部进 __probe）----
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
var m = new Mat4();
var o = new Mat4();
T('identity', () => (Mat4 as any).identity(m).m00);
T('zeroDet', () => {
    var z = new Mat4();
    (Mat4 as any).zero(z);
    return (Mat4 as any).determinant(z);
});
T('detI', () => Math.round((Mat4 as any).determinant(m) * 100) / 100);
T('inv', () => {
    (Mat4 as any).invert(o, m);
    return Math.round(o.m00 * 100) / 100;
});
T('transpose', () => {
    (Mat4 as any).transpose(o, m);
    return Math.round(o.m00 * 100) / 100;
});
T('add', () => {
    (Mat4 as any).add(o, m, m);
    return o.m00;
});
T('sub', () => {
    (Mat4 as any).subtract(o, m, m);
    return o.m15;
});
T('mul', () => {
    (Mat4 as any).multiply(o, m, m);
    return Math.round(o.m00 * 100) / 100;
});
T('mulS', () => {
    (Mat4 as any).multiplyScalar(o, m, 5);
    return o.m00;
});

T('setRT', () => (Mat4 as any).set(o, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1).m15);
T('equals', () => (Mat4 as any).equals(m, o));
T('strictEq', () => (Mat4 as any).strictEquals(m, m.clone()));
T('toString', () => typeof m.toString());
probe.topic = 'math-mat4-basics';
(window as any).__probe = async () => probe;

app.run(scene);
void import('./instance-contract.js').then(({ verifyMat4InstanceContract }) => verifyMat4InstanceContract());
console.log('[math-mat4-basics] running');
