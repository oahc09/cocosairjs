import { createAirApp } from '../../src/air/bootstrap';
import { MeshUtils } from '../../src/cocos/3d/misc/create-mesh';
import { Mesh } from '../../src/cocos/3d/assets/mesh';
import { AttributeName, deviceManager } from '../../src/cocos/gfx';

const geometry = () => ({ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), indices16: new Uint16Array([0, 1, 2, 1, 3, 2]) });
const caps = { maxSubMeshes: 1, maxSubMeshVertices: 4, maxSubMeshIndices: 6 };
describe('native mesh contract preflight and updates', () => {
    beforeAll(async () => { document.body.innerHTML = '<canvas id="GameCanvas"></canvas>'; await createAirApp({ canvas: '#GameCanvas', renderMode: 3 }); });
    afterEach(() => jest.restoreAllMocks());
    test('capacity and wrong keys reject before resetting out or allocating GPU buffers', () => {
        const device = deviceManager.gfxDevice, allocate = jest.spyOn(device, 'createBuffer');
        const out = new Mesh(), before = out.struct;
        expect(() => MeshUtils.createDynamicMesh(0, geometry(), out, { ...caps, maxSubMeshVertices: 3 })).toThrow('AIR_E_MESH_CAPACITY');
        expect(out.struct).toBe(before); expect(allocate).not.toHaveBeenCalled();
        expect(() => MeshUtils.createDynamicMesh(0, { ...geometry(), indices: [0, 1, 2] } as any)).toThrow('AIR_E_MESH_INDEX_KEY');
        expect(() => MeshUtils.createMesh({ positions: [0, 0, 0], indices16: new Uint16Array([0]) } as any)).toThrow('AIR_E_MESH_INDEX_KEY');
        expect(() => MeshUtils.createDynamicMesh(0, geometry(), undefined, { maxSubMeshVertices: 10 } as any)).toThrow('maxSubMeshes');
        expect(allocate).not.toHaveBeenCalled();
    });
    test('default capacity remains 1024 and 1025 vertices reject before allocation', () => {
        const mesh = MeshUtils.createDynamicMesh(0, { positions: new Float32Array(3) });
        expect(mesh.struct.dynamic!.info.maxSubMeshVertices).toBe(1024); mesh.destroy();
        const allocate = jest.spyOn(deviceManager.gfxDevice, 'createBuffer');
        expect(() => MeshUtils.createDynamicMesh(0, { positions: new Float32Array(1025 * 3) })).toThrow('AIR_E_MESH_CAPACITY');
        expect(allocate).not.toHaveBeenCalled();
    });
    test('partial updates preserve indices and update UV semantic without touching normal stream', () => {
        const source = geometry(), mesh = MeshUtils.createDynamicMesh(0, source, undefined, caps);
        const sub = mesh.renderingSubMeshes[0], indexWrite = jest.spyOn(sub.indexBuffer!, 'update');
        const normalWrite = jest.spyOn(sub.vertexBuffers[1], 'update');
        const positions = source.positions.slice(); positions[0] = -2;
        mesh.updateSubMesh(0, { positions });
        mesh.updateSubMesh(0, { uvs: new Float32Array([0.2, 0.2, 0.8, 0.2, 0.2, 0.8, 0.8, 0.8]) });
        expect(Array.from(mesh.readIndices(0)!)).toEqual(Array.from(source.indices16));
        expect(indexWrite).not.toHaveBeenCalled(); expect(normalWrite).not.toHaveBeenCalled();
        expect(Array.from(mesh.readAttribute(0, AttributeName.ATTR_NORMAL)!)).toEqual(Array.from(source.normals));
        expect(mesh.readAttribute(0, AttributeName.ATTR_TEX_COORD)![0]).toBeCloseTo(0.2);
        expect(mesh.struct.minPosition!.x).toBe(-2); expect(sub.drawInfo!.indexCount).toBe(6); mesh.destroy();
    });
    test('invalid full update is atomic across bytes, counts, bounds and GPU calls', () => {
        const mesh = MeshUtils.createDynamicMesh(0, geometry(), undefined, caps), sub = mesh.renderingSubMeshes[0];
        const before = mesh.data.slice(), draw = { ...sub.drawInfo! }, min = mesh.struct.minPosition!.clone();
        const updates = sub.vertexBuffers.map(b => jest.spyOn(b, 'update')); const index = jest.spyOn(sub.indexBuffer!, 'update');
        expect(() => mesh.updateSubMesh(0, { positions: geometry().positions, indices16: new Uint16Array([0, 1, 99]) })).toThrow('AIR_E_MESH_INDEX_RANGE');
        expect(() => mesh.updateSubMesh(0, { positions: new Float32Array([0, 0, NaN]) })).toThrow('AIR_E_MESH_ATTRIBUTE');
        expect(() => mesh.updateSubMesh(-1, { positions: geometry().positions })).toThrow('AIR_E_MESH_PRIMITIVE');
        expect(() => mesh.updateSubMesh(0, { positions: new Float32Array(9) })).toThrow('AIR_E_MESH_ATTRIBUTE_COUNT');
        expect(mesh.data).toEqual(before); expect(sub.drawInfo).toEqual(draw); expect(mesh.struct.minPosition).toEqual(min);
        updates.forEach(u => expect(u).not.toHaveBeenCalled()); expect(index).not.toHaveBeenCalled(); mesh.destroy();
    });
    test('failed GPU initialization releases every allocation and leaves out retryable', () => {
        const out = new Mesh(), destroy = [jest.fn(), jest.fn()]; let calls = 0;
        jest.spyOn(deviceManager, 'gfxDevice', 'get').mockReturnValue({ createBuffer: () => {
            if (calls === 2) throw new Error('injected allocation failure'); return { destroy: destroy[calls++] };
        } } as any);
        expect(() => MeshUtils.createDynamicMesh(0, geometry(), out, caps)).toThrow('AIR_E_MESH_GPU_ALLOCATION');
        destroy.forEach(fn => expect(fn).toHaveBeenCalledTimes(1)); expect((out as any)._initialized).toBe(false);
        jest.restoreAllMocks(); out.initialize(); out.updateSubMesh(0, geometry()); expect(out.renderingSubMeshes[0].drawInfo!.indexCount).toBe(6); out.destroy();
    });
    test('missing device has a structured readiness error and does not poison out', () => {
        const out = new Mesh(); jest.spyOn(deviceManager, 'gfxDevice', 'get').mockReturnValue(undefined as any);
        expect(() => MeshUtils.createDynamicMesh(0, geometry(), out, caps)).toThrow('AIR_E_MESH_NOT_READY');
        expect((out as any)._initialized).toBe(false);
    });
    test('empty reserved position and index streams can be populated later', () => {
        const mesh = MeshUtils.createDynamicMesh(0, { positions: new Float32Array(), indices32: new Uint32Array() }, undefined, caps);
        mesh.updateSubMesh(0, { positions: geometry().positions, indices32: new Uint32Array([0, 1, 2]) });
        expect(mesh.renderingSubMeshes[0].drawInfo!.indexCount).toBe(3); mesh.destroy();
    });
});
