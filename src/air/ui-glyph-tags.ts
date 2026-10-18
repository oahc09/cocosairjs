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
 * Cocos Air — inline tag subset for `AirGlyphText` (AIR original, no upstream counterpart).
 *
 * Grammar mirrors what the reversed build actually emits through TextMeshPro:
 * ` <link="<id>"><sprite name="<n>" tint=1></link>` — a hover target wrapping an inline icon.
 * TMP's own parser accepts more (`<color>`, `<size>`, `<font>`, `<mspace>`, …); this subset is
 * deliberately narrow, and anything it does not recognise stays literal text rather than being
 * swallowed, so a typo in authored content shows up on screen instead of vanishing.
 *
 * Only the two link forms the game uses are supported: `<link="id">` / `<link=id>` and `</link>`.
 * Sprites accept `<sprite name="n" tint=1>`, `<sprite=n>` and any attribute order; unknown
 * attributes are ignored the way TMP ignores them.
 */
import { getSymbolLength } from '../cocos/2d/utils/text-utils';

function fail (message: string): never {
    const error = new Error(`AIR_E_GLYPH_TAGS: ${message}`);
    Object.assign(error, { code: 'AIR_E_GLYPH_TAGS' });
    throw error;
}

/** One grapheme (U+FFFC OBJECT REPLACEMENT CHARACTER) standing in for an inline sprite in the display string. */
export const AIR_ICON_PLACEHOLDER = String.fromCharCode(0xfffc);

export interface AirGlyphIconSlot {
    /**
     * Grapheme index in the *display string* the parser returns. `AirGlyphText.tags` hands out the
     * same slots with this re-expressed as a layout ordinal — the index `getCharacterRect` uses —
     * because layout drops line feeds and the trailing spaces it folds away.
     */
    readonly ordinal: number;
    readonly name: string;
    /** TMP `tint=1`: paint with the text colour. `tint=0` keeps the sprite as authored. */
    readonly tint: boolean;
    /** Id of the innermost `<link>` wrapping this sprite, or null when it is not a target. */
    readonly linkId: string | null;
}

export interface AirGlyphLinkSpan {
    readonly id: string;
    /** First and last display-string grapheme owned by the span, inclusive; see `AirGlyphIconSlot.ordinal`. */
    readonly start: number;
    readonly end: number;
}

export interface AirGlyphTaggedText {
    /** Tags removed, each sprite replaced by one `AIR_ICON_PLACEHOLDER` grapheme. */
    readonly text: string;
    readonly icons: ReadonlyArray<AirGlyphIconSlot>;
    readonly links: ReadonlyArray<AirGlyphLinkSpan>;
}

const EMPTY: AirGlyphTaggedText = Object.freeze({
    text: '',
    icons: Object.freeze([]) as ReadonlyArray<AirGlyphIconSlot>,
    links: Object.freeze([]) as ReadonlyArray<AirGlyphLinkSpan>,
});

const LINK_OPEN = /^<link\s*=\s*(?:"([^"]*)"|'([^']*)'|([^>\s]+))\s*>/i;
const LINK_CLOSE = /^<\/link\s*>/i;
const SPRITE = /^<sprite\b([^>]*)>/i;

function firstGroup (match: RegExpMatchArray): string {
    return match[1] ?? match[2] ?? match[3] ?? '';
}

/** Reads `key="value"` pairs, plus the leading `=value` shorthand TMP allows on `<sprite=0>`. */
function readSprite (body: string): { name: string; tint: boolean } {
    const attrs = new Map<string, string>();
    let rest = body;
    const positional = /^=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/.exec(rest);
    if (positional) {
        attrs.set('name', firstGroup(positional));
        rest = rest.slice(positional[0].length);
    }
    const pair = /([A-Za-z_]\w*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let match: RegExpExecArray | null;
    while ((match = pair.exec(rest))) attrs.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
    const name = attrs.get('name') ?? '';
    if (!name) fail(`sprite tag has no name: <sprite${body}>`);
    const tint = attrs.has('tint') ? attrs.get('tint') !== '0' : true;
    return { name, tint };
}

/**
 * Pure and total: no engine state, so the whole grammar is testable without a renderer.
 * An unbalanced tag is an error instead of a silent drop — dialogue text is authored by hand and a
 * swallowed `</link>` would otherwise hide a whole hover target.
 */
export function parseAirGlyphTags (source: string): AirGlyphTaggedText {
    if (!source) return EMPTY;
    let display = '';
    let ordinals = 0;
    let cursor = 0;
    const icons: AirGlyphIconSlot[] = [];
    const links: AirGlyphLinkSpan[] = [];
    const open: { id: string; start: number }[] = [];

    const append = (chunk: string): void => {
        if (!chunk) return;
        display += chunk;
        ordinals += getSymbolLength(chunk);
    };

    while (cursor < source.length) {
        const mark = source.indexOf('<', cursor);
        if (mark < 0) {
            append(source.slice(cursor));
            break;
        }
        append(source.slice(cursor, mark));
        const head = source.slice(mark);
        const linkOpen = LINK_OPEN.exec(head);
        const linkClose = linkOpen ? null : LINK_CLOSE.exec(head);
        const spriteTag = linkOpen || linkClose ? null : SPRITE.exec(head);
        if (linkOpen) {
            const id = firstGroup(linkOpen);
            if (!id) fail(`link tag has no id: ${linkOpen[0]}`);
            open.push({ id, start: ordinals });
            cursor = mark + linkOpen[0].length;
            continue;
        }
        if (linkClose) {
            const span = open.pop();
            if (!span) fail(`</link> without a matching <link> in ${JSON.stringify(source.slice(0, 40))}`);
            // A span with no glyph inside can never be hit, so it is dropped rather than stored.
            if (ordinals - 1 >= span.start) links.push({ id: span.id, start: span.start, end: ordinals - 1 });
            cursor = mark + linkClose[0].length;
            continue;
        }
        if (spriteTag) {
            const { name, tint } = readSprite(spriteTag[1].trim());
            append(AIR_ICON_PLACEHOLDER);
            icons.push({ ordinal: ordinals - 1, name, tint, linkId: open.length ? open[open.length - 1].id : null });
            cursor = mark + spriteTag[0].length;
            continue;
        }
        append('<');
        cursor = mark + 1;
    }

    if (open.length) fail(`unclosed <link="${open[open.length - 1].id}">`);
    return { text: display, icons, links };
}
