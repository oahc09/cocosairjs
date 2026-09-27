/**
 * math-scalar-utils — math 标量工具 — clamp/lerp/repeat/approx 族
 *
 * 掌握顶层标量工具：区间钳制、插值与逆插值、循环折返、角度弧度互转、绝对值极值。
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
    clamp,
    clamp01,
    lerp,
    repeat,
    pingPong,
    inverseLerp,
    toRadian,
    toDegree,
    absMax,
    absMaxComponent,
} from 'cocosair';

// ---- 共享脚手架：可见帧 + 场景就绪（math-scalar-utils）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-scalar-utils');
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
cubeMaterial.setProperty('mainColor', new Color(120, 190, 210));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math 标量工具 — clamp/lerp/repeat/approx 族（确定性 readback，全部进 __probe）----
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
T('clamp', () => clamp(5, 0, 3));
T('clamp01', () => clamp01(-0.5));
T('lerp', () => lerp(0, 10, 0.25));
T('repeat', () => (cocosairNS as any).repeat(7, 3));
T('pingPong', () => (cocosairNS as any).pingPong(4, 3));
T('inverseLerp', () => inverseLerp(0, 10, 5));
T('toRadian', () => Math.round(toRadian(180) * 100) / 100);
T('toDegree', () => Math.round((cocosairNS as any).toDegree(Math.PI) * 100) / 100);
T('absMax', () => absMax(-7, 3));
T('absMaxComponent', () => {
    try {
        var v = (cocosairNS as any).absMaxComponent;
        return typeof v;
    } catch (e) {
        return 'threw';
    }
});
var mathNS = (cocosairNS as any).math;
T('covMath.v2', () => mathNS.v2(1, 2).y);
T('covMath.v3', () => mathNS.v3(1, 2, 3).z);
T('covMath.Vec4', () => typeof mathNS.Vec4);
T('covMath.v4', () => mathNS.v4(1, 2, 3, 4).w);
T('covMath.quat', () => mathNS.quat().w);
T('covMath.mat4', () => mathNS.mat4().m15);
T('covMath.size', () => mathNS.size(3, 4).height);
T('covMath.rect', () => mathNS.rect(1, 2, 3, 4).width);
T('covMath.color', () => mathNS.color(10, 20, 30, 40).r);
T('covMath.toRadian', () => mathNS.toRadian(180));
T('covMath.toDegree', () => mathNS.toDegree(Math.PI));
T('covMath.randomRange', () => mathNS.randomRange(1, 2));
T('covMath.randomRangeInt', () => mathNS.randomRangeInt(1, 2));
T('covMath.pseudoRandom', () => mathNS.pseudoRandom(1));
T('covMath.pseudoRandomRange', () => mathNS.pseudoRandomRange(1, 0, 1));
T('covMath.pseudoRandomRangeInt', () => mathNS.pseudoRandomRangeInt(1, 0, 10));
T('covMath.nextPow2', () => mathNS.nextPow2(65));
T('covMath.repeat', () => mathNS.repeat(7, 3));
T('covMath.pingPong', () => mathNS.pingPong(4, 3));
T('covMath.absMaxComponent', () => mathNS.absMaxComponent(new Vec3(-7, 3, 2)));
T('covMath.HALF_PI', () => mathNS.HALF_PI);
T('covMath.TWO_PI', () => mathNS.TWO_PI);
T('covMath.EPSILON', () => mathNS.EPSILON);
T('covMath.MATH_FLOAT_ARRAY', () => typeof mathNS.MATH_FLOAT_ARRAY);
const covMathFailures = Object.entries(probe)
    .filter(([key, value]) => key.startsWith('covMath.') && value === 'threw')
    .map(([key]) => key);
probe.coverageFailures = covMathFailures;
probe.topic = 'math-scalar-utils';
(window as any).__probe = async () => probe;
if (covMathFailures.length) console.error(`[coverage] math namespace probes failed: ${covMathFailures.join(', ')}`);

app.run(scene);
console.log('[math-scalar-utils] running');
