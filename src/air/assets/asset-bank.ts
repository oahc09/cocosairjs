/**
 * Cocos Air — AssetBank 原始远程加载与所有权（PG-06/PG-32，port-gap-remediation）。
 *
 * 把业务自包装的 loadRemote 路径（如端口工程 tiled.ts 的 loadRemoteAsset 绕行）收编为
 * 官方答案：Promise + 并发去重 + ext 推断/显式声明 + 订阅者取消 + 迟到结果不接管。
 *
 * 所有权与解析合同（docs/reference/port-gap-contracts.md「资产加载与所有权」）：
 *  - load(url, onProgress?) 兼容保留；增量选项 { ext?, signal?, onProgress? }。带后缀 URL
 *    走原生推断；无后缀 URL 必须显式 ext（首批不做 magic-byte 猜测）；泛型 T 只是调用方
 *    断言，不参与解析；
 *  - 显式 ext 参与规范化键（小写），且以 `reloadAsset: true` 传给 loadRemote：原生
 *    loadRemote 按 URL 强缓存并在命中时早退（不看 ext），显式 ext 必须绕过该早退才能
 *    "解析真实符合 ext"；无显式 ext 的加载保持原生缓存路径（同后缀同类型）；
 *  - signal 是订阅者取消：取消一个订阅不影响其他共享者；底层 loadRemote 不可取消
 *    （underlyingCancelSupported = false，如实声明，无假 HTTP abort）；
 *  - 交接事实：真实 loadRemote 交付给回调的资产零引用（缓存早退与 factory 新建/缓存
 *    分支均不 addRef 给调用方）。bank 采用时只自持一份 addRef；正常释放只 decRef 自己的；
 *    无人接管的迟到结果以成对 addRef→decRef 触发正常 tryRelease（净 0；外部 owner 的
 *    引用因 refCount>0 被 _free 跳过，不侵害、不 force）；
 *  - 缓存命中交付与原生 asyncify 对齐经微任务异步化：同 tick 内的 abort/release/
 *    releaseAll 先于交付生效，精确回退本次订阅、不影响其他者；
 *  - 每个 bank 对每个入库资产只有一份引擎 addRef；条目 refs 是订阅计数，与引擎 ref 分开；
 *  - releaseAll/会话结束撤销在途等待者（AIR_E_REVOKED）并释放全部入库条目；被撤销请求的
 *    迟到回调不得触碰撤销后同键新建的在途记录（身份守卫删除）；撤销后新加载是全新请求；
 *  - 发起者先入队在途记录、后触发 loadRemote：同步回调/同步 throw 都不可能让任何
 *    等待者的 Promise 永远 pending。
 */

import { assetManager } from '../../cocos/asset/asset-manager';
import { Asset } from '../../cocos/asset/assets/asset';

/** @en Progress callback shape (two-phase honest reporting, see manual). @zh 进度回调（两阶如实报告，见手册）。 */
export type AssetProgressFn = (current: number, total: number) => void;

/** @en Incremental load options (PG-06). @zh 增量加载选项（PG-06）。 */
export interface AssetBankLoadOptions {
    /**
     * @en Explicit extension for suffix-less URLs (required there) or to disambiguate a URL
     * whose suffix does not describe the intended type. Letters/digits only, ≤16 chars.
     * Passed to loadRemote lower-cased with a leading dot and with `reloadAsset: true`,
     * so the native parser truly honors it instead of the URL-keyed cache.
     * @zh 显式扩展名：无后缀 URL 必填；或用于区分后缀与预期类型不符的 URL。仅字母数字，≤16 字符。
     * 传给 loadRemote 时小写、带前导点，并附 `reloadAsset: true` 绕过按 URL 的强缓存早退，
     * 保证原生解析器真实按 ext 解析。
     */
    readonly ext?: string;
    /**
     * @en Subscriber-side cancellation. Aborts only this subscription; the underlying
     * request is NOT network-cancelled (loadRemote has no cancellation), so a fully
     * abandoned request still completes. Native callbacks carry no ownership reference;
     * an addRef/decRef pair requests normal release without reducing external owners.
     * @zh 订阅者取消：只取消本订阅；底层请求不做网络级取消（loadRemote 无取消通道），
     * 全部订阅者取消后请求仍会完成，完成时 bank 成对 addRef→decRef 触发正常 tryRelease（净 0）。
     */
    readonly signal?: AbortSignal;
    /** @en Progress callback. Throws inside it reject only this subscription (AIR_E_PROGRESS_ERROR). @zh 进度回调；内部抛错只拒绝本订阅（AIR_E_PROGRESS_ERROR）。 */
    readonly onProgress?: AssetProgressFn;
}

