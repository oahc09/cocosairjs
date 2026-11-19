import { AssetBank, ImageAsset, TextAsset, assetManager, loadTiledMap } from '../../src';
import { Asset } from '../../src/cocos/asset/assets/asset';
import { TMXMapInfo } from '../../src/cocos/tiledmap/tmx-xml-parser';

const ROOT = 'https://maps.example/levels/';
const MAP =
    '<map version="1.4" orientation="orthogonal" width="2" height="1" tilewidth="16" tileheight="16">' +
    '<tileset firstgid="1" source="a/tiles.tsx"/><tileset firstgid="2" source="b/tiles.tsx"/>' +
    '<layer name="floor" width="2" height="1"><data encoding="csv">1,2</data></layer></map>';
const TSX =
    '<tileset version="1.4" name="tiles" tilewidth="16" tileheight="16" tilecount="1" columns="1">' +
    '<image source="tiles.png" width="16" height="16"/></tileset>';

function text(source: string): TextAsset {
    const asset = new TextAsset();
    asset.text = source;
    return asset;
}
function image(): ImageAsset {
    return new ImageAsset({ _data: null, width: 16, height: 16, format: 0, _compressed: false });
}

function fixture(onRequest?: (url: string) => void) {
    const a = image();
    const b = image();
    const files = new Map<string, Asset>([
        ['map.tmx', text(MAP)],
        ['a/tiles.tsx', text(TSX)],
        ['b/tiles.tsx', text(TSX)],
        ['a/tiles.png', a],
        ['b/tiles.png', b],
    ]);
    const requests: [string, string][] = [];
    jest.spyOn(assetManager, 'loadRemote').mockImplementation(((
        url: string,
        config: { ext: string },
        done: (err: Error | null, file?: Asset) => void,
    ) => {
        requests.push([url, config.ext]);
        onRequest?.(url);
        const file = files.get(url.slice(ROOT.length));
        if (file) done(null, file instanceof TextAsset ? text(file.text) : file);
        else done(new Error('fixture missing: ' + url));
    }) as never);
    return { a, b, files, requests, bank: new AssetBank() };
}

