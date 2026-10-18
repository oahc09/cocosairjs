/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/

/**
 * Cocos Air — 字符级文本渲染器（AIR 原创，上游 cocos4 无同名文件）。
 *
 * 为什么不是 `Label` 的包装：本作（`_re/il2cpp/dump.cs`）的打字机是 Febucci TextAnimator，
 * 驱动方式是 `maxVisibleCharacters`（`TAnimCore` dump.cs:496884-496885 镜像进 TMP 的
 * `tmpMaxVisibleCharacters` dump.cs:520257-520258）——**排版一次定死，逐字只改可见性**。
 * `Label` 没有这个开关：想"藏掉后半串"只能回退到改 `string` 前缀，而前缀宽度会变，
 * 居中/右对齐的文本逐字抖动、多行还会重排。上游 CHAR 缓存模式其实已经在做逐字分段
 * （`src/cocos/2d/assembler/label/font-utils.ts` 的 `LetterAtlas`），但逐字记录 `_lettersInfo`
 * 是私有的、和 `shareLabelInfo` 全局态绑死，而且 `_updateQuads` 会丢掉宽高为 0 的字形
 * （`text-processing.ts:1246-1268`），字符序号与四边形索引并不一一对应——从外面按索引改
 * 顶点等于依赖一个没有合同的内部布局。所以这里自建**有合同的逐字网格**：字形表自己栅格化、
 * mesh 自己装配，字符序号 ↔ 四边形 ↔ 命中矩形显式绑定。
 *
 * 语义约定（行为等价，不是逐位移植上游/Unity）：
 * - 折行是贪心词折行（拉丁按空格断、CJK 任意断、超长词硬切），不做上游 `fragmentText`
 *   的标点悬挂处理；
 * - 垂直度量是简化模型：字形盒高 = `fontSize`，行盒 `lineHeight` 内垂直居中，不建模
 *   ascent/descent/kerning/offset，字距只有 `letterSpacing`；
 * - 图集是白字 + 逐顶点染色，`color` 即字色；描边/阴影不在本组件范围内；
 * - 组件把排版的自然尺寸写回 `UITransform`（对齐 `Label` 的 Overflow.NONE 行为），
 *   所以 `horizontalAlign` 只作用于**行内**（多行时每行按自己的宽度对齐）；
 * - 无 2D 上下文时（HEADLESS：`test/setup-dom.js` 把 `getContext` 打成 null）退化为
 *   确定性估算度量且不出图（`_canRender()` 为 false），因此无头侧证明的是排版与可见性
 *   逻辑，真实字形像素只在浏览器门禁里证明。
 */
import { ccclass, requireComponent } from 'cc.decorator';
import { cclegacy } from '../cocos/core';
import { Rect } from '../cocos/core/math';
import { UIRenderer } from '../cocos/2d/framework/ui-renderer';
import { UITransform } from '../cocos/2d/framework/ui-transform';
import { SpriteFrame } from '../cocos/2d/assets/sprite-frame';
import { Texture2D } from '../cocos/asset/assets/texture-2d';
import { ImageAsset } from '../cocos/asset/assets/image-asset';
import { WrapMode } from '../cocos/asset/assets/asset-enum';
import { isUnicodeCJK, isUnicodeSpace, getSymbolAt, getSymbolLength } from '../cocos/2d/utils/text-utils';
import { AIR_ICON_PLACEHOLDER, parseAirGlyphTags, type AirGlyphIconSlot, type AirGlyphLinkSpan, type AirGlyphTaggedText } from './ui-glyph-tags';
import type { IAssembler } from '../cocos/2d/renderer/base';
import type { IBatcher } from '../cocos/2d/renderer/i-batcher';

const ATLAS_SIZE = 1024;
const CELL_PAD = 2;
const MAX_GLYPHS = 4096;
const SHOW_ALL = Number.MAX_SAFE_INTEGER;

function fail (message: string): never {
    const error = new Error(`AIR_E_GLYPH_TEXT: ${message}`);
    Object.assign(error, { code: 'AIR_E_GLYPH_TEXT' });
    throw error;
}

/** Advance width of one grapheme cluster at `fontSize`, in design-space units. */
export type AirGlyphMeasurer = (grapheme: string, fontSize: number) => number;

