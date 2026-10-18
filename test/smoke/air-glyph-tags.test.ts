import { Node } from '../../src/cocos/scene-graph/node';
import { createAirApp } from '../../src';
import { Rect, Size } from '../../src/cocos/core/math';
import { UITransform } from '../../src/cocos/2d/framework/ui-transform';
import { Sprite } from '../../src/cocos/2d/components/sprite';
import { SpriteFrame } from '../../src/cocos/2d/assets/sprite-frame';
import { Texture2D } from '../../src/cocos/asset/assets/texture-2d';
import { AirGlyphText, measureAirGlyphFallback } from '../../src/air/ui-glyph-text';
import { AirGlyphIconLayer } from '../../src/air/ui-glyph-icons';
import { AIR_ICON_PLACEHOLDER, parseAirGlyphTags } from '../../src/air/ui-glyph-tags';

const square = (grapheme: string, fontSize: number): number => (grapheme === ' ' ? fontSize * 0.5 : fontSize);

function frameOf(width: number, height: number): SpriteFrame {
    const texture = new Texture2D();
    texture.reset({ width, height });
    const frame = new SpriteFrame();
    frame.reset({ texture, rect: new Rect(0, 0, width, height), originalSize: new Size(width, height) });
    return frame;
}

// One runtime for the whole file: `createAirApp` refuses a second live app in the same document.
let app: Awaited<ReturnType<typeof createAirApp>>;

beforeAll(async () => {
    document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
    app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
});

afterAll(async () => {
    await app.close?.();
});

describe('parseAirGlyphTags (pure)', () => {
    test('plain text passes through, and a lone angle bracket stays literal', () => {
        const plain = parseAirGlyphTags('hello world');
        expect(plain.text).toBe('hello world');
        expect(plain.icons).toEqual([]);
        expect(plain.links).toEqual([]);
        expect(parseAirGlyphTags('a < b > c').text).toBe('a < b > c');
        expect(parseAirGlyphTags('').text).toBe('');
    });

    test('link tags occupy no glyphs', () => {
        const parsed = parseAirGlyphTags('go <link="GO">now</link>');
        expect(parsed.text).toBe('go now');
        expect(parsed.links).toEqual([{ id: 'GO', start: 3, end: 5 }]);
        // TMP links have no self-closing form; `</link>` is mandatory even when the span is empty.
        expect(() => parseAirGlyphTags('<link=all>')).toThrow('AIR_E_GLYPH_TAGS');
        expect(parseAirGlyphTags('<link=all>x</link>').links[0].id).toBe('all');
    });

    test('the shape the reversed build emits: a sprite wrapped in a link', () => {
        const parsed = parseAirGlyphTags(' <link="MY_ICON"><sprite name="arrow" tint=1></link>');
        expect(parsed.text).toBe(` ${AIR_ICON_PLACEHOLDER}`);
        expect(parsed.icons).toEqual([{ ordinal: 1, name: 'arrow', tint: true, linkId: 'MY_ICON' }]);
        expect(parsed.links).toEqual([{ id: 'MY_ICON', start: 1, end: 1 }]);
    });

    test('sprite grammar: positional name, attribute order, tint default and off', () => {
        expect(parseAirGlyphTags('<sprite=3>').icons[0].name).toBe('3');
        expect(parseAirGlyphTags('<sprite  name="a"   tint = 0 >').icons[0]).toEqual({
            ordinal: 0,
            name: 'a',
            tint: false,
            linkId: null,
        });
        expect(parseAirGlyphTags('<sprite tint=1 name="b"></sprite>').icons[0].tint).toBe(true);
    });

    test('unrecognised markup is not swallowed', () => {
        const parsed = parseAirGlyphTags('<color=#fff>red</color> and <b>bold</b>');
        expect(parsed.text).toBe('<color=#fff>red</color> and <b>bold</b>');
        expect(parsed.links).toEqual([]);
    });

    test('link spans count graphemes, not UTF-16 units', () => {
        const parsed = parseAirGlyphTags('<link=x>😀a</link>');
        expect(parsed.links).toEqual([{ id: 'x', start: 0, end: 1 }]);
    });

    test('nested links each keep their own span; an empty span is dropped', () => {
        const parsed = parseAirGlyphTags('<link=a>x<link=b>y</link>z</link>');
        expect(parsed.links).toEqual([
            { id: 'b', start: 1, end: 1 },
            { id: 'a', start: 0, end: 2 },
        ]);
        expect(parseAirGlyphTags('<link=a></link>x').links).toEqual([]);
    });

    test('malformed markup fails instead of silently dropping a hover target', () => {
        expect(() => parseAirGlyphTags('x</link>')).toThrow('AIR_E_GLYPH_TAGS');
        expect(() => parseAirGlyphTags('<link=a>x')).toThrow('AIR_E_GLYPH_TAGS');
        expect(() => parseAirGlyphTags('<link="">x</link>')).toThrow('AIR_E_GLYPH_TAGS');
        expect(() => parseAirGlyphTags('<sprite tint=1>')).toThrow('AIR_E_GLYPH_TAGS');
    });

    test('the placeholder reserves a full em so an icon cannot collapse the line', () => {
        expect(measureAirGlyphFallback(AIR_ICON_PLACEHOLDER, 40)).toBe(40);
    });
});

