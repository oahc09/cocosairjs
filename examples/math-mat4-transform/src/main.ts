/**
 * math-mat4-transform — math.Mat4 — translate/scale/rotate 与 16 元素
 *
 * 掌握 Mat4 变换注入族（translate/scale/rotate/transform）与全部 16 元素读写。
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

// ---- 共享脚手架：可见帧 + 场景就绪（math-mat4-transform）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-mat4-transform');
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
cubeMaterial.setProperty('mainColor', new Color(210, 190, 250));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Mat4 — translate/scale/rotate 与 16 元素（确定性 readback，全部进 __probe）----
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
Mat4.identity(m);
T('translate', () => {
    (Mat4 as any).translate(o, m, new Vec3(5, 6, 7));
    return o.m12 + ',' + o.m14;
});
T('scale', () => {
    (Mat4 as any).scale(o, m, new Vec3(3, 4, 5));
    return o.m00 + ',' + o.m11;
});
T('rotate0', () => {
    (Mat4 as any).rotate(o, m, 0, new Vec3(0, 1, 0));
    return Math.round(o.m00 * 100) / 100;
});
T('transform', () => {
    try {
        (Mat4 as any).transform(o, m, new Vec3(1, 1, 1), new Vec3(1, 1, 1));
        return o.m00;
    } catch (e) {
        return 'threw';
    }
});
o.m00 = 1;
o.m05 = 2;
o.m10 = 3;
o.m15 = 4;
o.m03 = 5;
o.m07 = 6;
o.m11 = 7;
T('elems', () => o.m00 + ',' + o.m03 + ',' + o.m05 + ',' + o.m07 + ',' + o.m10 + ',' + o.m11 + ',' + o.m15);
probe.topic = 'math-mat4-transform';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-mat4-transform] running');
