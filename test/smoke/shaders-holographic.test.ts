// Synthetic NODE_CONTRACT fixtures only. Real browser claims come from the Lead-run collector.
import { validate } from '../../examples/shader-holographic/src/parameters';
const oracle = require('../../tools/verify/shaders-holographic-oracle.cjs');
const perf = require('../../tools/verify/shaders-holographic-performance.cjs');
const contract = require('../../tools/verify/shaders-effect-contract.cjs');
const collector = require('../../tools/verify/shaders-holographic-browser.cjs');
const fs = require('node:fs'),
    path = require('node:path'),
    os = require('node:os');
const { PNG } = require('pngjs');

const defaults = oracle.defaults();
const W = 640,
    H = 400;

describe('E03 parameter contract (synthetic)', () => {
    test('definition and defaults have a single valid source', () => {
        expect(contract.validateDefinition(oracle.definition).ok).toBe(true);
        expect(validate(oracle.definition, defaults).ok).toBe(true);
    });
    test.each([
        null,
        {},
        [],
        'x',
        { ...defaults, unknown: 1 },
        { ...defaults, crinkle: NaN },
        { ...defaults, crinkle: Infinity },
        { ...defaults, seed: 8.01 },
        { ...defaults, foilScale: 0.1 },
        { ...defaults, shape: 'sphere3D' },
        { ...defaults, hueShift: '90' },
    ])('reject invalid parameter input %#', (value) => {
        expect(validate(oracle.definition, value).ok).toBe(false);
    });
    test('rejects malformed input without partial application', () => {
        const checked = validate(oracle.definition, { ...defaults, crinkle: NaN, sparkle: 9 });
        expect(checked.ok).toBe(false);
        expect(checked.values).toBeUndefined();
        expect(checked.errors.length).toBe(2);
    });
    test('boundary plan contains unique complete descriptor cases', () => {
        const rows = oracle.boundaryPlan();
        expect(rows).toHaveLength(74);
        expect(new Set(rows.map((r: any) => r.caseId)).size).toBe(74);
        for (const r of rows)
            expect(validate(oracle.definition, { ...defaults, [r.parameter]: r.value }).ok).toBe(
                r.boundary !== 'invalid',
            );
    });
});

describe('E03 MaterialX perlin port (synthetic goldens)', () => {
    test('lookup3 primitives match u32 semantics', () => {
        // rotl32(1, 1) = 2; rotl32(0x80000000, 1) wraps to 1.
        expect(oracle.rotl32(1, 1)).toBe(2);
        expect(oracle.rotl32(0x80000000, 1)).toBe(1);
        // bjfinal is deterministic and stays in u32.
        const a = oracle.bjfinal(3735928559 + 21, 3735928559 + 42, 3735928559 + 21);
        expect(a).toBe(oracle.bjfinal(3735928559 + 21, 3735928559 + 42, 3735928559 + 21));
        expect(Number.isInteger(a)).toBe(true);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(0xffffffff);
    });
    test('locked lattice values are exact (regression pins, not screenshots)', () => {
        expect(oracle.mxNoiseFloat2(0.5, 0.5)).toBeCloseTo(0.0, 12);
        expect(oracle.mxNoiseFloat2(1.25, -3.5)).toBeCloseTo(-0.593114, 6);
        expect(oracle.mxNoiseFloat2(100.25, 37.75)).toBeCloseTo(0.454868, 6);
        expect(oracle.mxNoiseFloat2(-8.25, 4.75)).toBeCloseTo(0.118182, 6);
    });
    test('noise stays within the documented amplitude and is seed-offset reproducible', () => {
        for (let i = 0; i < 500; i++) {
            const x = Math.random() * 400 - 200,
                y = Math.random() * 400 - 200,
                v = oracle.mxNoiseFloat2(x, y);
            expect(Math.abs(v)).toBeLessThanOrEqual(0.6616 * 3 + 1e-9);
            expect(Number.isFinite(v)).toBe(true);
            expect(oracle.mxNoiseFloat2(x, y)).toBe(v);
        }
    });
    test('gradient table covers the 8 hashed directions with signs', () => {
        const values = new Set();
        for (let h = 0; h < 8; h++) values.add(oracle.mxGradientFloat2(h, 0.3, 0.7));
        expect(values.size).toBeGreaterThan(3);
        expect(oracle.mxGradientFloat2(0, 0.3, 0.7)).toBeCloseTo(0.3 + 2 * 0.7, 12);
    });
});

