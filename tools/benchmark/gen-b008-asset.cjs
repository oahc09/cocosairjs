/* V0.6 — 生成 B008 fixture 的 Draco 压缩 GLB（与 smoke-11 同款编码路径）。 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const draco = require(path.join(REPO, 'build', 'gltf-decoders', 'draco', 'draco3d.js'));

(async () => {
  const module = await draco.createEncoderModule({});
  const mesh = new module.Mesh();
  const builder = new module.MeshBuilder();
  builder.AddFacesToMesh(mesh, 1, new Uint32Array([0, 1, 2]));
  builder.AddFloatAttributeToMesh(mesh, module.POSITION, 3, 3, new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  const encoder = new module.Encoder();
  encoder.SetEncodingMethod(module.MESH_EDGEBREAKER_ENCODING);
  const encoded = new module.DracoInt8Array();
  const len = encoder.EncodeMeshToDracoBuffer(mesh, encoded);
  if (len <= 0) { throw new Error('draco encode failed: ' + len); }
  const drc = new Uint8Array(len);
  for (let i = 0; i < len; i++) { drc[i] = encoded.GetValue(i); }
  const indices = new Uint16Array([0, 1, 2]);
  const drcBuf = Buffer.from(drc);
  const drcPad = Buffer.alloc((4 - (drcBuf.length % 4)) % 4);
  const idxBuf = Buffer.alloc(indices.byteLength + (4 - indices.byteLength % 4) % 4);
  Buffer.from(indices.buffer, 0, indices.byteLength).copy(idxBuf, 0);
  const totalBin = Buffer.concat([idxBuf, drcBuf, drcPad]);
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, extensions: { KHR_draco_mesh_compression: { bufferView: 1 } } }] }],
    extensionsUsed: ['KHR_draco_mesh_compression'], extensionsRequired: ['KHR_draco_mesh_compression'],
    buffers: [{ byteLength: totalBin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: indices.byteLength },
      { buffer: 0, byteOffset: idxBuf.length, byteLength: drcBuf.length },
    ],
    accessors: [
      { componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 0, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
  };
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20);
  const binStart = 20 + 8 + jsonBuf.length + jsonPad.length;
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4);
  head.writeUInt32LE(totalBin.length + binStart, 8);
  const jsonHead = Buffer.alloc(8);
  jsonHead.writeUInt32LE(jsonBuf.length + jsonPad.length, 0); jsonHead.writeUInt32LE(0x4E4F534A, 4);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(totalBin.length, 0); binHead.writeUInt32LE(0x004E4942, 4);
  const glb = Buffer.concat([head, jsonHead, jsonBuf, jsonPad, binHead, totalBin]);
  const outDir = path.join(REPO, 'tools', 'benchmark', 'fixtures', 'B008', 'assets');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'compressed.glb'), glb);
  console.log('[B008] compressed.glb:', glb.length, 'bytes (drc', len + ')');
})();
