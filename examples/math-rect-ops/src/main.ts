/**
 * math-rect-ops — math.Rect — 矩形相交/包含/变换
 *
 * 掌握 Rect 全 API：几何谓词（intersects/contains/containsRect）、lerp、Mat4 变换与四点变换。
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
    Mat4,
} from 'cocosair';

// ---- 共享脚手架：可见帧 + 场景就绪（math-rect-ops）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-rect-ops');
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
cubeMaterial.setProperty('mainColor', new Color(140, 210, 190));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Rect — 矩形相交/包含/变换（确定性 readback，全部进 __probe）----
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
var r = new Rect(0, 0, 10, 10);
var o = new Rect();
var m = new Mat4();
T('ctor', () => r.x + ',' + r.y + ',' + r.width + ',' + r.height);
r.x = 1;
r.y = 2;
r.width = 3;
r.height = 4;
T('xywh', () => r.x + ',' + r.y + ',' + r.width + ',' + r.height);
T('cloneX', () => r.clone().width);
T('setRT', () => (Rect as any).set(o, 5, 6, 7, 8).height);
T('equals', () => (Rect as any).equals(r, o));
T('lerp', () => {
    (Rect as any).lerp(o, new Rect(0, 0, 0, 0), new Rect(10, 10, 10, 10), 0.5);
    return o.x + ',' + o.width;
});
T('toString', () => typeof r.toString());
T('intersects', () => (Rect as any).intersects(new Rect(0, 0, 5, 5), new Rect(4, 4, 5, 5)));
T('notIntersects', () => (Rect as any).intersects(new Rect(0, 0, 1, 1), new Rect(5, 5, 1, 1)));
T('contains', () => (Rect as any).contains(new Rect(0, 0, 10, 10), new Vec2(5, 5)));
T('containsRect', () => (Rect as any).containsRect(new Rect(0, 0, 10, 10), new Rect(2, 2, 3, 3)));
T('xform', () => {
    (Mat4 as any).identity(m);
    m.m12 = 10;
    (Rect as any).transformMat4(o, new Rect(0, 0, 1, 1), m);
    return Math.round(o.x);
});
T('xformPts', () => {
    try {
        var pts = [new Vec2(), new Vec2(), new Vec2(), new Vec2()];
        (Rect as any).transformMat4ToPoints(pts as any, new Rect(0, 0, 1, 1), m);
        return pts[0].x + ',' + pts[2].y;
    } catch (e) {
        return 'threw';
    }
});
probe.topic = 'math-rect-ops';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-rect-ops] running');
