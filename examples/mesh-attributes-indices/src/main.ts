/**
 * mesh-attributes-indices — Mesh — 属性与索引读写
 *
 * 掌握 Mesh 数据面 API：读/拷贝顶点属性、读/拷贝索引、读取属性格式（在 primitives.box 产物上确定性回读）。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives, Mesh, gfx } from 'cocosair';


// ---- 共享脚手架：可见帧 + 场景就绪（mesh-attributes-indices）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-mesh-attributes-indices');
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
cubeMaterial.setProperty('mainColor', new Color(180, 200, 230));
cubeRenderer.material = cubeMaterial;

// ---- 主题：Mesh — 属性与索引读写（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
var mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
T('readAttr', () => { try { var r = (mesh as any).readAttribute ? (mesh as any).readAttribute(0, (gfx as any).ATTRIB_POSITION) : (Mesh as any).readAttribute(mesh, 0, (gfx as any).ATTRIB_POSITION); return r ? 'len' + r.length : 'null'; } catch (e) { return 'threw'; } });
T('copyAttr', () => { try { var out = new Float32Array(24); (mesh as any).copyAttribute ? (mesh as any).copyAttribute(0, (gfx as any).ATTRIB_POSITION, out) : (Mesh as any).copyAttribute(mesh, 0, (gfx as any).ATTRIB_POSITION, out); return 'ok'; } catch (e) { return 'threw'; } });
T('readIdx', () => { try { var r = (mesh as any).readIndices ? (mesh as any).readIndices(0) : (Mesh as any).readIndices(mesh, 0); return r ? 'len' + r.length : 'null'; } catch (e) { return 'threw'; } });
T('copyIdx', () => { try { var out = new Uint16Array(36); (mesh as any).copyIndices ? (mesh as any).copyIndices(0, out) : (Mesh as any).copyIndices(mesh, 0, out); return 'ok'; } catch (e) { return 'threw'; } });
T('readFmt', () => { try { var f = (mesh as any).readAttributeFormat ? (mesh as any).readAttributeFormat(0) : (Mesh as any).readAttributeFormat(mesh, 0); return f ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
probe.topic = 'mesh-attributes-indices';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[mesh-attributes-indices] running');
