import { assetManager } from '../../src/cocos/asset/asset-manager';
import { Asset } from '../../src/cocos/asset/assets/asset';
import JsonAsset from '../../src/cocos/asset/assets/json-asset';
import { TextAsset } from '../../src/cocos/asset/assets/text-asset';
import { AssetBank } from '../../src/air/assets/asset-bank';

describe('PG-32 AssetBank race boundaries (Lead review)', () => {
    test('native loadRemote cache hit does not transfer an external owner reference to the bank', async () => {
        const url = '/pg32-owned-native-cache.json';
        const asset = new JsonAsset(); asset.addRef();
        assetManager.assets.add(url, asset);
        const bank = new AssetBank();
        try {
            expect(await bank.load(url)).toBe(asset);
            expect(asset.refCount).toBe(2); // One external owner plus the bank's own reference.
            bank.releaseAll();
            expect(asset.refCount).toBe(1);
        } finally { bank.releaseAll(); assetManager.assets.remove(url); asset.decRef(false); }
    });

    test('cancelled native cache hit preserves the unrelated external owner', async () => {
        const url = '/pg32-cancelled-native-cache.json';
        const asset = new JsonAsset(); asset.addRef();
        assetManager.assets.add(url, asset);
        const bank = new AssetBank(), controller = new AbortController();
        try {
            const pending = bank.load(url, { signal: controller.signal }).catch((error) => error);
            controller.abort();
            expect(await pending).toMatchObject({ code: 'AIR_E_ABORTED' });
            await new Promise((resolve) => setTimeout(resolve, 20));
            expect(asset.refCount).toBe(1);
            expect(bank.size).toBe(0);
        } finally { bank.releaseAll(); assetManager.assets.remove(url); asset.decRef(false); }
    });

    test('cache-hit completion progress abort rejects and does not add a ghost subscription', async () => {
        const callbacks: Array<(error: Error | null, asset?: Asset) => void> = [];
        const spy = jest.spyOn(assetManager, 'loadRemote').mockImplementation(((url, options, callback) => {
            callbacks.push(typeof options === 'function' ? options : callback);
        }) as never);
        const bank = new AssetBank(), controller = new AbortController();
        try {
            const initial = bank.load('/pg32-cached-abort.json');
            callbacks[0](null, new Asset()); await initial;
            const cached = bank.load('/pg32-cached-abort.json', { signal: controller.signal,
                onProgress: () => controller.abort() }).catch((error) => error);
            expect(await cached).toMatchObject({ code: 'AIR_E_ABORTED' });
            expect(bank.refCount('/pg32-cached-abort.json')).toBe(1);
        } finally { bank.releaseAll(); spy.mockRestore(); }
    });

    test('cache-hit releaseAll from progress rejects rather than returning a revoked asset', async () => {
        const spy = jest.spyOn(assetManager, 'loadRemote').mockImplementation(((url, options, callback) => {
            (typeof options === 'function' ? options : callback)(null, new Asset());
        }) as never);
        const bank = new AssetBank();
        try {
            await bank.load('/pg32-cached-revoke.json');
            const cached = bank.load('/pg32-cached-revoke.json', { onProgress: () => bank.releaseAll() }).catch((error) => error);
            expect(await cached).toMatchObject({ code: 'AIR_E_REVOKED' });
            expect(bank.size).toBe(0);
        } finally { bank.releaseAll(); spy.mockRestore(); }
    });

    test('a revoked old request cannot remove a fresh in-flight request with the same key', async () => {
        const callbacks: Array<(error: Error | null, asset?: Asset) => void> = [];
        const spy = jest.spyOn(assetManager, 'loadRemote').mockImplementation(((url, options, callback) => {
            callbacks.push(typeof options === 'function' ? options : callback);
        }) as never);
        const bank = new AssetBank();
        try {
            const old = bank.load('/pg32-race.json').catch((error) => error);
            bank.releaseAll(); await old;
            const fresh = bank.load('/pg32-race.json');
            callbacks[0](null, new Asset());
            const pendingAfterOld = bank.inFlightCount;
            callbacks[1](null, new Asset()); await fresh;
            expect(pendingAfterOld).toBe(1);
        } finally { bank.releaseAll(); spy.mockRestore(); }
    });

    test('releaseAll from completion progress cannot leave a revoked ghost owner', async () => {
        let complete: (error: Error | null, asset?: Asset) => void;
        const spy = jest.spyOn(assetManager, 'loadRemote').mockImplementation(((url, callback) => { complete = callback; }) as never);
        const bank = new AssetBank();
        try {
            const loaded = bank.load('/pg32-progress.json', (current) => { if (current === 1) bank.releaseAll(); });
            const outcome = loaded.then(() => 'resolved', (error) => error.code);
            complete!(null, new Asset());
            expect(await outcome).toBe('AIR_E_REVOKED');
            expect(bank.size).toBe(0);
        } finally { bank.releaseAll(); spy.mockRestore(); }
    });

    test('cancelling inside completion progress does not adopt that subscriber', async () => {
        let complete: (error: Error | null, asset?: Asset) => void;
        const spy = jest.spyOn(assetManager, 'loadRemote').mockImplementation(((url, callback) => { complete = callback; }) as never);
        const bank = new AssetBank(), controller = new AbortController();
        try {
            const loaded = bank.load('/pg32-abort.json', { signal: controller.signal,
                onProgress: (current) => { if (current === 1) controller.abort(); } });
            const outcome = loaded.then(() => 'resolved', (error) => error.code);
            complete!(null, new Asset());
            expect(await outcome).toBe('AIR_E_ABORTED');
            expect(bank.size).toBe(0);
        } finally { bank.releaseAll(); spy.mockRestore(); }
    });

    test('explicit ext honors the native parser even when the URL already caches a different asset type', async () => {
        const url = '/pg32-native-cache-conflict', cached = new JsonAsset(); cached.addRef();
        assetManager.assets.add(url, cached);
        // Only transfer is controlled. Real loadRemote and native factory/cache execute.
        const transfer = jest.spyOn(assetManager, 'loadAny').mockImplementation(((request, options, progress, complete) => {
            complete(null, 'actual text');
        }) as never);
        const bank = new AssetBank();
        try {
            const result = await bank.load(url, { ext: 'txt' });
            expect(result).toBeInstanceOf(TextAsset);
            expect((result as TextAsset).text).toBe('actual text');
            expect(cached.refCount).toBe(1);
        } finally {
            bank.releaseAll(); transfer.mockRestore(); assetManager.assets.remove(url); cached.decRef();
        }
    });
});
