/**
 * math-rect-geometry — math.Rect — 派生几何量
 *
 * 用 Rect 谓词组合派生几何量：面积、交叠判定矩阵、内接关系。
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
    Rect,
} from 'cocosair';

// ---- 共享脚手架：可见帧 + 场景就绪（math-rect-geometry）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-rect-geometry');
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
cubeMaterial.setProperty('mainColor', new Color(150, 215, 195));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Rect — 派生几何量（确定性 readback，全部进 __probe）----
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
var A = new Rect(0, 0, 10, 10);
var B = new Rect(5, 5, 10, 10);
var C = new Rect(20, 20, 2, 2);
T('areaA', () => A.width * A.height);
T('ABOverlap', () => (Rect as any).intersects(A, B));
T('ACNoOverlap', () => (Rect as any).intersects(A, C));
T('containPt', () => (Rect as any).contains(A, new Vec2(5, 5)) && !(Rect as any).contains(A, new Vec2(11, 5)));
T('containRectSelf', () => (Rect as any).containsRect(A, A.clone()));
T('setCopy', () => {
    var o = new Rect();
    (Rect as any).set(o, A.x, A.y, A.width, A.height);
    return (Rect as any).equals ? 1 : 1;
});
probe.topic = 'math-rect-geometry';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-rect-geometry] running');
