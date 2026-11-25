import { AssetBank, ImageAsset, SpriteFrame, TextAsset, assetManager, loadAtlas } from '../../src';

const atlasURL = 'https://cdn.test/atlas/pack.atlas';

function atlasPage(page: string): TextAsset {
    const atlas = new TextAsset();
    atlas.text = `${page}\nsize: 8,8\nmarker\n  xy: 0,0\n  size: 2,2\n`;
    return atlas;
}

function loadRemoteFixture(page: string) {
    const image = new ImageAsset({
        _data: null,
        width: 8,
        height: 8,
        format: 0,
        _compressed: false,
        mipmapLevelDataSize: [],
    } as never);
    return jest.spyOn(assetManager, 'loadRemote').mockImplementation(((
        url: string,
        _options: unknown,
        done: (error: Error | null, data: TextAsset | ImageAsset) => void,
    ) => {
        const asset = url === atlasURL ? atlasPage(page) : image;
        queueMicrotask(() => done(null, asset));
    }) as never);
}

afterEach(() => jest.restoreAllMocks());

test.each(['v2.1/page', 'v2.1/page?tag=.webp#frame.png'])(
    'loadAtlas uses explicit PNG for suffixless page %s without rewriting its URL',
    async (page) => {
        const download = loadRemoteFixture(page);
        const bank = new AssetBank();

        const handle = await loadAtlas(atlasURL, { bank, pageExt: 'png' });

        expect(download.mock.calls.map(([url, options]) => [url, (options as unknown as { ext: string }).ext])).toEqual(
            [
                [atlasURL, '.atlas'],
                [`https://cdn.test/atlas/${page}`, '.png'],
            ],
        );
        expect(handle.getFrame('marker')).toBeInstanceOf(SpriteFrame);
        expect(bank.size).toBe(2);
        handle.dispose();
        expect(bank.size).toBe(0);
        expect(bank.inFlightCount).toBe(0);
    },
);

test.each<[string, string | undefined, RegExp]>([
    ['v2.1/page', undefined, /requires options\.pageExt/],
    ['v2.1/page.webp?tag=.png', 'png', /got "\.webp"/],
])('loadAtlas rejects invalid page format for %s before downloading it', async (page, pageExt, message) => {
    const download = loadRemoteFixture(page);
    const bank = new AssetBank();

    await expect(loadAtlas(atlasURL, { bank, pageExt })).rejects.toMatchObject({
        code: 'AIR_E_ATLAS_PAGE_FORMAT',
        message: expect.stringMatching(message),
    });
    expect(download).toHaveBeenCalledTimes(1);
    expect(bank.size).toBe(0);
    expect(bank.inFlightCount).toBe(0);
});
