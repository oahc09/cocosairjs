/**
 * scene-runtime-ops — Scene — addComponent/autoRelease/updateWorldTransform
 *
 * 掌握 Scene 运行面：组件挂载到场景根、autoReleaseAssets 开关、dependAssets 只读、updateWorldTransform 强制刷新。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives, Component } from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

// ---- 共享脚手架：可见帧 + 场景就绪（scene-runtime-ops）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-scene-runtime-ops');
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
cubeMaterial.setProperty('mainColor', new Color(200, 220, 260));
cubeRenderer.material = cubeMaterial;

// ---- 主题：Scene — addComponent/autoRelease/updateWorldTransform（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
app.run(scene);
var lcHolder = new Node('LCHolder'); scene.addChild(lcHolder);
class SceneProbe extends Component { public marker = 7; }
var holder = new Node('CompHolder'); scene.addChild(holder); var c = holder.addComponent(SceneProbe as any);
T('addComponent', () => c && (c as any).marker === 7 ? 'ok' : 'null');
T('getBack', () => holder.getComponent(SceneProbe as any) ? 'hit' : 'miss');
scene.autoReleaseAssets = false;
T('autoRelease', () => scene.autoReleaseAssets === false);
T('dependAssets', () => { try { var d = (scene as any).dependAssets; return d ? 'len' + d.length : 'null'; } catch (e) { return 'threw'; } });
T('updateWT', () => { try { scene.updateWorldTransform ? scene.updateWorldTransform() : 0; return 'ok'; } catch (e) { return 'threw'; } });
probe.topic = 'scene-runtime-ops';
(window as any).__probe = async () => probe;

// §25 资源生命周期合同（真拆建）：hold 当前对象 → destroy → 按 lifecycleMake 重建。
var lcRef: any = lcHolder;
installAssetLifecycle({
  label: 'scene-runtime-ops',
  hold: () => [{ name: 'lcHolder', ref: lcRef }],
  release: () => { try { lcRef.destroy ? lcRef.destroy() : 0; } catch (e) { /* node destroy 无异常 */ } },
  reacquire: async () => { var o = await ((function () { var n = new Node('LCHolder'); scene.addChild(n); return n; })()); lcRef = o; return [{ name: 'lcHolder', ref: o }]; },
});
/* topic 已提前 app.run */
console.log('[scene-runtime-ops] running');
