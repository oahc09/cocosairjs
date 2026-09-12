/**
 * Generates the V0.5 geometry fixtures (plain / quantized / meshopt KHR+EXT / Draco) with the
 * official encoders. Fixtures are deterministic and committed; run:
 *   node tools/fixtures/gen-geometry-fixtures.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'test', 'fixtures', 'gltf', 'geometry');
const DRACO = path.join(ROOT, 'build', 'gltf-decoders', 'draco', 'draco3d.js');
const MESHOPT_ENCODER = path.join(ROOT, 'build', 'gltf-decoders', 'meshopt', 'meshopt_encoder.mjs');

// One quad: two triangles, negative and positive coordinates, unit normals.
const POSITIONS = [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0];
const NORMALS = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
const UVS = [0, 0, 1, 0, 1, 1, 0, 1];
const INDICES = [0, 1, 2, 0, 2, 3];
const COUNT = 4;

class Builder {
    constructor () {
        this.chunks = [];
        this.length = 0;
        this.bufferViews = [];
        this.accessors = [];
    }
    get byteLength () { return this.length; }
    /** Appends one bufferView and returns its index. */
    view (bytes) {
        while (this.length % 4) { this.chunks.push(Buffer.alloc(1)); ++this.length; }
        const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const index = this.bufferViews.length;
        this.bufferViews.push({ buffer: 0, byteOffset: this.length, byteLength: buffer.byteLength });
        this.chunks.push(buffer); this.length += buffer.byteLength;
        return index;
    }
    accessor (viewIndex, componentType, count, type, extra) {
        const index = this.accessors.length;
        this.accessors.push(Object.assign({ bufferView: viewIndex, componentType, count, type }, extra));
        return index;
    }
    /** Appends unaligned bytes without creating a view (used for encoded payloads). */
    raw (bytes) {
        const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        this.chunks.push(buffer); this.length += buffer.byteLength;
    }
    /** Declares a view over bytes that are not (yet) present in the buffer. */
    declareView (byteOffset, byteLength, byteStride) {
        const index = this.bufferViews.length;
        const view = { buffer: 0, byteOffset, byteLength };
        if (byteStride) { view.byteStride = byteStride; }
        this.bufferViews.push(view);
        return index;
    }
    finish () {
        const bin = Buffer.concat(this.chunks);
        return { bin, bufferViews: this.bufferViews, accessors: this.accessors, extra: this.extra };
    }
}

function toGLB (json, bins) {
    const text = Buffer.from(JSON.stringify(json), 'utf8');
    const jsonSize = Math.ceil(text.length / 4) * 4;
    const padded = [text];
    while (Buffer.concat(padded).length < jsonSize) { padded.push(Buffer.from(' ')); }
    const parts = [];
    for (const bin of bins) {
        const size = Math.ceil(bin.byteLength / 4) * 4;
        const chunk = Buffer.alloc(size); Buffer.from(bin).copy(chunk); parts.push(chunk);
    }
    const total = 12 + 8 + jsonSize + parts.reduce((sum, p) => sum + 8 + p.length, 0);
    const out = Buffer.alloc(total);
    out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
    out.writeUInt32LE(jsonSize, 12); out.writeUInt32LE(0x4e4f534a, 16);
    Buffer.concat(padded).copy(out, 20);
    let offset = 20 + jsonSize;
    for (const part of parts) {
        out.writeUInt32LE(part.length, offset); out.writeUInt32LE(0x004e4942, offset + 4);
        part.copy(out, offset + 8); offset += 8 + part.length;
    }
    return out;
}

function write (name, json, bins) {
    const glb = toGLB(json, bins);
    fs.writeFileSync(path.join(OUT, name), glb);
    console.log(`${name}: ${glb.length} bytes, sha256 ${crypto.createHash('sha256').update(glb).digest('hex').slice(0, 16)}`);
}

