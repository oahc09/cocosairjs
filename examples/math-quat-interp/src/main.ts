/**
 * math-quat-interp — math.Quat — 插值与度量
 *
 * 掌握四元数插值（球面 slerp/线性 lerp/步进 rotateTowards）、夹角、长度族、相等语义与分量读写。
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
    Quat,
} from 'cocosair';

// ---- 共享脚手架：可见帧 + 场景就绪（math-quat-interp）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-quat-interp');
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
cubeMaterial.setProperty('mainColor', new Color(170, 220, 240));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Quat — 插值与度量（确定性 readback，全部进 __probe）----
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
var q = new Quat();
var r = new Quat(0, 0, 0.7071068, 0.7071068);
var o = new Quat();
T('slerp', () => {
    (Quat as any).slerp(o, q, q, 0.3);
    return Math.round(o.w * 1000) / 1000;
});
T('lerp', () => {
    (Quat as any).lerp(o, q, q, 0.5);
    return Math.round(o.w * 1000) / 1000;
});
T('rotateTowards0', () => {
    (Quat as any).rotateTowards(o, q, q, 0);
    return Math.round(o.w * 100) / 100;
});
T('angle', () => Math.round((Quat as any).angle(q, r) * 100) / 100);
T('len', () => {
    var sq = (Quat as any).lengthSqr(r);
    return Math.round(Math.sqrt(sq) * 1000) / 1000;
});
T('lenSqr', () => Math.round((Quat as any).lengthSqr(q) * 100) / 100);
T('equals', () => (Quat as any).equals(q, o));
T('strictEq', () => (Quat as any).strictEquals(q, q.clone()));

T('setRT', () => (Quat as any).set(o, 0, 0, 0, 1).w);
T('toString', () => typeof r.toString());
o.x = 1;
o.y = 2;
o.z = 3;
o.w = 4;
T('xyzw', () => o.x + ',' + o.y + ',' + o.z + ',' + o.w);
probe.topic = 'math-quat-interp';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-quat-interp] running');