/** Deterministic stand-in used when there is no canvas 2D context and the caller injected none. */
export const measureAirGlyphFallback: AirGlyphMeasurer = (grapheme, fontSize) => {
    // An inline icon reserves a square em: the icon layer then draws its real aspect inside it.
    if (grapheme === AIR_ICON_PLACEHOLDER) return fontSize;
    if (isUnicodeSpace(grapheme)) return fontSize * 0.28;
    if (isUnicodeCJK(grapheme)) return fontSize;
    return fontSize * 0.52;
};

export type AirHAlign = 'left' | 'center' | 'right';

export interface AirGlyphLayoutOptions {
    readonly fontSize: number;
    readonly lineHeight?: number;
    readonly letterSpacing?: number;
    /** 0 (default) disables wrapping; any positive value wraps lines at that width. */
    readonly maxWidth?: number;
    readonly measure?: AirGlyphMeasurer;
}

/** One grapheme cluster in text-block space: `x`/`y` are the quad's top-left, `y` grows downward. */
export interface AirGlyphInfo {
    readonly char: string;
    /** Ordinal of this grapheme in the source string, line feeds included — so it can run ahead of the glyph's own index. */
    readonly sourceIndex: number;
    readonly line: number;
    /** True when a `\n` in the source put this glyph at the start of a line; soft wraps are false. */
    readonly afterLineFeed: boolean;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly advance: number;
}

export interface AirGlyphLayout {
    readonly glyphs: ReadonlyArray<AirGlyphInfo>;
    readonly lineWidths: ReadonlyArray<number>;
    readonly lineCount: number;
    /** Natural content size of the laid-out block. */
    readonly width: number;
    readonly height: number;
}

interface PendingGlyph {
    char: string;
    sourceIndex: number;
    afterLineFeed: boolean;
    advance: number;
    x: number;
}

/**
 * Pure layout: no canvas and no engine state, so it is unit-testable with an injected measurer.
 * Visibility is deliberately not a layout concern — `maxVisibleCharacters` must never reflow.
 */
export function layoutAirGlyphs (text: string, options: AirGlyphLayoutOptions): AirGlyphLayout {
    const fontSize = options.fontSize;
    if (!Number.isFinite(fontSize) || fontSize <= 0) fail(`fontSize must be positive, got ${options.fontSize}`);
    const lineHeight = options.lineHeight ?? Math.ceil(fontSize * 1.25);
    const letterSpacing = options.letterSpacing ?? 0;
    const maxWidth = options.maxWidth ?? 0;
    const measure = options.measure ?? measureAirGlyphFallback;
    if (!text) return { glyphs: [], lineWidths: [0], lineCount: 1, width: 0, height: lineHeight };

    const total = getSymbolLength(text);
    if (total > MAX_GLYPHS) fail(`string has ${total} graphemes, the limit is ${MAX_GLYPHS}`);

    const rows: PendingGlyph[][] = [];
    let row: PendingGlyph[] = [];
    let penX = 0;
    let sourceIndex = 0;
    let breakNext = false;

    const flush = (): void => {
        while (row.length && isUnicodeSpace(row[row.length - 1].char)) row.pop();
        rows.push(row);
        row = [];
        penX = 0;
    };

    for (let i = 0; i < total; i++) {
        const char = getSymbolAt(text, i);
        const advance = measure(char, fontSize);
        if (char === '\n') {
            sourceIndex++;
            breakNext = true;
            flush();
            continue;
        }
        const fits = maxWidth <= 0 || penX === 0 || penX + advance <= maxWidth;
        if (!fits) {
            const hardCut = isUnicodeCJK(char);
            // Break after the last breakable grapheme already on the line; a CJK char cuts right here.
            let cut = hardCut ? row.length : -1;
            if (cut < 0) {
                for (let k = row.length - 1; k >= 0; k--) {
                    if (isUnicodeSpace(row[k].char) || isUnicodeCJK(row[k].char)) {
                        cut = k + 1;
                        break;
                    }
                }
            }
            if (cut <= 0) {
                // Nothing breakable yet and the first grapheme alone already overflows: hard-cut it.
                cut = row.length ? 1 : 0;
            }
            const carried = row.splice(cut);
            flush();
            for (const item of carried) {
                item.x = penX;
                penX += item.advance + letterSpacing;
                row.push(item);
            }
        }
        row.push({ char, sourceIndex: sourceIndex++, afterLineFeed: breakNext, advance, x: penX });
        breakNext = false;
        penX += advance + letterSpacing;
    }
    flush();

    const glyphs: AirGlyphInfo[] = [];
    const lineWidths: number[] = [];
    let contentWidth = 0;
    for (let line = 0; line < rows.length; line++) {
        const items = rows[line];
        let lineRight = 0;
        for (const item of items) {
            lineRight = Math.max(lineRight, item.x + item.advance);
            glyphs.push({
                char: item.char,
                sourceIndex: item.sourceIndex,
                line,
                afterLineFeed: item.afterLineFeed,
                x: item.x - CELL_PAD,
                y: line * lineHeight + (lineHeight - fontSize) / 2 - CELL_PAD,
                width: Math.ceil(item.advance) + CELL_PAD * 2,
                height: Math.ceil(fontSize) + CELL_PAD * 2,
                advance: item.advance,
            });
        }
        lineWidths.push(lineRight);
        contentWidth = Math.max(contentWidth, lineRight);
    }
    return { glyphs, lineWidths, lineCount: rows.length, width: contentWidth, height: rows.length * lineHeight };
}

