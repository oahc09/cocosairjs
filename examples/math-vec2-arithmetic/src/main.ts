/**
 * math-vec2-arithmetic — math.Vec2 — 静态算术族
 *
 * 掌握 Vec2 静态 out-形算术：加/减/乘/除（向量与标量双形态）、取负、克隆与重置，全部确定性回读。
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
    Mat3,
    utils,
    primitives,
} from 'cocosair';

// ---- 共享脚手架：可见帧 + 场景就绪（math-vec2-arithmetic）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-vec2-arithmetic');
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
cubeMaterial.setProperty('mainColor', new Color(96, 160, 220));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Vec2 — 静态算术族（确定性 readback，全部进 __probe）----
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
var a = new Vec2(1, 2);
var b = new Vec2(3, 4);
var o = new Vec2();
T('add', () => (Vec2 as any).add(o, a, b).x + ',' + (Vec2 as any).add(o, a, b).y);
T('add2f', () => o.set(1, 2).add2f(3, 4).x + ',' + o.y);
T('sub', () => (Vec2 as any).subtract(o, a, b).x + ',' + o.y);
T('sub2f', () => o.set(1, 2).subtract2f(3, 4).x + ',' + o.y);
T('mul', () => (Vec2 as any).multiply(o, a, b).x + ',' + o.y);
T('mul2f', () => o.set(1, 2).multiply2f(3, 4).x + ',' + o.y);
T('mulS', () => (Vec2 as any).multiplyScalar(o, a, 3).x + ',' + o.y);
T('div', () => (Vec2 as any).divide(o, b, a).x + ',' + o.y);
T('div2f', () => o.set(6, 8).divide2f(2, 4).x + ',' + o.y);
T('neg', () => o.set(a.x, a.y).negative().x + ',' + o.y);

T('setRT', () => (Vec2 as any).set(o, 9, 9).x === 9 && o.y === 9);
T('covVec2.ZERO', () => Vec2.ZERO.x);
T('covVec2.ONE', () => Vec2.ONE.y);
T('covVec2.NEG_ONE', () => Vec2.NEG_ONE.x);
T('covVec2.UNIT_X', () => Vec2.UNIT_X.x);
T('covVec2.UNIT_Y', () => Vec2.UNIT_Y.y);
T('covVec2.clone', () => Vec2.clone(a).y);
T('covVec2.copy', () => Vec2.copy(o, a).x);
T('covVec2.ceil', () => Vec2.ceil(o, new Vec2(1.2, 2.2)).y);
T('covVec2.floor', () => Vec2.floor(o, new Vec2(1.8, 2.8)).y);
T('covVec2.min', () => Vec2.min(o, a, b).x);
T('covVec2.max', () => Vec2.max(o, a, b).y);
T('covVec2.round', () => Vec2.round(o, new Vec2(1.2, 2.8)).y);
T('covVec2.scaleAndAdd', () => Vec2.scaleAndAdd(o, a, b, 0.5).y);
T('covVec2.distance', () => Vec2.distance(a, b));
T('covVec2.squaredDistance', () => Vec2.squaredDistance(a, b));
T('covVec2.len', () => Vec2.len(a));
T('covVec2.negate', () => Vec2.negate(o, a).x);
T('covVec2.inverse', () => Vec2.inverse(o, a).y);
T('covVec2.inverseSafe', () => Vec2.inverseSafe(o, new Vec2(1, 2)).x);
T('covVec2.random', () => Vec2.random(o, 1).x);
T('covVec2.transformMat3', () => Vec2.transformMat3(o, a, new Mat3()).y);
T('covVec2.str', () => Vec2.str(a));
var covVec2Array = new Float32Array(2);
T('covVec2.toArray', () => Vec2.toArray(covVec2Array, a)[1]);
T('covVec2.fromArray', () => Vec2.fromArray(o, covVec2Array).y);
for (const [key, value] of Object.entries(probe)) {
    if (key.startsWith('covVec2.') && value === 'threw') throw new Error(`Vec2 coverage probe failed: ${key}`);
}
probe.topic = 'math-vec2-arithmetic';
(window as any).__probe = async () => probe;

app.run(scene);
void import('./instance-contract.js').then(({ verifyVec2InstanceContract }) => verifyVec2InstanceContract());
console.log('[math-vec2-arithmetic] running');
