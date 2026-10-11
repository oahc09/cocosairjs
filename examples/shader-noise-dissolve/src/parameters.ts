/** Example-local contract. No runtime/framework import; continuous seed is a domain offset. */
export const definition = {
    schemaVersion: 'shaders-effect-contract/1',
    name: 'shader-noise-dissolve',
    version: '1.0.0',
    params: {
        progress: {
            type: 'number',
            defaultValue: 0.5,
            min: 0,
            max: 1,
            step: 0.01,
            unit: 'ratio',
            updateMode: 'uniform',
            description: '0 fully visible, 1 fully removed.',
        },
        scale: {
            type: 'number',
            defaultValue: 3,
            min: 0.5,
            max: 20,
            step: 0.1,
            unit: 'UV-frequency',
            updateMode: 'uniform',
            description: 'Frequency in the aspect-correct UV domain.',
        },
        softness: {
            type: 'number',
            defaultValue: 0.25,
            min: 0,
            max: 1,
            step: 0.01,
            unit: 'coverage',
            updateMode: 'uniform',
            description: 'Feather width; exactly zero uses a hard step.',
        },
        seed: {
            type: 'number',
            defaultValue: 0,
            min: 0,
            max: 100,
            step: 0.01,
            unit: 'continuous-offset',
            updateMode: 'uniform',
            description: 'Continuous domain offset, never rounded into an integer seed.',
        },
        invert: {
            type: 'boolean',
            defaultValue: false,
            updateMode: 'uniform',
            description: 'Invert coverage, not progress.',
        },
    },
} as const;
export type Parameters = { progress: number; scale: number; softness: number; seed: number; invert: boolean };
export const defaults: Parameters = { progress: 0.5, scale: 3, softness: 0.25, seed: 0, invert: false };
export function validateParameters(value: unknown): Parameters {
    if (
        value === null ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    )
        throw new Error('E01_INVALID_PARAMETERS');
    const record = value as Record<string, unknown>;
    for (const key of Reflect.ownKeys(record)) {
        if (typeof key !== 'string' || !Object.hasOwn(definition.params, key)) throw new Error('E01_UNKNOWN_PARAMETER');
        if (!Object.hasOwn(Object.getOwnPropertyDescriptor(record, key)!, 'value'))
            throw new Error('E01_INVALID_PARAMETERS');
    }
    for (const [key, descriptor] of Object.entries(definition.params)) {
        const v = record[key];
        if (descriptor.type === 'boolean') {
            if (typeof v !== 'boolean') throw new Error('E01_INVALID_TYPE');
        } else {
            if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('E01_INVALID_NUMBER');
            if ('min' in descriptor && (v < descriptor.min || v > descriptor.max)) throw new Error('E01_OUT_OF_RANGE');
        }
    }
    return { ...record } as Parameters;
}
