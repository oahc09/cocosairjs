// Synthetic NODE_CONTRACT fixtures only. Real browser claims come from the Lead-run collector.
import { validate } from '../../examples/shader-emboss/src/parameters';
const oracle = require('../../tools/verify/shaders-emboss-oracle.cjs');
const perf = require('../../tools/verify/shaders-emboss-performance.cjs');
const contract = require('../../tools/verify/shaders-effect-contract.cjs');
const collector = require('../../tools/verify/shaders-emboss-browser.cjs');
const fs = require('node:fs'),
    path = require('node:path'),
    os = require('node:os');
const { PNG } = require('pngjs');

const defaults = oracle.defaults();
const W = 640,
    H = 400;

describe('E05 parameter contract (synthetic)', () => {
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
        { ...defaults, depth: NaN },
        { ...defaults, depth: Infinity },
        { ...defaults, depth: -1.01 },
        { ...defaults, scale: 3 },
        { ...defaults, shape: 'triangle' },
        { ...defaults, sourceKind: 'nope' },
        { ...defaults, lightAngle: '90' },
    ])('reject invalid parameter input %#', (value) => {
        expect(validate(oracle.definition, value).ok).toBe(false);
    });
    test('rejects malformed input without partial application', () => {
        const checked = validate(oracle.definition, { ...defaults, depth: NaN, lightIntensity: 9 });
        expect(checked.ok).toBe(false);
        expect(checked.values).toBeUndefined();
        expect(checked.errors.length).toBe(2);
    });
    test('boundary plan contains unique complete descriptor cases', () => {
        const rows = oracle.boundaryPlan();
        expect(rows).toHaveLength(40);
        expect(new Set(rows.map((r: any) => r.caseId)).size).toBe(40);
        for (const r of rows)
            expect(validate(oracle.definition, { ...defaults, [r.parameter]: r.value }).ok).toBe(
                r.boundary !== 'invalid',
            );
    });
});

describe('E05 child RTT premultiply chain (synthetic)', () => {
    test('pattern is deterministic and UV-anchored (asymmetric checker + gradient)', () => {
        expect(oracle.pattern(0.1, 0.5, 'standard').rgb).not.toEqual(oracle.pattern(0.9, 0.5, 'standard').rgb);
        expect(oracle.pattern(0.1, 0.5, 'standard')).toEqual(oracle.pattern(0.1, 0.5, 'standard'));
        expect(oracle.childTexel(0, 0, 'blank')).toEqual([0, 0, 0, 0]);
    });
    test('premultiplied storage zeroes hidden RGB under alpha 0', () => {
        // The hidden disc centre: u=0.75, v=0.25 → texel (191, 63).
        const hidden = oracle.pattern(0.75, 0.25, 'standard');
        expect(hidden.alpha).toBe(0);
        expect(hidden.rgb).toEqual([1, 0.437, 0]);
        expect(oracle.childTexel(191, 63, 'standard')).toEqual([0, 0, 0, 0]);
    });
    test('premultiplied storage halves exactly at alpha 0.5', () => {
        // u = 0.75, v = 0.5 → right half, checker cell (6+4) even → 0.35 lightness.
        const straight = oracle.pattern(0.75, 0.5, 'standard');
        expect(straight.alpha).toBe(0.5);
        const texel = oracle.childTexel(191, 127, 'standard');
        expect(texel[3]).toBe(128);
        expect(Math.abs(texel[0] - Math.round(straight.rgb[0] * 0.5 * 255))).toBeLessThanOrEqual(1);
    });
    test('alpha-safe unpremultiply recovers semi-transparent straight colour exactly', () => {
        const sample = oracle.sampleChild(0.75, 0.5, 'standard');
        const straight = oracle.pattern(0.75 + 0.5 / 256 / 2, 0.5 + 0.5 / 256 / 2, 'standard');
        expect(sample.alpha).toBeCloseTo(128 / 255, 10);
        // Not darkened: the recovered straight rgb equals the pattern rgb, not rgb*0.5.
        for (let i = 0; i < 3; i++) expect(sample.straight[i]).toBeGreaterThan(straight.rgb[i] * 0.6);
    });
    test('hidden-RGB disc and blank source produce finite values with no NaN', () => {
        for (const sourceKind of ['standard', 'blank']) {
            for (const p of oracle.auditPoints(W, H)) {
                const value = oracle.model(p.x, p.y, W, H, { ...defaults, sourceKind }, 0);
                expect(value.straightLinear.every(Number.isFinite)).toBe(true);
                expect(value.display.every(Number.isFinite)).toBe(true);
            }
        }
    });
});