interface AirGlyphCell {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

/** Runtime glyph atlas: white glyphs rasterised with canvas 2D, tinted per vertex. */
class AirGlyphAtlas {
    private _canvas: HTMLCanvasElement | null = null;
    private _ctx: CanvasRenderingContext2D | null = null;
    private _cells = new Map<string, AirGlyphCell>();
    private _x = 0;
    private _y = 0;
    private _rowHeight = 0;
    private _overflowWarned = false;
    private _dirty = false;
    private _frame: SpriteFrame | null = null;
    private _texture: Texture2D | null = null;
    private _image: ImageAsset | null = null;

    get available (): boolean {
        return !!this._ensureContext();
    }

    get frame (): SpriteFrame | null {
        return this._frame;
    }

    measure (char: string, fontSize: number): number {
        if (char === AIR_ICON_PLACEHOLDER) return fontSize;
        if (!this._ensureContext()) return measureAirGlyphFallback(char, fontSize);
        const ctx = this._ctx!;
        ctx.font = fontDesc(fontSize);
        return ctx.measureText(char).width;
    }

    obtain (char: string, fontSize: number): AirGlyphCell | null {
        const key = `${char}\u0000${Math.round(fontSize * 64)}`;
        const hit = this._cells.get(key);
        if (hit) return hit;
        if (!this._ensureContext()) return null;

        const ctx = this._ctx!;
        ctx.font = fontDesc(fontSize);
        const width = Math.ceil(ctx.measureText(char).width) + CELL_PAD * 2;
        const height = Math.ceil(fontSize) + CELL_PAD * 2;
        if (this._x + width > ATLAS_SIZE) {
            this._x = 0;
            this._y += this._rowHeight;
            this._rowHeight = 0;
        }
        if (this._y + height > ATLAS_SIZE) {
            if (!this._overflowWarned) {
                this._overflowWarned = true;
                console.warn('AIR_E_GLYPH_TEXT: glyph atlas is full, remaining glyphs render blank');
            }
            return null;
        }
        const cell: AirGlyphCell = { x: this._x, y: this._y, width, height };
        this._x += width;
        this._rowHeight = Math.max(this._rowHeight, height);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(char, cell.x + width / 2, cell.y + height / 2);
        this._cells.set(key, cell);
        this._dirty = true;
        return cell;
    }

    /** Pushes the canvas into the GPU texture and keeps the 2D batcher's descriptor cache honest. */
    upload (): SpriteFrame | null {
        if (!this._ensureContext()) return null;
        if (!this._frame) {
            this._image = new ImageAsset(this._canvas!);
            this._texture = new Texture2D();
            this._texture.image = this._image;
            this._frame = new SpriteFrame();
            this._frame.texture = this._texture;
            this._dirty = false;
            return this._frame;
        }
        if (!this._dirty) return this._frame;
        const texture = this._texture!;
        const oldHash = texture.getHash();
        texture.reset({ width: ATLAS_SIZE, height: ATLAS_SIZE, mipmapLevel: 1 });
        texture.uploadData(this._canvas!);
        texture.setWrapMode(WrapMode.CLAMP_TO_EDGE, WrapMode.CLAMP_TO_EDGE);
        this._frame.rect = new Rect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
        this._frame._calculateUV();
        const batcher = (cclegacy.director as any)?.root?.batcher2D;
        batcher?._releaseDescriptorSetCache(oldHash);
        this._dirty = false;
        return this._frame;
    }

