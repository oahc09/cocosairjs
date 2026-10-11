// C03 Glass Trail acceptance: production validators accept real baselines, then reject
// ≥20 structuredClone mutations. Every layer has assertions. No output/ dependency.
import type {} from 'jest';
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
const params = () => ({ ...C.defaults() });
const time = 0.25;

/** Build a production-shaped probe: pixels + gpuReceipt with real model outputs. */
function buildProbe(withBackground = false) {
    const pixels = C.auditPoints(width, height).map((p: any) => {
        const m = C.model(p.x, p.y, width, height, params(), time, path);
        return {
            x: p.x,
            y: p.y,
            rgba: m.straightLinear.map((v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255)),
        };
    });
    return {
        frame: 41,
        time,
        pixels,
        gpuReceipt: {
            frame: 40,
            time,
            glError: 0,
            targetRGBA8: true,
            transparentClear: true,
            detached: true,
            disposed: true,
            canvas: { width, height },
        },
    };
}

/** Build a production-shaped resource trace (100 rows, exact 6 kinds). */
function buildResources() {
    const row = (i: number) => ({
        index: i,
        id: i + 1,
        before: { bufferSize: 1000, textureSize: 2000 },
        created: { bufferSize: 1400, textureSize: 2600 },
        after: { bufferSize: 1000, textureSize: 2000 },
        refsBefore: [1, 1, 1, 1, 1, 1],
        trace: {
            renderersUnbound: true,
            nodesRemoved: true,
            trailDetached: true,
            trailDisposed: true,
            refs: C.OWNED_KINDS.map((kind: string, j: number) => ({ kind, before: 1, after: 0, uuid: 'u' + j })),
        },
        repeat: { idempotent: true },
        nodeValid: false,
        registryPresent: false,
    });
    return { rows: Array.from({ length: 100 }, (_, i) => row(i)) };
}

/** Build a production-shaped performance report (two-pass composition ≥2 draws). */
function buildPerformance() {
    const frames = Array.from({ length: 40 }, (_, i) => ({
        frame: 10 + i,
        intervalMs: 16.6,
        renderEnvelopeMs: 12,
        drawCalls: 2,
        bufferBytes: 1000,
        textureBytes: 2000,
    }));
    return {
        frames,
        warmupFrames: 30,
        updateCalls: Array.from({ length: 10 }, (_, i) => ({ frame: 10 + i, ms: 1 })),
        commands: Array.from({ length: 20 }, () => ({ frame: 10, name: 'beginRenderPass', ms: 0.1 })),
        draws: Array.from({ length: 20 }, () => ({ frame: 10, name: 'drawElements', ms: 0.2 })),
        queueBookkeeping: Array.from({ length: 10 }, () => ({ frame: 10, name: 'submit', ms: 0.05 })),
        gpuSamples: Array.from({ length: 10 }, () => ({ frame: 10, ms: 3 })),
        queryEvents: [],
        timerAvailable: true,
        readPixelsDuringWindow: 0,
        device: { renderer: 'test', vendor: 'test' },
        viewport: { width, height, dpr: 1, backing: { width, height } },
        memory: { bufferSize: 1000, textureSize: 2000 },
        uploadCount: 5,
        window: { start: 10, end: 49, durationMs: 664 },
        methods: {
            commands: 'x',
            draws: 'x',
            queue: 'x',
            frames: 'x',
            gpu: 'x',
            passes: 'two-pass composition: trail→RT, glass→screen per frame; one points upload per sim frame',
        },
    };
}

const probeAudit = (p: any) => C.probeAudit(p, params(), time, path, { width, height });
const resourceAudit = (r: any) => C.resourceAudit(r);

describe('C03 acceptance: validators accept real baselines', () => {
    test('probeAudit accepts the real model output', () => {
        const r = probeAudit(buildProbe());
        expect(r.errors).toEqual([]);
        expect(r.measurements).toBe(C.auditPoints(width, height).length);
    });
    test('resourceAudit accepts exact 100-row trace', () => {
        const r = resourceAudit(buildResources());
        expect(r.errors).toEqual([]);
        expect(r.measurements).toBe(100);
    });
    test('boundaryPlan is a complete plan', () => {
        const plan = C.boundaryPlan();
        expect(plan.filter((c: any) => c.boundary === 'default').length).toBe(18);
        expect(plan.filter((c: any) => c.boundary === 'invalid').length).toBe(18);
    });
});

