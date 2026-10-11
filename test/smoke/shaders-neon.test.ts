// Synthetic NODE_CONTRACT fixtures only. Real browser claims come from the Lead-run collector.
import { validate, decodeColor } from '../../examples/shader-neon/src/parameters';
const oracle = require('../../tools/verify/shaders-neon-oracle.cjs');
const perf = require('../../tools/verify/shaders-neon-performance.cjs');
const contract = require('../../tools/verify/shaders-effect-contract.cjs');
const collector = require('../../tools/verify/shaders-neon-browser.cjs');
const fs = require('node:fs'),
    path = require('node:path'),
    os = require('node:os');
const { PNG } = require('pngjs');

const defaults = oracle.defaults();

describe('E04 Neon parameter contract (synthetic)', () => {
    test('definition and defaults have a single valid source', () => {
        expect(contract.validateDefinition(oracle.definition).ok).toBe(true);
        expect(validate(oracle.definition, defaults).ok).toBe(true);
        expect(decodeColor('#00ddff')[1]).toBeCloseTo(Math.pow((221 / 255 + 0.055) / 1.055, 2.4), 12);
    });
    test.each([
        null,
        {},
        [],
        'string',
        { ...defaults, unknown: 1 },
        { ...defaults, intensity: NaN },
        { ...defaults, intensity: Infinity },
        { ...defaults, intensity: -0.01 },
        { ...defaults, scale: 2.5 },
        { ...defaults, shape: 'triangle' },
        { ...defaults, tubeColor: 'red' },
        { ...defaults, glowColor: 42 },
        { ...defaults, rotation: '90' },
    ])('reject invalid parameter input %#', (value) => {
        expect(validate(oracle.definition, value).ok).toBe(false);
    });
    test('rejects malformed input without partial application hints', () => {
        const checked = validate(oracle.definition, { ...defaults, intensity: NaN, glowIntensity: 5 });
        expect(checked.ok).toBe(false);
        expect(checked.values).toBeUndefined();
        expect(checked.errors.length).toBe(2);
    });
    test('boundary plan contains unique complete descriptor cases', () => {
        const rows = oracle.boundaryPlan();
        expect(new Set(rows.map((r: any) => r.caseId)).size).toBe(rows.length);
        for (const r of rows)
            expect(validate(oracle.definition, { ...defaults, [r.parameter]: r.value }).ok).toBe(
                r.boundary !== 'invalid',
            );
    });
});

describe('E04 independent SDF math (synthetic)', () => {
    test('SDF signs and outward normals are independent of the shader', () => {
        expect(oracle.distance(0, 0, 'circle')).toBeLessThan(0);
        expect(oracle.distance(0.4, 0, 'circle')).toBeGreaterThan(0);
        expect(oracle.distance(0.24, 0.16, 'rounded-box')).toBeLessThan(0);
        expect(oracle.distance(0.4, 0, 'rounded-box')).toBeGreaterThan(0);
        const center = oracle.model(320, 200, 640, 400, defaults, 0);
        // The pixel centre sits slightly off-origin on the diagonal, so the outward normal of a
        // circle points along (1,1)/sqrt(2) — an independent geometric fact, not a shader echo.
        expect(center.geometry.normal[0]).toBeCloseTo(Math.SQRT1_2, 5);
        expect(center.geometry.normal[1]).toBeCloseTo(Math.SQRT1_2, 5);
        expect(Math.hypot(...center.geometry.normal)).toBeCloseTo(1, 10);
    });
    test('stencil is centre + four cardinal taps at the smoothed radius', () => {
        const m = oracle.model(320, 200, 640, 400, { ...defaults, cornerSmoothing: 1 }, 0);
        const eps = m.stencil.smoothEPS;
        expect(eps).toBeCloseTo(0.008 + 0.03, 12);
        const { sC, sR, sL, sU, sD } = m.stencil;
        // Near-origin interior point with a 0.038 stencil radius: every cardinal tap
        // moves away from the circle centre, so all four taps exceed the centre value.
        expect(sR).toBeGreaterThan(sC);
        expect(sU).toBeGreaterThan(sC);
        expect(sL).toBeGreaterThan(sC);
        expect(sD).toBeGreaterThan(sC);
    });
    test('rotation stays rigid and 360° is identity', () => {
        const a = oracle.model(400, 200, 640, 400, { ...defaults, rotation: 0 }, 0).domain;
        const b = oracle.model(400, 200, 640, 400, { ...defaults, rotation: 360 }, 0).domain;
        expect(b[0]).toBeCloseTo(a[0], 10);
        expect(b[1]).toBeCloseTo(a[1], 10);
        const rotated = oracle.model(400, 200, 640, 400, { ...defaults, rotation: 90 }, 0).domain;
        expect(Math.hypot(...rotated)).toBeCloseTo(Math.hypot(...a), 10);
    });
});