    destroy (): void {
        this._cells.clear();
        this._frame?.destroy();
        this._texture?.destroy();
        this._image?.destroy();
        this._frame = null;
        this._texture = null;
        this._image = null;
        this._ctx = null;
        this._canvas = null;
    }

    private _ensureContext (): boolean {
        if (this._ctx) return true;
        const canvas = document.createElement('canvas');
        canvas.width = ATLAS_SIZE;
        canvas.height = ATLAS_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        this._canvas = canvas;
        this._ctx = ctx;
        return true;
    }
}

function fontDesc (fontSize: number): string {
    return `${fontSize}px 'Arial', sans-serif`;
}

const assembler: IAssembler = {
    updateRenderData (component) {
        const text = component as AirGlyphText;
        text.rebuild();
        const mesh = text.meshData;
        const frame = text.spriteFrame;
        if (!frame || !mesh || !mesh.positions.length) return;
        const data = text.renderData || text.requestRenderData();
        const count = mesh.positions.length / 2;
        if (data.vertexCount !== count || data.indexCount !== mesh.indices.length) {
            data.dataLength = count;
            data.resize(count, mesh.indices.length);
            data.chunk.setIndexBuffer(mesh.indices);
        }
        const vb = data.chunk.vb;
        const stride = data.floatStride;
        const uv = frame.uv;
        for (let i = 0; i < count; i++) {
            data.data[i].x = mesh.positions[i * 2];
            data.data[i].y = mesh.positions[i * 2 + 1];
            const u = mesh.uvs[i * 2];
            const v = mesh.uvs[i * 2 + 1];
            const offset = i * stride;
            vb[offset + 3] = (uv[0] * (1 - u) + uv[2] * u) * (1 - v) + (uv[4] * (1 - u) + uv[6] * u) * v;
            vb[offset + 4] = (uv[1] * (1 - u) + uv[3] * u) * (1 - v) + (uv[5] * (1 - u) + uv[7] * u) * v;
        }
        assembler.updateColor!(component);
        data.vertDirty = true;
        data.updateRenderData(component, frame);
    },
    /** Per-vertex tint: the component colour times that glyph's own alpha. */
    updateColor (component) {
        const text = component as AirGlyphText;
        const data = text.renderData;
        const mesh = text.meshData;
        if (!data?.chunk || !mesh) return;
        const color = text.color;
        const vb = data.chunk.vb;
        const stride = data.floatStride;
        for (let i = 0; i < mesh.alphas.length; i++) {
            const offset = i * stride + 5;
            vb[offset] = color.r / 255;
            vb[offset + 1] = color.g / 255;
            vb[offset + 2] = color.b / 255;
            vb[offset + 3] = (mesh.alphas[i] * color.a) / 255;
        }
    },
    fillBuffers (component) {
        const text = component as AirGlyphText;
        const data = text.renderData;
        const mesh = text.meshData;
        if (!data?.chunk || !mesh) return;
        const chunk = data.chunk;
        const matrix = component.node.worldMatrix;
        const vb = chunk.vb;
        const count = mesh.positions.length / 2;
        for (let i = 0; i < count; i++) {
            const x = mesh.positions[i * 2];
            const y = mesh.positions[i * 2 + 1];
            const offset = i * data.floatStride;
            const w = matrix.m03 * x + matrix.m07 * y + matrix.m15;
            const inverse = w ? 1 / w : 1;
            vb[offset] = (matrix.m00 * x + matrix.m04 * y + matrix.m12) * inverse;
            vb[offset + 1] = (matrix.m01 * x + matrix.m05 * y + matrix.m13) * inverse;
            vb[offset + 2] = (matrix.m02 * x + matrix.m06 * y + matrix.m14) * inverse;
        }
        const indices = Uint16Array.from(mesh.indices, (index) => index + chunk.vertexOffset);
        chunk.vertexAccessor.appendIndices(chunk.bufferId, indices);
        chunk.meshBuffer.setDirty();
    },
};

/** Node-local rect, `y` growing upward like every other UI space in this engine. */
export interface AirGlyphRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface AirGlyphMesh {
    readonly positions: number[];
    readonly uvs: number[];
    readonly alphas: number[];
    readonly indices: number[];
}

/**
 * Character-addressable text. Unlike `Label` this keeps one contract per glyph: `glyphAt(i)`,
 * `getCharacterRect(i)`, `setCharacterAlpha(i, a)` and `maxVisibleCharacters` all index the same
 * grapheme order, and revealing never changes layout. The order is TMP's: every rendered glyph
 * counts, line feeds and inline tags do not (`AirGlyphInfo.sourceIndex` maps back to the source).
 *
 * `<link>` spans are hover targets resolved against the same per-glyph rects, and `<sprite>` tags
 * reserve a glyph rect without emitting geometry — `AirGlyphIconLayer` draws the frame there.
 */
@ccclass('AirGlyphText')
@requireComponent(UITransform)
export class AirGlyphText extends UIRenderer {
    /** Fires when the pointer moves onto a link span — TMP's OnLinkEnter. */
    onLinkEnter?: (id: string) => void;
    /** Fires when the pointer leaves a link span — TMP's OnLinkExit. */
    onLinkExit?: (id: string) => void;
    /** Fires every `updatePointer` call while a link stays hovered. The game's StayLink handler is an empty stub. */
    onLinkStay?: (id: string) => void;

