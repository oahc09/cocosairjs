/**
 * math-vec2-applied — math.Vec2 — 反射与投影应用
 *
 * 用 Vec2 API 组合向量应用：镜面反射公式 r = d − 2(d·n)n 与投影分解。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives } from 'cocosair';


// ---- 共享脚手架：可见帧 + 场景就绪（math-vec2-applied）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-vec2-applied');
var cameraNode = new Node('Main Camera'); scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.2, 6.2)); cameraNode.lookAt(new Vec3(0, 0.6, 0));
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.fov = 45;
camera.near = 0.1; camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(28, 36, 52, 255);
camera.visibility = Layers.Enum.DEFAULT; camera.priority = 0;
var lightNode = new Node('Main Light'); scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0)); lightNode.setRotationFromEuler(-45, -30, 0);
var light = lightNode.addComponent(DirectionalLight); light.illuminance = 2;
var cube = new Node('Cube'); cube.layer = Layers.Enum.DEFAULT; scene.addChild(cube);
cube.setPosition(new Vec3(0, 0.6, 0));
var cubeRenderer = cube.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
var cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(110, 175, 225));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Vec2 — 反射与投影应用（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
var o = new Vec2(); var n = new Vec2(0, 1); var d = new Vec2(1, -1);
T('reflect', () => { var dn = (Vec2 as any).dot(d, n); var two = (Vec2 as any).multiplyScalar(new Vec2(), n, 2 * dn); (Vec2 as any).subtract(o, d, two); return o.x + ',' + o.y; });
T('projLenLE', () => { (Vec2 as any).project(o, d, new Vec2(1, 0)); var pl = (Vec2 as any).length(o); return pl <= (Vec2 as any).length(d) + 1e-9; });
T('normalize', () => { (Vec2 as any).normalize(o, new Vec2(3, 4)); return Math.round((Vec2 as any).length(o) * 1000) / 1000; });
probe.topic = 'math-vec2-applied';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-vec2-applied] running');
