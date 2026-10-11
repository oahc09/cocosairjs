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
export type EmbossShape = 'circle' | 'rounded-box';
export type SourceKind = 'standard' | 'blank';
export interface EmbossParams {
    shape: EmbossShape;
    scale: number;
    rotation: number;
    depth: number;
    lightAngle: number;
    lightIntensity: number;
    shadowIntensity: number;
    sourceKind: SourceKind;
}
/**
 * Total parameter gate: unknown keys, wrong types, non-finite numbers, range violations and
 * non-enum values are all rejected before any state changes with no partial application.
 */
export function validate(
    definition: Definition,
    value: unknown,
): { ok: boolean; errors: { code: string; parameter: string }[]; values?: EmbossParams } {
    const errors: { code: string; parameter: string }[] = [];
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { ok: false, errors: [{ code: 'EMBOSS_PARAMETERS', parameter: '$' }] };
    const source = value as Record<string, unknown>;
    for (const key of Object.keys(source))
        if (!Object.hasOwn(definition.params, key)) errors.push({ code: 'EMBOSS_UNKNOWN_PARAMETER', parameter: key });
    for (const [key, d] of Object.entries(definition.params)) {
        const v = source[key];
        if (typeof v !== d.type || (typeof v === 'number' && !Number.isFinite(v)))
            errors.push({ code: 'EMBOSS_PARAMETER_TYPE', parameter: key });
        else if (d.enum && !d.enum.includes(v as string))
            errors.push({ code: 'EMBOSS_PARAMETER_ENUM', parameter: key });
        else if (typeof v === 'number' && ((d.min !== undefined && v < d.min) || (d.max !== undefined && v > d.max)))
            errors.push({ code: 'EMBOSS_PARAMETER_RANGE', parameter: key });
    }
    return errors.length
        ? { ok: false, errors }
        : { ok: true, errors, values: { ...source } as unknown as EmbossParams };
}
