// Synthetic NODE_CONTRACT fixtures only. Real browser claims come from the Lead-run collector.
import { validate } from '../../examples/shader-liquid-metal/src/parameters';
import { effectDefinition } from '../../examples/shader-liquid-metal/src/effect.generated';
const oracle = require('../../tools/verify/shaders-liquid-metal-oracle.cjs');
const perf = require('../../tools/verify/shaders-liquid-metal-performance.cjs');
const contract = require('../../tools/verify/shaders-effect-contract.cjs');
const collector = require('../../tools/verify/shaders-liquid-metal-browser.cjs');
const fs = require('node:fs'),
    path = require('node:path'),
    os = require('node:os');
const { PNG } = require('pngjs');

const defaults = oracle.defaults();
const W = 640,
    H = 400;

describe('E07 parameter contract (synthetic)', () => {
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
        { ...defaults, turbulence: NaN },
        { ...defaults, turbulence: Infinity },
        { ...defaults, seed: 8.01 },
        { ...defaults, turbulence: 1.6 },
        { ...defaults, shape: 'blob' },
        { ...defaults, quality: 'ultra' },
        { ...defaults, bevelWidth: 'wide' },
    ])('reject invalid parameter input %#', (value) => {
        expect(validate(oracle.definition, value).ok).toBe(false);
    });
    test('rejects malformed input without partial application', () => {
        const checked = validate(oracle.definition, { ...defaults, turbulence: NaN, ripple: 9 });
        expect(checked.ok).toBe(false);
        expect(checked.values).toBeUndefined();
        expect(checked.errors.length).toBe(2);
    });
    test('boundary plan contains unique complete descriptor cases', () => {
        const rows = oracle.boundaryPlan();
        // 15 numeric params × 6 + shape × 2 + quality × 2 = 94.
        expect(rows).toHaveLength(94);
        expect(new Set(rows.map((r: any) => r.caseId)).size).toBe(94);
        for (const r of rows)
            expect(validate(oracle.definition, { ...defaults, [r.parameter]: r.value }).ok).toBe(
                r.boundary !== 'invalid',
            );
    });
});

describe('E07 generated effect metadata (production-data semantics, not toContain)', () => {
    test('Constants block members bind the five actual liquid vec4 uniforms', () => {
        const block = effectDefinition.shaders[0].blocks.find((b: any) => b.name === 'Constants');
        expect(block.members.map((m: any) => m.name)).toEqual(['liquid0', 'liquid1', 'liquid2', 'liquid3', 'liquid4']);
        expect(block.members.every((m: any) => m.type === 16 && m.count === 1)).toBe(true);
        expect(Object.keys(effectDefinition.techniques[0].passes[0].properties).sort()).toEqual([
            'liquid0',
            'liquid1',
            'liquid2',
            'liquid3',
            'liquid4',
        ]);
        const frag = effectDefinition.shaders[0].glsl3.frag;
        for (const name of ['liquid0', 'liquid1', 'liquid2', 'liquid3', 'liquid4'])
            expect(frag.includes('uniform Constants') && frag.includes('vec4 ' + name + ';')).toBe(true);
        expect(frag.includes('holo') || frag.includes('neon')).toBe(false);
    });
});

describe('E07 helper math (verified upstream bodies)', () => {
    test('flowWarp matches the materialParts body at pinned points', () => {
        const [wx, wy] = oracle.flowWarp(0.3, -1.2, 0.5);
        expect(wx).toBeCloseTo(Math.sin(0.3 * 1.7 + 0.35 + 1.7) * Math.cos(-1.2 * 1.3 + 0.25 + 2.3), 12);
        expect(wy).toBeCloseTo(Math.cos(0.3 * 1.4 + 0.45 + 8.7) * Math.sin(-1.2 * 1.6 + 0.3 + 5.1), 12);
    });
    test('bevelSin: round is 1-t; machined plateau sits near 0.72; blend interpolates', () => {
        expect(oracle.bevelSin(0.5, 0)).toBeCloseTo(0.5, 12);
        expect(oracle.bevelSin(0.5, 1)).toBeCloseTo(0.72, 12);
        expect(oracle.bevelSin(0, 0)).toBe(1);
        expect(oracle.bevelSin(1, 0)).toBe(0);
        const mid = oracle.bevelSin(0.5, 0.5);
        expect(mid).toBeCloseTo(0.61, 12);
    });
    test('studio: overhead key at the centre frame position, dark floor away from boxes', () => {
        const envStr = 1.5,
            keyRad = 0.3,
            drift = 0;
        const lit = oracle.liquidStudio(0, 0.55, 1, 0, keyRad, drift, envStr);
        const dark = oracle.liquidStudio(2.5, -2.5, 1, 0, keyRad, drift, envStr);
        expect(lit).toBeGreaterThan(1.0);
        expect(dark).toBeLessThan(0.2);
    });
    test('silhouetteAlpha: insideMask 0.25 eases to 0.15625 (the E03-verified chain)', () => {
        expect(oracle.silhouetteAlpha(-0.25 * 0.03125, 2, 0.02)).toBeCloseTo(0.15625, 12);
    });
});

