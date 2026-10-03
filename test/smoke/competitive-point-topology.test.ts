import { gfx } from '../../src';
import { createMesh, MeshUtils } from '../../src/cocos/3d/misc/create-mesh';
import { PipelineStateManager } from '../../src/cocos/rendering/pipeline-state-manager';
import { EmptyDevice } from '../../src/cocos/gfx/empty/empty-device';

describe('competitive mesh topology contract', () => {
    test.each([gfx.PrimitiveMode.POINT_LIST, gfx.PrimitiveMode.LINE_LIST, gfx.PrimitiveMode.TRIANGLE_LIST])(
        'static geometry retains primitive %i',
        (primitiveMode) => {
            const mesh = createMesh({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], primitiveMode });
            expect(mesh.struct.primitives[0].primitiveMode).toBe(primitiveMode);
            mesh.destroy();
        },
    );
    test('omitted topology keeps the triangle default', () => {
        const mesh = createMesh({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] });
        expect(mesh.struct.primitives[0].primitiveMode).toBe(gfx.PrimitiveMode.TRIANGLE_LIST);
        mesh.destroy();
    });
    test('dynamic geometry retains the zero-valued point primitive for every submesh', () => {
        const device = jest.spyOn(gfx.deviceManager, 'gfxDevice', 'get').mockReturnValue(new EmptyDevice());
        try {
            const mesh = MeshUtils.createDynamicMesh(
                0,
                { positions: new Float32Array([0, 0, 0]), primitiveMode: gfx.PrimitiveMode.POINT_LIST },
                undefined,
                { maxSubMeshes: 2, maxSubMeshVertices: 3, maxSubMeshIndices: 0 },
            );
            expect(mesh.struct.primitives.map((p) => p.primitiveMode)).toEqual([
                gfx.PrimitiveMode.POINT_LIST,
                gfx.PrimitiveMode.POINT_LIST,
            ]);
            mesh.destroy();
        } finally {
            device.mockRestore();
        }
    });
    test('PSO honors explicit pass topology and does not infer it from an input assembler', () => {
        (PipelineStateManager as any)._PSOHashMap.clear();
        const device: any = { createPipelineState: jest.fn((info) => ({ primitive: info.primitive })) };
        const pass: any = { hash: 10, primitive: gfx.PrimitiveMode.POINT_LIST };
        const shader: any = { typedID: 1 };
        const renderPass: any = { hash: 2 };
        const ia: any = { attributesHash: 4, attributes: [] };
        const point: any = PipelineStateManager.getOrCreatePipelineState(device, pass, shader, renderPass, ia);
        expect(point.primitive).toBe(gfx.PrimitiveMode.POINT_LIST);
        const same = PipelineStateManager.getOrCreatePipelineState(device, pass, shader, renderPass, ia);
        expect(same).toBe(point);
        const line: any = PipelineStateManager.getOrCreatePipelineState(
            device,
            { ...pass, hash: 20, primitive: gfx.PrimitiveMode.LINE_LIST },
            shader,
            renderPass,
            ia,
        );
        expect(line.primitive).toBe(gfx.PrimitiveMode.LINE_LIST);
        expect(line).not.toBe(point);
        (PipelineStateManager as any)._PSOHashMap.clear();
    });
});
