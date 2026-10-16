'use strict';
// Run with node --test tools/verify/shaders-holographic-rotation.test.cjs.
// These are source-bound CPU regressions, not GLSL execution or replacement GPU evidence.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const oracle = require('./shaders-holographic-oracle.cjs');

const ROOT = path.resolve(__dirname, '../..');
const EXAMPLE = 'examples/shader-holographic';
const source = fs.readFileSync(path.join(ROOT, EXAMPLE, 'src/holographic.frag'), 'utf8');
const compact = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').replace(/\s+/g, '');
const rotationBlock = compact(`
    float rad = holo0.y * 0.017453292519943295;
    vec2 rotationBasis = normalize(vec2(cos(rad), sin(rad)));
    float cosR = rotationBasis.x;
    float sinR = rotationBasis.y;
    vec2 f = vec2(delta.x * cosR + delta.y * sinR, delta.y * cosR - delta.x * sinR) / holo0.x;
    vec2 suv = f + 0.5;
`);
function assertRotationBinding(shader) {
    const block = compact(shader).match(/floatrad=[\s\S]*?vec2suv=f\+0\.5;/)?.[0];
    assert.equal(
        block,
        rotationBlock,
        'the field must use the normalized basis with unchanged rotation/scale arithmetic',
    );
}

// Explicit per-operation f32 simulation. JS trig and this normalize model do not reproduce
// every GPU's transcendental approximation, contraction, or inverse-square-root lowering.
const f32 = Math.fround;
const add = (a, b) => f32(f32(a) + f32(b));
const sub = (a, b) => f32(f32(a) - f32(b));
const mul = (a, b) => f32(f32(a) * f32(b));
const div = (a, b) => f32(f32(a) / f32(b));
const length = ([x, y]) => f32(Math.sqrt(add(mul(x, x), mul(y, y))));
function normalize(basis) {
    const inverseLength = div(1, length(basis));
    return basis.map((component) => mul(component, inverseLength));
}
function rotate([x, y], [cosR, sinR], scale) {
    return [div(add(mul(x, cosR), mul(y, sinR)), scale), div(sub(mul(y, cosR), mul(x, sinR)), scale)];
}
function distance([x, y], shape) {
    if (shape === 'circle') return sub(length([x, y]), 0.3);
    const qx = sub(Math.abs(x), 0.24);
    const qy = sub(Math.abs(y), 0.16);
    return sub(add(length([Math.max(qx, 0), Math.max(qy, 0)]), Math.min(Math.max(qx, qy), 0)), 0.04);
}
function alphaByte(field, shape, scale, edgeSoftness = 0.05, height = 360) {
    const sdf = div(distance(field, shape), scale);
    const sharpEdge = Math.max(mul(edgeSoftness, 0.5), f32(0.001));
    const width = Math.max(mul(sharpEdge, 0.03125), mul(div(1, height), 1.5));
    const mask = Math.max(0, Math.min(1, div(-sdf, width)));
    return Math.round(mul(mul(mask, mask), sub(3, mul(2, mask))) * 255);
}

test('source binds the normalized basis to the field without an identity fallback', () => {
    assertRotationBinding(source);
    assert.deepEqual([oracle.definition.params.rotation.min, oracle.definition.params.rotation.max], [0, 360]);
    assert.deepEqual([oracle.definition.params.scale.min, oracle.definition.params.scale.max], [0.4, 2]);
});

test('source binding rejects the original raw trig, removed normalization, and bypassed basis', () => {
    const code = compact(source);
    const basis = 'vec2rotationBasis=normalize(vec2(cos(rad),sin(rad)));';
    const bindings = 'floatcosR=rotationBasis.x;floatsinR=rotationBasis.y;';
    const rawBindings = 'floatcosR=cos(rad);floatsinR=sin(rad);';
    for (const mutant of [
        code.replace(basis, '').replace(bindings, rawBindings),
        code.replace(basis, 'vec2rotationBasis=vec2(cos(rad),sin(rad));'),
        code.replace(bindings, rawBindings),
        code.replace('delta.x*cosR+delta.y*sinR', 'delta.x*cos(rad)+delta.y*sin(rad)'),
    ]) {
        assert.notEqual(mutant, code, 'mutation must change the shader');
        assert.throws(() => assertRotationBinding(mutant), { code: 'ERR_ASSERTION' });
    }
});

test('actual generator reproduces committed variants in two isolated directories', (t) => {
    const generated = fs.readFileSync(path.join(ROOT, EXAMPLE, 'src/effect.generated.ts'), 'utf8');
    const effect = new Function(generated.replace('export const effectDefinition =', 'return'))();
    for (const variant of ['glsl3', 'glsl4']) assertRotationBinding(effect.shaders[0][variant].frag);
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'holographic-rotation-'));
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
    const modulePaths = ['esbuild', 'prettier'].map((name) =>
        path.dirname(path.dirname(require.resolve(`${name}/package.json`))),
    );
    for (const directory of ['first', 'different/nested/root']) {
        const root = path.join(temporary, directory);
        for (const relative of [
            '.editorconfig',
            '.prettierrc.json',
            'examples/shared/shader-blocks.js',
            `${EXAMPLE}/generate-effect.cjs`,
            `${EXAMPLE}/src/holographic.frag`,
        ]) {
            const destination = path.join(root, relative);
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.copyFileSync(path.join(ROOT, relative), destination);
        }
        execFileSync(process.execPath, [path.join(root, EXAMPLE, 'generate-effect.cjs')], {
            cwd: root,
            env: {
                ...process.env,
                NODE_PATH: [...new Set(modulePaths)].join(path.delimiter),
                ESBUILD_WORKER_THREADS: '0',
            },
            stdio: 'pipe',
            timeout: 10000,
            maxBuffer: 1024 * 1024,
        });
        assert.equal(fs.readFileSync(path.join(root, EXAMPLE, 'src/effect.generated.ts'), 'utf8'), generated);
    }
});