describe('E07 model math (synthetic goldens)', () => {
    test('turbulence 0 leaves the bevel geometric normal untouched', () => {
        const m = oracle.model(320, Math.round(0.2 * H), W, H, { ...defaults, turbulence: 0 }, 0.25);
        for (let i = 0; i < 3; i++) expect(m.normal.n[i]).toBeCloseTo(m.normal.nGeo[i], 10);
    });
    test('quality tiers differ in REAL studio work and in output', () => {
        const high = oracle.model(250, Math.round(0.25 * H), W, H, { ...defaults, quality: 'high' }, 0.25);
        const low = oracle.model(250, Math.round(0.25 * H), W, H, { ...defaults, quality: 'low' }, 0.25);
        expect(high.layers.studio.studioEvals).toBe(2);
        expect(low.layers.studio.studioEvals).toBe(1);
        expect(low.layers.studio.lumR).toBe(low.layers.studio.lumG);
        expect(low.layers.studio.lumB).toBe(low.layers.studio.lumG);
        expect(Math.abs(high.layers.studio.lumR - high.layers.studio.lumB)).toBeGreaterThan(1e-4);
        expect(high.straightLinear).not.toEqual(low.straightLinear);
    });
    test('dispersion 0 makes the high tier converge to the shared evaluation', () => {
        const a = oracle.model(250, Math.round(0.25 * H), W, H, { ...defaults, quality: 'high', dispersion: 0 }, 0.25);
        for (let i = 0; i < 3; i++) expect(a.layers.studio.lumR).toBeCloseTo(a.layers.studio.lumG, 10);
    });
    test('env rotation rotates the studio frame (a lit point goes dark)', () => {
        const p = [320, Math.round(0.35 * H)];
        const zero = oracle.model(p[0], p[1], W, H, defaults, 0.25);
        const rotated = oracle.model(p[0], p[1], W, H, { ...defaults, envRotation: 180 }, 0.25);
        expect(zero.layers.studio.skyG).not.toBeCloseTo(rotated.layers.studio.skyG, 3);
    });
    test('speed 0 freezes the animation; same seed/params/time reproduces bit-identically', () => {
        const a = oracle.model(320, 200, W, H, { ...defaults, speed: 0 }, 0);
        const b = oracle.model(320, 200, W, H, { ...defaults, speed: 0 }, 7.7);
        expect(a.straightLinear).toEqual(b.straightLinear);
        const c = oracle.model(320, 200, W, H, { ...defaults, seed: 2 }, 0.25);
        const d = oracle.model(320, 200, W, H, { ...defaults, seed: 2 }, 0.25);
        expect(c.straightLinear).toEqual(d.straightLinear);
    });
    test('reflection preserves unit length and mirrors the view ray', () => {
        const m = oracle.model(320, 200, W, H, defaults, 0.25);
        const R = m.reflection.R;
        expect(Math.hypot(...R)).toBeCloseTo(1, 10);
        expect(R[2]).toBeGreaterThan(-1);
    });
    test('outside the two-pixel guard is exactly zero', () => {
        const outside = oracle.model(64, 200, W, H, defaults, 0.25);
        expect(outside.cutout).toBe(true);
        expect(outside.straightLinear).toEqual([0, 0, 0, 0]);
    });
    test('time continuity: adjacent-time display drift stays bounded (model-level bound 24; the collector enforces the tighter frozen plan of 3 on CPU deltas)', () => {
        let max = 0;
        for (const p of oracle.auditPoints(W, H)) {
            const a = oracle.model(p.x, p.y, W, H, defaults, 0.25).display;
            const b = oracle.model(p.x, p.y, W, H, defaults, 0.27).display;
            max = Math.max(max, ...a.map((v, i) => Math.abs(v - b[i])));
        }
        expect(max).toBeLessThanOrEqual(24);
    });
});

