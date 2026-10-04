import { BitmapFont } from '../../cocos/2d/assets/bitmap-font';
import { SpriteFrame } from '../../cocos/2d/assets/sprite-frame';
import { Texture2D } from '../../cocos/asset/assets/texture-2d';
import { ImageAsset } from '../../cocos/asset/assets/image-asset';
import { TextAsset } from '../../cocos/asset/assets/text-asset';
import { AssetBank } from './asset-bank';

export interface AirFntGlyph {
    readonly rect: Readonly<{ x: number; y: number; width: number; height: number }>;
    readonly xOffset: number;
    readonly yOffset: number;
    readonly xAdvance: number;
}
export interface AirFntData {
    readonly fontSize: number;
    readonly commonHeight: number;
    readonly base: number;
    readonly scaleW: number;
    readonly scaleH: number;
    readonly atlasName: string;
    readonly pages: readonly Readonly<{ id: 0; file: string }>[];
    readonly fontDefDictionary: Readonly<Record<string, AirFntGlyph>>;
    readonly kerningDict: Readonly<Record<string, number>>;
}
function fail(code: string, message: string): never {
    const error = new Error(`${code}: ${message}`); Object.assign(error, { code }); throw error;
}
function integer(fields: Record<string, string>, name: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
    const raw = fields[name], value = Number(raw);
    if (raw === undefined || raw.trim() === '' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
        fail('AIR_E_FNT_DATA', `${name} must be an integer in [${minimum}, ${maximum}]`);
    }
    return value;
}
/** Parse the text BMFont format. Native BitmapFont supports one unpacked page in this factory. */
export function parseFnt(text: string): AirFntData {
    if (typeof text !== 'string' || /^\s*</.test(text) || text.startsWith('BMF')) fail('AIR_E_FNT_FORMAT', 'expected BMFont text, not XML/binary');
    const records = new Map<string, Record<string, string>[]>();
    for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
        if (!line.trim()) continue;
        const match = /^\s*(\w+)\s+(.*)$/.exec(line);
        if (!match || !['info', 'common', 'page', 'chars', 'char', 'kernings', 'kerning'].includes(match[1])) {
            fail('AIR_E_FNT_FORMAT', `unsupported record: ${line.slice(0, 80)}`);
        }
        const fields: Record<string, string> = Object.create(null);
        const pattern = /([A-Za-z]\w*)=("(?:[^"\\]|\\.)*"|[^\s]+)/g;
        let end = 0, field: RegExpExecArray | null;
        while ((field = pattern.exec(match[2]))) {
            if (match[2].slice(end, field.index).trim() || fields[field[1]] !== undefined) fail('AIR_E_FNT_FORMAT', 'malformed or duplicate field');
            fields[field[1]] = field[2].startsWith('"') ? field[2].slice(1, -1).replace(/\\(["\\])/g, '$1') : field[2];
            end = pattern.lastIndex;
        }
        if (match[2].slice(end).trim()) fail('AIR_E_FNT_FORMAT', 'malformed field tail');
        const list = records.get(match[1]) || []; list.push(fields); records.set(match[1], list);
    }
    const single = (name: string): Record<string, string> => {
        const list = records.get(name); if (list?.length !== 1) fail('AIR_E_FNT_DATA', `exactly one ${name} record required`);
        return list[0];
    };
    const info = single('info'), common = single('common'), page = single('page');
    const size = integer(info, 'size', -65535, 65535);
    if (!size) fail('AIR_E_FNT_DATA', 'font size cannot be zero');
    if (integer(common, 'pages') !== 1 || integer(page, 'id') !== 0) fail('AIR_E_FNT_PAGES', 'only page 0 of a single-page font is supported');
    if (common.packed !== undefined && integer(common, 'packed', 0, 1) !== 0) fail('AIR_E_FNT_PACKED', 'packed channel fonts are unsupported');
    if (!page.file) fail('AIR_E_FNT_DATA', 'page file required');
    const scaleW = integer(common, 'scaleW', 1), scaleH = integer(common, 'scaleH', 1);
    const fontDefDictionary: Record<string, AirFntGlyph> = Object.create(null);
    const chars = records.get('char') || [];
    if (!chars.length || integer(single('chars'), 'count') !== chars.length) fail('AIR_E_FNT_DATA', 'character count mismatch or empty font');
    for (const char of chars) {
        const id = integer(char, 'id', 0, 65535);
        if (fontDefDictionary[id]) fail('AIR_E_FNT_DATA', `duplicate character ${id}`);
        if (integer(char, 'page') !== 0) fail('AIR_E_FNT_PAGES', 'glyph references an unsupported page');
        const x = integer(char, 'x'), y = integer(char, 'y'), width = integer(char, 'width'), height = integer(char, 'height');
        if (x + width > scaleW || y + height > scaleH) fail('AIR_E_FNT_DATA', `glyph ${id} exceeds its page`);
        fontDefDictionary[id] = Object.freeze({ rect: Object.freeze({ x, y, width, height }),
            xOffset: integer(char, 'xoffset', -65535, 65535), yOffset: integer(char, 'yoffset', -65535, 65535),
            xAdvance: integer(char, 'xadvance', -65535, 65535) });
    }
    const kerningDict: Record<string, number> = Object.create(null), kernings = records.get('kerning') || [];
    if (records.has('kernings') && integer(single('kernings'), 'count') !== kernings.length) fail('AIR_E_FNT_DATA', 'kerning count mismatch');
    for (const kerning of kernings) {
        const first = integer(kerning, 'first', 0, 65535), second = integer(kerning, 'second', 0, 65535);
        if (!fontDefDictionary[first] || !fontDefDictionary[second]) fail('AIR_E_FNT_DATA', 'kerning refers to an unknown character');
        const key = (first << 16) | second;
        if (kerningDict[key] !== undefined) fail('AIR_E_FNT_DATA', 'duplicate kerning pair');
        kerningDict[key] = integer(kerning, 'amount', -65535, 65535);
    }
    return Object.freeze({ fontSize: Math.abs(size), commonHeight: integer(common, 'lineHeight', 1),
        base: integer(common, 'base'), scaleW, scaleH, atlasName: page.file,
        pages: Object.freeze([Object.freeze({ id: 0 as const, file: page.file })]),
        fontDefDictionary: Object.freeze(fontDefDictionary), kerningDict: Object.freeze(kerningDict) });
}

export interface AirBitmapFontHandle {
    readonly font: BitmapFont;
    readonly data: AirFntData;
    readonly disposed: boolean;
    /** Detach labels first. Extra font owners must release their references before disposal. */
    dispose(): void;
}

/** Assemble and initialize a native font from an untrimmed, unrotated full-page SpriteFrame. */
export function createBitmapFont(data: AirFntData, page: SpriteFrame): AirBitmapFontHandle {
    if (!(page instanceof SpriteFrame) || page.rotated || page.rect.x !== 0 || page.rect.y !== 0
        || page.rect.width !== data.scaleW || page.rect.height !== data.scaleH
        || page.originalSize.width !== data.scaleW || page.originalSize.height !== data.scaleH
        || page.offset.x !== 0 || page.offset.y !== 0
        || page.texture.width !== data.scaleW || page.texture.height !== data.scaleH) {
        fail('AIR_E_FNT_PAGE_TEXTURE', 'a full, unrotated page matching scaleW/scaleH is required');
    }
    const texture = page.texture;
    texture.addRef(); page.addRef();
    const font = new BitmapFont(); font.addRef();
    let disposed = false;
    try { font.fontSize = data.fontSize; font.spriteFrame = page; font.fntConfig = data; font.onLoaded(); }
    catch (error) {
        if (font.fontDefDictionary) font.fontDefDictionary.texture = null;
        font.decRef(); page.decRef(); texture.decRef(); throw error;
    }
    return Object.freeze({ font, data, get disposed() { return disposed; }, dispose() {
        if (disposed) return;
        if (font.refCount > 1) fail('AIR_E_FNT_IN_USE', 'release extra font owners and detach labels before dispose');
        disposed = true;
        font.fontDefDictionary.texture = null; font.spriteFrame = null;
        font.decRef(); page.decRef(); texture.decRef();
    } });
}

export interface AirBitmapFontLoadOptions { bank: AssetBank; signal?: AbortSignal; baseURL?: string; }
/** Load .fnt text and its relative page through independent, cancellable bank subscriptions. */
export async function loadBitmapFont(url: string, options: AirBitmapFontLoadOptions): Promise<AirBitmapFontHandle> {
    const { bank, signal } = options;
    let textOwned = false, pageOwned = false, pageURL = '', texture: Texture2D | undefined, frame: SpriteFrame | undefined;
    const release = (): void => {
        if (pageOwned) { pageOwned = false; bank.release(pageURL, 'png'); }
        if (textOwned) { textOwned = false; bank.release(url, 'fnt'); }
    };
    try {
        const text = await bank.load(url, { ext: 'fnt', signal }); textOwned = true;
        if (!(text instanceof TextAsset)) fail('AIR_E_FNT_FORMAT', 'font URL did not produce TextAsset');
        const data = parseFnt(text.text);
        try {
            const base = options.baseURL || new URL(url, typeof document !== 'undefined' ? document.baseURI : undefined).href;
            pageURL = new URL(data.atlasName, base).href;
        } catch { fail('AIR_E_FNT_BASE_URL', 'relative pages require an absolute font URL, document base or explicit baseURL'); }
        if (!/\.png(?:$|[?#])/i.test(pageURL)) fail('AIR_E_FNT_PAGE_TEXTURE', 'this loader supports PNG pages; supply other formats via createBitmapFont');
        const image = await bank.load(pageURL, { ext: 'png', signal }); pageOwned = true;
        if (signal?.aborted) fail('AIR_E_ABORTED', 'font subscription was cancelled');
        if (!(image instanceof ImageAsset)) fail('AIR_E_FNT_PAGE_TEXTURE', 'page URL did not produce ImageAsset');
        texture = new Texture2D(); texture.image = image;
        frame = new SpriteFrame(); frame.texture = texture;
        const owned = createBitmapFont(data, frame);
        return Object.freeze({ font: owned.font, data, get disposed() { return owned.disposed; }, dispose() { owned.dispose(); release(); } });
    } catch (error) {
        frame?.destroy(); texture?.destroy(); release(); throw error;
    }
}
