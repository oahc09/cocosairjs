/**
 * math-mat4-compose — math.Mat4 — RTS 分解合成与四元数来源
 *
 * 掌握 Mat4 与旋转-平移-缩放的双向：fromRTS/fromSRT/fromQuat 合成，getTranslation/getScale/getRotation 分解往返。
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
    Quat,
} from 'cocosair';

// ---- 共享脚手架：可见帧 + 场景就绪（math-mat4-compose）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-mat4-compose');
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
cubeMaterial.setProperty('mainColor', new Color(200, 180, 240));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Mat4 — RTS 分解合成与四元数来源（确定性 readback，全部进 __probe）----
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
var o = new Mat4();
var q = new Quat();
var t = new Vec3(1, 2, 3);
var s = new Vec3(2, 2, 2);
var outT = new Vec3();
var outS = new Vec3();
var outQ = new Quat();
T('fromRTS', () => {
    (Mat4 as any).fromRTS(o, q, t, s);
    return o.m12 + ',' + o.m13 + ',' + o.m14;
});
T('getT', () => {
    (Mat4 as any).getTranslation(outT, o);
    return outT.x + ',' + outT.z;
});
T('getS', () => {
    (Mat4 as any).getScale(outS, o);
    return outS.x;
});
T('getR', () => {
    (Mat4 as any).getRotation(outQ, o);
    return Math.round(outQ.w * 1000) / 1000;
});
T('fromSRT', () => {
    var m2 = new Mat4();
    (Mat4 as any).fromSRT(m2, s, q, t);
    return m2.m12;
});
T('fromQuat', () => {
    var m3 = new Mat4();
    (Mat4 as any).fromQuat(m3, q);
    return Math.round(m3.m00 * 100) / 100;
});
probe.topic = 'math-mat4-compose';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-mat4-compose] running');