    private _string = '';
    private _tags: AirGlyphTaggedText = parseAirGlyphTags('');
    private _spans: AirGlyphTaggedText | null = null;
    private _ordinalBySource: Map<number, number> | null = null;
    private _iconOrdinals = new Set<number>();
    private _hovered: string | null = null;
    private _revision = 0;
    private _fontSize = 40;
    private _lineHeight = 50;
    private _letterSpacing = 0;
    private _maxWidth = 0;
    private _horizontalAlign: AirHAlign = 'left';
    private _maxVisible = SHOW_ALL;
    private _firstVisible = 0;
    private _alphas: number[] | null = null;
    private _layout: AirGlyphLayout | null = null;
    private _mesh: AirGlyphMesh | null = null;
    private _meshAnchor: { x: number; y: number } | null = null;
    private _rects: (AirGlyphRect | null)[] | null = null;
    private _atlas = new AirGlyphAtlas();
    private _measureOverride: AirGlyphMeasurer | null = null;
    private _disposed = false;

    get string (): string {
        return this._string;
    }

    /**
     * The source text, inline tags included. `<link>` / `<sprite>` are parsed out and the layout
     * runs on the remaining display string — same as TMP, where the tag never occupies glyphs.
     */
    set string (value: string) {
        const next = value == null ? '' : String(value);
        if (next === this._string) return;
        this._string = next;
        this._tags = parseAirGlyphTags(next);
        this._hovered = null;
        this._invalidate();
    }

    get fontSize (): number {
        return this._fontSize;
    }

    set fontSize (value: number) {
        if (value === this._fontSize) return;
        if (!Number.isFinite(value) || value <= 0) fail(`fontSize must be positive, got ${value}`);
        this._fontSize = value;
        this._lineHeight = Math.ceil(value * 1.25);
        this._invalidate();
    }

    /** Line box height; defaults to `ceil(fontSize * 1.25)`. Set it to emulate TMP's lineSpacing. */
    get lineHeight (): number {
        return this._lineHeight;
    }

    set lineHeight (value: number) {
        if (value === this._lineHeight) return;
        if (!Number.isFinite(value) || value <= 0) fail(`lineHeight must be positive, got ${value}`);
        this._lineHeight = value;
        this._invalidate();
    }

    get letterSpacing (): number {
        return this._letterSpacing;
    }

    set letterSpacing (value: number) {
        if (value === this._letterSpacing) return;
        this._letterSpacing = value;
        this._invalidate();
    }

    /** 0 keeps a single unwrapped line; any positive value wraps at that width. */
    get maxWidth (): number {
        return this._maxWidth;
    }

    set maxWidth (value: number) {
        if (value === this._maxWidth) return;
        if (value < 0) fail(`maxWidth must be >= 0, got ${value}`);
        this._maxWidth = value;
        this._invalidate();
    }

    get horizontalAlign (): AirHAlign {
        return this._horizontalAlign;
    }