describe('C03 acceptance: mutation rejection (structuredClone)', () => {
    const mutations: { name: string; apply: (x: any) => void; audit: (x: any) => any }[] = [];

    // ── probe mutations ──
    mutations.push({ name: 'null probe', apply: () => {}, audit: () => probeAudit(null) });
    mutations.push({
        name: 'missing gpuReceipt',
        apply: (x) => {
            delete x.gpuReceipt;
        },
        audit: (x) => probeAudit(x),
    });
    mutations.push({
        name: 'pixels removed',
        apply: (x) => {
            x.pixels = [];
        },
        audit: (x) => probeAudit(x),
    });
    mutations.push({
        name: 'pixel rgba whitewash (packed 255)',
        apply: (x) => {
            x.pixels.forEach((p: any) => (p.rgba = [255, 255, 255, 255]));
        },
        audit: (x) => probeAudit(x),
    });
    mutations.push({
        name: 'rgba alpha channel zeroed',
        apply: (x) => {
            x.pixels.forEach((p: any) => (p.rgba[3] = 0));
        },
        audit: (x) => probeAudit(x),
    });
    mutations.push({
        name: 'glError nonzero',
        apply: (x) => {
            x.gpuReceipt.glError = 1282;
        },
        audit: (x) => probeAudit(x),
    });
    mutations.push({
        name: 'targetRGBA8 flag false',
        apply: (x) => {
            x.gpuReceipt.targetRGBA8 = false;
        },
        audit: (x) => probeAudit(x),
    });
    mutations.push({
        name: 'frame binding broken',
        apply: (x) => {
            x.gpuReceipt.frame = 99;
        },
        audit: (x) => probeAudit(x),
    });
    mutations.push({
        name: 'time binding broken',
        apply: (x) => {
            x.gpuReceipt.time = 0.5;
        },
        audit: (x) => probeAudit(x),
    });
    mutations.push({
        name: 'canvas width wrong',
        apply: (x) => {
            x.gpuReceipt.canvas.width = 320;
        },
        audit: (x) => probeAudit(x),
    });
    mutations.push({
        name: 'one pixel coordinate shifted',
        apply: (x) => {
            x.pixels[0].x = x.pixels[0].x + 7;
        },
        audit: (x) => probeAudit(x),
    });
    mutations.push({
        name: 'rgba malformed (float)',
        apply: (x) => {
            x.pixels[0].rgba[0] = 100.5;
        },
        audit: (x) => probeAudit(x),
    });

    // ── resource mutations ──
    mutations.push({
        name: '99 rows (missing one)',
        apply: (x) => {
            x.rows.pop();
        },
        audit: (x) => resourceAudit(x),
    });
    mutations.push({
        name: 'refs before≠1',
        apply: (x) => {
            x.rows[0].trace.refs[0].before = 2;
        },
        audit: (x) => resourceAudit(x),
    });
    mutations.push({
        name: 'refs after≠0 (leak)',
        apply: (x) => {
            x.rows[0].trace.refs[0].after = 1;
        },
        audit: (x) => resourceAudit(x),
    });
    mutations.push({
        name: 'renderers not unbound',
        apply: (x) => {
            x.rows[0].trace.renderersUnbound = false;
        },
        audit: (x) => resourceAudit(x),
    });
    mutations.push({
        name: 'nodes not removed',
        apply: (x) => {
            x.rows[0].trace.nodesRemoved = false;
        },
        audit: (x) => resourceAudit(x),
    });
    mutations.push({
        name: 'RT not detached',
        apply: (x) => {
            x.rows[0].trace.trailDetached = false;
        },
        audit: (x) => resourceAudit(x),
    });
    mutations.push({
        name: 'RT not disposed',
        apply: (x) => {
            x.rows[0].trace.trailDisposed = false;
        },
        audit: (x) => resourceAudit(x),
    });
    mutations.push({
        name: 'duplicate id (100 rows, 99 unique)',
        apply: (x) => {
            x.rows[1].id = x.rows[0].id;
        },
        audit: (x) => resourceAudit(x),
    });
    mutations.push({
        name: 'memory drift (textureSize grows)',
        apply: (x) => {
            x.rows[50].after.textureSize = 2001;
        },
        audit: (x) => resourceAudit(x),
    });
    mutations.push({
        name: 'node still valid after destroy',
        apply: (x) => {
            x.rows[0].nodeValid = true;
        },
        audit: (x) => resourceAudit(x),
    });
    mutations.push({
        name: 'effect registry still present',
        apply: (x) => {
            x.rows[0].registryPresent = true;
        },
        audit: (x) => resourceAudit(x),
    });
    mutations.push({
        name: 'idempotent retirement false',
        apply: (x) => {
            x.rows[0].repeat.idempotent = false;
        },
        audit: (x) => resourceAudit(x),
    });
    mutations.push({
        name: 'kind renamed (fake kind substitution)',
        apply: (x) => {
            x.rows[0].trace.refs[0].kind = 'fakeKind';
        },
        audit: (x) => resourceAudit(x),
    });

    test.each(mutations)('rejects mutation: %s', ({ name, apply, audit }) => {
        const base = name.includes('null')
            ? null
            : name.includes('row') ||
                name.includes('refs') ||
                name.includes('renderers') ||
                name.includes('nodes') ||
                name.includes('RT') ||
                name.includes('id ') ||
                name.includes('memory') ||
                name.includes('node still') ||
                name.includes('effect registry') ||
                name.includes('idempotent') ||
                name.includes('kind')
              ? buildResources()
              : buildProbe();
        const mutated = JSON.parse(JSON.stringify(base));
        apply(mutated);
        const result = audit(mutated);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    test('mutation count ≥ 20', () => {
        expect(mutations.length).toBeGreaterThanOrEqual(20);
    });
});

describe('C03 acceptance: identity & contract guards', () => {
    test('trail-off + glass-on with zero lighting → [0,0,0,0] everywhere', () => {
        const p = { ...params(), trailEnabled: 'off', glassHighlight: 0, glassFresnel: 0 };
        for (const pt of C.auditPoints(width, height))
            expect(C.model(pt.x, pt.y, width, height, p, time, path).straightLinear).toEqual([0, 0, 0, 0]);
    });
    test('both-off → glass-off display copy of transparent RT → zero alpha', () => {
        const p = { ...params(), glassEnabled: 'off', trailEnabled: 'off' };
        for (const pt of C.auditPoints(width, height)) {
            const m = C.model(pt.x, pt.y, width, height, p, time, path);
            expect(m.straightLinear).toEqual([0, 0, 0, 0]);
        }
    });
    test('sampler bypass guard: trailTexel NEAREST quantized bytes', () => {
        const recorder = T.makeOracleRecorder();
        for (const point of path)
            recorder.tick(point, 1 / 60, params().trailLength, params().trailRadius, width / height);
        const bytes = C.trailTexel(recorder.texData, 320, 200, width, height, params());
        expect(bytes.length).toBe(4);
        expect(bytes.every((b: number) => Number.isInteger(b) && b >= 0 && b <= 255)).toBe(true);
    });
    test('RT quantization: premultiplied bytes round-trip', () => {
        const recorder = T.makeOracleRecorder();
        for (const point of path)
            recorder.tick(point, 1 / 60, params().trailLength, params().trailRadius, width / height);
        const sample = C.makeTrailSampler(recorder.texData, width, height, params());
        const v = sample(0.5, 0.5);
        // Each channel must be an exact byte/255 value (quantized), not arbitrary float.
        for (const c of v) expect(Math.abs(c * 255 - Math.round(c * 255))).toBeLessThan(1e-9);
    });
});
