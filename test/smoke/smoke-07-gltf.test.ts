import { TextDecoder, TextEncoder } from 'util';
import { createAirApp, GLTFLoader, GLTFAsset, Animation, SkinnedMeshRenderer, MeshRenderer, Vec3, Mat4, assetManager, loadAssetAsync } from '../../src';
import { GLTFParserContext, decodeContainer } from '../../src/air/assets/gltf/parser-context';
import { sampleCubicQuaternion } from '../../src/air/assets/gltf/animation';
import { convertTopology } from '../../src/air/assets/gltf/mesh';
import { prepareNodes } from '../../src/air/assets/gltf/nodes';
import { CCObject } from '../../src/cocos/core/data/object';
import { createEvalSymbol } from '../../src/cocos/animation/define';
import { extname } from '../../src/cocos/core/utils/path';
import { gltfEffect, createGLTFMaterial } from '../../src/air/assets/gltf/material';
import { createMaterialFeatures, GLTFMaterialFeatures } from '../../src/air/assets/gltf/material/features';
import { unlitFactory } from '../../src/air/assets/gltf/extensions/material/unlit';
import { textureTransformFactory } from '../../src/air/assets/gltf/extensions/texture/transform';
import { GLTFExtensionRegistry } from '../../src/air/assets/gltf/extension-registry';
import { GLTFWinding } from '../../src/air/assets/gltf/winding';
import { fixture, toGLB } from '../fixtures/gltf/fixture';
import { textureCoordinates, transformTextureUV } from '../../src/air/assets/gltf/material/texture-slots';
import { Texture2D } from '../../src/cocos/asset/assets/texture-2d';
import { Vec4 } from '../../src/cocos/core/math';

Object.assign(globalThis, { TextDecoder, TextEncoder });
const loader = new GLTFLoader();
/** Mimics the loader's feature pipeline: core features + built-in extension handlers. */
const featuresOf = (source: Parameters<typeof createMaterialFeatures>[1]): GLTFMaterialFeatures => {
    const features = createMaterialFeatures(-1, source);
    for (const factory of [unlitFactory, textureTransformFactory]) { factory(null as never).extendMaterial?.(-1, features, null as never); }
    return features;
};

