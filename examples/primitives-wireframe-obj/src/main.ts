/**
 * primitives-wireframe-obj — primitives — wireframe/toWavefrontOBJ/defaults
 *
 * 掌握几何的线框化与 OBJ 序列化：wireframe 三角转线、toWavefrontOBJ 字符串输出、默认选项补全。
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

// ---- 共享脚手架：可见帧 + 场景就绪（primitives-wireframe-obj）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-primitives-wireframe-obj');
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
cubeMaterial.setProperty('mainColor', new Color(250, 210, 150));
cubeRenderer.material = cubeMaterial;

// ---- 主题：primitives — wireframe/toWavefrontOBJ/defaults（确定性 readback，全部进 __probe）----
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
var box = primitives.box({ width: 1, height: 1, length: 1 });
T('defaults', () => {
    try {
        var g = (primitives as any).applyDefaultGeometryOptions(box as any);
        return g ? 'ok' : 'null';
    } catch (e) {
        return 'threw';
    }
});
T('obj', () => {
    try {
        var s = (primitives as any).toWavefrontOBJ(box as any);
        return String(s).slice(0, 1);
    } catch (e) {
        return 'threw';
    }
});
T('wireframe', () => {
    try {
        var w: any = (primitives as any).wireframe(box as any);
        return w === null || w === undefined
            ? 'null'
            : Array.isArray(w)
              ? 'arr' + w.length
              : 'len' + (w.indices || []).length;
    } catch (e) {
        return 'threw';
    }
});
T('wireframed', () => {
    try {
        var w = (primitives as any).wireframed(box as any);
        return w ? 'ok' : 'null';
    } catch (e) {
        return 'threw';
    }
});
probe.topic = 'primitives-wireframe-obj';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[primitives-wireframe-obj] running');
