/** Runtime setter diagnostics. No dependency on AIR bootstrap or per-frame scans. */
export function propertyTypeError (code: string, property: string, expected: string, example: string): TypeError {
    return Object.assign(new TypeError(`[${code}] ${property}: expected ${expected}. Example: ${example}`), {
        code, property, expected, example,
    });
}

/** Reject finite JS values that would overflow a float32 shader value as well. */
export function isFiniteShaderNumber (value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && Number.isFinite(Math.fround(value));
}

export function validateLightNumber (property: string, value: unknown): void {
    if (!isFiniteShaderNumber(value)) {
        throw propertyTypeError('AIR_E_LIGHT_TYPE', property, 'a finite float32 number', `${property} = 1`);
    }
}
