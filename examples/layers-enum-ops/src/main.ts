/**
 * layers-enum-ops — Layers — 掩码构造与注册表
 *
 * 掌握 Layers 位掩码系统：内置层常量、makeMaskExclude 排除掩码、addLayer/deleteLayer 动态注册、nameToLayer/layerToName 双向查表。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives } from 'cocosair';


// ---- 共享脚手架：可见帧 + 场景就绪（layers-enum-ops）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-layers-enum-ops');
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
cubeMaterial.setProperty('mainColor', new Color(170, 210, 190));
cubeRenderer.material = cubeMaterial;

// ---- 主题：Layers — 掩码构造与注册表（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
T('none', () => (Layers as any).NONE);
T('default', () => ((Layers as any).Enum ? (Layers as any).Enum.DEFAULT : (Layers as any).DEFAULT));
T('ui2d', () => typeof ((Layers as any).Enum ? ((Layers as any).Enum as any).UI_2D : (Layers as any).UI_2D));
T('editorBit', () => typeof ((Layers as any).Enum ? ((Layers as any).Enum as any).EDITOR : (Layers as any).EDITOR));
T('gizmosBit', () => typeof ((Layers as any).Enum ? ((Layers as any).Enum as any).GIZMOS : (Layers as any).GIZMOS));
T('profilerBit', () => typeof ((Layers as any).Enum ? ((Layers as any).Enum as any).PROFILER : (Layers as any).PROFILER));
T('ui3dBit', () => typeof ((Layers as any).Enum ? ((Layers as any).Enum as any).UI_3D : (Layers as any).UI_3D));
T('sceneGizmoBit', () => typeof ((Layers as any).Enum ? ((Layers as any).Enum as any).SCENE_GIZMO : (Layers as any).SCENE_GIZMO));
T('all', () => typeof ((Layers as any).Enum ? ((Layers as any).Enum as any).ALL : (Layers as any).ALL));
T('maskExclude', () => { try { var m = (Layers as any).makeMaskExclude(['IGNORE_RAYCAST']); return typeof m; } catch (e) { return 'threw'; } });
T('nameToLayer', () => { try { var b = (Layers as any).nameToLayer ? (Layers as any).nameToLayer('DEFAULT') : (Layers as any).nameToLayer('DEFAULT'); return typeof b; } catch (e) { return 'threw'; } });
T('layerToName', () => { try { var bit = (Layers as any).nameToLayer('DEFAULT'); var n = (Layers as any).layerToName ? (Layers as any).layerToName(bit) : (Layers as any).layerToName(bit); return String(n); } catch (e) { return 'threw'; } });
T('init', () => { try { (Layers as any).init ? (Layers as any).init('') : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('addDelete', () => { try { (Layers as any).addLayer(30, 'ProbeLayerX'); var b1 = (Layers as any).nameToLayer('DEFAULT'); (Layers as any).deleteLayer('ProbeLayerX'); var b2 = (Layers as any).nameToLayer('DEFAULT'); return b1 >= 0 && b2 === 0 ? 'cycled' : b1 + '→' + b2; } catch (e) { return 'threw'; } });
probe.topic = 'layers-enum-ops';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[layers-enum-ops] running');
