/**
 * Cocos Air — libGDX 文本图集纯解析器（PG-01，port-gap-remediation S4）。
 *
 * 解析 libGDX TexturePacker 的 .atlas/.pack 文本格式为冻结数据文档；不做任何引擎
 * 资源分配，可独立单测。语法与语义对齐官方实现（TextureAtlas.java 读侧、
 * TexturePacker.java writePage/writeRect/writePageLegacy 写侧）：
 *
 * 行识别（与缩进无关）：
 *   - 字段行 = 匹配 `key: value`（key 为字母开头的标识符）；页/区域字段均可无缩进
 *     （legacy 写侧：页字段无缩进、region 字段带缩进；紧凑新格式：全部无缩进）。
 *   - 名字行 = 其余行（无 key: 前缀，如 page-0.png / regionName）。名字含 `:` 不支持。
 * 块边界（size 前瞻判别）：名字行后首个字段若为 `size:` 则该名字行是**新页文件名**
 *   （两代写侧的页块首个字段恒为 size，且区域字段永不以 size 开头——legacy 区域以
 *   rotate/xy 开头、新格式以 bounds 开头）；否则该名字行是**新区域名**（归属当前页）。
 *   空行跳过；CRLF 与 BOM 支持；多页与同页多区域均支持。
 *
 * 页字段：size: w,h（必需）；format；filter/filt（两拼写等价，不得同现）；repeat；pma: true|false。
 * 区域字段：
 *   - rotate: false|true|90（true ≡ 90；其他值拒绝）
 *   - 旧格式 xy: x,y + size: w,h —— size 为逻辑（未旋转裁剪后）尺寸，rotate 时页上占用 = 交换
 *   - 新格式 bounds: x,y,w,h —— x/y 为页上位置，w/h 为**逻辑**尺寸；rotate 时页上占用 = 交换
 *     （与 xy/size 互斥）
 *   - 旧格式 orig: w,h + offset: left,bottom（自原图左/下边的修剪距离；缺省 orig=逻辑、offset=0,0）
 *   - 新格式 offsets: offsetX, offsetY, originalWidth, originalHeight（官方 TextureAtlas 语义：
 *     前两元为修剪距离 left/bottom，后两元为原始完整尺寸）—— 与 orig/offset 互斥
 *   - index: n（≥ -1；n ≥ 0 为动画帧，同名不同 index 全部可查，绝不静默覆盖）
 *
 * 显式拒绝（稳定 AIR_E_ATLAS_* 错误码）：未知字段键、未知 rotate 值、区域越界页、
 * 页块前出现区域字段、同 name+index 重复、bounds 与 xy/size 混用、offsets 与 orig/offset
 * 混用、非法整数/负数、页缺 size、字段先于任何名行、名字含冒号、空输入。
 */

/** @en Rotation as stored: 0 = unrotated, 90 = packed rotated (footprint swapped). @zh 打包旋转：0 未旋转；90 已旋转（占用宽高交换）。 */
export type AirAtlasRotation = 0 | 90;

/** @en One page block. @zh 一个页块。 */
export interface AirAtlasPage {
    readonly file: string;
    readonly pageIndex: number;
    readonly width: number;
    readonly height: number;
    readonly format?: string;
    readonly filter?: string;
    readonly repeat?: string;
    readonly pma?: boolean;
}

/** @en One region with libGDX semantics translated to explicit geometry. @zh 一个区域，libGDX 语义已翻译为显式几何。 */
export interface AirAtlasRegion {
    readonly name: string;
    /** @en -1 = plain region; ≥ 0 = animation frame. @zh -1 普通区域；≥0 动画帧序号。 */
    readonly index: number;
    readonly pageIndex: number;
    readonly rotate: AirAtlasRotation;
    /** @en Packed position on the page, top-left origin. @zh 页上打包位置（左上原点）。 */
    readonly xy: Readonly<{ x: number; y: number }>;
    /** @en On-page footprint (swapped for rotated). @zh 页上占用（旋转时宽高交换）。 */
    readonly packed: Readonly<{ width: number; height: number }>;
    /** @en Unrotated trimmed size. @zh 未旋转的裁剪后尺寸。 */
    readonly logical: Readonly<{ width: number; height: number }>;
    /** @en Full size before trimming. @zh 修剪前完整尺寸。 */
    readonly original: Readonly<{ width: number; height: number }>;
    /** @en Trim distances from the original's left/bottom edges. @zh 自原图左/下边的修剪距离。 */
    readonly offset: Readonly<{ left: number; bottom: number }>;
}

