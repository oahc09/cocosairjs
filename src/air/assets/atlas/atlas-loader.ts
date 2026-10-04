/**
 * Cocos Air — libGDX 图集加载器（PG-01）：AssetBank 订阅 + 页纹理 + 原生帧。
 *
 * 加载流程（全部经 AssetBank 合同，取消是订阅者取消，不声称网络级可取消）：
 *   1. bank.load(url, { ext: 'atlas', signal }) → TextAsset → parseAtlasText；
 *   2. 解析每页相对 URL（相对 atlas URL 或显式 baseURL）；
 *   3. 页扩展名：页文件自带 .png 后缀 → ext 'png'；无后缀页必须显式 options.pageExt；
 *      非 PNG 在自动路径拒绝（AIR_E_ATLAS_PAGE_FORMAT）——其他格式请自备 Texture2D 走
 *      createAtlasHandle 手动 API（边界见手册）；
 *   4. 并发 bank.load 各页 → ImageAsset → Texture2D → createAtlasHandle。
 *
 * 所有权/回滚：加载中失败/取消会释放已取得的页订阅并销毁未接管的中间 Texture2D，
 * 不产出半成品 handle；返回的 handle.dispose 先走帧在用守卫（AIR_E_ATLAS_IN_USE），
 * 通过后才释放 bank 订阅（失败则订阅保留，可重试 dispose）。
 */

import { SpriteFrame } from '../../../cocos/2d/assets/sprite-frame';
import { Texture2D } from '../../../cocos/asset/assets/texture-2d';
import { ImageAsset } from '../../../cocos/asset/assets/image-asset';
import { TextAsset } from '../../../cocos/asset/assets/text-asset';
import { AssetBank } from '../asset-bank';
import { parseAtlasText, type AirAtlasDocument } from './atlas-parser';
import { createAtlasHandle, type AirAtlasHandle } from './atlas-factory';

function fail (code: string, message: string): never {
    const error = new Error(`${code}: ${message}`);
    Object.assign(error, { code });
    throw error;
}

export interface AirAtlasLoadOptions {
    /** @en The shared AssetBank context (subscriptions follow the PG-06/32 contract). @zh 共享 AssetBank 上下文（订阅遵循 PG-06/32 合同）。 */
    readonly bank: AssetBank;
    /** @en Subscriber-side cancellation (no network-level cancel — see AssetBank contract). @zh 订阅者取消（非网络级取消——见 AssetBank 合同）。 */
    readonly signal?: AbortSignal;
    /** @en Explicit base for relative page URLs; defaults to the atlas URL, then document base. @zh 相对页 URL 的显式基址；缺省依次取 atlas URL 与 document base。 */
    readonly baseURL?: string;
    /** @en Ext for suffix-less page files (default 'png'); other formats rejected on the auto path. @zh 无后缀页文件的扩展名（默认 'png'）；其他格式在自动路径拒绝。 */
    readonly pageExt?: string;
}

