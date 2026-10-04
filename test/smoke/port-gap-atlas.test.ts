// PG-01 libGDX 文本图集回归：纯解析器 + 原生 SpriteFrame 工厂/所有权 + bank 加载上下文。
// 原生测试用 jsdom Texture2D（bmfont 同款模式）；PNG fixture 供 Lead 三浏览器 UV/trim 像素检查。
import fs from 'fs';
import path from 'path';
import { Texture2D, SpriteFrame, TextAsset, ImageAsset, assetManager, AssetBank } from '../../src';
import { parseAtlasText, type AirAtlasDocument } from '../../src/air/assets/atlas/atlas-parser';
import { createAtlasHandle } from '../../src/air/assets/atlas/atlas-factory';
import { loadAtlas } from '../../src/air/assets/atlas/atlas-loader';

const pack = fs.readFileSync(path.resolve(__dirname, '../fixtures/atlas/pack.atlas'), 'utf8');
const packNew = fs.readFileSync(path.resolve(__dirname, '../fixtures/atlas/pack-new.atlas'), 'utf8');

function pageTexture (width: number, height: number): Texture2D {
    const texture = new Texture2D();
    texture.reset({ width, height });
    return texture;
}

function legacyTextures (): [Texture2D, Texture2D] {
    return [pageTexture(32, 16), pageTexture(16, 16)];
}

describe('PG-01 parseAtlasText (pure parser)', () => {
    test('legacy format: pages, plain/rotated/trimmed regions with libGDX semantics', () => {
        const document = parseAtlasText('\uFEFF' + pack.replace(/\n/g, '\r\n'));
        expect(document.pages).toHaveLength(2);
        expect(document.pages[0]).toMatchObject({ file: 'page-0.png', width: 32, height: 16, format: 'RGBA8888', filter: 'Linear,Linear', repeat: 'none' });
        expect(document.pages[1]).toMatchObject({ file: 'page-1.png', width: 16, height: 16, filter: 'Nearest,Nearest' });

        const plain = document.getRegion('plain')!;
        expect(plain).toMatchObject({ name: 'plain', index: -1, pageIndex: 0, rotate: 0, xy: { x: 0, y: 0 }, packed: { width: 8, height: 8 }, logical: { width: 8, height: 8 }, original: { width: 8, height: 8 }, offset: { left: 0, bottom: 0 } });

        // rotate: 逻辑尺寸保留 size，页上占用 = 交换（12x4）
        const hero = document.getRegion('hero')!;
        expect(hero.rotate).toBe(90);
        expect(hero.logical).toEqual({ width: 4, height: 12 });
        expect(hero.packed).toEqual({ width: 12, height: 4 });
        expect(hero.xy).toEqual({ x: 8, y: 0 });
        expect(hero.original).toEqual({ width: 4, height: 12 }); // 缺省 orig = logical
        expect(hero.offset).toEqual({ left: 0, bottom: 0 });

        // trim：orig 16x16、offset left 4 bottom 2
        const trimmed = document.getRegion('trimmed')!;
        expect(trimmed.original).toEqual({ width: 16, height: 16 });
        expect(trimmed.offset).toEqual({ left: 4, bottom: 2 });

        expect(Object.isFrozen(document)).toBe(true);
        expect(Object.isFrozen(plain)).toBe(true);
        expect(Object.isFrozen(hero.packed)).toBe(true);
    });

    test('animated same-name different-index stays queryable without silent overwrite', () => {
        const document = parseAtlasText(pack);
        const frames = document.getRegions('walk');
        expect(frames.map((region) => region.index)).toEqual([0, 1, 2]);
        expect(frames.map((region) => region.xy.x)).toEqual([0, 4, 8]);
        expect(frames.every((region) => region.pageIndex === 1)).toBe(true);
        expect(document.getRegion('walk')).toBeUndefined(); // 无 index -1 普通帧：不静默返回动画帧
        expect(document.getRegion('plain')!.name).toBe('plain');
        expect(document.getRegion('missing')).toBeUndefined();
    });

    test('new format: bounds/offsets derive logical size, original size and trim', () => {
        const document = parseAtlasText(packNew);
        expect(document.pages[0]).toMatchObject({ file: 'newpage.png', width: 16, height: 16, pma: true });
        const blob = document.getRegion('blob')!;
        expect(blob.rotate).toBe(0);
        expect(blob.packed).toEqual({ width: 8, height: 8 });
        expect(blob.logical).toEqual({ width: 8, height: 8 });
        expect(blob.original).toEqual({ width: 16, height: 16 }); // offsets[2],[3] = originalWidth/Height
        expect(blob.offset).toEqual({ left: 2, bottom: 1 }); // offsets[0],[1] = left/bottom
    });

    test.each([
        ['unknown rotation', pack.replace('rotate: true', 'rotate: 180'), 'AIR_E_ATLAS_ROTATION'],
        ['region beyond page', pack.replace('xy: 20, 0', 'xy: 30, 0'), 'AIR_E_ATLAS_BOUNDS'],
        ['rotated footprint beyond page', pack.replace('size: 4, 12', 'size: 30, 12'), 'AIR_E_ATLAS_BOUNDS'],
        ['first block not a page', pack.replace('page-0.png\n', ''), 'AIR_E_ATLAS_FORMAT'],
        ['duplicate name+index', pack.replace('  xy: 4, 0\n  size: 4, 4\n  index: 1', '  xy: 4, 0\n  size: 4, 4\n  index: 0'), 'AIR_E_ATLAS_DUPLICATE'],
        ['unknown region field', pack.replace('index: -1', 'ziggy: 1'), 'AIR_E_ATLAS_FORMAT'],
        ['unknown page field', pack.replace('repeat: none', 'wrap: mirror'), 'AIR_E_ATLAS_FORMAT'],
        ['bounds mixed with xy/size', packNew.replace('bounds: 0,0,8,8', 'bounds: 0,0,8,8\n  xy: 0, 0'), 'AIR_E_ATLAS_FORMAT'],
        ['offsets mixed with orig', packNew.replace('offsets: 2,1,16,16', 'offsets: 2,1,16,16\n  orig: 16, 16'), 'AIR_E_ATLAS_FORMAT'],
        ['page missing size surfaces at region close', pack.replace('size: 32,16', 'format: RGBA8888'), 'AIR_E_ATLAS_PAGE'],
        ['duplicate page field', pack.replace('repeat: none', 'filter: Linear,Linear'), 'AIR_E_ATLAS_FORMAT'],
        ['negative coordinate', pack.replace('xy: 0, 0', 'xy: -1, 0'), 'AIR_E_ATLAS_DATA'],
        ['empty input', '', 'AIR_E_ATLAS_FORMAT'],
    ])('%s rejects with a stable code', (name, malformed, code) => {
        expect(() => parseAtlasText(malformed)).toThrow(expect.objectContaining({ code }));
    });
});

