// Independent test-only binary64 reference. No runtime, generated shader, or production math imports.
// The selected operator is Cocos' scalar fit, not the matrix-based three.js ACES operator.
const scalar = (value) => {
    const x = Math.min(value, 8);
    return (2.51 * x * x + 0.03 * x) / (2.43 * x * x + 0.59 * x + 0.14);
};
const gammaDecode = (value) => value ** 2;
const gammaEncode = (value) => Math.sqrt(value);
const srgbDecode = (value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const srgbEncode = (value) => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);
const clamp = (value) => Math.max(0, Math.min(1, value));
function output(rgba, { hdr = true, toneMapping = 'default', floatOutput = false } = {}) {
    if (floatOutput) return [...rgba];
    return [
        ...rgba.slice(0, 3).map((value) => gammaEncode(hdr && toneMapping === 'default' ? scalar(value) : value)),
        rgba[3],
    ];
}
function decodeRGBA(rgba, mode) {
    const decode = mode === 'hardware-srgb' ? srgbDecode : mode === 'shader-srgb' ? gammaDecode : (value) => value;
    return [...rgba.slice(0, 3).map(decode), rgba[3]];
}
// Explicit source-over on linear values. Premultiplication is after decoding, never encoded RGB * alpha.
function sourceOver(source, destination, premultiplied = false) {
    const weight = premultiplied ? 1 : source[3];
    return [
        ...source.slice(0, 3).map((value, index) => value * weight + destination[index] * (1 - source[3])),
        source[3] + destination[3] * (1 - source[3]),
    ];
}
function cameraExposure(aperture, shutterSeconds, iso) {
    return (0.833333 * shutterSeconds * iso) / (100 * aperture * aperture);
}
function depthAtDistance(distance, near, far) {
    return (far * (distance - near)) / (distance * (far - near));
}
function distanceAtDepth(depth, near, far) {
    return (near * far) / (far - depth * (far - near));
}
module.exports = {
    scalar,
    gammaDecode,
    gammaEncode,
    srgbDecode,
    srgbEncode,
    output,
    decodeRGBA,
    sourceOver,
    cameraExposure,
    depthAtDistance,
    distanceAtDepth,
    clamp,
};