function pageFileExtension (file: string, explicit: string | undefined): string {
    const path = file.split(/[?#]/, 1)[0]!;
    const dot = path.lastIndexOf('.');
    if (dot > 0 && dot < path.length - 1) {
        const ext = path.slice(dot + 1).toLowerCase();
        if (ext !== 'png') {
            fail('AIR_E_ATLAS_PAGE_FORMAT', `this loader supports PNG pages only, got ".${ext}"; supply other formats via createAtlasHandle`);
        }
        return ext;
    }
    if (!explicit) {
        fail('AIR_E_ATLAS_PAGE_FORMAT', `suffix-less page "${file}" requires options.pageExt`);
    }
    const ext = explicit.toLowerCase();
    if (ext !== 'png') {
        fail('AIR_E_ATLAS_PAGE_FORMAT', `this loader supports PNG pages only, got "${explicit}"; supply other formats via createAtlasHandle`);
    }
    return ext;
}

/** @en Load a libGDX text atlas and its pages through the shared bank; the handle owns textures/frames. @zh 经共享 bank 加载 libGDX 文本图集与页纹理；handle 持有纹理/帧。 */
export async function loadAtlas (url: string, options: AirAtlasLoadOptions): Promise<AirAtlasHandle> {
    const { bank, signal } = options;
    // 每次成功 load 记一条释放责任（数组而非按键去重）：重复页 URL 的每个订阅都独立归还。
    const ownedPages: Array<{ url: string; ext: string }> = [];
    const intermediates: Texture2D[] = [];
    let textOwned = false;
    const releaseOwned = (): void => {
        for (const { url: pageURL, ext } of ownedPages) bank.release(pageURL, ext);
        ownedPages.length = 0;
        if (textOwned) { textOwned = false; bank.release(url, 'atlas'); }
    };
    try {
        const text = await bank.load(url, { ext: 'atlas', signal });
        textOwned = true;
        if (!(text instanceof TextAsset)) fail('AIR_E_ATLAS_FORMAT', 'atlas URL did not produce TextAsset');
        const document = parseAtlasText(text.text);
        if (signal?.aborted) fail('AIR_E_ABORTED', 'atlas subscription was cancelled');
        let base: string;
        try {
            base = options.baseURL
                ? new URL(options.baseURL, documentBaseURI()).href
                : new URL(url, documentBaseURI()).href;
        } catch {
            fail('AIR_E_ATLAS_BASE_URL', 'relative pages require an absolute atlas URL, document base or explicit baseURL');
        }
        // 按pageIndex预分配：页完成顺序不影响 textures 顺序（修复 Lead 审查③）。
        const textures: (Texture2D | undefined)[] = new Array(document.pages.length).fill(undefined);
        // 等全部页结算后统一决策：首败时兄弟页的迟到结果也能按无人接管正确出清，不留 ghost。
        // TS 4.9 lib 无 allSettled 类型（运行时 Node≥15/现代浏览器均有），局部结构化声明。
        interface SettledResult { status: 'fulfilled' | 'rejected'; reason?: unknown }
        const allSettled = ((Promise as unknown as {
            allSettled: (this: PromiseConstructor, values: readonly PromiseLike<void>[]) => Promise<readonly SettledResult[]>;
        }).allSettled).bind(Promise);
        const pageLoads = document.pages.map(async (page) => {
            const ext = pageFileExtension(page.file, options.pageExt);
            const pageURL = new URL(page.file, base).href;
            const image = await bank.load(pageURL, { ext, signal });
            ownedPages.push({ url: pageURL, ext });
            if (signal?.aborted) fail('AIR_E_ABORTED', 'atlas subscription was cancelled');
            if (!(image instanceof ImageAsset)) fail('AIR_E_ATLAS_PAGE_TEXTURE', `page URL did not produce ImageAsset: ${pageURL}`);
            const texture = new Texture2D();
            texture.image = image;
            intermediates.push(texture);
            textures[page.pageIndex] = texture;
        });
        for (const load of pageLoads) load.catch(() => { /* 拒绝由 allSettled 聚合读取，此处吞副本的未处理告警 */ });
        const results = await allSettled(pageLoads);
        const firstRejection = results.find((result) => result.status === 'rejected');
        if (firstRejection) {
            throw firstRejection.reason;
        }
        if (textures.some((texture) => texture === undefined)) {
            fail('AIR_E_ATLAS_PAGE_TEXTURE', 'not all page textures were created');
        }
        const inner = createAtlasHandle(document, textures as Texture2D[]);
        return Object.freeze({
            document: inner.document,
            textures: inner.textures,
            get disposed () { return inner.disposed; },
            getFrame (name: string, index?: number): SpriteFrame | undefined { return inner.getFrame(name, index); },
            getFrames (name: string): readonly SpriteFrame[] { return inner.getFrames(name); },
            dispose (): void {
                inner.dispose(); // 在用守卫失败则抛出，bank 订阅保留
                releaseOwned();
            },
        });
    } catch (error) {
        for (const texture of intermediates) texture.destroy(); // 回收未接管中间件
        releaseOwned();
        throw error;
    }
}

/** document.baseURI 的可测试包装。 */
function documentBaseURI (): string | undefined {
    return typeof document !== 'undefined' ? document.baseURI : undefined;
}
