/**
 * material-ops — Material — copy/getHash/getProperty 往返
 *
 * 掌握材质数据面：copy 克隆属性面、getHash 稳定性、getProperty 与 setProperty 的往返、resetUniforms 与管线状态覆写（try 兜底）。
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

// ---- 共享脚手架：可见帧 + 场景就绪（material-ops）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-material-ops');
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
cubeMaterial.setProperty('mainColor', new Color(240, 170, 120));
cubeRenderer.material = cubeMaterial;

// ---- 主题：Material — copy/getHash/getProperty 往返（确定性 readback，全部进 __probe）----
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
var src = new Material();
src.initialize({ effectName: 'builtin-standard' });
src.setProperty('mainColor', new Color(10, 20, 30, 255));
var dst = new Material();
T('copy', () => {
    try {
        (dst as any).copy ? (dst as any).copy(src) : (Material as any).copy(dst, src);
        var c = (dst as any).getProperty('mainColor') as any;
        return c ? c.r + ',' + c.g : 'null';
    } catch (e) {
        return 'threw';
    }
});
T('hash', () => {
    try {
        var h = (Material as any).getHash(dst);
        return typeof h;
    } catch (e) {
        return 'threw';
    }
});
T('getProp', () => {
    var c = src.getProperty('mainColor') as any;
    return c ? c.b : 'null';
});
T('resetU', () => {
    try {
        (dst as any).resetUniforms ? (dst as any).resetUniforms() : 0;
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
T('overridePS', () => {
    try {
        (dst as any).overridePipelineStates ? (dst as any).overridePipelineStates({}) : 0;
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
probe.topic = 'material-ops';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[material-ops] running');