describe('AirGlyphText tags, hover and icon rects', () => {
    function textNode(source: string): { node: Node; text: AirGlyphText } {
        const node = new Node('tag-node');
        node.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
        const text = node.addComponent(AirGlyphText);
        text.setMeasurer(square);
        text.fontSize = 10;
        text.string = source;
        return { node, text };
    }

    test('the icon placeholder gets a rect and no geometry', () => {
        const { node, text } = textNode('a<sprite name="i">b');
        expect(text.characterCount).toBe(3);
        expect(text.tags.icons[0].ordinal).toBe(1);
        const iconRect = text.getCharacterRect(1)!;
        expect(iconRect.width).toBe(14);
        expect(text.meshData!.positions.length / 2).toBe(8);
        expect(text.meshData!.indices.length).toBe(12);
        node.destroy();
    });

    test('hover resolves the link under the point and reports enter/stay/exit', () => {
        const { node, text } = textNode('go <link="GO">now</link>');
        const log: string[] = [];
        text.onLinkEnter = (id): void => void log.push(`enter:${id}`);
        text.onLinkStay = (id): void => void log.push(`stay:${id}`);
        text.onLinkExit = (id): void => void log.push(`exit:${id}`);
        const inside = { x: text.getCharacterRect(4)!.x + 1, y: 0 };
        expect(text.linkIdAtPoint(inside)).toBe('GO');
        expect(text.updatePointer(inside)).toBe('GO');
        expect(text.updatePointer(inside)).toBe('GO');
        expect(text.hoveredLink).toBe('GO');
        expect(text.updatePointer({ x: -1000, y: 0 })).toBeNull();
        expect(text.updatePointer(null)).toBeNull();
        expect(log).toEqual(['enter:GO', 'stay:GO', 'stay:GO', 'exit:GO']);
        node.destroy();
    });

    test('hovering the wrapped icon hits the same link, and a hidden glyph cannot be hit', () => {
        const { node, text } = textNode('<link="I"><sprite name="i" tint=1></link>');
        const icon = text.tags.icons[0];
        const rect = text.getCharacterRect(icon.ordinal)!;
        expect(text.linkIdAtPoint({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })).toBe('I');
        text.maxVisibleCharacters = 0;
        expect(text.getCharacterRect(icon.ordinal)).toBeNull();
        expect(text.linkIdAtPoint({ x: rect.x, y: rect.y })).toBeNull();
        node.destroy();
    });

    test('a replaced string drops the old hover target at once', () => {
        const { node, text } = textNode('<link="A">x</link>');
        text.updatePointer({ x: text.getCharacterRect(0)!.x + 1, y: 0 });
        expect(text.hoveredLink).toBe('A');
        text.string = '<link="B">y</link>';
        expect(text.hoveredLink).toBeNull();
        expect(text.tags.links[0].id).toBe('B');
        node.destroy();
    });

    test('line feeds shift tag ordinals into the layout index space', () => {
        // Layout drops both `\n`, so display ordinals 3..4 and 6 are glyph ordinals 2..3 and 4.
        const { node, text } = textNode('ab\n<link=x>cd</link>\n<sprite name="s">e');
        expect(text.characterCount).toBe(6);
        expect(text.tags.links).toEqual([{ id: 'x', start: 2, end: 3 }]);
        expect(text.tags.icons[0].ordinal).toBe(4);
        expect(text.glyphAt(2)!.char).toBe('c');
        expect(text.glyphAt(4)!.char).toBe(AIR_ICON_PLACEHOLDER);
        const rect = text.getCharacterRect(3)!;
        expect(text.linkIdAtPoint({ x: rect.x + 1, y: rect.y + 1 })).toBe('x');
        // The parser itself keeps counting display graphemes: the translation is the component's job.
        expect(parseAirGlyphTags('ab\n<link=x>cd</link>').links).toEqual([{ id: 'x', start: 3, end: 4 }]);
        node.destroy();
    });
});

