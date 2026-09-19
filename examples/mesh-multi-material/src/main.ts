/**
 * mesh-multi-material — 一个 Mesh 的多个 SubMesh 使用多个 Material（E005）。
 *
 * 通过 glTF 公开合同构造：一个 mesh 两个 primitives（左/右半块），
 * 各自绑定不同材质 → 实例化后 MeshRenderer 持有 2 个材质槽。
 * 禁止：用两个独立 Mesh 冒充 multiple material。
 */

import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Layers, Vec3, Color, frameObject, primitives, GLTFLoader } from 'cocosair';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('mesh-multi-material');

var cameraNode = new Node('Main Camera'); scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 4.5)); cameraNode.setRotationFromEuler(-12, 0, 0);
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.fov = 45;
camera.near = 0.1; camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT; camera.priority = 0;
var lightNode = new Node('Main Light'); scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0)); lightNode.setRotationFromEuler(-45, -30, 0);
var light = lightNode.addComponent(DirectionalLight); light.illuminance = 2;

// 立方体几何：直接采用 primitives.box() 公开输出（几何/法线/环绕序正确），按 x 平移两半
function shiftedBox (cx: number) {
  var geo = primitives.box({ width: 1.4, height: 1.4, length: 1.4 });
  var out = { positions: geo.positions.slice(), normals: (geo.normals || []).slice(), indices: (geo.indices || []).slice() };
  for (var i = 0; i < out.positions.length; i += 3) { out.positions[i] += cx; }
  return out;
}
var left = shiftedBox(-0.7);
var right = shiftedBox(0.7);
var positions = left.positions.concat(right.positions);
var normals = left.normals.concat(right.normals);
var idxOffset = left.indices.length;

function floatBytes(arr: number[]): Uint8Array {
  var f = new Float32Array(arr);
  return new Uint8Array(f.buffer);
}
function u16Bytes(arr: number[]): Uint8Array {
  var u = new Uint16Array(arr);
  return new Uint8Array(u.buffer);
}
var posB = floatBytes(positions);
var nrmB = floatBytes(normals);
var idxLB = u16Bytes(left.indices);
var idxRB = u16Bytes(right.indices);
var o1 = posB.length, o2 = o1 + nrmB.length, o3 = o2 + idxLB.length;
var total = o3 + idxRB.length;
var all = new Uint8Array(total);
all.set(posB, 0); all.set(nrmB, o1); all.set(idxLB, o2); all.set(idxRB, o3);
var bin = '';
for (var v of all) { bin += String.fromCharCode(v); }

var gltf = {
  asset: { version: '2.0' },
  buffers: [{ byteLength: total, uri: 'data:application/octet-stream;base64,' + btoa(bin) }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: o1 },
    { buffer: 0, byteOffset: o1, byteLength: o2 - o1 },
    { buffer: 0, byteOffset: o2, byteLength: o3 - o2 },
    { buffer: 0, byteOffset: o3, byteLength: total - o3 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [-1.5, -0.7, -0.7], max: [1.5, 0.7, 0.7] },
    { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
    { bufferView: 2, componentType: 5123, count: idxOffset, type: 'SCALAR' },
    { bufferView: 3, componentType: 5123, count: right.indices.length, type: 'SCALAR' },
  ],
  materials: [
    { name: 'red-half', pbrMetallicRoughness: { baseColorFactor: [0.85, 0.2, 0.2, 1], metallicFactor: 0.1, roughnessFactor: 0.4 } },
    { name: 'blue-half', pbrMetallicRoughness: { baseColorFactor: [0.2, 0.45, 0.85, 1], metallicFactor: 0.6, roughnessFactor: 0.25 } },
  ],
  meshes: [{ primitives: [
    { attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 },
    { attributes: { POSITION: 0, NORMAL: 1 }, indices: 3, material: 1 },
  ] }],
  nodes: [{ name: 'MultiMaterialCube', mesh: 0 }],
  scenes: [{ nodes: [0] }],
  scene: 0,
};

var asset = await new GLTFLoader().parseAsync(JSON.stringify(gltf));
var instance = asset.instantiate();
scene.addChild(instance.root);
// 显式相机位姿：对准双半块接缝（x=0），两个材质区域同框
cameraNode.setPosition(new Vec3(0, 0.9, 3.4));
cameraNode.setRotationFromEuler(-10, 0, 0);

var renderer = instance.root.getComponentInChildren(MeshRenderer);
var slots = renderer ? renderer.sharedMaterials.length : 0;
console.log('[mesh-multi-material] material slots on ONE MeshRenderer:', slots);

var panel2 = document.createElement('div');
panel2.style.cssText = 'position:fixed;left:10px;top:8px;color:#9cd;font:13px monospace';
document.body.appendChild(panel2);
panel2.textContent = 'one Mesh, 2 primitives, material slots: ' + slots;
(window as any).__multiState = { materialSlots: slots };

app.run(scene);
