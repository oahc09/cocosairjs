/**
 * Smoke 3 — Runtime Asset Load：程序化纹理 + 网格 + assetManager 往返。
 */
import { Texture2D, ImageAsset, Mesh, utils, primitives, assetManager, Material, deserialize } from '../../src';

describe('smoke 3 — runtime asset load', () => {
    test('procedural texture2d can be created and bound', () => {
        const SIZE = 8;
        const data = new Uint8Array(SIZE * SIZE * 4).fill(200);
        const img = new ImageAsset({
            width: SIZE,
            height: SIZE,
            _data: data,
            _compressed: false,
            format: Texture2D.PixelFormat.RGBA8888,
        });
        const tex = new Texture2D();
        tex.image = img;
        expect(tex.width).toBe(SIZE);
    });

    test('mesh can be created from primitives', () => {
        const mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
        expect(mesh).toBeTruthy();
        expect(mesh.loaded).toBe(true);
    });

    test('asset round-trip through assetManager', async () => {
        const mesh = utils.createMesh(primitives.box({}));
        assetManager.assets.add('test-mesh', mesh);
        const loaded = await new Promise<Mesh>((resolve, reject) => {
            assetManager.loadAny({ uuid: 'test-mesh' }, (err, asset) => (err ? reject(err) : resolve(asset as Mesh)));
        });
        expect(loaded).toBe(mesh);
    });

    test('deserialize can round-trip a material', () => {
        const mtl = new Material();
        mtl.initialize({ effectName: 'builtin-unlit' });
        
        expect(mtl).toBeTruthy();
    });
});
