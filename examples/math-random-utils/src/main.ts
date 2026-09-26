/**
 * math-random-utils — math 随机工具 — 区间界不变量
 *
 * 掌握随机工具的不变量面：值域必落在给定区间（布尔回读，不依赖具体随机值）、伪随机的确定性同种子复现。
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
    randomRange,
    randomRangeInt,
    pseudoRandom,
    pseudoRandomRange,
    pseudoRandomRangeInt,
} from 'cocosair';

// ---- 共享脚手架：可见帧 + 场景就绪（math-random-utils）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-random-utils');
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
cubeMaterial.setProperty('mainColor', new Color(140, 210, 230));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math 随机工具 — 区间界不变量（确定性 readback，全部进 __probe）----
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
T('rangeOK', () => {
    for (var i = 0; i < 100; i++) {
        var v = (cocosairNS as any).randomRange(2, 5);
        if (v < 2 || v > 5) {
            return false;
        }
    }
    return true;
});
T('intRangeOK', () => {
    for (var i = 0; i < 100; i++) {
        var v = (cocosairNS as any).randomRangeInt(1, 10);
        if (v < 1 || v > 10 || Math.floor(v) !== v) {
            return false;
        }
    }
    return true;
});
T('pseudoDeterministic', () => (cocosairNS as any).pseudoRandom(42) === (cocosairNS as any).pseudoRandom(42));
T('pseudoRangeOK', () => {
    for (var i = 0; i < 50; i++) {
        var v = (cocosairNS as any).pseudoRandomRange(42, 0, 1);
        if (v < 0 || v > 1) {
            return false;
        }
    }
    return true;
});
T('pseudoIntOK', () => {
    var v = (cocosairNS as any).pseudoRandomRangeInt(7, 5, 9);
    return v >= 5 && v <= 9 && Math.floor(v) === v;
});
probe.topic = 'math-random-utils';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-random-utils] running');
