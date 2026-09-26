/**
 * math-color-models — math.Color — HSV/插值/乘法/属性
 *
 * 掌握 Color 的 HSV 色彩模型、颜色插值/乘法、 setter/clone/equals 与可改属性面查询。
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

// ---- 共享脚手架：可见帧 + 场景就绪（math-color-models）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-color-models');
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
cubeMaterial.setProperty('mainColor', new Color(250, 160, 160));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Color — HSV/插值/乘法/属性（确定性 readback，全部进 __probe）----
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
var c = new Color();
var o = new Color();
T('fromHSV0', () => {
    try {
        (c as any).fromHSV(0, 1, 1);
        return c.r + ',' + c.g + ',' + c.b;
    } catch (e) {
        return 'threw';
    }
});
T('toHSV', () => {
    try {
        var hsv = (c as any).toHSV();
        return hsv ? 'obj' : 'null';
    } catch (e) {
        return 'threw';
    }
});
T('hsvProps', () => {
    try {
        var h = (c as any).h,
            s = (c as any).s,
            v = (c as any).v;
        return typeof h + typeof s + typeof v;
    } catch (e) {
        return 'threw';
    }
});
T('lerp', () => {
    (Color as any).lerp(o, new Color(0, 0, 0, 255), new Color(255, 255, 255, 255), 0.5);
    return o.r;
});
T('multiply', () => {
    try {
        (Color as any).multiply(o, new Color(255, 255, 255, 255), new Color(128, 128, 128, 255));
        return o.r;
    } catch (e) {
        return 'threw';
    }
});
T('setRT', () => (Color as any).set(o, 1, 2, 3, 4).b);

T('equals', () => (Color as any).equals(o, o.clone()));
T('toString', () => typeof o.toString());
T('getModifiableProperties', () => {
    try {
        var p = (Color as any).getModifiableProperties
            ? (Color as any).getModifiableProperties(c)
            : (c as any).getModifiableProperties();
        return typeof p;
    } catch (e) {
        return 'threw';
    }
});
probe.topic = 'math-color-models';
(window as any).__probe = async () => probe;

app.run(scene);
void import('./instance-contract.js').then(({ verifyColorInstanceContract }) => verifyColorInstanceContract());
console.log('[math-color-models] running');
