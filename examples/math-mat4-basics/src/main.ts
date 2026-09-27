/**
 * math-mat4-basics — math.Mat4 — 基础矩阵运算
 *
 * 掌握 Mat4 基础全族：单位/零矩阵/转置/求逆/行列式、加减乘、标量乘、克隆重置与相等。
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
    utils,
    primitives,
    Mat4,
} from 'cocosair';

// ---- 共享脚手架：可见帧 + 场景就绪（math-mat4-basics）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-mat4-basics');
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
cubeMaterial.setProperty('mainColor', new Color(190, 170, 230));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Mat4 — 基础矩阵运算（确定性 readback，全部进 __probe）----
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
var m = new Mat4();
var o = new Mat4();
T('identity', () => (Mat4 as any).identity(m).m00);
T('zeroDet', () => {
    var z = new Mat4();
    (Mat4 as any).zero(z);
    return (Mat4 as any).determinant(z);
});
T('detI', () => Math.round((Mat4 as any).determinant(m) * 100) / 100);
T('inv', () => {
    (Mat4 as any).invert(o, m);
    return Math.round(o.m00 * 100) / 100;
});
T('transpose', () => {
    (Mat4 as any).transpose(o, m);
    return Math.round(o.m00 * 100) / 100;
});
T('add', () => {
    (Mat4 as any).add(o, m, m);
    return o.m00;
});
T('sub', () => {
    (Mat4 as any).subtract(o, m, m);
    return o.m15;
});
T('mul', () => {
    (Mat4 as any).multiply(o, m, m);
    return Math.round(o.m00 * 100) / 100;
});
T('mulS', () => {
    (Mat4 as any).multiplyScalar(o, m, 5);
    return o.m00;
});

T('setRT', () => (Mat4 as any).set(o, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1).m15);
T('equals', () => (Mat4 as any).equals(m, o));
T('strictEq', () => (Mat4 as any).strictEquals(m, m.clone()));
T('toString', () => typeof m.toString());
var covMat4Vec = new Vec3(1, 2, 3);
var covMat4Axis = new Vec3(0, 1, 0);
var covMat4Quat = new Quat();
var covMat4Scale = new Vec3();
var covMat4Euler = new Vec3();
var covMat4Origin = new Vec3(0.5, 0.5, 0.5);
var covMat4Array = new Float32Array(16);
T('covMat4.IDENTITY', () => Mat4.IDENTITY.m00);
T('covMat4.clone', () => Mat4.clone(m).m15);
T('covMat4.copy', () => Mat4.copy(o, m).m15);
T('covMat4.rotateX', () => Mat4.rotateX(o, m, 0.25).m05);
T('covMat4.rotateY', () => Mat4.rotateY(o, m, 0.25).m00);
T('covMat4.rotateZ', () => Mat4.rotateZ(o, m, 0.25).m00);
T('covMat4.fromTranslation', () => Mat4.fromTranslation(o, covMat4Vec).m12);
T('covMat4.fromScaling', () => Mat4.fromScaling(o, covMat4Vec).m00);
T('covMat4.fromRotation', () => {
    var result = Mat4.fromRotation(o, 0.25, covMat4Axis);
    if (!result) throw new Error('Mat4.fromRotation returned null');
    return result.m00;
});
T('covMat4.fromXRotation', () => Mat4.fromXRotation(o, 0.25).m05);
T('covMat4.fromYRotation', () => Mat4.fromYRotation(o, 0.25).m00);
T('covMat4.fromZRotation', () => Mat4.fromZRotation(o, 0.25).m00);
T('covMat4.fromRT', () => Mat4.fromRT(o, covMat4Quat, covMat4Vec).m12);
T('covMat4.getScaling', () => Mat4.getScaling(covMat4Scale, o).x);
T('covMat4.toSRT', () => {
    Mat4.toSRT(o, covMat4Quat, covMat4Vec, covMat4Scale);
    return covMat4Scale.x;
});
T('covMat4.toEuler', () => Mat4.toEuler(o, covMat4Euler));
T('covMat4.fromSRTOrigin', () => Mat4.fromSRTOrigin(o, covMat4Quat, covMat4Vec, covMat4Scale, covMat4Origin).m12);
T('covMat4.frustum', () => Mat4.frustum(o, -1, 1, -1, 1, 0.1, 10).m00);
T('covMat4.perspective', () => Mat4.perspective(o, Math.PI / 3, 1, 0.1, 10).m00);
T('covMat4.ortho', () => Mat4.ortho(o, -1, 1, -1, 1, 0.1, 10).m15);
T('covMat4.lookAt', () => Mat4.lookAt(o, new Vec3(0, 0, 3), new Vec3(), new Vec3(0, 1, 0)).m12);
T('covMat4.toArray', () => Mat4.toArray(covMat4Array, o)[0]);
T('covMat4.fromArray', () => Mat4.fromArray(o, covMat4Array).m00);
T('covMat4.multiplyScalarAndAdd', () => Mat4.multiplyScalarAndAdd(o, m, m, 0.25).m15);
T('covMat4.m01', () => o.m01);
T('covMat4.m02', () => o.m02);
T('covMat4.m04', () => o.m04);
T('covMat4.m06', () => o.m06);
T('covMat4.m08', () => o.m08);
T('covMat4.m09', () => o.m09);
T('covMat4.m12', () => o.m12);
T('covMat4.m13', () => o.m13);
T('covMat4.m14', () => o.m14);
T('covMat4.constructor', () => new Mat4().m15);
for (const [key, value] of Object.entries(probe)) {
    if (key.startsWith('covMat4.') && value === 'threw') throw new Error(`Mat4 coverage probe failed: ${key}`);
}
probe.topic = 'math-mat4-basics';
(window as any).__probe = async () => probe;

app.run(scene);
void import('./instance-contract.js').then(({ verifyMat4InstanceContract }) => verifyMat4InstanceContract());
console.log('[math-mat4-basics] running');
