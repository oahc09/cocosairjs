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
export type LaserShape = 'circle' | 'rounded-box';
export interface LaserCardParams {
    shape: LaserShape;
    holoEnabled: 'on' | 'off';
    embossEnabled: 'on' | 'off';
    sparkleEnabled: 'on' | 'off';
    holoRoughness: number;
    holoCrinkle: number;
    holoSparkle: number;
    holoFoilScale: number;
    holoSaturation: number;
    holoHueShift: number;
    embossDepth: number;
    embossLightAngle: number;
    embossShadowIntensity: number;
    sparkleSize: number;
    sparkleIntensity: number;
    sparkleThreshold: number;
    sparkleRayLength: number;
    sparkleColorize: number;
    sparkleSeed: number;
    time: number;
}
const PREFIXES = ['holo', 'emboss', 'sparkle', 'shape', 'time'];
export function validate(
    definition: Definition,
    value: unknown,
): { ok: boolean; errors: { code: string; parameter: string }[]; values?: LaserCardParams } {
    const errors: { code: string; parameter: string }[] = [];
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { ok: false, errors: [{ code: 'LASER_PARAMETERS', parameter: '$' }] };
    const source = value as Record<string, unknown>;
    for (const key of Object.keys(source))
        if (!Object.hasOwn(definition.params, key)) errors.push({ code: 'LASER_UNKNOWN_PARAMETER', parameter: key });
    for (const [key, d] of Object.entries(definition.params)) {
        const v = source[key];
        if (typeof v !== d.type || (typeof v === 'number' && !Number.isFinite(v)))
            errors.push({ code: 'LASER_PARAMETER_TYPE', parameter: key });
        else if (d.enum && !d.enum.includes(v as string)) errors.push({ code: 'LASER_PARAMETER_ENUM', parameter: key });
        else if (typeof v === 'number' && ((d.min !== undefined && v < d.min) || (d.max !== undefined && v > d.max)))
            errors.push({ code: 'LASER_PARAMETER_RANGE', parameter: key });
    }
    return errors.length
        ? { ok: false, errors }
        : { ok: true, errors, values: { ...source } as unknown as LaserCardParams };
}
