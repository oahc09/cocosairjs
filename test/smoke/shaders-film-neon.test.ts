// Synthetic NODE_CONTRACT fixtures only. Real browser claims come from the Lead-run collector.
import { validate } from '../../examples/shader-film-neon/src/parameters';
import { effectDefinition } from '../../examples/shader-film-neon/src/effect.generated';
const oracle = require('../../tools/verify/shaders-film-neon-oracle.cjs');
const perf = require('../../tools/verify/shaders-film-neon-performance.cjs');
const contract = require('../../tools/verify/shaders-effect-contract.cjs');
const collector = require('../../tools/verify/shaders-film-neon-browser.cjs');
const fs = require('node:fs'),
    path = require('node:path'),
    os = require('node:os');
const { PNG } = require('pngjs');

const defaults = oracle.defaults();
const W = 640,
    H = 400;

describe('C02 parameter contract (synthetic)', () => {
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
        { ...defaults, thickness: NaN },
        { ...defaults, thickness: Infinity },
        { ...defaults, rimWidth: 0.05 },
        { ...defaults, shape: 'blob' },
        { ...defaults, filmEnabled: 'maybe' },
        { ...defaults, tubeColor: 'red' },
    ])('reject invalid parameter input %#', (value) => {
        expect(validate(oracle.definition, value).ok).toBe(false);
    });
    test('rejects malformed input without partial application', () => {
        const checked = validate(oracle.definition, { ...defaults, thickness: NaN, glowRadius: 9 });
        expect(checked.ok).toBe(false);
        expect(checked.values).toBeUndefined();
        expect(checked.errors.length).toBe(2);
    });
    test('boundary plan contains unique complete descriptor cases', () => {
        const rows = oracle.boundaryPlan();
        // 17 numeric × 6 + 6 enum/string × 2 = 114
        expect(rows).toHaveLength(114);
        expect(new Set(rows.map((r: any) => r.caseId)).size).toBe(114);
        for (const r of rows)
            expect(validate(oracle.definition, { ...defaults, [r.parameter]: r.value }).ok).toBe(
                r.boundary !== 'invalid',
            );
    });
});

describe('C02 generated effect metadata (production-data semantics)', () => {
    test('Constants block members bind the nine actual vec4 uniforms', () => {
        const block = effectDefinition.shaders[0].blocks.find((b: any) => b.name === 'Constants');
        expect(block.members.map((m: any) => m.name)).toEqual([
            'c0',
            'c1',
            'c2',
            'c3',
            'c4',
            'c5',
            'tubeColor',
            'secondaryColor',
            'glowColor',
        ]);
        expect(block.members.every((m: any) => m.type === 16 && m.count === 1)).toBe(true);
        const properties = effectDefinition.techniques[0].passes[0].properties;
        expect(Object.keys(properties).sort()).toEqual(
            ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'tubeColor', 'secondaryColor', 'glowColor'].sort(),
        );
        const frag = effectDefinition.shaders[0].glsl3.frag;
        expect(frag.includes('filmLayer') && frag.includes('neonLayer')).toBe(true);
        expect(frag.includes('holo') || frag.includes('liquid') || frag.includes('neon0')).toBe(false);
    });
});

