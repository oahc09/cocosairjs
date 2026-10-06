/** Reject poisoned native TRS before modifying the node or its descendants. */
export function validateTransformValues (method: string, values: readonly unknown[], node: string): void {
    if (values.some(value => typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(Math.fround(value)))) {
        throw Object.assign(new TypeError(`[AIR_E_NODE_TRANSFORM] ${method} requires finite float32 components; use a Vec3/Quat or the documented numeric overload`),
            { code: 'AIR_E_NODE_TRANSFORM', method, node });
    }
}
