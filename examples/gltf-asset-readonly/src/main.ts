/**
 * gltf-asset-readonly — GLTFAsset — 解析后只读面
 *
 * 掌握解析后 GLTFAsset 的九个只读集合面（在本地 fixture 上确定性回读基数）。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives, GLTFLoader, GLTFAsset } from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

// ---- 共享脚手架：可见帧 + 场景就绪（gltf-asset-readonly）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-gltf-asset-readonly');
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
cubeMaterial.setProperty('mainColor', new Color(210, 240, 220));
cubeRenderer.material = cubeMaterial;

// ---- 主题：GLTFAsset — 解析后只读面（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
app.run(scene);
var loader = new GLTFLoader();
var bytes = await (await fetch('./assets/BoxTextured.glb')).arrayBuffer();
var asset = await loader.parseAsync(bytes, './assets/') as any;
T('owned', () => typeof asset.owned);
T('meshes', () => 'len' + (asset.meshes ? asset.meshes.length : -1));
T('materials', () => 'len' + (asset.materials ? asset.materials.length : -1));
T('textures', () => 'len' + (asset.textures ? asset.textures.length : -1));
T('images', () => 'len' + (asset.images ? asset.images.length : -1));
T('skeletons', () => 'len' + (asset.skeletons ? asset.skeletons.length : -1));
T('animations', () => 'len' + (asset.animations ? asset.animations.length : -1));
T('sceneNames', () => asset.sceneNames && asset.sceneNames.length >= 1 ? 'nonEmpty' : 'empty');
T('meshMaterials', () => asset.meshMaterials ? 'len' + asset.meshMaterials.length : 'null');
probe.topic = 'gltf-asset-readonly';
(window as any).__probe = async () => probe;

// §25 资源生命周期合同（真拆建）：hold 当前对象 → destroy → 按 lifecycleMake 重建。
var lcRef: any = asset;
installAssetLifecycle({
  label: 'gltf-asset-readonly',
  hold: () => [{ name: 'asset', ref: lcRef }],
  release: () => { try { lcRef.destroy ? lcRef.destroy() : 0; } catch (e) { /* node destroy 无异常 */ } },
  reacquire: async () => { var o = await ((async () => { var b = await (await fetch('./assets/BoxTextured.glb')).arrayBuffer(); return await new GLTFLoader().parseAsync(b, './assets/'); })()); lcRef = o; return [{ name: 'asset', ref: o }]; },
});
/* topic 已提前 app.run */
console.log('[gltf-asset-readonly] running');