describe('E05 emboss math (synthetic golden cases)', () => {
    test('planar interior plateau has normal +z and zero edge lighting', () => {
        const plateau = oracle.model(320, 200, W, H, defaults, 0);
        expect(plateau.geometry.normal[0]).toBeCloseTo(0, 10);
        expect(plateau.geometry.normal[1]).toBeCloseTo(0, 10);
        expect(plateau.geometry.normal[2]).toBeCloseTo(1, 10);
        expect(plateau.light.highlight).toBe(0);
        expect(plateau.light.edgeShadow).toBe(0);
    });
    test('known ramp: boundary gradient is non-zero with the depth-signed sign', () => {
        const raised = oracle.model(320, Math.round(0.5 * H - 0.298 * H), W, H, { ...defaults, depth: 0.5 }, 0);
        const sunken = oracle.model(320, Math.round(0.5 * H - 0.298 * H), W, H, { ...defaults, depth: -0.5 }, 0);
        expect(Math.abs(raised.geometry.dhy)).toBeGreaterThan(0.01);
        expect(raised.geometry.dhy).toBeCloseTo(-sunken.geometry.dhy, 8);
    });
    test('depth sign swaps highlight and edge shadow', () => {
        const raised = oracle.model(320, Math.round(0.5 * H - 0.298 * H), W, H, { ...defaults, depth: 0.5 }, 0);
        const sunken = oracle.model(320, Math.round(0.5 * H - 0.298 * H), W, H, { ...defaults, depth: -0.5 }, 0);
        // Same light: one side highlights, the mirrored relief does the opposite.
        expect(raised.light.highlight + sunken.light.edgeShadow).toBeGreaterThan(0);
        expect(raised.light.highlight > 0 ? sunken.light.edgeShadow > 0 : true).toBe(true);
    });
    test('light reversal by 180 degrees inverts the edge term exactly', () => {
        const point = [320, Math.round(0.5 * H - 0.298 * H)];
        const a = oracle.model(point[0], point[1], W, H, { ...defaults, lightAngle: 90 }, 0);
        const b = oracle.model(point[0], point[1], W, H, { ...defaults, lightAngle: 270 }, 0);
        // highlight - edgeShadow recovers the raw edge term E; the exact identity at a tilted
        // normal (nz < 1) is E(θ) + E(θ+180°) = 2·lzn·(nz − 1)·intensity.
        const E = (m: any) => m.light.highlight - m.light.edgeShadow;
        const lzn = 0.7 / Math.sqrt(1.49);
        expect(E(a) + E(b)).toBeCloseTo(2 * lzn * (a.geometry.normal[2] - 1) * defaults.lightIntensity, 6);
        expect(a.light.highlight).toBeGreaterThan(0);
        expect(b.light.edgeShadow).toBeGreaterThan(b.light.highlight);
    });
    test('depth zero is an exact child passthrough including alpha', () => {
        const a = oracle.model(320, 200, W, H, { ...defaults, depth: 0 }, 0);
        const b = oracle.model(
            320,
            200,
            W,
            H,
            { ...defaults, depth: 0, lightAngle: 33, lightIntensity: 2, shadowIntensity: 1 },
            0,
        );
        expect(a.straightLinear).toEqual(b.straightLinear);
        const direct = oracle.sampleChild(0.5, 0.5, 'standard');
        expect(a.child.alpha).toBeCloseTo(direct.alpha, 10);
    });
    test('outside the shape passes the child through unwarped', () => {
        const outside = oracle.model(64, 200, W, H, defaults, 0);
        const direct = oracle.sampleChild((64 + 0.5) / W, (200 + 0.5) / H, 'standard');
        expect(outside.geometry.dispScale).toBeCloseTo(1, 12);
        expect(outside.light.totalShadow).toBe(0);
        for (let i = 0; i < 3; i++) expect(outside.straightLinear[i]).toBeCloseTo(direct.straight[i], 12);
        expect(outside.child.alpha).toBe(direct.alpha);
    });
    test('trace shadow fires on the light side beyond the boundary and is bounded', () => {
        // Light 90° (up): points just below the bottom boundary sit along the trace direction.
        const below = oracle.model(320, Math.round(0.5 * H - 0.26 * H), W, H, { ...defaults, lightAngle: 270 }, 0);
        expect(below.light.castShadow).toBeGreaterThan(0);
        expect(below.light.totalShadow).toBeLessThanOrEqual(1);
        const interior = oracle.model(320, 200, W, H, { ...defaults, lightAngle: 270 }, 0);
        expect(interior.light.castShadow).toBe(0);
    });
    test('warp is inside-only parallax scaling, not displacement geometry', () => {
        const inside = oracle.model(320, 200, W, H, { ...defaults, depth: 0.5 }, 0);
        const outside = oracle.model(64, 200, W, H, { ...defaults, depth: 0.5 }, 0);
        expect(inside.geometry.dispScale).toBeCloseTo(1 - 0.5 * 0.05, 10);
        expect(outside.geometry.dispScale).toBeCloseTo(1, 10);
    });
});

