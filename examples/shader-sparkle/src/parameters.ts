export interface SparkleParams {
    size: number;
    intensity: number;
    threshold: number;
    expand: number;
    rayLength: number;
    colorize: number;
    speed: number;
    seed: number;
}
export interface Descriptor {
    type: string;
    defaultValue: number;
    min: number;
    max: number;
    step: number;
    unit: string;
    updateMode: string;
    description: string;
}
export interface Definition {
    schemaVersion: string;
    name: string;
    version: string;
    params: Record<string, Descriptor>;
}
export const defaults: SparkleParams = {
    size: 100,
    intensity: 10,
    threshold: 0.2,
    expand: 0,
    rayLength: 5,
    colorize: 0.45,
    speed: 1,
    seed: 0,
};
export function validate(
    definition: Definition,
    value: unknown,
): { ok: boolean; values?: SparkleParams; errorCode?: string; errors?: string[] } {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return { ok: false, errorCode: 'SPARKLE_PARAMETERS', errors: ['object required'] };
    const values = value as Record<string, unknown>,
        errors: string[] = [];
    for (const key of Object.keys(values)) if (!(key in definition.params)) errors.push(key + ': unknown');
    for (const [key, d] of Object.entries(definition.params)) {
        const v = values[key];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < d.min || v > d.max)
            errors.push(key + ': finite range ' + d.min + '..' + d.max);
    }
    return errors.length
        ? { ok: false, errorCode: 'SPARKLE_PARAMETERS', errors }
        : { ok: true, values: { ...values } as unknown as SparkleParams };
}
