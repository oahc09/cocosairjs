// PG-24 纹理方向合同单测：图样生成、行翻转数学、纹素反查与几何方向判定（纯函数，无引擎依赖）。
// 浏览器侧三引擎实证由 tools/verify/air-texture-orientation-browser.cjs 承担（报告 --out 显式）。
import {
    MARKER_COLORS,
    PATTERN_WIDTH,
    PATTERN_HEIGHT,
    QUADRANTS,
    SOURCE_CONTRACT,
    buildPatternPixelsTopDown,
    flipRows,
    texelFromColor,
    texelCenterFractions,
    classifyTexelGrid,
    type ObservedTexelGrid,
} from '../../test/fixtures/texture-orientation/contract';

function grid (tl: [number, number], tr: [number, number], bl: [number, number], br: [number, number]): ObservedTexelGrid {
    return { TL: tl, TR: tr, BL: bl, BR: br };
}

describe('PG-24 texture orientation contract (pure)', () => {
    test('marker pattern: 16 unique colors, top-left origin, row-major RGBA', () => {
        expect(PATTERN_WIDTH).toBe(4);
        expect(PATTERN_HEIGHT).toBe(4);
        expect(MARKER_COLORS).toHaveLength(16);
        const bytes = buildPatternPixelsTopDown();
        expect(bytes).toHaveLength(64);
        // 顶部第 0 行前两纹素 = 红/绿（视觉左上/右上）
        expect([...bytes.slice(0, 4)]).toEqual([255, 0, 0, 255]);
        expect([...bytes.slice(4, 8)]).toEqual([0, 255, 0, 255]);
        // 底部最后一行前两纹素 = 黄/蓝（视觉左下/右下）
        expect([...bytes.slice(48, 52)]).toEqual([255, 255, 0, 255]);
        expect([...bytes.slice(52, 56)]).toEqual([0, 0, 255, 255]);
        // 16 色互不相同（唯一可反查）
        const unique = new Set(MARKER_COLORS.map((c) => `${c.r},${c.g},${c.b},${c.a}`));
        expect(unique.size).toBe(16);
    });

    test('flipRows matches the copyCanvasRows convention: top-down → bottom-first, columns preserved', () => {
        const topDown = buildPatternPixelsTopDown();
        const bottomFirst = flipRows(topDown);
        // 第 0 行（底优先）= 视觉底行（原 row3）：黄、蓝
        expect([...bottomFirst.slice(0, 4)]).toEqual([255, 255, 0, 255]);
        expect([...bottomFirst.slice(4, 8)]).toEqual([0, 0, 255, 255]);
        // 最后一行 = 视觉顶行（原 row0）：红、绿（列序保持）
        expect([...bottomFirst.slice(48, 52)]).toEqual([255, 0, 0, 255]);
        expect([...bottomFirst.slice(52, 56)]).toEqual([0, 255, 0, 255]);
        // 双向往返恒等
        expect([...flipRows(bottomFirst)]).toEqual([...topDown]);
    });

    test('texelFromColor identifies every texel and rejects unknown colors', () => {
        for (let ty = 0; ty < 4; ty += 1) {
            for (let tx = 0; tx < 4; tx += 1) {
                const c = MARKER_COLORS[ty * 4 + tx]!;
                expect(texelFromColor(c)).toEqual([tx, ty]);
            }
        }
        expect(texelFromColor({ r: 250, g: 4, b: 2, a: 255 })).toEqual([0, 0]); // 容差内
        expect(texelFromColor({ r: 1, g: 2, b: 3, a: 4 })).toBeNull();
    });

    test('texelCenterFractions are the four corner texel centers', () => {
        const fractions = texelCenterFractions();
        expect(fractions.TL).toEqual({ fx: 0.125, fy: 0.125 });
        expect(fractions.TR).toEqual({ fx: 0.875, fy: 0.125 });
        expect(fractions.BL).toEqual({ fx: 0.125, fy: 0.875 });
        expect(fractions.BR).toEqual({ fx: 0.875, fy: 0.875 });
    });

    test('classifyTexelGrid derives all four orientations geometrically', () => {
        const upright = classifyTexelGrid(grid([0, 0], [3, 0], [0, 3], [3, 3]));
        expect(upright).toMatchObject({ upright: true, verdict: 'upright' });
        const vFlip = classifyTexelGrid(grid([0, 3], [3, 3], [0, 0], [3, 0]));
        expect(vFlip).toMatchObject({ verticallyFlipped: true, verdict: 'vertically-flipped' });
        const hMirror = classifyTexelGrid(grid([3, 0], [0, 0], [3, 3], [0, 3]));
        expect(hMirror).toMatchObject({ horizontalMirrored: true, verdict: 'horizontal-mirrored' });
        const rot180 = classifyTexelGrid(grid([3, 3], [0, 3], [3, 0], [0, 0]));
        expect(rot180).toMatchObject({ rotated180: true, verdict: 'rotated-180' });
        const incomplete = classifyTexelGrid(grid([0, 0], [3, 0], null, [3, 3]));
        expect(incomplete.verdict).toBe('incomplete');
        const unrecognized = classifyTexelGrid(grid([2, 1], [1, 2], [2, 2], [1, 1]));
        expect(unrecognized.verdict).toBe('unrecognized');
    });

    test('source contract matrix: five sources with honest acceptance and memory order', () => {
        expect(SOURCE_CONTRACT).toHaveLength(5);
        const bySource = new Map(SOURCE_CONTRACT.map((entry) => [entry.source, entry]));
        // ImageData 不在公开 ImageSource 联合类型内：如实 NOT_APPLICABLE，不伪造支持
        expect(bySource.get('imageData')).toMatchObject({ acceptedByPublicType: false, expectedVerdict: 'not-applicable' });
        // DOM 类三源：顶优先内存序、期望朝上
        for (const kind of ['image', 'canvas', 'imageBitmap'] as const) {
            expect(bySource.get(kind)).toMatchObject({ acceptedByPublicType: true, memoryOrder: 'top-down', expectedVerdict: 'upright' });
        }
        // TypedArray：底优先字节在 Sprite UV 基准下垂直翻转（方向取决于 UV 断言，见手册）
        expect(bySource.get('typedArray')).toMatchObject({ acceptedByPublicType: true, memoryOrder: 'bottom-first', expectedVerdict: 'vertically-flipped' });
        expect(QUADRANTS).toEqual(['TL', 'TR', 'BL', 'BR']);
    });
});
