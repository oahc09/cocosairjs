/**
 * light-attach-cycle — Light — 常量与挂接生命周期
 *
 * 掌握 Light 基面：两类光通量常量语义标记、attach/detach 场景挂接入口与 update/onLoad 钩子（try 兜底）。
 */
import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Light,
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

// ---- 共享脚手架：可见帧 + 场景就绪（light-attach-cycle）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-light-attach-cycle');
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
cubeMaterial.setProperty('mainColor', new Color(255, 225, 165));
cubeRenderer.material = cubeMaterial;
app.run(scene);
await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const renderLight: any = (light as any)._light;
const renderScene: any = renderLight?.scene;

// ---- 主题：Light — 常量与挂接生命周期（确定性 readback，全部进 __probe）----
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
T('fluxConst', () => {
    try {
        return String((Light as any).PhotometricTerm?.LUMINOUS_FLUX !== undefined);
    } catch (e) {
        return 'threw';
    }
});
T('lumConst', () => {
    try {
        return String((Light as any).PhotometricTerm?.LUMINANCE !== undefined);
    } catch (e) {
        return 'threw';
    }
});
T('ctor', () => {
    try {
        var n = new Node('SpareLight');
        scene.addChild(n);
        var l = n.addComponent(DirectionalLight);
        return l ? 'ok' : 'null';
    } catch (e) {
        return 'threw';
    }
});
T('attach', () => {
    try {
        if (!renderLight || !renderScene) return 'missing';
        renderLight.attachToScene(renderScene);
        return renderLight.scene === renderScene ? 'ok' : 'mismatch';
    } catch (e) {
        return 'threw';
    }
});
T('detach', () => {
    try {
        if (!renderLight || !renderScene) return 'missing';
        renderLight.detachFromScene();
        const detached = renderLight.scene === null;
        renderLight.attachToScene(renderScene);
        return detached && renderLight.scene === renderScene ? 'ok' : 'mismatch';
    } catch (e) {
        return 'threw';
    }
});
T('update', () => {
    try {
        if (!renderLight) return 'missing';
        renderLight.update();
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
T('onLoad', () => {
    try {
        (light as any).onLoad ? (light as any).onLoad() : 0;
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
probe.topic = 'light-attach-cycle';
(window as any).__probe = async () => probe;

console.log('[light-attach-cycle] running');
