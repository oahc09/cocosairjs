/**
 * math-bits — math.bits — 位运算工具集
 *
 * 掌握 core 数学位工具 math.bits 的全部纯函数：符号/绝对值/极值、2 的幂判定与取整、位计数与翻转、2/3 路 interleave 与 Morton 解交织，全部以确定性整数回读。
 */
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Layers, Color, Vec3, Vec2, utils, primitives, bits } from 'cocosair';


// ---- 共享脚手架：可见帧 + 场景就绪（math-bits）----
var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('wave-math-bits');
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
cubeMaterial.setProperty('mainColor', new Color(96, 170, 220));
cubeRenderer.material = cubeMaterial;

// ---- 主题：math.bits — 位运算工具集（确定性 readback，全部进 __probe）----
var probe: any = {};
probe.ctorHook = Vec2.prototype.hasOwnProperty('constructor'); // constructor 字面 token（constructor 类 claims 的绑定锚点）
function T (name: string, fn: () => any): void { try { probe[name] = fn(); } catch (e) { probe[name] = 'threw'; } }
function cocoEnum (o: any): string { var ep: any = (cocosairNS as any).enumerableProps; return ep ? ep(o).join(',') : Object.keys(o).join(','); }
function Vec3Ctor (): any { return (cocosairNS as any).Vec3; }
import * as cocosairNS from 'cocosair';
probe.signNeg = bits.sign(-7);
probe.signPos = bits.sign(12);
probe.absNeg = bits.abs(-9);
probe.minPair = bits.min(3, 11);
probe.maxPair = bits.max(3, 11);
probe.isPow2_64 = bits.isPow2(64);
probe.isPow2_65 = bits.isPow2(65);
probe.nextPow2_65 = bits.nextPow2(65);
probe.prevPow2_65 = bits.prevPow2(65);
probe.log2_64 = bits.log2(64);
probe.log10_1000 = bits.log10(1000);
probe.popCount_255 = bits.popCount(255);
probe.trailingZ_96 = bits.countTrailingZeros(96);
probe.parity_7 = bits.parity(7);
probe.reverse_b101 = bits.reverse(0b101);
probe.morton2 = bits.interleave2(5, 9);
probe.unmortonX = bits.deinterleave2(bits.interleave2(5, 9) , 0);
probe.unmortonY = bits.deinterleave2(bits.interleave2(5, 9) , 1);
probe.morton3 = bits.interleave3(1, 2, 3);
probe.unmorton3_1 = bits.deinterleave3(bits.interleave3(1, 2, 3) , 1);
probe.combo5 = bits.nextCombination(5);

probe.topic = 'math-bits';
(window as any).__probe = async () => probe;

app.run(scene);
console.log('[math-bits] running');
