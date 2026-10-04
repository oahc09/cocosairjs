// PG-33 六类组合配方纯函数回归（无引擎依赖，可独立编译）。
import {
    verifyAccumulatorSteps,
    classifySpeedDecay,
    TEXTURE_SOURCES,
} from '../../test/fixtures/port-recipes/contract';

describe('PG-33 fixed-step accumulator', () => {
    test('dt=0ms consumes 0 steps', () => {
        const { consumed, total } = verifyAccumulatorSteps([0], 1 / 60, 5);
        expect(consumed[0]).toBe(0);
        expect(total).toBe(0);
    });

    test('dt=1×fixed consumes exactly 1 step', () => {
        const { consumed, total } = verifyAccumulatorSteps([1 / 60], 1 / 60, 5);
        expect(consumed[0]).toBe(1);
        expect(total).toBe(1);
    });

    test('dt=2×fixed consumes 2 steps in one frame', () => {
        const { consumed, total } = verifyAccumulatorSteps([2 / 60], 1 / 60, 5);
        expect(consumed[0]).toBe(2);
        expect(total).toBe(2);
    });

    test('60fps continuous frames consume exactly 1 step each; total = frame count', () => {
        const frames = Array.from({ length: 10 }, () => 1 / 60);
        const { consumed, total } = verifyAccumulatorSteps(frames, 1 / 60, 5);
        expect(consumed.every((c) => c === 1)).toBe(true);
        expect(total).toBe(10);
        // 连续相同消费数不是重放——60fps 每帧 1 步本就合法
    });

    test('maxCatchup caps runaway accumulation', () => {
        const { consumed, total } = verifyAccumulatorSteps([0.5, 0.5], 1 / 60, 3);
        expect(consumed[0]! + consumed[1]!).toBeLessThanOrEqual(6); // max 3 per frame
        expect(total).toBeGreaterThan(0); // 物理确实推进了
    });

    test('carry-over: remainder from short frame feeds next frame', () => {
        // dt = 1.5×fixed → 第一帧消费 1 步，余 0.5×fixed；第二帧 dt=1.5×fixed + 余量 → 2 步
        const { consumed, total } = verifyAccumulatorSteps([1.5 / 60, 1.5 / 60], 1 / 60, 5);
        expect(total).toBe(3); // 1.5 + 1.5 = 3 步
    });
});

describe('PG-33 speed decay classification', () => {
    test('ground friction decays velocity to near zero', () => {
        expect(classifySpeedDecay([90, 88, 85, 60, 30, 8, 0])).toBe('decaying');
    });
    test('air velocity stays constant', () => {
        expect(classifySpeedDecay([90, 90, 90, 90, 90])).toBe('constant');
    });
    test('insufficient data returns unknown', () => {
        expect(classifySpeedDecay([90])).toBe('unknown');
    });
});

describe('PG-33 texture source contract', () => {
    test('five sources with per-basis orientation expectations', () => {
        expect(TEXTURE_SOURCES).toHaveLength(5);
        const typed = TEXTURE_SOURCES.find((s) => s.kind === 'typedArray');
        // uploadData 保留行序；方向取决于 UV 基准（Sprite v0=视觉顶 / plane+90X v1=视觉顶）
        expect(typed?.note).toContain('UV basis');
        const imageData = TEXTURE_SOURCES.find((s) => s.kind === 'imageData');
        expect(imageData?.expectUpright).toBe(false);
    });
});
