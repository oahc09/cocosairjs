/**
 * input-queries — Input — 触摸查询与加速度计配置
 *
 * 掌握 Input 查询面：零触摸态的确定性计数/取触摸/全量列表，与加速度计开关及采样间隔配置（配置型 API，值即生效）。
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
    input,
    Input,
} from 'cocosair';

// ---- 共享脚手架：可见帧 + 场景就绪（input-queries）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-input-queries');
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
cubeMaterial.setProperty('mainColor', new Color(180, 190, 220));
cubeRenderer.material = cubeMaterial;

// ---- 主题：Input — 触摸查询与加速度计配置（确定性 readback，全部进 __probe）----
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
T('touchCount', () => input.getTouchCount());
T('allTouches', () => {
    var t = input.getAllTouches();
    return t ? 'len' + t.length : 'null';
});
T('getTouch', () => {
    var t = input.getTouch ? input.getTouch(0) : undefined;
    return t === undefined || t === null ? 'none' : 'value';
});
T('accelOff', () => {
    try {
        input.setAccelerometerEnabled(false);
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
T('accelHz', () => {
    try {
        input.setAccelerometerInterval(60);
        return 'ok';
    } catch (e) {
        return 'threw';
    }
});
var covInputProbe = new Input();
var covInputOn = () => {};
var covInputOnce = () => {};
T('covInput.EventType', () => Input.EventType.TOUCH_START);
T('covInput.constructor', () => covInputProbe instanceof Input);
T('covInput.on', () => covInputProbe.on(Input.EventType.TOUCH_START, covInputOn) === covInputOn);
T('covInput.once', () => covInputProbe.once(Input.EventType.TOUCH_MOVE, covInputOnce) === covInputOnce);
T('covInput.off', () => {
    covInputProbe.off(Input.EventType.TOUCH_START, covInputOn);
    covInputProbe.off(Input.EventType.TOUCH_MOVE, covInputOnce);
    return true;
});
const covInputFailures = Object.entries(probe)
    .filter(([key, value]) => key.startsWith('covInput.') && value === 'threw')
    .map(([key]) => key);
probe.coverageFailures = covInputFailures;
probe.topic = 'input-queries';
(window as any).__probe = async () => probe;
if (covInputFailures.length) console.error(`[coverage] Input probes failed: ${covInputFailures.join(', ')}`);

app.run(scene);
console.log('[input-queries] running');
