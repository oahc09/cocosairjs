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
export type NeonShape = 'circle' | 'rounded-box';
export interface NeonParams {
    shape: NeonShape;
    scale: number;
    rotation: number;
    tubeThickness: number;
    secondaryBlend: number;
    intensity: number;
    hotCoreIntensity: number;
    glowIntensity: number;
    glowRadius: number;
    lightAngle: number;
    specularIntensity: number;
    specularSize: number;
    cornerSmoothing: number;
    flickerSpeed: number;
    flickerAmount: number;
    flowSpeed: number;
    flowAmount: number;
    tubeColor: string;
    secondaryColor: string;
    glowColor: string;
}
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
export function decodeColor(value: string): [number, number, number] {
    const code = parseInt(value.slice(1, 3), 16) / 255,
        green = parseInt(value.slice(3, 5), 16) / 255,
        blue = parseInt(value.slice(5, 7), 16) / 255;
    const channel = (x: number) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
    return [channel(code), channel(green), channel(blue)];
}
/**
 * Total parameter gate: unknown keys, wrong types, non-finite numbers, range
 * violations, non-enum shape and malformed colors are all rejected before any
 * state changes, with no partial application (callers only apply on ok=true).
 */
export function validate(
    definition: Definition,
    value: unknown,
): { ok: boolean; errors: { code: string; parameter: string }[]; values?: NeonParams } {
    const errors: { code: string; parameter: string }[] = [];
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { ok: false, errors: [{ code: 'NEON_PARAMETERS', parameter: '$' }] };
    const source = value as Record<string, unknown>;
    for (const key of Object.keys(source))
        if (!Object.hasOwn(definition.params, key)) errors.push({ code: 'NEON_UNKNOWN_PARAMETER', parameter: key });
    for (const [key, d] of Object.entries(definition.params)) {
        const v = source[key];
        if (typeof v !== d.type || (typeof v === 'number' && !Number.isFinite(v)))
            errors.push({ code: 'NEON_PARAMETER_TYPE', parameter: key });
        else if (d.enum && !d.enum.includes(v as string)) errors.push({ code: 'NEON_PARAMETER_ENUM', parameter: key });
        else if (typeof v === 'string' && key.endsWith('Color') && !COLOR_PATTERN.test(v))
            errors.push({ code: 'NEON_COLOR_FORMAT', parameter: key });
        else if (typeof v === 'number' && ((d.min !== undefined && v < d.min) || (d.max !== undefined && v > d.max)))
            errors.push({ code: 'NEON_PARAMETER_RANGE', parameter: key });
    }
    return errors.length ? { ok: false, errors } : { ok: true, errors, values: { ...source } as unknown as NeonParams };
}