/** @en Stable error codes of the asset-loading surface. @zh 资产加载面的稳定错误码。 */
export type AirAssetErrorCode =
    | 'AIR_E_EXT_REQUIRED' // 无后缀 URL 未提供显式 ext
    | 'AIR_E_INVALID_EXT' // ext 形状不合法
    | 'AIR_E_ABORTED' // 本订阅者通过 signal 取消
    | 'AIR_E_REVOKED' // releaseAll/会话结束撤销在途订阅
    | 'AIR_E_LOAD_FAILED' // 底层加载失败（cause 保留在 message）
    | 'AIR_E_PROGRESS_ERROR'; // 订阅者自己的 onProgress 抛错

/** @en Error with a stable machine-readable code; original failure kept in `cause`. @zh 带稳定错误码的资产错误；原始失败保留在 cause。 */
export class AirAssetError extends Error {
    constructor (public readonly code: AirAssetErrorCode, message: string, public readonly cause?: unknown) {
        super(message);
        this.name = 'AirAssetError';
    }
}

const EXT_PATTERN = /^[a-zA-Z0-9]{1,16}$/;

/** @en Normalize the in-flight/cache key: explicit ext participates so conflicting types never merge. @zh 规范化键：显式 ext 参与键，冲突类型绝不合并。 */
function cacheKey (url: string, ext: string | undefined): string {
    return ext ? `${url}|ext=${ext.toLowerCase()}` : url;
}

