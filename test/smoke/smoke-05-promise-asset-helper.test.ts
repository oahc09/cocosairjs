/**
 * Smoke 5 — V0.2 Promise Asset Helper（L3）。
 * 覆盖：Code First 路径注册 → loadAssetAsync 解析；未知路径/类型不匹配 → 带指引的错误。
 */
import { Mesh, Material, utils, primitives, assetManager } from '../../src';
import { loadAssetAsync } from '../../src/air/utils/load-asset';

describe('smoke 5 — promise asset helper (loadAssetAsync)', () => {
    test('resolves Code First asset registered in assetManager.assets by path', async () => {
        const mesh = utils.createMesh(primitives.box({}));
        assetManager.assets.add('v02/test-box', mesh);
        const loaded = await loadAssetAsync('v02/test-box', Mesh);
        expect(loaded).toBe(mesh);
    });

    test('rejects with actionable guidance for unknown path', async () => {
        await expect(loadAssetAsync('v02/definitely-missing', Mesh))
            .rejects.toThrow(/assetManager\.assets\.add/);
    });

    test('rejects when registered asset does not match requested type', async () => {
        const mesh = utils.createMesh(primitives.box({}));
        assetManager.assets.add('v02/type-mismatch', mesh);
        // Mesh 不是 Material 实例 → 按类型过滤后应走报错路径
        await expect(loadAssetAsync('v02/type-mismatch', Material))
            .rejects.toThrow(/not found/);
    });
});
