/**
 * math-size-ops — math.Size — 尺寸值类型
 *
 * 掌握 Size 值类型全生命周期：构造、宽高读写、克隆重置、相等与插值。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives, Size } from 'cocosair';


// ---- 共享脚手架：可见帧 + 场景就绪（math-size-ops）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-size-ops');
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
cubeMaterial.setProperty('mainColor', new Color(130, 200, 180));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Size — 尺寸值类型（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
var s = new Size(10, 20); var o = new Size();
T('ctor', () => s.width + 'x' + s.height);
s.width = 12; s.height = 24;
T('wh', () => s.width + ',' + s.height);
T('cloneW', () => s.clone().height);
T('setRT', () => (Size as any).set(o, 1, 2).width);
T('equals', () => (Size as any).equals(s, o));
T('lerp', () => { (Size as any).lerp(o, new Size(0, 0), new Size(10, 20), 0.5); return o.width + ',' + o.height; });
T('toString', () => typeof s.toString());
probe.topic = 'math-size-ops';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-size-ops] running');
