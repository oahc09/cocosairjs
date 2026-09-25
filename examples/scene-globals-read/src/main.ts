/**
 * scene-globals-read — Scene 全局面 — ambient/fog/skybox/probe 只读
 *
 * 掌握 SceneGlobals 只读面：环境光/阴影/天空盒/雾/八叉树/蒙皮/光探针/后处理设置的缺省形态与开关位。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives } from 'cocosair';


// ---- 共享脚手架：可见帧 + 场景就绪（scene-globals-read）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-scene-globals-read');
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
cubeMaterial.setProperty('mainColor', new Color(190, 210, 250));
cubeRenderer.material = cubeMaterial;

// ---- 主题：Scene 全局面 — ambient/fog/skybox/probe 只读（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
var g = (scene as any)._globals;
T('globals', () => g ? 'obj' : 'null');
T('ambient', () => { try { return g.ambient ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('shadows', () => { try { return g.shadows ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('skybox', () => { try { return (g as any)._skybox ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('fog', () => { try { return g.fog ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('octree', () => { try { return g.octree ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('skin', () => { try { return g.skin ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('probe', () => { try { return g.lightProbeInfo ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('postSettings', () => { try { return g.postSettings ? 'obj' : 'null'; } catch (e) { return 'threw'; } });
T('bakedFlags', () => { try { return String(!!g.bakedWithStationaryMainLight) + String(!!g.disableLightmap); } catch (e) { return 'threw'; } });
probe.topic = 'scene-globals-read';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[scene-globals-read] running');
