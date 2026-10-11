// C04 input-dissolve parameter contract (schema shaders-effect-contract/1).
export interface Definition {
    name: string;
    version: string;
    params: Record<string, ParamDefinition>;
}
export interface ParamDefinition {
    type: 'number' | 'enum';
    values?: string[];
    default: number | string;
    min?: number;
    max?: number;
    step?: number;
    description?: string;
}
export interface InputDissolveParams {
    route: 'image' | 'procedural' | 'rendered';
    progress: number;
    scale: number;
    softness: number;
    seed: number;
    invert: 'off' | 'on';
    dissolveEnabled: 'on' | 'off';
    time: number;
}
export type ValidationResult =
    { ok: true; values: InputDissolveParams } | { ok: false; errors: { code: string; parameter: string }[] };

const NUMBER_BOUNDS: Record<string, [number, number]> = {
    progress: [0, 1],
    scale: [0.5, 20],
    softness: [0, 1],
    seed: [0, 100],
    time: [0, 3600],
};

export function validate(
    definition: Definition,
    values: unknown,
): { ok: boolean; errors: { code: string; parameter: string }[]; values?: InputDissolveParams } {
    const errors: { code: string; parameter: string }[] = [];
    if (!values || typeof values !== 'object' || Array.isArray(values))
        return { ok: false, errors: [{ code: 'INPUTDISSOLVE_PARAMETERS', parameter: '$' }] };
    const record = values as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, def] of Object.entries(definition.params)) {
        if (!(key in record)) {
            errors.push({ code: 'INPUTDISSOLVE_PARAMETER_MISSING', parameter: key });
            continue;
        }
        const v = record[key];
        if (def.type === 'number') {
            if (typeof v !== 'number' || !Number.isFinite(v)) {
                errors.push({ code: 'INPUTDISSOLVE_PARAMETER_TYPE', parameter: key });
                continue;
            }
            const [min, max] = NUMBER_BOUNDS[key] ?? [-Infinity, Infinity];
            if (v < min || v > max) {
                errors.push({ code: 'INPUTDISSOLVE_PARAMETER_RANGE', parameter: key });
                continue;
            }
            out[key] = v;
        } else {
            if (typeof v !== 'string' || !def.values!.includes(v)) {
                errors.push({ code: 'INPUTDISSOLVE_PARAMETER_ENUM', parameter: key });
                continue;
            }
            out[key] = v;
        }
    }
    for (const key of Object.keys(record))
        if (!(key in definition.params)) errors.push({ code: 'INPUTDISSOLVE_UNKNOWN_PARAMETER', parameter: key });
    if (errors.length) return { ok: false, errors };
    return { ok: true, errors: [], values: out as unknown as InputDissolveParams };
}