describe('E07 PNG and probe oracles (synthetic fixtures)', () => {
    function temp() {
        return fs.mkdtempSync(path.join(os.tmpdir(), 'liquid-e07-'));
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
            const polluted = oracle.pngAudit(file, { ...defaults, quality: 'low' }, 0.25);
            expect(polluted.errors.length).toBeGreaterThan(0);
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
        for (const [label, mutate] of [
            ['NaN byte', (bad: any) => (bad.pixels[0].rgba[0] = NaN)],
            [
                'negative frame',
                (bad: any) => {
                    bad.frame = -1;
                    bad.gpuReceipt.frame = -2;
                },
            ],
            ['time unbound', (bad: any) => (bad.time = 0.5)],
            ['point moved', (bad: any) => (bad.pixels[2].x = 1)],
        ] as [string, (bad: any) => void][]) {
            const bad = JSON.parse(JSON.stringify(probe));
            mutate(bad);
            expect(oracle.probeAudit(bad, defaults, 0.25).errors.length).toBeGreaterThan(0);
        }
    });
});

describe('E07 resource and performance fixtures (synthetic)', () => {
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
    test('resource fixture has three distinct owned kinds', () => {
        expect(oracle.resourceAudit(resource()).errors).toEqual([]);
    });
    test.each(['refs9', 'dupkind', 'leak', 'short'])('reject resource tamper %s', (mutation) => {
        const r = resource();
        if (mutation === 'refs9') r.rows[2].trace.refs[0].after = 9;
        if (mutation === 'dupkind') r.rows[2].trace.refs = KINDS.map(() => ({ kind: 'mesh', before: 1, after: 0 }));
        if (mutation === 'leak') r.rows[3].after.bufferSize += 8;
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
        expect(perf.validatePerformance(performance(), perf.PROFILES[0]).errors).toEqual([]);
    });
    test.each(['nan', 'duplicate', 'dpr', 'warmup'])('reject performance tamper %s', (mutation) => {
        const r: any = performance();
        if (mutation === 'nan') r.draws[80].ms = NaN;
        if (mutation === 'duplicate') r.frames[80].frame = 80;
        if (mutation === 'dpr') r.viewport.dpr = 2;
        if (mutation === 'warmup') r.warmupFrames = 0;
        expect(perf.validatePerformance(r, perf.PROFILES[0]).errors.length).toBeGreaterThan(0);
    });
});

describe('E07 collector contract (synthetic totality)', () => {
    test.each([null, undefined, {}, [], { schemaVersion: 'other' }])('collector is total %#', (raw) => {
        let result: any;
        expect(() => {
            result = collector.validateFiles(raw);
        }).not.toThrow();
        expect(result.ok).toBe(false);
    });
    test('collector rejects a null engine and missing error arrays', () => {
        const identity = collector.currentIdentity();
        for (const engines of [
            null,
            [{ engine: 'chromium', browserVersion: 'x', consoleErrors: [], shaderCompile: [{ compiled: true }] }],
        ]) {
            let result: any;
            expect(() => {
                result = collector.validateFiles({
                    schemaVersion: 'e07-liquid-metal/1',
                    phase: 'functional',
                    requestedEngines: ['chromium'],
                    ...identity,
                    engines,
                });
            }).not.toThrow();
            expect(result.ok).toBe(false);
        }
    });
    test('frozen capture set separates turbulence/warp/quality/dispersion families', () => {
        const ids = collector.CAPTURES.map(([id]: any) => id);
        for (const id of ['turbulence-zero', 'warp-zero', 'quality-low', 'dispersion-zero', 'machined-bevel', 'seed-2'])
            expect(ids).toContain(id);
    });
});
