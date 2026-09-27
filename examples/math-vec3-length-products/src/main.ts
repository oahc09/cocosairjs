/**
 * math-vec3-length-products — math.Vec3 — 点积/叉积/长度/距离/夹角
 *
 * 掌握 Vec3 度量族：点积/叉积、两种长度命名、归一化、欧氏与平方距离、向量夹角。
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
import { installVec3CoreProbe } from './vec3-core-contract.js';

// ---- 共享脚手架：可见帧 + 场景就绪（math-vec3-length-products）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-vec3-length-products');
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
cubeMaterial.setProperty('mainColor', new Color(220, 160, 100));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Vec3 — 点积/叉积/长度/距离/夹角（确定性 readback，全部进 __probe）----
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
var x = new Vec3(1, 0, 0);
var y = new Vec3(0, 1, 0);
var p = new Vec3(1, 2, 3);
var q = new Vec3(4, 6, 8);
var o = new Vec3();
T('dot', () => (Vec3 as any).dot(x, y));
T('cross', () => {
    (Vec3 as any).cross(o, x, y);
    return o.x + ',' + o.y + ',' + o.z;
});
T('len', () => Math.round((Vec3 as any).len(new Vec3(3, 4, 0)) * 100) / 100);
T('length', () => Math.round((Vec3 as any).length(new Vec3(0, 0, 5)) * 100) / 100);
T('lenSqr', () => (Vec3 as any).lengthSqr(p));
T('dist', () => Math.round((Vec3 as any).distance(p, q) * 100) / 100);
T('distSqr', () => (Vec3 as any).squaredDistance(p, q));
T('norm', () => {
    (Vec3 as any).normalize(o, q);
    return Math.round((Vec3 as any).length(o) * 1000) / 1000;
});
T('angle', () => Math.round((Vec3 as any).angle(x, y) * 100) / 100);
probe.topic = 'math-vec3-length-products';
(window as any).__probe = async () => probe;

app.run(scene);
installVec3CoreProbe();
console.log('[math-vec3-length-products] running');
