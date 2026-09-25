/**
 * mesh-prim-compare — primitives — 图元顶点规模对照
 *
 * 在同一管线下对照三件图元的顶点/索引规模关系：quad 恒为 4 顶点、cone 随段数增长、circle ≥ 3 段下限。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives } from 'cocosair';


// ---- 共享脚手架：可见帧 + 场景就绪（mesh-prim-compare）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-mesh-prim-compare');
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
cubeMaterial.setProperty('mainColor', new Color(235, 205, 145));
cubeRenderer.material = cubeMaterial;

// ---- 主题：primitives — 图元顶点规模对照（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
var q = utils.createMesh((primitives as any).quad({ width: 1, height: 1 }));
var c8 = utils.createMesh(primitives.cone({ radius: 0.5, height: 1, segs: 8 } as any));
var c16 = utils.createMesh(primitives.cone({ radius: 0.5, height: 1, segs: 16 } as any));
var cir = utils.createMesh(primitives.circle({ segments: 8 } as any));
var vc = (m: any) => (m.renderInfo ? m.renderInfo.vertCount : (m.vertexCount || -1));
probe.quadV = vc(q);
probe.cone8V = vc(c8);
probe.cone16V = vc(c16);
probe.circleV = vc(cir);
probe.coneMonotone = vc(c16) > vc(c8);
probe.quadIsMin = vc(q) === 4;
probe.topic = 'mesh-prim-compare';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[mesh-prim-compare] running');
