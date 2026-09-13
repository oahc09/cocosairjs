import { TextDecoder, TextEncoder } from 'util';
import { createAirApp, GLTFLoader, GLTFAsset, GLTFError, Mesh } from '../../src';
import { AttributeName } from '../../src/cocos/gfx';
import { createMeshoptDecoder, createDracoDecoder } from '../../src/air/assets/gltf';
import type { GLTFMeshoptDecoder, GLTFDracoDecoder, DecodedPrimitive } from '../../src/air/assets/gltf';
import { fixture, toGLB } from '../fixtures/gltf/fixture';
import type { GLTFDocument } from '../../src/air/assets/gltf/schema';
import { CCObject } from '../../src/cocos/core/data/object';

// The engine tsconfig has no @types/node; fixtures and vendored decoders are loaded through CJS.
declare const require: (id: string) => any;
declare const __dirname: string;

Object.assign(globalThis, { TextDecoder, TextEncoder });

const POSITIONS = [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0];
const NORMALS = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
const UVS = [0, 0, 1, 0, 1, 1, 0, 1];
const INDICES = [0, 1, 2, 0, 2, 3];

function fixtureGLB (name: string): ArrayBuffer {
    const fs = require('fs');
    const file = fs.readFileSync(require('path').join(__dirname, '..', 'fixtures', 'gltf', 'geometry', name));
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}
/** Flips one byte inside the encoded payload (which lives at the end of the single BIN chunk). */
function corruptPayload (glb: ArrayBuffer): ArrayBuffer {
    const view = new DataView(glb);
    const jsonLength = view.getUint32(12, true);
    const offset = 20 + jsonLength;
    const length = view.getUint32(offset, true);
    const bytes = new Uint8Array(glb);
    bytes[offset + 8 + Math.floor(length * 0.9)] ^= 0xff;
    return glb;
}
function closeTo (actual: ArrayLike<number> | null, expected: number[], epsilon: number): void {
    expect(actual).not.toBeNull();
    expect(actual!.length).toBe(expected.length);
    for (let i = 0; i < expected.length; ++i) {
        expect(Math.abs(actual![i] - expected[i])).toBeLessThanOrEqual(epsilon);
    }
}
/** Draco reorders vertices; comparing sorted point sets keeps the check order independent. */
function sortedPoints (values: ArrayLike<number>, width: number): number[] {
    const points: number[][] = [];
    for (let i = 0; i < values.length; i += width) {
        points.push(Array.from({ length: width }, (_, k) => values[i + k]));
    }
    points.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    const sorted: number[] = [];
    for (const point of points) { sorted.push(...point); }
    return sorted;
}
function geometryOf (asset: GLTFAsset): { positions: ArrayLike<number>; normals: ArrayLike<number>; indices: number } {
    const mesh: Mesh = asset.meshes[0] as Mesh;
    const struct = mesh.struct;
    return {
        positions: mesh.readAttribute(0, AttributeName.ATTR_POSITION)!,
        normals: mesh.readAttribute(0, AttributeName.ATTR_NORMAL)!,
        indices: struct.primitives[0].indexView!.count,
    };
}
/** Real decoders are vendored under build/gltf-decoders; they need WebAssembly at runtime. */
function realMeshopt (): GLTFMeshoptDecoder {
    const loaded = require('../../build/gltf-decoders/meshopt/meshopt_decoder.cjs');
    const module = loaded.MeshoptDecoder ?? loaded;
    if (typeof WebAssembly === 'undefined' || !module || module.supported === false) {
        throw new Error('meshopt decoder unavailable in this environment');
    }
    return createMeshoptDecoder(module);
}
function realDraco (): GLTFDracoDecoder {
    const draco3d = require('../../build/gltf-decoders/draco/draco3d.js');
    if (typeof WebAssembly === 'undefined') { throw new Error('draco decoder unavailable in this environment'); }
    return createDracoDecoder(() => draco3d.createDecoderModule({}));
}

