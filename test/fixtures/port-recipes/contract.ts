/**
 * PG-33 六类组合配方——模式常量、探针数据形状与纯函数判定（fixture/runner/Jest 三方共用）。
 * 本文件为纯 TS，无 DOM/引擎依赖，可独立编译。
 */

export type RecipeKind = 'r1-code3d' | 'r2-input-hud' | 'r3-pointer-lock' | 'r4-camera-modes' | 'r5-shared-assets' | 'r6-optional-svcs';
export type ProbePhase = 'normal' | 'pause' | 'restart' | 'cleanup' | 'negative';

export interface ProbeEntry {
    readonly recipe: RecipeKind;
    readonly phase: ProbePhase;
    readonly name: string;
    readonly pass: boolean;
    readonly detail?: string;
    readonly level: 'real' | 'synthetic';
}

export interface NegativeCase {
    readonly recipe: RecipeKind;
    readonly trigger: string;
    readonly expectedError: string;
}

export interface RecipeProbeResult {
    readonly recipe: RecipeKind;
    readonly entries: readonly ProbeEntry[];
    readonly negatives: readonly { trigger: string; error: string; cleanedUp: boolean }[];
    readonly releaseOK: boolean;
}

/**
 * 定步累加器消费计数：每帧返回该帧消费的物理步数。
 * 无重放概念——每步只消费一次，输出序列就是实际物理步数序列。
 */
export function verifyAccumulatorSteps (
    dtFrames: readonly number[],
    fixedDt: number,
    maxCatchup = 5,
): { consumed: readonly number[]; total: number } {
    let acc = 0;
    let total = 0;
    const consumed: number[] = [];
    for (const dt of dtFrames) {
        acc += dt;
        let steps = 0;
        while (acc >= fixedDt && steps < maxCatchup) {
            acc -= fixedDt;
            steps += 1;
        }
        consumed.push(steps);
        total += steps;
    }
    return { consumed, total };
}

export function classifySpeedDecay (samples: readonly number[]): 'decaying' | 'constant' | 'unknown' {
    if (samples.length < 2) return 'unknown';
    const start = Math.abs(samples[0]!);
    const end = Math.abs(samples[samples.length - 1]!);
    if (start > 0 && end < start * 0.3) return 'decaying';
    if (Math.abs(end - start) < 1) return 'constant';
    return 'unknown';
}

export const TEXTURE_SOURCES = [
    { kind: 'image', memoryOrder: 'top-down', expectUpright: true },
    { kind: 'canvas', memoryOrder: 'top-down', expectUpright: true },
    { kind: 'imageBitmap', memoryOrder: 'top-down', expectUpright: true },
    { kind: 'imageData', memoryOrder: 'top-down', expectUpright: false, note: 'not in public ImageSource union' },
    { kind: 'typedArray', memoryOrder: 'top-down (Sprite) / bottom-first (plane +90X)', expectUpright: true, note: 'uploadData preserves row order; direction depends on UV basis' },
] as const;
