/** Public target wire uses F32 poses. These helpers only plan requests; never move a body. */
const view = new DataView(new ArrayBuffer(4));
function adjacent(value, increase) {
    if (value === 0) return increase ? Math.pow(2, -149) : -Math.pow(2, -149);
    view.setFloat32(0, value, false);
    let bits = view.getUint32(0, false);
    bits += value > 0 === increase ? 1 : -1;
    view.setUint32(0, bits, false);
    return view.getFloat32(0, false);
}
export function quantizeTranslationTarget(origin, target) {
    if (
        !Array.isArray(origin) ||
        !Array.isArray(target) ||
        origin.length !== 3 ||
        target.length !== 3 ||
        ![...origin, ...target].every(Number.isFinite) ||
        origin.some((v) => Math.fround(v) !== v)
    )
        return { ready: false, reason: 'finite-committed-f32-origin-required' };
    const position = target.map((v, i) => {
        let q = Math.fround(v);
        if (v > origin[i] && q > v) q = adjacent(q, false);
        if (v < origin[i] && q < v) q = adjacent(q, true);
        return q;
    });
    const roundedPosition = [...position];
    const translation = position.map((v, i) => Math.fround(v - origin[i]));
    if (![...position, ...translation].every(Number.isFinite))
        return { ready: false, reason: 'unrepresentable-translation-target' };
    // At most two displacement candidates per vector: the rounded delta, then
    // one adjacent F32 toward zero only for axes whose first endpoint is unsafe.
    // Both candidates require exact bidirectional encoding and an in-segment endpoint.
    const initialTranslation = [...translation];
    const inwardAdjustedAxes = [];
    for (let i = 0; i < 3; i++) {
        const valid = (endpoint, delta) =>
            Number.isFinite(endpoint) &&
            endpoint >= Math.min(origin[i], target[i]) &&
            endpoint <= Math.max(origin[i], target[i]) &&
            Math.fround(endpoint - origin[i]) === delta;
        let endpoint = Math.fround(origin[i] + translation[i]);
        if (!valid(endpoint, translation[i])) {
            if (translation[i] === 0) return { ready: false, reason: 'unrepresentable-translation-target' };
            translation[i] = adjacent(translation[i], translation[i] < 0);
            endpoint = Math.fround(origin[i] + translation[i]);
            if (!valid(endpoint, translation[i])) return { ready: false, reason: 'unrepresentable-translation-target' };
            inwardAdjustedAxes.push(i);
        }
        position[i] = endpoint;
    }
    return {
        ready: true,
        position,
        translation,
        quantization: {
            requested: [...target],
            roundedPosition,
            initialTranslation,
            inwardAdjustedAxes,
            position: [...position],
            translation: [...translation],
            recomposed: position.some((v, i) => v !== roundedPosition[i]),
        },
    };
}
