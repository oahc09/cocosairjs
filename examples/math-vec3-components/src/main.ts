/**
 * math-vec3-components — math.Vec3 — 分量与构造
 *
 * 掌握 Vec3 构造与三分量直存直取。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives } from 'cocosair';


// ---- 共享脚手架：可见帧 + 场景就绪（math-vec3-components）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-vec3-components');
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
cubeMaterial.setProperty('mainColor', new Color(210, 150, 100));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Vec3 — 分量与构造（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
var z = new Vec3(); var v = new Vec3(5, 6, 7);
T('ctor0', () => z.x + ',' + z.y + ',' + z.z);
T('ctor3', () => v.x + ',' + v.y + ',' + v.z);
v.x = 50; v.y = 60; v.z = 70;
T('assign', () => v.x + ',' + v.y + ',' + v.z);
probe.topic = 'math-vec3-components';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-vec3-components] running');
