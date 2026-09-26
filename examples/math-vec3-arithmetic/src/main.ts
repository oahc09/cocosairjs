/**
 * math-vec3-arithmetic — math.Vec3 — 静态算术族
 *
 * 掌握 Vec3 静态 out-形算术全族（向量/标量双形态、取负、克隆、重置），与 Vec2 同构对照。
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
} from 'cocosair';

// ---- 共享脚手架：可见帧 + 场景就绪（math-vec3-arithmetic）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-vec3-arithmetic');
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
cubeMaterial.setProperty('mainColor', new Color(214, 148, 96));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Vec3 — 静态算术族（确定性 readback，全部进 __probe）----
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
var a = new Vec3(1, 2, 3);
var b = new Vec3(4, 5, 6);
var o = new Vec3();
T('add', () => {
    (Vec3 as any).add(o, a, b);
    return o.x + ',' + o.y + ',' + o.z;
});
T('add3f', () => {
    o.set(1, 2, 3).add3f(4, 5, 6);
    return o.z;
});
T('sub', () => {
    (Vec3 as any).subtract(o, b, a);
    return o.x + ',' + o.y + ',' + o.z;
});
T('sub3f', () => {
    o.set(4, 5, 6).subtract3f(1, 2, 3);
    return o.x;
});
T('mul', () => {
    (Vec3 as any).multiply(o, a, b);
    return o.x + ',' + o.z;
});
T('mul3f', () => {
    o.set(1, 2, 3).multiply3f(4, 5, 6);
    return o.y;
});
T('mulS', () => {
    (Vec3 as any).multiplyScalar(o, a, 2);
    return o.x + ',' + o.z;
});
T('div', () => {
    (Vec3 as any).divide(o, b, a);
    return Math.round(o.z * 100) / 100;
});
T('div3f', () => {
    o.set(8, 10, 12).divide3f(2, 5, 6);
    return o.x + ',' + o.y + ',' + o.z;
});
T('neg', () => {
    o.set(a.x, a.y, a.z).negative();
    return o.x + ',' + o.z;
});

T('setRT', () => (Vec3 as any).set(o, 7, 8, 9).z);
probe.topic = 'math-vec3-arithmetic';
(window as any).__probe = async () => probe;

app.run(scene);
void import('./instance-contract.js').then(({ verifyVec3InstanceContract }) => verifyVec3InstanceContract());
console.log('[math-vec3-arithmetic] running');
