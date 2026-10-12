// Wave5 Effect Driver: declarative input bindings → real Material uniform updates.
// Pure parameter mapping — no canvas/RAF/runtime abstraction. All params batch-validated
// atomically; NaN/Inf/unknown/backwards ranges reject before any state mutation.

export interface DriverBinding {
    source: 'pointer' | 'time' | 'auto';
    axis?: 'uv' | 'x' | 'y';
    period?: number;
    amplitude?: number;
    phase?: number;
    inputMin?: number;
    inputMax?: number;
    outputMin?: number;
    outputMax?: number;
    clamp?: boolean;
}

export interface DriverParam {
    target: string;
    binding: DriverBinding;
    defaultValue: number | { x: number; y: number };
}

export interface DriverState {
    pointer: { x: number; y: number };
    time: number;
    generation: number;
    paused: boolean;
    released: boolean;
}

export interface DriverFrame {
    pointer: { x: number; y: number };
    deltaTime: number;
}

export type DriverOutputValue = number | { x: number; y: number };
export type DriverOutput = Record<string, DriverOutputValue>;

export const DRIVER_ERRORS = {
    NULL: 'DRIVER_NULL',
    NOT_OBJECT: 'DRIVER_NOT_OBJECT',
    NOT_ARRAY: 'DRIVER_NOT_ARRAY',
    UNKNOWN_SOURCE: 'DRIVER_UNKNOWN_SOURCE',
    UNKNOWN_AXIS: 'DRIVER_UNKNOWN_AXIS',
    MISSING_TARGET: 'DRIVER_MISSING_TARGET',
    MISSING_DEFAULT: 'DRIVER_MISSING_DEFAULT',
    NAN: 'DRIVER_NAN',
    INFINITE: 'DRIVER_INFINITE',
    ZERO_RANGE: 'DRIVER_ZERO_RANGE',
    BACKWARDS_RANGE: 'DRIVER_BACKWARDS_RANGE',
    NEGATIVE_PERIOD: 'DRIVER_NEGATIVE_PERIOD',
    DUPLICATE_TARGET: 'DRIVER_DUPLICATE_TARGET',
    PARTIAL_RANGE: 'DRIVER_PARTIAL_RANGE',
    INVALID_POINTER: 'DRIVER_INVALID_POINTER',
    INVALID_DT: 'DRIVER_INVALID_DT',
    DISPOSED: 'DRIVER_DISPOSED',
    UNKNOWN_ROOT: 'DRIVER_UNKNOWN_ROOT',
    UNKNOWN_BINDING_KEY: 'DRIVER_UNKNOWN_BINDING_KEY',
    INVALID_CLAMP: 'DRIVER_INVALID_CLAMP',
    STRING_DEFAULT: 'DRIVER_STRING_DEFAULT',
} as const;

const KNOWN_SOURCES = new Set(['pointer', 'time', 'auto']);
const KNOWN_AXES = new Set(['uv', 'x', 'y']);
const KNOWN_ROOT_KEYS = new Set(['bindings']);
const KNOWN_BINDING_KEYS = new Set([
    'source',
    'axis',
    'period',
    'amplitude',
    'phase',
    'inputMin',
    'inputMax',
    'outputMin',
    'outputMax',
    'clamp',
]);
const KNOWN_PARAM_KEYS = new Set(['target', 'binding', 'defaultValue']);

const deepClone = <T>(v: T): T => {
    if (Array.isArray(v)) return v.map(deepClone) as unknown as T;
    if (v && typeof v === 'object') {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(v)) out[k] = deepClone((v as Record<string, unknown>)[k]);
        return out as T;
    }
    return v;
};

