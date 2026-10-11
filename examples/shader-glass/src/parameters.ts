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
export type GlassShape = 'circle' | 'rounded-box';
export type SourceKind = 'standard' | 'blank';
export interface GlassParams {
    shape: GlassShape;
    scale: number;
    rotation: number;
    refraction: number;
    thickness: number;
    blur: number;
    aberration: number;
    innerZoom: number;
    edgeSoftness: number;
    lightAngle: number;
    highlight: number;
    highlightSoftness: number;
    fresnel: number;
    fresnelSoftness: number;
    tintIntensity: number;
    tintPreserveLuminosity: number;
    tintColor: string;
    cutout: 'none' | 'shape';
    sourceKind: SourceKind;
}

/**
 * Total parameter gate: unknown keys, wrong types, non-finite numbers, range violations and
 * non-enum values are all rejected before any state changes with no partial application.
 */
export function validate(
    definition: Definition,
    value: unknown,
): { ok: boolean; errors: { code: string; parameter: string }[]; values?: GlassParams } {
    const errors: { code: string; parameter: string }[] = [];
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { ok: false, errors: [{ code: 'GLASS_PARAMETERS', parameter: '$' }] };
    const source = value as Record<string, unknown>;
    for (const key of Object.keys(source))
        if (!Object.hasOwn(definition.params, key)) errors.push({ code: 'GLASS_UNKNOWN_PARAMETER', parameter: key });
    for (const [key, d] of Object.entries(definition.params)) {
        const v = source[key];
        if (typeof v !== d.type || (typeof v === 'number' && !Number.isFinite(v)))
            errors.push({ code: 'GLASS_PARAMETER_TYPE', parameter: key });
        else if (d.unit === 'hex-rgb' && (typeof v !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(v)))
            errors.push({ code: 'GLASS_PARAMETER_COLOR', parameter: key });
        else if (d.enum && !d.enum.includes(v as string)) errors.push({ code: 'GLASS_PARAMETER_ENUM', parameter: key });
        else if (typeof v === 'number' && ((d.min !== undefined && v < d.min) || (d.max !== undefined && v > d.max)))
            errors.push({ code: 'GLASS_PARAMETER_RANGE', parameter: key });
    }
    return errors.length
        ? { ok: false, errors }
        : { ok: true, errors, values: { ...source } as unknown as GlassParams };
}
