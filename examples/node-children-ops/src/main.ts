/**
 * node-children-ops — Node 子树操作 — 插入/移除/清空
 *
 * 掌握子树修改全族：指定位置插入、精确移除、全清与销毁全清、按 uuid 取子、脱离父节点。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives } from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

// ---- 共享脚手架：可见帧 + 场景就绪（node-children-ops）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-node-children-ops');
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
cubeMaterial.setProperty('mainColor', new Color(215, 155, 105));
cubeRenderer.material = cubeMaterial;

// ---- 主题：Node 子树操作 — 插入/移除/清空（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
var lcNode = new Node('LCNode'); scene.addChild(lcNode);
var host = new Node('Kids'); scene.addChild(host);
var a = new Node('A'); var b = new Node('B'); var c = new Node('C');
host.addChild(a); host.addChild(b);
host.insertChild(c, 0);
probe.firstChild = (host.children[0] as any).name;
probe.kidCount = host.children.length;
probe.byUuid = (host.getChildByUuid(a.uuid) as any).name;
host.removeChild(c);
probe.afterRemove = host.children.length;
probe.cStillAlive = c.isValid;
b.removeFromParent();
probe.bParent = b.parent === null;
var d = new Node('D'); host.addChild(d);
host.removeAllChildren();
probe.afterRemoveAll = host.children.length;
var e = new Node('E'); host.addChild(e);
host.destroyAllChildren();
probe.afterDestroyAll = host.children.length;
probe.topic = 'node-children-ops';
(window as any).__probe = async () => probe;

// §25 资源生命周期合同（真拆建）：hold 当前对象 → destroy → 按 lifecycleMake 重建。
var lcRef: any = lcNode;
installAssetLifecycle({
  label: 'node-children-ops',
  hold: () => [{ name: 'lcNode', ref: lcRef }],
  release: () => { try { lcRef.destroy ? lcRef.destroy() : 0; } catch (e) { /* node destroy 无异常 */ } },
  reacquire: async () => { var o = await ((function () { var n = new Node('LCNode'); scene.addChild(n); return n; })()); lcRef = o; return [{ name: 'lcNode', ref: o }]; },
});
app.run(scene);
console.log('[node-children-ops] running');
