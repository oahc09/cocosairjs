export interface Descriptor {
    type: 'number' | 'string';
    defaultValue: number | string;
    min?: number;
    max?: number;
    enum?: string[];
    updateMode: string;
    description: string;
    unit?: string;
    step?: number;
}
export interface Definition {
    schemaVersion: string;
    name: string;
    version: string;
    params: Record<string, Descriptor>;
}
export interface FilmParams {
    shape: 'circle' | 'rounded-box';
    rimWidth: number;
    edgeSoftness: number;
    thickness: number;
    dispersion: number;
    saturation: number;
    phase: number;
    lightAngle: number;
    speed: number;
    opacity: number;
}
export function validate(
    definition: Definition,
    value: unknown,
): { ok: boolean; errors: { code: string; parameter: string }[]; values?: FilmParams } {
    const errors: { code: string; parameter: string }[] = [];
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { ok: false, errors: [{ code: 'FILM_PARAMETERS', parameter: '$' }] };
    const source = value as Record<string, unknown>;
    for (const key of Object.keys(source))
        if (!Object.hasOwn(definition.params, key)) errors.push({ code: 'FILM_UNKNOWN_PARAMETER', parameter: key });
    for (const [key, d] of Object.entries(definition.params)) {
        const v = source[key];
        if (typeof v !== d.type || (typeof v === 'number' && !Number.isFinite(v)))
            errors.push({ code: 'FILM_PARAMETER_TYPE', parameter: key });
        else if (d.enum && !d.enum.includes(v as string)) errors.push({ code: 'FILM_PARAMETER_ENUM', parameter: key });
        else if (typeof v === 'number' && ((d.min !== undefined && v < d.min) || (d.max !== undefined && v > d.max)))
            errors.push({ code: 'FILM_PARAMETER_RANGE', parameter: key });
    }
    return errors.length ? { ok: false, errors } : { ok: true, errors, values: { ...source } as unknown as FilmParams };
}
