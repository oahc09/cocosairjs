// NODE_CONTRACT fixtures exercise production rejection directly, not cached reports.
const O = require('../../tools/verify/shaders-cursor-trail-oracle.cjs');
const C = require('../../tools/verify/shaders-cursor-trail-browser.cjs');
function trustedFixture() {
    const line = C.PLAN[0].path;
    const rec = O.makeOracleRecorder(line[0]),
        history: any[] = [],
        log: any[] = [];
    for (const [i, p] of line.entries()) {
        const v = rec.tick(p, 1 / 60, 0.5, 0.5, 1.6);
        log.push({
            type: 'pointermove',
            pointerType: 'mouse',
            isTrusted: true,
            timestamp: i + 1,
            frame: i + 1,
            sequence: i + 1,
            generation: 0,
            x: p.x,
            y: p.y,
            clientX: p.x * 640,
            clientY: (1 - p.y) * 400,
            rect: { left: 0, top: 0, width: 640, height: 400 },
        });
        history.push({
            pointer: p,
            deltaTime: 1 / 60,
            length: 0.5,
            radius: 0.5,
            aspect: 1.6,
            frame: i + 1,
            bits: Array.from(v.texData),
            count: v.count,
            inputSequence: i + 1,
            generation: 0,
        });
    }
    const packed = Array.from(rec.texData),
        count = history.at(-1).count;
    const pointer = {
        recorderOrigin: line[0],
        packed,
        trail: { count },
        lastUpload: { bits: packed, bytes: 512 },
        generation: 0,
        inputSequence: 21,
        pointerLog: log,
        updateHistory: history,
    };
    return {
        pointer,
        events: ['parameter:radius', 'pause', 'resume', 'reset', 'release'].map((type, i) => ({
            type,
            isTrusted: true,
            frame: i + 22,
        })),
        pause: { before: { time: 1, packed }, after: { time: 1, packed } },
        resume: { before: { time: 1 }, after: { time: 1.1 } },
        reset: { before: { generation: 0 }, after: { generation: 1, trail: { count: 0 } } },
        escape: { before: { generation: 1 }, after: { generation: 2, trail: { count: 0 } } },
        releaseIdentity: true,
        terminal: 'TRAIL_DISPOSED',
        release: {
            sceneCleared: true,
            retirement: { refs: O.OWNED_KINDS.map((kind: string) => ({ kind, before: 1, after: 0 })) },
        },
    };
}
describe('E08 real-input receipt contract (synthetic only)', () => {
    test('accept complete independent host replay and five trusted controls', () =>
        expect(C.trustedAudit(trustedFixture())).toEqual([]));
    test.each(['parameter:radius', 'pause', 'resume', 'reset', 'release'])(
        'reject missing %s even when other observations are good',
        (action) => {
            const r = trustedFixture();
            r.events = r.events.filter((e) => e.type !== action);
            expect(C.trustedAudit(r).length).toBeGreaterThan(0);
        },
    );
    test.each([
        (r: any) => (r.pointer.pointerLog[0].clientX += 1),
        (r: any) => (r.pointer.pointerLog[1].sequence = 1),
        (r: any) => (r.pointer.pointerLog[1].timestamp = 0),
        (r: any) => (r.pointer.inputSequence += 1),
        (r: any) => (r.pointer.updateHistory[1].inputSequence += 100),
        (r: any) => (r.pointer.updateHistory[1].generation = 9),
        (r: any) => (r.pointer.lastUpload.bytes = 0),
        (r: any) => (r.pointer.updateHistory[1].bits[0] = 0),
        (r: any) => (r.pause.after.time += 0.001),
        (r: any) => (r.resume.after.time = 1),
        (r: any) => (r.escape.after.trail.count = 5),
        (r: any) => (r.release.retirement.refs[0].after = 9),
        (r: any) => (r.releaseIdentity = false),
        (r: any) => (r.events[4].isTrusted = false),
    ])('reject receipt tampering %#', (mutate) => {
        const r = trustedFixture();
        mutate(r);
        expect(C.trustedAudit(r).length).toBeGreaterThan(0);
    });
    test.each([null, {}, [], { packed: Array(256).fill(0), updateHistory: [] }])(
        'host replay total rejection %#',
        (r) => expect(C.replay(r).errors.length).toBeGreaterThan(0),
    );
});

