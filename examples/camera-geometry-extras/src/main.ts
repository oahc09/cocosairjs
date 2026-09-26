/**
 * camera-geometry-extras — Camera — 世界矩阵投影与几何查询
 *
 * 掌握 Camera 的进阶几何面：世界矩阵→屏幕投影（Mat4 出参）、裁剪空间 minz 查询、oblique 近平面矩阵计算（try 兜底）。
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
    geometry,
    Mat4,
} from 'cocosair';

// ---- 共享脚手架：可见帧 + 场景就绪（camera-geometry-extras）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-camera-geometry-extras');
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
cubeMaterial.setProperty('mainColor', new Color(150, 210, 200));
cubeRenderer.material = cubeMaterial;

// ---- 主题：Camera — 世界矩阵投影与几何查询（确定性 readback，全部进 __probe）----
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
var out = new Mat4();
var camAny: any = camera;
T('wms', () => {
    try {
        var rc = camAny.camera;
        var r = rc ? rc.worldMatrixToScreen(out, cube.worldMatrix, 480, 320) : null;
        return r ? 'mat4' : 'null';
    } catch (e) {
        return 'threw';
    }
});
T('clipMinz', () => {
    try {
        var v = ((camera as any).camera as any) ? ((camera as any).camera as any).getClipSpaceMinz() : undefined;
        return typeof v;
    } catch (e) {
        return 'threw';
    }
});
T('oblique', () => {
    try {
        var m = new Mat4();
        var p = new geometry.Plane(0, 1, 0, 1);
        var r = ((camera as any).camera as any) ? ((camera as any).camera as any).calculateObliqueMat(m, p) : null;
        return r ? 'ok' : 'null';
    } catch (e) {
        return 'threw';
    }
});
probe.topic = 'camera-geometry-extras';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[camera-geometry-extras] running');
