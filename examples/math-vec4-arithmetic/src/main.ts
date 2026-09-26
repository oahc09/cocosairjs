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
    (Vec4 as any).negative(o, a);
    return o.x;
});

T('setRT', () => (Vec4 as any).set(o, 1, 2, 3, 9).w);
probe.topic = 'math-vec4-arithmetic';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-vec4-arithmetic] running');
