import { nodeRequire } from '../shims';

const path = nodeRequire('path');
const O = nodeRequire(path.resolve('tools/verify/shaders-neon-oracle.cjs'));
const P = nodeRequire(path.resolve('tools/verify/shaders-neon-performance.cjs'));
const C = nodeRequire(path.resolve('tools/verify/shaders-neon-browser.cjs'));
const clamp = (v: number) => Math.min(1, Math.max(0, v));

function linearProbe() {
    const params = { ...O.defaults(), glowRadius: 0.35 };
    const points = O.auditPoints(640, 400);
    return {
        params,
        probe: {
            frame: 2,
            time: 0.25,
            gpuReceipt: {
                frame: 1,
                time: 0.25,
                canvas: { width: 640, height: 400 },
                targetRGBA8: true,
                transparentClear: true,
                detached: true,
                disposed: true,
                glError: 0,
            },
            pixels: points.map((p: any) => ({
                ...p,
                rgba: O.model(p.x, p.y, 640, 400, params, 0.25).straightLinear.map((v: number) =>
                    Math.round(clamp(v) * 255),
                ),
            })),
        },
    };
}

describe('Neon independent review (NODE_CONTRACT, no browser evidence)', () => {
    test('RGBA8 transparent target stores normalized clamped channels, not HDR values above 255', () => {
        const { params, probe } = linearProbe();
        expect(O.model(320, 324, 640, 400, params, 0.25).straightLinear[2]).toBeGreaterThan(1);
        expect(O.probeAudit(probe, params, 0.25).errors).toEqual([]);
    });

    test('display RGBA8 clamps encoded fragment source before alpha blending', () => {
        const params = { ...O.defaults(), glowRadius: 0.35 };
        const model = O.model(320, 324, 640, 400, params, 0.25);
        const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
        const alpha = clamp(model.straightLinear[3]);
        const expected = model.straightLinear
            .slice(0, 3)
            .map((v: number, i: number) =>
                Math.round(255 * (clamp(encode(v)) * alpha + ([8, 10, 18][i] / 255) * (1 - alpha))),
            );
        expect(model.display).toEqual([...expected, 255]);
    });

    test.each([[], [1], [0, 0, NaN, 0], [0, 0, Infinity, 0], [0, 0, '255', 0]].map((rgba) => ({ rgba })))(
        'linear probe rejects malformed byte channels %#',
        ({ rgba }) => {
            const { params, probe } = linearProbe();
            probe.pixels[0].rgba = rgba;
            let result: any;
            expect(() => (result = O.probeAudit(probe, params, 0.25))).not.toThrow();
            expect(result.errors.length).toBeGreaterThan(0);
        },
    );

    test.each([null, {}, { rows: Array.from({ length: 100 }, () => ({})) }])(
        'resource validator rejects malformed nested data without throwing %#',
        (value) => {
            let result: any;
            expect(() => (result = O.resourceAudit(value))).not.toThrow();
            expect(result.errors.length).toBeGreaterThan(0);
        },
    );

    test.each(['frame', 'time'])('linear probe requires the captured %s to bind its GPU receipt', (field) => {
        const { params, probe } = linearProbe();
        expect(O.probeAudit(probe, params, 0.25).errors).toEqual([]);
        delete (probe as any)[field];
        expect(O.probeAudit(probe, params, 0.25).errors.length).toBeGreaterThan(0);
    });

    test('linear probe rejects negative frame numbers even when the receipt pair is consecutive', () => {
        const { params, probe } = linearProbe();
        expect(O.probeAudit(probe, params, 0.25).errors).toEqual([]);
        probe.frame = -1;
        probe.gpuReceipt.frame = -2;
        expect(O.probeAudit(probe, params, 0.25).errors.length).toBeGreaterThan(0);
    });

    test('performance validator rejects null frame without throwing', () => {
        let result: any;
        const raw = { frames: Array.from({ length: 90 }, () => null), warmupFrames: 30 };
        expect(() => (result = P.validatePerformance(raw, P.PROFILES[0]))).not.toThrow();
        expect(result.errors.length).toBeGreaterThan(0);
    });

    test('collector rejects null engine without throwing', () => {
        let result: any;
        const identity = C.currentIdentity();
        expect(() => {
            result = C.validateFiles({
                schemaVersion: 'e04-neon/1',
                phase: 'functional',
                requestedEngines: ['chromium'],
                ...identity,
                engines: [null],
            });
        }).not.toThrow();
        expect(result.ok).toBe(false);
    });
});