/** Plain float baseline: what every compressed variant must match. */
function plain () {
    const b = new Builder();
    const p = b.view(new Float32Array(POSITIONS));
    const n = b.view(new Float32Array(NORMALS));
    const t = b.view(new Float32Array(UVS));
    const i = b.view(new Uint16Array(INDICES));
    const { bin } = b.finish();
    const json = {
        asset: { version: '2.0', generator: 'cocosair fixture generator (plain)' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        buffers: [{ byteLength: b.byteLength }],
        bufferViews: b.bufferViews,
        accessors: [
            Object.assign({ bufferView: p, componentType: 5126, count: COUNT, type: 'VEC3', min: [-0.5, 0, 0], max: [0.5, 1, 0] }, {}),
            { bufferView: n, componentType: 5126, count: COUNT, type: 'VEC3' },
            { bufferView: t, componentType: 5126, count: COUNT, type: 'VEC2' },
            { bufferView: i, componentType: 5123, count: INDICES.length, type: 'SCALAR' },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
        materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } }],
    };
    write('plain.glb', json, [bin]);
}

/** KHR_mesh_quantization: 16-bit positions, 8-bit normals, 16-bit UVs, all normalized. */
function quantized () {
    const b = new Builder();
    const q = (values, scale) => values.map((v) => Math.round(v * scale));
    const p = b.view(new Int16Array(q(POSITIONS, 32767)));
    const n = b.view(new Int8Array(q(NORMALS, 127)));
    const t = b.view(new Uint16Array(q(UVS, 65535)));
    const i = b.view(new Uint16Array(INDICES));
    const { bin } = b.finish();
    const json = {
        asset: { version: '2.0', generator: 'cocosair fixture generator (quantized)' },
        extensionsUsed: ['KHR_mesh_quantization'],
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        buffers: [{ byteLength: b.byteLength }],
        bufferViews: b.bufferViews,
        accessors: [
            { bufferView: p, componentType: 5122, normalized: true, count: COUNT, type: 'VEC3', min: [-0.5, 0, 0], max: [0.5, 1, 0] },
            { bufferView: n, componentType: 5120, normalized: true, count: COUNT, type: 'VEC3' },
            { bufferView: t, componentType: 5123, normalized: true, count: COUNT, type: 'VEC2' },
            { bufferView: i, componentType: 5123, count: INDICES.length, type: 'SCALAR' },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
        materials: [{ pbrMetallicRoughness: { baseColorFactor: [0, 1, 0, 1] } }],
    };
    write('quantized.glb', json, [bin]);
}

/** Interleaved vertex buffer (position/normal/uv) used by both meshopt variants. */
function interleaved () {
    const stride = 32;
    const bytes = Buffer.alloc(stride * COUNT);
    for (let i = 0; i < COUNT; ++i) {
        for (let c = 0; c < 3; ++c) {
            bytes.writeFloatLE(POSITIONS[i * 3 + c], i * stride + c * 4);
            bytes.writeFloatLE(NORMALS[i * 3 + c], i * stride + 12 + c * 4);
        }
        bytes.writeFloatLE(UVS[i * 2], i * stride + 24);
        bytes.writeFloatLE(UVS[i * 2 + 1], i * stride + 28);
    }
    return bytes;
}

async function meshopt (encoder, { name, extension, fallback, indexMode }) {
    const vertices = interleaved();
    const indices = Buffer.alloc(INDICES.length * 2);
    INDICES.forEach((v, i) => indices.writeUInt16LE(v, i * 2));
    const encodedVertices = Buffer.from(encoder.encodeGltfBuffer(new Uint8Array(vertices), COUNT, 32, 'ATTRIBUTES'));
    const encodedIndices = Buffer.from(encoder.encodeGltfBuffer(new Uint8Array(indices), INDICES.length, 2, indexMode));
    const payload = Buffer.concat([encodedVertices, encodedIndices]);
    const b = new Builder();
    let vertexView;
    let indexView;
    if (fallback) {
        // GLB carries a single BIN chunk: the uncompressed data and the payload share buffer 0.
        vertexView = b.view(new Uint8Array(vertices));
        b.bufferViews[vertexView].byteStride = 32;
        indexView = b.view(new Uint8Array(indices));
        b.raw(payload);
    } else {
        // No fallback: the buffer only holds the payload, so the extension must be required.
        vertexView = b.declareView(0, vertices.length, 32);
        indexView = b.declareView(0, indices.length);
        b.raw(payload);
    }
    b.bufferViews[vertexView].extensions = {
        [extension]: { buffer: 0, byteOffset: fallback ? vertices.length + indices.length : 0,
            byteLength: encodedVertices.length, byteStride: 32, count: COUNT, mode: 'ATTRIBUTES' },
    };
    b.bufferViews[indexView].extensions = {
        [extension]: { buffer: 0, byteOffset: (fallback ? vertices.length + indices.length : 0) + encodedVertices.length,
            byteLength: encodedIndices.length, byteStride: 2, count: INDICES.length, mode: indexMode },
    };
    const { bin } = b.finish();
    const json = {
        asset: { version: '2.0', generator: `cocosair fixture generator (${extension})` },
        extensionsUsed: [extension],
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        buffers: [{ byteLength: b.byteLength }],
        bufferViews: b.bufferViews,
        accessors: [
            { bufferView: vertexView, byteOffset: 0, componentType: 5126, count: COUNT, type: 'VEC3', min: [-0.5, 0, 0], max: [0.5, 1, 0] },
            { bufferView: vertexView, byteOffset: 12, componentType: 5126, count: COUNT, type: 'VEC3' },
            { bufferView: vertexView, byteOffset: 24, componentType: 5126, count: COUNT, type: 'VEC2' },
            { bufferView: indexView, componentType: 5123, count: INDICES.length, type: 'SCALAR' },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
        materials: [{ pbrMetallicRoughness: { baseColorFactor: [0, 0, 1, 1] } }],
    };
    if (!fallback) { json.extensionsRequired = [extension]; }
    write(name, json, [bin]);
}

async function draco () {
    const draco3d = require(DRACO);
    const module = await draco3d.createEncoderModule({});
    const encoder = new module.Encoder();
    const builder = new module.MeshBuilder();
    const mesh = new module.Mesh();
    builder.AddFacesToMesh(mesh, INDICES.length / 3, new Uint32Array(INDICES));
    const ids = {
        POSITION: builder.AddFloatAttributeToMesh(mesh, module.POSITION, COUNT, 3, new Float32Array(POSITIONS)),
        NORMAL: builder.AddFloatAttributeToMesh(mesh, module.NORMAL, COUNT, 3, new Float32Array(NORMALS)),
        TEXCOORD_0: builder.AddFloatAttributeToMesh(mesh, module.TEX_COORD, COUNT, 2, new Float32Array(UVS)),
    };
    encoder.SetSpeedOptions(5, 5);
    encoder.SetAttributeQuantization(module.POSITION, 14);
    encoder.SetAttributeQuantization(module.NORMAL, 10);
    encoder.SetAttributeQuantization(module.TEX_COORD, 12);
    encoder.SetEncodingMethod(module.MESH_EDGEBREAKER_ENCODING);
    const encoded = new module.DracoInt8Array();
    const length = encoder.EncodeMeshToDracoBuffer(mesh, encoded);
    const payload = Buffer.alloc(length);
    for (let i = 0; i < length; ++i) { payload[i] = encoded.GetValue(i) & 0xff; }
    module.destroy(encoder); module.destroy(builder); module.destroy(mesh);

    const b = new Builder();
    const view = b.view(new Uint8Array(payload));
    const { bin } = b.finish();
    const json = {
        asset: { version: '2.0', generator: 'cocosair fixture generator (draco)' },
        extensionsRequired: ['KHR_draco_mesh_compression'],
        extensionsUsed: ['KHR_draco_mesh_compression'],
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        buffers: [{ byteLength: b.byteLength }],
        bufferViews: b.bufferViews,
        // Accessors declare the decoded counts only: the payload lives in the Draco bufferView.
        accessors: [
            { componentType: 5126, count: COUNT, type: 'VEC3', min: [-0.5, 0, 0], max: [0.5, 1, 0] },
            { componentType: 5126, count: COUNT, type: 'VEC3' },
            { componentType: 5126, count: COUNT, type: 'VEC2' },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, material: 0,
            extensions: { KHR_draco_mesh_compression: { bufferView: view, attributes: ids } } }] }],
        materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 1, 0, 1] } }],
    };
    write('draco.glb', json, [bin]);
}

