import { validateParams, type DriverParam, type DriverOutput } from './driver.js';
import { DEFAULTS } from './defaults.generated.js';
export type Consumer = 'holographic' | 'neon';
export const RANGES = {
    holographic: { rotation: [0, 360], hueShift: [0, 360], foilScale: [0.3, 6] },
    neon: { rotation: [0, 360], intensity: [0, 3], tubeThickness: [0, 0.08] },
} as const;
export function validateConsumerBindings(consumer: Consumer, input: unknown) {
    const pure = validateParams(input);
    if (!pure.ok) return pure;
    for (const p of pure.values) {
        const [ns, field, extra] = p.target.split('.');
        if (ns !== consumer || extra)
            return { ok: false as const, errors: [{ code: 'DRIVER_UNKNOWN_CONSUMER', target: p.target }] };
        if (field === 'position') {
            if (
                p.binding.source !== 'pointer' ||
                p.binding.axis !== 'uv' ||
                typeof p.defaultValue !== 'object' ||
                ['inputMin', 'inputMax', 'outputMin', 'outputMax'].some((k) => k in p.binding)
            )
                return { ok: false as const, errors: [{ code: 'DRIVER_TARGET_TYPE', target: p.target }] };
            continue;
        }
        const range = (RANGES[consumer] as Record<string, readonly number[]>)[field];
        if (!range) return { ok: false as const, errors: [{ code: 'DRIVER_UNKNOWN_TARGET', target: p.target }] };
        if (typeof p.defaultValue !== 'number' || p.binding.axis === 'uv')
            return { ok: false as const, errors: [{ code: 'DRIVER_TARGET_TYPE', target: p.target }] };
        if (
            p.defaultValue < range[0] ||
            p.defaultValue > range[1] ||
            [p.binding.outputMin, p.binding.outputMax].some((v) => v !== undefined && (v < range[0] || v > range[1]))
        )
            return { ok: false as const, errors: [{ code: 'DRIVER_RANGE', target: p.target }] };
    }
    return pure;
}
export function defaultBindings(consumer: Consumer): DriverParam[] {
    return [
        {
            target: `${consumer}.rotation`,
            binding: { source: 'pointer', axis: 'x', inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 360 },
            defaultValue: 0,
        },
    ];
}
export function consume(consumer: Consumer, outputs: DriverOutput) {
    const params: Record<string, any> = { ...DEFAULTS[consumer] };
    const position = { x: 0, y: 0 };
    for (const [target, value] of Object.entries(outputs)) {
        const [ns, field] = target.split('.');
        if (ns !== consumer) throw new Error('DRIVER_UNKNOWN_CONSUMER');
        if (field === 'position' && typeof value === 'object') {
            if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) throw new Error('DRIVER_OUTPUT');
            position.x = (value.x - 0.5) * 0.1;
            position.y = (value.y - 0.5) * 0.1;
        } else {
            const range = (RANGES[consumer] as Record<string, readonly number[]>)[field];
            if (!range || typeof value !== 'number' || !Number.isFinite(value)) throw new Error('DRIVER_OUTPUT');
            // Consumer range saturation is explicit and independently audited; driver outputs remain raw.
            params[field] = Math.min(range[1], Math.max(range[0], value));
        }
    }
    return { params, position };
}
const decode = (hex: string) =>
    [1, 3, 5].map((i) => {
        const x = parseInt(hex.slice(i, i + 2), 16) / 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
export function uniformValues(
    consumer: Consumer,
    params: Record<string, any>,
    time: number,
    width: number,
    height: number,
    diagnostic: boolean,
) {
    const p = params;
    return consumer === 'holographic'
        ? {
              holo0: [p.scale, p.rotation, p.hueShift, p.foilScale],
              holo1: [p.saturation, p.roughness, p.speed, p.crinkle],
              holo2: [p.crinkleScale, p.sparkle, p.edgeSoftness, p.seed],
              holo3: [time * p.speed, width, height, Number(diagnostic)],
          }
        : {
              neon0: [p.scale, p.rotation, p.secondaryBlend, p.tubeThickness],
              neon1: [p.intensity, p.hotCoreIntensity, p.glowIntensity, p.glowRadius],
              neon2: [p.lightAngle, p.specularIntensity, p.specularSize, p.cornerSmoothing],
              neon3: [p.flickerSpeed, p.flickerAmount, p.flowSpeed, p.flowAmount],
              neon4: [time, width, height, Number(diagnostic)],
              neonColor0: [...decode(p.tubeColor), 0],
              neonColor1: [...decode(p.secondaryColor), 0],
              neonColor2: [...decode(p.glowColor), 0],
          };
}
