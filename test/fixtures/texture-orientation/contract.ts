/**
 * PG-24 纹理方向合同——单一事实源（fixture 页面、浏览器 runner、Jest 回归三方共用）。
 *
 * 图样：4×4 像素、16 个互不相同的颜色（每纹素唯一可识别），左上原点、行主序 RGBA。
 * 验证方法（无假设）：渲染后按**纹素中心**采样四角，用颜色反查纹素坐标 (tx, ty)，
 * 由屏幕四角的纹素坐标推导方向（upright / vertically-flipped / horizontal-mirrored /
 * rotated-180 / unrecognized）。不使用 gl.pixelStore，不做替身算法。
 *
 * 方向结论由真实浏览器实证后记录于报告；本模块只提供图样、反查与几何判定。
 *
 * 已知引擎约定（browser runner 实证补充进报告，代码不作假设）：
 *  - ImageSource 公开联合类型 = HTMLCanvasElement | HTMLImageElement | IMemoryImageSource | ImageBitmap
 *    （ImageData 不在内 → 公开入口 NOT_APPLICABLE，等价对照走内存字节）。
 *  - IMemoryImageSource / uploadData 的内存行序约定以实证为准（canvas-texture.js 自称
 *    "bottom-first consumed by uploadData"；浏览器报告记录实际观察）。
 */

export interface Rgba { readonly r: number; readonly g: number; readonly b: number; readonly a: number }
export type SourceKind = 'image' | 'canvas' | 'imageBitmap' | 'imageData' | 'typedArray';
export type TexelCoord = readonly [number, number]; // [tx, ty]，ty=0 为图样视觉顶行

export const PATTERN_WIDTH = 4;
export const PATTERN_HEIGHT = 4;

/** @en 16 unique colors, one per texel (row-major, top-left origin). @zh 16 个唯一颜色，每纹素一个（行主序，左上原点）。 */
export const MARKER_COLORS: readonly Rgba[] = Object.freeze([
    Object.freeze({ r: 255, g: 0, b: 0, a: 255 }),     // (0,0) 红
    Object.freeze({ r: 0, g: 255, b: 0, a: 255 }),     // (1,0) 绿
    Object.freeze({ r: 255, g: 0, b: 255, a: 255 }),   // (2,0) 品红
    Object.freeze({ r: 0, g: 255, b: 255, a: 255 }),   // (3,0) 青
    Object.freeze({ r: 128, g: 128, b: 128, a: 255 }), // (0,1)
    Object.freeze({ r: 255, g: 255, b: 255, a: 255 }), // (1,1) 白
    Object.freeze({ r: 0, g: 0, b: 0, a: 255 }),       // (2,1) 黑
    Object.freeze({ r: 128, g: 0, b: 0, a: 255 }),     // (3,1)
    Object.freeze({ r: 128, g: 128, b: 0, a: 255 }),   // (0,2)
    Object.freeze({ r: 0, g: 128, b: 128, a: 255 }),   // (1,2)
    Object.freeze({ r: 200, g: 200, b: 200, a: 255 }), // (2,2)
    Object.freeze({ r: 60, g: 60, b: 60, a: 255 }),    // (3,2)
    Object.freeze({ r: 255, g: 255, b: 0, a: 255 }),   // (0,3) 黄
    Object.freeze({ r: 0, g: 0, b: 255, a: 255 }),     // (1,3) 蓝
    Object.freeze({ r: 160, g: 82, b: 45, a: 255 }),   // (2,3)
    Object.freeze({ r: 0, g: 128, b: 0, a: 255 }),     // (3,3)
]);

/** @en Top-down RGBA bytes (Canvas2D/ImageData memory order). @zh 顶优先 RGBA 字节（Canvas2D/ImageData 内存序）。 */
export function buildPatternPixelsTopDown (): Uint8ClampedArray {
    const bytes = new Uint8ClampedArray(PATTERN_WIDTH * PATTERN_HEIGHT * 4);
    MARKER_COLORS.forEach((c, i) => {
        bytes[i * 4] = c.r; bytes[i * 4 + 1] = c.g; bytes[i * 4 + 2] = c.b; bytes[i * 4 + 3] = c.a;
    });
    return bytes;
}

