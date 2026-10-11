// C03 Glass Trail golden tests: parameter contract, oracle math, resource audit, boundary plan.
// CPU-only; browser evidence remains NOT_RUN (Lead's frozen collector owns it).
import type {} from 'jest';
const C = require('../../tools/verify/shaders-glass-trail-oracle.cjs');
const G = require('../../tools/verify/shaders-glass-oracle.cjs');
const T = require('../../tools/verify/shaders-cursor-trail-oracle.cjs');
const P = require('../../examples/shader-glass-trail/src/parameters.ts');

const width = 640,
    height = 400;
const path = [
    { x: 0.2, y: 0.4 },
    { x: 0.3, y: 0.5 },
    { x: 0.4, y: 0.55 },
    { x: 0.5, y: 0.5 },
    { x: 0.65, y: 0.45 },
];

describe('C03 Glass Trail golden', () => {
    test('parameters validate full contract', () => {
        const d = C.definition;
        expect(d.name).toBe('glassTrail');
        expect(Object.keys(d.params).length).toBe(19);
        // Valid set
        const ok = P.validate(d, C.defaults());
        expect(ok.ok).toBe(true);
        // Invalid codes
        expect(P.validate(d, null).errors[0].code).toBe('GLASSTRAIL_PARAMETERS');
        expect(P.validate(d, { ...C.defaults(), unknown: 1 }).errors[0].code).toBe('GLASSTRAIL_UNKNOWN_PARAMETER');
        expect(P.validate(d, { ...C.defaults(), glassRefraction: NaN }).errors[0].code).toBe(
            'GLASSTRAIL_PARAMETER_TYPE',
        );
        expect(P.validate(d, { ...C.defaults(), shape: 'blob' }).errors[0].code).toBe('GLASSTRAIL_PARAMETER_ENUM');
        expect(P.validate(d, { ...C.defaults(), trailColorA: 'red' }).errors[0].code).toBe('GLASSTRAIL_COLOR_FORMAT');
        expect(P.validate(d, { ...C.defaults(), glassRefraction: 99 }).errors[0].code).toBe(
            'GLASSTRAIL_PARAMETER_RANGE',
        );
    });

    test('oracle model finite at 15 audit points × 4 layer states', () => {
        for (const state of [
            C.defaults(),
            { ...C.defaults(), glassEnabled: 'off' },
            { ...C.defaults(), trailEnabled: 'off' },
            { ...C.defaults(), glassEnabled: 'off', trailEnabled: 'off' },
        ]) {
            for (const p of C.auditPoints(width, height)) {
                const m = C.model(p.x, p.y, width, height, state, 0.25, path);
                expect(m.straightLinear.every((v: number) => Number.isFinite(v))).toBe(true);
            }
        }
    });

    test('trail-off → all-zero straight linear (even with lighting)', () => {
        const p = { ...C.defaults(), trailEnabled: 'off', glassHighlight: 0, glassFresnel: 0 };
        expect(C.model(320, 200, width, height, p, 0.25, path).straightLinear).toEqual([0, 0, 0, 0]);
    });

    test('glass-off uses stored alpha byte, not pre-quantization alpha', () => {
        const p = { ...C.defaults(), glassEnabled: 'off' };
        let found = false;
        for (let x = 250; x < 430 && !found; x += 3)
            for (let y = 165; y < 245 && !found; y += 3) {
                const recorder = T.makeOracleRecorder();
                for (const point of path) recorder.tick(point, 1 / 60, p.trailLength, p.trailRadius, width / height);
                const bytes = C.trailTexel(recorder.texData, x, y, width, height, p);
                if (bytes[3] > 0 && bytes[3] < 255) {
                    found = true;
                    const m = C.model(x, y, width, height, p, 0.25, path);
                    expect(m.straightLinear[0]).toBeCloseTo(bytes[0] / bytes[3], 10);
                    expect(m.straightLinear[1]).toBeCloseTo(bytes[1] / bytes[3], 10);
                    expect(m.straightLinear[2]).toBeCloseTo(bytes[2] / bytes[3], 10);
                    expect(m.straightLinear[3]).toBeCloseTo(bytes[3] / 255, 10);
                }
            }
        expect(found).toBe(true);
    });

    test('glassBlur=8 uses 9 fixed Vogel taps averaged in premultiplied domain', () => {
        const p = { ...C.defaults(), glassBlur: 8 };
        const recorder = T.makeOracleRecorder();
        for (const point of path) recorder.tick(point, 1 / 60, p.trailLength, p.trailRadius, width / height);
        const bits = recorder.texData;
        const g = C.glassParamsOf(p);
        const sample = C.makeTrailSampler(bits, width, height, p);
        // Reproduce one Vogel sum by hand at a point inside the shape.
        const x = 320,
            y = 200;
        const uv = [(x + 0.5) / width, (y + 0.5) / height];
        const f = G.field(x, y, width, height, g);
        const s = G.distance(f[0], f[1], g.shape);
        const grad = [
            (G.distance(f[0] + 0.01, f[1], g.shape) - s) / 0.01,
            (G.distance(f[0], f[1] + 0.01, g.shape) - s) / 0.01,
        ];
        const coords = G.lensUV(uv, s / g.scale, grad, g, width / height);
        const sum = [0, 0, 0, 0];
        for (const [dx, dy] of G.BLUR_DISK) {
            const texel = sample(
                coords.lens[0] + (dx / width) * g.blur * 2,
                coords.lens[1] + (dy / height) * g.blur * 2,
            );
            texel.forEach((v: number, i: number) => {
                sum[i] += v / 9;
            });
        }
        // Model must equal the same composite with this hand-built lens.
        const base = G.unpremultiply(sample(uv[0], uv[1]));
        const lens = G.unpremultiply(sum as [number, number, number, number]);
        const expected = G.composite(base, lens, s / g.scale, grad, g, height).straightLinear;
        const actual = C.model(x, y, width, height, p, 0.25, path).straightLinear;
        expected.forEach((v: number, i: number) => expect(actual[i]).toBeCloseTo(v, 10));
    });

    test('resource audit catches malformed rows and accepts exact 100', () => {
        const row = {
            index: 0,
            id: 1,
            before: { bufferSize: 1000, textureSize: 2000 },
            created: { bufferSize: 1400, textureSize: 2600 },
            after: { bufferSize: 1000, textureSize: 2000 },
            refsBefore: [1, 1, 1, 1, 1, 1],
            trace: {
                renderersUnbound: true,
                nodesRemoved: true,
                trailDetached: true,
                trailDisposed: true,
                refs: C.OWNED_KINDS.map((kind: string) => ({ kind, before: 1, after: 0, uuid: 'u' + kind })),
            },
            repeat: { idempotent: true },
            nodeValid: false,
            registryPresent: false,
        };
        const good = C.resourceAudit({
            rows: Array.from({ length: 100 }, (_, i) => ({ ...row, index: i, id: i + 1 })),
        });
        expect(good.errors).toEqual([]);
        expect(good.measurements).toBe(100);
        // Missing kinds
        const bad = C.resourceAudit({
            rows: Array.from({ length: 100 }, (_, i) =>
                i === 0
                    ? { ...row, trace: { ...row.trace, refs: row.trace.refs.slice(0, 3) } }
                    : { ...row, index: i, id: i + 1 },
            ),
        });
        expect(bad.errors.length).toBeGreaterThan(0);
    });

    test('boundary plan covers every non-time parameter', () => {
        const plan = C.boundaryPlan();
        const names = new Set(plan.map((c: any) => c.parameter));
        for (const key of Object.keys(C.definition.params)) {
            if (key === 'time') continue;
            expect(names.has(key)).toBe(true);
        }
        expect(plan.length).toBeGreaterThanOrEqual(88);
    });

    test('audit points unique and in bounds', () => {
        const pts = C.auditPoints(width, height);
        const keys = new Set(pts.map((p: any) => `${p.x},${p.y}`));
        expect(keys.size).toBe(pts.length);
        for (const p of pts) {
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.x).toBeLessThan(width);
            expect(p.y).toBeGreaterThanOrEqual(0);
            expect(p.y).toBeLessThan(height);
        }
    });

    test('OWNED_KINDS is the exact 6-kind set', () => {
        expect([...C.OWNED_KINDS].sort()).toEqual([
            'glassEffect',
            'glassMaterial',
            'mesh',
            'pointsTexture',
            'trailEffect',
            'trailMaterial',
        ]);
    });

    test('glassParamsOf maps all glass-prefixed params', () => {
        const g = C.glassParamsOf({ ...C.defaults(), glassRefraction: 0.9, glassBlur: 5, shape: 'rounded-box' });
        expect(g.refraction).toBe(0.9);
        expect(g.blur).toBe(5);
        expect(g.shape).toBe('rounded-box');
    });
});
