import { Node, MeshRenderer, Quat, Vec3, Camera, primitives, utils } from '../../src';
import { MeshUtils } from '../../src/cocos/3d/misc/create-mesh';
import { Fog, FogType, FOG_TYPE_NONE } from '../../src/cocos/render-scene/scene/fog';

describe('competitive API tail contracts', () => {
    test('quad is a unit XY shape and plane is an XZ shape', () => {
        const quad = primitives.quad();
        expect(quad.minPos).toEqual({ x: -0.5, y: -0.5, z: 0 });
        expect(quad.maxPos).toEqual({ x: 0.5, y: 0.5, z: 0 });
        const plane = primitives.plane({ width: 2, length: 4, widthSegments: 1, lengthSegments: 1 });
        expect(plane.positions.filter((_, i) => i % 3 === 1).every((y) => y === 0)).toBe(true);
    });
    test('Quat has its native instance operations and static normalization', () => {
        const q = new Quat(0, 0, 0, 2);
        expect(q.clone().strictEquals(q)).toBe(true);
        Quat.normalize(q, q);
        expect(q.length()).toBeCloseTo(1);
        expect(typeof q.slerp).toBe('function');
        expect(typeof q.getEulerAngles).toBe('function');
    });
    test('component string lookup uses the registered class name, while addChild returns void', () => {
        const root = new Node('root');
        const child = new Node('child');
        expect(root.addChild(child)).toBeUndefined();
        const renderer = child.addComponent(MeshRenderer);
        expect(child.getComponent(MeshRenderer)).toBe(renderer);
        expect(child.getComponent('cc.MeshRenderer')).toBe(renderer);
        root.destroy();
    });
    test('Camera component accepts the native x,y,out screenPointToRay signature', () => {
        const node = new Node();
        const camera = node.addComponent(Camera);
        const ray = camera.screenPointToRay(0, 0);
        expect(ray).toBeDefined();
        node.destroy();
    });
    test('official dynamic mesh entry is the same function in the source namespace', () => {
        expect(utils.MeshUtils.createDynamicMesh).toBe(MeshUtils.createDynamicMesh);
    });
    test('fog type configured while disabled is discarded; enabling before type preserves it', () => {
        const fog = new Fog();
        jest.spyOn(fog as any, '_updatePipeline').mockImplementation(() => {});
        fog.enabled = false;
        fog.type = FogType.EXP;
        expect(fog.type).toBe(FOG_TYPE_NONE);
        fog.enabled = true;
        fog.type = FogType.EXP;
        expect(fog.type).toBe(FogType.EXP);
    });
    test('static geometry can generate bounds explicitly', () => {
        const geometry = { positions: [-2, -1, 0, 2, -1, 0, 0, 3, 0] };
        const withBounds = utils.createMesh(geometry, undefined, { calculateBounds: true });
        expect(withBounds.struct.minPosition).toEqual(new Vec3(-2, -1, 0));
        expect(withBounds.struct.maxPosition).toEqual(new Vec3(2, 3, 0));
        const noBounds = utils.createMesh(geometry);
        expect(noBounds.struct.minPosition).toBeUndefined();
        expect(noBounds.struct.maxPosition).toBeUndefined();
        withBounds.destroy();
        noBounds.destroy();
    });
});
