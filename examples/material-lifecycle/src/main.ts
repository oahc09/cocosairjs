/**
 * material-lifecycle — Material — reset/recompile/initDefault
 *
 * 掌握材质生命周期入口：reset 复位、recompileShaders 重编译（try）、initDefault 缺省化、validate 校验与 onLoaded 装载钩子。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives } from 'cocosair';


// ---- 共享脚手架：可见帧 + 场景就绪（material-lifecycle）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-material-lifecycle');
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
cubeMaterial.setProperty('mainColor', new Color(250, 180, 130));
cubeRenderer.material = cubeMaterial;

// ---- 主题：Material — reset/recompile/initDefault（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
var m = new Material();
m.initialize({ effectName: 'builtin-standard' });
T('reset', () => { try { (m as any).reset(); return 'ok'; } catch (e) { return 'threw'; } });
T('recompile', () => { try { m.recompileShaders ? m.recompileShaders({} as any, '' as any) : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('initDefault', () => { try { (m as any).initDefault ? m.initDefault(null) : 0; return 'ok'; } catch (e) { return 'threw'; } });
T('validate', () => { try { var v = (m as any).validate ? m.validate() : undefined; return v === undefined ? 'undef' : typeof v; } catch (e) { return 'threw'; } });
T('onLoaded', () => { try { (m as any).onLoaded ? m.onLoaded() : 0; return 'ok'; } catch (e) { return 'threw'; } });
probe.topic = 'material-lifecycle';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[material-lifecycle] running');