export function validateParams(
    params: unknown,
): { ok: true; values: DriverParam[] } | { ok: false; errors: { code: string; target: string }[] } {
    const ancestors = new WeakSet<object>();
    const dataOnly = (value: unknown): boolean => {
        if (value === null || typeof value !== 'object') return true;
        if (ancestors.has(value)) return false;
        ancestors.add(value);
        const valid = Object.values(Object.getOwnPropertyDescriptors(value)).every(
            (d) => 'value' in d && dataOnly(d.value),
        );
        ancestors.delete(value);
        return valid;
    };
    if (!dataOnly(params)) return { ok: false, errors: [{ code: DRIVER_ERRORS.NOT_OBJECT, target: '$' }] };
    if (params === null || params === undefined)
        return { ok: false, errors: [{ code: DRIVER_ERRORS.NULL, target: '$' }] };
    if (typeof params !== 'object' || Array.isArray(params))
        return { ok: false, errors: [{ code: DRIVER_ERRORS.NOT_OBJECT, target: '$' }] };
    for (const key of Object.keys(params as object))
        if (!KNOWN_ROOT_KEYS.has(key))
            return { ok: false, errors: [{ code: DRIVER_ERRORS.UNKNOWN_ROOT, target: key }] };
    if (!('bindings' in params) || !Array.isArray((params as any).bindings))
        return { ok: false, errors: [{ code: DRIVER_ERRORS.NOT_ARRAY, target: 'bindings' }] };
    const errors: { code: string; target: string }[] = [];
    const seenTargets = new Set<string>();
    for (const [i, p] of (params as any).bindings.entries()) {
        const label = `bindings[${i}]`;
        if (!p || typeof p !== 'object' || Array.isArray(p)) {
            errors.push({ code: DRIVER_ERRORS.NOT_OBJECT, target: label });
            continue;
        }
        for (const key of Object.keys(p))
            if (!KNOWN_PARAM_KEYS.has(key))
                errors.push({ code: DRIVER_ERRORS.UNKNOWN_ROOT, target: `${label}.${key}` });
        if (typeof p.target !== 'string' || !p.target.includes('.'))
            errors.push({ code: DRIVER_ERRORS.MISSING_TARGET, target: label });
        else if (seenTargets.has(p.target)) errors.push({ code: DRIVER_ERRORS.DUPLICATE_TARGET, target: p.target });
        else seenTargets.add(p.target);
        if (p.defaultValue === undefined)
            errors.push({ code: DRIVER_ERRORS.MISSING_DEFAULT, target: `${label}.defaultValue` });
        else {
            const isUv = p.binding?.axis === 'uv';
            if (isUv) {
                if (typeof p.defaultValue !== 'object' || p.defaultValue === null || Array.isArray(p.defaultValue))
                    errors.push({ code: DRIVER_ERRORS.STRING_DEFAULT, target: `${label}.defaultValue` });
                else {
                    const { x, y } = p.defaultValue as { x: unknown; y: unknown };
                    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y))
                        errors.push({ code: DRIVER_ERRORS.NAN, target: `${label}.defaultValue` });
                }
            } else {
                if (typeof p.defaultValue !== 'number' || !Number.isFinite(p.defaultValue))
                    errors.push({ code: DRIVER_ERRORS.NAN, target: `${label}.defaultValue` });
            }
        }
        const b = p.binding;
        if (!b || typeof b !== 'object' || Array.isArray(b)) {
            errors.push({ code: DRIVER_ERRORS.NOT_OBJECT, target: `${label}.binding` });
            continue;
        }
        for (const key of Object.keys(b))
            if (!KNOWN_BINDING_KEYS.has(key))
                errors.push({ code: DRIVER_ERRORS.UNKNOWN_BINDING_KEY, target: `${label}.binding.${key}` });
        if (!KNOWN_SOURCES.has(b.source))
            errors.push({ code: DRIVER_ERRORS.UNKNOWN_SOURCE, target: `${label}.source` });
        if (b.axis !== undefined && !KNOWN_AXES.has(b.axis))
            errors.push({ code: DRIVER_ERRORS.UNKNOWN_AXIS, target: `${label}.axis` });
        if (b.clamp !== undefined && typeof b.clamp !== 'boolean')
            errors.push({ code: DRIVER_ERRORS.INVALID_CLAMP, target: `${label}.clamp` });
        for (const key of ['inputMin', 'inputMax', 'outputMin', 'outputMax', 'period', 'amplitude', 'phase']) {
            const v = b[key];
            if (v !== undefined) {
                if (typeof v !== 'number') errors.push({ code: DRIVER_ERRORS.NAN, target: `${label}.${key}` });
                else if (!Number.isFinite(v)) errors.push({ code: DRIVER_ERRORS.INFINITE, target: `${label}.${key}` });
            }
        }
        if (typeof b.period === 'number' && b.period <= 0)
            errors.push({ code: DRIVER_ERRORS.NEGATIVE_PERIOD, target: `${label}.period` });
        // map-range: all four or none
        const rangeKeys = ['inputMin', 'inputMax', 'outputMin', 'outputMax'];
        const presentCount = rangeKeys.filter((k) => b[k] !== undefined).length;
        if (presentCount > 0 && presentCount < 4)
            errors.push({ code: DRIVER_ERRORS.PARTIAL_RANGE, target: `${label}.range` });
        if (presentCount === 4) {
            if (b.outputMin > b.outputMax)
                errors.push({ code: DRIVER_ERRORS.BACKWARDS_RANGE, target: `${label}.outputRange` });
            if (b.inputMin === b.inputMax)
                errors.push({ code: DRIVER_ERRORS.ZERO_RANGE, target: `${label}.inputRange` });
            else if (b.inputMin > b.inputMax)
                errors.push({ code: DRIVER_ERRORS.BACKWARDS_RANGE, target: `${label}.inputRange` });
        }
    }
    if (errors.length) return { ok: false, errors };
    return { ok: true, values: deepClone((params as any).bindings) };
}

