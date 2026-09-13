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

// --- scene.glb: KHR_lights_punctual + EXT_mesh_gpu_instancing coverage fixtures ---
const sceneDoc = { asset: { version: '2.0', generator: 'cocosair scene fixtures (MIT)' },
    extensionsUsed: ['KHR_lights_punctual', 'EXT_mesh_gpu_instancing'], extensionsRequired: [],
    buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [], meshes: [], nodes: [],
    scenes: [{ nodes: [] }], scene: 0,
    materials: [{ name: 'sand pbr', pbrMetallicRoughness: { baseColorFactor: [0.85, 0.55, 0.2, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } }] };
const sceneChunks = []; let sceneSize = 0;
function sceneView(data) {
    while (sceneSize % 4) { sceneChunks.push(Buffer.alloc(1)); sceneSize++; }
    const i = sceneDoc.bufferViews.length;
    sceneDoc.bufferViews.push({ buffer: 0, byteOffset: sceneSize, byteLength: data.byteLength ?? data.length });
    sceneChunks.push(Buffer.from(data.buffer ?? data)); sceneSize += data.byteLength ?? data.length; return i;
}
function floatAcc(values, width) { const a = new Float32Array(values);
    sceneDoc.accessors.push({ bufferView: sceneView(a), componentType: 5126, count: values.length / width, type: `VEC${width}` });
    return sceneDoc.accessors.length - 1; }
function ushortAcc(values) { const a = new Uint16Array(values);
    sceneDoc.accessors.push({ bufferView: sceneView(a), componentType: 5123, count: values.length, type: 'SCALAR' });
    return sceneDoc.accessors.length - 1; }
// cube: 8 shared vertices, 36 indices (flat per-face winding requires split verts; keep a simple
// 8-vertex cube with indices for the instancing expansion path)
const cubePos = floatAcc([-0.4,-0.4,-0.4, 0.4,-0.4,-0.4, 0.4,0.4,-0.4, -0.4,0.4,-0.4,
    -0.4,-0.4,0.4, 0.4,-0.4,0.4, 0.4,0.4,0.4, -0.4,0.4,0.4], 3);
// averaged per-vertex normals (8 cube corners), unit length
const k = 1 / Math.sqrt(3);
const cubeNrm = floatAcc([-k,-k,-k, k,-k,-k, k,k,-k, -k,k,-k,
    -k,-k,k, k,-k,k, k,k,k, -k,k,k], 3);
const cubeIdx = ushortAcc([0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 2,3,7, 2,7,6, 1,2,6, 1,6,5, 0,4,7, 0,7,3]);
sceneDoc.meshes.push({ primitives: [{ attributes: { POSITION: cubePos, NORMAL: cubeNrm }, indices: cubeIdx, material: 0 }] });
// node 0: instanced cube (4 instances with rotation variety and one negative-scale instance)
sceneDoc.nodes.push({ name: 'instanced cubes', mesh: 0, translation: [0, 0.5, -1],
    extensions: { EXT_mesh_gpu_instancing: { attributes: {
        TRANSLATION: floatAcc([-1.5,0,0, -0.5,0,0, 0.5,0,0, 1.5,0,0], 3),
        ROTATION: floatAcc([0,0,0,1, 0,0.259,0,0.966, 0,0.5,0,0.866, 0,0.707,0,0.707], 4),
        SCALE: floatAcc([1,1,1, 1,1,1, 1.4,1.4,1.4, -1,1,1], 3),
    } } } });
// nodes 1..4: one per light kind; spot references an extra shared point-light definition below
sceneDoc.nodes.push({ name: 'key light', extensions: { KHR_lights_punctual: { light: 0 } } });
sceneDoc.nodes.push({ name: 'bulb', translation: [-1.5, 1.1, 2.2], extensions: { KHR_lights_punctual: { light: 1 } } });
sceneDoc.nodes.push({ name: 'torch', translation: [1.5, 1.6, 2.4], rotation: [0.383, 0, 0, 0.924],
    extensions: { KHR_lights_punctual: { light: 2 } } });
sceneDoc.nodes.push({ name: 'bulb again', translation: [0, 1.1, 1.4], extensions: { KHR_lights_punctual: { light: 1 } } });
sceneDoc.scenes[0].nodes = [0, 1, 2, 3, 4];
sceneDoc.extensions = { KHR_lights_punctual: { lights: [
    { name: 'key', type: 'directional', color: [1, 0.95, 0.85], intensity: 40000 },
    { name: 'bulb', type: 'point', color: [0.3, 0.6, 1], intensity: 3000, range: 5 },
    { name: 'torch', type: 'spot', color: [1, 0.4, 0.2], intensity: 9000, range: 9, innerConeAngle: 0.1, outerConeAngle: 0.5 },
] } };
sceneDoc.buffers[0].byteLength = sceneSize;
const sceneBin = Buffer.concat(sceneChunks);
const sceneArrayBuf = sceneBin.buffer.slice(sceneBin.byteOffset, sceneBin.byteOffset + sceneBin.byteLength);
fs.writeFileSync(path.join(out, 'scene.glb'), Buffer.from(mod.exports.toGLB(sceneDoc, sceneArrayBuf)));

// --- physical.glb: T5.1 KHR_materials_ior / specular / emissive_strength fixtures ---
const phys = { asset: { version: '2.0', generator: 'cocosair physical fixtures (MIT)' },
    extensionsUsed: ['KHR_materials_ior', 'KHR_materials_specular', 'KHR_materials_emissive_strength', 'KHR_materials_clearcoat', 'KHR_lights_punctual'], extensionsRequired: [],
    buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [], images: [], textures: [],
    samplers: [{ magFilter: 9729, minFilter: 9729, wrapS: 10497, wrapT: 10497 }],
    meshes: [], nodes: [], scenes: [{ nodes: [] }], scene: 0 };
const physChunks = []; let physSize = 0;
function physView(bytes) {
    while (physSize % 4) { physChunks.push(Buffer.alloc(1)); physSize++; }
    const i = phys.bufferViews.length;
    phys.bufferViews.push({ buffer: 0, byteOffset: physSize, byteLength: bytes.length });
    physChunks.push(Buffer.from(bytes)); physSize += bytes.length; return i;
}
function physAcc(values, width) { const a = new Float32Array(values);
    phys.accessors.push({ bufferView: physView(Buffer.from(a.buffer)), componentType: 5126, count: values.length / width, type: `VEC${width}` });
    return phys.accessors.length - 1; }
const physPos = physAcc([-0.5,-0.5,0, 0.5,-0.5,0, 0.5,0.5,0, -0.5,-0.5,0, 0.5,0.5,0, -0.5,0.5,0], 3);
const physNrm = physAcc([0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1], 3);
const physUv = physAcc([0,1,1,1,1,0,0,1,1,0,0,0], 2);
// 8x8 checker: left half green channel 255, right half 0 (specularTexture G path -> x2)
const specPng = png((x) => [128, x < 4 ? 255 : 0, 128, 255]);
phys.images.push({ bufferView: physView(specPng), mimeType: 'image/png' });
phys.textures.push({ source: 0, sampler: 0 });
phys.materials = [
    { name: 'ior2.5 + strength4', pbrMetallicRoughness: { baseColorFactor: [0.2, 0.2, 0.22, 1], metallicFactor: 0, roughnessFactor: 0.4 },
        emissiveFactor: [0.5, 0.12, 0.04], extensions: { KHR_materials_ior: { ior: 2.5 },
            KHR_materials_specular: { specularFactor: [1, 1, 1, 1] }, KHR_materials_emissive_strength: { emissiveStrength: 4 } } },
    { name: 'identity pbr', pbrMetallicRoughness: { baseColorFactor: [0.2, 0.2, 0.22, 1], metallicFactor: 0, roughnessFactor: 0.4 },
        emissiveFactor: [0.5, 0.12, 0.04] },
    { name: 'specular map', pbrMetallicRoughness: { baseColorFactor: [0.8, 0.8, 0.85, 1], metallicFactor: 0.2, roughnessFactor: 0.25 },
        extensions: { KHR_materials_specular: { specularTexture: { index: 0 } } } },
    { name: 'clearcoat red', pbrMetallicRoughness: { baseColorFactor: [0.7, 0.04, 0.04, 1], metallicFactor: 0, roughnessFactor: 0.25 },
        extensions: { KHR_materials_clearcoat: { clearcoatFactor: 1, clearcoatRoughnessFactor: 0.15 } } },
    { name: 'bare red', pbrMetallicRoughness: { baseColorFactor: [0.7, 0.04, 0.04, 1], metallicFactor: 0, roughnessFactor: 0.25 } },
];
const offsets = [[-1.2, 0, 0], [0, 0, 0], [1.2, 0, 0], [-0.6, -1.15, 0], [0.6, -1.15, 0]];
for (let i = 0; i < 5; i++) {
    phys.meshes.push({ primitives: [{ attributes: { POSITION: physPos, NORMAL: physNrm, TEXCOORD_0: physUv }, material: i }] });
    phys.nodes.push({ mesh: i, name: phys.materials[i].name, translation: offsets[i] });
    phys.scenes[0].nodes.push(i);
}
phys.nodes.push({ name: 'gloss', translation: [0, 0.4, 3.2], extensions: { KHR_lights_punctual: { light: 0 } } });
phys.scenes[0].nodes.push(5);
phys.extensions = { KHR_lights_punctual: { lights: [
    { name: 'gloss', type: 'directional', color: [1, 1, 1], intensity: 2000 },
] } };
phys.buffers[0].byteLength = physSize;
const physBin = Buffer.concat(physChunks);
const physBuf = physBin.buffer.slice(physBin.byteOffset, physBin.byteOffset + physBin.byteLength);
fs.writeFileSync(path.join(out, 'physical.glb'), Buffer.from(mod.exports.toGLB(phys, physBuf)));
console.log('Generated combined.glb, diagnostics.glb, scene.glb and physical.glb');
