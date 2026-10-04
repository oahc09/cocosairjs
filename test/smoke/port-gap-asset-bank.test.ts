// PG-06/PG-32 AssetBank 加载/所有权回归：受控 loadRemote 边界 + 真实 Asset 引擎实例。
// 交接事实：真实 loadRemote 交付给回调的资产零引用（缓存早退与 factory 分支均不 addRef
// 给调用方）。受控的是引擎边界（手工结算的 loadRemote 桩，保持"底层不可取消"的真实语义）；
// bank 本体与 Asset 的 addRef/decRef/refCount/releaseManager 全部是真实引擎代码。
import { assetManager } from '../../src/cocos/asset/asset-manager';
import { Asset } from '../../src/cocos/asset/assets/asset';
import { AssetBank, AirAssetError } from '../../src/air/assets/asset-bank';

interface PendingRequest {
    url: string;
    options?: { ext?: string; reloadAsset?: boolean }; // 传给引擎的完整选项
    complete: (err: Error | null, asset?: Asset) => void;
}

function makeAsset (): Asset {
    return new Asset();
}

describe('PG-06/PG-32 AssetBank loading and ownership (controlled loadRemote, real Asset)', () => {
    let requests: PendingRequest[];
    let loadRemoteSpy: jest.SpyInstance;

    beforeEach(() => {
        requests = [];
        loadRemoteSpy = jest.spyOn(assetManager, 'loadRemote').mockImplementation(((url: string, options?: { ext?: string; reloadAsset?: boolean } | ((err: Error | null, data?: Asset) => void), onComplete?: (err: Error | null, data?: Asset) => void) => {
            const opts = options && typeof options === 'object' ? options : undefined;
            const complete = (typeof options === 'function' ? options : onComplete)!;
            requests.push({ url, options: opts, complete });
        }) as never);
    });

    afterEach(() => {
        loadRemoteSpy.mockRestore();
    });

    test('compat signature preserved: suffix URL uses native inference, two-phase progress, dedup + release semantics', async () => {
        const bank = new AssetBank();
        const phases: Array<[number, number]> = [];
        const p1 = bank.load('/assets/tone.wav', (c, t) => phases.push([c, t]));
        const p2 = bank.load('/assets/tone.wav');
        expect(requests).toHaveLength(1); // 并发去重
        expect(requests[0]!.options).toBeUndefined(); // 带后缀 URL 原生推断：无选项（可用引擎缓存）
        requests[0]!.complete(null, makeAsset());
        const [a1, a2] = await Promise.all([p1, p2]);
        expect(a1).toBe(a2); // 同一资产实例
        expect(phases).toEqual([[0, 1], [1, 1]]); // 两阶如实进度
        expect(bank.size).toBe(1);
        expect(bank.refCount('/assets/tone.wav')).toBe(2);
        expect(bank.release('/assets/tone.wav')).toBe(false); // 共享时释放只减订阅
        expect(bank.release('/assets/tone.wav')).toBe(true); // 归零才归还引擎引用
        expect(bank.size).toBe(0);
    });

    test('suffix-less URL without ext is rejected with AIR_E_EXT_REQUIRED and starts no request', async () => {
        const bank = new AssetBank();
        expect(() => bank.load('https://cdn.example.com/data')).toThrow(expect.objectContaining({ code: 'AIR_E_EXT_REQUIRED' }));
        expect(() => bank.load('https://cdn.example.com/data?token=1')).toThrow(expect.objectContaining({ code: 'AIR_E_EXT_REQUIRED' }));
        expect(requests).toHaveLength(0);
        const p = bank.load('https://cdn.example.com/data.bin?token=1'); // 带后缀+query 放行
        expect(requests).toHaveLength(1);
        requests[0]!.complete(null, makeAsset());
        await p;
    });

    test('ext shape validation rejects malformed values with AIR_E_INVALID_EXT', () => {
        const bank = new AssetBank();
        for (const bad of ['', 'png!', '.png', 'png png', 'a'.repeat(17)]) {
            expect(() => bank.load('https://cdn.example.com/data', { ext: bad }))
                .toThrow(expect.objectContaining({ code: 'AIR_E_INVALID_EXT' }));
        }
        expect(requests).toHaveLength(0);
    });

    test('explicit ext: reloadAsset option bypasses the URL strong-cache; key and engine param both normalized lowercase', async () => {
        const bank = new AssetBank();
        const jsonP = bank.load('https://cdn.example.com/raw', { ext: 'JSON' });
        expect(requests).toHaveLength(1);
        expect(requests[0]!.options).toEqual({ ext: '.json', reloadAsset: true }); // 小写+带点+绕过强缓存
        requests[0]!.complete(null, makeAsset());
        await jsonP;
        expect(bank.refCount('https://cdn.example.com/raw', 'json')).toBe(1);
    });

    test('explicit ext participates in the key: different ext loads independently, same ext merges', async () => {
        const bank = new AssetBank();
        const url = 'https://cdn.example.com/blob.json'; // 后缀与预期类型不符：显式 ext 用于消歧
        const pngP = bank.load(url, { ext: 'png' }); // 显式覆盖后缀：独立键
        const plainP = bank.load(url); // 原生推断：独立键，不与显式 ext 静默合并
        const json1 = bank.load('https://cdn.example.com/raw', { ext: 'json' });
        const json2 = bank.load('https://cdn.example.com/raw', { ext: 'JSON' }); // 规范化小写后与 json1 合并
        expect(requests).toHaveLength(3); // png / plain / json 三路独立
        requests[0]!.complete(null, makeAsset());
        requests[1]!.complete(null, makeAsset());
        requests[2]!.complete(null, makeAsset());
        expect(await pngP).toBeInstanceOf(Asset);
        expect(await plainP).toBeInstanceOf(Asset);
        const j1 = await json1;
        expect(await json2).toBe(j1); // 同 ext 合并共享
        expect(bank.size).toBe(3);
        expect(bank.refCount(url)).toBe(1); // 原生推断键
        expect(bank.refCount(url, 'png')).toBe(1); // 显式 ext 键相互独立
        expect(bank.refCount('https://cdn.example.com/raw', 'json')).toBe(2); // JSON/JSON 规范化合并
    });

    test('cache hit with an already-aborted signal rejects AIR_E_ABORTED (cancelled subscriber, not served)', async () => {
        const bank = new AssetBank();
        const first = bank.load('/a.png');
        requests[0]!.complete(null, makeAsset());
        await first;
        const controller = new AbortController();
        controller.abort();
        await expect(bank.load('/a.png', { signal: controller.signal }))
            .rejects.toMatchObject({ code: 'AIR_E_ABORTED' });
        expect(bank.refCount('/a.png')).toBe(1); // 被拒订阅不计数
    });

    test('same-tick abort on a cache hit rolls back exactly this subscription (deferred delivery aligns with native asyncify)', async () => {
        const bank = new AssetBank();
        const first = bank.load('/tick.png');
        requests[0]!.complete(null, makeAsset());
        await first;
        expect(bank.refCount('/tick.png')).toBe(1);
        const controller = new AbortController();
        const pending = bank.load('/tick.png', { signal: controller.signal }).catch((error: AirAssetError) => error.code);
        controller.abort(); // 同 tick：交付尚未发生（微任务异步化）
        expect(await pending).toBe('AIR_E_ABORTED');
        expect(bank.refCount('/tick.png')).toBe(1); // 精确回退本次订阅，不影响原订阅
        expect(bank.size).toBe(1);
    });

    test('one subscriber aborts mid-flight: its subscription cancels, the shared load and peer are unaffected', async () => {
        const bank = new AssetBank();
        const controller = new AbortController();
        const aborter = bank.load('/shared.png', { signal: controller.signal });
        const peer = bank.load('/shared.png');
        expect(requests).toHaveLength(1); // 同键在途共享
        controller.abort();
        await expect(aborter).rejects.toMatchObject({ code: 'AIR_E_ABORTED' });
        const asset = makeAsset();
        requests[0]!.complete(null, asset); // 底层不可取消：仍完成（交付零引用资产）
        const resolved = await peer;
        expect(resolved).toBe(asset);
        expect(bank.refCount('/shared.png')).toBe(1); // 只剩未取消订阅者
        expect(bank.size).toBe(1);
        expect(asset.refCount).toBe(1); // bank 自持的唯一引擎引用
    });

    test('all subscribers cancel: late completion is adopted by nobody (paired addRef/decRef keeps refCount at zero)', async () => {
        const bank = new AssetBank();
        const controllerA = new AbortController();
        const controllerB = new AbortController();
        const pa = bank.load('/orphan.png', { signal: controllerA.signal });
        const pb = bank.load('/orphan.png', { signal: controllerB.signal });
        controllerA.abort();
        controllerB.abort();
        await expect(pa).rejects.toMatchObject({ code: 'AIR_E_ABORTED' });
        await expect(pb).rejects.toMatchObject({ code: 'AIR_E_ABORTED' });
        const asset = makeAsset();
        requests[0]!.complete(null, asset); // 迟到完成
        expect(bank.size).toBe(0);
        expect(bank.inFlightCount).toBe(0);
        expect(asset.refCount).toBe(0); // 成对 addRef→decRef：净 0，正常触发 tryRelease
    });

    test('late unadopted completion preserves an unrelated external owner (no phantom decRef)', async () => {
        const bank = new AssetBank();
        const controller = new AbortController();
        const pending = bank.load('/external.png', { signal: controller.signal });
        controller.abort();
        await expect(pending).rejects.toMatchObject({ code: 'AIR_E_ABORTED' });
        const asset = makeAsset();
        asset.addRef(); // 外部 owner（如另一 bank / 引擎强缓存持有者）
        requests[0]!.complete(null, asset); // 迟到完成
        expect(asset.refCount).toBe(1); // 外部 owner 不被无来源 decRef 侵害
        expect(bank.size).toBe(0);
        asset.decRef();
    });

    test('releaseAll during in-flight revokes waiters (AIR_E_REVOKED); late result not adopted; next load is a fresh request', async () => {
        const bank = new AssetBank();
        const pending = bank.load('/session.png');
        expect(requests).toHaveLength(1);
        const revoked = expect(pending).rejects.toMatchObject({ code: 'AIR_E_REVOKED' }); // 先挂断言：撤销同步拒绝
        await bank.releaseAll();
        await revoked;
        expect(bank.inFlightCount).toBe(0);
        requests[0]!.complete(null, makeAsset()); // 被撤销请求的迟到完成
        expect(bank.size).toBe(0);
        const fresh = bank.load('/session.png'); // 新加载：全新请求
        expect(requests).toHaveLength(2);
        const asset = makeAsset();
        requests[1]!.complete(null, asset);
        expect(await fresh).toBe(asset);
        expect(bank.refCount('/session.png')).toBe(1);
    });

    test('a revoked old callback cannot remove a fresh same-key in-flight record (identity-guarded delete)', async () => {
        const bank = new AssetBank();
        const old = bank.load('/race.png');
        const revokedOld = expect(old).rejects.toMatchObject({ code: 'AIR_E_REVOKED' });
        await bank.releaseAll();
        await revokedOld;
        const fresh = bank.load('/race.png');
        expect(requests).toHaveLength(2);
        requests[0]!.complete(null, makeAsset()); // 旧回调迟到：不得删除新记录
        expect(bank.inFlightCount).toBe(1);
        const asset = makeAsset();
        requests[1]!.complete(null, asset);
        expect(await fresh).toBe(asset);
        expect(bank.refCount('/race.png')).toBe(1);
    });

    test('releaseAll inside completion progress revokes that subscription; no ghost entry is stored', async () => {
        const bank = new AssetBank();
        const loaded = bank.load('/ghost.png', { onProgress: (current) => { if (current === 1) bank.releaseAll(); } });
        const outcome = loaded.then(() => 'resolved' as const, (error: AirAssetError) => error.code);
        requests[0]!.complete(null, makeAsset());
        expect(await outcome).toBe('AIR_E_REVOKED');
        expect(bank.size).toBe(0);
        expect(bank.inFlightCount).toBe(0);
    });

    test('aborting inside completion progress cancels that subscriber instead of resolving it', async () => {
        const bank = new AssetBank();
        const controller = new AbortController();
        const loaded = bank.load('/abort-in-progress.png', {
            signal: controller.signal,
            onProgress: (current) => { if (current === 1) controller.abort(); },
        });
        const outcome = loaded.then(() => 'resolved' as const, (error: AirAssetError) => error.code);
        requests[0]!.complete(null, makeAsset());
        expect(await outcome).toBe('AIR_E_ABORTED');
        expect(bank.size).toBe(0); // 被取消订阅不计入入库
    });

    test('releaseAll releases all cached entries and returns the count (idempotent)', async () => {
        const bank = new AssetBank();
        const p1 = bank.load('/x.png');
        const p2 = bank.load('/y.json', { ext: 'json' });
        requests[0]!.complete(null, makeAsset());
        requests[1]!.complete(null, makeAsset());
        await Promise.all([p1, p2]);
        expect(bank.size).toBe(2);
        expect(bank.releaseAll()).toBe(2);
        expect(bank.size).toBe(0);
        expect(bank.releaseAll()).toBe(0); // 幂等
    });

    test('load failure rejects all waiters with AIR_E_LOAD_FAILED; retry after failure starts a fresh request', async () => {
        const bank = new AssetBank();
        const first = bank.load('/broken.png');
        const second = bank.load('/broken.png'); // 共享同一失败
        requests[0]!.complete(new Error('HTTP 404'));
        await expect(first).rejects.toMatchObject({ code: 'AIR_E_LOAD_FAILED' });
        await expect(second).rejects.toMatchObject({ code: 'AIR_E_LOAD_FAILED' });
        expect(bank.inFlightCount).toBe(0); // 失败不留悬挂条目
        expect(bank.size).toBe(0);
        const retry = bank.load('/broken.png'); // 失败后重试：新请求，无中毒缓存
        expect(requests).toHaveLength(2);
        requests[1]!.complete(null, makeAsset());
        await retry;
        expect(bank.refCount('/broken.png')).toBe(1);
    });

    test('subscriber progress callback throwing rejects only that subscription; peer and bank stay consistent', async () => {
        const bank = new AssetBank();
        const boom = (): void => { throw new Error('subscriber bug'); };
        const thrower = bank.load('/two.png', { onProgress: boom });
        const peer = bank.load('/two.png');
        const asset = makeAsset();
        requests[0]!.complete(null, asset);
        await expect(thrower).rejects.toMatchObject({ code: 'AIR_E_PROGRESS_ERROR' });
        const resolved = await peer;
        expect(bank.refCount('/two.png')).toBe(1); // 抛错者不计入订阅
        expect(resolved).toBe(asset);
        expect(asset.refCount).toBe(1); // bank 自持一份
        const earlyThrower = bank.load('/two.png', { onProgress: boom }); // (0,1) 阶段抛错：仅该订阅立即失败
        await expect(earlyThrower).rejects.toMatchObject({ code: 'AIR_E_PROGRESS_ERROR' });
        expect(bank.refCount('/two.png')).toBe(1);
    });

    test('cache-hit deferred delivery: release inside progress keeps the subscription; releaseAll inside revokes it', async () => {
        const bank = new AssetBank();
        const first = bank.load('/reentry.png');
        requests[0]!.complete(null, makeAsset());
        await first;
        const second = bank.load('/reentry.png', {
            onProgress: () => bank.release('/reentry.png'), // 缓存命中进度内 release：仅退本订阅
        });
        await second;
        expect(bank.size).toBe(1);
        expect(bank.refCount('/reentry.png')).toBe(1);
        const third = bank.load('/reentry.png', {
            onProgress: () => bank.releaseAll(), // 缓存命中进度内 releaseAll：条目被摘除 → 订阅被撤销
        });
        await expect(third).rejects.toMatchObject({ code: 'AIR_E_REVOKED' });
        expect(bank.size).toBe(0);
        expect(bank.refCount('/reentry.png')).toBe(0);
    });

    test('synchronous loadRemote callback settles normally (no forever-pending promise)', async () => {
        const bank = new AssetBank();
        const syncSpy = jest.spyOn(assetManager, 'loadRemote').mockImplementation(((url: string, options?: unknown, onComplete?: (err: Error | null, data?: Asset) => void) => {
            const complete = (typeof options === 'function' ? options : onComplete)!;
            complete(null, makeAsset()); // 引擎缓存早退等同步结算路径
        }) as never);
        try {
            const pending = bank.load('/sync.png');
            const asset = await pending; // 若 join 晚于同步结算将永远 pending
            expect(asset).toBeInstanceOf(Asset);
            expect(bank.refCount('/sync.png')).toBe(1);
            expect(asset.refCount).toBe(1); // bank 自持一份（交付零引用，无成对抵消）
        } finally {
            syncSpy.mockRestore();
        }
    });

    test('synchronous loadRemote throw rejects with AIR_E_LOAD_FAILED instead of pending', async () => {
        const bank = new AssetBank();
        const syncSpy = jest.spyOn(assetManager, 'loadRemote').mockImplementation((() => {
            throw new Error('bad argument');
        }) as never);
        try {
            await expect(bank.load('/sync-throw.png')).rejects.toMatchObject({ code: 'AIR_E_LOAD_FAILED' });
            expect(bank.inFlightCount).toBe(0);
        } finally {
            syncSpy.mockRestore();
        }
    });

    test('bank holds exactly one engine addRef regardless of subscriber count; decRef only when the last subscription leaves', async () => {
        const bank = new AssetBank();
        const waits = [bank.load('/multi.png'), bank.load('/multi.png'), bank.load('/multi.png')];
        expect(requests).toHaveLength(1);
        const asset = makeAsset(); // 交付零引用（真实 factory/缓存分支不 addRef 给调用方）
        requests[0]!.complete(null, asset);
        await Promise.all(waits);
        expect(asset.refCount).toBe(1); // bank 每资产一份引擎引用
        expect(bank.refCount('/multi.png')).toBe(3); // 订阅计数与引擎 ref 分开
        expect(bank.release('/multi.png')).toBe(false);
        expect(bank.release('/multi.png')).toBe(false);
        expect(asset.refCount).toBe(1); // 仍有订阅者时不动引擎引用
        expect(bank.release('/multi.png')).toBe(true);
        expect(asset.refCount).toBe(0); // 归零才归还（正常 decRef 释放路径）
    });

    test('adopting an asset with an existing external owner: bank adds its own reference and release keeps the owner', async () => {
        const bank = new AssetBank();
        const asset = makeAsset();
        asset.addRef(); // 外部 owner（如引擎强缓存/另一持有者）
        const pending = bank.load('/owned.png');
        requests[0]!.complete(null, asset);
        await pending;
        expect(asset.refCount).toBe(2); // 外部 owner + bank 自持
        expect(bank.release('/owned.png')).toBe(true);
        expect(asset.refCount).toBe(1); // 外部 owner 完好（bank 只归还自己的）
        asset.decRef();
    });

    test('cross-bank shared asset: each bank holds its own reference; releasing one never touches the other', async () => {
        const bankA = new AssetBank();
        const bankB = new AssetBank();
        const asset = makeAsset();
        const pa = bankA.load('/cross.png');
        const pb = bankB.load('/cross.png');
        requests[0]!.complete(null, asset); // 两个 bank 各自结算同一底层资产
        requests[1]!.complete(null, asset);
        const [a, b] = await Promise.all([pa, pb]);
        expect(a).toBe(b);
        expect(asset.refCount).toBe(2); // 两份独立 bank 引用
        expect(bankA.release('/cross.png')).toBe(true);
        expect(asset.refCount).toBe(1); // bank B 的引用不受影响
        expect(bankB.release('/cross.png')).toBe(true);
        expect(asset.refCount).toBe(0);
    });

    test('honest capability flag: underlying loadRemote is not network-cancellable', () => {
        expect(AssetBank.underlyingCancelSupported).toBe(false);
    });
});
