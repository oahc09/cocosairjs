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
export type FilmNeonShape = 'circle' | 'rounded-box';
export type LayerToggle = 'on' | 'off';
export interface FilmNeonParams {
    shape: FilmNeonShape;
    filmEnabled: LayerToggle;
    neonEnabled: LayerToggle;
    rimWidth: number;
    edgeSoftness: number;
    thickness: number;
    dispersion: number;
    saturation: number;
    phase: number;
    opacity: number;
    tubeColor: string;
    secondaryColor: string;
    glowColor: string;
    secondaryBlend: number;
    tubeThickness: number;
    intensity: number;
    hotCoreIntensity: number;
    glowIntensity: number;
    glowRadius: number;
    lightAngle: number;
    specularIntensity: number;
    specularSize: number;
    cornerSmoothing: number;
}
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
export function decodeColor(value: string): [number, number, number] {
    const channel = (x: number) => (x / 255 <= 0.04045 ? x / 255 / 12.92 : Math.pow((x / 255 + 0.055) / 1.055, 2.4));
    return [1, 3, 5].map((o) => channel(parseInt(value.slice(o, o + 2), 16))) as [number, number, number];
}
/**
 * Total parameter gate: null / structural garbage / unknown keys / wrong types / non-finite
 * numbers / range violations / non-enum / malformed colors are rejected before any state changes
 * with no partial application.
 */
export function validate(
    definition: Definition,
    value: unknown,
): { ok: boolean; errors: { code: string; parameter: string }[]; values?: FilmNeonParams } {
    const errors: { code: string; parameter: string }[] = [];
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { ok: false, errors: [{ code: 'FILMNEON_PARAMETERS', parameter: '$' }] };
    const source = value as Record<string, unknown>;
    for (const key of Object.keys(source))
        if (!Object.hasOwn(definition.params, key)) errors.push({ code: 'FILMNEON_UNKNOWN_PARAMETER', parameter: key });
    for (const [key, d] of Object.entries(definition.params)) {
        const v = source[key];
        if (typeof v !== d.type || (typeof v === 'number' && !Number.isFinite(v)))
            errors.push({ code: 'FILMNEON_PARAMETER_TYPE', parameter: key });
        else if (d.enum && !d.enum.includes(v as string))
            errors.push({ code: 'FILMNEON_PARAMETER_ENUM', parameter: key });
        else if (
            (key === 'tubeColor' || key === 'secondaryColor' || key === 'glowColor') &&
            !COLOR_PATTERN.test(v as string)
        )
            errors.push({ code: 'FILMNEON_COLOR_FORMAT', parameter: key });
        else if (
            typeof v === 'number' &&
            key !== 'tubeColor' &&
            key !== 'secondaryColor' &&
            key !== 'glowColor' &&
            ((d.min !== undefined && v < d.min) || (d.max !== undefined && v > d.max))
        )
            errors.push({ code: 'FILMNEON_PARAMETER_RANGE', parameter: key });
    }
    return errors.length
        ? { ok: false, errors }
        : { ok: true, errors, values: { ...source } as unknown as FilmNeonParams };
}
