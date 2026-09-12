import type { GLTFDocument } from '../../../src/air/assets/gltf/schema';

/** Original test geometry, MIT licensed with this repository. No downloaded runtime dependencies. */
export function fixture (): { json: GLTFDocument; bin: ArrayBuffer; glb: ArrayBuffer } {
    const chunks: Uint8Array[] = [];
    let length = 0;
    const json: GLTFDocument = { asset: { version: '2.0' }, buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [],
        meshes: [], nodes: [], scenes: [{ nodes: [0] }], scene: 0 };
    const accessor = (data: Float32Array | Uint16Array, type: string): number => {
        while (length % 4) { chunks.push(new Uint8Array(1)); ++length; }
        const bytes = new Uint8Array(data.buffer); chunks.push(bytes);
        const viewIndex = json.bufferViews!.length;
        json.bufferViews!.push({ buffer: 0, byteOffset: length, byteLength: bytes.byteLength }); length += bytes.byteLength;
        const index = json.accessors!.length;
        json.accessors!.push({ bufferView: viewIndex, componentType: data instanceof Float32Array ? 5126 : 5123,
            count: data.length / ({ SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[type]!), type });
        return index;
    };
    const p = accessor(new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1, 0]), 'VEC3');
    const n = accessor(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 'VEC3');
    const joints = accessor(new Uint16Array([0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 'VEC4');
    const weights = accessor(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 'VEC4');
    const target = accessor(new Float32Array([0, 0, 0, 0, 0, 0, 0, 1, 0]), 'VEC3');
    const times = accessor(new Float32Array([0, 2]), 'SCALAR');
    const moves = accessor(new Float32Array([0, 0, 0, 2, 0, 0]), 'VEC3');
    const morph = accessor(new Float32Array([0, 1]), 'SCALAR');
    const rotations = accessor(new Float32Array([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.5, 0,
        0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]), 'VEC4');
    json.meshes = [{ primitives: [{ attributes: { POSITION: p, NORMAL: n, JOINTS_0: joints, WEIGHTS_0: weights }, targets: [{ POSITION: target }] }], weights: [0] }];
    json.nodes = [{ name: 'root', children: [1, 3], translation: [3, 0, 0] }, { name: 'bone/name', children: [2] },
        { name: 'bone/name', translation: [0, 1, 0] }, { name: 'mesh', mesh: 0, skin: 0 }];
    json.skins = [{ joints: [2, 1] }];
    json.animations = [{ name: 'move', samplers: [{ input: times, output: moves }, { input: times, output: morph }],
        channels: [{ sampler: 0, target: { node: 1, path: 'translation' } }, { sampler: 1, target: { node: 3, path: 'weights' } }] },
    { name: 'cubic', samplers: [{ input: times, output: rotations, interpolation: 'CUBICSPLINE' }],
        channels: [{ sampler: 0, target: { node: 2, path: 'rotation' } }] }];
    json.buffers![0].byteLength = length;
    const bin = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bin.set(chunk, offset); offset += chunk.byteLength; }
    return { json, bin: bin.buffer, glb: toGLB(json, bin.buffer) };
}
export function toGLB (json: GLTFDocument, bin: ArrayBuffer): ArrayBuffer {
    const text = new TextEncoder().encode(JSON.stringify(json));
    const jsonSize = Math.ceil(text.length / 4) * 4; const binSize = Math.ceil(bin.byteLength / 4) * 4;
    const result = new ArrayBuffer(12 + 8 + jsonSize + 8 + binSize); const view = new DataView(result);
    view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, result.byteLength, true);
    view.setUint32(12, jsonSize, true); view.setUint32(16, 0x4e4f534a, true);
    const bytes = new Uint8Array(result); bytes.fill(32, 20, 20 + jsonSize); bytes.set(text, 20);
    view.setUint32(20 + jsonSize, binSize, true); view.setUint32(24 + jsonSize, 0x004e4942, true); bytes.set(new Uint8Array(bin), 28 + jsonSize);
    return result;
}