describe('Code First Tiled dependency loading', () => {
    afterEach(() => jest.restoreAllMocks());

    test('two TSX files resolve identical image basenames to distinct native tile assets', async () => {
        const { a, b, bank, files, requests } = fixture();
        const handle = await loadTiledMap('map.tmx', { bank, baseURL: ROOT });
        try {
            const asset = handle.asset;
            expect(asset.spriteFrameNames).toHaveLength(2);
            expect(new Set(asset.spriteFrameNames).size).toBe(2);
            expect(requests).toEqual([
                [ROOT + 'map.tmx', '.tmx'],
                [ROOT + 'a/tiles.tsx', '.tsx'],
                [ROOT + 'b/tiles.tsx', '.tsx'],
                [ROOT + 'a/tiles.png', '.png'],
                [ROOT + 'b/tiles.png', '.png'],
            ]);
            const tsxMap = Object.fromEntries(asset.tsxFileNames.map((name, i) => [name, asset.tsxFiles[i].text]));
            const frames = Object.fromEntries(asset.spriteFrameNames.map((name, i) => [name, asset.spriteFrames[i]]));
            const sizes = Object.fromEntries(
                asset.spriteFrameNames.map((name, i) => [name, asset.spriteFrameSizes[i]]),
            );
            const parsed = new TMXMapInfo(asset.tmxXmlStr, tsxMap, frames, sizes, {});
            expect(parsed.getTilesets().map((tile) => tile.firstGid)).toEqual([1, 2]);
            expect(parsed.getTilesets().map((tile) => tile.sourceImage!.texture)).toEqual(
                asset.spriteFrames.map((frame) => frame.texture),
            );
            expect(
                parsed.getTilesets().map((tile) => (tile.sourceImage!.texture as import('../../src').Texture2D).image),
            ).toEqual([a, b]);
            expect((files.get('map.tmx') as TextAsset).text).toBe(MAP);
            expect((files.get('a/tiles.tsx') as TextAsset).text).toBe(TSX);
        } finally {
            handle.dispose();
        }
        expect(bank.size).toBe(0);
    });

    test('disposing two handles releases only the matching subscriptions, once', async () => {
        const { bank, a, b, requests } = fixture();
        const [first, second] = await Promise.all([
            loadTiledMap(ROOT + 'map.tmx', { bank }),
            loadTiledMap(ROOT + 'map.tmx', { bank }),
        ]);
        expect(first.asset.spriteFrames[0]).not.toBe(second.asset.spriteFrames[0]);
        expect(requests.filter(([, ext]) => ext === '.png')).toHaveLength(2);
        expect(bank.refCount(ROOT + 'a/tiles.png', 'png')).toBe(2);
        first.dispose();
        first.dispose();
        expect(first.disposed).toBe(true);
        expect(second.disposed).toBe(false);
        expect(bank.refCount(ROOT + 'a/tiles.png', 'png')).toBe(1);
        expect(a.refCount).toBe(1);
        expect(b.refCount).toBe(1);
        second.dispose();
        expect(bank.size).toBe(0);
        expect(a.refCount).toBe(0);
        expect(b.refCount).toBe(0);
    });

    test('missing later image rolls back the failed map without releasing another owner', async () => {
        const { files, bank, a } = fixture();
        await bank.load(ROOT + 'a/tiles.png', { ext: 'png' });
        files.delete('b/tiles.png');
        await expect(loadTiledMap(ROOT + 'map.tmx', { bank })).rejects.toMatchObject({ code: 'AIR_E_LOAD_FAILED' });
        expect(bank.size).toBe(1);
        expect(bank.refCount(ROOT + 'a/tiles.png', 'png')).toBe(1);
        expect(a.refCount).toBe(1);
        bank.release(ROOT + 'a/tiles.png', 'png');
        expect(bank.size).toBe(0);
    });

    test('a shared image used by a tileset and an image layer loads once', async () => {
        const { files, bank, requests } = fixture();
        files.set(
            'map.tmx',
            text(
                MAP.replace(
                    '</map>',
                    '<imagelayer name="back"><image source="a/tiles.png" width="16" height="16"/></imagelayer></map>',
                ),
            ),
        );
        const handle = await loadTiledMap(ROOT + 'map.tmx', { bank });
        try {
            expect(handle.asset.imageLayerSpriteFrame).toEqual([handle.asset.spriteFrames[0]]);
            expect(handle.asset.imageLayerSpriteFrameNames).toEqual([handle.asset.spriteFrameNames[0]]);
            expect(requests.filter(([url]) => url === ROOT + 'a/tiles.png')).toHaveLength(1);
        } finally {
            handle.dispose();
        }
        expect(bank.size).toBe(0);
    });

    test('cancelling during a later image fetch releases already acquired images', async () => {
        const controller = new AbortController();
        const { bank, a, b } = fixture((url) => {
            if (url === ROOT + 'b/tiles.png') controller.abort();
        });
        await expect(loadTiledMap(ROOT + 'map.tmx', { bank, signal: controller.signal })).rejects.toMatchObject({
            code: 'AIR_E_ABORTED',
        });
        expect(bank.size).toBe(0);
        expect(a.refCount).toBe(0);
        expect(b.refCount).toBe(0);
    });

    test('off-origin paths and malformed TSX are rejected before image acquisition', async () => {
        const { files, bank, requests } = fixture();
        files.set('b/tiles.tsx', text(TSX.replace('tiles.png', 'https://other.example/tiles.png')));
        await expect(loadTiledMap(ROOT + 'map.tmx', { bank })).rejects.toThrow('share the map origin');
        expect(requests.filter(([, ext]) => ext === '.png')).toHaveLength(0);
        expect(bank.size).toBe(0);
        files.set('b/tiles.tsx', text('<invalid/>'));
        await expect(loadTiledMap(ROOT + 'map.tmx', { bank })).rejects.toThrow('expected valid <tileset> XML');
        expect(bank.size).toBe(0);
    });
});