describe('AirGlyphIconLayer', () => {
    function iconRig(source: string): { node: Node; text: AirGlyphText; icons: AirGlyphIconLayer } {
        const node = new Node('icon-node');
        node.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
        const text = node.addComponent(AirGlyphText);
        text.setMeasurer(square);
        text.fontSize = 10;
        text.string = source;
        const icons = node.addComponent(AirGlyphIconLayer);
        return { node, text, icons };
    }

    test('requires the glyph renderer and validates the frames it is given', () => {
        const { node, icons } = iconRig('a');
        expect(icons.glyphText).toBe(node.getComponent(AirGlyphText));
        expect(() => icons.setFrames('bad', {} as SpriteFrame)).toThrow('AIR_E_GLYPH_ICONS');
        expect(icons.frameFor('missing')).toBeNull();
        node.destroy();
    });

    test('refreshes late, replaced and removed frames without changing the text', () => {
        const { node, text, icons } = iconRig('<sprite name="i">');
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const first = frameOf(16, 16);
        const second = frameOf(32, 16);
        try {
            (icons as any).update();
            const child = node.getChildByName('icon-0')!;
            const sprite = child.getComponent(Sprite)!;
            const revision = text.meshRevision;
            expect(child.active).toBe(false);
            icons.setFrames('i', first);
            (icons as any).update();
            expect(child.active).toBe(true);
            expect(sprite.spriteFrame).toBe(first);
            icons.setFrames('i', second);
            (icons as any).update();
            expect(sprite.spriteFrame).toBe(second);
            expect(child.getComponent(UITransform)!.width).toBeCloseTo(text.getCharacterRect(0)!.height * 2, 6);
            icons.setFrames('i', null);
            (icons as any).update();
            expect(child.active).toBe(false);
            expect(sprite.spriteFrame).toBeNull();
            expect(text.meshRevision).toBe(revision);
        } finally {
            node.destroy();
            first.destroy();
            first.texture.destroy();
            second.destroy();
            second.texture.destroy();
            warn.mockRestore();
        }
    });

    test('places one sprite per slot at the reserved rect, aspect preserved', () => {
        const { node, text, icons } = iconRig('a<sprite name="i">b');
        icons.setFrames('i', frameOf(64, 32));
        icons.sync();
        const child = node.getChildByName('icon-1')!;
        expect(child.active).toBe(true);
        const rect = text.getCharacterRect(1)!;
        expect([child.position.x, child.position.y]).toEqual([rect.x + rect.width / 2, rect.y + rect.height / 2]);
        const ui = child.getComponent(UITransform)!;
        // Height follows the line box (fontSize + padding); width follows the frame's own ratio.
        expect(ui.height).toBeCloseTo(rect.height, 6);
        expect(ui.width).toBeCloseTo(rect.height * 2, 6);
        expect(child.getComponent(Sprite)!.spriteFrame).not.toBeNull();
        expect(child.layer).toBe(node.layer);
        node.destroy();
    });

    test('an unregistered name hides the slot and warns once', () => {
        const { node, icons } = iconRig('<sprite name="missing">');
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        icons.sync();
        icons.sync();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(node.getChildByName('icon-0')!.active).toBe(false);
        warn.mockRestore();
        node.destroy();
    });

    test('slots follow the reveal window and stale ones are destroyed', () => {
        const { node, text, icons } = iconRig('<sprite name="i"><sprite name="i">');
        icons.setFrames('i', frameOf(16, 16));
        icons.sync();
        expect(icons.slotCount).toBe(2);
        text.maxVisibleCharacters = 1;
        icons.sync();
        expect(node.getChildByName('icon-0')!.active).toBe(true);
        expect(node.getChildByName('icon-1')!.active).toBe(false);
        text.string = 'plain';
        icons.sync();
        expect(icons.slotCount).toBe(0);
        node.destroy();
    });

    test('tint=1 takes the text colour, tint=0 stays as authored', () => {
        const { node, text, icons } = iconRig('<sprite name="a" tint=1><sprite name="b" tint=0>');
        icons.setFrames('a', frameOf(16, 16));
        icons.setFrames('b', frameOf(16, 16));
        text.color.fromHEX('#80ff00');
        icons.sync();
        const tinted = node.getChildByName('icon-0')!.getComponent(Sprite)!;
        const authored = node.getChildByName('icon-1')!.getComponent(Sprite)!;
        expect([tinted.color.r, tinted.color.g, tinted.color.b]).toEqual([text.color.r, text.color.g, text.color.b]);
        expect([authored.color.r, authored.color.g, authored.color.b]).toEqual([255, 255, 255]);
        node.destroy();
    });

    test('reusing a slot keeps its node and dispose releases every slot', () => {
        const { node, text, icons } = iconRig('<sprite name="i">');
        icons.setFrames('i', frameOf(16, 16));
        icons.sync();
        const child = node.getChildByName('icon-0')!;
        icons.sync();
        expect(node.getChildByName('icon-0')).toBe(child);
        // update() re-syncs only when the renderer rebuilt — that is the icon/reveal coupling.
        (icons as any).update();
        text.maxVisibleCharacters = 0;
        (icons as any).update();
        expect(child.active).toBe(false);
        icons.dispose();
        expect(icons.slotCount).toBe(0);
        // Node destruction is deferred to the engine's cleanup pass, so the child is only deactivated here.
        expect(node.getChildByName('icon-0')!.active).toBe(false);
        node.destroy();
    });
});