describe('E04 layer separation (synthetic)', () => {
    // The neon tube is a rim band around the SDF zero crossing (a hollow glass tube), so
    // probe points are chosen by signed distance, not by "inside the shape".
    const center = { x: 320, y: 200 },
        tubeBand = { x: 320 + Math.round(0.295 * 400), y: 200 },
        tubeEdge = { x: 320 + Math.round(0.3 * 400), y: 200 },
        coreInner = { x: 320, y: 200 + Math.round(0.275 * 400) },
        glowRing = { x: 320 + Math.round(0.33 * 400), y: 200 },
        far = { x: 320 + Math.round(0.6 * 400), y: 200 };
    test('glow layer is independent: zero gain removes glow but keeps the tube', () => {
        const withGlow = oracle.model(tubeBand.x, tubeBand.y, 640, 400, defaults, 0.25);
        const noGlow = oracle.model(glowRing.x, glowRing.y, 640, 400, { ...defaults, glowIntensity: 0 }, 0.25);
        const ring = oracle.model(glowRing.x, glowRing.y, 640, 400, defaults, 0.25);
        expect(ring.layers.glow.masked).toBeGreaterThan(0.01);
        expect(noGlow.layers.glow.masked).toBe(0);
        expect(noGlow.layers.glow.alpha).toBe(0);
        expect(withGlow.layers.tube.mask).toBeGreaterThan(0);
    });
    test('core layer is independent: zero intensity removes the hot core only', () => {
        const withCore = oracle.model(coreInner.x, coreInner.y, 640, 400, defaults, 0.25);
        const noCore = oracle.model(coreInner.x, coreInner.y, 640, 400, { ...defaults, hotCoreIntensity: 0 }, 0.25);
        expect(withCore.layers.core.amount).toBeGreaterThan(0.2);
        expect(noCore.layers.core.amount).toBe(0);
        expect(noCore.layers.tube.mask).toBe(withCore.layers.tube.mask);
        expect(noCore.straightLinear).not.toEqual(withCore.straightLinear);
    });
    test('tube layer is independent: thickness widens the mask band', () => {
        const thin = oracle.model(tubeEdge.x, tubeEdge.y, 640, 400, { ...defaults, tubeThickness: 0.001 }, 0);
        const thick = oracle.model(tubeEdge.x, tubeEdge.y, 640, 400, { ...defaults, tubeThickness: 0.06 }, 0);
        expect(thick.layers.tube.mask).toBeGreaterThan(thin.layers.tube.mask);
        expect(thin.layers.glow.masked).toBeGreaterThan(0);
    });
    test('zero thickness stays finite and keeps a soft filament', () => {
        const m = oracle.model(tubeEdge.x, tubeEdge.y, 640, 400, { ...defaults, tubeThickness: 0 }, 0);
        expect(m.straightLinear.every(Number.isFinite)).toBe(true);
        expect(m.layers.tube.mask).toBeGreaterThan(0);
    });
    test('flicker determinism: amount 0 holds the lamp on at every time', () => {
        const p = { ...defaults, flickerAmount: 0 };
        for (const t of [0, 0.37, 1.25, 7.7]) {
            const m = oracle.model(center.x, center.y, 640, 400, p, t);
            expect(m.modulation.flicker).toBe(1);
        }
    });
    test('flow determinism: amount 0 disables the angular band', () => {
        const m = oracle.model(center.x, center.y, 640, 400, { ...defaults, flowAmount: 0 }, 3.5);
        expect(m.modulation.flowMod).toBe(1);
    });
    test('far cutout: alpha is exactly zero beyond glowR*1.5 + softPx + smoothEPS', () => {
        const m = oracle.model(far.x, far.y, 640, 400, defaults, 0);
        expect(m.cutout).toBe(true);
        expect(m.straightLinear).toEqual([0, 0, 0, 0]);
        expect(m.display[3]).toBe(255);
        const glowR = Math.max(defaults.glowRadius, 0.001),
            limit = glowR * 1.5 + m.stencil.softPx + m.stencil.smoothEPS;
        expect(m.stencil.sC).toBeGreaterThan(limit);
    });
    test('glow radius zero is clamped like the reference and stays finite', () => {
        const m = oracle.model(glowRing.x, glowRing.y, 640, 400, { ...defaults, glowRadius: 0 }, 0);
        expect(m.straightLinear.every(Number.isFinite)).toBe(true);
    });
});

