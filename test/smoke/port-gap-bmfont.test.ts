import fs from 'fs';
import path from 'path';
import { TextProcessing } from '../../src/cocos/2d/assembler/label/text-processing';
import { TextStyle } from '../../src/cocos/2d/assembler/label/text-style';
import { TextLayout } from '../../src/cocos/2d/assembler/label/text-layout';
import { parseFnt, createBitmapFont, loadBitmapFont, Texture2D, SpriteFrame, BitmapFont, assetManager, TextAsset, AssetBank } from '../../src';
const text = fs.readFileSync(path.resolve(__dirname, '../fixtures/bmfont/font.fnt'), 'utf8');

describe('BMFont text, native assembly and ownership', () => {
    test.each(['AV', 'AVA', 'V'])('native incoming kerning includes the final character in %s', (value) => {
        const style = new TextStyle(), layout = new TextLayout(), processing = new TextProcessing();
        style.fntConfig = parseFnt(text);
        (processing as unknown as { _computeHorizontalKerningForText(s: TextStyle, l: TextLayout, t: string): void })
            ._computeHorizontalKerningForText(style, layout, value);
        expect(layout.horizontalKerning).toEqual(value === 'AV' ? [0, -4] : value === 'AVA' ? [0, -4, 0] : [0]);
    });
    test('quoted metadata, glyph geometry and signed kerning parse without engine resource allocation', () => {
        const data = parseFnt('\uFEFF' + text.replace(/\n/g, '\r\n'));
        expect(data).toMatchObject({ fontSize: 20, commonHeight: 20, atlasName: 'page.png', scaleW: 32, scaleH: 16 });
        expect(data.fontDefDictionary[65]).toMatchObject({ rect: { x: 0, y: 0, width: 8, height: 12 }, xAdvance: 12 });
        expect(data.kerningDict[(65 << 16) | 86]).toBe(-4);
        expect(Object.isFrozen(data)).toBe(true);
        expect(Object.isFrozen(data.fontDefDictionary[65].rect)).toBe(true);
    });
    test.each([
        ['XML', '<font/>'], ['binary', 'BMF'], ['multiple pages', text.replace('pages=1', 'pages=2')],
        ['packed', text.replace('packed=0', 'packed=1')], ['other glyph page', text.replace('page=0 chnl', 'page=1 chnl')],
        ['count mismatch', text.replace('chars count=2', 'chars count=3')],
        ['duplicate character', text.replace('char id=86', 'char id=65')],
        ['outside page', text.replace('width=8', 'width=99')], ['nonfinite size', text.replace('size=20', 'size=Infinity')],
        ['unknown kerning character', text.replace('second=86', 'second=90')],
        ['malformed field', text.replace('scaleW=32', 'scaleW=32 junk')],
    ])('%s input rejects explicitly', (name, malformed) => {
        expect(() => parseFnt(malformed)).toThrow(/AIR_E_FNT_/);
    });
    test('native font initializes glyphs, refuses extra owner disposal and releases only owned references', () => {
        const texture = new Texture2D(); texture.reset({ width: 32, height: 16 }); texture.addRef();
        const page = new SpriteFrame(); page.texture = texture; page.addRef();
        const owned = createBitmapFont(parseFnt(text), page);
        expect(owned.font).toBeInstanceOf(BitmapFont);
        expect(owned.font.fontDefDictionary.getLetter('65')).toMatchObject({ valid: true, u: 0, v: 0, w: 8, h: 12, xAdvance: 12 });
        expect(texture.refCount).toBe(3); // External owner, factory lease, FontAtlas.
        expect(page.refCount).toBe(2);
        owned.font.addRef();
        expect(() => owned.dispose()).toThrow('AIR_E_FNT_IN_USE');
        expect(owned.disposed).toBe(false);
        owned.font.decRef(false); owned.dispose(); owned.dispose();
        expect(owned.disposed).toBe(true); expect(texture.refCount).toBe(1); expect(page.refCount).toBe(1);
        page.decRef(); texture.decRef();
    });
    test('page load failure resolves a font-relative URL and releases the completed text subscription', async () => {
        const calls: Array<{ url: string; complete: (error: Error | null, asset?: TextAsset) => void }> = [];
        const spy = jest.spyOn(assetManager, 'loadRemote').mockImplementation(((url, options, complete) => {
            calls.push({ url, complete });
        }) as never);
        const bank = new AssetBank();
        try {
            const pending = loadBitmapFont('https://example.test/fonts/a.fnt', { bank }).catch((error) => error);
            const asset = new TextAsset(); asset.text = text; calls[0].complete(null, asset);
            await Promise.resolve(); await Promise.resolve();
            expect(calls[1].url).toBe('https://example.test/fonts/page.png');
            calls[1].complete(new Error('404'));
            expect(await pending).toMatchObject({ code: 'AIR_E_LOAD_FAILED' });
            expect(bank.size).toBe(0); expect(bank.inFlightCount).toBe(0);
        } finally { bank.releaseAll(); spy.mockRestore(); }
    });
});
