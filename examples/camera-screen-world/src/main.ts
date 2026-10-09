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
    director,
    Director,
    screen as screenEvents,
} from 'cocosair';
import { clientToCanvasPoint } from '../../shared/canvas-coordinates.js';

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
// Four inset markers make portrait cropping and orthographic fitting visible.
for (const x of [-2.85, 2.85]) {
    for (const y of [-1.85, 1.85]) {
        const marker = new Node(`FrameCorner-${x}-${y}`);
        marker.setPosition(x, 0.6 + y, 0);
        scene.addChild(marker);
        const renderer = marker.addComponent(MeshRenderer);
        renderer.mesh = utils.createMesh(primitives.box({ width: 0.15, height: 0.15, length: 0.15 }));
        renderer.material = cubeMaterial;
    }
}

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
const world = new Vec3(0, 0.6, 0);
const screen = new Vec3();
const back = new Vec3();
const ray = new geometry.Ray();
probe.ready = false;
function fitOrthographicView(): void {
    camera.orthoWidth = 0;
    camera.orthoHeight = Math.max(4 / 2, 6 / (2 * (app.canvas.width / app.canvas.height)));
}
const projectionButton = document.createElement('button');
projectionButton.id = 'projection-mode';
projectionButton.style.cssText = 'position:fixed;left:12px;top:12px;z-index:10;padding:8px';
projectionButton.textContent = '切换正交投影（完整容纳 6 × 4）';
projectionButton.addEventListener('click', () => {
    camera.projection =
        camera.projection === Camera.ProjectionType.PERSPECTIVE
            ? Camera.ProjectionType.ORTHO
            : Camera.ProjectionType.PERSPECTIVE;
    projectionButton.textContent =
        camera.projection === Camera.ProjectionType.ORTHO ? '切换透视投影' : '切换正交投影（完整容纳 6 × 4）';
    fitOrthographicView();
});
document.body.appendChild(projectionButton);
function updateProjection(): void {
    // Component API takes the input first; renderer Camera has a different overload.
    // Wait until the active scene has rendered so camera matrices are initialized.
    camera.worldToScreen(world, screen);
    const depth = (camera.near * camera.far) / (camera.far - screen.z * (camera.far - camera.near));
    const inverseDepth =
        camera.projection === Camera.ProjectionType.PERSPECTIVE
            ? (depth - camera.near) / (camera.far - camera.near)
            : screen.z;
    camera.screenToWorld(new Vec3(screen.x, screen.y, inverseDepth), back);
    camera.screenPointToRay(screen.x, screen.y, ray);
    probe.screenX = Math.round(screen.x);
    probe.screenY = Math.round(screen.y);
    probe.roundTripXY = Math.round(back.x * 100) + ',' + Math.round(back.y * 100);
    probe.roundTripError = Vec3.distance(world, back);
    probe.worldUnchanged = world.x === 0 && world.y === 0.6 && world.z === 0;
    probe.projection = camera.projection;
    probe.orthoHeight = camera.orthoHeight;
    probe.orthoFrameFits =
        camera.projection === Camera.ProjectionType.ORTHO &&
        [-3, 3].every((x) =>
            [-2, 2].every((y) => {
                const corner = camera.worldToScreen(new Vec3(x, 0.6 + y, 0));
                return (
                    corner.x >= -0.01 &&
                    corner.x <= app.canvas.width + 0.01 &&
                    corner.y >= -0.01 &&
                    corner.y <= app.canvas.height + 0.01
                );
            }),
        );
    probe.rayDx = Math.round(ray.d.x * 100) / 100;
    probe.rayDy = Math.round(ray.d.y * 100) / 100;
    probe.rayDz = Math.round(ray.d.z * 100) / 100;
    probe.ready = true;
    probe.cameraSize = [camera.camera.width, camera.camera.height];
    probe.bufferSize = [app.canvas.width, app.canvas.height];
}
director.on(Director.EVENT_AFTER_DRAW, updateProjection);
// Run before the next projection update after a viewport change.
screenEvents.on('window-resize', fitOrthographicView);
screenEvents.on('canvas-resize', fitOrthographicView);
fitOrthographicView();
app.canvas.addEventListener('pointerdown', (event) => {
    const point = clientToCanvasPoint(app.canvas, event.clientX, event.clientY);
    if (!point) return;
    const pickedRay = camera.screenPointToRay(point.x, point.y, new geometry.Ray());
    const distance = geometry.intersect.rayAABB(pickedRay, new geometry.AABB(0, 0.6, 0, 0.5, 0.5, 0.5));
    probe.lastPick = { x: point.x, y: point.y, hit: distance > 0 };
});
window.addEventListener(
    'pagehide',
    () => {
        director.off(Director.EVENT_AFTER_DRAW, updateProjection);
        screenEvents.off('window-resize', fitOrthographicView);
        screenEvents.off('canvas-resize', fitOrthographicView);
    },
    { once: true },
);

probe.topic = 'camera-screen-world';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[camera-screen-world] running');
