const test = require('node:test');
const assert = require('node:assert/strict');
const sh = require('./upstream-probe-sh-reference.js');
const EPS = 1e-5; // Frozen acceptance-manifest CPU absolute error, not a relaxed GPU threshold.
const near = (actual, expected, epsilon = EPS) =>
    assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected} (limit ${epsilon})`);
const vectorNear = (a, b, epsilon = EPS) => a.forEach((v, i) => near(v, b[i], epsilon));

for (const size of [1, 2, 7, 32, 128])
    test(`exact cubemap texel areas sum to 4π at N=${size}`, () => {
        let sum = 0;
        for (let y = 0; y < size; y++)
            for (let x = 0; x < size; x++) {
                const w = sh.solidAngle(size, x, y);
                assert.ok(w > 0);
                sum += 6 * w;
            }
        near(sum, 4 * Math.PI, 1e-10);
    });
test('WebGL face axes and asymmetric off-center rays are frozen; Cocos capture is not upload order', () => {
    const centers = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
    ];
    centers.forEach((expected, face) => vectorNear(sh.faceDirection(face, 0, 0), expected));
    vectorNear(sh.faceDirection(0, 0.25, -0.5), sh.unit([1, 0.5, -0.25]));
    vectorNear(sh.faceDirection(4, 0.25, -0.5, 'cocos-camera'), sh.unit([0.25, -0.5, -1]));
    assert.throws(() => sh.faceDirection(0, 0, 0, 'implicit-image-flip'), /SH_CONVENTION/);
});
test('constant RGB has L√(4π) DC and zero higher orders, with no cosine convolution yet', () => {
    const light = [0.125, 2, 10];
    const coefficients = sh.project(32, () => light);
    vectorNear(
        coefficients[0],
        light.map((v) => v * Math.sqrt(4 * Math.PI)),
    );
    coefficients.slice(1).forEach((v) => vectorNear(v, [0, 0, 0]));
    const stored = sh.toCocosCoefficients(coefficients);
    vectorNear(sh.evaluateCocosUBO(sh.packCocosUBO(stored), [1, 2, 3]), light);
    sh.fromCocosCoefficients(stored).forEach((v, i) => vectorNear(v, coefficients[i]));
});
test('all nine orthonormal real SH basis functions project to the identity through l=2', () => {
    const gram = Array.from({ length: 9 }, () => Array(9).fill(0));
    sh.forEachTexel(256, (direction, weight) => {
        const y = sh.basis(direction);
        for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) gram[i][j] += y[i] * y[j] * weight;
    });
    gram.forEach((row, i) => row.forEach((v, j) => near(v, i === j ? 1 : 0)));
});
test('directional linear/quadratic environment obeys arbitrary proper-rotation covariance', () => {
    const axis = sh.unit([2, -1, 3]);
    const rotationAxis = sh.unit([1, 4, -2]),
        angle = 0.713;
    const rotate = (v) => {
        const [a, b, c] = rotationAxis,
            [x, y, z] = v;
        const d = a * x + b * y + c * z,
            cs = Math.cos(angle),
            sn = Math.sin(angle);
        const cross = [b * z - c * y, c * x - a * z, a * y - b * x];
        return v.map((q, i) => q * cs + cross[i] * sn + rotationAxis[i] * d * (1 - cs));
    };
    const environment = (a) => (direction) => {
        const dot = direction.reduce((sum, q, i) => sum + q * a[i], 0);
        return [1 + 0.2 * dot + 0.1 * (dot * dot - 1 / 3), 0.5 + 0.1 * dot, 0.25];
    };
    const a = sh.project(256, environment(axis));
    const b = sh.project(256, environment(rotate(axis)));
    near(a[3][0], 0.2 * axis[0] * Math.sqrt((4 * Math.PI) / 3));
    for (const direction of [[1, 0, 0], [0, 1, 0], [0, 0, 1], sh.unit([-2, 3, 1])]) {
        vectorNear(sh.evaluate(a, direction), environment(axis)(direction));
        vectorNear(sh.evaluate(a, direction), sh.evaluate(b, rotate(direction)));
        const irradianceOverPi = sh.evaluate(sh.convolveCosine(a), direction).map((v) => v / Math.PI);
        vectorNear(sh.evaluateCocosUBO(sh.packCocosUBO(sh.toCocosCoefficients(a)), direction), irradianceOverPi);
    }
});
test('exact areas do not imply exact finite-resolution SH integration', () => {
    const c = sh.project(1, (d) => [sh.basis(d)[8], 0, 0]);
    assert.ok(Math.abs(c[8][0] - 1) > 0.1);
});
test('invalid size, zero rays, non-finite samples and malformed storage are rejected', () => {
    for (const n of [0, -1, 0.5, NaN]) assert.throws(() => sh.project(n, () => [1, 1, 1]), /SH_SIZE/);
    assert.throws(() => sh.basis([0, 0, 0]), /SH_ZERO_DIRECTION/);
    assert.throws(() => sh.project(1, () => [Infinity, 0, 0]), /SH_LINEAR_RGB/);
    assert.throws(() => sh.toCocosCoefficients([[1, 2, 3]]), /SH_COEFFICIENTS/);
});