/** @en Frozen parsed document with name queries. @zh 冻结的解析文档与名称查询。 */
export interface AirAtlasDocument {
    readonly pages: readonly AirAtlasPage[];
    readonly regions: readonly AirAtlasRegion[];
    /** @en Plain (index -1) region; undefined when the name only has animation frames. @zh 普通区域（index -1）；同名仅有动画帧时 undefined（不得静默覆盖）。 */
    getRegion(name: string): AirAtlasRegion | undefined;
    /** @en All regions of the name ordered by index. @zh 该名称全部区域（按 index 升序）。 */
    getRegions(name: string): readonly AirAtlasRegion[];
}

/** @en Stable error codes of the atlas parser. @zh 图集解析的稳定错误码。 */
export type AirAtlasErrorCode =
    | 'AIR_E_ATLAS_FORMAT' // 行结构/未知字段/互斥字段混用等格式错误
    | 'AIR_E_ATLAS_DATA' // 数值/缺字段/引用错等数据错误
    | 'AIR_E_ATLAS_ROTATION' // 未知 rotate 值
    | 'AIR_E_ATLAS_BOUNDS' // 区域越界页
    | 'AIR_E_ATLAS_DUPLICATE' // 同 name+index 重复
    | 'AIR_E_ATLAS_PAGE'; // 页块不完整/区域字段先于页块

function fail (code: AirAtlasErrorCode, message: string): never {
    const error = new Error(`${code}: ${message}`);
    Object.assign(error, { code });
    throw error;
}

function nonNegativeInt (raw: string, what: string): number {
    const value = Number(raw);
    if (raw.trim() === '' || !Number.isSafeInteger(value) || value < 0) {
        fail('AIR_E_ATLAS_DATA', `${what} must be a non-negative safe integer, got "${raw}"`);
    }
    return value;
}

function parsePair (raw: string, what: string): { a: number; b: number } {
    const parts = raw.split(',').map((part) => part.trim());
    if (parts.length !== 2) fail('AIR_E_ATLAS_DATA', `${what} must be "a, b"`);
    return { a: nonNegativeInt(parts[0]!, `${what}[0]`), b: nonNegativeInt(parts[1]!, `${what}[1]`) };
}

function parseQuad (raw: string, what: string): [number, number, number, number] {
    const parts = raw.split(',').map((part) => part.trim());
    if (parts.length !== 4) fail('AIR_E_ATLAS_DATA', `${what} must be "a, b, c, d"`);
    return [nonNegativeInt(parts[0]!, `${what}[0]`), nonNegativeInt(parts[1]!, `${what}[1]`),
        nonNegativeInt(parts[2]!, `${what}[2]`), nonNegativeInt(parts[3]!, `${what}[3]`)];
}

const PAGE_KEYS = new Set(['size', 'format', 'filter', 'filt', 'repeat', 'pma']);
const REGION_KEYS = new Set(['rotate', 'xy', 'size', 'orig', 'offset', 'index', 'bounds', 'offsets']);
const FIELD_PATTERN = /^\s*([A-Za-z]\w*)\s*:\s?(.*?)\s*$/;

interface PageDraft {
    file: string;
    keys: Set<string>;
    width?: number;
    height?: number;
    format?: string;
    filter?: string;
    repeat?: string;
    pma?: boolean;
}

interface RegionDraft {
    name: string;
    keys: Set<string>;
    rotate: AirAtlasRotation;
    index: number;
    xy?: { x: number; y: number };
    logical?: { width: number; height: number };
    bounds?: { width: number; height: number };
    original?: { width: number; height: number };
    offset?: { left: number; bottom: number };
    offsets?: { left: number; bottom: number; originalWidth: number; originalHeight: number };
    pageIndex: number;
}

