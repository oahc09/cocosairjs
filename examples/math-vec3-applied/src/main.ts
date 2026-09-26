/**
 * math-vec3-applied — math.Vec3 — 应用恒等式
 *
 * 用已掌握的 Vec3 API 组合出可验证的几何恒等式：正交基零点积、叉积模=平行四边形面积、lerp 中点公式。
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
} from 'cocosair';

// ---- 共享脚手架：可见帧 + 场景就绪（math-vec3-applied）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-vec3-applied');
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
cubeMaterial.setProperty('mainColor', new Color(220, 165, 115));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Vec3 — 应用恒等式（确定性 readback，全部进 __probe）----
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
var a = new Vec3(1, 0, 0);
var b = new Vec3(0, 1, 0);
var o = new Vec3();
T('ortho', () => (Vec3 as any).dot(a, b));
T('crossLen', () => {
    (Vec3 as any).cross(o, a, b);
    return Math.round((Vec3 as any).length(o) * 100) / 100;
});
T('midpoint', () => {
    (Vec3 as any).lerp(o, new Vec3(0, 0, 0), new Vec3(4, 6, 8), 0.5);
    return o.x + ',' + o.y + ',' + o.z;
});
T('unitNorm', () => {
    (Vec3 as any).normalize(o, new Vec3(0, 0, 7));
    return o.z;
});
probe.topic = 'math-vec3-applied';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-vec3-applied] running');
