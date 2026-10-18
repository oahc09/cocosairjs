import { Node } from '../../src/cocos/scene-graph/node';
import { createAirApp } from '../../src';
import { Scene } from '../../src/cocos/scene-graph/scene';
import { director } from '../../src/cocos/game/director';
import { UITransform } from '../../src/cocos/2d/framework/ui-transform';
import { Color } from '../../src/cocos/core/math';
import { AirGlyphText, layoutAirGlyphs, measureAirGlyphFallback } from '../../src/air/ui-glyph-text';

/** Fixed-width measurer: every grapheme is exactly `fontSize` wide. */
const square = (grapheme: string, fontSize: number): number => (grapheme === ' ' ? fontSize * 0.5 : fontSize);

function glyphNode(name = 'glyph-node'): { node: Node; text: AirGlyphText } {
    const node = new Node(name);
    const transform = node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    const text = node.addComponent(AirGlyphText);
    text.setMeasurer(square);
    return { node, text };
}

describe('layoutAirGlyphs (pure)', () => {
    test('empty string yields one zero-width line, no glyphs', () => {
        const layout = layoutAirGlyphs('', { fontSize: 40 });
        expect(layout.glyphs).toEqual([]);
        expect(layout.lineCount).toBe(1);
        expect(layout.width).toBe(0);
        expect(layout.height).toBe(50);
    });

    test('lineHeight defaults to ceil(fontSize * 1.25)', () => {
        const layout = layoutAirGlyphs('ab\nab', { fontSize: 33, measure: square });
        expect(layout.height).toBe(Math.ceil(33 * 1.25) * 2);
        expect(layout.glyphs[2].y).toBe(Math.ceil(33 * 1.25) + (Math.ceil(33 * 1.25) - 33) / 2 - 2);
    });

    test('grapheme clusters are never split', () => {
        const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
        const layout = layoutAirGlyphs(`a${family}b`, { fontSize: 20, measure: square });
        expect(layout.glyphs.map((glyph) => glyph.char)).toEqual(['a', family, 'b']);
        expect(layout.glyphs[1].sourceIndex).toBe(1);
        expect(layout.glyphs[2].sourceIndex).toBe(2);
    });

    test('pen advances by advance + letterSpacing', () => {
        const layout = layoutAirGlyphs('abc', { fontSize: 10, letterSpacing: 3, measure: square });
        expect(layout.glyphs.map((glyph) => glyph.x)).toEqual([-2, 11, 24]);
        // No trailing spacing is counted: 3 advances plus the 2 gaps between them.
        expect(layout.width).toBe(36);
    });

    test('wrapping breaks at the last breakable grapheme and drops the trailing space', () => {
        const layout = layoutAirGlyphs('ab cd ef', { fontSize: 10, maxWidth: 25, measure: square });
        expect(layout.lineCount).toBe(3);
        expect(layout.glyphs.filter((glyph) => glyph.line === 0).map((glyph) => glyph.char)).toEqual(['a', 'b']);
        expect(layout.glyphs.filter((glyph) => glyph.line === 1).map((glyph) => glyph.char)).toEqual(['c', 'd']);
        expect(layout.glyphs.map((glyph) => glyph.char).join('')).toBe('abcdef');
        for (let line = 0; line < layout.lineCount; line++) {
            expect(layout.lineWidths[line]).toBeLessThanOrEqual(25);
        }
    });

    test('CJK breaks anywhere, so an unbroken CJK run still wraps', () => {
        const layout = layoutAirGlyphs('你好世界', { fontSize: 10, maxWidth: 25, measure: square });
        expect(layout.lineCount).toBe(2);
        expect(layout.glyphs.filter((glyph) => glyph.line === 0).length).toBe(2);
    });

    test('a word longer than the box hard-cuts instead of looping', () => {
        const layout = layoutAirGlyphs('abcdefgh', { fontSize: 10, maxWidth: 4, measure: square });
        expect(layout.glyphs.length).toBe(8);
        expect(layout.lineCount).toBeGreaterThan(1);
        expect(layout.lineCount).toBeLessThanOrEqual(8);
    });

    test('explicit newline wins over wrapping and is skipped by the glyph order', () => {
        const layout = layoutAirGlyphs('ab\ncd', { fontSize: 10, maxWidth: 100, measure: square });
        expect(layout.lineCount).toBe(2);
        // sourceIndex counts every grapheme, so the line feed leaves a gap behind.
        expect(layout.glyphs.map((glyph) => glyph.sourceIndex)).toEqual([0, 1, 3, 4]);
        expect(layout.glyphs.map((glyph) => glyph.char)).toEqual(['a', 'b', 'c', 'd']);
        expect(layout.glyphs[2].y).toBeGreaterThan(layout.glyphs[1].y);
    });

    test('only a line feed marks a line start — soft wraps and dropped spaces do not', () => {
        const flags = (layout: { glyphs: ReadonlyArray<{ afterLineFeed: boolean }> }): boolean[] =>
            layout.glyphs.map((glyph) => glyph.afterLineFeed);
        const wrapped = layoutAirGlyphs('ab cd', { fontSize: 10, maxWidth: 25, measure: square });
        expect(wrapped.lineCount).toBe(2);
        expect(flags(wrapped)).toEqual([false, false, false, false]);
        expect(wrapped.glyphs.map((glyph) => glyph.sourceIndex)).toEqual([0, 1, 3, 4]);
        expect(flags(layoutAirGlyphs('ab\ncd', { fontSize: 10, measure: square }))).toEqual([
            false,
            false,
            true,
            false,
        ]);
        expect(flags(layoutAirGlyphs('\nab', { fontSize: 10, measure: square }))).toEqual([true, false]);
    });

    test('rejects a non-positive font size and an over-long string', () => {
        expect(() => layoutAirGlyphs('a', { fontSize: 0 })).toThrow('AIR_E_GLYPH_TEXT');
        const huge = 'a'.repeat(4097);
        expect(() => layoutAirGlyphs(huge, { fontSize: 4 })).toThrow('AIR_E_GLYPH_TEXT');
    });

    test('the fallback measurer is width-ordered: space < latin < CJK', () => {
        const size = 40;
        expect(measureAirGlyphFallback(' ', size)).toBeLessThan(measureAirGlyphFallback('m', size));
        expect(measureAirGlyphFallback('m', size)).toBeLessThan(measureAirGlyphFallback('中', size));
    });
});

