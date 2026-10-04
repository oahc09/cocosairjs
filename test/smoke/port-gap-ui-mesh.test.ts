import { AirUIMesh, Node, SpriteFrame, Texture2D, Rect, Size } from '../../src';
const triangle = { positions: [0, 0, 10, 0, 0, 20], uvs: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2] };
describe('native UI mesh geometry and asset leases', () => {
    test('public component preserves copied geometry and validates before replacing it', () => {
        const mesh = new Node().addComponent(AirUIMesh), source = { ...triangle, positions: triangle.positions.slice() };
        mesh.setGeometry(source); source.positions[0] = 999;
        expect(mesh.geometry.positions[0]).toBe(0); expect(Object.isFrozen(mesh.geometry.positions)).toBe(true);
        expect(() => mesh.setGeometry({ ...triangle, indices: [0, 1, 99] })).toThrow('AIR_E_UI_MESH_GEOMETRY');
        expect(mesh.geometry.indices).toEqual([0, 1, 2]); mesh.dispose();
    });
    test.each([
        ['odd positions', { positions: [1, 2, 3] }], ['nonfinite position', { positions: [0, 0, Infinity, 0, 0, 20] }],
        ['wrong UV count', { uvs: [0, 0] }], ['UV outside frame', { uvs: [0, 0, 2, 0, 0, 1] }],
        ['fractional index', { indices: [0, 1.5, 2] }], ['incomplete triangle', { indices: [0, 1] }],
        ['negative index', { indices: [0, -1, 2] }], ['capacity', { positions: new Array(2050).fill(0), uvs: new Array(2050).fill(0) }],
    ])('%s rejects before GPU allocation', (_, override) => {
        const mesh = new Node().addComponent(AirUIMesh);
        expect(() => mesh.setGeometry({ ...triangle, ...override })).toThrow('AIR_E_UI_MESH_GEOMETRY'); mesh.dispose();
    });
    test('replace and dispose release only component leases, leaving shared owners alive', () => {
        const mesh = new Node().addComponent(AirUIMesh), texture = new Texture2D(), frame = new SpriteFrame();
        texture.reset({ width: 16, height: 16 }); frame.reset({ texture, rect: new Rect(0, 0, 16, 16), originalSize: new Size(16, 16) });
        frame.addRef(); texture.addRef(); mesh.spriteFrame = frame;
        expect(frame.refCount).toBe(2); expect(texture.refCount).toBe(2);
        mesh.spriteFrame = frame; expect(frame.refCount).toBe(2);
        mesh.spriteFrame = null; expect(frame.refCount).toBe(1); expect(texture.refCount).toBe(1);
        mesh.spriteFrame = frame; mesh.dispose(); mesh.dispose();
        expect(frame.refCount).toBe(1); expect(texture.refCount).toBe(1);
        expect(frame.isValid).toBe(true); expect(texture.isValid).toBe(true);
        expect(() => mesh.setGeometry(triangle)).toThrow('AIR_E_UI_MESH_DISPOSED');
        frame.decRef(); texture.decRef();
    });
    test('dynamic atlas keeps both original and packed page leases through restoration', () => {
        const mesh = new Node().addComponent(AirUIMesh), frame = new SpriteFrame();
        const original = new Texture2D(), packed = new Texture2D();
        original.reset({ width: 16, height: 16 }); packed.reset({ width: 32, height: 32 });
        frame.texture = original; frame.addRef(); original.addRef(); packed.addRef(); mesh.spriteFrame = frame;
        frame._setDynamicAtlasFrame({ texture: packed, x: 0, y: 0 }); mesh.refreshFrame();
        expect(original.refCount).toBe(2); expect(packed.refCount).toBe(2);
        frame._resetDynamicAtlasFrame(); mesh.refreshFrame();
        expect(original.isValid).toBe(true); expect(original.refCount).toBe(2);
        mesh.dispose(); expect(original.refCount).toBe(1); expect(packed.refCount).toBe(1);
        frame.decRef(); original.decRef(); packed.decRef();
    });
});
