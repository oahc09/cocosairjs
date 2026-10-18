import { Node } from '../../src/cocos/scene-graph/node';
import { createAirApp } from '../../src';
import { UITransform } from '../../src/cocos/2d/framework/ui-transform';
import { AirGlyphText } from '../../src/air/ui-glyph-text';
import { AirTypewriter } from '../../src/air/ui-typewriter';

const square = (grapheme: string, fontSize: number): number => (grapheme === ' ' ? fontSize * 0.5 : fontSize);

function rig(text: string): { node: Node; glyph: AirGlyphText; writer: AirTypewriter; tick: (dt: number) => void } {
    const node = new Node('type-node');
    node.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
    const glyph = node.addComponent(AirGlyphText);
    glyph.setMeasurer(square);
    glyph.fontSize = 10;
    glyph.string = text;
    const writer = node.addComponent(AirTypewriter);
    const tick = (dt: number): void => {
        (writer as any).update(dt);
        glyph.rebuild();
    };
    return { node, glyph, writer, tick };
}

/** Reveals everything, calling `update` in `step`-sized slices. Returns the tick count used. */
function run(writer: AirTypewriter, glyph: AirGlyphText, step = 0.01, limit = 5000): number {
    let ticks = 0;
    while ((writer.isShowingText || writer.isHidingText) && ticks++ < limit) {
        (writer as any).update(step);
        glyph.rebuild();
    }
    return ticks;
}