// --- Combination fixtures ------------------------------------------------------------
// One mesh that exercises every geometry feature at once: two primitives with two
// materials, 32-bit indices, four skin influences and one morph target.

const JOINTS = [0, 1, 0, 0, 0, 1, 0, 0, 1, 2, 0, 0, 1, 2, 0, 0];
const WEIGHTS = [0.6, 0.4, 0, 0, 0.7, 0.3, 0, 0, 0.5, 0.5, 0, 0, 0.8, 0.2, 0, 0];
const MORPH = [0, 0.25, 0, 0, 0.25, 0, 0, -0.25, 0, 0, -0.25, 0];
const COMBO_NODES = [
    { mesh: 0, skin: 0, children: [1, 2, 3] },
    { name: 'bone0', translation: [0, 0, 0] },
    { name: 'bone1', translation: [0, 1, 0] },
    { name: 'bone2', translation: [0, 2, 0] },
];
const COMBO_ATTRIBUTES = { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, JOINTS_0: 3, WEIGHTS_0: 4 };

/** Interleaved position/normal/uv/joints/weights: 56 bytes per vertex. */
function interleavedSkinned () {
    const stride = 56;
    const bytes = Buffer.alloc(stride * COUNT);
    for (let i = 0; i < COUNT; ++i) {
        for (let c = 0; c < 3; ++c) {
            bytes.writeFloatLE(POSITIONS[i * 3 + c], i * stride + c * 4);
            bytes.writeFloatLE(NORMALS[i * 3 + c], i * stride + 12 + c * 4);
        }
        bytes.writeFloatLE(UVS[i * 2], i * stride + 24);
        bytes.writeFloatLE(UVS[i * 2 + 1], i * stride + 28);
        for (let c = 0; c < 4; ++c) {
            bytes.writeUInt16LE(JOINTS[i * 4 + c], i * stride + 32 + c * 2);
            bytes.writeFloatLE(WEIGHTS[i * 4 + c], i * stride + 40 + c * 4);
        }
    }
    return bytes;
}
function u32 (values) {
    const out = Buffer.alloc(values.length * 4);
    values.forEach((v, i) => out.writeUInt32LE(v, i * 4));
    return out;
}

