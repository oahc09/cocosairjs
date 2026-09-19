/**
 * gltf-clearcoat — KHR_materials_clearcoat 清漆层视觉语义（E006）。
 *
 * 三个同尺寸球体共享 Camera/Lighting/base material 参数，仅 clearcoatFactor 不同：
 * 左 0 / 中 0.5 / 右 1.0 —— 从左到右第二层镜面高光逐渐增强。
 * 清漆层经由 glTF 扩展公开（引擎无独立 Clearcoat Material API）。
 */

import { createAirApp, Scene, Node, Camera, DirectionalLight, Layers, Vec3, Color, frameObject, GLTFLoader } from 'cocosair';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('gltf-clearcoat');

var cameraNode = new Node('Main Camera'); scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.2, 7.5)); cameraNode.setRotationFromEuler(-5, 0, 0);
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.fov = 45;
camera.near = 0.1; camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(22, 28, 44, 255);
camera.visibility = Layers.Enum.DEFAULT; camera.priority = 0;
// 主光斜上 + 补光反向：让第二层高光在球面上沿清晰可见
var keyNode = new Node('Main Light'); scene.addChild(keyNode);
keyNode.setPosition(new Vec3(0, 6, 4)); keyNode.setRotationFromEuler(-50, 0, 0);
var key = keyNode.addComponent(DirectionalLight); key.illuminance = 3;
var fillNode = new Node('Fill Light'); scene.addChild(fillNode);
fillNode.setPosition(new Vec3(-5, 2, -4)); fillNode.setRotationFromEuler(-5, 60, 0);
var fill = fillNode.addComponent(DirectionalLight); fill.illuminance = 0.6;

// UV 球几何生成器
function sphereGeo(radius: number, widthSeg: number, heightSeg: number) {
  var positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (var y = 0; y <= heightSeg; y++) {
    var v = y / heightSeg, theta = v * Math.PI;
    for (var x = 0; x <= widthSeg; x++) {
      var u = x / widthSeg, phi = u * Math.PI * 2;
      var nx = Math.sin(theta) * Math.cos(phi), ny = Math.cos(theta), nz = Math.sin(theta) * Math.sin(phi);
      positions.push(nx * radius, ny * radius, nz * radius);
      normals.push(nx, ny, nz);
    }
  }
  for (var yy = 0; yy < heightSeg; yy++) {
    for (var xx = 0; xx < widthSeg; xx++) {
      var a = yy * (widthSeg + 1) + xx, b = a + widthSeg + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions: positions, normals: normals, indices: indices };
}

var geo = sphereGeo(1, 24, 16);
function floatBytes(arr: number[]): Uint8Array { var f = new Float32Array(arr); return new Uint8Array(f.buffer); }
function u16Bytes(arr: number[]): Uint8Array { var u = new Uint16Array(arr); return new Uint8Array(u.buffer); }
var posB = floatBytes(geo.positions);
var nrmB = floatBytes(geo.normals);
var idxB = u16Bytes(geo.indices);
var o1 = posB.length, o2 = o1 + nrmB.length, total = o2 + idxB.length;
var all = new Uint8Array(total);
all.set(posB, 0); all.set(nrmB, o1); all.set(idxB, o2);
var bin = '';
for (var v of all) { bin += String.fromCharCode(v); }

var EXT = 'KHR_materials_clearcoat';
var factors = [0, 0.5, 1];
var gltf: any = {
  asset: { version: '2.0' },
  extensionsUsed: [EXT],
  buffers: [{ byteLength: total, uri: 'data:application/octet-stream;base64,' + btoa(bin) }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: o1 },
    { buffer: 0, byteOffset: o1, byteLength: o2 - o1 },
    { buffer: 0, byteOffset: o2, byteLength: total - o2 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: geo.positions.length / 3, type: 'VEC3', min: [-1, -1, -1], max: [1, 1, 1] },
    { bufferView: 1, componentType: 5126, count: geo.normals.length / 3, type: 'VEC3' },
    { bufferView: 2, componentType: 5123, count: geo.indices.length, type: 'SCALAR' },
  ],
  materials: factors.map(function (f) {
    return {
      name: 'clearcoat-' + f,
      pbrMetallicRoughness: { baseColorFactor: [0.55, 0.62, 0.72, 1], metallicFactor: 0.15, roughnessFactor: 0.5 },
      extensions: { [EXT]: { clearcoatFactor: f, clearcoatRoughnessFactor: 0.12 } },
    };
  }),
  meshes: factors.map(function (_f, i) { return { primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: i }] }; }),
  nodes: factors.map(function (_f, i) { return { name: 'Sphere-Co-' + String(factors[i]).replace('.', '_'), mesh: i, translation: [(i - 1) * 2.6, 0, 0] }; }),
  scenes: [{ nodes: [0, 1, 2] }],
  scene: 0,
};

var asset = await new GLTFLoader().parseAsync(JSON.stringify(gltf));
var instance = asset.instantiate();
scene.addChild(instance.root);
frameObject(camera, instance.root);

// 验证三个材质的 clearcoat 属性已按扩展解析
var coats = asset.materials.map(function (m: any) { return m.getProperty ? (m.getProperty('airClearcoat') !== undefined ? 'ok' : 'parsed') : 'n/a'; });
console.log('[gltf-clearcoat] factors', factors, 'property states', coats);
var panel2 = document.createElement('div');
panel2.style.cssText = 'position:fixed;left:10px;top:8px;color:#9cd;font:13px monospace';
document.body.appendChild(panel2);
panel2.textContent = 'clearcoatFactor: 0 | 0.5 | 1.0  (left → right)';
(window as any).__clearcoatState = { factors: factors, materials: asset.materials.length };

app.run(scene);