    set horizontalAlign (value: AirHAlign) {
        if (value === this._horizontalAlign) return;
        if (value !== 'left' && value !== 'center' && value !== 'right') fail(`unknown horizontalAlign ${value}`);
        this._horizontalAlign = value;
        this._invalidate();
    }

    /**
     * TMP-shaped reveal window. Layout is computed over the whole string once, so changing this
     * never reflows. Default is `Infinity` (everything visible).
     */
    get maxVisibleCharacters (): number {
        return this._maxVisible === SHOW_ALL ? Infinity : this._maxVisible;
    }

    set maxVisibleCharacters (value: number) {
        const next = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : SHOW_ALL;
        if (next === this._maxVisible) return;
        this._maxVisible = next;
        this._invalidateMesh();
    }

    get firstVisibleCharacter (): number {
        return this._firstVisible;
    }

    set firstVisibleCharacter (value: number) {
        const next = Math.max(0, Math.floor(value || 0));
        if (next === this._firstVisible) return;
        this._firstVisible = next;
        this._invalidateMesh();
    }

    /** Grapheme count of the display string — the unit every character index below is in. */
    get characterCount (): number {
        return this.layout().glyphs.length;
    }

    /** Parsed view of `string`: display text, icon slots and link spans. */
    get tags (): AirGlyphTaggedText {
        return this._glyphSpans();
    }

    /** Bumped whenever the mesh goes dirty — the seam `AirGlyphIconLayer` polls instead of re-syncing blindly. */
    get meshRevision (): number {
        return this._revision;
    }

    /** Link currently under the pointer, or null. */
    get hoveredLink (): string | null {
        return this._hovered;
    }

    get spriteFrame (): SpriteFrame | null {
        return this._atlas.frame;
    }

    get disposed (): boolean {
        return this._disposed;
    }

    /** Injected measurer — the seam that keeps headless layout tests deterministic. */
    setMeasurer (measure: AirGlyphMeasurer | null): void {
        this._measureOverride = measure;
        this._invalidate();
    }

    layout (): AirGlyphLayout {
        if (!this._layout) {
            const atlas = this._atlas;
            this._layout = layoutAirGlyphs(this._tags.text, {
                fontSize: this._fontSize,
                lineHeight: this._lineHeight,
                letterSpacing: this._letterSpacing,
                maxWidth: this._maxWidth,
                measure:
                    this._measureOverride ??
                    (atlas.available ? (char, size): number => atlas.measure(char, size) : undefined),
            });
            // Tag ordinals are counted on the display string; layout drops line feeds and the
            // trailing spaces it folds away, so every public index needs this translation.
            this._ordinalBySource = new Map();
            this._layout.glyphs.forEach((glyph, ordinal) => {
                if (!this._ordinalBySource!.has(glyph.sourceIndex)) this._ordinalBySource!.set(glyph.sourceIndex, ordinal);
            });
            this._spans = null;
        }
        return this._layout;
    }

    glyphAt (index: number): AirGlyphInfo | null {
        const glyphs = this.layout().glyphs;
        return index >= 0 && index < glyphs.length ? glyphs[index] : null;
    }

    /**
     * True when glyph `index` starts a line because the source had a `\n` before it, as opposed to a
     * soft wrap. The typewriter uses this to pause on line feeds only — a dropped trailing space also
     * leaves a gap in `sourceIndex`, which is why the layout records the break itself.
     */
    isLineStartFromBreak (index: number): boolean {
        return this.glyphAt(index)?.afterLineFeed ?? false;
    }

    /**
     * Node-local point → id of the `<link>` span that owns the glyph under it, else null.
     * TMP's `FindIntersectingLink` equivalent: a glyph outside the reveal window has no rect, so a
     * link the typewriter has not finished typing cannot be hovered yet.
     */
    linkIdAtPoint (point: { readonly x: number; readonly y: number }): string | null {
        for (const span of this._glyphSpans().links) {
            for (let index = span.start; index <= span.end; index++) {
                const rect = this.getCharacterRect(index);
                if (!rect) continue;
                if (point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height) {
                    return span.id;
                }
            }
        }
        return null;
    }

