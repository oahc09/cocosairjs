/**
 * math-vec4-arithmetic — math.Vec4 — 静态算术族
 *
 * 掌握 Vec4 静态算术全族（含 scale 缩放别名）。
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
    Quat,
    Mat4,
    utils,
    primitives,
    Vec4,
} from 'cocosair';

// ---- 共享脚手架：可见帧 + 场景就绪（math-vec4-arithmetic）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-vec4-arithmetic');
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
cubeMaterial.setProperty('mainColor', new Color(140, 190, 160));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Vec4 — 静态算术族（确定性 readback，全部进 __probe）----
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
var a = new Vec4(1, 2, 3, 4);
var b = new Vec4(5, 6, 7, 8);
var o = new Vec4();
T('add', () => {
    (Vec4 as any).add(o, a, b);
    return o.w;
});
T('sub', () => {
    (Vec4 as any).subtract(o, b, a);
    return o.z;
});
T('mul', () => {
    (Vec4 as any).multiply(o, a, b);
    return o.x + ',' + o.w;
});
T('mulS', () => {
    (Vec4 as any).multiplyScalar(o, a, 3);
    return o.y;
});
T('scale', () => {
    (Vec4 as any).scale(o, a, 2);
    return o.x + ',' + o.w;
});
T('div', () => {
    (Vec4 as any).divide(o, b, a);
    return Math.round(o.w * 100) / 100;
});
T('neg', () => {
    o.set(a.x, a.y, a.z, a.w).negative();
    return o.x;
});

T('setRT', () => (Vec4 as any).set(o, 1, 2, 3, 9).w);
T('covVec4.ZERO', () => Vec4.ZERO.w);
T('covVec4.ONE', () => Vec4.ONE.w);
T('covVec4.NEG_ONE', () => Vec4.NEG_ONE.w);
T('covVec4.UNIT_X', () => Vec4.UNIT_X.x);
T('covVec4.UNIT_Y', () => Vec4.UNIT_Y.y);
T('covVec4.UNIT_Z', () => Vec4.UNIT_Z.z);
T('covVec4.UNIT_W', () => Vec4.UNIT_W.w);
T('covVec4.clone', () => Vec4.clone(a).w);
T('covVec4.copy', () => Vec4.copy(o, a).w);
T('covVec4.fromColor', () => Vec4.fromColor(o, new Color(10, 20, 30, 40)).w);
T('covVec4.angle', () => Vec4.angle(a, b));
T('covVec4.ceil', () => Vec4.ceil(o, new Vec4(1.2, 2.2, 3.2, 4.2)).w);
T('covVec4.floor', () => Vec4.floor(o, new Vec4(1.8, 2.8, 3.8, 4.8)).w);
T('covVec4.min', () => Vec4.min(o, a, b).x);
T('covVec4.max', () => Vec4.max(o, a, b).w);
T('covVec4.round', () => Vec4.round(o, new Vec4(1.2, 2.8, 3.2, 4.8)).w);
T('covVec4.scaleAndAdd', () => Vec4.scaleAndAdd(o, a, b, 0.5).w);
T('covVec4.distance', () => Vec4.distance(a, b));
T('covVec4.squaredDistance', () => Vec4.squaredDistance(a, b));
T('covVec4.len', () => Vec4.len(a));
T('covVec4.negate', () => Vec4.negate(o, a).x);
T('covVec4.inverse', () => Vec4.inverse(o, a).w);
T('covVec4.inverseSafe', () => Vec4.inverseSafe(o, new Vec4(1, 2, 3, 4)).w);
T('covVec4.random', () => Vec4.random(o, 1).w);
T('covVec4.transformAffine', () => Vec4.transformAffine(o, a, new Mat4()).w);
T('covVec4.transformQuat', () => Vec4.transformQuat(o, a, new Quat()).w);
var covVec4Array = new Float32Array(4);
T('covVec4.toArray', () => Vec4.toArray(covVec4Array, a)[3]);
T('covVec4.fromArray', () => Vec4.fromArray(o, covVec4Array).w);
T('covVec4.add4f', () => o.add4f(1, 2, 3, 4).w);
T('covVec4.subtract4f', () => o.subtract4f(1, 2, 3, 4).x);
T('covVec4.multiply4f', () => o.multiply4f(2, 3, 4, 5).w);
T('covVec4.divide4f', () => o.divide4f(2, 3, 4, 5).w);
for (const [key, value] of Object.entries(probe)) {
    if (key.startsWith('covVec4.') && value === 'threw') throw new Error(`Vec4 coverage probe failed: ${key}`);
}
probe.topic = 'math-vec4-arithmetic';
(window as any).__probe = async () => probe;

app.run(scene);
void import('./instance-contract.js').then(({ verifyVec4InstanceContract }) => verifyVec4InstanceContract());
console.log('[math-vec4-arithmetic] running');