describe('E04 PNG oracle (synthetic fixtures)', () => {
    function temp() {
        return fs.mkdtempSync(path.join(os.tmpdir(), 'neon-e04-'));
    }
    test('accepts its own synthetic arithmetic and rejects parameter pollution', () => {
        const dir = temp();
        try {
            const png = new PNG({ width: 640, height: 400 });
            for (let y = 0; y < 400; y++)
                for (let x = 0; x < 640; x++) {
                    const rgba = oracle.model(x, y, 640, 400, defaults, 0.25).display;
                    for (let c = 0; c < 4; c++) png.data[((399 - y) * 640 + x) * 4 + c] = rgba[c];
                }
            const file = path.join(dir, 'synthetic.png');
            fs.writeFileSync(file, PNG.sync.write(png));
            expect(oracle.pngAudit(file, defaults, 0.25).errors).toEqual([]);
            const polluted = oracle.pngAudit(file, { ...defaults, glowIntensity: 0 }, 0.25);
            expect(polluted.errors.length).toBeGreaterThan(0);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    test('rejects an all-black PNG and a shifted PNG', () => {
        const dir = temp();
        try {
            const png = new PNG({ width: 640, height: 400 });
            png.data.fill(0);
            for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;
            const file = path.join(dir, 'black.png');
            fs.writeFileSync(file, PNG.sync.write(png));
            expect(oracle.pngAudit(file, defaults, 0.25).errors.length).toBeGreaterThan(0);
            const shifted = new PNG({ width: 640, height: 400 });
            for (let y = 0; y < 400; y++)
                for (let x = 0; x < 640; x++) {
                    const rgba = oracle.model(Math.max(0, x - 4), y, 640, 400, defaults, 0.25).display;
                    for (let c = 0; c < 4; c++) shifted.data[((399 - y) * 640 + x) * 4 + c] = rgba[c];
                }
            const shiftedFile = path.join(dir, 'shifted.png');
            fs.writeFileSync(shiftedFile, PNG.sync.write(shifted));
            expect(oracle.pngAudit(shiftedFile, defaults, 0.25).errors.length).toBeGreaterThan(0);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    test('linear probe audit demands exactly-zero far field on the transparent base', () => {
        const canvas = { width: 640, height: 400 };
        const pixels = oracle.auditPoints(640, 400).map((p) => {
            const value = oracle.model(p.x, p.y, 640, 400, defaults, 0.25, { linearDiagnostic: true });
            return {
                ...p,
                rgba: value.cutout
                    ? [0, 0, 0, 0]
                    : value.straightLinear.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255)),
            };
        });
        const probe = {
            frame: 9,
            time: 0.25,
            params: defaults,
            pixels,
            gpuReceipt: {
                frame: 8,
                time: 0.25,
                canvas,
                targetRGBA8: true,
                transparentClear: true,
                detached: true,
                disposed: true,
                glError: 0,
            },
        };
        expect(oracle.probeAudit(probe, defaults, 0.25).errors).toEqual([]);
        const tampered = JSON.parse(JSON.stringify(probe));
        const farIndex = pixels.findIndex((p) => {
            const value = oracle.model(p.x, p.y, 640, 400, defaults, 0.25);
            return value.cutout;
        });
        tampered.pixels[farIndex].rgba = [0, 0, 0, 3];
        expect(oracle.probeAudit(tampered, defaults, 0.25).errors.length).toBeGreaterThan(0);
        const mismatched = oracle.probeAudit({ ...probe, time: 0.5 }, defaults, 0.25);
        expect(mismatched.errors.length).toBeGreaterThan(0);
    });
});

describe('E04 resource and performance fixtures (synthetic)', () => {
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
                    refs: ['mesh', 'material', 'effect'].map((kind) => ({ kind, before: 1, after: 0 })),
                },
                repeat: { idempotent: true },
                nodeValid: false,
                assetsValid: [false, false, false],
                registryPresent: false,
            })),
        };
    }
    test('resource fixture has independent nonzero allocation and paired owner refs', () => {
        expect(oracle.resourceAudit(resource()).errors).toEqual([]);
    });
    test.each(['allzero', 'refs', 'leak', 'duplicate', 'unbind', 'short'])('reject resource tamper %s', (mutation) => {
        const r = resource();
        if (mutation === 'allzero') r.rows.forEach((row: any) => (row.created.bufferSize = 100));
        if (mutation === 'refs') r.rows[2].trace.refs[0].after = 9;
        if (mutation === 'leak') r.rows[3].after.bufferSize++;
        if (mutation === 'duplicate') r.rows[1].id = 1;
        if (mutation === 'unbind') r.rows[4].trace.rendererUnbound = false;
        if (mutation === 'short') r.rows.length = 99;
        expect(oracle.resourceAudit(r).errors.length).toBeGreaterThan(0);
    });
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
    test('performance reducer keeps distinct native/dispatch/bookkeeping samples', () => {
        const result = perf.validatePerformance(performance(), perf.PROFILES[0]);
        expect(result.errors).toEqual([]);
        expect(result.measurements).toBe(90);
        expect(result.samples.command[0]).toBe(0.3);
        expect(result.samples.dispatch[0]).toBe(0.2);
        expect(result.samples.queue[0]).toBe(0.01);
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
});

describe('E04 collector contract (synthetic totality)', () => {
    test.each([null, undefined, {}, [], { schemaVersion: 'other' }, { schemaVersion: 'e04-neon/1', engines: null }])(
        'strict collector validation is total %#',
        (raw) => {
            let result: any;
            expect(() => {
                result = collector.validateFiles(raw);
            }).not.toThrow();
            expect(result.ok).toBe(false);
        },
    );
    test('identity drift is detected against the current closure', () => {
        const report = {
            schemaVersion: 'e04-neon/1',
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
    test('frozen capture set separates glow/core/tube cases explicitly', () => {
        const ids = collector.CAPTURES.map(([id]: any) => id);
        expect(ids).toContain('glow-zero');
        expect(ids).toContain('core-zero');
        expect(ids).toContain('tube-thin');
        expect(ids).toContain('flicker-off');
        expect(ids).toContain('intensity-zero');
    });
});