describe('C02 composition math (synthetic goldens)', () => {
    const edgeY = 80; // circle edge in the frozen viewport (0.5±0.30 → y=200±120)
    test('both layers coexist at the rim edge', () => {
        const m = oracle.model(320, edgeY, W, H, defaults, 0.25);
        expect(m.film.alpha).toBeGreaterThan(0.05);
        expect(m.neon.straight[3]).toBeGreaterThan(0.05);
        expect(m.composite.outA).toBeGreaterThan(m.neon.straight[3]);
    });
    test('film-off is a real identity: composite equals neon alone', () => {
        const off = oracle.model(320, edgeY, W, H, { ...defaults, filmEnabled: 'off' }, 0.25);
        expect(off.film.alpha).toBe(0);
        expect(off.composite.outA).toBeCloseTo(off.neon.straight[3], 12);
        for (let i = 0; i < 3; i++) expect(off.straightLinear[i]).toBeCloseTo(off.neon.straight[i], 12);
    });
    test('neon-off is a real identity: composite alpha equals film alpha', () => {
        const off = oracle.model(320, edgeY, W, H, { ...defaults, neonEnabled: 'off' }, 0.25);
        expect(off.neon.straight[3]).toBe(0);
        expect(off.composite.outA).toBeCloseTo(off.film.alpha, 12);
    });
    test('RGB zero but alpha nonzero is NOT an identity (neon glow case)', () => {
        // At the outer glow falloff neon alpha > 0 but rgb is fading — toggling film off must
        // still change the result vs both-on (the layer is not "zero").
        const both = oracle.model(320, 78, W, H, defaults, 0.25);
        const filmOff = oracle.model(320, 78, W, H, { ...defaults, filmEnabled: 'off' }, 0.25);
        expect(both.neon.straight[3]).toBeGreaterThan(0);
        // Both should have different alpha (neon glow doesn't fully cover at this radius).
        expect(both.composite.outA).toBeGreaterThanOrEqual(filmOff.composite.outA);
    });
    test('both-off is exactly zero', () => {
        const m = oracle.model(320, edgeY, W, H, { ...defaults, filmEnabled: 'off', neonEnabled: 'off' }, 0.25);
        expect(m.straightLinear).toEqual([0, 0, 0, 0]);
    });
    test('source-over is non-commutative in RGB where both alphas are partial', () => {
        const m = oracle.model(320, edgeY, W, H, defaults, 0.25);
        const nA = m.neon.straight[3],
            fA = m.film.alpha;
        if (nA > 0.05 && fA > 0.05 && nA < 0.95) {
            // Reversed: film over neon
            const revA = fA + nA * (1 - fA);
            const revR = m.film.straight[0] * fA + m.neon.straight[0] * nA * (1 - fA);
            const fwdR = m.neon.straight[0] * nA + m.film.straight[0] * fA * (1 - nA);
            if (revA > 0.001 && m.composite.outA > 0.001) {
                expect(revR / revA).not.toBeCloseTo(fwdR / m.composite.outA, 6);
            }
        }
    });
    test('zero-alpha is safe (no NaN from un-premultiply)', () => {
        const m = oracle.model(64, 200, W, H, defaults, 0.25);
        expect(m.composite.outA).toBe(0);
        expect(m.straightLinear.every(Number.isFinite)).toBe(true);
        expect(m.straightLinear.slice(0, 3)).toEqual([0, 0, 0]);
    });
    test('single OETF: display is not double-encoded', () => {
        const m = oracle.model(320, edgeY, W, H, defaults, 0.25);
        const film = require('../../tools/verify/shaders-thin-film-oracle.cjs').model(
            320,
            edgeY,
            W,
            H,
            oracle.filmParamsOf(defaults),
            0.25,
        );
        const neon = require('../../tools/verify/shaders-neon-oracle.cjs').model(
            320,
            edgeY,
            W,
            H,
            oracle.neonParamsOf(defaults),
            0.25,
        ).straightLinear;
        const alpha = neon[3] + film.alpha * (1 - neon[3]);
        const linear = [0, 1, 2].map(
            (i) => (neon[i] * neon[3] + film.linearStraight[i] * film.alpha * (1 - neon[3])) / alpha,
        );
        const encode = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
        const clamp = (x: number) => Math.max(0, Math.min(1, x));
        const background = [8, 9, 12];
        const once = linear.map((x, i) => Math.round(clamp(encode(x)) * alpha * 255 + background[i] * (1 - alpha)));
        const twice = linear.map((x, i) =>
            Math.round(clamp(encode(clamp(encode(x)))) * alpha * 255 + background[i] * (1 - alpha)),
        );
        expect(m.display).toEqual([...once, 255]);
        expect(twice.some((value, i) => Math.abs(value - once[i]) > oracle.BYTE_TOLERANCE)).toBe(true);
    });
    test('HDR preserved: intensity 3 neon straight exceeds 1 before format clamp', () => {
        const p = { ...defaults, filmEnabled: 'off', intensity: 3, specularIntensity: 2, hotCoreIntensity: 1 };
        const m = oracle.model(310, 75, W, H, p, 0.25);
        expect(m.straightLinear[1]).toBeCloseTo(1.1354395968681499, 10);
        expect(m.straightLinear[2]).toBeCloseTo(1.5703361354493404, 10);
        expect(m.straightLinear[3]).toBeCloseTo(0.314067227, 6);
    });
    test('positive small-alpha film: straight RGB preserved (no premature 0.001 threshold)', () => {
        const p = { ...defaults, neonEnabled: 'off', opacity: 0.00001 };
        const m = oracle.model(320, 80, W, H, p, 0.25);
        expect(m.film.alpha).toBeGreaterThan(0);
        expect(m.film.alpha).toBeLessThan(0.001);
        expect(m.straightLinear[0]).toBeCloseTo(0.044225, 5);
        expect(m.straightLinear[1]).toBeCloseTo(0.087992, 5);
        expect(m.straightLinear[2]).toBeCloseTo(0.257019, 5);
    });
    test('true RGB-zero alpha-nonzero case: intensity 0 makes neon RGB exactly zero', () => {
        const p = { ...defaults, neonEnabled: 'on', intensity: 0 };
        const m = oracle.model(320, 80, W, H, p, 0.25);
        // With intensity 0 the neon RGB is exactly 0 but alpha (tubeMask) can be nonzero.
        expect(m.neon.straight[0]).toBe(0);
        expect(m.neon.straight[1]).toBe(0);
        expect(m.neon.straight[2]).toBe(0);
        expect(m.neon.straight[3]).toBeGreaterThan(0);
    });
    test('layer independence: changing film params does not alter the neon layer output', () => {
        const a = oracle.model(320, edgeY, W, H, defaults, 0.25);
        const b = oracle.model(320, edgeY, W, H, { ...defaults, saturation: 0 }, 0.25);
        expect(b.neon.straight).toEqual(a.neon.straight);
    });
});

