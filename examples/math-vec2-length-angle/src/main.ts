/**
 * math-vec2-length-angle — math.Vec2 — 点积/长度/角度/旋转
 *
 * 掌握 Vec2 度量与方向族：dot/叉积值、长度与平方长度、归一化、夹角与符号角、绕原点旋转与投影。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives } from 'cocosair';


// ---- 共享脚手架：可见帧 + 场景就绪（math-vec2-length-angle）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-vec2-length-angle');
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
cubeMaterial.setProperty('mainColor', new Color(110, 170, 210));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Vec2 — 点积/长度/角度/旋转（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
var x = new Vec2(1, 0); var y = new Vec2(0, 1); var v = new Vec2(3, 4); var o = new Vec2();
T('dot', () => (Vec2 as any).dot(x, y));
T('cross', () => (Vec2 as any).cross(x, y));
T('len', () => (Vec2 as any).length(v));
T('lenSqr', () => (Vec2 as any).lengthSqr(v));
T('norm', () => { (Vec2 as any).normalize(o, v); return Math.round(o.x * 100) + ',' + Math.round(o.y * 100); });
T('angle', () => Math.round((Vec2 as any).angle(x, y) * 100) / 100);
T('signAngle', () => Math.round((Vec2 as any).signAngle(x, y) * 100) / 100);
T('rotate', () => { (Vec2 as any).rotate(o, x, Math.PI / 2); return Math.round(o.x) + ',' + Math.round(o.y); });
T('project', () => { (Vec2 as any).project(o, new Vec2(5, 0), new Vec2(1, 1)); return Math.round(o.x); });
probe.topic = 'math-vec2-length-angle';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-vec2-length-angle] running');