describe('glTF runtime loader', () => {
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });
    afterEach(async () => { CCObject._deferredDestroy(); await Promise.resolve(); CCObject._deferredDestroy(); jest.restoreAllMocks(); });

    test('GLB and external glTF produce the same native meshes', async () => {
        const f = fixture();
        const a = await loader.parseAsync(f.glb);
        f.json.buffers![0].uri = 'model.bin';
        const fetchMock = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => f.bin });
        Object.assign(globalThis, { fetch: fetchMock });
        const b = await loader.parseAsync(JSON.stringify(f.json), 'https://example.test/models/');
        // The parser passes an init object carrying the (optional) abort signal.
        expect(fetchMock).toHaveBeenCalledWith('https://example.test/models/model.bin', expect.anything());
        expect(a.meshes[0].data).toEqual(b.meshes[0].data);
        expect(a.meshes[0].struct.primitives.length).toBe(1);
        expect(a.meshes[0].struct.morph!.subMeshMorphs[0]!.targets.length).toBe(1);
        const displacement = a.meshes[0].struct.morph!.subMeshMorphs[0]!.targets[0].displacements[0];
        expect(displacement.count).toBe(9);
        expect(Array.from(new Float32Array(a.meshes[0].data.buffer, displacement.offset, displacement.count))).toEqual([0, 0, 0, 0, 0, 0, 0, 1, 0]);
        a.destroy(); b.destroy();
    });
    test('loadRemote and both helper forms share native asset cache, including query/hash URLs', async () => {
        const f = fixture(); const url = 'https://example.test/model.glb?v=1#model';
        Object.assign(globalThis, { fetch: jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => f.glb }) });
        const a = await loader.loadAsync(url);
        expect(a).toBeInstanceOf(GLTFAsset);
        expect(await loadAssetAsync(url)).toBe(a);
        expect(await loadAssetAsync(url, GLTFAsset)).toBe(a);
        const b = await new Promise((resolve, reject) => assetManager.loadRemote(url, (e, value) => e ? reject(e) : resolve(value)));
        expect(b).toBe(a); assetManager.assets.remove(url); a.destroy();
        const fragmentURL = 'https://example.test/remote.glb#scene';
        const remote = await new Promise<GLTFAsset>((resolve, reject) => assetManager.loadRemote<GLTFAsset>(fragmentURL, (e, value) => e ? reject(e) : resolve(value)));
        expect(remote).toBeInstanceOf(GLTFAsset); assetManager.assets.remove(fragmentURL); remote.destroy();
        expect(extname('model.glb#scene')).toBe('.glb'); expect(extname('image.png?q=1#fragment')).toBe('.png');
        expect(extname('file.tar.gz')).toBe('.gz');
    });
    test('native Animation interpolates bones and morphs independently per instance', async () => {
        const asset = await loader.parseAsync(fixture().glb);
        const a = asset.instantiate(); const b = asset.instantiate();
        const animation = a.root.getComponent(Animation)!;
        animation.play('move'); const state = animation.getState('move')!; state.time = 1; state.sample(); animation.pause();
        const renderer = a.root.getComponentsInChildren(SkinnedMeshRenderer)[0];
        expect(renderer.getWeight(0, 0)).toBeCloseTo(0.5);
        const bone = a.root.getChildByPath('root__0/bone_name__1')!;
        expect(bone.position.x).toBeCloseTo(1);
        expect(b.root.getChildByPath('root__0/bone_name__1')!.position.x).toBe(0);
        expect(b.root.getComponentsInChildren(SkinnedMeshRenderer)[0].getWeight(0, 0)).toBe(0);
        expect(asset.skeletons[0].joints).toEqual(['root__0/bone_name__1/bone_name__2', 'root__0/bone_name__1']);
        // Known vertex transformed through reversed joint order, non-joint ancestor and identity IBM.
        const joint = a.root.getChildByPath(asset.skeletons[0].joints[0])!;
        const matrix = Mat4.multiply(new Mat4(), joint.worldMatrix, asset.skeletons[0].bindposes[0]);
        const result = Vec3.transformMat4(new Vec3(), new Vec3(-1, 0, 0), matrix);
        expect([result.x, result.y, result.z]).toEqual([3, 1, 0]);
        a.dispose(); a.dispose(); CCObject._deferredDestroy(); await Promise.resolve();
        expect(asset.refCount).toBe(1); expect(b.root.isValid).toBe(true); expect(asset.meshes[0].isValid).toBe(true);
        const sharedMesh = asset.meshes[0];
        asset.destroy(); expect(sharedMesh.isValid).toBe(true);
        b.dispose(); CCObject._deferredDestroy(); await Promise.resolve(); CCObject._deferredDestroy();
        expect(sharedMesh.isValid).toBe(false);
    });
    test('STEP, linear and cubic curves preserve intermediate samples', async () => {
        const f = fixture(); f.json.animations![0].samplers[0].interpolation = 'STEP';
        const asset = await loader.parseAsync(toGLB(f.json, f.bin));
        const tracks = Array.from(asset.animations[0].tracks);
        const value = tracks[0][createEvalSymbol]().evaluate(1) as Vec3;
        expect(value.x).toBe(0);
        const instance = asset.instantiate(); const animation = instance.root.getComponent(Animation)!;
        animation.play('cubic'); const state = animation.getState('cubic')!; state.time = 1; state.sample();
        const q = instance.root.getChildByPath('root__0/bone_name__1/bone_name__2')!.rotation;
        const expected = sampleCubicQuaternion([0, 2], [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], 1);
        expect(q.z).toBeCloseTo(expected[2]); expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1);
        instance.dispose(); asset.destroy();
    });
    test('multi primitive materials, multiple skins and scenes remain isolated', async () => {
        const f = fixture(); f.json.meshes![0].primitives.push(JSON.parse(JSON.stringify(f.json.meshes![0].primitives[0])));
        f.json.skins!.push({ joints: [1, 2] });
        f.json.nodes!.push({ mesh: 0, skin: 1, name: 'other' }); f.json.nodes![0].children!.push(4);
        f.json.scenes!.push({ name: 'empty', nodes: [] });
        const asset = await loader.parseAsync(toGLB(f.json, f.bin));
        const instance = asset.instantiate();
        expect(instance.root.getComponentsInChildren(SkinnedMeshRenderer).length).toBe(2);
        expect(asset.meshes[0].struct.primitives.length).toBe(2);
        const empty = asset.instantiate(1); expect(empty.root.getComponentsInChildren(MeshRenderer).length).toBe(0);
        instance.dispose(); empty.dispose(); asset.destroy();
    });
    test('GLB container and extension failures are explicit', () => {
        const f = fixture();
        expect(() => decodeContainer(f.glb.slice(0, 21))).toThrow(/length mismatch/);
        new DataView(f.glb).setUint32(12, 3, true);
        expect(() => decodeContainer(f.glb)).toThrow(/chunk length/);
        f.json.extensionsRequired = ['KHR_draco_mesh_compression'];
        // Required-extension policy lives in the registry, not in decodeContainer.
        const registry = new GLTFExtensionRegistry();
        expect(() => registry.validateRequired(new GLTFParserContext(f.json), registry.createHandlers(new GLTFParserContext(f.json))))
            .toThrow(/required extension/);
    });
    test('sparse normalized accessors and matrix column padding decode correctly', async () => {
        const bin = new Uint8Array([0, 1, 0, 0, 255, 128, 0, 255, 1, 2, 0, 0, 3, 4, 0, 0]);
        const context = new GLTFParserContext({ asset: { version: '2.0' }, buffers: [{ byteLength: 16 }],
            bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 2 }, { buffer: 0, byteOffset: 4, byteLength: 4 }, { buffer: 0, byteOffset: 8, byteLength: 8 }],
            accessors: [{ componentType: 5121, normalized: true, type: 'VEC2', count: 2,
                sparse: { count: 2, indices: { bufferView: 0, componentType: 5121 }, values: { bufferView: 1 } } },
            { bufferView: 2, componentType: 5121, type: 'MAT2', count: 1 }] });
        await context.loadBuffers(bin.buffer);
        expect(context.accessor(0).values).toEqual([1, 128 / 255, 0, 1]);
        expect(context.accessor(1).values).toEqual([1, 2, 3, 4]);
    });
    test('invalid bounds, cycles, shear and missing baseUrl are rejected', async () => {
        const f = fixture(); f.json.accessors![0].count = 10000;
        await expect(loader.parseAsync(toGLB(f.json, f.bin))).rejects.toThrow(/out of bounds/);
        const cycle = fixture().json; cycle.nodes![2].children = [0];
        expect(() => prepareNodes(new GLTFParserContext(cycle))).toThrow(/cycle/);
        const shear = fixture().json; shear.nodes![0] = { matrix: [1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
        expect(() => prepareNodes(new GLTFParserContext(shear))).toThrow(/shear/);
        const external = fixture().json; external.buffers![0].uri = 'missing.bin';
        await expect(loader.parseAsync(JSON.stringify(external))).rejects.toThrow(/requires baseUrl/);
    });
    test('triangle strip winding, fan and line loop conversion', () => {
        expect(convertTopology([0, 1, 2, 3], 5).indices).toEqual([0, 1, 2, 2, 1, 3]);
        expect(convertTopology([0, 1, 2, 3], 6).indices).toEqual([0, 1, 2, 0, 2, 3]);
        expect(convertTopology([0, 1, 2], 2).indices).toEqual([0, 1, 1, 2, 2, 0]);
    });
    test('KHR_texture_transform applies scale, then rotation, then offset and overrides UV selection', () => {
        const coordinates = textureCoordinates({ index: 0, texCoord: 1, extensions: { KHR_texture_transform: {
            offset: [0.25, 0.5], rotation: Math.PI / 2, scale: [2, 3], texCoord: 0,
        } } });
        expect(coordinates.texCoord).toBe(0);
        const result = transformTextureUV(coordinates, 0.2, 0.4);
        expect(result[0]).toBeCloseTo(1.45); expect(result[1]).toBeCloseTo(0.1);
        expect(transformTextureUV(textureCoordinates(), 0.2, 0.4)).toEqual([0.2, 0.4]);
        expect(transformTextureUV(textureCoordinates({ index: 0, extensions: { KHR_texture_transform: { offset: [0, 1], scale: [1, -1] } } }), 0.2, 0.4)).toEqual([0.2, 0.6]);
    });
    test('texture transforms reject malformed data and unsupported UV sets', () => {
        for (const transform of [{ offset: [1] }, { offset: null }, { scale: [1, Infinity] }, { rotation: '1' }, { texCoord: 2 }, []]) {
            expect(() => textureCoordinates({ index: 0, extensions: { KHR_texture_transform: transform } })).toThrow();
        }
    });
    test('required texture transform is supported without suppressing other required-extension errors', async () => {
        const f = fixture(); f.json.extensionsRequired = f.json.extensionsUsed = ['KHR_texture_transform'];
        const asset = await loader.parseAsync(toGLB(f.json, f.bin));
        expect(asset.warnings).toEqual([]); asset.destroy();
        f.json.extensionsRequired.push('KHR_draco_mesh_compression');
        await expect(loader.parseAsync(toGLB(f.json, f.bin))).rejects.toThrow(/KHR_draco_mesh_compression/);
    });
    test('each texture slot has independent native transform uniforms', () => {
        const texture = new Texture2D();
        const material = createGLTFMaterial(featuresOf({
            pbrMetallicRoughness: {
                baseColorTexture: { index: 0, extensions: { KHR_texture_transform: { offset: [0.2, 0.3] } } },
                metallicRoughnessTexture: { index: 0, extensions: { KHR_texture_transform: { scale: [2, 3] } } },
            }, emissiveTexture: { index: 0, texCoord: 0, extensions: { KHR_texture_transform: { texCoord: 1, offset: [0.7, 0.8] } } } }), [texture], false);
        const read = (name: string): Vec4 => { const v = new Vec4(); material.passes[0].getUniform(material.passes[0].getHandle(name), v); return v; };
        expect(read('airAlbedoUV0').z).toBeCloseTo(0.2);
        expect(read('airMetallicRoughnessUV0').x).toBe(2);
        expect(read('airMetallicRoughnessUV1').y).toBe(3);
        expect(read('airEmissiveUV0').z).toBeCloseTo(0.7);
        expect(read('airNormalUV0').x).toBe(1);
        expect(gltfEffect().shaders[0].glsl3.frag).toContain('dot(airEmissiveUV0.xyz, vec3(EMISSIVE_UV, 1.0))');
        material.destroy(); texture.destroy();
    });
    test('stride and normalized vertex color accessors decode without reading padding', async () => {
        const data = new Uint8Array([255, 0, 128, 255, 99, 99, 99, 99, 0, 255, 0, 128]);
        const context = new GLTFParserContext({ asset: { version: '2.0' }, buffers: [{ byteLength: 12 }],
            bufferViews: [{ buffer: 0, byteLength: 12, byteStride: 8 }],
            accessors: [{ bufferView: 0, count: 2, type: 'VEC4', componentType: 5121, normalized: true }] });
        await context.loadBuffers(data.buffer);
        expect(context.accessor(0).values).toEqual([1, 0, 128 / 255, 1, 0, 1, 0, 128 / 255]);
    });
    test('missing external dependency is recoverable on the next load', async () => {
        const f = fixture(); f.json.buffers![0].uri = 'repair.bin'; const bytes = new TextEncoder().encode(JSON.stringify(f.json)).buffer;
        let repaired = false;
        Object.assign(globalThis, { fetch: jest.fn(async (url: string) => ({ ok: url.endsWith('.gltf') || repaired, status: 404,
            arrayBuffer: async () => url.endsWith('.gltf') ? bytes : f.bin })) });
        const url = 'https://example.test/repaired.gltf';
        await expect(loader.loadAsync(url)).rejects.toThrow(/repair.bin/);
        expect(assetManager.assets.get(url)).toBeUndefined(); repaired = true;
        const asset = await loader.loadAsync(url); expect(asset).toBeInstanceOf(GLTFAsset);
        assetManager.assets.remove(url); asset.destroy();
    });
    test('material factors stay linear and mirrored transforms update native winding', async () => {
        const material = createGLTFMaterial(featuresOf({ pbrMetallicRoughness: { baseColorFactor: [0.5, 0.25, 0.125, 1], metallicFactor: 0.3, roughnessFactor: 0.7 } }), [], false);
        const albedo = new (await import('../../src/cocos/core/math')).Vec4();
        material.passes[0].getUniform(material.passes[0].getHandle('albedo'), albedo);
        expect(albedo.x).toBeCloseTo(0.5); expect(albedo.y).toBeCloseTo(0.25);
        expect(gltfEffect().shaders[0].glsl3.vert).not.toContain('gl_VertexIndex');
        const f = fixture(); delete f.json.nodes![3].skin;
        const asset = await loader.parseAsync(toGLB(f.json, f.bin)); const instance = asset.instantiate();
        instance.root.setScale(-1, 1, 1); instance.root.getComponent(GLTFWinding)!.lateUpdate();
        const renderer = instance.root.getComponentsInChildren(MeshRenderer)[0];
        expect(renderer.getMaterialInstance(0)!.passes[0].rasterizerState.isFrontFaceCCW).toBe(false);
        instance.root.setScale(1, 1, 1); instance.root.getComponent(GLTFWinding)!.lateUpdate();
        expect(renderer.getMaterialInstance(0)!.passes[0].rasterizerState.isFrontFaceCCW).toBe(true);
        instance.dispose(); asset.destroy(); material.destroy();
    });
});