describe('E03 upstream silhouetteAlpha chain (materialParts.ts @ dbfd42ab)', () => {
    test('insideMask 0.25 eases to exactly 0.15625 (smoothstep), boundaries are 0 and 1', () => {
        // sharpEdge = 1 (edgeSoftness 2), pxH 0.02 -> w = max(0.03125, 0.03) = 0.03125.
        expect(oracle.silhouetteAlpha(-0.25 * 0.03125, 2, 0.02)).toBeCloseTo(0.15625, 12);
        expect(oracle.silhouetteAlpha(0.001, 0.05, 0.0025)).toBe(0);
        expect(oracle.silhouetteAlpha(-10, 0.05, 0.0025)).toBe(1);
    });
    test('edgeSoftness 0 keeps the 0.001 floor and the 1.5px minimum width', () => {
        // sharpEdge floor 0.001 -> w = max(3.125e-5, 1.5 * pxH); at pxH 0.001 the pixel floor wins.
        expect(oracle.silhouetteAlpha(-0.5 * 0.0015, 0, 0.001)).toBeCloseTo(0.5, 12);
        // At tiny pxH the sharpEdge/32 branch wins: w = 3.125e-5.
        expect(oracle.silhouetteAlpha(-0.5 * 3.125e-5, 0, 1e-7)).toBeCloseTo(0.5, 12);
    });
    test('higher edgeSoftness widens the transition (same sdf yields a softer alpha)', () => {
        const sdf = -0.004;
        const soft = oracle.silhouetteAlpha(sdf, 0.1, 0.0025),
            wide = oracle.silhouetteAlpha(sdf, 1.0, 0.0025);
        // The narrow edge saturates the mask; the wide one eases inside it.
        expect(soft).toBe(1);
        expect(wide).toBeGreaterThan(0);
        expect(wide).toBeLessThan(1);
    });
    test('the model uses the exact upstream chain (matches silhouetteAlpha at its own inputs)', () => {
        const m = oracle.model(320, Math.round(0.2 * H), W, H, defaults, 0.25);
        expect(m.silhouette.transition).toBeCloseTo(
            oracle.silhouetteAlpha(m.stencil.sdf, defaults.edgeSoftness, m.stencil.pxH),
            12,
        );
        expect(m.silhouette.insideMask).toBeLessThanOrEqual(1);
    });
});