/** @en Parse libGDX .atlas/.pack text into a frozen document. @zh 解析 libGDX .atlas/.pack 文本为冻结文档。 */
export function parseAtlasText (text: string): AirAtlasDocument {
    if (typeof text !== 'string' || text.trim() === '') {
        fail('AIR_E_ATLAS_FORMAT', 'atlas text is empty');
    }
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
        .map((line) => line.replace(/\t/g, '    '))
        .filter((line) => line.trim() !== '');

    const pageDrafts: PageDraft[] = [];
    const regionDrafts: RegionDraft[] = [];
    const seen = new Set<string>();
    let pageDraft: PageDraft | null = null;
    let regionDraft: RegionDraft | null = null;

    const finalizeRegion = (): void => {
        if (!regionDraft) return;
        const draft = regionDraft;
        regionDraft = null;
        const page = pageDrafts[draft.pageIndex];
        if (!page || page.width === undefined || page.height === undefined) {
            fail('AIR_E_ATLAS_PAGE', `region "${draft.name}" appears before any complete page block`);
        }
        if (!draft.xy) fail('AIR_E_ATLAS_DATA', `region "${draft.name}" has no position (xy/bounds)`);
        const logical = draft.logical
            ?? (draft.bounds
                ? { width: draft.bounds.width, height: draft.bounds.height }
                : undefined);
        if (!logical) fail('AIR_E_ATLAS_DATA', `region "${draft.name}" has no size (size/bounds)`);
        const packed = draft.rotate === 90
            ? { width: logical.height, height: logical.width }
            : { width: logical.width, height: logical.height };
        if (draft.xy.x + packed.width > page.width || draft.xy.y + packed.height > page.height) {
            fail('AIR_E_ATLAS_BOUNDS', `region "${draft.name}" packed ${packed.width}x${packed.height} at (${draft.xy.x}, ${draft.xy.y}) exceeds page ${page.width}x${page.height}`);
        }
        let original = draft.original;
        let offset = draft.offset ?? { left: 0, bottom: 0 };
        if (draft.offsets) {
            original = { width: draft.offsets.originalWidth, height: draft.offsets.originalHeight };
            offset = { left: draft.offsets.left, bottom: draft.offsets.bottom };
        }
        if (!original) original = { width: logical.width, height: logical.height };
        if (original.width < logical.width || original.height < logical.height) {
            fail('AIR_E_ATLAS_DATA', `region "${draft.name}" original ${original.width}x${original.height} is smaller than logical ${logical.width}x${logical.height}`);
        }
        const dedupe = `${draft.name}\u0000${draft.index}`;
        if (seen.has(dedupe)) fail('AIR_E_ATLAS_DUPLICATE', `duplicate region "${draft.name}" index ${draft.index}`);
        seen.add(dedupe);
        regionDrafts.push({
            name: draft.name,
            keys: draft.keys,
            rotate: draft.rotate,
            index: draft.index,
            xy: draft.xy,
            logical,
            bounds: draft.bounds,
            original,
            offset,
            offsets: draft.offsets,
            pageIndex: draft.pageIndex,
        });
    };

    for (let i = 0; i < lines.length; i += 1) {
        const rawLine = lines[i]!;
        const fieldMatch = FIELD_PATTERN.exec(rawLine);
        if (fieldMatch) {
            const key = fieldMatch[1]!;
            const value = fieldMatch[2]!;
            if (regionDraft) {
                const region = regionDraft;
                if (!REGION_KEYS.has(key)) fail('AIR_E_ATLAS_FORMAT', `unknown region field "${key}" (supported: ${[...REGION_KEYS].join(', ')})`);
                if (region.keys.has(key)) fail('AIR_E_ATLAS_FORMAT', `duplicate region field "${key}" for "${region.name}"`);
                region.keys.add(key);
                if (key === 'rotate') {
                    if (value === 'false') region.rotate = 0;
                    else if (value === 'true' || value === '90') region.rotate = 90;
                    else fail('AIR_E_ATLAS_ROTATION', `rotate must be false|true|90, got "${value}"`);
                } else if (key === 'xy') {
                    if (region.bounds) fail('AIR_E_ATLAS_FORMAT', `region "${region.name}" mixes bounds with xy/size`);
                    const pair = parsePair(value, 'xy');
                    region.xy = { x: pair.a, y: pair.b };
                } else if (key === 'size') {
                    if (region.bounds) fail('AIR_E_ATLAS_FORMAT', `region "${region.name}" mixes bounds with xy/size`);
                    const pair = parsePair(value, 'size');
                    region.logical = { width: pair.a, height: pair.b };
                } else if (key === 'bounds') {
                    if (region.logical || region.xy) fail('AIR_E_ATLAS_FORMAT', `region "${region.name}" mixes bounds with xy/size`);
                    const quad = parseQuad(value, 'bounds');
                    region.xy = { x: quad[0], y: quad[1] };
                    region.bounds = { width: quad[2], height: quad[3] };
                } else if (key === 'orig') {
                    if (region.offsets) fail('AIR_E_ATLAS_FORMAT', `region "${region.name}" mixes offsets with orig/offset`);
                    const pair = parsePair(value, 'orig');
                    region.original = { width: pair.a, height: pair.b };
                } else if (key === 'offset') {
                    if (region.offsets) fail('AIR_E_ATLAS_FORMAT', `region "${region.name}" mixes offsets with orig/offset`);
                    const pair = parsePair(value, 'offset');
                    region.offset = { left: pair.a, bottom: pair.b };
                } else if (key === 'offsets') {
                    if (region.original || region.offset) fail('AIR_E_ATLAS_FORMAT', `region "${region.name}" mixes offsets with orig/offset`);
                    const quad = parseQuad(value, 'offsets');
                    region.offsets = { left: quad[0], bottom: quad[1], originalWidth: quad[2], originalHeight: quad[3] };
                } else {
                    const index = Number(value);
                    if (!Number.isSafeInteger(index) || index < -1) fail('AIR_E_ATLAS_DATA', `index must be an integer ≥ -1, got "${value}"`);
                    region.index = index;
                }
                continue;
            }
            if (pageDraft) {
                const page = pageDraft;
                if (!PAGE_KEYS.has(key)) fail('AIR_E_ATLAS_FORMAT', `unknown page field "${key}" (supported: ${[...PAGE_KEYS].join(', ')})`);
                if (page.keys.has(key)) fail('AIR_E_ATLAS_FORMAT', `duplicate page field "${key}"`);
                page.keys.add(key);
                if (key === 'size') {
                    const pair = parsePair(value, 'page size');
                    page.width = pair.a;
                    page.height = pair.b;
                } else if (key === 'format') {
                    page.format = value;
                } else if (key === 'filter' || key === 'filt') {
                    if (page.keys.has('filter') && page.keys.has('filt')) fail('AIR_E_ATLAS_FORMAT', 'page cannot declare both filter and filt');
                    page.filter = value;
                } else if (key === 'repeat') {
                    page.repeat = value;
                } else {
                    if (value !== 'true' && value !== 'false') fail('AIR_E_ATLAS_DATA', `pma must be true|false, got "${value}"`);
                    page.pma = value === 'true';
                }
                continue;
            }
            fail('AIR_E_ATLAS_FORMAT', `field "${key}" appears before any name line`);
        }

        // 名字行（无 key: 前缀）：size 前瞻判别新页名（两代写侧页块首字段恒为 size）vs 区域名。
        const name = rawLine.trim();
        if (name.includes(':')) fail('AIR_E_ATLAS_FORMAT', `name lines with ":" are unsupported: "${name.slice(0, 80)}"`);
        const startsPage = (() => {
            for (let j = i + 1; j < lines.length; j += 1) {
                return /^\s*size\s*:/.test(lines[j]!);
            }
            return false;
        })();
        finalizeRegion(); // 名行切换即闭合上一块（页或区域）
        if (startsPage) {
            pageDraft = { file: name, keys: new Set() };
            pageDrafts.push(pageDraft);
        } else {
            if (!pageDraft) fail('AIR_E_ATLAS_PAGE', `region "${name}" appears before any page block`);
            regionDraft = { name, keys: new Set(), rotate: 0, index: -1, pageIndex: pageDrafts.length - 1 };
        }
    }
    finalizeRegion();

    if (pageDrafts.length === 0) fail('AIR_E_ATLAS_FORMAT', 'no page block found');
    const pages: AirAtlasPage[] = pageDrafts.map((page, pageIndex) => {
        if (page.width === undefined || page.height === undefined) {
            fail('AIR_E_ATLAS_FORMAT', `page "${page.file}" is missing size`);
        }
        return Object.freeze({
            file: page.file,
            pageIndex,
            width: page.width,
            height: page.height,
            ...(page.format !== undefined ? { format: page.format } : {}),
            ...(page.filter !== undefined ? { filter: page.filter } : {}),
            ...(page.repeat !== undefined ? { repeat: page.repeat } : {}),
            ...(page.pma !== undefined ? { pma: page.pma } : {}),
        });
    });

    const frozenRegions: AirAtlasRegion[] = regionDrafts.map((draft) => Object.freeze({
        name: draft.name,
        index: draft.index,
        pageIndex: draft.pageIndex,
        rotate: draft.rotate,
        xy: Object.freeze({ x: draft.xy!.x, y: draft.xy!.y }),
        packed: Object.freeze(draft.rotate === 90
            ? { width: draft.logical!.height, height: draft.logical!.width }
            : { width: draft.logical!.width, height: draft.logical!.height }),
        logical: Object.freeze({ width: draft.logical!.width, height: draft.logical!.height }),
        original: Object.freeze({ width: draft.original!.width, height: draft.original!.height }),
        offset: Object.freeze({ left: draft.offset!.left, bottom: draft.offset!.bottom }),
    }));

    const byName = new Map<string, AirAtlasRegion[]>();
    for (const region of frozenRegions) {
        const list = byName.get(region.name) ?? [];
        list.push(region);
        byName.set(region.name, list);
    }
    for (const [, list] of byName) list.sort((x, y) => x.index - y.index);

    return Object.freeze({
        pages: Object.freeze(pages),
        regions: Object.freeze(frozenRegions),
        getRegion (name: string): AirAtlasRegion | undefined {
            const list = byName.get(name);
            if (!list) return undefined;
            return list.find((region) => region.index === -1) ?? (list.length === 1 ? list[0] : undefined);
        },
        getRegions (name: string): readonly AirAtlasRegion[] {
            return Object.freeze([...(byName.get(name) ?? [])]);
        },
    });
}