describe('glTF geometry and compression extensions', () => {
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    afterEach(async () => { CCObject._deferredDestroy(); await Promise.resolve(); CCObject._deferredDestroy(); jest.restoreAllMocks(); });

    test('uncompressed baseline matches the fixture geometry', async () => {
        const asset = await new GLTFLoader().parseAsync(fixtureGLB('plain.glb'));
        const geometry = geometryOf(asset);
        closeTo(geometry.positions, POSITIONS, 0);
        closeTo(geometry.normals, NORMALS, 0);
        expect(geometry.indices).toBe(INDICES.length);
        const struct = (asset.meshes[0] as Mesh).struct;
        expect([struct.minPosition!.x, struct.minPosition!.y]).toEqual([-0.5, 0]);
        expect([struct.maxPosition!.x, struct.maxPosition!.y]).toEqual([0.5, 1]);
        asset.destroy();
    });

    test('KHR_mesh_quantization dequantizes to the same geometry and bounds', async () => {
        const asset = await new GLTFLoader().parseAsync(fixtureGLB('quantized.glb'));
        const geometry = geometryOf(asset);
        closeTo(geometry.positions, POSITIONS, 1 / 32767);
        closeTo(geometry.normals, NORMALS, 1 / 127);
        expect(geometry.indices).toBe(INDICES.length);
        const struct = (asset.meshes[0] as Mesh).struct;
        expect(struct.minPosition!.x).toBeCloseTo(-0.5, 3);
        expect(struct.maxPosition!.y).toBeCloseTo(1, 3);
        asset.destroy();
    });

    test('quantized component types are rejected when the extension is not declared', async () => {
        const quantized = new Int16Array(POSITIONS.map((v) => Math.round(v * 32767)));
        const normals = new Float32Array(NORMALS);
        const indices = new Uint16Array(INDICES);
        const bin = new Uint8Array(quantized.byteLength + normals.byteLength + indices.byteLength);
        bin.set(new Uint8Array(quantized.buffer), 0);
        bin.set(new Uint8Array(normals.buffer), quantized.byteLength);
        bin.set(new Uint8Array(indices.buffer), quantized.byteLength + normals.byteLength);
        const json = {
            asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
            buffers: [{ byteLength: bin.byteLength }],
            bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: quantized.byteLength },
                { buffer: 0, byteOffset: quantized.byteLength, byteLength: normals.byteLength },
                { buffer: 0, byteOffset: quantized.byteLength + normals.byteLength, byteLength: indices.byteLength }],
            accessors: [{ bufferView: 0, componentType: 5122, normalized: true, count: 4, type: 'VEC3' },
                { bufferView: 1, componentType: 5126, count: 4, type: 'VEC3' },
                { bufferView: 2, componentType: 5123, count: INDICES.length, type: 'SCALAR' }],
            meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] }],
        } as unknown as GLTFDocument;
        await expect(new GLTFLoader().parseAsync(toGLB(json, bin.buffer))).rejects.toThrow(/invalid POSITION componentType/);
        // Declaring the extension makes the same document load.
        (json as { extensionsUsed?: string[] }).extensionsUsed = ['KHR_mesh_quantization'];
        const asset = await new GLTFLoader().parseAsync(toGLB(json, bin.buffer));
        closeTo(geometryOf(asset).positions, POSITIONS, 1 / 32767);
        asset.destroy();
        void fixture;
    });

    test('EXT_meshopt_compression decodes to the baseline geometry', async () => {
        const decoder = realMeshopt();
        const calls: string[] = [];
        const counting: GLTFMeshoptDecoder = {
            decodeGltfBufferAsync: async (count, stride, source, mode, filter) => {
                calls.push(`${mode}:${filter ?? 'NONE'}:${count}x${stride}`);
                return decoder.decodeGltfBufferAsync(count, stride, source, mode, filter);
            },
        };
        const asset = await new GLTFLoader({ meshoptDecoder: counting }).parseAsync(fixtureGLB('meshopt-ext.glb'));
        const geometry = geometryOf(asset);
        closeTo(geometry.positions, POSITIONS, 0);
        closeTo(geometry.normals, NORMALS, 0);
        expect(geometry.indices).toBe(INDICES.length);
        // Three accessors share the vertex view, yet the payload is decoded once per bufferView.
        expect(calls).toEqual(['ATTRIBUTES:NONE:4x32', 'INDICES:NONE:6x2']);
        asset.destroy();
    });

    test('KHR_meshopt_compression decodes to the baseline geometry', async () => {
        const decoder = realMeshopt();
        const asset = await new GLTFLoader({ meshoptDecoder: decoder }).parseAsync(fixtureGLB('meshopt-khr.glb'));
        closeTo(geometryOf(asset).positions, POSITIONS, 0);
        expect(geometryOf(asset).indices).toBe(INDICES.length);
        asset.destroy();
    });

    test('optional meshopt falls back to uncompressed data when no decoder is configured', async () => {
        const loader = new GLTFLoader();
        const warnings: string[] = [];
        const spy = jest.spyOn(console, 'warn').mockImplementation((message: unknown) => { warnings.push(String(message)); });
        const asset = await loader.parseAsync(fixtureGLB('meshopt-ext.glb'));
        closeTo(geometryOf(asset).positions, POSITIONS, 0);
        expect(warnings.some((message) => /decoder missing, falling back/.test(message))).toBe(true);
        spy.mockRestore();
        asset.destroy();
    });

    test('required meshopt without a decoder fails with GLTF_DECODER_MISSING', async () => {
        await expect(new GLTFLoader().parseAsync(fixtureGLB('meshopt-required.glb'))).rejects.toMatchObject({
            code: 'GLTF_DECODER_MISSING', extension: 'EXT_meshopt_compression',
        });
    });

    test('invalid meshopt mode/filter and corrupt payloads fail with stable codes', async () => {
        const bin = new Uint8Array(8);
        const json = {
            asset: { version: '2.0' }, extensionsUsed: ['EXT_meshopt_compression'], scene: 0, scenes: [{ nodes: [0] }],
            nodes: [{ mesh: 0 }], buffers: [{ byteLength: bin.byteLength }],
            bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4, extensions: { EXT_meshopt_compression:
                { buffer: 0, byteOffset: 4, byteLength: 4, byteStride: 4, count: 1, mode: 'WRONG' } } }],
            accessors: [{ bufferView: 0, componentType: 5126, count: 1, type: 'SCALAR' }],
            meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        } as unknown as GLTFDocument;
        await expect(new GLTFLoader({ meshoptDecoder: realMeshopt() }).parseAsync(toGLB(json, bin.buffer)))
            .rejects.toMatchObject({ code: 'GLTF_EXTENSION_INVALID', extension: 'EXT_meshopt_compression' });
        const definition = json.bufferViews![0].extensions!.EXT_meshopt_compression as { mode: string };
        definition.mode = 'ATTRIBUTES';
        const failing: GLTFMeshoptDecoder = { decodeGltfBufferAsync: async () => { throw new Error('bitstream corrupt'); } };
        await expect(new GLTFLoader({ meshoptDecoder: failing }).parseAsync(toGLB(json, bin.buffer)))
            .rejects.toMatchObject({ code: 'GLTF_DECODE_FAILED' });
        // A decoder returning an unexpected size must fail instead of over-allocating.
        const oversized: GLTFMeshoptDecoder = { decodeGltfBufferAsync: async () => new Uint8Array(4 * 1024 * 1024) };
        await expect(new GLTFLoader({ meshoptDecoder: oversized }).parseAsync(toGLB(json, bin.buffer)))
            .rejects.toMatchObject({ code: 'GLTF_DECODE_FAILED' });
        // A decoder returning fewer bytes than declared must fail instead of reading past the end.
        const truncated: GLTFMeshoptDecoder = { decodeGltfBufferAsync: async () => new Uint8Array(2) };
        await expect(new GLTFLoader({ meshoptDecoder: truncated }).parseAsync(toGLB(json, bin.buffer)))
            .rejects.toMatchObject({ code: 'GLTF_DECODE_FAILED' });
        // A damaged Draco bitstream is rejected by the decoder status instead of crashing.
        await expect(new GLTFLoader({ dracoDecoder: realDraco() }).parseAsync(corruptPayload(fixtureGLB('draco.glb'))))
            .rejects.toBeInstanceOf(GLTFError);
        // Note: meshopt payloads carry no checksum, so bit flips yield wrong data rather than an
        // error. The guarantees under test are bounded allocation and wrapped decoder failures.
    });

    test('KHR_draco_mesh_compression decodes attributes and indices', async () => {
        const decoder = realDraco();
        const asset = await new GLTFLoader({ dracoDecoder: decoder }).parseAsync(fixtureGLB('draco.glb'));
        const geometry = geometryOf(asset);
        expect(geometry.indices).toBe(INDICES.length);
        // Draco reorders vertices, so compare the decoded point set and bounds, not the order.
        closeTo(sortedPoints(geometry.positions, 3), sortedPoints(POSITIONS, 3), 1e-3);
        closeTo(sortedPoints(geometry.normals, 3), sortedPoints(NORMALS, 3), 1e-2);
        const struct = (asset.meshes[0] as Mesh).struct;
        expect(struct.minPosition!.x).toBeCloseTo(-0.5, 2);
        expect(struct.maxPosition!.y).toBeCloseTo(1, 2);
        asset.destroy();
    });

    test('Draco decoding is deduplicated and validated against the accessors', async () => {
        let calls = 0;
        const stub: GLTFDracoDecoder = {
            decodePrimitive: async (): Promise<DecodedPrimitive> => {
                ++calls;
                return { attributes: { POSITION: new Float32Array(POSITIONS), NORMAL: new Float32Array(NORMALS) },
                    indices: new Uint16Array(INDICES) };
            },
        };
        const asset = await new GLTFLoader({ dracoDecoder: stub }).parseAsync(fixtureGLB('draco.glb'));
        expect(calls).toBe(1);
        closeTo(geometryOf(asset).positions, POSITIONS, 0);
        asset.destroy();
        // Decoded counts must match the declared accessors.
        const mismatched: GLTFDracoDecoder = {
            decodePrimitive: async (): Promise<DecodedPrimitive> => ({ attributes: { POSITION: new Float32Array(6) } }),
        };
        await expect(new GLTFLoader({ dracoDecoder: mismatched }).parseAsync(fixtureGLB('draco.glb')))
            .rejects.toMatchObject({ code: 'GLTF_DECODE_FAILED' });
        const empty: GLTFDracoDecoder = { decodePrimitive: async (): Promise<DecodedPrimitive> => ({ attributes: {} }) };
        await expect(new GLTFLoader({ dracoDecoder: empty }).parseAsync(fixtureGLB('draco.glb')))
            .rejects.toThrow(/POSITION/);
    });

    test('meshopt combo keeps two primitives, 32-bit indices, skin and morph intact', async () => {
        const decoder = realMeshopt();
        const asset = await new GLTFLoader({ meshoptDecoder: decoder }).parseAsync(fixtureGLB('meshopt-combo.glb'));
        const mesh = asset.meshes[0] as Mesh;
        const struct = mesh.struct;
        // Two primitives with two materials: each keeps its own vertex bundle and index range.
        expect(struct.primitives.length).toBe(2);
        expect(struct.vertexBundles.length).toBe(2);
        expect(struct.primitives.map((p) => p.vertexBundelIndices[0])).toEqual([0, 1]);
        // 32-bit index accessors (componentType 5125) are read without truncation.
        expect(Array.from(mesh.readIndices(0)!)).toEqual([0, 1, 2, 0, 2, 3]);
        expect(Array.from(mesh.readIndices(1)!)).toEqual([0, 2, 3, 0, 3, 1]);
        closeTo(mesh.readAttribute(0, AttributeName.ATTR_POSITION)!, POSITIONS, 0);
        closeTo(mesh.readAttribute(1, AttributeName.ATTR_POSITION)!, POSITIONS, 0);
        const joints = mesh.readAttribute(0, AttributeName.ATTR_JOINTS)!;
        const weights = mesh.readAttribute(0, AttributeName.ATTR_WEIGHTS)!;
        closeTo(joints, [0, 1, 0, 0, 0, 1, 0, 0, 1, 2, 0, 0, 1, 2, 0, 0], 0);
        // Skin weights are renormalized by the loader; the fixture already sums to one.
        closeTo(weights, [0.6, 0.4, 0, 0, 0.7, 0.3, 0, 0, 0.5, 0.5, 0, 0, 0.8, 0.2, 0, 0], 1e-6);
        // Compressed vertices still carry one morph target per sub mesh.
        expect(struct.morph).toBeTruthy();
        expect(struct.morph!.subMeshMorphs.length).toBe(2);
        for (const sub of struct.morph!.subMeshMorphs) { expect(sub!.targets.length).toBe(1); }
        // The skin survives compression: three joints and an instantiated skinned node.
        expect(asset.skeletons.length).toBe(1);
        expect(asset.skeletons[0].joints.length).toBe(3);
        const instance = asset.instantiate();
        // Joint paths are relative to the skinning root and must resolve against the real hierarchy.
        for (const path of asset.skeletons[0].joints) { expect(instance.root.getChildByPath(path)).toBeTruthy(); }
        instance.dispose();
        asset.destroy();
    });

    test('Draco combo keeps two primitives with skin channels and reports unsupported morphs', async () => {
        const loader = new GLTFLoader({ dracoDecoder: realDraco() });
        const warnings: string[] = [];
        const spy = jest.spyOn(console, 'warn').mockImplementation((message: unknown) => { warnings.push(String(message)); });
        const asset = await loader.parseAsync(fixtureGLB('draco-combo.glb'));
        spy.mockRestore();
        const mesh = asset.meshes[0] as Mesh;
        const struct = mesh.struct;
        expect(struct.primitives.length).toBe(2);
        expect(Array.from(mesh.readIndices(0)!).length).toBe(6);
        expect(Array.from(mesh.readIndices(1)!).length).toBe(6);
        // Draco reorders vertices, so the skin channels are compared as sorted tuples.
        closeTo(sortedPoints(mesh.readAttribute(0, AttributeName.ATTR_POSITION)!, 3), sortedPoints(POSITIONS, 3), 1e-3);
        closeTo(sortedPoints(mesh.readAttribute(0, AttributeName.ATTR_JOINTS)!, 4),
            sortedPoints([0, 1, 0, 0, 0, 1, 0, 0, 1, 2, 0, 0, 1, 2, 0, 0], 4), 0);
        closeTo(sortedPoints(mesh.readAttribute(0, AttributeName.ATTR_WEIGHTS)!, 4),
            sortedPoints([0.6, 0.4, 0, 0, 0.7, 0.3, 0, 0, 0.5, 0.5, 0, 0, 0.8, 0.2, 0, 0], 4), 1e-6);
        // Draco payloads carry no morph displacements: the warning is emitted and morph is dropped.
        expect(warnings.some((message) => /morph targets are not supported with Draco compression/.test(message))).toBe(true);
        expect(struct.morph).toBeUndefined();
        asset.destroy();
    });

    test('decoders stay idle for documents that use no compression extension', async () => {
        let meshoptCalls = 0;
        let dracoCalls = 0;
        const meshopt = realMeshopt();
        const loader = new GLTFLoader({
            meshoptDecoder: { decodeGltfBufferAsync: async (...args: Parameters<GLTFMeshoptDecoder['decodeGltfBufferAsync']>) => {
                ++meshoptCalls; return meshopt.decodeGltfBufferAsync(...args);
            } },
            dracoDecoder: { decodePrimitive: async () => { ++dracoCalls; return { attributes: {} }; } },
        });
        for (const name of ['plain.glb', 'quantized.glb']) {
            const asset = await loader.parseAsync(fixtureGLB(name));
            asset.destroy();
        }
        expect(meshoptCalls).toBe(0);
        expect(dracoCalls).toBe(0);
    });

    test('capability report reflects configured decoders', () => {
        const statuses: Record<string, string> = {};
        for (const entry of new GLTFLoader({ meshoptDecoder: realMeshopt(), dracoDecoder: realDraco() }).getExtensionSupport()) {
            statuses[entry.name] = entry.status;
        }
        expect(statuses.KHR_mesh_quantization).toBe('supported');
        expect(statuses.KHR_draco_mesh_compression).toBe('supported');
        expect(statuses.EXT_meshopt_compression).toBe('supported');
        expect(statuses.KHR_meshopt_compression).toBe('supported');
        // webp/avif handlers are registered since T3 (device-dependent status is
        // probe-async); the matrix keeps basisu unimplemented until the KTX2 phase.
        expect(statuses).toMatchObject({ KHR_texture_basisu: 'unsupported' });
    });
});