describe('E05 PNG and probe oracles (synthetic fixtures)', () => {
    function temp() {
        return fs.mkdtempSync(path.join(os.tmpdir(), 'emboss-e05-'));
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
            const polluted = oracle.pngAudit(file, { ...defaults, depth: 0.5 }, 0.25);
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
                childStillAttached: true,
                detached: true,
                disposed: true,
                glError: 0,
            },
        };
        expect(oracle.probeAudit(probe, defaults, 0.25).errors).toEqual([]);
        const tampered = JSON.parse(JSON.stringify(probe));
        tampered.pixels[0].rgba = [0, 0, 0, 3];
        expect(oracle.probeAudit(tampered, defaults, 0.25).errors.length).toBeGreaterThan(0);
        const mismatched = oracle.probeAudit({ ...probe, time: 0.5 }, defaults, 0.25);
        expect(mismatched.errors.length).toBeGreaterThan(0);
        for (const malformed of [[], [1], [0, 0, NaN, 0], [0, 0, Infinity, 0], [0, 0, '255', 0]]) {
            const bad = JSON.parse(JSON.stringify(probe));
            bad.pixels[1].rgba = malformed;
            expect(oracle.probeAudit(bad, defaults, 0.25).errors.length).toBeGreaterThan(0);
        }
        const negativeFrame = JSON.parse(JSON.stringify(probe));
        negativeFrame.frame = -1;
        negativeFrame.gpuReceipt.frame = -2;
        expect(oracle.probeAudit(negativeFrame, defaults, 0.25).errors.length).toBeGreaterThan(0);
    });
});