describe('PG-01 native SpriteFrame factory and ownership', () => {
    let document: AirAtlasDocument;
    let textures: [Texture2D, Texture2D];
    beforeEach(() => {
        document = parseAtlasText(pack);
        textures = legacyTextures();
    });

    test('rect keeps logical size at region.xy (GPU-verified top-origin); rotated consumes the swapped footprint via native UV', () => {
        const handle = createAtlasHandle(document, textures);
        const plain = handle.getFrame('plain')!;
        expect(plain.rotated).toBe(false);
        expect(plain.rect).toMatchObject({ x: 0, y: 0, width: 8, height: 8 }); // rect.y = region.xy.y（GPU 实证顶原点直取）
        expect(plain.originalSize).toMatchObject({ width: 8, height: 8 });
        expect(plain.offset).toMatchObject({ x: 0, y: 0 });

        // 90 旋转：rect = 逻辑 4x12 @ xy(8,0)；原生 UV 垂直跨度 = rect.y+rect.width = 0..4（PNG 顶带）
        const hero = handle.getFrame('hero')!;
        expect(hero.rotated).toBe(true);
        expect(hero.rect).toMatchObject({ x: 8, y: 0, width: 4, height: 12 });
        const l = 8 / 32, r = 20 / 32, t = 0 / 16, b = 4 / 16;
        expect(hero.uv).toEqual([l, t, l, b, r, t, r, b]); // 原生 rotated UV 布局（无翻转），垂直 0..4 = PNG 顶带
        expect(hero.originalSize).toMatchObject({ width: 4, height: 12 });

        // trim：original 16x16、offset(left4,bottom2) → 中心偏移 (0,-2)
        const trimmed = handle.getFrame('trimmed')!;
        expect(trimmed.rect).toMatchObject({ x: 20, y: 0, width: 8, height: 8 });
        expect(trimmed.originalSize).toMatchObject({ width: 16, height: 16 });
        expect(trimmed.offset).toMatchObject({ x: 0, y: -2 });
        handle.dispose();
    });

    test('indexed animation frames are individually addressable, never merged', () => {
        const handle = createAtlasHandle(document, textures);
        expect(handle.getFrame('walk')).toBeUndefined(); // 无 -1 帧：必须显式 index
        const frames = handle.getFrames('walk');
        expect(frames).toHaveLength(3);
        expect(frames[0]!.rect.x).toBe(0);
        expect(frames[1]!.rect.x).toBe(4);
        expect(frames[2]!.rect.x).toBe(8);
        expect(handle.getFrame('walk', 1)).toBe(frames[1]);
        handle.dispose();
    });

    test('handle owns one texture ref and one frame ref; dispose is idempotent and refuses extra owners', () => {
        const [t0, t1] = textures;
        const handle = createAtlasHandle(document, textures);
        expect(t0.refCount).toBe(1);
        expect(t1.refCount).toBe(1);
        const plain = handle.getFrame('plain')!;
        expect(plain.refCount).toBe(1);
        plain.addRef(); // 消费者（Sprite 等）持有
        expect(() => handle.dispose()).toThrow(expect.objectContaining({ code: 'AIR_E_ATLAS_IN_USE' }));
        plain.decRef();
        handle.dispose();
        handle.dispose(); // 幂等
        expect(handle.disposed).toBe(true);
        expect(t0.refCount).toBe(0);
        expect(t1.refCount).toBe(0);
        expect(plain.refCount).toBe(0); // 帧引用归还，由 release manager 正常回收
    });

    test('page texture dimension mismatch fails without leaving half-built frames', () => {
        const bad: Texture2D[] = [pageTexture(64, 64), textures[1]];
        expect(() => createAtlasHandle(document, bad)).toThrow(expect.objectContaining({ code: 'AIR_E_ATLAS_PAGE_TEXTURE' }));
        expect(bad[0].refCount).toBe(0);
    });

    test('wrong page texture count fails', () => {
        expect(() => createAtlasHandle(document, [textures[0]]))
            .toThrow(expect.objectContaining({ code: 'AIR_E_ATLAS_PAGE_TEXTURE' }));
    });
});

