/** Inclusive numeric probe ranges. Invalid contracts or non-finite actual values fail. */
function evaluateProbeRanges(probe, ranges) {
    if (ranges === undefined) return [];
    if (!ranges || typeof ranges !== 'object' || Array.isArray(ranges)) {
        return [{ assertion: 'probeRangesContract', ok: false, detail: 'probeRanges must be an object' }];
    }
    return Object.entries(ranges).map(([field, bounds]) => {
        const row = { assertion: `probeRange:${field}`, expected: bounds };
        const validBounds =
            field.length > 0 &&
            bounds &&
            typeof bounds === 'object' &&
            !Array.isArray(bounds) &&
            Object.keys(bounds).every((key) => key === 'min' || key === 'max') &&
            (Object.hasOwn(bounds, 'min') || Object.hasOwn(bounds, 'max')) &&
            (!Object.hasOwn(bounds, 'min') || (typeof bounds.min === 'number' && Number.isFinite(bounds.min))) &&
            (!Object.hasOwn(bounds, 'max') || (typeof bounds.max === 'number' && Number.isFinite(bounds.max))) &&
            (!(Object.hasOwn(bounds, 'min') && Object.hasOwn(bounds, 'max')) || bounds.min <= bounds.max);
        if (!validBounds) return { ...row, ok: false, detail: 'range requires finite min/max bounds with min <= max' };
        const actual = field.split('.').reduce((value, key) => (value == null ? undefined : value[key]), probe);
        if (typeof actual !== 'number' || !Number.isFinite(actual)) {
            return {
                ...row,
                actual,
                ok: false,
                detail: 'actual must be a finite number; missing, null and coercible values are rejected',
            };
        }
        const ok =
            (!Object.hasOwn(bounds, 'min') || actual >= bounds.min) &&
            (!Object.hasOwn(bounds, 'max') || actual <= bounds.max);
        return { ...row, actual, ok };
    });
}
module.exports = { evaluateProbeRanges };
