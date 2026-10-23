/* U08-C research-only CPU oracle. No engine imports, no runtime or baker integration. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.UpstreamProbeSH = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';
    const FACE_ORDER = Object.freeze(['+X', '-X', '+Y', '-Y', '+Z', '-Z']);
    // Coefficients multiply [1,y,z,x,xy,yz,z²-1/3,zx,x²-y²]. No Condon-Shortley minus signs.
    const BASIS = Object.freeze([
        Math.sqrt(1 / (4 * Math.PI)),
        Math.sqrt(3 / (4 * Math.PI)),
        Math.sqrt(3 / (4 * Math.PI)),
        Math.sqrt(3 / (4 * Math.PI)),
        Math.sqrt(15 / (4 * Math.PI)),
        Math.sqrt(15 / (4 * Math.PI)),
        3 * Math.sqrt(5 / (16 * Math.PI)),
        Math.sqrt(15 / (4 * Math.PI)),
        Math.sqrt(15 / (16 * Math.PI)),
    ]);
    const COSINE = Object.freeze([Math.PI, (2 * Math.PI) / 3, Math.PI / 4]);
    // Adapter constants, NOT the independent integration oracle. Source: cocos/gi/light-probe/sh.ts.
    const COCOS_BASIS_OVER_PI = Object.freeze([
        0.0897936, 0.155527, 0.155527, 0.155527, 0.347769, 0.347769, 0.301177, 0.347769, 0.173884,
    ]);
    const band = (i) => (i === 0 ? 0 : i < 4 ? 1 : 2);
    function sizeCheck(size) {
        if (!Number.isInteger(size) || size < 1) throw new RangeError('SH_SIZE: positive integer required');
    }
    function unit(v) {
        if (!v || v.length !== 3 || !Array.from(v).every(Number.isFinite)) throw new TypeError('SH_DIRECTION');
        const length = Math.hypot(...v);
        if (!length) throw new RangeError('SH_ZERO_DIRECTION');
        return v.map((x) => x / length);
    }
    function basis(direction) {
        const [x, y, z] = unit(direction);
        return [1, y, z, x, x * y, y * z, z * z - 1 / 3, z * x, x * x - y * y].map((p, i) => p * BASIS[i]);
    }
    function faceDirection(face, u, v, convention = 'webgl-cube') {
        if (!Number.isInteger(face) || face < 0 || face > 5 || !Number.isFinite(u) || !Number.isFinite(v))
            throw new RangeError('SH_FACE');
        // u and v increase with column and row. Rows are bottom-to-top readPixels rows, NOT image rows.
        if (convention === 'webgl-cube')
            return unit(
                [
                    [1, -v, -u],
                    [-1, -v, u],
                    [u, 1, v],
                    [u, -1, -v],
                    [u, -v, 1],
                    [-u, -v, -1],
                ][face],
            );
        // World-space camera rays before backend projection Y-flips, from reflection-probe cameraDir.
        // Do not silently equate Cocos capture labels "front/back" with GL +Z/-Z upload face indices.
        if (convention === 'cocos-camera')
            return unit(
                [
                    [1, v, u],
                    [-1, v, -u],
                    [u, 1, v],
                    [u, -1, -v],
                    [u, v, -1],
                    [-u, v, 1],
                ][face],
            );
        throw new RangeError('SH_CONVENTION');
    }
    function solidAngle(size, column, row) {
        sizeCheck(size);
        if (![column, row].every((x) => Number.isInteger(x) && x >= 0 && x < size)) throw new RangeError('SH_TEXEL');
        const x0 = (2 * column) / size - 1;
        const x1 = (2 * (column + 1)) / size - 1;
        const y0 = (2 * row) / size - 1;
        const y1 = (2 * (row + 1)) / size - 1;
        const area = (x, y) => Math.atan2(x * y, Math.sqrt(1 + x * x + y * y));
        return area(x1, y1) - area(x0, y1) - area(x1, y0) + area(x0, y0);
    }
    function forEachTexel(size, visit, convention = 'webgl-cube') {
        sizeCheck(size);
        for (let row = 0; row < size; row++) {
            const v = (2 * (row + 0.5)) / size - 1;
            for (let column = 0; column < size; column++) {
                const u = (2 * (column + 0.5)) / size - 1;
                const weight = solidAngle(size, column, row);
                for (let face = 0; face < 6; face++)
                    visit(faceDirection(face, u, v, convention), weight, face, column, row);
            }
        }
    }
    function coefficientsCheck(coefficients) {
        if (
            !Array.isArray(coefficients) ||
            coefficients.length !== 9 ||
            coefficients.some((c) => !c || c.length !== 3 || !Array.from(c).every(Number.isFinite))
        )
            throw new TypeError('SH_COEFFICIENTS: nine finite RGB triples required');
    }
    function project(size, sample, convention = 'webgl-cube') {
        const coefficients = Array.from({ length: 9 }, () => [0, 0, 0]);
        // Midpoint radiance/basis with exact texel areas is still quadrature, not an exact continuous SH integral.
        forEachTexel(
            size,
            (direction, weight, face, x, y) => {
                const rgb = sample(direction, face, x, y);
                if (!rgb || rgb.length !== 3 || !Array.from(rgb).every(Number.isFinite))
                    throw new TypeError('SH_LINEAR_RGB: decode RGBE/sRGB first; finite RGB triples required');
                const values = basis(direction);
                for (let i = 0; i < 9; i++)
                    for (let c = 0; c < 3; c++) coefficients[i][c] += rgb[c] * values[i] * weight;
            },
            convention,
        );
        return coefficients;
    }
    function evaluate(coefficients, direction) {
        coefficientsCheck(coefficients);
        const values = basis(direction);
        return [0, 1, 2].map((c) => coefficients.reduce((sum, row, i) => sum + row[c] * values[i], 0));
    }
    function convolveCosine(radiance) {
        coefficientsCheck(radiance);
        return radiance.map((rgb, i) => rgb.map((value) => value * COSINE[band(i)]));
    }
    function toCocosCoefficients(radiance) {
        // Cocos packs basis/π and expects irradiance coefficients. Compensate its rounded storage basis
        // so the consumer evaluates the canonical irradiance/π, not radiance or twice-convolved light.
        const irradiance = convolveCosine(radiance);
        return irradiance.map((rgb, i) => rgb.map((v) => (v * BASIS[i]) / (Math.PI * COCOS_BASIS_OVER_PI[i])));
    }
    function fromCocosCoefficients(stored) {
        coefficientsCheck(stored);
        return stored.map((rgb, i) =>
            rgb.map((v) => (v * Math.PI * COCOS_BASIS_OVER_PI[i]) / (BASIS[i] * COSINE[band(i)])),
        );
    }
    function packCocosUBO(stored) {
        coefficientsCheck(stored);
        const data = new Float32Array(28);
        const p = stored.map((rgb, i) => rgb.map((v) => v * COCOS_BASIS_OVER_PI[i]));
        for (let c = 0; c < 3; c++) {
            data.set([p[3][c], p[1][c], p[2][c], p[0][c] - p[6][c] / 3], c * 4);
            data.set([p[4][c], p[5][c], p[6][c], p[7][c]], 12 + c * 4);
            data[24 + c] = p[8][c];
        }
        return data;
    }
    function evaluateCocosUBO(data, direction) {
        if (data.length !== 28 || !Array.from(data).every(Number.isFinite)) throw new TypeError('SH_UBO');
        const [x, y, z] = unit(direction);
        return [0, 1, 2].map((c) => {
            const l = c * 4,
                q = 12 + c * 4;
            return (
                data[l] * x +
                data[l + 1] * y +
                data[l + 2] * z +
                data[l + 3] +
                data[q] * x * y +
                data[q + 1] * y * z +
                data[q + 2] * z * z +
                data[q + 3] * z * x +
                data[24 + c] * (x * x - y * y)
            );
        });
    }
    return Object.freeze({
        FACE_ORDER,
        BASIS,
        COSINE,
        COCOS_BASIS_OVER_PI,
        unit,
        basis,
        faceDirection,
        solidAngle,
        forEachTexel,
        project,
        evaluate,
        convolveCosine,
        toCocosCoefficients,
        fromCocosCoefficients,
        packCocosUBO,
        evaluateCocosUBO,
    });
});