describe('AirTypewriter', () => {
    let app: Awaited<ReturnType<typeof createAirApp>>;

    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
    });

    afterAll(async () => {
        await app.close?.();
    });

    test('requires and resolves the glyph renderer on the same node', () => {
        const { node, glyph, writer } = rig('ab');
        expect(writer.glyphText).toBe(glyph);
        expect(node.getComponent(AirGlyphText)).toBe(glyph);
        node.destroy();
    });

    test('reveals one grapheme per wait and stops with everything visible', () => {
        const { node, glyph, writer } = rig('abcd');
        writer.waitForNormalChars = 0.1;
        const visibleCount = (): number => [0, 1, 2, 3].filter((i) => glyph.isCharacterVisible(i)).length;
        const steps: number[] = [];
        writer.showText();
        expect(visibleCount()).toBe(0);
        for (let i = 0; i < 5; i++) {
            (writer as any).update(0.1);
            glyph.rebuild();
            steps.push(visibleCount());
        }
        expect(steps).toEqual([1, 2, 3, 4, 4]);
        expect(writer.isShowingText).toBe(false);
        expect(glyph.maxVisibleCharacters).toBe(Infinity);
        expect(glyph.isCharacterVisible(3)).toBe(true);
        node.destroy();
    });

    test('event order: start, one per character, then showed', () => {
        const { node, glyph, writer } = rig('hi');
        const log: string[] = [];
        writer.waitForNormalChars = 0.05;
        writer.onTypewriterStart = (): void => void log.push('start');
        writer.onCharacterVisible = (ch): void => void log.push(`char:${ch}`);
        writer.onTextShowed = (): void => void log.push('showed');
        writer.showText();
        run(writer, glyph, 0.05);
        expect(log).toEqual(['start', 'char:h', 'char:i', 'showed']);
        node.destroy();
    });

    test('a full stop pauses longer than a plain character', () => {
        const stopped = rig('a.b');
        stopped.writer.waitForNormalChars = 0.1;
        stopped.writer.waitLong = 0.4;
        stopped.writer.showText();
        // remainingTime is the whole schedule up front: 0.1 for 'a', 0.4 for '.', 0.1 for 'b'.
        expect(stopped.writer.remainingTime).toBeCloseTo(0.6, 10);
        stopped.node.destroy();

        const plain = rig('axb');
        plain.writer.waitForNormalChars = 0.1;
        plain.writer.waitLong = 0.4;
        plain.writer.showText();
        expect(plain.writer.remainingTime).toBeCloseTo(0.3, 10);
        expect(plain.writer.isShowingText).toBe(true);
        plain.node.destroy();
    });

    test('consecutive punctuation pauses once when asked, twice otherwise', () => {
        const build = (avoid: boolean): { node: Node; glyph: AirGlyphText; writer: AirTypewriter } => {
            const built = rig('a?!b');
            built.writer.waitForNormalChars = 0.1;
            built.writer.waitLong = 0.4;
            built.writer.avoidMultiplePunctuationWait = avoid;
            built.writer.showText();
            return built;
        };
        const avoided = build(true);
        expect(avoided.writer.remainingTime).toBeCloseTo(0.7, 10);
        avoided.node.destroy();

        const doubled = build(false);
        expect(doubled.writer.remainingTime).toBeCloseTo(1, 10);
        doubled.node.destroy();
    });

    test('a hard line break waits waitForNewLines, a soft wrap does not pause', () => {
        const broken = rig('a\nb');
        broken.writer.waitForNormalChars = 0.1;
        broken.writer.waitForNewLines = 0.5;
        broken.writer.showText();
        // Two glyphs only: the line feed itself is not a character, so the schedule is 0.1 + 0.5.
        expect(broken.writer.remainingTime).toBeCloseTo(0.6, 10);
        broken.node.destroy();

        const wrapped = rig('ab cd');
        wrapped.glyph.maxWidth = 25;
        wrapped.writer.waitForNormalChars = 0.1;
        wrapped.writer.waitForNewLines = 0.5;
        wrapped.writer.showText();
        expect(wrapped.writer.remainingTime).toBeCloseTo(0.4, 10);
        wrapped.node.destroy();
    });

    test('remainingTime counts down as the pass reveals', () => {
        const { node, glyph, writer } = rig('abcd');
        writer.waitForNormalChars = 0.1;
        writer.showText();
        (writer as any).update(0.1);
        glyph.rebuild();
        expect(writer.visibleCharacterCount).toBe(1);
        expect(writer.remainingTime).toBeCloseTo(0.3, 10);
        run(writer, glyph, 0.1);
        expect(writer.remainingTime).toBe(0);
        node.destroy();
    });

    test('skip finishes the pass at once and only fires per-char events when asked', () => {
        const { node, glyph, writer } = rig('abcd');
        writer.waitForNormalChars = 0.2;
        const chars: string[] = [];
        let showed = 0;
        writer.onCharacterVisible = (ch): void => void chars.push(ch);
        writer.onTextShowed = (): void => void showed++;
        writer.showText();
        (writer as any).update(0.2);
        (writer as any).update(0.2);
        glyph.rebuild();
        expect(writer.visibleCharacterCount).toBe(2);
        writer.skip();
        expect(glyph.maxVisibleCharacters).toBe(Infinity);
        expect(writer.isShowingText).toBe(false);
        expect(showed).toBe(1);
        expect(chars).toEqual(['a', 'b']);

        writer.triggerEventsOnSkip = true;
        writer.showText();
        writer.skip();
        expect(chars).toEqual(['a', 'b', 'a', 'b', 'c', 'd']);
        expect(showed).toBe(2);
        node.destroy();
    });

    test('hideText empties the string and fires onTextDisappeared', () => {
        const { node, glyph, writer } = rig('abc');
        writer.useTypewriterWaitForDisappearances = true;
        writer.disappearanceWaitTime = 0.1;
        let disappeared = 0;
        writer.onTextDisappeared = (): void => void disappeared++;
        writer.showText();
        run(writer, glyph, 0.05);
        expect(glyph.maxVisibleCharacters).toBe(Infinity);
        writer.hideText();
        expect(writer.isHidingText).toBe(true);
        expect(writer.visibleCharacterCount).toBe(3);
        run(writer, glyph, 0.1);
        expect(glyph.maxVisibleCharacters).toBe(0);
        expect(glyph.isCharacterVisible(0)).toBe(false);
        expect(disappeared).toBe(1);
        expect(writer.isHidingText).toBe(false);
        node.destroy();
    });

    test('useTypewriter=false shows the whole string without a pass', () => {
        const { node, glyph, writer } = rig('abcd');
        writer.useTypewriter = false;
        writer.showText();
        expect(writer.isShowingText).toBe(false);
        expect(glyph.maxVisibleCharacters).toBe(Infinity);
        expect(glyph.isCharacterVisible(3)).toBe(true);
        node.destroy();
    });

    test('showText replaces the string and restarts from nothing visible', () => {
        const { node, glyph, writer } = rig('abc');
        writer.waitForNormalChars = 0.05;
        writer.showText('wxyz');
        expect(glyph.string).toBe('wxyz');
        expect(glyph.characterCount).toBe(4);
        expect(glyph.maxVisibleCharacters).toBe(0);
        node.destroy();
    });

    test('stopShowingText freezes the reveal where it is', () => {
        const { node, glyph, writer } = rig('abcdef');
        writer.waitForNormalChars = 0.05;
        writer.showText();
        run(writer, glyph, 0.05, 3);
        const frozen = glyph.maxVisibleCharacters;
        writer.stopShowingText();
        run(writer, glyph, 0.05);
        expect(glyph.maxVisibleCharacters).toBe(frozen);
        expect(frozen).toBeLessThan(6);
        node.destroy();
    });

    test('update rejects a non-finite delta', () => {
        const { node, writer } = rig('ab');
        writer.showText();
        expect(() => (writer as any).update(Number.NaN)).toThrow('AIR_E_TYPEWRITER');
        expect(() => (writer as any).update(-1)).toThrow('AIR_E_TYPEWRITER');
        node.destroy();
    });
});
