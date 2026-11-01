// Independent research math. No engine imports and no runtime capability claim.
export const ranges = Object.freeze([
    { near: 0.1, far: 1000 },
    { near: 1, far: 100000 },
    { near: 10, far: 10000000 },
]);
export const formats = Object.freeze(['depth16', 'depth24', 'depth32f', 'depth24-stencil8']);
export function validateExperiment(options = {}) {
    const allowed = ['backend', 'format', 'mode', 'samples', 'shadows', 'pipeline'];
    for (const key of Object.keys(options)) if (!allowed.includes(key)) throw new Error(`UNSUPPORTED_OPTION: ${key}`);
    const value = {
        backend: 'webgl2',
        format: 'depth24-stencil8',
        mode: 'normal',
        samples: 1,
        shadows: false,
        pipeline: 'isolated',
        ...options,
    };
    if (value.backend !== 'webgl2')
        throw new Error('UNSUPPORTED_BACKEND: WebGPU requires a separate implemented fixture');
    if (!formats.includes(value.format)) throw new Error('UNSUPPORTED_FORMAT');
    if (!['normal', 'reverse'].includes(value.mode)) throw new Error('UNSUPPORTED_DEPTH_MODE');
    if (value.samples !== 1) throw new Error('UNSUPPORTED_MSAA: this experiment samples single-sample depth');
    if (value.shadows !== false) throw new Error('UNSUPPORTED_SHADOWS: engine shadow path has not been reversed');
    if (!['isolated', 'native-target'].includes(value.pipeline)) throw new Error('UNSUPPORTED_PIPELINE');
    if (value.pipeline === 'native-target' && (value.mode !== 'normal' || value.format !== 'depth24-stencil8'))
        throw new Error('UNSUPPORTED_NATIVE_DEPTH: engine defaults and target format remain unchanged');
    return Object.freeze(value);
}
function range(near, far) {
    if (![near, far].every(Number.isFinite) || near <= 0 || far <= near) throw new Error('INVALID_NEAR_FAR');
}
export function depthAt(distance, near, far, mode = 'normal') {
    range(near, far);
    if (!Number.isFinite(distance) || distance < near || distance > far) throw new Error('DISTANCE_OUTSIDE_FRUSTUM');
    if (!['normal', 'reverse'].includes(mode)) throw new Error('UNSUPPORTED_DEPTH_MODE');
    // Direct expressions avoid introducing cancellation by subtracting the reverse value from one.
    return mode === 'normal'
        ? (far * (distance - near)) / (distance * (far - near))
        : (near * (far - distance)) / (distance * (far - near));
}
export function reconstruct(depth, near, far, mode = 'normal') {
    range(near, far);
    if (!Number.isFinite(depth) || depth < 0 || depth > 1) throw new Error('INVALID_DEPTH');
    if (!['normal', 'reverse'].includes(mode)) throw new Error('UNSUPPORTED_DEPTH_MODE');
    return (near * far) / (mode === 'normal' ? far - depth * (far - near) : near + depth * (far - near));
}
export function projection(near, far, mode = 'normal', clipMin = -1) {
    range(near, far);
    if (![-1, 0].includes(clipMin) || !['normal', 'reverse'].includes(mode)) throw new Error('UNSUPPORTED_PROJECTION');
    const nearNdc = mode === 'normal' ? clipMin : 1;
    const farNdc = mode === 'normal' ? 1 : clipMin;
    const b = ((nearNdc - farNdc) * near * far) / (far - near);
    const a = b / near - nearNdc;
    // Right-handed, view forward -Z; 90 degree vertical FOV, unit aspect, column major.
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, a, -1, 0, 0, b, 0];
}
export function convention(mode) {
    if (!['normal', 'reverse'].includes(mode)) throw new Error('UNSUPPORTED_DEPTH_MODE');
    return { clear: mode === 'normal' ? 1 : 0, compare: mode === 'normal' ? 'LESS' : 'GREATER', reconstruction: mode };
}
export function quantizeDepth(depth, format) {
    if (!Number.isFinite(depth) || depth < 0 || depth > 1) throw new Error('INVALID_DEPTH');
    if (!formats.includes(format)) throw new Error('UNSUPPORTED_FORMAT');
    if (format === 'depth32f') return Math.fround(depth);
    const scale = 2 ** (format === 'depth16' ? 16 : 24) - 1;
    return Math.round(depth * scale) / scale;
}
export function pairs(near, far) {
    range(near, far);
    return [near * 2, Math.sqrt(near * far), far * 0.9].flatMap((distance, index) => [
        { id: `range-${index}-separated`, distances: [distance, distance * 1.01] },
        { id: `range-${index}-close`, distances: [distance, distance * (1 + 2 ** -20)] },
    ]);
}
export function decodeFloat(bytes) {
    if (!Array.isArray(bytes) || bytes.length !== 4 || !bytes.every((v) => Number.isInteger(v) && v >= 0 && v <= 255))
        throw new Error('INVALID_FLOAT_BYTES');
    return new DataView(Uint8Array.from(bytes).buffer).getFloat32(0, true);
}
