import { TiledLayer } from '../../src/cocos/tiledmap/tiled-layer';
import { MixedGID } from '../../src/cocos/tiledmap/tiled-types';

function staticLayer(culling: boolean): { layer: TiledLayer; schedule: jest.Mock } {
    const schedule = jest.fn();
    const layer: TiledLayer = Object.assign(Object.create(TiledLayer.prototype), {
        tiles: [0, 1, 2, 1],
        _layerSize: { width: 2, height: 2 },
        _tilesets: [{ firstGid: 1 }],
        texGrids: new Map([
            [1, {}],
            [2, {}],
        ]),
        _enableCulling: culling,
        _cullingDirty: false,
        _updateVertex: jest.fn(),
        _markForUpdateRenderData: schedule,
    });
    return { layer, schedule };
}

describe('Static Tiled layer mutations', () => {
    test.each([true, false])('single and batch edit schedule pending render work (culling=%s)', (culling) => {
        const { layer, schedule } = staticLayer(culling);
        layer.setTileGIDAt(2 as MixedGID, 0, 0);
        expect(layer.getTileGIDAt(0, 0)).toBe(2);
        expect(layer.isCullingDirty()).toBe(true);
        expect(schedule).toHaveBeenCalledTimes(1);

        schedule.mockClear();
        layer.setCullingDirty(false);
        layer.setTilesGIDAt([1, 0, 0, 2], 0, 0, 2);
        expect(layer.tiles).toEqual([1, 0, 0, 2]);
        expect(layer.isCullingDirty()).toBe(true);
        expect(schedule).toHaveBeenCalled();
    });

    test('identical single or batch data does not schedule work', () => {
        const { layer, schedule } = staticLayer(false);
        layer.setTileGIDAt(1 as MixedGID, 1, 0);
        layer.setTilesGIDAt([0, 1, 2, 1], 0, 0, 2);
        expect(layer.isCullingDirty()).toBe(false);
        expect(schedule).not.toHaveBeenCalled();
    });
});