describe('PG-01 loadAtlas over the shared AssetBank context', () => {
    let requests: Array<{ url: string; complete: (err: Error | null, asset?: unknown) => void }>;
    let spy: jest.SpyInstance;
    beforeEach(() => {
        requests = [];
        spy = jest.spyOn(assetManager, 'loadRemote').mockImplementation(((url: string, options?: unknown, onComplete?: (err: Error | null, data?: unknown) => void) => {
            const complete = (typeof options === 'function' ? options : onComplete)!;
            requests.push({ url, complete });
        }) as never);
    });
    afterEach(() => spy.mockRestore());

    function textAsset (): TextAsset {
        const asset = new TextAsset();
        asset.text = pack;
        return asset;
    }
    function imageAsset (width: number, height: number): ImageAsset {
        return new ImageAsset({ _data: null, width, height, format: 0, _compressed: false, mipmapLevelDataSize: [] } as never);
    }

    test('loads text then both relative pages, builds frames, releases subscriptions on dispose', async () => {
        const bank = new AssetBank();
        const pending = loadAtlas('https://cdn.test/atlas/pack.atlas', { bank });
        await Promise.resolve(); await Promise.resolve();
        expect(requests[0]!.url).toBe('https://cdn.test/atlas/pack.atlas');
        requests[0]!.complete(null, textAsset());
        await Promise.resolve(); await Promise.resolve();
        expect(requests[1]!.url).toBe('https://cdn.test/atlas/page-0.png'); // 相对页 URL 解析
        expect(requests[2]!.url).toBe('https://cdn.test/atlas/page-1.png');
        requests[1]!.complete(null, imageAsset(32, 16));
        requests[2]!.complete(null, imageAsset(16, 16));
        const handle = await pending;
        expect(handle.getFrame('hero')!.rotated).toBe(true);
        expect(handle.getFrames('walk')).toHaveLength(3);
        handle.dispose();
        expect(bank.size).toBe(0); // dispose 后 bank 订阅全部释放
        expect(bank.inFlightCount).toBe(0);
    });

    test('page load failure releases the completed text subscription and leaves no half handle', async () => {
        const bank = new AssetBank();
        const pending = loadAtlas('https://cdn.test/atlas/pack.atlas', { bank }).catch((error: AirAssetErrorLike) => error.code ?? 'AIR_E_LOAD_FAILED');
        await Promise.resolve(); await Promise.resolve();
        requests[0]!.complete(null, textAsset());
        await Promise.resolve(); await Promise.resolve();
        requests[1]!.complete(new Error('HTTP 500')); // 第 0 页失败
        requests[2]!.complete(null, imageAsset(16, 16)); // 底层不可取消：page-1 仍会完成
        expect(await pending).toBe('AIR_E_LOAD_FAILED'); // 全部页结算后统一失败，不留孤儿
        expect(bank.size).toBe(0);
        expect(bank.inFlightCount).toBe(0);
    });

    test('non-png page suffix and suffix-less page without pageExt are rejected with AIR_E_ATLAS_PAGE_FORMAT', async () => {
        const bank = new AssetBank();
        const webpText = pack.replace('page-0.png', 'page-0.webp');
        const pending = loadAtlas('https://cdn.test/atlas/pack.atlas', { bank }).catch((error: AirAssetErrorLike) => error.code);
        await Promise.resolve(); await Promise.resolve();
        const atlas = new TextAsset(); atlas.text = webpText;
        requests[0]!.complete(null, atlas);
        await Promise.resolve(); await Promise.resolve();
        requests[1]!.complete(null, imageAsset(16, 16)); // page-1（png）仍会被加载：补交付使 allSettled 收敛
        await Promise.resolve(); await Promise.resolve();
        expect(await pending).toBe('AIR_E_ATLAS_PAGE_FORMAT');
        expect(bank.size).toBe(0);
        // 无后缀页 + 显式 pageExt：通过
        const bank2 = new AssetBank();
        const noSuffixText = new TextAsset(); noSuffixText.text = pack.replace('page-0.png', 'page-0');
        const pending2 = loadAtlas('https://cdn.test/atlas/pack.atlas', { bank: bank2, pageExt: 'png' }).catch((error: AirAssetErrorLike) => error.code);
        await Promise.resolve(); await Promise.resolve();
        requests[2]!.complete(null, noSuffixText);
        await Promise.resolve(); await Promise.resolve();
        expect(requests[3]!.url).toBe('https://cdn.test/atlas/page-0');
        expect(requests[4]!.url).toBe('https://cdn.test/atlas/page-1.png');
        requests[3]!.complete(null, imageAsset(32, 16));
        requests[4]!.complete(null, imageAsset(16, 16));
        const handle = await pending2;
        expect(handle.getFrame('plain')).toBeInstanceOf(SpriteFrame);
        handle.dispose();
        expect(bank2.size).toBe(0);
    });

    test('mid-load abort rejects AIR_E_ABORTED and releases owned subscriptions', async () => {
        const bank = new AssetBank();
        const controller = new AbortController();
        const pending = loadAtlas('https://cdn.test/atlas/pack.atlas', { bank, signal: controller.signal })
            .catch((error: AirAssetErrorLike) => error.code);
        await Promise.resolve(); await Promise.resolve();
        requests[0]!.complete(null, textAsset());
        await Promise.resolve(); await Promise.resolve();
        controller.abort(); // 页订阅进行中取消（底层不可取消，请求仍会完成）
        await expect(pending).resolves.toBe('AIR_E_ABORTED');
        expect(bank.size).toBe(0); // 文本订阅已随回滚释放
        requests[1]!.complete(null, imageAsset(32, 16));
        requests[2]!.complete(null, imageAsset(16, 16));
        expect(bank.inFlightCount).toBe(0); // 迟到完成按无人接管出清
        expect(bank.size).toBe(0);
    });

    test('duplicate page URL: every bank subscription is recorded and returned on dispose', async () => {
        const bank = new AssetBank();
        // 两页指向同一 PNG URL：两个独立订阅都必须归还
        const text = pack.replace('page-1.png\nsize: 16,16', 'page-0.png\nsize: 32,16'); // 两页同 URL 同尺寸
        const pending = loadAtlas('https://cdn.test/atlas/dup.atlas', { bank });
        await Promise.resolve(); await Promise.resolve();
        const atlas = new TextAsset(); atlas.text = text;
        requests[0]!.complete(null, atlas);
        await Promise.resolve(); await Promise.resolve();
        expect(requests).toHaveLength(2); // text + page-0（同键在途合并：一次请求、两个订阅）
        const shared = imageAsset(32, 16);
        requests[1]!.complete(null, shared);
        const handle = await pending;
        expect(handle.textures).toHaveLength(2);
        expect(handle.textures[0]).not.toBe(handle.textures[1]); // 两个独立 Texture2D 共享同一资产
        expect(shared.refCount).toBe(1); // bank 每资产一份引擎引用
        expect(bank.refCount('https://cdn.test/atlas/page-0.png', 'png')).toBe(2);
        handle.dispose();
        expect(bank.size).toBe(0); // dispose 后每个订阅都归还（此前 Map 去重吞掉一次 → size=1）
        expect(shared.refCount).toBe(0);
    });

    test('explicit baseURL overrides atlas-relative resolution', async () => {
        const bank = new AssetBank();
        const pending = loadAtlas('https://cdn.test/atlas/pack.atlas', { bank, baseURL: 'https://assets.test/v2/' });
        await Promise.resolve(); await Promise.resolve();
        requests[0]!.complete(null, textAsset());
        await Promise.resolve(); await Promise.resolve();
        expect(requests[1]!.url).toBe('https://assets.test/v2/page-0.png');
        requests[1]!.complete(null, imageAsset(32, 16));
        requests[2]!.complete(null, imageAsset(16, 16));
        const handle = await pending;
        handle.dispose();
    });
});

interface AirAssetErrorLike {
    code?: string;
}
