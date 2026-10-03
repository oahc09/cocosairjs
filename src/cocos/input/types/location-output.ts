import { Vec2 } from '../../core/math/vec2';

/** Shared output contract for mouse and touch coordinates, independent of AIR bootstrap. */
export function locationOutput (out: Vec2 | undefined, method: string): Vec2 {
    if (out === undefined) {
        return new Vec2();
    }
    if (!(out instanceof Vec2) || Object.isFrozen(out)) {
        throw Object.assign(new TypeError(`[AIR_E_INPUT_LOCATION_OUT] ${method}(out) expects a writable Vec2 instance or an omitted argument; use new Vec2().`), {
            code: 'AIR_E_INPUT_LOCATION_OUT', method, expected: 'writable Vec2 | undefined',
        });
    }
    return out;
}
