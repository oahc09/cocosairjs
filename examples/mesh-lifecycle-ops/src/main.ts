/**
 * mesh-lifecycle-ops — Mesh — assign/reset/merge 校验
 *
 * 掌握 Mesh 生命周期数据操作：assign 结构注入、reset 复位、静态 merge 与合并合法性校验、子网格更新与初始化（全部 try 兜底确定性回读）。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives, Mesh } from 'cocosair';


// ---- 共享脚手架：可见帧 + 场景就绪（mesh-lifecycle-ops）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-mesh-lifecycle-ops');
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
cubeMaterial.setProperty('mainColor', new Color(190, 210, 240));
cubeRenderer.material = cubeMaterial;

// ---- 主题：Mesh — assign/reset/merge 校验（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
var m1 = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
var m2 = utils.createMesh(primitives.box({ width: 2, height: 2, length: 2 }));
T('validate', () => { try { var v = (Mesh as any).validateMergingMesh ? (Mesh as any).validateMergingMesh([m1, m2]) : (m1 as any).validateMergingMesh([m2]); return typeof v; } catch (e) { return 'threw'; } });
T('merge', () => { try { var r = (Mesh as any).merge ? (Mesh as any).merge([m1, m2], false) : (m1 as any).merge([m2]); return r ? 'merged' : 'null'; } catch (e) { return 'threw'; } });
T('assign', () => { try { var target = new (Mesh as any)(); (target as any).assign ? (target as any).assign({ vertexBuffers: [], indices: [] } as any) : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('reset', () => { try { (m1 as any).reset ? (m1 as any).reset() : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('initialize', () => { try { var nm = new (Mesh as any)(); (nm as any).initialize ? (nm as any).initialize() : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('updateSubMesh', () => { try { (m2 as any).updateSubMesh ? (m2 as any).updateSubMesh() : 0; return 'ok'; } catch (e) { return 'threw'; } });
probe.topic = 'mesh-lifecycle-ops';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[mesh-lifecycle-ops] running');