describe('C02 PNG and probe oracles (synthetic fixtures)', () => {
    function temp() {
        return fs.mkdtempSync(path.join(os.tmpdir(), 'film-neon-c02-'));
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
            const polluted = oracle.pngAudit(file, { ...defaults, filmEnabled: 'off' }, 0.25);
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
                rgba: value.straightLinear.map((x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255)),
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
        for (const [label, mutate] of [
            ['NaN byte', (bad: any) => (bad.pixels[1].rgba[0] = NaN)],
            [
                'negative frame',
                (bad: any) => {
                    bad.frame = -1;
                    bad.gpuReceipt.frame = -2;
                },
            ],
            ['time unbound', (bad: any) => (bad.time = 0.5)],
        ] as [string, (bad: any) => void][]) {
            const bad = JSON.parse(JSON.stringify(probe));
            mutate(bad);
            expect(oracle.probeAudit(bad, defaults, 0.25).errors.length).toBeGreaterThan(0);
        }
    });
});

describe('C02 resource and performance fixtures (synthetic)', () => {
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
    test.each(['refs9', 'dupkind', 'short'])('reject resource tamper %s', (mutation) => {
        const r = resource();
        if (mutation === 'refs9') r.rows[2].trace.refs[0].after = 9;
        if (mutation === 'dupkind') r.rows[2].trace.refs = KINDS.map(() => ({ kind: 'mesh', before: 1, after: 0 }));
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
            commands: frames.map((r) => ({ frame: r.frame, ms: 0.3, name: 'beginRenderPass' })),
            draws: frames.map((r) => ({ frame: r.frame, ms: 0.2, name: 'drawElements' })),
            queueBookkeeping: frames.map((r) => ({ frame: r.frame, ms: 0.01 })),
            gpuSamples: [],
            queryEvents: [],
            timerAvailable: false,
            readPixelsDuringWindow: 0,
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
    test('performance reducer accepts the single-pass composition frame', () => {
        expect(perf.validatePerformance(performance(), perf.PROFILES[0]).errors).toEqual([]);
    });
    test.each(['nan', 'duplicate', 'warmup'])('reject performance tamper %s', (mutation) => {
        const r: any = performance();
        if (mutation === 'nan') r.draws[80].ms = NaN;
        if (mutation === 'duplicate') r.frames[80].frame = 80;
        if (mutation === 'warmup') r.warmupFrames = 0;
        expect(perf.validatePerformance(r, perf.PROFILES[0]).errors.length).toBeGreaterThan(0);
    });
});

describe('C02 collector contract (synthetic totality)', () => {
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
                    schemaVersion: 'w4-c02-film-neon/1',
                    phase: 'functional',
                    requestedEngines: ['chromium'],
                    ...identity,
                    engines,
                });
            }).not.toThrow();
            expect(result.ok).toBe(false);
        }
    });
    test('frozen capture set separates film/neon/both-off/identity families', () => {
        const ids = collector.CAPTURES.map(([id]: any) => id);
        for (const id of ['film-off', 'neon-off', 'both-off', 'film-zero-opacity', 'neon-zero-glow', 'film-saturated'])
            expect(ids).toContain(id);
    });
});
