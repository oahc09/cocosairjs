// Lead review: independent mother math, not browser evidence.
const C = require('../../tools/verify/shaders-glass-trail-oracle.cjs');
const G = require('../../tools/verify/shaders-glass-oracle.cjs');
const T = require('../../tools/verify/shaders-cursor-trail-oracle.cjs');
const width = 640,
    height = 400;
const path = [
    { x: 0.2, y: 0.4 },
    { x: 0.3, y: 0.5 },
    { x: 0.4, y: 0.55 },
    { x: 0.5, y: 0.5 },
    { x: 0.65, y: 0.45 },
];
const clamp = (x: number) => Math.max(0, Math.min(1, x));
function replay(p: any) {
    const recorder = T.makeOracleRecorder();
    for (const point of path) recorder.tick(point, 1 / 60, p.trailLength, p.trailRadius, width / height);
    return recorder.texData;
}
function trailTexel(bits: any, x: number, y: number, p: any) {
    if (p.trailEnabled === 'off') return [0, 0, 0, 0];
    const rgba = T.model(bits, x, y, width, height, {
        ...T.defaults(),
        colorA: p.trailColorA,
        colorB: p.trailColorB,
        radius: p.trailRadius,
        shrink: p.trailShrink,
        softness: p.trailSoftness,
    }).straightLinear;
    return rgba
        .slice(0, 3)
        .map((v: number) => Math.round(clamp(v * rgba[3]) * 255))
        .concat(Math.round(clamp(rgba[3]) * 255));
}
function expectedGlass(x: number, y: number, p: any) {
    const bits = replay(p),
        g = { ...G.defaults(), shape: p.shape };
    for (const key of Object.keys(g)) {
        const prefixed = 'glass' + key[0].toUpperCase() + key.slice(1);
        if (p[prefixed] !== undefined) g[key] = p[prefixed];
    }
    const sample = (u: number, v: number) =>
        trailTexel(
            bits,
            Math.max(0, Math.min(width - 1, Math.floor(u * width))),
            Math.max(0, Math.min(height - 1, Math.floor(v * height))),
            p,
        ).map((a: number) => a / 255);
    const uv = [(x + 0.5) / width, (y + 0.5) / height],
        f = G.field(x, y, width, height, g),
        s = G.distance(...f, g.shape),
        grad = [
            (G.distance(f[0] + 0.01, f[1], g.shape) - s) / 0.01,
            (G.distance(f[0], f[1] + 0.01, g.shape) - s) / 0.01,
        ],
        coords = G.lensUV(uv, s / g.scale, grad, g, width / height);
    const vogel = (at: number[]) => {
        if (g.blur === 0) return sample(at[0], at[1]);
        const sum = [0, 0, 0, 0];
        for (const [dx, dy] of G.BLUR_DISK) {
            const texel = sample(at[0] + (dx / width) * g.blur * 2, at[1] + (dy / height) * g.blur * 2);
            texel.forEach((v: number, i: number) => {
                sum[i] += v / 9;
            });
        }
        return sum;
    };
    const green = vogel(coords.lens),
        lens = g.aberration > 0 ? [vogel(coords.red)[0], green[1], vogel(coords.blue)[2], green[3]] : green;
    return G.composite(G.unpremultiply(sample(...uv)), G.unpremultiply(lens), s / g.scale, grad, g, height)
        .straightLinear;
}
describe('C03 independent mother algorithm review', () => {
    test.each([
        [320, 200, 0],
        [410, 190, 0],
        [280, 210, 8],
        [390, 205, 8],
    ])('full Glass chain at (%s,%s), blur=%s', (x, y, blur) => {
        const p = { ...C.defaults(), glassBlur: blur };
        const expected = expectedGlass(x, y, p),
            actual = C.model(x, y, width, height, p, 0.25, path).straightLinear;
        expected.forEach((value: number, i: number) => expect(actual[i]).toBeCloseTo(value, 10));
    });
    test('Glass-off identity divides by stored alpha byte, not pre-quantization alpha', () => {
        const p = { ...C.defaults(), glassEnabled: 'off' },
            bits = replay(p);
        let found = false;
        for (let x = 250; x < 430 && !found; x += 3) {
            for (let y = 165; y < 245 && !found; y += 3) {
                const bytes = trailTexel(bits, x, y, p);
                if (bytes[3] > 0 && bytes[3] < 255) {
                    found = true;
                    const actual = C.model(x, y, width, height, p, 0.25, path).straightLinear;
                    [bytes[0] / bytes[3], bytes[1] / bytes[3], bytes[2] / bytes[3], bytes[3] / 255].forEach(
                        (value, i) => expect(actual[i]).toBeCloseTo(value, 10),
                    );
                }
            }
        }
        expect(found).toBe(true);
    });
    test('disabled trail retains source alpha zero when Glass lighting is zero', () => {
        const p = { ...C.defaults(), trailEnabled: 'off', glassHighlight: 0, glassFresnel: 0 };
        expect(C.model(320, 200, width, height, p, 0.25, path).straightLinear).toEqual([0, 0, 0, 0]);
    });
});