test('CPU f32 simulation removes radial trig error across angles, quadrants, shapes, and scale endpoints', () => {
    assertRotationBinding(source);
    const signs = [
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1],
    ];
    // Synthetic radial perturbations include both contraction and expansion, independently
    // of the separately captured trig fixture below. They are not observed GPU outputs.
    const radialFactors = [0.9995, 0.9998315, 1, 1.0001685, 1.0005];
    const epsilon = 8 * 2 ** -23;
    for (let angle = 0; angle <= 360; angle++) {
        const rad = angle * (Math.PI / 180);
        const c = Math.cos(rad),
            s = Math.sin(rad);
        const rad32 = mul(angle, 0.017453292519943295);
        for (const radial of radialFactors) {
            const basis = normalize([mul(Math.cos(rad32), radial), mul(Math.sin(rad32), radial)]);
            assert.ok(Math.abs(Math.hypot(...basis) - 1) <= epsilon, `unit basis at ${angle}/${radial}`);
            for (const scale of [0.4, 1, 2]) {
                // Keep samples in the anti-aliased band even at both scale endpoints.
                const inset = (scale * 1.5) / (3 * 360);
                const radius = 0.3 - inset;
                const corner = (0.04 - inset) / Math.SQRT2;
                const edges = [
                    ['circle', [radius * Math.cos(Math.PI / 6), radius * Math.sin(Math.PI / 6)]],
                    ['rounded-box', [0.28 - inset, 0.08]],
                    ['rounded-box', [0.12, 0.2 - inset]],
                    ['rounded-box', [0.24 + corner, 0.16 + corner]],
                ];
                for (const [shape, point] of edges)
                    for (const [signX, signY] of signs) {
                        const x = point[0] * signX,
                            y = point[1] * signY;
                        const delta = [f32(scale * (x * c - y * s)), f32(scale * (x * s + y * c))];
                        const expected = [(delta[0] * c + delta[1] * s) / scale, (delta[1] * c - delta[0] * s) / scale];
                        const actual = rotate(delta, basis, scale);
                        const label = `${shape}, angle=${angle}, scale=${scale}, radial=${radial}, signs=${signX}/${signY}`;
                        assert.ok(actual.every(Number.isFinite), label);
                        assert.ok(Math.abs(Math.hypot(...actual) - Math.hypot(...delta) / scale) <= epsilon, label);
                        assert.ok(
                            actual.every((value, i) => Math.abs(value - expected[i]) <= epsilon),
                            label,
                        );
                        const expectedSdf = oracle.distance(...expected, shape) / scale;
                        assert.ok(Math.abs(div(distance(actual, shape), scale) - expectedSdf) <= epsilon, label);
                        const expectedAlpha = Math.round(oracle.silhouetteAlpha(expectedSdf, 0.05, 1 / 360) * 255);
                        assert.ok(
                            Math.abs(alphaByte(actual, shape, scale) - expectedAlpha) <= oracle.BYTE_TOLERANCE,
                            label,
                        );
                    }
            }
        }
    }
});

test('CPU replay of captured trig restores alpha 66 at the unchanged audit point and tolerance', () => {
    assertRotationBinding(source);
    // CI capture 38683319408, d225033c: shader-driver-pilot/1/collector.json,
    // results[0].probeContracts.pixelDiagnostics, point (240,72), canvas 480x360.
    // Scalars came from separately linked diagnostic variants, not an independent read
    // of the original program. This CPU replay does not establish fixed GPU behavior.
    const capturedBasis = [0.9943538904190063, 0.10451462864875793];
    const delta = [mul(sub(0.5010417103767395, 0.5), div(480, 360)), sub(0.2013888955116272, 0.5)];
    assert.deepEqual(delta, [0.0013889472465962172, -0.2986111044883728]);
    assert.ok(oracle.auditPoints(480, 360).some(({ x, y }) => x === 240 && y === 72));
    const params = { ...oracle.defaults(), rotation: 6, scale: 1, edgeSoftness: 0.05, shape: 'circle' };
    const expected = Math.round(oracle.model(240, 72, 480, 360, params, 0).straightLinear[3] * 255);
    const rawAlpha = alphaByte(rotate(delta, capturedBasis, params.scale), params.shape, params.scale);
    const normalizedAlpha = alphaByte(
        rotate(delta, normalize(capturedBasis), params.scale),
        params.shape,
        params.scale,
    );
    assert.equal(oracle.BYTE_TOLERANCE, 2);
    assert.equal(expected, 66);
    assert.equal(rawAlpha, 70);
    assert.ok(Math.abs(rawAlpha - expected) > oracle.BYTE_TOLERANCE);
    assert.equal(normalizedAlpha, 66);
    assert.ok(Math.abs(normalizedAlpha - expected) <= oracle.BYTE_TOLERANCE);
});
