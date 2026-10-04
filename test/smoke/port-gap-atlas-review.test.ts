import fs from 'fs';
import path from 'path';
import { AssetBank, ImageAsset, TextAsset, assetManager } from '../../src';
import { parseAtlasText } from '../../src/air/assets/atlas/atlas-parser';
import { loadAtlas } from '../../src/air/assets/atlas/atlas-loader';

const pack = fs.readFileSync(path.resolve(__dirname, '../fixtures/atlas/pack.atlas'), 'utf8');

describe('libGDX compatibility and out-of-order atlas page completion', () => {
    test('official compact output permits page and region fields without indentation', () => {
        const doc = parseAtlasText('page.png\nsize:32,32\nblob\nbounds:0,0,8,8\noffsets:2,3,16,18\n');
        expect(doc.pages).toHaveLength(1);
        expect(doc.getRegion('blob')!.original).toEqual({ width: 16, height: 18 });
    });

    test('legacy writer uses unindented page fields with indented region fields', () => {
        const doc = parseAtlasText('\npage.png\nsize: 32, 32\nformat: RGBA8888\nfilter: Nearest, Nearest\nrepeat: none\nblob\n  rotate: false\n  xy: 0, 0\n  size: 8, 8\n  orig: 16, 18\n  offset: 2, 3\n  index: -1\n');
        expect(doc.getRegion('blob')!.offset).toEqual({ left: 2, bottom: 3 });
    });

    test('official offsets fields are left, bottom, originalWidth, originalHeight', () => {
        const doc = parseAtlasText('page.png\n  size: 32,32\nblob\n  bounds: 0,0,8,8\n  offsets: 2,3,16,18\n');
        expect(doc.getRegion('blob')!.original).toEqual({ width: 16, height: 18 });
        expect(doc.getRegion('blob')!.offset).toEqual({ left: 2, bottom: 3 });
    });

    test('official rotated bounds use logical width/height, the packed footprint swaps them', () => {
        const doc = parseAtlasText('page.png\n  size: 32,32\nhero\n  rotate: 90\n  bounds: 8,2,4,12\n');
        expect(doc.getRegion('hero')!.logical).toEqual({ width: 4, height: 12 });
        expect(doc.getRegion('hero')!.packed).toEqual({ width: 12, height: 4 });
    });

    test('duplicate page URL returns every bank subscription on dispose', async () => {
        const requests: Array<{ url: string; complete: Function }> = [];
        const spy = jest.spyOn(assetManager, 'loadRemote').mockImplementation(((url, options, complete) => {
            requests.push({ url, complete: typeof options === 'function' ? options : complete });
        }) as never);
        const bank = new AssetBank();
        try {
            const pending = loadAtlas('https://example.test/repeated.atlas', { bank });
            const text = new TextAsset();
            text.text = 'page.png\nsize:16,16\nfirst\nbounds:0,0,4,4\n\npage.png\nsize:16,16\nsecond\nbounds:4,0,4,4\n';
            requests[0]!.complete(null, text);
            await Promise.resolve(); await Promise.resolve();
            const image = new ImageAsset({ _data: null, width: 16, height: 16, format: 0, _compressed: false, mipmapLevelDataSize: [] } as never);
            expect(requests.filter((r) => r.url.endsWith('page.png'))).toHaveLength(1);
            requests.find((r) => r.url.endsWith('page.png'))!.complete(null, image);
            const handle = await pending;
            expect(handle.textures).toHaveLength(2);
            handle.dispose();
            expect(bank.size).toBe(0);
            expect(image.refCount).toBe(0);
        } finally { bank.releaseAll(); spy.mockRestore(); }
    });

    test('page 1 completing first preserves the document page order', async () => {
        const requests: Array<{ url: string; complete: Function }> = [];
        const spy = jest.spyOn(assetManager, 'loadRemote').mockImplementation(((url, options, complete) => {
            requests.push({ url, complete: typeof options === 'function' ? options : complete });
        }) as never);
        const bank = new AssetBank();
        try {
            const promise = loadAtlas('https://example.test/pack.atlas', { bank });
            const outcome = promise.then((handle) => ({ handle, error: null }), (error) => ({ handle: null, error }));
            const text = new TextAsset(); text.text = pack; requests[0]!.complete(null, text);
            await Promise.resolve(); await Promise.resolve();
            const second = new ImageAsset({ _data: null, width: 16, height: 16, format: 0, _compressed: false, mipmapLevelDataSize: [] } as never);
            const first = new ImageAsset({ _data: null, width: 32, height: 16, format: 0, _compressed: false, mipmapLevelDataSize: [] } as never);
            requests.find((r) => r.url.endsWith('page-1.png'))!.complete(null, second);
            await Promise.resolve();
            requests.find((r) => r.url.endsWith('page-0.png'))!.complete(null, first);
            const result = await outcome;
            expect(result.error).toBeNull();
            expect(result.handle!.textures.map((t) => t.width)).toEqual([32, 16]);
            result.handle!.dispose(); expect(bank.size).toBe(0);
        } finally { bank.releaseAll(); spy.mockRestore(); }
    });
});
