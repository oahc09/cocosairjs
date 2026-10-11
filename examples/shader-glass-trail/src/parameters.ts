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
export type GlassTrailShape = 'circle' | 'rounded-box';
export interface GlassTrailParams {
    shape: GlassTrailShape;
    glassEnabled: 'on' | 'off';
    trailEnabled: 'on' | 'off';
    trailColorA: string;
    trailColorB: string;
    trailRadius: number;
    trailLength: number;
    trailShrink: number;
    trailSoftness: number;
    glassRefraction: number;
    glassThickness: number;
    glassBlur: number;
    glassAberration: number;
    glassInnerZoom: number;
    glassEdgeSoftness: number;
    glassLightAngle: number;
    glassHighlight: number;
    glassFresnel: number;
    time: number;
}
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
export function validate(
    definition: Definition,
    value: unknown,
): { ok: boolean; errors: { code: string; parameter: string }[]; values?: GlassTrailParams } {
    const errors: { code: string; parameter: string }[] = [];
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { ok: false, errors: [{ code: 'GLASSTRAIL_PARAMETERS', parameter: '$' }] };
    const source = value as Record<string, unknown>;
    for (const key of Object.keys(source))
        if (!Object.hasOwn(definition.params, key))
            errors.push({ code: 'GLASSTRAIL_UNKNOWN_PARAMETER', parameter: key });
    for (const [key, d] of Object.entries(definition.params)) {
        const v = source[key];
        if (typeof v !== d.type || (typeof v === 'number' && !Number.isFinite(v)))
            errors.push({ code: 'GLASSTRAIL_PARAMETER_TYPE', parameter: key });
        else if (d.enum && !d.enum.includes(v as string))
            errors.push({ code: 'GLASSTRAIL_PARAMETER_ENUM', parameter: key });
        else if ((key === 'trailColorA' || key === 'trailColorB') && !COLOR_PATTERN.test(v as string))
            errors.push({ code: 'GLASSTRAIL_COLOR_FORMAT', parameter: key });
        else if (
            typeof v === 'number' &&
            key !== 'trailColorA' &&
            key !== 'trailColorB' &&
            ((d.min !== undefined && v < d.min) || (d.max !== undefined && v > d.max))
        )
            errors.push({ code: 'GLASSTRAIL_PARAMETER_RANGE', parameter: key });
    }
    return errors.length
        ? { ok: false, errors }
        : { ok: true, errors, values: { ...source } as unknown as GlassTrailParams };
}