describe('AirGlyphText', () => {
    let app: Awaited<ReturnType<typeof createAirApp>>;

    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });

    afterAll(async () => {
        await app.close?.();
    });

    test('writes its natural size back to UITransform', () => {
        const { node, text } = glyphNode();
        text.fontSize = 10;
        text.string = 'abcd';
        const transform = node.getComponent(UITransform)!;
        text.rebuild();
        expect([transform.width, transform.height]).toEqual([40, 13]);
        node.destroy();
    });

    test('maxVisibleCharacters reveals without reflowing the layout', () => {
        const { node, text } = glyphNode();
        text.fontSize = 10;
        text.string = 'abcd';
        expect(text.characterCount).toBe(4);
        const before = text.glyphAt(3);
        expect(before).not.toBeNull();

        text.maxVisibleCharacters = 2;
        expect(text.isCharacterVisible(0)).toBe(true);
        expect(text.isCharacterVisible(1)).toBe(true);
        expect(text.isCharacterVisible(2)).toBe(false);
        expect(text.glyphAt(3)!.x).toBe(before!.x);
        expect(text.meshData!.positions.length / 2).toBe(8);

        text.maxVisibleCharacters = Infinity;
        expect(text.isCharacterVisible(3)).toBe(true);
        expect(text.meshData!.positions.length / 2).toBe(16);
        node.destroy();
    });

    test('glyph indices survive a line feed, which is not a glyph', () => {
        const { node, text } = glyphNode();
        text.fontSize = 10;
        text.string = 'ab\ncd';
        expect(text.characterCount).toBe(4);
        expect(text.glyphAt(2)!.char).toBe('c');
        expect(text.getCharacterRect(2)).not.toBeNull();
        expect(text.getCharacterRect(3)).not.toBeNull();
        expect(text.isLineStartFromBreak(2)).toBe(true);
        expect(text.isLineStartFromBreak(1)).toBe(false);
        text.setCharacterAlpha(2, 0.5);
        text.rebuild();
        expect(text.meshData!.alphas.slice(8, 12)).toEqual([0.5, 0.5, 0.5, 0.5]);
        node.destroy();
    });

    test('firstVisibleCharacter moves the reveal window, not the glyphs', () => {
        const { node, text } = glyphNode();
        text.fontSize = 10;
        text.string = 'abcd';
        const xOf = (i: number): number => text.glyphAt(i)!.x;
        const x2 = xOf(2);
        text.firstVisibleCharacter = 2;
        expect(text.isCharacterVisible(1)).toBe(false);
        expect(text.isCharacterVisible(2)).toBe(true);
        expect(xOf(2)).toBe(x2);
        expect(text.getCharacterRect(2)!.x).toBeCloseTo(x2 - 20, 6);
        node.destroy();
    });

    test('per-glyph alpha reaches the vertex colours and is validated', () => {
        const { node, text } = glyphNode();
        text.fontSize = 10;
        text.string = 'ab';
        text.rebuild();
        expect(text.meshData!.alphas).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
        text.setCharacterAlpha(1, 0.25);
        text.rebuild();
        expect(text.meshData!.alphas.slice(4)).toEqual([0.25, 0.25, 0.25, 0.25]);
        expect(text.getCharacterAlpha(1)).toBe(0.25);
        expect(() => text.setCharacterAlpha(0, 2)).toThrow('AIR_E_GLYPH_TEXT');
        expect(() => text.setCharacterAlpha(9, 0.5)).toThrow('AIR_E_GLYPH_TEXT');
        text.clearCharacterAlphas();
        text.rebuild();
        expect(text.meshData!.alphas.every((alpha) => alpha === 1)).toBe(true);
        node.destroy();
    });

    test('horizontalAlign shifts short lines inside the block without moving the block', () => {
        const { node, text } = glyphNode();
        text.fontSize = 10;
        text.string = 'abcd\ne';
        text.horizontalAlign = 'left';
        const leftRect = text.getCharacterRect(4)!;
        text.horizontalAlign = 'center';
        const centerRect = text.getCharacterRect(4)!;
        text.horizontalAlign = 'right';
        const rightRect = text.getCharacterRect(4)!;
        expect(centerRect.x).toBeGreaterThan(leftRect.x);
        expect(rightRect.x).toBeGreaterThan(centerRect.x);
        expect(rightRect.x - leftRect.x).toBeCloseTo(30, 6);
        expect(leftRect.x).toBeCloseTo(-22, 6);
        expect(text.getCharacterRect(0)!.x).toBeCloseTo(-22, 6);
        node.destroy();
    });

    test('the block hangs from the anchor, not above it', () => {
        const { node, text } = glyphNode();
        const transform = node.getComponent(UITransform)!;
        text.fontSize = 10;
        text.string = 'abcd\ne';
        // A centre anchor is symmetric, so it cannot tell these two conventions apart; the replica
        // places its dialogue box with (0,1) and the first attempt drew the text above the node.
        transform.setAnchorPoint(0, 1);
        const topAligned = [0, 1, 2, 3, 4].map((index) => text.getCharacterRect(index)!);
        // The padded cell of the first line may overhang the line box by a pixel; what must not
        // happen is the whole block sitting above the anchor.
        expect(Math.max(...topAligned.map((rect) => rect.y + rect.height))).toBeLessThanOrEqual(1);
        transform.setAnchorPoint(0, 0);
        const bottomAligned = [0, 1, 2, 3, 4].map((index) => text.getCharacterRect(index)!);
        expect(Math.min(...bottomAligned.map((rect) => rect.y))).toBeGreaterThanOrEqual(-1);
        expect(bottomAligned[0].y - topAligned[0].y).toBeCloseTo(text.layout().height, 6);
        node.destroy();
    });

    test('rejects unknown alignment values and negative maxWidth', () => {
        const { node, text } = glyphNode();
        expect(() => {
            text.horizontalAlign = 'justify' as any;
        }).toThrow('AIR_E_GLYPH_TEXT');
        expect(() => {
            text.maxWidth = -1;
        }).toThrow('AIR_E_GLYPH_TEXT');
        node.destroy();
    });

    test('headless: layout is real, but no glyph atlas exists so nothing can render', () => {
        const { node, text } = glyphNode();
        text.fontSize = 10;
        text.string = 'ab';
        expect(text.spriteFrame).toBeNull();
        const scene = new Scene('glyph-scene');
        node.layer = 1 << 25;
        scene.addChild(node);
        app.run(scene);
        expect(() => director.tick(0)).not.toThrow();
        expect(text.spriteFrame).toBeNull();
        node.destroy();
    });

    test('dispose releases the mesh and further writes are inert', () => {
        const { node, text } = glyphNode();
        text.fontSize = 10;
        text.string = 'ab';
        text.rebuild();
        expect(text.meshData).not.toBeNull();
        text.dispose();
        expect(text.disposed).toBe(true);
        expect(text.meshData).toBeNull();
        expect(() => text.rebuild()).not.toThrow();
        node.destroy();
    });

    test('colour is read from the renderer, so tinting stays a per-vertex multiply', () => {
        const { node, text } = glyphNode();
        text.color = new Color(10, 20, 30, 200);
        text.fontSize = 10;
        text.string = 'a';
        text.rebuild();
        expect(text.color.a).toBe(200);
        node.destroy();
    });
});