describe('E03 holographic math (synthetic goldens)', () => {
    test('crinkle 0 leaves the flat dome normal (0, 0, -1) at the plateau', () => {
        const m = oracle.model(320, 200, W, H, { ...defaults, crinkle: 0 }, 0.25);
        expect(m.normal.n[0]).toBeCloseTo(0, 10);
        expect(m.normal.n[1]).toBeCloseTo(0, 10);
        expect(m.normal.n[2]).toBeCloseTo(-1, 10);
    });
    test('sparkle 0 removes the flake layer entirely', () => {
        const m = oracle.model(320, 200, W, H, { ...defaults, sparkle: 0 }, 0.25);
        expect(m.layers.flakes.mask).toBe(0);
    });
    test('saturation 0 is exactly the silver tint', () => {
        const m = oracle.model(320, 200, W, H, { ...defaults, saturation: 0 }, 0.25);
        expect(m.hue.foilTint[0]).toBeCloseTo(0.72, 12);
        expect(m.hue.foilTint[1]).toBeCloseTo(0.73, 12);
        expect(m.hue.foilTint[2]).toBeCloseTo(0.76, 12);
    });
    test('speed 0 freezes the animated time invariants', () => {
        const a = oracle.model(320, 200, W, H, { ...defaults, speed: 0 }, 0);
        const b = oracle.model(320, 200, W, H, { ...defaults, speed: 0 }, 5.5);
        expect(a.straightLinear).toEqual(b.straightLinear);
    });
    test('fixed seed/time resample is bit-identical; different seed diverges', () => {
        const a = oracle.model(320, 200, W, H, { ...defaults, seed: 2 }, 0.25);
        const b = oracle.model(320, 200, W, H, { ...defaults, seed: 2 }, 0.25);
        expect(a.straightLinear).toEqual(b.straightLinear);
        const c = oracle.model(320, 200, W, H, { ...defaults, seed: 3 }, 0.25);
        expect(c.hue.blotch).not.toBeCloseTo(a.hue.blotch, 6);
    });
    test('time continuity: display changes are small and bounded (frozen threshold)', () => {
        let max = 0;
        for (const p of oracle.auditPoints(W, H)) {
            const a = oracle.model(p.x, p.y, W, H, defaults, 0.25).display;
            const b = oracle.model(p.x, p.y, W, H, defaults, 0.27).display;
            max = Math.max(max, ...a.map((v, i) => Math.abs(v - b[i])));
        }
        expect(max).toBeLessThanOrEqual(3);
    });
    test('noise-domain continuity near a point (frozen threshold, not screenshot similarity)', () => {
        for (const [x, y] of [
            [0.3, 2.1],
            [5.7, -1.2],
            [100.4, 37.9],
            [-8.2, 4.4],
        ])
            for (const h of [0.005, 0.01, 0.02]) {
                expect(Math.abs(oracle.mxNoiseFloat2(x + h, y) - oracle.mxNoiseFloat2(x, y))).toBeLessThanOrEqual(0.05);
                expect(Math.abs(oracle.mxNoiseFloat2(x, y + h) - oracle.mxNoiseFloat2(x, y))).toBeLessThanOrEqual(0.05);
            }
    });
    test('rotation 360 is the identity', () => {
        const a = oracle.model(320, 200, W, H, defaults, 0.25);
        const b = oracle.model(320, 200, W, H, { ...defaults, rotation: 360 }, 0.25);
        expect(a.straightLinear).toEqual(b.straightLinear);
    });
    test('hueShift is 360-periodic (per channel, up to float rounding)', () => {
        const a = oracle.model(320, 200, W, H, defaults, 0.25);
        const b = oracle.model(320, 200, W, H, { ...defaults, hueShift: 360 }, 0.25);
        for (let i = 0; i < 4; i++) expect(a.straightLinear[i]).toBeCloseTo(b.straightLinear[i], 9);
    });
    test('roughness boundaries stay finite and soften the specular exponent', () => {
        for (const roughness of [0, 1]) {
            const m = oracle.model(320, 200, W, H, { ...defaults, roughness }, 0.25);
            expect(m.straightLinear.every(Number.isFinite)).toBe(true);
            expect(m.light.specExp).toBeCloseTo(42 + (12 - 42) * roughness, 10);
        }
    });
    test('outside the two-pixel guard is exactly zero; interior transition is in [0,1]', () => {
        const outside = oracle.model(64, 200, W, H, defaults, 0.25);
        expect(outside.cutout).toBe(true);
        expect(outside.straightLinear).toEqual([0, 0, 0, 0]);
        const edge = oracle.model(320, Math.round(0.2 * H), W, H, defaults, 0.25);
        expect(edge.silhouette.transition).toBeGreaterThanOrEqual(0);
        expect(edge.silhouette.transition).toBeLessThanOrEqual(1);
    });
    test('folded light constants match the 300-degree reference', () => {
        expect(oracle.L[0]).toBeCloseTo(0.37164708971977234, 15);
        const len = Math.hypot(...oracle.L);
        expect(len).toBeCloseTo(1, 6);
        const hlen = Math.hypot(...oracle.H);
        expect(hlen).toBeCloseTo(1, 6);
    });
});