export function createDriverState(generation = 1): DriverState {
    return { pointer: { x: 0.5, y: 0.5 }, time: 0, generation, paused: false, released: false };
}

function computeOne(
    binding: DriverBinding,
    state: DriverState,
    frame: DriverFrame | null,
    defaultValue: DriverOutputValue,
): DriverOutputValue {
    const b = binding;
    if (b.source === 'pointer' && b.axis === 'uv') {
        if (!frame) return defaultValue;
        return { x: frame.pointer.x, y: frame.pointer.y }; // both coordinates (no map-range)
    }
    let value: number;
    if (b.source === 'pointer') {
        if (!frame) return defaultValue;
        value = b.axis === 'y' ? frame.pointer.y : frame.pointer.x;
    } else if (b.source === 'time') {
        value = state.time;
    } else if (b.source === 'auto') {
        const period = b.period ?? 1;
        const amplitude = b.amplitude ?? 1;
        const phase = b.phase ?? 0;
        value = amplitude * Math.sin((state.time / period) * Math.PI * 2 + phase);
    } else {
        return defaultValue;
    }
    // map-range (scalar only)
    if (
        b.inputMin !== undefined &&
        b.inputMax !== undefined &&
        b.outputMin !== undefined &&
        b.outputMax !== undefined
    ) {
        const t = (value - b.inputMin) / (b.inputMax - b.inputMin);
        let mapped = b.outputMin + t * (b.outputMax - b.outputMin);
        if (b.clamp !== false) mapped = Math.max(b.outputMin, Math.min(b.outputMax, mapped));
        value = mapped;
    }
    return Number.isFinite(value) ? value : typeof defaultValue === 'number' ? defaultValue : 0;
}

export function computeFrame(state: DriverState, frame: DriverFrame | null, params: DriverParam[]): DriverOutput {
    const out: DriverOutput = {};
    for (const p of params) out[p.target] = computeOne(p.binding, state, frame, p.defaultValue);
    return out;
}

export function driverFrame(state: DriverState, frame: DriverFrame | null, params: DriverParam[]): DriverOutput {
    if (state.released) throw new Error(DRIVER_ERRORS.DISPOSED);
    // Validate pointer and dt BEFORE any state mutation (atomicity).
    if (frame) {
        if (
            typeof frame.pointer?.x !== 'number' ||
            typeof frame.pointer?.y !== 'number' ||
            !Number.isFinite(frame.pointer.x) ||
            !Number.isFinite(frame.pointer.y)
        )
            throw new Error(DRIVER_ERRORS.INVALID_POINTER);
    }
    const dt = frame ? frame.deltaTime : 0;
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt < 0) throw new Error(DRIVER_ERRORS.INVALID_DT);
    // Pause freezes EVERYTHING: pointer, time, and computeFrame output.
    if (!state.paused && dt > 0) {
        // Overflow guard: reject before any state mutation.
        if (!Number.isFinite(state.time + dt)) throw new Error(DRIVER_ERRORS.INVALID_DT);
        state.time += dt;
        if (frame) state.pointer = { ...frame.pointer };
    }
    // When paused, use the frozen state pointer — not the incoming frame's new pointer.
    const effectiveFrame = state.paused ? { pointer: { ...state.pointer }, deltaTime: 0 } : frame;
    return computeFrame(state, effectiveFrame, params);
}
