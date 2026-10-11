const P = require('../../tools/verify/shaders-glass-performance.cjs');
const O = require('../../tools/verify/shaders-glass-oracle.cjs');
function fixture() {
    const profile = P.PROFILES[0];
    const state = {
        params: { ...O.defaults(), blur: 8 },
        oneCanvas: 1,
        released: false,
        linearDiagnostic: false,
        paused: false,
        viewport: profile.viewport,
        dpr: profile.dpr,
        canvas: { width: 1280, height: 720 },
        childTarget: { attached: true },
    };
    const frames = Array.from({ length: 90 }, (_, i) => ({
        frame: i + 1,
        intervalMs: 16,
        renderEnvelopeMs: 1,
        bufferBytes: 128,
        textureBytes: 1024,
        drawCalls: 2,
    }));
    const rows = (operation: string, twice = false) =>
        frames.flatMap((f) => Array.from({ length: twice ? 2 : 1 }, () => ({ frame: f.frame, operation, ms: 0.1 })));
    const raw = {
        fixedStart: state,
        fixedEnd: JSON.parse(JSON.stringify(state)),
        viewport: { ...profile.viewport, dpr: 1, backing: { width: 1280, height: 720 } },
        frames,
        warmupFrames: 30,
        readPixelsDuringWindow: 0,
        commands: rows('beginRenderPass', true),
        draws: rows('drawElements', true),
        updateCalls: rows('update'),
        queueBookkeeping: rows('submit'),
        timerAvailable: false,
        gpuSamples: [],
        queryEvents: [],
        device: { renderer: 'NODE_CONTRACT' },
        window: { start: 1, end: 90, durationMs: 1440 },
        methods: {
            commands: 'includes immediate GL',
            queue: 'not GPU command submission',
            frames: 'not monitor presentation',
        },
    };
    return { raw, profile };
}
describe('E09 independent timed workload contract (NODE_CONTRACT)', () => {
    test('accept complete synthetic two-pass frosted window', () => {
        const { raw, profile } = fixture();
        const result = P.validatePerformance(raw, profile);
        expect(result.errors).toEqual([]);
        expect(result.measurements).toBe(60);
    });
    test.each([
        ['missing second pass', (r: any) => r.commands.splice(60, 1)],
        ['missing second draw', (r: any) => r.draws.splice(60, 1)],
        ['readback', (r: any) => (r.readPixelsDuringWindow = 1)],
        ['wrong frosted state', (r: any) => (r.fixedEnd.params.blur = 0)],
        ['wrong DPR', (r: any) => (r.fixedStart.dpr = 2)],
        ['detached child', (r: any) => (r.fixedEnd.childTarget.attached = false)],
        ['extra canvas', (r: any) => (r.fixedStart.oneCanvas = 2)],
        ['NaN timing', (r: any) => (r.frames[40].intervalMs = NaN)],
        ['missing metrics', (r: any) => delete r.updateCalls],
        ['duplicate frame', (r: any) => (r.frames[40].frame = 40)],
    ])('reject %s from accepted baseline', (_, mutate) => {
        const { raw, profile } = fixture();
        expect(P.validatePerformance(raw, profile).errors).toEqual([]);
        mutate(raw);
        expect(P.validatePerformance(raw, profile).errors.length).toBeGreaterThan(0);
    });
    test.each([null, undefined, {}, [], 'x', { fixedStart: {} }])('total malformed input %#', (raw) => {
        expect(() => P.validatePerformance(raw, {})).not.toThrow();
        expect(P.validatePerformance(raw, {}).errors.length).toBeGreaterThan(0);
    });
});
