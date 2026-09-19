/* V0.8 BLOCK-2 — 物化 50 个 Invalid/Stress/Security Benchmark 的 fixtures 与冻结参考实现。
 * 运行：node tools/benchmark/materialize-iss.cjs
 * 产出：tools/benchmark/fixtures/B1xx/{index.html, assets/*}
 *       tools/benchmark/references/frozen/B1xx.main.ts
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const REPO = path.resolve(__dirname, '..', '..');
const DIR = path.join(REPO, 'tools', 'benchmark');

esbuild.buildSync({
  entryPoints: [path.join(DIR, 'catalog', 'catalog-iss.ts')],
  bundle: true, format: 'cjs', platform: 'node', target: 'node18',
  outfile: path.join(REPO, 'build', '.cat-iss.cjs'), write: true,
});
const { ISS_BENCHMARKS, ISS_REF_CODES } = require(path.join(REPO, 'build', '.cat-iss.cjs'));

const HTML = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script type="importmap">{"imports":{"cocosair":"/build/cocosair.module.js"}}</script>'
  + '<script src="/__bench-prelude.js"></script>'
  + '</head><body style="margin:0"><canvas id="GameCanvas" width="480" height="360"></canvas>'
  + '<script type="module" src="./src/main.ts"></script></body></html>';

// ---- GLB / glTF 生成工具 ----
function pad4 (n) { return (4 - (n % 4)) % 4; }
function glb (jsonObj, binBuffer, extraChunks) {
  const jsonStr = JSON.stringify(jsonObj);
  const jsonPad = pad4(jsonStr.length);
  const jsonText = jsonStr + ' '.repeat(jsonPad);
  const bin = binBuffer || Buffer.alloc(0);
  const binPad = Buffer.alloc(pad4(bin.length));
  const totalLength = 12 + 8 + jsonText.length + (bin.length ? 8 + bin.length + binPad.length : 0) + (extraChunks || []).reduce((acc, c) => acc + 8 + c.length, 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonText.length, 0);
  jsonHeader.write('JSON', 4, 'ascii');
  const parts = [header, jsonHeader, Buffer.from(jsonText, 'utf8')];
  if (bin.length) {
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(bin.length + binPad.length, 0);
    binHeader.write('BIN\0', 4, 'ascii');
    parts.push(binHeader, bin, binPad);
  }
  for (const chunk of extraChunks || []) {
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.writeUInt32LE(chunk.length, 0);
    chunkHeader.write(chunk.type || 'XXXX', 4, 'ascii');
    parts.push(chunkHeader, chunk.data);
  }
  return Buffer.concat(parts);
}
function binFromFloats (floats) { return Buffer.from(new Float32Array(floats).buffer); }
function binFromU32 (values) { return Buffer.from(new Uint32Array(values).buffer); }

/** 最小三角 GLB（positions + indices），用于尺寸/污染类 fixture 的载体。 */
function triangleGlb (mutate) {
  const positions = [-1, -1, 0, 1, -1, 0, 0, 1, 0];
  const indices = [0, 1, 2];
  const bin = Buffer.concat([binFromFloats(positions), binFromU32(indices)]);
  const json = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 12 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, -1, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5125, count: 3, type: 'SCALAR' },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    nodes: [{ name: 'triangle', mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  if (mutate) { mutate(json); }
  return glb(json, bin);
}

/** glTF JSON 文本（可外链 uri）。 */
function gltfText (jsonObj) { return JSON.stringify(jsonObj, null, 2); }

// ---- 各 fixture 资产 ----
const INVALID_SRC = path.join(DIR, 'fixtures', 'invalid');
const assets = {};

assets['B101'] = [['corrupt-magic.glb', () => fs.readFileSync(path.join(INVALID_SRC, 'corrupt-magic.glb'))]];
assets['B102'] = [['truncated.glb', () => fs.readFileSync(path.join(INVALID_SRC, 'truncated.glb'))]];
assets['B103'] = [['invalid-accessor.glb', () => fs.readFileSync(path.join(INVALID_SRC, 'invalid-accessor.glb'))]];
assets['B104'] = [['empty.gltf', () => fs.readFileSync(path.join(INVALID_SRC, 'empty.gltf'))]];
assets['B105'] = [['missing-buffer.gltf', () => fs.readFileSync(path.join(INVALID_SRC, 'missing-buffer.gltf'))]];
assets['B106'] = [['zero-byte.glb', () => Buffer.alloc(0)]];
assets['B107'] = [['invalid-json.gltf', () => Buffer.from('{invalid json!!!', 'utf8')]];
assets['B108'] = [['deep-nesting.gltf', () => fs.readFileSync(path.join(INVALID_SRC, 'deep-nesting.gltf'))]];

assets['B109'] = [['negative-bytelength.gltf', () => Buffer.from(gltfText({
  asset: { version: '2.0' },
  buffers: [{ byteLength: -100 }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
}), 'utf8')]];

assets['B110'] = [['overflow-view.gltf', () => Buffer.from(gltfText({
  asset: { version: '2.0' },
  buffers: [{ byteLength: 78, uri: 'data:application/octet-stream;base64,' + Buffer.alloc(78).toString('base64') }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 1048576 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
}), 'utf8')]];

assets['B111'] = [['accessor-mismatch.glb', () => triangleGlb((json) => { json.accessors[0].count = 4096; })]];
assets['B112'] = [['corrupt-png.gltf', () => {
  const png = Buffer.alloc(256);
  png.write(String.fromCharCode(0x89, 0x50, 0x4e, 0x78, 0x0d, 0x0a, 0x1a, 0x7a), 0, 'binary');
  for (let i = 0; i < 256; i += 16) { png.write('CORRUPTED!', Math.max(0, Math.min(i, 246)), 'binary'); }
  const bin = Buffer.concat([binFromFloats([-1, -1, 0, 1, -1, 0, 0, 1, 0]), png]);
  return Buffer.from(gltfText({
    asset: { version: '2.0' },
    buffers: [{ byteLength: bin.length, uri: 'data:application/octet-stream;base64,' + bin.toString('base64') }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 256 },
    ],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
    images: [{ bufferView: 1, mimeType: 'image/png' }],
    textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
  }), 'utf8');
}]];
assets['B113'] = [['scene-oob.gltf', () => Buffer.from(gltfText({
  asset: { version: '2.0' },
  scene: 99,
  scenes: [{ nodes: [0] }],
  nodes: [{ name: 'only' }],
}), 'utf8')]];
assets['B114'] = [['node-cycle.gltf', () => Buffer.from(gltfText({
  asset: { version: '2.0' },
  nodes: [{ name: 'a', children: [1] }, { name: 'b', children: [0] }],
  scenes: [{ nodes: [0] }], scene: 0,
}), 'utf8')]];
assets['B115'] = [['chunk-mismatch.glb', () => {
  const jsonStr = JSON.stringify({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], scene: 0 });
  const jsonText = jsonStr; // no padding needed for handcrafted header below
  const fakeBinLength = 999999;
  const realBin = Buffer.alloc(8);
  const binPad = Buffer.alloc(0);
  const jsonLen = Buffer.byteLength(jsonText) + pad4(Buffer.byteLength(jsonText));
  const totalLength = 12 + 8 + jsonLen + 8 + realBin.length + binPad.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(Buffer.byteLength(jsonText), 0); jsonHeader.write('JSON', 4, 'ascii');
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(fakeBinLength, 0); binHeader.write('BIN\0', 4, 'ascii');
  return Buffer.concat([header, jsonHeader, Buffer.from(jsonText, 'utf8'), Buffer.alloc(pad4(Buffer.byteLength(jsonText))), binHeader, realBin, binPad]);
}]];
assets['B116'] = [['version-99.gltf', () => triangleGlb((json) => { json.asset.version = '99.0'; })]];
assets['B117'] = [['required-unknown-ext.gltf', () => Buffer.from(gltfText({
  asset: { version: '2.0' },
  extensionsUsed: ['ACME_fake_ext'],
  extensionsRequired: ['ACME_fake_ext'],
  nodes: [{ name: 'n', extensions: { ACME_fake_ext: {} } }],
  scenes: [{ nodes: [0] }], scene: 0,
}), 'utf8')]];
assets['B118'] = [['mime-confused.gltf', () => triangleGlb(null)]];

assets['B135'] = [['traversal-buffer.gltf', () => Buffer.from(gltfText({
  asset: { version: '2.0' },
  buffers: [{ byteLength: 36, uri: '../../../../outside.bin' }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
}), 'utf8')]];
assets['B136'] = [['absolute-path.gltf', () => Buffer.from(gltfText({
  asset: { version: '2.0' },
  buffers: [{ byteLength: 36, uri: '/etc/passwd' }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
}), 'utf8')]];
assets['B137'] = [['external-url.gltf', () => Buffer.from(gltfText({
  asset: { version: '2.0' },
  buffers: [{ byteLength: 36, uri: 'http://192.0.2.1/steal.bin' }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
}), 'utf8')]];
assets['B138'] = [['data-uri-huge.gltf', () => Buffer.from(gltfText({
  asset: { version: '2.0' },
  buffers: [{ byteLength: 67108864, uri: 'data:application/octet-stream;base64,' + Buffer.alloc(16).toString('base64') }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 67108864 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
}), 'utf8')]];
assets['B139'] = [['proto-pollution.gltf', () => Buffer.from('{"asset":{"version":"2.0"},"__proto__":{"spam":"polluted"},"extras":{"__proto__":{"spam":1}},"nodes":[],"scenes":[{"nodes":[]}],"scene":0}', 'utf8')]];
assets['B140'] = [['constructor-pollution.gltf', () => Buffer.from('{"asset":{"version":"2.0"},"constructor":{"prototype":{"spam":"polluted"}},"nodes":[],"scenes":[{"nodes":[]}],"scene":0}', 'utf8')]];
assets['B141'] = [['negative-count.gltf', () => Buffer.from(gltfText({
  asset: { version: '2.0' },
  buffers: [{ byteLength: 36, uri: 'data:application/octet-stream;base64,' + Buffer.alloc(36).toString('base64') }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: -5, type: 'VEC3' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
}), 'utf8')]];
assets['B142'] = [['overflow-offset.gltf', () => Buffer.from(gltfText({
  asset: { version: '2.0' },
  buffers: [{ byteLength: 36, uri: 'data:application/octet-stream;base64,' + Buffer.alloc(36).toString('base64') }],
  bufferViews: [{ buffer: 0, byteOffset: 9007199254740990, byteLength: 36 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
}), 'utf8')]];
assets['B143'] = [['nan-minmax.gltf', () => {
  // JSON 文本携带 1e999（JSON.parse → Infinity）：无法经 JSON.stringify 生成，需字面量替换
  const base = JSON.stringify({
    asset: { version: '2.0' },
    buffers: [{ byteLength: 36, uri: 'data:application/octet-stream;base64,' + Buffer.alloc(36).toString('base64') }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [0, 0, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
  });
  return Buffer.from(base.replace('"min":[0,0,0]', '"min":[1e999,0,0]').replace('"max":[0,0,0]', '"max":[-1e999,0,0]'), 'utf8');
}]];
assets['B144'] = [['extra-chunks.glb', () => glb({
  asset: { version: '2.0' },
  buffers: [{ byteLength: 48 }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
}, Buffer.concat([binFromFloats([-1, -1, 0, 1, -1, 0, 0, 1, 0]), Buffer.alloc(12)]), [
  { type: 'XXXX', data: Buffer.from('unknown chunk payload here') },
  { type: 'XXXX', data: Buffer.from('another unknown chunk') },
])]];
assets['B145'] = [['query-traversal.gltf', () => Buffer.from(gltfText({
  asset: { version: '2.0' },
  buffers: [{ byteLength: 36, uri: 'assets/../../outside.bin?token=1' }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
}), 'utf8')]];
assets['B146'] = [['percent-traversal.gltf', () => Buffer.from(gltfText({
  asset: { version: '2.0' },
  buffers: [{ byteLength: 36, uri: '%2e%2e%2f%2e%2e%2fout.bin' }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
}), 'utf8')]];
assets['B147'] = [['hostile-ext.gltf', () => Buffer.from('{"asset":{"version":"2.0"},"extensionsUsed":["__proto__","constructor"],"extensionsRequired":["__proto__","constructor"],"nodes":[{"name":"n"}],"scenes":[{"nodes":[0]}],"scene":0}', 'utf8')]];
assets['B148'] = [['string-bomb.gltf', () => {
  const bomb = Array.from({ length: 4 }, () => 'A'.repeat(1024 * 1024));
  return Buffer.from(JSON.stringify({
    asset: { version: '2.0' },
    extras: { padding: bomb },
    nodes: [{ name: 'n' }],
    scenes: [{ nodes: [0] }], scene: 0,
  }), 'utf8');
}]];
assets['B149'] = [['file-scheme-texture.gltf', () => Buffer.from(gltfText({
  asset: { version: '2.0' },
  images: [{ uri: 'file:///C:/secrets.png' }],
  textures: [{ source: 0 }],
  materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
  nodes: [{ name: 'n' }], scenes: [{ nodes: [0] }], scene: 0,
}), 'utf8')]];
assets['B150'] = [['trailing-garbage.glb', () => Buffer.concat([triangleGlb(null), Buffer.alloc(4 * 1024 * 1024)])]];

// Stress 资产
assets['B126'] = [['big-multimb.glb', () => {
  const W = 500, H = 200; // 100k 顶点
  const positions = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) { positions.push((x - W / 2) * 0.05, Math.sin(x * 0.1) * 0.3, (y - H / 2) * 0.05); }
  }
  const indices = [];
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const a = y * W + x, b = a + 1, c = a + W, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const normals = new Array(positions.length).fill(0);
  for (let i = 1; i < normals.length; i += 3) { normals[i] = 1; }
  const bin = Buffer.concat([binFromFloats(positions), binFromFloats(normals), binFromU32(indices)]);
  return glb({
    asset: { version: '2.0' },
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.length * 4 },
      { buffer: 0, byteOffset: positions.length * 4, byteLength: normals.length * 4 },
      { buffer: 0, byteOffset: positions.length * 4 + normals.length * 4, byteLength: indices.length * 4 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [-12.5, -0.3, -5], max: [12.5, 0.3, 5] },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5125, count: indices.length, type: 'SCALAR' },
    ],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.72, 0.76, 0.82, 1], metallicFactor: 0, roughnessFactor: 0.85 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    nodes: [{ name: 'big-wave', mesh: 0 }],
    scenes: [{ nodes: [0] }], scene: 0,
  }, bin);
}]];
assets['B127'] = [['rapid-cycle.glb', () => triangleGlb(null)]];
assets['B129'] = [['rapid-cycle.glb', () => triangleGlb(null)]];

// ---- 物化 ----
let count = 0;
for (const benchmark of ISS_BENCHMARKS) {
  const fixtureDir = path.join(DIR, 'fixtures', benchmark.id);
  fs.mkdirSync(path.join(fixtureDir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(fixtureDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(fixtureDir, 'index.html'), HTML);
  // Agent 起点（Reference Track 运行时被冻结参考实现替换）
  fs.writeFileSync(path.join(fixtureDir, 'src', 'main.ts'), '// TODO: implement ' + benchmark.id + ' (' + benchmark.name + ')');
  for (const [name, factory] of assets[benchmark.id] || []) {
    fs.writeFileSync(path.join(fixtureDir, 'assets', name), factory());
  }
  const refFile = path.join(DIR, 'references', 'frozen', benchmark.referenceImplementation);
  fs.writeFileSync(refFile, ISS_REF_CODES.get(benchmark.id));
  count++;
  console.log('[iss] materialized', benchmark.id, '-', benchmark.name);
}
fs.rmSync(path.join(REPO, 'build', '.cat-iss.cjs'), { force: true });
console.log(`[iss] ${count} benchmarks materialized`);
