function makePackedRotationGlb(componentType, normalized) {
    const rotationBytes = { 5120: 4, 5121: 4, 5122: 8, 5126: 16 }[componentType];
    if (!rotationBytes) throw Error('unexpected fixture accessor type');
    const bin = new Uint8Array(60 + rotationBytes);
    const data = new DataView(bin.buffer);
    const positions = [0, 0, 0, 1, 0, 0, 0, 0.5, 0];
    positions.forEach((n, i) => data.setFloat32(4 * i, n, true));
    [2, 3, 4].forEach((n, i) => data.setFloat32(36 + 4 * i, n, true));
    if (componentType === 5126)
        [0, Math.SQRT1_2, 0, Math.SQRT1_2].forEach((n, i) => data.setFloat32(48 + 4 * i, n, true));
    else if (componentType === 5122) [0, 23170, 0, 23170].forEach((n, i) => data.setInt16(48 + 2 * i, n, true));
    else [0, 90, 0, 90].forEach((n, i) => data.setInt8(48 + i, n));
    const scaleOffset = 48 + rotationBytes;
    [2, 1, 1].forEach((n, i) => data.setFloat32(scaleOffset + 4 * i, n, true));
    const ext = 'EXT_mesh_gpu_instancing';
    const model = {
        asset: { version: '2.0' },
        extensionsUsed: [ext, 'KHR_materials_unlit'],
        extensionsRequired: [ext],
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [
            {
                name: 'anchor',
                mesh: 0,
                translation: [10, 20, 30],
                rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
                extensions: { [ext]: { attributes: { TRANSLATION: 1, ROTATION: 2, SCALE: 3 } } },
            },
        ],
        materials: [
            {
                doubleSided: true,
                pbrMetallicRoughness: { baseColorFactor: [1, 0.03, 0.02, 1] },
                extensions: { KHR_materials_unlit: {} },
            },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
        buffers: [{ byteLength: bin.length }],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
            { buffer: 0, byteOffset: 36, byteLength: 12 },
            { buffer: 0, byteOffset: 48, byteLength: rotationBytes },
            { buffer: 0, byteOffset: scaleOffset, byteLength: 12 },
        ],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 0.5, 0] },
            { bufferView: 1, componentType: 5126, count: 1, type: 'VEC3' },
            { bufferView: 2, componentType, count: 1, type: 'VEC4', ...(normalized ? { normalized: true } : {}) },
            { bufferView: 3, componentType: 5126, count: 1, type: 'VEC3' },
        ],
    };
    const raw = JSON.stringify(model);
    const padded = raw.padEnd(Math.ceil(raw.length / 4) * 4, ' ');
    const glb = new Uint8Array(28 + padded.length + bin.length);
    const view = new DataView(glb.buffer);
    const put = (i, n) => view.setUint32(i, n, true);
    put(0, 0x46546c67);
    put(4, 2);
    put(8, glb.length);
    put(12, padded.length);
    put(16, 0x4e4f534a);
    for (let i = 0; i < padded.length; i++) glb[20 + i] = padded.charCodeAt(i);
    put(20 + padded.length, bin.length);
    put(24 + padded.length, 0x004e4942);
    glb.set(bin, 28 + padded.length);
    return glb.buffer;
}
module.exports = { makePackedRotationGlb };
