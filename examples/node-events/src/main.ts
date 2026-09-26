/**
 * node-events — Node 事件 — on/once/emit/hasEventListener/off/targetOff
 *
 * 掌握 Node 自定义事件生命周期的全链：注册/单次/派发/查询/精确移除/按目标清空，以及 dispatchEvent 走事件对象路径；附带层级查询与兄弟序 API 的确定性回读。
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
    Event,
} from 'cocosair';

// ---- 共享脚手架：可见帧 + 场景就绪（node-events）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-node-events');
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
cubeMaterial.setProperty('mainColor', new Color(214, 148, 96));
cubeRenderer.material = cubeMaterial;

// ---- 主题：Node 事件 — on/once/emit/hasEventListener/off/targetOff（确定性 readback，全部进 __probe）----
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
var host = new Node('EventHost');
scene.addChild(host);
var n = { on: 0, once: 0 };
var onCb = () => {
    n.on++;
};
host.on('ping', onCb);
host.once('ping-once', () => {
    n.once++;
});
host.emit('ping');
host.emit('ping');
host.emit('ping-once');
host.emit('ping-once');
probe.onCount = n.on;
probe.onceCount = n.once;
probe.hasPing = host.hasEventListener('ping');
host.off('ping', onCb);
probe.hasPingAfterOff = host.hasEventListener('ping');
host.on('gone-a', () => {
    n.on++;
});
host.on('gone-b', () => {
    n.on++;
});
host.targetOff(host);
probe.hasGoneAAfterTargetOff = host.hasEventListener('gone-a');
probe.hasGoneBAfterTargetOff = host.hasEventListener('gone-b');
var dispCount = 0;
host.on('disp', () => {
    dispCount++;
});
host.dispatchEvent(new (Event as any)('disp'));
probe.dispatchCount = dispCount;
var child = new Node('ChildA');
host.addChild(child);
var child2 = new Node('ChildB');
host.addChild(child2);
probe.childByPath = (host.getChildByPath('ChildA') as any).name;
probe.isChild = host.isChildOf(scene) && child.isChildOf(host);
probe.siblingOfB = child2.getSiblingIndex();
child2.setSiblingIndex(0);
probe.siblingOfBAfter = child2.getSiblingIndex();
probe.parentName = (child.getParent() as any).name;
var detached = new Node('Detached');
child.setParent(detached);
probe.reparented = detached.children.length === 1 && child.getParent() === detached;
var comps = cube.getComponents(MeshRenderer as any);
probe.cubeRendererCount = comps.length;
var names: string[] = [];
scene.walk((nd: any) => {
    names.push(nd.name);
});
probe.walkFoundCube = names.indexOf('Cube') >= 0;

probe.topic = 'node-events';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[node-events] running');
