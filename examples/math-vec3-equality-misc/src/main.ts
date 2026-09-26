/**
 * math-vec3-equality-misc — math.Vec3 — 相等/插值/变换/降维
 *
 * 掌握 Vec3 相等语义、lerp/clampf、Mat4 变换、降维 toVec2 与三分量读写。
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

// ---- 共享脚手架：可见帧 + 场景就绪（math-vec3-equality-misc）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-vec3-equality-misc');
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
cubeMaterial.setProperty('mainColor', new Color(230, 170, 110));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Vec3 — 相等/插值/变换/降维（确定性 readback，全部进 __probe）----
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
var a = new Vec3(1.0000001, 2, 3);
var b = new Vec3(1, 2, 3);
var o = new Vec3();
var m = new Mat4();
T('equals', () => (Vec3 as any).equals(a, b));
T('equals3f', () => a.equals3f(1, 2, 3));
T('strictEq', () => (Vec3 as any).strictEquals(a, b));
T('strictEq3f', () => b.strictEquals3f(1, 2, 3));
T('toString', () => typeof b.toString());
T('lerp', () => {
    (Vec3 as any).lerp(o, new Vec3(0, 0, 0), new Vec3(10, 20, 30), 0.5);
    return o.x + ',' + o.z;
});
T('clampf', () => {
    o.set(2, -1, 3).clampf(new Vec3(0, 0, 0), new Vec3(1, 1, 1));
    return o.x === 1 && o.y === 0 && o.z === 1;
});
T('xform', () => {
    (Mat4 as any).identity(m);
    m.m12 = 2;
    m.m13 = 3;
    m.m14 = 4;
    (Vec3 as any).transformMat4(o, b, m);
    return o.x + ',' + o.y + ',' + o.z;
});
T('toVec2', () => {
    var v2 = b.toVec2();
    return v2.x + ',' + v2.y;
});
a.x = 4;
a.y = 5;
a.z = 6;
T('xyz', () => a.x + ',' + a.y + ',' + a.z);
probe.topic = 'math-vec3-equality-misc';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-vec3-equality-misc] running');