function touchFixture() {
    const rec = O.makeOracleRecorder(C.PLAN[0].path[0]);
    const pointerLog: any[] = [],
        updateHistory: any[] = [];
    for (const [i, p] of C.PLAN[0].path.entries()) {
        for (const type of ['pointerdown', 'pointerup'])
            pointerLog.push({
                type,
                pointerType: 'touch',
                isTrusted: true,
                timestamp: pointerLog.length + 1,
                frame: i + 1,
                generation: 0,
                sequence: pointerLog.length + 1,
                ...p,
                clientX: p.x * 390,
                clientY: (1 - p.y) * 844,
                rect: { left: 0, top: 0, width: 390, height: 844 },
            });
        const v = rec.tick(p, 1 / 60, 0.5, 0.5, 390 / 844);
        updateHistory.push({
            pointer: p,
            deltaTime: 1 / 60,
            length: 0.5,
            radius: 0.5,
            aspect: 390 / 844,
            frame: i + 1,
            generation: 0,
            inputSequence: 2 * (i + 1),
            bits: Array.from(v.texData),
            count: v.count,
        });
    }
    const packed = Array.from(rec.texData);
    return {
        pointerLog,
        updateHistory,
        touchLog: [],
        recorderOrigin: C.PLAN[0].path[0],
        packed,
        trail: { count: updateHistory.at(-1).count },
        lastUpload: { bits: packed, bytes: 512 },
        generation: 0,
        inputSequence: 42,
        params: O.defaults(),
        dpr: 2,
        viewport: { width: 390, height: 844 },
        canvas: { width: 780, height: 1688, css: { width: 390, height: 844 } },
        released: false,
        oneCanvas: 1,
        time: 21 / 60,
        frame: 22,
        gpuReceipt: {
            frame: 21,
            time: 21 / 60,
            glError: 0,
            canvas: { width: 780, height: 1688 },
            defaultFramebuffer: true,
            cameraTargetTextureNull: true,
        },
        shaderPasses: [{ shaderCompiled: true }],
    };
}
describe('E08 protocol touch receipt (NODE_CONTRACT, not physical device)', () => {
    test('accept primary touch PointerEvents without legacy TouchEvent receipts', () =>
        expect(C.touchAudit(touchFixture())).toEqual([]));
    test.each([
        (s: any) => (s.pointerLog[0].pointerType = 'mouse'),
        (s: any) => (s.pointerLog[0].isTrusted = false),
        (s: any) => (s.pointerLog[0].clientX += 10),
        (s: any) => (s.pointerLog[1].sequence = 99),
        (s: any) => (s.pointerLog[0].timestamp = NaN),
        (s: any) => (s.pointerLog[0].frame = -1),
        (s: any) => (s.pointerLog[0].generation = 9),
        (s: any) => s.pointerLog.splice(0, 1),
        (s: any) => (s.updateHistory[1].inputSequence = 42),
        (s: any) => (s.packed[0] = 0),
    ])('reject touch mutation %# from a valid baseline', (mutate) => {
        const s = touchFixture();
        expect(C.touchAudit(s)).toEqual([]);
        mutate(s);
        expect(C.touchAudit(s).length).toBeGreaterThan(0);
    });
});

describe('Lead E08 native timed workload (NODE_CONTRACT)', () => {
    const G = require('../../tools/verify/shaders-cursor-trail-gate.cjs');
    function fixture() {
        const profile = require('../../tools/verify/shaders-cursor-trail-performance.cjs').PROFILES[0];
        const state = {
            viewport: profile.viewport,
            dpr: profile.dpr,
            canvas: { width: 1280, height: 720, css: profile.viewport },
            background: [8, 9, 12],
            instance: 1,
            frame: 1,
            time: 1,
            shaderPasses: [{ shaderCompiled: true }],
        };
        return {
            profile,
            raw: {
                fixedStart: state,
                fixedEnd: { ...state, frame: 32, time: 2 },
                readPixelsDuringWindow: 0,
                frames: Array.from({ length: 31 }, (_, i) => ({ frame: i + 1 })),
                commands: [{ frame: 31, operation: 'beginRenderPass' }],
                draws: [{ frame: 31, operation: 'drawElements' }],
            },
        };
    }
    test('accept native pass and draw on every steady frame', () =>
        expect(G.validateTimedWorkload(fixture()).ok).toBe(true));
    test.each([
        (r: any) => (r.raw.commands = []),
        (r: any) => (r.raw.draws = []),
        (r: any) => (r.raw.readPixelsDuringWindow = 1),
        (r: any) => (r.raw.fixedEnd.dpr = 99),
        (r: any) => (r.raw.fixedEnd.instance = 2),
        (r: any) => (r.raw.fixedEnd.time = NaN),
        (r: any) => (r.raw.fixedEnd.shaderPasses = []),
        (r: any) => (r.raw.fixedEnd.canvas = { width: 1, height: 1 }),
    ])('reject timed workload mutation %#', (mutate) => {
        const r = fixture();
        expect(G.validateTimedWorkload(r).ok).toBe(true);
        mutate(r);
        expect(G.validateTimedWorkload(r).ok).toBe(false);
    });
});
