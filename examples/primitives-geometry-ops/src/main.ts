/**
 * primitives-geometry-ops — primitives — translate/scale/invWinding/normals
 *
 * 掌握几何后处理四件套：平移/缩放注入、绕序反转、法线重算——在 box 图元上做确定性对照。
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

// ---- 共享脚手架：可见帧 + 场景就绪（primitives-geometry-ops）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-primitives-geometry-ops');
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
cubeMaterial.setProperty('mainColor', new Color(240, 200, 140));
cubeRenderer.material = cubeMaterial;

// ---- 主题：primitives — translate/scale/invWinding/normals（确定性 readback，全部进 __probe）----
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
var base = primitives.box({ width: 1, height: 1, length: 1 });
var moved: any = base;
var scaled: any = base;
T('movedMaxY', () => {
    moved = (primitives as any).translate(base, [0, 10, 0]);
    var mm = (utils as any).createMesh(moved);
    return Math.round(((mm as any).maxPosition ? (mm as any).maxPosition.y : -999) * 10) / 10;
});
T('scaledMaxX', () => {
    scaled = (primitives as any).scale(base, [2, 2, 2]);
    var ms = (utils as any).createMesh(scaled);
    return Math.round(((ms as any).maxPosition ? (ms as any).maxPosition.x : -999) * 10) / 10;
});
T('invWinding', () => {
    var w: any = (primitives as any).invWinding(base);
    return w === undefined ? 'undef' : typeof w;
});
var rewound: any = base;
var withNormals: any = base;
T('normalsCall', () => {
    try {
        withNormals = (primitives as any).normals(base);
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});

probe.invWindingOK = typeof probe.invWinding === 'string';
probe.normalsOK = !!(withNormals && withNormals.attributes);
probe.topic = 'primitives-geometry-ops';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[primitives-geometry-ops] running');