/** Two meshopt-compressed primitives sharing one skinned vertex buffer. */
async function meshoptCombo (encoder) {
    const vertices = interleavedSkinned();
    const idx0 = u32([0, 1, 2, 0, 2, 3]);
    const idx1 = u32([0, 2, 3, 0, 3, 1]);
    const ext = 'EXT_meshopt_compression';
    const ev = Buffer.from(encoder.encodeGltfBuffer(new Uint8Array(vertices), COUNT, 56, 'ATTRIBUTES'));
    const e0 = Buffer.from(encoder.encodeGltfBuffer(new Uint8Array(idx0), idx0.length / 4, 4, 'INDICES'));
    const e1 = Buffer.from(encoder.encodeGltfBuffer(new Uint8Array(idx1), idx1.length / 4, 4, 'INDICES'));
    const b = new Builder();
    const v = b.view(new Uint8Array(vertices)); b.bufferViews[v].byteStride = 56;
    const i0 = b.view(new Uint8Array(idx0));
    const i1 = b.view(new Uint8Array(idx1));
    const m = b.view(new Float32Array(MORPH));
    const offV = b.byteLength; b.raw(ev);
    const off0 = b.byteLength; b.raw(e0);
    const off1 = b.byteLength; b.raw(e1);
    b.bufferViews[v].extensions = { [ext]: { buffer: 0, byteOffset: offV, byteLength: ev.length, byteStride: 56, count: COUNT, mode: 'ATTRIBUTES' } };
    b.bufferViews[i0].extensions = { [ext]: { buffer: 0, byteOffset: off0, byteLength: e0.length, byteStride: 4, count: idx0.length / 4, mode: 'INDICES' } };
    b.bufferViews[i1].extensions = { [ext]: { buffer: 0, byteOffset: off1, byteLength: e1.length, byteStride: 4, count: idx1.length / 4, mode: 'INDICES' } };
    const { bin } = b.finish();
    const json = {
        asset: { version: '2.0', generator: 'cocosair fixture generator (meshopt combo)' },
        extensionsUsed: [ext],
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: COMBO_NODES,
        skins: [{ joints: [1, 2, 3] }],
        buffers: [{ byteLength: b.byteLength }],
        bufferViews: b.bufferViews,
        accessors: [
            { bufferView: v, byteOffset: 0, componentType: 5126, count: COUNT, type: 'VEC3', min: [-0.5, 0, 0], max: [0.5, 1, 0] },
            { bufferView: v, byteOffset: 12, componentType: 5126, count: COUNT, type: 'VEC3' },
            { bufferView: v, byteOffset: 24, componentType: 5126, count: COUNT, type: 'VEC2' },
            { bufferView: v, byteOffset: 32, componentType: 5123, count: COUNT, type: 'VEC4' },
            { bufferView: v, byteOffset: 40, componentType: 5126, count: COUNT, type: 'VEC4' },
            { bufferView: i0, componentType: 5125, count: idx0.length / 4, type: 'SCALAR' },
            { bufferView: i1, componentType: 5125, count: idx1.length / 4, type: 'SCALAR' },
            { bufferView: m, componentType: 5126, count: COUNT, type: 'VEC3' },
        ],
        meshes: [{ primitives: [
            { attributes: COMBO_ATTRIBUTES, indices: 5, material: 0, targets: [{ POSITION: 7 }] },
            { attributes: COMBO_ATTRIBUTES, indices: 6, material: 1, targets: [{ POSITION: 7 }] },
        ] }],
        materials: [
            { pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } },
            { pbrMetallicRoughness: { baseColorFactor: [0, 0, 1, 1] } },
        ],
    };
    write('meshopt-combo.glb', json, [bin]);
}