    /** Feeds a pointer position in this node's space, `null` when the pointer left. Fires the link callbacks. */
    updatePointer (point: { readonly x: number; readonly y: number } | null): string | null {
        const next = point ? this.linkIdAtPoint(point) : null;
        if (next !== this._hovered) {
            const previous = this._hovered;
            this._hovered = next;
            if (previous) this.onLinkExit?.(previous);
            if (next) this.onLinkEnter?.(next);
        }
        if (next) this.onLinkStay?.(next);
        return next;
    }

    /** Node-local rect of glyph `index`, or null when it is out of range or currently hidden. */
    getCharacterRect (index: number): AirGlyphRect | null {
        this.rebuild();
        return this._rects?.[index] ?? null;
    }

    isCharacterVisible (index: number): boolean {
        return this.getCharacterRect(index) !== null;
    }

    /** Per-glyph multiplier on top of `color` — the hook fade-in appearances animate. */
    setCharacterAlpha (index: number, alpha: number): void {
        const count = this.characterCount;
        if (index < 0 || index >= count) fail(`character index ${index} out of range 0..${count - 1}`);
        if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) fail(`alpha must be in [0,1], got ${alpha}`);
        if (!this._alphas) this._alphas = new Array(count).fill(1);
        if (this._alphas[index] === alpha) return;
        this._alphas[index] = alpha;
        this._invalidateMesh();
    }

    getCharacterAlpha (index: number): number {
        return this._alphas?.[index] ?? 1;
    }

    clearCharacterAlphas (): void {
        if (!this._alphas) return;
        this._alphas = null;
        this._invalidateMesh();
    }

    /** Read-only view of the built vertex data — for the acceptance gate, not for mutation. */
    get meshData (): AirGlyphMesh | null {
        return this._mesh;
    }

    /** Rebuilds mesh + per-glyph rects. Idempotent; the assembler calls it every dirty pass. */
    rebuild (): void {
        if (this._disposed) return;
        const uiTransform = this.node.getComponent(UITransform);
        const anchorX = uiTransform?.anchorX ?? 0.5;
        const anchorY = uiTransform?.anchorY ?? 0.5;
        // The base class reacts to ANCHOR_CHANGED by re-submitting the cached mesh, and the anchor is
        // an input to these very coordinates — so the cache is only valid while the anchor holds.
        if (this._mesh && this._meshAnchor && this._meshAnchor.x === anchorX && this._meshAnchor.y === anchorY) return;
        this._meshAnchor = { x: anchorX, y: anchorY };
        const layout = this.layout();
        // Icon placeholders are keyed by layout ordinal, which only exists once the layout did.
        this._glyphSpans();
        if (uiTransform && (uiTransform.width !== layout.width || uiTransform.height !== layout.height)) {
            uiTransform.setContentSize(layout.width, layout.height);
        }

        const cells: (AirGlyphCell | null)[] = [];
        const visible: AirGlyphInfo[] = [];
        const windowEnd = this._firstVisible + this._maxVisible;
        for (let index = this._firstVisible; index < Math.min(layout.glyphs.length, windowEnd); index++) {
            const glyph = layout.glyphs[index];
            visible.push(glyph);
            // Icon placeholders keep a rect but never enter the glyph atlas.
            cells.push(this._iconOrdinals.has(index) ? null : this._atlas.obtain(glyph.char, this._fontSize));
        }
        const frame = this._atlas.upload();

        const positions: number[] = [];
        const uvs: number[] = [];
        const alphas: number[] = [];
        const indices: number[] = [];
        const rects: (AirGlyphRect | null)[] = new Array(layout.glyphs.length).fill(null);
        const blockLeft = -anchorX * layout.width;
        // A UITransform box spans [-anchorY*height, (1-anchorY)*height]; only the centre anchor is
        // symmetric, so the top edge needs the (1-anchorY) term or the block lands above the node.
        const blockTop = (1 - anchorY) * layout.height;

        for (let n = 0; n < visible.length; n++) {
            const glyph = visible[n];
            const ordinal = this._firstVisible + n;
            const lineWidth = layout.lineWidths[glyph.line] || 0;
            const lineShift =
                this._horizontalAlign === 'center' ? (layout.width - lineWidth) / 2 :
                this._horizontalAlign === 'right' ? layout.width - lineWidth : 0;
            const left = blockLeft + lineShift + glyph.x;
            const top = blockTop - glyph.y;
            const bottom = top - glyph.height;
            if (this._iconOrdinals.has(ordinal)) {
                rects[ordinal] = { x: left, y: bottom, width: glyph.width, height: glyph.height };
                continue;
            }
            const cell = cells[n];
            const vertexStart = positions.length / 2;
            positions.push(left, bottom, left + glyph.width, bottom, left, top, left + glyph.width, top);
            if (cell && frame) {
                const u0 = cell.x / ATLAS_SIZE;
                const u1 = (cell.x + cell.width) / ATLAS_SIZE;
                // Canvas rows run top-down; texture v runs bottom-up within the frame.
                const v0 = 1 - (cell.y + cell.height) / ATLAS_SIZE;
                const v1 = 1 - cell.y / ATLAS_SIZE;
                uvs.push(u0, v0, u1, v0, u0, v1, u1, v1);
            } else {
                uvs.push(0, 0, 0, 0, 0, 0, 0, 0);
            }
            const alpha = this._alphas?.[ordinal] ?? 1;
            alphas.push(alpha, alpha, alpha, alpha);
            indices.push(vertexStart, vertexStart + 1, vertexStart + 2, vertexStart + 2, vertexStart + 1, vertexStart + 3);
            rects[ordinal] = { x: left, y: bottom, width: glyph.width, height: glyph.height };
        }
        this._rects = rects;
        this._mesh = { positions, uvs, alphas, indices };
    }

