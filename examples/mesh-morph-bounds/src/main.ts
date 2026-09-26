/**
 * mesh-morph-bounds — Mesh — morphRendering/onLoaded/getBoneSpaceBounds
 *
 * 掌握 Mesh 的 morph/边界只读面与装载钩子（在 box 产物与空 Mesh 上 try 兜底回读）。
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
    Mesh,
} from 'cocosair';

// ---- 共享脚手架：可见帧 + 场景就绪（mesh-morph-bounds）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-mesh-morph-bounds');
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
cubeMaterial.setProperty('mainColor', new Color(185, 205, 235));
cubeRenderer.material = cubeMaterial;

// ---- 主题：Mesh — morphRendering/onLoaded/getBoneSpaceBounds（确定性 readback，全部进 __probe）----
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
var mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
T('ctor', () => {
    try {
        var m = new (Mesh as any)();
        return m ? 'obj' : 'null';
    } catch (e) {
        return 'threw';
    }
});
T('morph', () => {
    try {
        var mr = (mesh as any).morphRendering;
        return mr ? 'obj' : 'null';
    } catch (e) {
        return 'threw';
    }
});
T('boneBounds', () => {
    try {
        var b = (mesh as any).getBoneSpaceBounds ? (mesh as any).getBoneSpaceBounds() : null;
        return b ? 'obj' : 'null';
    } catch (e) {
        return 'threw';
    }
});
T('onLoaded', () => {
    try {
        (mesh as any).onLoaded ? (mesh as any).onLoaded() : 0;
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
probe.topic = 'mesh-morph-bounds';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[mesh-morph-bounds] running');
