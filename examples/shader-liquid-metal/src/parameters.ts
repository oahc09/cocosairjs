export interface Descriptor {
    type: 'number' | 'string';
    defaultValue: number | string;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    enum?: string[];
    updateMode: string;
    description: string;
}
export interface Definition {
    schemaVersion: string;
    name: string;
    version: string;
    params: Record<string, Descriptor>;
}
export type LiquidShape = 'circle' | 'rounded-box';
export type QualityTier = 'low' | 'high';
export interface LiquidMetalParams {
    shape: LiquidShape;
    scale: number;
    rotation: number;
    turbulence: number;
    ripple: number;
    warp: number;
    speed: number;
    environment: number;
    envRotation: number;
    sharpness: number;
    dispersion: number;
    lightAngle: number;
    bevelWidth: number;
    bevelShape: number;
    edgeSoftness: number;
    seed: number;
    quality: QualityTier;
}
/**
 * Total parameter gate: null / structural garbage / unknown keys / wrong types / non-finite
 * numbers / range violations / non-enum values are rejected before any state changes with no
 * partial application.
 */
export function validate(
    definition: Definition,
    value: unknown,
): { ok: boolean; errors: { code: string; parameter: string }[]; values?: LiquidMetalParams } {
    const errors: { code: string; parameter: string }[] = [];
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { ok: false, errors: [{ code: 'LIQUID_PARAMETERS', parameter: '$' }] };
    const source = value as Record<string, unknown>;
    for (const key of Object.keys(source))
        if (!Object.hasOwn(definition.params, key)) errors.push({ code: 'LIQUID_UNKNOWN_PARAMETER', parameter: key });
    for (const [key, d] of Object.entries(definition.params)) {
        const v = source[key];
        if (typeof v !== d.type || (typeof v === 'number' && !Number.isFinite(v)))
            errors.push({ code: 'LIQUID_PARAMETER_TYPE', parameter: key });
        else if (d.enum && !d.enum.includes(v as string))
            errors.push({ code: 'LIQUID_PARAMETER_ENUM', parameter: key });
        else if (typeof v === 'number' && ((d.min !== undefined && v < d.min) || (d.max !== undefined && v > d.max)))
            errors.push({ code: 'LIQUID_PARAMETER_RANGE', parameter: key });
    }
    return errors.length
        ? { ok: false, errors }
        : { ok: true, errors, values: { ...source } as unknown as LiquidMetalParams };
}
