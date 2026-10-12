/** Example-local atomic validation; frozen mother schemas remain unchanged. */
export function validateParameters(definition: any, input: unknown) {
    const reject = (error: string) => ({ ok: false, values: undefined, errors: [error] });
    if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(input))
    )
        return reject('FUSION_PARAMETERS');
    const own = Object.getOwnPropertyDescriptors(input);
    if (Object.getOwnPropertySymbols(input).length || Object.values(own).some((d) => !('value' in d)))
        return reject('FUSION_PARAMETERS');
    const values: Record<string, any> = Object.fromEntries(
        Object.entries(definition.params).map(([k, d]) => [k, (d as any).defaultValue]),
    );
    const errors: string[] = [];
    for (const [key, descriptor] of Object.entries(own)) {
        const d = definition.params[key],
            v = descriptor.value;
        if (
            !Object.prototype.hasOwnProperty.call(definition.params, key) ||
            !d ||
            (d.type === 'number' && (typeof v !== 'number' || !Number.isFinite(v) || v < d.min || v > d.max)) ||
            (d.type === 'string' && typeof v !== 'string') ||
            (d.enum && !d.enum.includes(v)) ||
            (d.unit === 'hex-rgb' && (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)))
        )
            errors.push(key);
        else values[key] = v;
    }
    return { ok: errors.length === 0, values: errors.length ? undefined : values, errors };
}
