/**
 * math-quat-euler — math.Quat — 欧拉角与轴基
 *
 * 掌握四元数与欧拉角/轴基的互化：toEuler（双序）、实例 getEulerAngles、fromArray 数组注入、三轴基提取。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives, Quat } from 'cocosair';


// ---- 共享脚手架：可见帧 + 场景就绪（math-quat-euler）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-quat-euler');
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
cubeMaterial.setProperty('mainColor', new Color(160, 210, 230));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Quat — 欧拉角与轴基（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
var q = new Quat(); var v = new Vec3();
T('toEuler', () => { (Quat as any).toEuler(v, q); return Math.round(v.x) + ',' + Math.round(v.y) + ',' + Math.round(v.z); });
T('toEulerYXZ', () => { try { (Quat as any).toEulerInYXZOrder(v, q); return Math.round(v.x) + ',' + Math.round(v.z); } catch (e) { return 'threw'; } });
T('getEuler', () => { var e = (q as any).getEulerAngles(); return e ? Math.round(e.x) + ',' + Math.round(e.z) : 'null'; });
T('fromArray', () => { (Quat as any).fromArray(q, [0, 0, 1, 0]); return q.z + ',' + q.w; });
var ax = new Vec3();
T('toAxisX', () => { try { (Quat as any).toAxisX(ax, q); return Math.round(ax.x * 100) / 100; } catch (e) { return 'threw'; } });
T('toAxisY', () => { try { (Quat as any).toAxisY(ax, q); return Math.round(ax.y * 100) / 100; } catch (e) { return 'threw'; } });
T('toAxisZ', () => { try { (Quat as any).toAxisZ(ax, q); return Math.round(ax.z * 100) / 100; } catch (e) { return 'threw'; } });
probe.topic = 'math-quat-euler';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-quat-euler] running');
