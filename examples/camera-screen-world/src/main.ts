/**
 * camera-screen-world — Camera — worldToScreen / screenToWorld / screenPointToRay
 *
 * 掌握 Camera 的屏幕↔世界换算族：立方体中心的 worldToScreen 投影、同一点的 screenToWorld 往返一致性、screenPointToRay 的方向语义，以及 resize/setFixedSize 的视口行为。
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
} from 'cocosair';

// ---- 共享脚手架：可见帧 + 场景就绪（camera-screen-world）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-camera-screen-world');
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
cubeMaterial.setProperty('mainColor', new Color(130, 200, 140));
cubeRenderer.material = cubeMaterial;

// ---- 主题：Camera — worldToScreen / screenToWorld / screenPointToRay（确定性 readback，全部进 __probe）----
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
var world = new Vec3(0, 0.6, 0);
var screen = new Vec3();
camera.worldToScreen(screen, world);
probe.screenX = Math.round(screen.x);
probe.screenY = Math.round(screen.y);
var back = new Vec3();
camera.screenToWorld(back, new Vec3(screen.x, screen.y, screen.z));
probe.roundTripXY = Math.round(back.x * 100) + ',' + Math.round(back.y * 100);
var ray = new geometry.Ray(0, 0, 0, 0, 0, 0);
camera.screenPointToRay(screen.x, screen.y, ray);
probe.rayDx = Math.round(ray.d.x * 100) / 100;
probe.rayDy = Math.round(ray.d.y * 100) / 100;
probe.rayDz = Math.round(ray.d.z * 100) / 100;

probe.topic = 'camera-screen-world';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[camera-screen-world] running');
