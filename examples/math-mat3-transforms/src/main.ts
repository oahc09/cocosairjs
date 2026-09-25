/**
 * math-mat3-transforms — math.Mat3 — 旋转/缩放/四元数来源与元素
 *
 * 掌握 Mat3 构造变换：绕轴旋转、缩放注入、fromQuat 旋转矩阵化，以及 9 个元素的直接读写。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives, Mat3, Quat } from 'cocosair';


// ---- 共享脚手架：可见帧 + 场景就绪（math-mat3-transforms）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-mat3-transforms');
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
cubeMaterial.setProperty('mainColor', new Color(180, 160, 220));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Mat3 — 旋转/缩放/四元数来源与元素（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
var m = new Mat3(); var o = new Mat3(); var q = new Quat();
T('rotate0', () => { (Mat3 as any).rotate(o, m, 0); return Math.round(o.m00 * 100) / 100; });
T('scaleIn', () => { (Mat3 as any).scale(o, m, new Vec3(2, 3, 4)); return o.m00 + ',' + o.m04 + ',' + o.m08; });
T('fromQuatI', () => { (Mat3 as any).fromQuat(o, q); return Math.round(o.m00 * 100) + ',' + Math.round(o.m04 * 100); });
T('fromQuatZ90', () => { var qz = new Quat(); qz.set(0, 0, 0.7071068, 0.7071068); (Mat3 as any).fromQuat(o, qz); return Math.round(o.m00 * 100) / 100; });
m.m00 = 1; m.m04 = 1; m.m08 = 1; m.m01 = 2;
T('elems', () => m.m00 + ',' + m.m01 + ',' + m.m02 + ',' + m.m03 + ',' + m.m04 + ',' + m.m05 + ',' + m.m06 + ',' + m.m07 + ',' + m.m08);
probe.topic = 'math-mat3-transforms';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-mat3-transforms] running');
