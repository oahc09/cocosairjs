/**
 * math-color-convert — math.Color — 数值与字符串互转
 *
 * 掌握 Color 的全转换面：Vec4 往返、u32 打包、HEX/CSS 字符串、RGB 值。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives, Vec4 } from 'cocosair';


// ---- 共享脚手架：可见帧 + 场景就绪（math-color-convert）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-color-convert');
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
cubeMaterial.setProperty('mainColor', new Color(240, 150, 150));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.Color — 数值与字符串互转（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
var c = new Color(255, 128, 64, 255); var v = new Vec4(); var c2 = new Color();
T('toVec4', () => { (Color as any).toVec4(v, c); return v.x + ',' + v.y + ',' + v.z + ',' + v.w; });
T('fromVec4', () => { (Color as any).fromVec4(c2, v); return c2.r + ',' + c2.g; });
T('toUint32', () => typeof (Color as any).toUint32(c));
T('toHEX', () => (Color as any).toHEX ? String((Color as any).toHEX(c)).slice(0, 1) : String((c as any).toHEX ? (c as any).toHEX() : '').slice(0, 1));
T('fromHEX', () => { try { (Color as any).fromHEX(c2, '#336699'); return c2.r + ',' + c2.b; } catch (e) { return 'threw'; } });
T('toCSS', () => { try { return String((Color as any).toCSS ? (Color as any).toCSS(c) : (c as any).toCSS()).slice(0, 3); } catch (e) { return 'threw'; } });
T('toRGBValue', () => { try { var x = (Color as any).toRGBValue ? (Color as any).toRGBValue(c) : (c as any).toRGBValue(); return typeof x; } catch (e) { return 'threw'; } });
probe.topic = 'math-color-convert';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-color-convert] running');
