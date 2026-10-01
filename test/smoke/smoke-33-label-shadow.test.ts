import { Label } from '../../src/cocos/2d/components/label';
import { TextProcessing } from '../../src/cocos/2d/assembler/label/text-processing';
import { TextStyle } from '../../src/cocos/2d/assembler/label/text-style';
import { TextLayout } from '../../src/cocos/2d/assembler/label/text-layout';
import { TextOutputLayoutData, TextOutputRenderData } from '../../src/cocos/2d/assembler/label/text-output-data';
import { TTFUtils } from '../../src/cocos/2d/assembler/label/ttfUtils';
import { TTF } from '../../src/cocos/2d/assembler/label/ttf';

function render (overflow: number, scale: number, shadow: boolean, x = 2, y = -3, outline = false, italic = false, align = 0) {
    const canvas = document.createElement('canvas');
    let fillCount = 0;
    const context = {
        font: '',
        measureText (text: string) {
            const size = parseFloat(this.font.match(/([\d.]+)px/)![1]);
            return { width: text.length * size * 0.6 };
        },
        clearRect () {}, fillRect () {}, fillText () { fillCount++; }, strokeText () {},
    } as unknown as CanvasRenderingContext2D;
    const processing = new TextProcessing();
    processing.setCanvasUsed(canvas, context);
    const style = new TextStyle();
    style.fontSize = 23;
    style.fontScale = scale;
    style.fontFamily = 'ShadowRegression';
    style.hasShadow = shadow;
    style.shadowBlur = 4;
    style.shadowOffsetX = x;
    style.shadowOffsetY = y;
    style.isOutlined = outline;
    style.outlineWidth = 2;
    style.isItalic = italic;
    const layout = new TextLayout();
    layout.overFlow = overflow;
    layout.lineHeight = 28;
    layout.horizontalAlign = align;
    layout.verticalAlign = align;
    layout.wrapping = overflow === Label.Overflow.RESIZE_HEIGHT;
    const output = new TextOutputLayoutData();
    output.nodeContentSize.set(150, 70);
    output.canvasSize.set(150, 70);
    const vertices = new TextOutputRenderData();
    vertices.quadCount = 4;
    vertices.uiTransAnchorX = 0.3;
    vertices.uiTransAnchorY = 0.8;
    processing.processingString(false, style, layout, output, 'Shadow kernel stays the same');
    processing.generateRenderInfo(false, style, layout, output, vertices, '', TTFUtils.prototype.generateVertexData);
    const fontScale = style.actualFontSize / style.fontSize;
    const glyphX = vertices.vertexBuffer[0].x + output.startPosition.x / fontScale;
    const glyphY = vertices.vertexBuffer[0].y + (canvas.height - output.startPosition.y) / fontScale;
    return { canvas, style, output, vertices, fontScale, glyphX, glyphY, fillCount };
}

describe('Label shadow preserves glyph scale and logical layout', () => {
    test('multiline shadow paints each text line once', () => {
        const sample = render(Label.Overflow.RESIZE_HEIGHT, 1, true);
        expect(sample.output.parsedString.length).toBeGreaterThan(1);
        expect(sample.fillCount).toBe(sample.output.parsedString.length);
    });
    test('NONE and RESIZE_HEIGHT keep layout and glyph origin across offsets, styles and DPR', () => {
        for (const overflow of [Label.Overflow.NONE, Label.Overflow.RESIZE_HEIGHT]) {
            for (const scale of [1, 2]) for (const align of [0, 1, 2]) {
                for (const [x, y, outline, italic] of [
                    [2, -3, false, false], [-8, 7, false, false], [8, -7, true, false], [-2, 3, true, true],
                ] as Array<[number, number, boolean, boolean]>) {
                    const plain = render(overflow, scale, false, x, y, outline, italic, align);
                    const shaded = render(overflow, scale, true, x, y, outline, italic, align);
                    expect(shaded.output.nodeContentSize).toEqual(plain.output.nodeContentSize);
                    expect(shaded.output.parsedString).toEqual(plain.output.parsedString);
                    const quad = shaded.vertices.vertexBuffer;
                    expect((quad[1].x - quad[0].x) * shaded.fontScale).toBeCloseTo(shaded.canvas.width, 6);
                    expect((quad[2].y - quad[0].y) * shaded.fontScale).toBeCloseTo(shaded.canvas.height, 6);
                    // Canvas dimensions are integers; center/right baselines can differ by < 1 raster pixel.
                    expect(Math.abs(shaded.glyphX - plain.glyphX)).toBeLessThanOrEqual(1 / shaded.fontScale);
                    expect(Math.abs(shaded.glyphY - plain.glyphY)).toBeLessThanOrEqual(1 / shaded.fontScale);
                }
            }
        }
    });

    test('anchor-only vertex updates retain shadow overflow', () => {
        const sample = render(Label.Overflow.NONE, 2, true, -8, 7);
        const trans = { width: sample.output.nodeContentSize.width, height: sample.output.nodeContentSize.height, anchorX: 1, anchorY: 0 };
        const comp = {
            node: { _getUITransformComp: () => trans },
            renderData: { data: sample.vertices.vertexBuffer },
            textLayoutData: sample.output,
            textStyle: sample.style,
        };
        TTF.prototype.updateVertexData.call({}, comp as any);
        const quad = sample.vertices.vertexBuffer;
        expect(quad[0].x).toBeCloseTo(-trans.width - sample.output.shadowPadding.x);
        expect(quad[0].y).toBeCloseTo(-sample.output.shadowPadding.y);
        expect((quad[1].x - quad[0].x) * sample.fontScale).toBeCloseTo(sample.canvas.width);
        expect((quad[2].y - quad[0].y) * sample.fontScale).toBeCloseTo(sample.canvas.height);
    });

    test('CLAMP and SHRINK retain their fixed quad and reset shadow overflow', () => {
        for (const overflow of [Label.Overflow.CLAMP, Label.Overflow.SHRINK]) {
            const sample = render(overflow, 2, true);
            expect(sample.output.shadowPadding.width).toBe(0);
            expect(sample.output.shadowPadding.height).toBe(0);
            expect(sample.vertices.vertexBuffer[1].x - sample.vertices.vertexBuffer[0].x).toBe(150);
            expect(sample.vertices.vertexBuffer[2].y - sample.vertices.vertexBuffer[0].y).toBe(70);
        }
        const output = render(Label.Overflow.NONE, 1, true).output;
        output.reset();
        expect([output.shadowPadding.x, output.shadowPadding.y, output.shadowPadding.width, output.shadowPadding.height]).toEqual([0, 0, 0, 0]);
    });
});
