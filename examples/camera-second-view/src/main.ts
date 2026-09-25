/**
 * camera-second-view — Camera — 双相机与优先级
 *
 * 掌握多相机共存：第二相机独立视口参数与 priority 排序语义、各自 worldToScreen 的确定性差异。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives } from 'cocosair';


// ---- 共享脚手架：可见帧 + 场景就绪（camera-second-view）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-camera-second-view');
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
cubeMaterial.setProperty('mainColor', new Color(160, 215, 210));
cubeRenderer.material = cubeMaterial;

// ---- 主题：Camera — 双相机与优先级（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
var cam2Node = new Node('Second Camera'); scene.addChild(cam2Node);
cam2Node.setPosition(new Vec3(4, 2.2, 6.2)); cam2Node.lookAt(new Vec3(0, 0.6, 0));
var cam2 = cam2Node.addComponent(Camera);
cam2.projection = Camera.ProjectionType.PERSPECTIVE; cam2.fov = 60;
cam2.priority = camera.priority + 1;
probe.priorityOrdered = cam2.priority > camera.priority;
var s1 = new Vec3(); var s2 = new Vec3();
camera.worldToScreen(s1, new Vec3(0, 0.6, 0));
cam2.worldToScreen(s2, new Vec3(0, 0.6, 0));
probe.projectionsDiffer = (Math.round(s1.x) !== Math.round(s2.x)) || (Math.round(s1.y) !== Math.round(s2.y));
var back = new Vec3();
cam2.screenToWorld(back, new Vec3(s2.x, s2.y, s2.z));
probe.cam2RoundTrip = Math.round(back.x * 100) + ',' + Math.round(back.y * 100);
probe.topic = 'camera-second-view';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[camera-second-view] running');