describe('E03 PNG and probe oracles (synthetic fixtures)', () => {
    function temp() {
        return fs.mkdtempSync(path.join(os.tmpdir(), 'holographic-e03-'));
    }
    test('accepts its own synthetic arithmetic and rejects parameter pollution', () => {
        const dir = temp();
        try {
            const png = new PNG({ width: W, height: H });
            for (let y = 0; y < H; y++)
                for (let x = 0; x < W; x++) {
                    const rgba = oracle.model(x, y, W, H, defaults, 0.25).display;
                    for (let c = 0; c < 4; c++) png.data[((H - 1 - y) * W + x) * 4 + c] = rgba[c];
                }
            const file = path.join(dir, 'synthetic.png');
            fs.writeFileSync(file, PNG.sync.write(png));
            expect(oracle.pngAudit(file, defaults, 0.25).errors).toEqual([]);
            const polluted = oracle.pngAudit(file, { ...defaults, seed: 2 }, 0.25);
            expect(polluted.errors.length).toBeGreaterThan(0);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    test('rejects an all-black PNG', () => {
        const dir = temp();
        try {
            const png = new PNG({ width: W, height: H });
            png.data.fill(0);
            for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;
            const file = path.join(dir, 'black.png');
            fs.writeFileSync(file, PNG.sync.write(png));
            expect(oracle.pngAudit(file, defaults, 0.25).errors.length).toBeGreaterThan(0);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    test('probe audit accepts a faithful fixture and rejects tamper', () => {
        const pixels = oracle.auditPoints(W, H).map((p: any) => {
            const value = oracle.model(p.x, p.y, W, H, defaults, 0.25);
            return {
                ...p,
                rgba: value.cutout
                    ? [0, 0, 0, 0]
                    : value.straightLinear.map((x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255)),
            };
        });
        const probe = {
            frame: 9,
            time: 0.25,
            pixels,
            gpuReceipt: {
                frame: 8,
                time: 0.25,
                canvas: { width: W, height: H },
                targetRGBA8: true,
                transparentClear: true,
                detached: true,
                disposed: true,
                glError: 0,
            },
        };
        expect(oracle.probeAudit(probe, defaults, 0.25).errors).toEqual([]);
        const tampered = JSON.parse(JSON.stringify(probe));
        tampered.pixels[0].rgba = [1, 2, 3, 4];
        expect(oracle.probeAudit(tampered, defaults, 0.25).errors.length).toBeGreaterThan(0);
        const mismatched = oracle.probeAudit({ ...probe, time: 0.5 }, defaults, 0.25);
        expect(mismatched.errors.length).toBeGreaterThan(0);
        for (const malformed of [[], [1], [0, 0, NaN, 0], [0, 0, '255', 0]]) {
            const bad = JSON.parse(JSON.stringify(probe));
            bad.pixels[1].rgba = malformed;
            expect(oracle.probeAudit(bad, defaults, 0.25).errors.length).toBeGreaterThan(0);
        }
    });
});

describe('E03 resource and performance fixtures (synthetic)', () => {
    const KINDS = ['mesh', 'material', 'effect'];
    function resource() {
        return {
            rows: Array.from({ length: 100 }, (_, index) => ({
                index,
                id: index + 1,
                before: { bufferSize: 100, textureSize: 50 },
                created: { bufferSize: 496, textureSize: 50 },
                after: { bufferSize: 100, textureSize: 50 },
                refsBefore: [1, 1, 1],
                trace: {
                    rendererUnbound: true,
                    nodeRemoved: true,
                    refs: KINDS.map((kind) => ({ kind, before: 1, after: 0 })),
                },
                repeat: { idempotent: true },
                nodeValid: false,
                assetsValid: [false, false, false],
                registryPresent: false,
            })),
        };
    }
    test('resource fixture has three distinct owned kinds and real allocation', () => {
        expect(oracle.resourceAudit(resource()).errors).toEqual([]);
    });
    test.each(['refs9', 'dupkind', 'leak', 'duplicate', 'unbind', 'short'])('reject resource tamper %s', (mutation) => {
        const r = resource();
        if (mutation === 'refs9') r.rows[2].trace.refs[0].after = 9;
        if (mutation === 'dupkind') r.rows[2].trace.refs = KINDS.map(() => ({ kind: 'mesh', before: 1, after: 0 }));
        if (mutation === 'leak') r.rows[3].after.bufferSize += 8;
        if (mutation === 'duplicate') r.rows[1].id = 1;
        if (mutation === 'unbind') r.rows[4].trace.rendererUnbound = false;
        if (mutation === 'short') r.rows.length = 99;
        expect(oracle.resourceAudit(r).errors.length).toBeGreaterThan(0);
    });
    test.each([null, {}, { rows: Array.from({ length: 100 }, () => ({})) }])(
        'resource validator is total %#',
        (value) => {
            let result: any;
            expect(() => {
                result = oracle.resourceAudit(value);
            }).not.toThrow();
            expect(result.errors.length).toBeGreaterThan(0);
        },
    );
    function performance() {
        const frames = Array.from({ length: 120 }, (_, i) => ({
            frame: i + 1,
            intervalMs: 16,
            renderEnvelopeMs: 1,
            bufferBytes: 500,
            textureBytes: 500,
            drawCalls: 1,
        }));
        return {
            frames,
            warmupFrames: 30,
            updateCalls: frames.map((r) => ({ frame: r.frame, ms: 0.1 })),
            commands: frames.map((r) => ({ frame: r.frame, ms: 0.3 })),
            draws: frames.map((r) => ({ frame: r.frame, ms: 0.2 })),
            queueBookkeeping: frames.map((r) => ({ frame: r.frame, ms: 0.01 })),
            gpuSamples: [],
            queryEvents: [],
            timerAvailable: false,
            viewport: { width: 1280, height: 720, dpr: 1, backing: { width: 1280, height: 720 } },
            device: { renderer: 'SYNTHETIC' },
            window: { start: 1, end: 120, durationMs: 1920 },
            methods: {
                commands: 'includes immediate GL',
                queue: 'not GPU command submission',
                frames: 'not monitor presentation',
            },
        };
    }
    test('performance reducer accepts the single-pass frame', () => {
        const result = perf.validatePerformance(performance(), perf.PROFILES[0]);
        expect(result.errors).toEqual([]);
        expect(result.measurements).toBe(90);
    });
    test.each(['nan', 'duplicate', 'missing-update', 'dpr', 'warmup', 'gpu-timeout'])(
        'reject performance tamper %s',
        (mutation) => {
            const r: any = performance();
            if (mutation === 'nan') r.draws[80].ms = NaN;
            if (mutation === 'duplicate') r.frames[80].frame = 80;
            if (mutation === 'missing-update') r.updateCalls.pop();
            if (mutation === 'dpr') r.viewport.dpr = 2;
            if (mutation === 'warmup') r.warmupFrames = 0;
            if (mutation === 'gpu-timeout') {
                r.timerAvailable = true;
                r.queryEvents.push({ frame: 90, event: 'timeout' });
            }
            expect(perf.validatePerformance(r, perf.PROFILES[0]).errors.length).toBeGreaterThan(0);
        },
    );
    test('performance validator is total on null frames and NaN clocks', () => {
        for (const raw of [
            { frames: Array.from({ length: 90 }, () => null), warmupFrames: 30 },
            {
                frames: Array.from({ length: 90 }, (_, i) => ({
                    frame: i + 1,
                    intervalMs: NaN,
                    renderEnvelopeMs: 1,
                    bufferBytes: 1,
                    textureBytes: 1,
                    drawCalls: 1,
                })),
                warmupFrames: 30,
            },
        ]) {
            let result: any;
            expect(() => {
                result = perf.validatePerformance(raw, perf.PROFILES[0]);
            }).not.toThrow();
            expect(result.errors.length).toBeGreaterThan(0);
        }
    });
});

describe('E03 collector contract (synthetic totality)', () => {
    test.each([
        null,
        undefined,
        {},
        [],
        { schemaVersion: 'other' },
        { schemaVersion: 'e03-holographic/1', engines: [{}] },
    ])('strict collector validation is total %#', (raw) => {
        let result: any;
        expect(() => {
            result = collector.validateFiles(raw);
        }).not.toThrow();
        expect(result.ok).toBe(false);
    });
    test('identity drift is detected against the current closure', () => {
        const report = {
            schemaVersion: 'e03-holographic/1',
            phase: 'functional',
            requestedEngines: ['chromium'],
            inputs: collector.currentIdentity().inputs.map((f: any) => ({ ...f, sha256: '0'.repeat(64) })),
            reference: collector.currentIdentity().reference,
            engines: [],
        };
        const result = collector.validateFiles(report);
        expect(result.ok).toBe(false);
        expect(result.errors.some((x: any) => String(x).startsWith('drift:') || x === 'input closure')).toBe(true);
    });
    test('collector rejects a null engine without throwing', () => {
        let result: any;
        expect(() => {
            result = collector.validateFiles({
                schemaVersion: 'e03-holographic/1',
                phase: 'functional',
                requestedEngines: ['chromium'],
                ...collector.currentIdentity(),
                engines: [null],
            });
        }).not.toThrow();
        expect(result.ok).toBe(false);
    });
    test('frozen capture set separates crinkle/sparkle/saturation/speed/seed families', () => {
        const ids = collector.CAPTURES.map(([id]: any) => id);
        for (const id of ['crinkle-zero', 'sparkle-zero', 'silver', 'full-spectral', 'speed-zero', 'seed-2'])
            expect(ids).toContain(id);
    });
    test('missing/absent error arrays are rejected (not just non-empty ones)', () => {
        const identity = collector.currentIdentity();
        const base: any = {
            schemaVersion: 'e03-holographic/1',
            phase: 'functional',
            requestedEngines: ['chromium'],
            ...identity,
        };
        for (const mutation of [
            (e: any) => delete e.pageErrors,
            (e: any) => (e.pageErrors = 'not-an-array'),
            (e: any) => delete e.consoleErrors,
        ]) {
            const report = {
                ...base,
                engines: [
                    { engine: 'chromium', browserVersion: 'x', consoleErrors: [], shaderCompile: [{ compiled: true }] },
                ],
            };
            mutation(report.engines[0]);
            const result = collector.validateFiles(report);
            expect(result.ok).toBe(false);
            expect(JSON.stringify(result.errors)).toContain('explicit empty array');
        }
    });
});