    /** Releases the atlas and its GPU texture. The node itself is left alone. */
    dispose (): void {
        if (this._disposed) return;
        this._disposed = true;
        this._atlas.destroy();
        this._mesh = null;
        this._rects = null;
        this.destroyRenderData();
    }

    public onDestroy (): void {
        this.dispose();
        super.onDestroy();
    }

    protected _flushAssembler (): void {
        this._assembler = assembler;
        this.markForUpdateRenderData();
    }

    protected _canRender (): boolean {
        return super._canRender() && !this._disposed && !!this._atlas.frame && this._tags.text.length > 0;
    }

    protected _render (renderer: IBatcher): void {
        renderer.commitComp(this, this.renderData, this._atlas.frame, assembler, null);
    }

    /**
     * Parser output re-expressed in the index space every public accessor uses: layout ordinals.
     * A markup boundary that lands on a dropped line feed or folded trailing space walks to the
     * nearest glyph that survived, so a span can never name an ordinal past `characterCount`.
     */
    private _glyphSpans (): AirGlyphTaggedText {
        if (this._spans) return this._spans;
        const glyphs = this.layout().glyphs;
        const last = glyphs.length - 1;
        const ordinalFor = (displayIndex: number): number | null => {
            const direct = this._ordinalBySource?.get(displayIndex);
            if (direct !== undefined) return direct;
            for (let step = 1; step <= 8; step++) {
                const before = this._ordinalBySource?.get(displayIndex - step);
                if (before !== undefined) return before;
                const after = this._ordinalBySource?.get(displayIndex + step);
                if (after !== undefined) return after;
            }
            return null;
        };
        const icons: AirGlyphIconSlot[] = [];
        for (const slot of this._tags.icons) {
            const ordinal = ordinalFor(slot.ordinal);
            if (ordinal !== null) icons.push({ ...slot, ordinal });
        }
        const links: AirGlyphLinkSpan[] = [];
        for (const span of this._tags.links) {
            const start = ordinalFor(span.start);
            const end = ordinalFor(span.end);
            if (start === null && end === null) continue;
            const lo = Math.min(start ?? end!, end ?? start!);
            const hi = Math.max(start ?? end!, end ?? start!);
            if (lo <= last && hi >= 0) links.push({ id: span.id, start: lo, end: Math.min(hi, last) });
        }
        this._iconOrdinals = new Set(icons.map((icon) => icon.ordinal));
        this._spans = { text: this._tags.text, icons, links };
        return this._spans;
    }

    private _invalidate (): void {
        if (this._disposed) return;
        this._layout = null;
        this._ordinalBySource = null;
        this._spans = null;
        this._alphas = null;
        this._invalidateMesh();
    }

    private _invalidateMesh (): void {
        if (this._disposed) return;
        this._mesh = null;
        this._meshAnchor = null;
        this._rects = null;
        this._revision++;
        this.markForUpdateRenderData();
    }
}