/** Two Draco-compressed primitives with skin channels; morph targets must be reported, not guessed. */
async function dracoCombo () {
    const draco3d = require(DRACO);
    const module = await draco3d.createEncoderModule({});
    const encode = (indices) => {
        const encoder = new module.Encoder();
        const builder = new module.MeshBuilder();
        const mesh = new module.Mesh();
        builder.AddFacesToMesh(mesh, indices.length / 3, new Uint32Array(indices));
        const ids = {
            POSITION: builder.AddFloatAttributeToMesh(mesh, module.POSITION, COUNT, 3, new Float32Array(POSITIONS)),
            NORMAL: builder.AddFloatAttributeToMesh(mesh, module.NORMAL, COUNT, 3, new Float32Array(NORMALS)),
            TEXCOORD_0: builder.AddFloatAttributeToMesh(mesh, module.TEX_COORD, COUNT, 2, new Float32Array(UVS)),
            JOINTS_0: builder.AddInt32AttributeToMesh(mesh, module.GENERIC, COUNT, 4, new Int32Array(JOINTS)),
            WEIGHTS_0: builder.AddFloatAttributeToMesh(mesh, module.GENERIC, COUNT, 4, new Float32Array(WEIGHTS)),
        };
        encoder.SetSpeedOptions(5, 5);
        encoder.SetAttributeQuantization(module.POSITION, 14);
        encoder.SetAttributeQuantization(module.NORMAL, 10);
        encoder.SetAttributeQuantization(module.TEX_COORD, 12);
        // Skin channels are GENERIC attributes: quantizing them would break joint indices.
        encoder.SetAttributeQuantization(module.GENERIC, -1);
        encoder.SetEncodingMethod(module.MESH_EDGEBREAKER_ENCODING);
        const encoded = new module.DracoInt8Array();
        const length = encoder.EncodeMeshToDracoBuffer(mesh, encoded);
        const payload = Buffer.alloc(length);
        for (let i = 0; i < length; ++i) { payload[i] = encoded.GetValue(i) & 0xff; }
        module.destroy(encoder); module.destroy(builder); module.destroy(mesh);
        return { payload, ids };
    };
    const a = encode([0, 1, 2, 0, 2, 3]);
    const c = encode([0, 2, 3, 0, 3, 1]);
    const b = new Builder();
    const v0 = b.view(new Uint8Array(a.payload));
    const v1 = b.view(new Uint8Array(c.payload));
    const m = b.view(new Float32Array(MORPH));
    const { bin } = b.finish();
    const json = {
        asset: { version: '2.0', generator: 'cocosair fixture generator (draco combo)' },
        extensionsRequired: ['KHR_draco_mesh_compression'],
        extensionsUsed: ['KHR_draco_mesh_compression'],
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: COMBO_NODES,
        skins: [{ joints: [1, 2, 3] }],
        buffers: [{ byteLength: b.byteLength }],
        bufferViews: b.bufferViews,
        accessors: [
            { componentType: 5126, count: COUNT, type: 'VEC3', min: [-0.5, 0, 0], max: [0.5, 1, 0] },
            { componentType: 5126, count: COUNT, type: 'VEC3' },
            { componentType: 5126, count: COUNT, type: 'VEC2' },
            { componentType: 5123, count: COUNT, type: 'VEC4' },
            { componentType: 5126, count: COUNT, type: 'VEC4' },
            { bufferView: m, componentType: 5126, count: COUNT, type: 'VEC3' },
        ],
        meshes: [{ primitives: [
            { attributes: COMBO_ATTRIBUTES, material: 0, targets: [{ POSITION: 5 }],
                extensions: { KHR_draco_mesh_compression: { bufferView: v0, attributes: a.ids } } },
            { attributes: COMBO_ATTRIBUTES, material: 1, targets: [{ POSITION: 5 }],
                extensions: { KHR_draco_mesh_compression: { bufferView: v1, attributes: c.ids } } },
        ] }],
        materials: [
            { pbrMetallicRoughness: { baseColorFactor: [1, 0, 1, 1] } },
            { pbrMetallicRoughness: { baseColorFactor: [0, 1, 1, 1] } },
        ],
    };
    write('draco-combo.glb', json, [bin]);
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    plain();
    quantized();
    const { MeshoptEncoder } = await import(pathToFileURL(MESHOPT_ENCODER).href);
    await MeshoptEncoder.ready;
    await meshopt(MeshoptEncoder, { name: 'meshopt-ext.glb', extension: 'EXT_meshopt_compression', fallback: true, indexMode: 'INDICES' });
    await meshopt(MeshoptEncoder, { name: 'meshopt-khr.glb', extension: 'KHR_meshopt_compression', fallback: true, indexMode: 'TRIANGLES' });
    await meshopt(MeshoptEncoder, { name: 'meshopt-required.glb', extension: 'EXT_meshopt_compression', fallback: false, indexMode: 'INDICES' });
    await meshoptCombo(MeshoptEncoder);
    await draco();
    await dracoCombo();
})().catch((error) => { console.error(error); process.exit(1); });
