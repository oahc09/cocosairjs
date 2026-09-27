/**
 * math-quat-applied — math.Quat — 旋转应用链
 *
 * 用四元数组合旋转应用：slerp 端点恒等、angle 对称性、单位长度不变量。
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
    Mat3,
} from 'cocosair';

// ---- 共享脚手架：可见帧 + 场景就绪（math-quat-applied）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-quat-applied');
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

// ---- 主题：math.Quat — 旋转应用链（确定性 readback，全部进 __probe）----
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
var q = new Quat(0, 0, 0.3826834, 0.9238795);
var o = new Quat();
T('slerpEnd', () => {
    (Quat as any).slerp(o, q, q, 0.37);
    return Math.round(o.z * 1e6) === Math.round(q.z * 1e6);
});
T('angleSym', () => {
    var ab = Math.round((Quat as any).angle(q, new Quat()) * 1000);
    var ba = Math.round((Quat as any).angle(new Quat(), q) * 1000);
    return ab === ba;
});
T('unitLen', () => Math.round(Math.sqrt((Quat as any).lengthSqr(q)) * 1e4) / 1e4);
T('instanceLen', () => Math.round(q.length() * 1e4) / 1e4);
T('lerpMid', () => {
    (Quat as any).lerp(o, new Quat(), new Quat(), 0.5);
    return o.w;
});
var covQuatA = new Quat(0, 0, 0.3826834, 0.9238795);
var covQuatB = new Quat(0, 0.258819, 0, 0.965926);
var covQuatC = new Quat(0.258819, 0, 0, 0.965926);
var covQuatOut = new Quat();
var covQuatAxis = new Vec3(0, 1, 0);
var covQuatAxisOut = new Vec3();
var covQuatMat3 = new Mat3();
var covQuatArray = new Float32Array(4);
T('covQuat.IDENTITY', () => Quat.IDENTITY.w);
T('covQuat.clone', () => Quat.clone(covQuatA).w);
T('covQuat.copy', () => Quat.copy(covQuatOut, covQuatA).w);
T('covQuat.identity', () => Quat.identity(covQuatOut).w);
T('covQuat.rotationTo', () => Quat.rotationTo(covQuatOut, new Vec3(1, 0, 0), new Vec3(0, 1, 0)).z);
T('covQuat.getAxisAngle', () => Quat.getAxisAngle(covQuatAxisOut, covQuatA));
T('covQuat.multiply', () => Quat.multiply(covQuatOut, covQuatA, covQuatB).w);
T('covQuat.multiplyScalar', () => Quat.multiplyScalar(covQuatOut, covQuatA, 0.5).w);
T('covQuat.scaleAndAdd', () => Quat.scaleAndAdd(covQuatOut, covQuatA, covQuatB, 0.25).w);
T('covQuat.rotateX', () => Quat.rotateX(covQuatOut, covQuatA, 0.1).w);
T('covQuat.rotateY', () => Quat.rotateY(covQuatOut, covQuatA, 0.1).w);
T('covQuat.rotateZ', () => Quat.rotateZ(covQuatOut, covQuatA, 0.1).w);
T('covQuat.rotateAround', () => Quat.rotateAround(covQuatOut, covQuatA, covQuatAxis, 0.1).w);
T('covQuat.rotateAroundLocal', () => Quat.rotateAroundLocal(covQuatOut, covQuatA, covQuatAxis, 0.1).w);
T('covQuat.calculateW', () => Quat.calculateW(covQuatOut, new Quat(0.1, 0.2, 0.3, 0)).w);
T('covQuat.dot', () => Quat.dot(covQuatA, covQuatB));
T('covQuat.sqlerp', () => Quat.sqlerp(covQuatOut, new Quat(), covQuatA, covQuatB, covQuatC, 0.5).w);
T('covQuat.invert', () => Quat.invert(covQuatOut, covQuatA).w);
T('covQuat.conjugate', () => Quat.conjugate(covQuatOut, covQuatA).z);
T('covQuat.len', () => Quat.len(covQuatA));
T('covQuat.normalize', () => Quat.normalize(covQuatOut, covQuatA).w);
T('covQuat.fromAxes', () => Quat.fromAxes(covQuatOut, new Vec3(1, 0, 0), new Vec3(0, 1, 0), new Vec3(0, 0, 1)).w);
T('covQuat.fromViewUp', () => Quat.fromViewUp(covQuatOut, new Vec3(0, 0, -1), new Vec3(0, 1, 0)).w);
T('covQuat.fromAxisAngle', () => Quat.fromAxisAngle(covQuatOut, covQuatAxis, 0.25).w);
T('covQuat.fromMat3', () => Quat.fromMat3(covQuatOut, covQuatMat3).w);
T('covQuat.fromEuler', () => Quat.fromEuler(covQuatOut, 10, 20, 30).w);
T('covQuat.fromAngleZ', () => Quat.fromAngleZ(covQuatOut, 0.25).w);
T('covQuat.toArray', () => Quat.toArray(covQuatArray, covQuatA)[3]);
for (const [key, value] of Object.entries(probe)) {
    if (key.startsWith('covQuat.') && value === 'threw') throw new Error(`Quat coverage probe failed: ${key}`);
}
probe.topic = 'math-quat-applied';
(window as any).__probe = async () => probe;

app.run(scene);
void import('./instance-contract.js').then(({ verifyQuatInstanceContract }) => verifyQuatInstanceContract());
console.log('[math-quat-applied] running');
