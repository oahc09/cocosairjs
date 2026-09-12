/* Original deterministic glTF fixtures. MIT, same license as cocosair.js. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'examples/gltf-viewer/assets');
fs.mkdirSync(out, { recursive: true });
const mod = { exports: {} };
new Function('module', 'exports', esbuild.transformSync(fs.readFileSync(path.join(root, 'test/fixtures/gltf/fixture.ts'), 'utf8'),
    { loader: 'ts', format: 'cjs' }).code)(mod, mod.exports);
const combined = mod.exports.fixture();
fs.writeFileSync(path.join(out, 'combined.glb'), Buffer.from(combined.glb));

function crc32(bytes) {
    let crc = -1;
    for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
    const content = Buffer.concat([Buffer.from(type), data]); const head = Buffer.alloc(4); head.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(content)); return Buffer.concat([head, content, tail]);
}
function png(pixel) {
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(8); ihdr.writeUInt32BE(8, 4); ihdr[8] = 8; ihdr[9] = 6;
    const rows = [];
    for (let y = 0; y < 8; y++) { rows.push(Buffer.from([0])); for (let x = 0; x < 8; x++) rows.push(Buffer.from(pixel(x, y))); }
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]);
}
const json = { asset: { version: '2.0', generator: 'cocosair glTF diagnostics (MIT)' }, extensionsUsed: ['KHR_materials_unlit'],
    buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [], images: [], textures: [],
    samplers: [{ magFilter: 9728, minFilter: 9728, wrapS: 33071, wrapT: 33071 }], materials: [], meshes: [], nodes: [], scenes: [{ nodes: [] }], scene: 0 };
const binary = []; let size = 0;
function view(bytes) { while (size % 4) { binary.push(Buffer.alloc(1)); size++; } const index = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: size, byteLength: bytes.length }); binary.push(bytes); size += bytes.length; return index; }
function accessor(values, width) { const array = new Float32Array(values); const index = json.accessors.length;
    json.accessors.push({ bufferView: view(Buffer.from(array.buffer)), componentType: 5126, count: values.length / width, type: `VEC${width}` }); return index; }
const position = accessor([-0.7,-0.65,0, 0.7,-0.65,0, 0.7,0.65,0, -0.7,-0.65,0, 0.7,0.65,0, -0.7,0.65,0], 3);
const uv0 = accessor([0,1,1,1,1,0,0,1,1,0,0,0], 2);
const uv1 = accessor([1,1,0,1,0,0,1,1,0,0,1,0], 2);
for (const image of [png((x,y)=>x<4?(y<4?[255,0,0,255]:[0,0,255,255]):(y<4?[0,255,0,255]:[255,255,255,0])),
    png((x)=>[x<4?0:255,128,200,255]), png((x)=>x<4?[128,128,255,255]:[200,128,230,255])]) {
    const i = json.images.length; json.images.push({ bufferView: view(image), mimeType: 'image/png' }); json.textures.push({ source: i, sampler: 0 });
}
json.materials = [
    { name: 'unlit UV0 OPAQUE', extensions: { KHR_materials_unlit: {} }, pbrMetallicRoughness: { baseColorTexture: { index: 0 } } },
    { name: 'unlit UV1 MASK', extensions: { KHR_materials_unlit: {} }, pbrMetallicRoughness: { baseColorTexture: { index: 0, texCoord: 1 } }, alphaMode: 'MASK' },
    { name: 'unlit BLEND', extensions: { KHR_materials_unlit: {} }, pbrMetallicRoughness: { baseColorTexture: { index: 0 }, baseColorFactor: [1,1,1,0.5] }, alphaMode: 'BLEND' },
    { name: 'PBR MR + AO UV1', pbrMetallicRoughness: { baseColorFactor: [0.7,0.35,0.15,1], metallicRoughnessTexture: { index: 1 } }, occlusionTexture: { index: 1, texCoord: 1, strength: 0.7 }, normalTexture: { index: 2 } },
    { name: 'PBR emissive, double-sided', pbrMetallicRoughness: { baseColorFactor: [0.1,0.1,0.1,1] }, emissiveFactor: [1,1,1], emissiveTexture: { index: 0 }, doubleSided: true },
    { name: 'mirrored, single-sided', extensions: { KHR_materials_unlit: {} }, pbrMetallicRoughness: { baseColorTexture: { index: 0 } } },
];
for (let i=0;i<6;i++) {
    json.meshes.push({ primitives: [{ attributes: { POSITION: position, TEXCOORD_0: uv0, TEXCOORD_1: uv1 }, material: i }] });
    json.nodes.push({ mesh: i, name: json.materials[i].name, translation: [(i%3-1)*1.7, i<3?0.9:-0.9, 0], scale: i===5?[-1,1,1]:[1,1,1] });
    json.scenes[0].nodes.push(i);
}
json.buffers[0].byteLength = size;
const bytes = Buffer.concat(binary); const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
fs.writeFileSync(path.join(out,'diagnostics.glb'),Buffer.from(mod.exports.toGLB(json,buffer)));
console.log('Generated combined.glb and diagnostics.glb');
