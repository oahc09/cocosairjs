/**
 * math-vec2-equality-misc — math.Vec2 — 相等/插值/变换与分量
 *
 * 掌握 Vec2 的相等语义（数值近似 vs 严格）、lerp/clampf、经 Mat4 变换、升维 toVec3 与分量读写。
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

// ---- 共享脚手架：可见帧 + 场景就绪（math-vec2-equality-misc）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-vec2-equality-misc');
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
cubeMaterial.setProperty('mainColor', new Color(120, 180, 200));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Vec2 — 相等/插值/变换与分量（确定性 readback，全部进 __probe）----
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
var a = new Vec2(1.0000001, 2);
var b = new Vec2(1, 2);
var o = new Vec2();
var m = new Mat4();
T('equals', () => (Vec2 as any).equals(a, b));
T('equals2f', () => a.equals2f(1, 2));
T('strictEq', () => (Vec2 as any).strictEquals(a, b));
T('strictEq2f', () => b.strictEquals2f(1, 2));
T('toString', () => typeof a.toString());
T('lerp', () => {
    (Vec2 as any).lerp(o, new Vec2(0, 0), new Vec2(10, 10), 0.5);
    return o.x + ',' + o.y;
});
T('clampf', () => {
    o.set(2, -1).clampf(new Vec2(0, 0), new Vec2(1, 1));
    return o.x === 1 && o.y === 0;
});
T('xform', () => {
    (Mat4 as any).identity(m);
    m.m12 = 5;
    m.m13 = 6;
    (Vec2 as any).transformMat4(o, b, m);
    return Math.round(o.x * 10) + ',' + Math.round(o.y * 10);
});
a.x = 7;
a.y = 8;
T('xy', () => a.x + ',' + a.y);
probe.topic = 'math-vec2-equality-misc';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-vec2-equality-misc] running');