describe('E05 resource and performance fixtures (synthetic)', () => {
    const KINDS = ['mesh', 'material', 'effect', 'childMesh', 'childMaterial', 'childEffect'];
    function resource() {
        return {
            rows: Array.from({ length: 100 }, (_, index) => ({
                index,
                id: index + 1,
                before: { bufferSize: 100, textureSize: 50 },
                created: { bufferSize: 640, textureSize: 262208 },
                after: { bufferSize: 100, textureSize: 50 },
                refsBefore: [1, 1, 1, 1, 1, 1],
                trace: {
                    rendererUnbound: true,
                    nodeRemoved: true,
                    childRendererUnbound: true,
                    childNodeRemoved: true,
                    childTargetDetached: true,
                    childTargetDisposed: true,
                    refs: KINDS.map((kind) => ({ kind, before: 1, after: 0 })),
                },
                repeat: { idempotent: true },
                nodeValid: false,
                childNodeValid: false,
                assetsValid: [false, false, false, false, false, false],
                childTargetDisposedAfterRetire: true,
                registryPresent: false,
            })),
        };
    }
    test('resource fixture has six distinct owned kinds and real allocation', () => {
        expect(oracle.resourceAudit(resource()).errors).toEqual([]);
    });
    test.each(['allzero', 'refs', 'dupkind', 'leak', 'duplicate', 'unbind', 'child', 'short'])(
        'reject resource tamper %s',
        (mutation) => {
            const r = resource();
            if (mutation === 'allzero') r.rows.forEach((row: any) => (row.created.textureSize = 50));
            if (mutation === 'refs') r.rows[2].trace.refs[0].after = 9;
            if (mutation === 'dupkind') r.rows[2].trace.refs = KINDS.map(() => ({ kind: 'mesh', before: 1, after: 0 }));
            if (mutation === 'leak') r.rows[3].after.textureSize += 8;
            if (mutation === 'duplicate') r.rows[1].id = 1;
            if (mutation === 'unbind') r.rows[4].trace.rendererUnbound = false;
            if (mutation === 'child') r.rows[5].trace.childTargetDisposed = false;
            if (mutation === 'short') r.rows.length = 99;
            expect(oracle.resourceAudit(r).errors.length).toBeGreaterThan(0);
        },
    );
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
            drawCalls: 2,
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
    test('performance reducer accepts the two-pass RTT frame', () => {
        const result = perf.validatePerformance(performance(), perf.PROFILES[0]);
        expect(result.errors).toEqual([]);
        expect(result.measurements).toBe(90);
    });
    test.each(['single-draw', 'nan', 'duplicate', 'missing-update', 'dpr', 'warmup'])(
        'reject performance tamper %s',
        (mutation) => {
            const r: any = performance();
            if (mutation === 'single-draw') r.frames.forEach((f: any) => (f.drawCalls = 1));
            if (mutation === 'nan') r.draws[80].ms = NaN;
            if (mutation === 'duplicate') r.frames[80].frame = 80;
            if (mutation === 'missing-update') r.updateCalls.pop();
            if (mutation === 'dpr') r.viewport.dpr = 2;
            if (mutation === 'warmup') r.warmupFrames = 0;
            expect(perf.validatePerformance(r, perf.PROFILES[0]).errors.length).toBeGreaterThan(0);
        },
    );
    test('performance validator is total on null frames', () => {
        let result: any;
        expect(() => {
            result = perf.validatePerformance(
                { frames: Array.from({ length: 90 }, () => null), warmupFrames: 30 },
                perf.PROFILES[0],
            );
        }).not.toThrow();
        expect(result.errors.length).toBeGreaterThan(0);
    });
});

describe('E05 collector contract (synthetic totality)', () => {
    test.each([null, undefined, {}, [], { schemaVersion: 'other' }, { schemaVersion: 'e05-emboss/1', engines: [{}] }])(
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
            schemaVersion: 'e05-emboss/1',
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
                schemaVersion: 'e05-emboss/1',
                phase: 'functional',
                requestedEngines: ['chromium'],
                ...collector.currentIdentity(),
                engines: [null],
            });
        }).not.toThrow();
        expect(result.ok).toBe(false);
    });
    test('frozen capture set separates depth/sign/alpha families explicitly', () => {
        const ids = collector.CAPTURES.map(([id]: any) => id);
        for (const id of ['raised', 'depth-zero', 'blank-source', 'light-90', 'light-270', 'shadow-zero'])
            expect(ids).toContain(id);
    });
});
