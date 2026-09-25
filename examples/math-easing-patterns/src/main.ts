/**
 * math-easing-patterns — math 标量 — 缓动模式组合
 *
 * 用标量工具组合三种经典缓动模式：smoothstep（3t²−2t³）、脉冲（pingPong 对称折返）、往返采样（repeat+lerp）。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives, lerp, clamp01, repeat, pingPong, inverseLerp } from 'cocosair';


// ---- 共享脚手架：可见帧 + 场景就绪（math-easing-patterns）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-easing-patterns');
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
cubeMaterial.setProperty('mainColor', new Color(125, 195, 215));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math 标量 — 缓动模式组合（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
T('smoothMid', () => { var t = 0.5; var s = t * t * (3 - 2 * t); return Math.round(lerp(0, 1, s) * 1000) / 1000; });
T('pulsePeak', () => (cocosairNS as any).pingPong(1, 2));
T('pulseZero', () => (cocosairNS as any).pingPong(0, 2) + ',' + (cocosairNS as any).pingPong(2, 2));
T('clampGuard', () => clamp01(1.7));
T('inverseRT', () => { var x = lerp(0, 10, 0.3); return Math.round(inverseLerp(0, 10, x) * 100) / 100; });
T('repeatCycle', () => (cocosairNS as any).repeat(0.25 + 1, 1));
probe.topic = 'math-easing-patterns';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-easing-patterns] running');
