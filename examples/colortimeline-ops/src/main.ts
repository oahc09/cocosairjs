/**
 * colortimeline-ops — ColorTimeline — 帧槽位与采样
 *
 * 掌握 ColorTimeline 运行面：槽位读写、帧表写入、属性 ID 查询与 apply 采样（try 兜底确定性回读）。
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

// ---- 共享脚手架：可见帧 + 场景就绪（colortimeline-ops）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-colortimeline-ops');
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
cubeMaterial.setProperty('mainColor', new Color(255, 175, 175));
cubeRenderer.material = cubeMaterial;

// ---- 主题：ColorTimeline — 帧槽位与采样（确定性 readback，全部进 __probe）----
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
T('ctor', () => {
    try {
        var tl = new (cocosairNS as any).ColorTimeline();
        return tl ? 'obj' : 'null';
    } catch (e) {
        return 'threw';
    }
});
T('slotRT', () => {
    try {
        var t = new (cocosairNS as any).ColorTimeline();
        (t as any).setSlotIndex(2);
        return (t as any).getSlotIndex();
    } catch (e) {
        return 'threw';
    }
});
T('setFrame', () => {
    try {
        var t = new (cocosairNS as any).ColorTimeline();
        (t as any).setFrame(0, new (cocosairNS as any).ColorKey());
        return (t as any).frames ? 'len' + (t as any).frames.length : 'null';
    } catch (e) {
        return 'threw';
    }
});
T('propId', () => {
    try {
        var t = new (cocosairNS as any).ColorTimeline();
        var id = (t as any).getPropertyId ? (t as any).getPropertyId() : undefined;
        return id === undefined ? 'undef' : typeof id;
    } catch (e) {
        return 'threw';
    }
});
T('apply', () => {
    try {
        var t = new (cocosairNS as any).ColorTimeline();
        (t as any).apply ? (t as any).apply(0.5) : 0;
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
T('slotIdxProp', () => {
    try {
        var t = new (cocosairNS as any).ColorTimeline();
        return typeof (t as any).slotIndex;
    } catch (e) {
        return 'threw';
    }
});
probe.topic = 'colortimeline-ops';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[colortimeline-ops] running');