/** @en URL has a path suffix usable by native inference (query/hash stripped). @zh URL 路径带原生推断可用的后缀（剥掉 query/hash）。 */
function hasUrlSuffix (url: string): boolean {
    const path = url.split(/[?#]/, 1)[0]!;
    const segment = path.substring(path.lastIndexOf('/') + 1);
    const dot = segment.lastIndexOf('.');
    return dot > 0 && dot < segment.length - 1;
}

function assertValidExt (ext: string | undefined): void {
    if (ext !== undefined && !EXT_PATTERN.test(ext)) {
        throw new AirAssetError('AIR_E_INVALID_EXT', `[AssetBank] ext must match ${EXT_PATTERN.source}, got "${ext}"`);
    }
}

function assertSuffixRule (url: string, ext: string | undefined): void {
    if (!ext && !hasUrlSuffix(url)) {
        throw new AirAssetError('AIR_E_EXT_REQUIRED', `[AssetBank] suffix-less URL requires an explicit ext: ${url}`);
    }
}

function normalizeOptions (optionsOrProgress?: AssetBankLoadOptions | AssetProgressFn): AssetBankLoadOptions {
    if (typeof optionsOrProgress === 'function') {
        return { onProgress: optionsOrProgress };
    }
    return optionsOrProgress ?? {};
}

interface Waiter {
    resolve (asset: Asset): void;
    reject (error: AirAssetError): void;
    onProgress?: AssetProgressFn;
    signal?: AbortSignal;
    onAbort: () => void;
}

interface InFlight {
    readonly key: string;
    readonly url: string;
    /** 规范化小写的裸 ext（键与传参一致；传参时加前导点）。 */
    readonly ext?: string;
    readonly waiters: Set<Waiter>;
    revoked: boolean;
    settled: boolean;
}

interface BankEntry {
    asset: Asset;
    /** 订阅计数（非引擎 ref）。 */
    refs: number;
}

/**
 * @en Reference-counted raw-remote asset bank (Promise API over `assetManager.loadRemote`).
 * @zh 基于 assetManager.loadRemote 的引用计数原始远程资产库（Promise API）：
 * - 并发去重：同键在途请求只发一次，等待者共享底层操作、各自持独立 Promise；
 * - ext：带后缀 URL 原生推断（可用引擎 URL 缓存）；无后缀 URL 必须显式 ext；显式 ext
 *   以 reloadAsset 绕过按 URL 的强缓存，保证解析真实符合 ext；显式 ext 参与键，不同 ext
 *   独立加载；
 * - 取消：signal 只取消订阅者；底层不可取消（见 [[AssetBank.underlyingCancelSupported]]），
 *   全员取消/无人持有后完成的结果按成对 addRef→decRef 触发正常 tryRelease（净 0，不侵害外部 owner）；
 * - 进度：loadRemote 无任务级进度，如实两阶报告（订阅时 0/1，完成时 1/1），不伪造细粒度。
 */
export class AssetBank {
    /** @en Honest capability flag: the underlying loadRemote cannot be network-cancelled. @zh 如实能力声明：底层 loadRemote 不支持网络级取消。 */
    static readonly underlyingCancelSupported = false;

    private _entries = new Map<string, BankEntry>();
    private _inFlight = new Map<string, InFlight>();

    /** 当前在库条目数（测试观测面）。 */
    get size (): number { return this._entries.size; }

    /** 在途请求数（测试观测面）。 */
    get inFlightCount (): number { return this._inFlight.size; }

    /** @en Subscriber refcount of a cached entry (0 when absent; ext participates in the key). @zh 入库条目的订阅计数（不存在为 0；ext 参与键）。 */
    refCount (url: string, ext?: string): number {
        assertValidExt(ext);
        return this._entries.get(cacheKey(url, ext))?.refs ?? 0;
    }

    /**
     * @en Load (or join the in-flight load of) an asset by URL.
     * Legacy signature `load(url, onProgress?)` is preserved; the incremental signature is
     * `load(url, { ext?, signal?, onProgress? })`. The generic parameter is the caller's
     * assertion — the bank never guesses a type from it.
     * @zh 按 URL 加载（或在途合并）资产。兼容签名 load(url, onProgress?) 保留；增量签名为
     * load(url, { ext?, signal?, onProgress? })。泛型参数只是调用方断言，bank 不据此猜类型。
     */
    load<T extends Asset = Asset> (url: string, optionsOrProgress?: AssetBankLoadOptions | AssetProgressFn): Promise<T> {
        const options = normalizeOptions(optionsOrProgress);
        const ext = options.ext?.toLowerCase(); // 键与传参统一小写
        const { signal, onProgress } = options;
        assertValidExt(ext);
        assertSuffixRule(url, ext);
        const key = cacheKey(url, ext);

        // 已取消的订阅者即使缓存命中也拒绝（订阅在请求前已被订阅者撤销）。
        if (signal?.aborted) {
            return Promise.reject(new AirAssetError('AIR_E_ABORTED', `[AssetBank] subscription aborted before load: ${key}`));
        }

        const cached = this._entries.get(key);
        if (cached) {
            // 缓存命中：与原生 asyncify 对齐，微任务内交付（同 tick 的 abort/release/releaseAll
            // 能先于交付生效，精确回退本次订阅、不影响其他者）。
            cached.refs += 1;
            return new Promise<T>((resolve, reject) => {
                let settled = false; // 只结算一次：onAbort 与微任务检查互斥，防双重回退
                const undoSubscription = (): void => {
                    // 只回退本次订阅；重入 release/releaseAll 已把条目摘除时不再重复回退。
                    if (this._entries.get(key) === cached) {
                        cached.refs -= 1;
                        if (cached.refs <= 0) {
                            this._entries.delete(key);
                            cached.asset.decRef();
                        }
                    }
                };
                const onAbort = (): void => {
                    if (settled) { return; }
                    settled = true;
                    undoSubscription();
                    reject(new AirAssetError('AIR_E_ABORTED', `[AssetBank] cached subscription aborted: ${key}`));
                };
                if (signal) {
                    signal.addEventListener('abort', onAbort, { once: true });
                }
                Promise.resolve().then(() => {
                    if (settled) { return; } // 微任务前已自取消：onAbort 已回退并拒绝
                    settled = true;
                    if (signal) { signal.removeEventListener('abort', onAbort); }
                    try {
                        onProgress?.(1, 1);
                    } catch (cause) {
                        undoSubscription();
                        reject(new AirAssetError('AIR_E_PROGRESS_ERROR', `[AssetBank] onProgress threw: ${key}`, cause));
                        return;
                    }
                    if (signal?.aborted) { // 回调内自取消
                        undoSubscription();
                        reject(new AirAssetError('AIR_E_ABORTED', `[AssetBank] cached subscription aborted: ${key}`));
                        return;
                    }
                    if (this._entries.get(key) !== cached) { // 回调内 release/releaseAll 撤销了条目
                        reject(new AirAssetError('AIR_E_REVOKED', `[AssetBank] cached subscription revoked: ${key}`));
                        return;
                    }
                    resolve(cached.asset as T);
                });
            });
        }

        const existing = this._inFlight.get(key);
        const created = !existing || existing.revoked || existing.settled; // 结算窗口内的重入同键加载：另起新记录
        const record: InFlight = created
            ? { key, url, ext, waiters: new Set(), revoked: false, settled: false }
            : existing;
        if (created) {
            this._inFlight.set(key, record);
        }
        // 发起者先入队，后触发 loadRemote：同步回调/同步 throw 不可能让 Promise 永远 pending。
        const promise = this._join(record, onProgress, signal);
        if (created) {
            if (record.waiters.size > 0 && !record.settled) {
                this._startRemote(record);
            } else if (record.waiters.size === 0 && !record.settled) {
                // 发起者 (0,1) 进度即抛错且无其他等待者：清理空记录，防悬挂。
                this._deleteInFlight(record);
            }
        }
        return promise as Promise<T>;
    }

    /**
     * @en Release the bank's subscription; when the local count reaches zero the bank returns
     * its own engine reference. Never force-releases the asset (other holders keep theirs).
     * @zh 归还本 bank 的订阅；本地计数归零时 bank 才归还自己持有的引擎引用。
     * 绝不 force release 资产（其他拥有者不受影响）。
     */
    release (url: string, ext?: string): boolean {
        assertValidExt(ext);
        const key = cacheKey(url, ext);
        const entry = this._entries.get(key);
        if (!entry) { return false; }
        entry.refs -= 1;
        if (entry.refs <= 0) {
            this._entries.delete(key);
            entry.asset.decRef();
            return true;
        }
        return false;
    }

    /**
     * @en Release every cached entry and revoke in-flight subscriptions (session-end recipe):
     * waiters reject with AIR_E_REVOKED; the still-uncancellable underlying requests complete
     * later and the bank requests normal release with a net-zero addRef/decRef pair; subsequent loads start
     * fresh requests that revoked late callbacks cannot remove.
     * @zh 释放全部入库条目并撤销在途订阅（会话结束配方）：在途等待者以 AIR_E_REVOKED 拒绝；
     * 不可取消的底层请求稍后完成时 bank 成对 addRef→decRef 触发正常 tryRelease（净 0）；之后的加载是新请求，被撤销请求的
     * 迟到回调不会移除它们。
     * @returns number of cached entries released.
     */
    releaseAll (): number {
        let released = 0;
        for (const [key, entry] of [...this._entries]) {
            this._entries.delete(key);
            entry.asset.decRef();
            released += 1;
        }
        for (const [key, record] of [...this._inFlight]) {
            record.revoked = true;
            this._inFlight.delete(key);
            for (const waiter of [...record.waiters]) {
                this._detachAbort(waiter);
                record.waiters.delete(waiter);
                waiter.reject(new AirAssetError('AIR_E_REVOKED', `[AssetBank] in-flight subscription revoked by releaseAll: ${record.key}`));
            }
        }
        return released;
    }

    // ── 内部 ──

    private _join (record: InFlight, onProgress?: AssetProgressFn, signal?: AbortSignal): Promise<Asset> {
        return new Promise<Asset>((resolve, reject) => {
            const waiter: Waiter = {
                resolve,
                reject,
                onProgress,
                signal,
                onAbort: () => {
                    // 订阅者取消：只移除自己；底层请求继续（不可取消），其他共享者不受影响。
                    record.waiters.delete(waiter);
                    this._detachAbort(waiter);
                    reject(new AirAssetError('AIR_E_ABORTED', `[AssetBank] subscription aborted: ${record.key}`));
                },
            };
            if (signal) {
                signal.addEventListener('abort', waiter.onAbort, { once: true });
            }
            record.waiters.add(waiter);
            try {
                onProgress?.(0, 1); // 两阶如实报告的第一阶
            } catch (cause) {
                record.waiters.delete(waiter);
                this._detachAbort(waiter);
                reject(new AirAssetError('AIR_E_PROGRESS_ERROR', `[AssetBank] onProgress threw: ${record.key}`, cause));
                return;
            }
            if (signal?.aborted) {
                return; // (0,1) 阶段内已自取消：onAbort 已处理，不再 settle
            }
        });
    }

    private _detachAbort (waiter: Waiter): void {
        if (waiter.signal) {
            waiter.signal.removeEventListener('abort', waiter.onAbort);
        }
    }

    private _deleteInFlight (record: InFlight): void {
        // 身份守卫：被撤销请求的迟到回调不得移除撤销后同键新建的在途记录。
        if (this._inFlight.get(record.key) === record) {
            this._inFlight.delete(record.key);
        }
    }

    private _startRemote (record: InFlight): void {
        const complete = (err: Error | null, asset?: Asset): void => {
            this._settle(record, err, asset);
        };
        try {
            if (record.ext) {
                // 显式 ext：reloadAsset 绕过原生按 URL 的强缓存早退（该早退不看 ext），
                // 保证原生解析器真实按 ext 解析；传参形态小写带点（loadRemote 合同）。
                assetManager.loadRemote(record.url, { ext: `.${record.ext}`, reloadAsset: true }, complete);
            } else {
                // 带后缀 URL：原生按 url 扩展名推断（loadRemote 合同），可用引擎缓存。
                assetManager.loadRemote(record.url, complete);
            }
        } catch (cause) {
            // loadRemote 同步 throw（参数错等）：以失败结算，等待者不会 pending。
            const error = cause instanceof Error ? cause : new Error(String(cause));
            this._settle(record, error);
        }
    }

    /**
     * 统一结算。保持 record 在在途表中直到等待者循环结束：结算过程中的 onProgress 可能
     * 重入 releaseAll/release/load，撤销必须能看到尚未结算的等待者。
     */
    private _settle (record: InFlight, err: Error | null, asset?: Asset): void {
        if (record.settled) { return; }
        record.settled = true;
        if (err || !asset) {
            this._deleteInFlight(record);
            for (const waiter of [...record.waiters]) {
                this._detachAbort(waiter);
                record.waiters.delete(waiter);
                waiter.reject(new AirAssetError('AIR_E_LOAD_FAILED', `[AssetBank] load failed: ${record.url} (${(err && err.message) || err})`, err ?? undefined));
            }
            record.waiters.clear();
            return;
        }
        if (record.revoked || record.waiters.size === 0) {
            // 撤销或全员取消/退订：迟到结果无人接管。真实 loadRemote 交付零引用资产（654 行
            // 缓存早退与 factory 分支都不 addRef 给回调），bank 成对 addRef→decRef 触发正常
            // tryRelease（净 0；外部 owner 的引用因 refCount>0 被 _free 跳过，不受侵害；不 force）。
            this._deleteInFlight(record);
            asset.addRef();
            asset.decRef();
            return;
        }
        // 采用：bank 只自持一份引擎 addRef（交付资产不带任何管线引用，无成对归还可言）。
        asset.addRef();
        const entry: BankEntry = { asset, refs: record.waiters.size };
        this._entries.set(record.key, entry);
        for (const waiter of [...record.waiters]) {
            try {
                waiter.onProgress?.(1, 1); // 两阶如实报告的第二阶（abort 处理器仍挂载）
            } catch (cause) {
                this._settleOneFailed(record, entry, waiter, 'AIR_E_PROGRESS_ERROR', cause);
                continue;
            }
            if (waiter.signal?.aborted || record.revoked) {
                // 进度内自取消（onAbort 已拒绝）/ 重入 releaseAll 已撤销（releaseAll 已拒绝）：
                // 仅记账，不 resolve。
                this._settleOneFailed(record, entry, waiter, record.revoked ? 'AIR_E_REVOKED' : 'AIR_E_ABORTED');
                continue;
            }
            record.waiters.delete(waiter);
            this._detachAbort(waiter);
            waiter.resolve(asset);
        }
        this._deleteInFlight(record);
    }

    /** 结算期单个订阅失败（进度抛错/自取消/被撤销）：拒绝并回退其乐观订阅计数。 */
    private _settleOneFailed (record: InFlight, entry: BankEntry, waiter: Waiter, code: 'AIR_E_PROGRESS_ERROR' | 'AIR_E_ABORTED' | 'AIR_E_REVOKED', cause?: unknown): void {
        record.waiters.delete(waiter);
        this._detachAbort(waiter);
        waiter.reject(new AirAssetError(code, `[AssetBank] subscription ${code === 'AIR_E_PROGRESS_ERROR' ? 'onProgress threw' : code.toLowerCase()}: ${record.key}`, cause));
        const current = this._entries.get(record.key);
        if (current === entry) { // 重入 release 已把条目摘除时不再重复回退
            entry.refs -= 1;
            if (entry.refs <= 0) {
                this._entries.delete(record.key);
                entry.asset.decRef(); // 归还 bank 持久引用
            }
        }
    }
}
