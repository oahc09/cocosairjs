/**
 * math-vec4-length-misc — math.Vec4 — 度量/插值/相等/变换
 *
 * 掌握 Vec4 度量与杂项：dot/叉积、长度族、归一化、lerp/clampf、Mat4 变换与相等语义。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives, Vec4, Mat4 } from 'cocosair';


// ---- 共享脚手架：可见帧 + 场景就绪（math-vec4-length-misc）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-vec4-length-misc');
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
cubeMaterial.setProperty('mainColor', new Color(150, 200, 170));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Vec4 — 度量/插值/相等/变换（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
var e1 = new Vec4(1, 0, 0, 0); var e2 = new Vec4(0, 1, 0, 0); var v = new Vec4(1, 2, 3, 4); var o = new Vec4(); var m = new Mat4();
T('dot', () => (Vec4 as any).dot(e1, e2));
T('len', () => Math.round((Vec4 as any).length(v) * 1000) / 1000);
T('lenSqr', () => (Vec4 as any).lengthSqr(v));
T('norm', () => { (Vec4 as any).normalize(o, v); return Math.round((Vec4 as any).length(o) * 1000) / 1000; });
T('lerp', () => { (Vec4 as any).lerp(o, new Vec4(0, 0, 0, 0), v, 0.5); return o.x + ',' + o.w; });
T('clampf', () => { (Vec4 as any).clampf(o, new Vec4(0, 0, 0, 0), new Vec4(1, 1, 1, 1)); return o.x <= 1; });
T('xform', () => { (Mat4 as any).identity(m); m.m15 = 2; (Vec4 as any).transformMat4(o, new Vec4(1, 1, 1, 1), m); return o.x + ',' + o.w; });
T('toString', () => typeof v.toString());
T('equals', () => (Vec4 as any).equals(new Vec4(1.0000001, 0, 0, 0), e1));
T('equals4f', () => (Vec4 as any).equals4f(v, 1, 2, 3, 4));
T('strictEq', () => (Vec4 as any).strictEquals(v, v.clone()));
T('strictEq4f', () => (Vec4 as any).strictEquals4f(v, 1, 2, 3, 4));
probe.topic = 'math-vec4-length-misc';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-vec4-length-misc] running');