/** @en Flip rows: top-down → the memory order the upload entry consumes. @zh 行翻转：顶优先 → 上传入口消费的内存序。 */
export function flipRows (bytes: Uint8ClampedArray | Uint8Array, width = PATTERN_WIDTH, height = PATTERN_HEIGHT): Uint8Array {
    const stride = width * 4;
    const out = new Uint8Array(bytes.length);
    for (let y = 0; y < height; y += 1) {
        out.set(bytes.subarray(y * stride, (y + 1) * stride), (height - 1 - y) * stride);
    }
    return out;
}

/** @en Identify a texel coordinate by its color (tolerance ≤ 12/channel); null when unrecognized. @zh 按颜色反查纹素坐标（每通道容差 ≤12）；无法识别返回 null。 */
export function texelFromColor (color: Rgba, tolerance = 12): TexelCoord | null {
    for (let ty = 0; ty < PATTERN_HEIGHT; ty += 1) {
        for (let tx = 0; tx < PATTERN_WIDTH; tx += 1) {
            const c = MARKER_COLORS[ty * PATTERN_WIDTH + tx]!;
            if (Math.abs(c.r - color.r) <= tolerance && Math.abs(c.g - color.g) <= tolerance
                && Math.abs(c.b - color.b) <= tolerance && Math.abs(c.a - color.a) <= tolerance) {
                return [tx, ty] as const;
            }
        }
    }
    return null;
}

/** @en Screen quadrant keys. @zh 屏幕四象限键。 */
export type Quadrant = 'TL' | 'TR' | 'BL' | 'BR';
export const QUADRANTS: readonly Quadrant[] = Object.freeze(['TL', 'TR', 'BL', 'BR'] as const);

export type ObservedTexelGrid = Record<Quadrant, TexelCoord | null>;

/**
 * @en Derive orientation from the observed screen-quadrant → texel-coord mapping.
 * 采样点 = 四角纹素中心（12.5% / 87.5%），整幅 4 纹素拉伸满四边形：
 * Upright  = TL shows texel (0,0), TR (3,0), BL (0,3), BR (3,3)  (rows preserved, columns preserved)
 * V-flip   = TL (0,3), TR (3,3), BL (0,0), BR (3,0)              (rows reversed)
 * H-mirror = TL (3,0), TR (0,0), BL (3,3), BR (0,3)              (columns reversed)
 * Rot-180  = TL (3,3), TR (0,3), BL (3,0), BR (0,0)              (both reversed)
 * @zh 由屏幕四角观察到的纹素坐标推导方向（几何判定，无颜色假设）。
 */
export function classifyTexelGrid (observed: ObservedTexelGrid): {
    upright: boolean; verticallyFlipped: boolean; horizontalMirrored: boolean; rotated180: boolean; verdict: string;
} {
    const eq = (a: TexelCoord | null, x: number, y: number): boolean => a !== null && a[0] === x && a[1] === y;
    const [tl, tr, bl, br] = [observed.TL, observed.TR, observed.BL, observed.BR];
    const complete = [tl, tr, bl, br].every((t) => t !== null);
    if (!complete) {
        return { upright: false, verticallyFlipped: false, horizontalMirrored: false, rotated180: false, verdict: 'incomplete' };
    }
    const upright = eq(tl, 0, 0) && eq(tr, 3, 0) && eq(bl, 0, 3) && eq(br, 3, 3);
    const verticallyFlipped = eq(tl, 0, 3) && eq(tr, 3, 3) && eq(bl, 0, 0) && eq(br, 3, 0);
    const horizontalMirrored = eq(tl, 3, 0) && eq(tr, 0, 0) && eq(bl, 3, 3) && eq(br, 0, 3);
    const rotated180 = eq(tl, 3, 3) && eq(tr, 0, 3) && eq(bl, 3, 0) && eq(br, 0, 0);
    const verdict = upright ? 'upright'
        : verticallyFlipped ? 'vertically-flipped'
        : horizontalMirrored ? 'horizontal-mirrored'
        : rotated180 ? 'rotated-180'
        : 'unrecognized';
    return { upright, verticallyFlipped, horizontalMirrored, rotated180, verdict };
}

/** @en Texel-center sample fractions on the rendered quad (texture fills the quad exactly). @zh 渲染四边形上四角纹素中心的采样比例（纹理恰满四边形）。 */
export function texelCenterFractions (): Record<Quadrant, { fx: number; fy: number }> {
    const quarter = 1 / PATTERN_WIDTH / 2; // 0.125：纹素中心
    const threeQuarter = 1 - quarter;      // 0.875
    return {
        TL: { fx: quarter, fy: quarter },
        TR: { fx: threeQuarter, fy: quarter },
        BL: { fx: quarter, fy: threeQuarter },
        BR: { fx: threeQuarter, fy: threeQuarter },
    };
}

