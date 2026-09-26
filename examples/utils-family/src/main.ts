/**
 * utils-family — utils — find/toPPM/readMesh
 *
 * 掌握 misc 工具族：场景路径查找 find、PPM 序列化 toPPM、网格读取 readMesh（在脚手架场景/画布上确定性回读）。
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

// ---- 共享脚手架：可见帧 + 场景就绪（utils-family）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-utils-family');
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
cubeMaterial.setProperty('mainColor', new Color(160, 200, 210));
cubeRenderer.material = cubeMaterial;

// ---- 主题：utils — find/toPPM/readMesh（确定性 readback，全部进 __probe）----
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
T('findCam', () => {
    var n = (utils as any).find('/Main Camera') as any;
    return n ? n.name : 'null';
});
T('toPPM', () => {
    try {
        var ppm = (utils as any).toPPM
            ? (utils as any).toPPM(document.getElementById('GameCanvas') as any)
            : (utils as any).toPPM;
        return String(ppm).slice(0, 2);
    } catch (e) {
        return 'threw';
    }
});
T('readMesh', () => {
    try {
        var mesh = (utils as any).createMesh((primitives as any).box({ width: 1, height: 1, length: 1 }));
        var r = (utils as any).readMesh ? (utils as any).readMesh(mesh) : null;
        return r ? 'obj' : 'null';
    } catch (e) {
        return 'threw';
    }
});
probe.topic = 'utils-family';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[utils-family] running');
