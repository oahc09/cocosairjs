/* Original deterministic sheen sample. MIT, same license as cocosair.js.
 * Writes only examples/gltf-viewer/assets/sheen.glb. No downloads. */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const doc = {
    asset: { version: '2.0', generator: 'Cocos AIR sheen sample (MIT)' },
    extensionsUsed: ['KHR_materials_sheen', 'KHR_texture_transform'],
    extensionsRequired: ['KHR_materials_sheen', 'KHR_texture_transform'],
    buffers: [{ byteLength: 0 }],
    bufferViews: [],
    accessors: [],
    materials: [],
    meshes: [],
    nodes: [],
    scenes: [{ nodes: [0, 1, 2, 3] }],
    scene: 0,
};
const chunks = [];
let size = 0;
function view(bytes) {
    while (size % 4) {
        chunks.push(Buffer.alloc(1));
        size++;
    }
    const index = doc.bufferViews.length;
    doc.bufferViews.push({ buffer: 0, byteOffset: size, byteLength: bytes.length });
    chunks.push(bytes);
    size += bytes.length;
    return index;
}
function accessor(values, width) {
    const data = new Float32Array(values);
    const index = doc.accessors.length;
    const entry = {
        bufferView: view(Buffer.from(data.buffer)),
        componentType: 5126,
        count: values.length / width,
        type: `VEC${width}`,
    };
    if (width === 3 && index === 0) {
        entry.min = [-1, -1, -1];
        entry.max = [1, 1, 1];
    }
    doc.accessors.push(entry);
    return index;
}
const positions = [],
    normals = [],
    uv0 = [],
    uv1 = [];
function vertex(x, y) {
    const u = x / 32,
        v = y / 16;
    const theta = u * Math.PI * 2,
        phi = v * Math.PI;
    const p = [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
    positions.push(...p);
    normals.push(...p);
    uv0.push(u, v);
    uv1.push(1 - u, v);
}
for (let y = 0; y < 16; y++)
    for (let x = 0; x < 32; x++) {
        vertex(x, y);
        vertex(x + 1, y);
        vertex(x + 1, y + 1);
        vertex(x, y);
        vertex(x + 1, y + 1);
        vertex(x, y + 1);
    }
const attributes = {
    POSITION: accessor(positions, 3),
    NORMAL: accessor(normals, 3),
    TEXCOORD_0: accessor(uv0, 2),
    TEXCOORD_1: accessor(uv1, 2),
};
function pngChunk(type, data) {
    const content = Buffer.concat([Buffer.from(type), data]);
    let crc = -1;
    for (const byte of content) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const head = Buffer.alloc(4),
        tail = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    tail.writeUInt32BE((crc ^ -1) >>> 0);
    return Buffer.concat([head, content, tail]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(8);
ihdr.writeUInt32BE(8, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const rows = [];
for (let y = 0; y < 8; y++) {
    rows.push(Buffer.from([0]));
    for (let x = 0; x < 8; x++) rows.push(Buffer.from(x < 4 ? [200, 80, 40, 255] : [40, 120, 220, 48]));
}
const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
]);
doc.images = [{ bufferView: view(png), mimeType: 'image/png' }];
doc.samplers = [{ magFilter: 9728, minFilter: 9728, wrapS: 10497, wrapT: 10497 }];
doc.textures = [{ source: 0, sampler: 0 }];
const layers = [
    null,
    { sheenColorFactor: [0.8, 0.3, 0.12], sheenRoughnessFactor: 0.25 },
    { sheenColorFactor: [0.8, 0.3, 0.12], sheenRoughnessFactor: 0.8 },
    {
        sheenColorFactor: [0.9, 0.9, 0.9],
        sheenRoughnessFactor: 0.8,
        sheenColorTexture: {
            index: 0,
            extensions: { KHR_texture_transform: { texCoord: 1, scale: [2, 1], offset: [0.125, 0] } },
        },
        sheenRoughnessTexture: { index: 0 },
    },
];
const names = ['bare control', 'sheen narrow', 'sheen soft', 'sheen textured UV1'];
for (let i = 0; i < 4; i++) {
    doc.materials.push({
        name: names[i],
        pbrMetallicRoughness: { baseColorFactor: [0.12, 0.08, 0.06, 1], metallicFactor: 0, roughnessFactor: 0.8 },
        ...(layers[i] ? { extensions: { KHR_materials_sheen: layers[i] } } : {}),
    });
    doc.meshes.push({ primitives: [{ attributes, material: i }] });
    doc.nodes.push({ name: names[i], mesh: i, translation: [(i % 2) * 2.5 - 1.25, i < 2 ? 1.25 : -1.25, 0] });
}
doc.buffers[0].byteLength = size;
const json = Buffer.from(JSON.stringify(doc)),
    jsonSize = Math.ceil(json.length / 4) * 4;
const bin = Buffer.concat(chunks),
    binSize = Math.ceil(bin.length / 4) * 4;
const glb = Buffer.alloc(28 + jsonSize + binSize);
glb.writeUInt32LE(0x46546c67);
glb.writeUInt32LE(2, 4);
glb.writeUInt32LE(glb.length, 8);
glb.writeUInt32LE(jsonSize, 12);
glb.writeUInt32LE(0x4e4f534a, 16);
glb.fill(32, 20, 20 + jsonSize);
json.copy(glb, 20);
glb.writeUInt32LE(binSize, 20 + jsonSize);
glb.writeUInt32LE(0x004e4942, 24 + jsonSize);
bin.copy(glb, 28 + jsonSize);
fs.writeFileSync(path.resolve(__dirname, '../../examples/gltf-viewer/assets/sheen.glb'), glb);
console.log('Generated sheen.glb');