/** @en Per-source contract matrix (empirically confirmed per engine by the browser runner). @zh 每源合同矩阵（浏览器 runner 逐引擎实证）。 */

/** @en Hue bucket for PBR-lit samples (lighting scales channels; hue ratios stay stable). @zh 受光样本的色调桶（光照缩放通道，色调比例稳定）。 */
export function hueBucket (color: Rgba): 'red' | 'green' | 'yellow' | 'cyan-blue' | 'other' {
    const { r, g, b } = color;
    if (r > 80 && g > 80 && b < 60) return 'yellow';
    if (g > 40 && g > 2 * r && g > 2 * b) return 'green';
    if (b > 80 && g > 40 && r < 100) return 'cyan-blue';
    if (r > 80 && r > 2 * g && r > 2 * b) return 'red';
    return 'other';
}

/**
 * @en Classify PBR-lit glTF quadrants by hue layout: the engine's glTF sampling is
 * bottom-up, so a spec-style top-down UV quad renders vertically flipped with stable hues.
 * @zh 按色调布局判定 PBR 受光四象限：引擎 glTF 采样为底优先，规范式顶下 UV 四边形渲染
 * 为垂直翻转（色调稳定可判）。
 */
export function classifyLitQuadrants (samples: Record<Quadrant, Rgba>): {
    verticallyFlipped: boolean; upright: boolean; verdict: 'vertically-flipped' | 'upright' | 'unrecognized'; hues: Record<Quadrant, string>;
} {
    const hues = {
        TL: hueBucket(samples.TL), TR: hueBucket(samples.TR),
        BL: hueBucket(samples.BL), BR: hueBucket(samples.BR),
    } as Record<Quadrant, string>;
    const verticallyFlipped = hues.TL === 'yellow' && hues.TR === 'green' && hues.BL === 'red' && hues.BR === 'cyan-blue';
    const upright = hues.TL === 'red' && hues.TR === 'cyan-blue' && hues.BL === 'yellow' && hues.BR === 'green';
    const verdict = verticallyFlipped ? 'vertically-flipped' : upright ? 'upright' : 'unrecognized';
    return { verticallyFlipped, upright, verdict, hues };
}

export const SOURCE_CONTRACT: readonly Readonly<{
    source: SourceKind | 'imageData'; acceptedByPublicType: boolean; memoryOrder: 'top-down' | 'bottom-first';
    expectedVerdict: 'upright' | 'vertically-flipped' | 'not-applicable';
    note: string;
}>[] = Object.freeze([
    Object.freeze({ source: 'image' as const, acceptedByPublicType: true, memoryOrder: 'top-down', expectedVerdict: 'upright', note: 'HTMLImageElement 为原生图像对象，texImage2D 直传不翻转' }),
    Object.freeze({ source: 'canvas' as const, acceptedByPublicType: true, memoryOrder: 'top-down', expectedVerdict: 'upright', note: 'HTMLCanvasElement 同为原生图像对象' }),
    Object.freeze({ source: 'imageBitmap' as const, acceptedByPublicType: true, memoryOrder: 'top-down', expectedVerdict: 'upright', note: 'ImageBitmap 在公开联合类型内；sys.Feature.IMAGE_BITMAP 仅影响类型收敛，不影响 gfx 直传' }),
    Object.freeze({ source: 'imageData' as const, acceptedByPublicType: false, memoryOrder: 'top-down', expectedVerdict: 'not-applicable', note: 'ImageData 不在 ImageSource 联合类型内：公开入口 NOT_APPLICABLE，等价对照=内存字节直传（观察其实际方向）' }),
    Object.freeze({ source: 'typedArray' as const, acceptedByPublicType: true, memoryOrder: 'bottom-first', expectedVerdict: 'vertically-flipped', note: '底优先字节在 Sprite UV 基准（v=0=视觉顶）下垂直翻转；copyCanvasRows 的底优先字节配合 plane(+90X) UV 基准（v=1=视觉顶）则 upright——方向取决于 UV 断言，不存在脱离 UV 的通用顶/底优先正确性' }),
]);
