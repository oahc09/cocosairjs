// NODE_CONTRACT fixtures, not browser evidence. Pixels are painted only at frozen audit
// points to exercise the production file/oracle contract. All temp files are independent
// of output/ and existing historical reports.
import type {} from 'jest';
jest.mock(
    '../../examples/shader-driver-pilot/src/driver.js',
    () => require('../../examples/shader-driver-pilot/src/driver'),
    { virtual: true },
);
jest.mock(
    '../../examples/shader-driver-pilot/src/defaults.generated.js',
    () => require('../../examples/shader-driver-pilot/src/defaults.generated'),
    { virtual: true },
);
import { consume, uniformValues, validateConsumerBindings } from '../../examples/shader-driver-pilot/src/consumer';
const fs = require('node:fs'),
    os = require('node:os'),
    path = require('node:path'),
    crypto = require('node:crypto'),
    zlib = require('node:zlib');
const B = require('../../tools/verify/shaders-driver-pilot-browser.cjs');
const O = require('../../tools/verify/shaders-driver-pilot-oracle.cjs');
const P = require('../../tools/verify/shaders-driver-pilot-performance.cjs');
const ENV = require('../../tools/verify/shaders-browser-environment.cjs');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'air-driver-acceptance-'));
const clone = (v: any): any =>
    Array.isArray(v)
        ? v.map(clone)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]))
          : v;
const identity = (file: string) => {
    const b = fs.readFileSync(file);
    return {
        path: file.replace(/\\/g, '/'),
        bytes: b.length,
        sha256: crypto.createHash('sha256').update(b).digest('hex'),
    };
};
const log = path.join(scratch, 'build.log');
fs.writeFileSync(log, 'tsc exitCode=0\nbundle exitCode=0\n12345\n');
function crc32(bytes: Buffer) {
    let crc = 0xffffffff;
    for (const b of bytes) {
        crc ^= b;
        for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name: string, b: Buffer) {
    const t = Buffer.from(name),
        l = Buffer.alloc(4),
        c = Buffer.alloc(4);
    l.writeUInt32BE(b.length);
    c.writeUInt32BE(crc32(Buffer.concat([t, b])));
    return Buffer.concat([l, t, b, c]);
}
function png(s: any, name: string) {
    const w = s.canvas.width,
        h = s.canvas.height,
        data = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * (w * 4 + 1) + 1 + x * 4;
            data[i] = 8;
            data[i + 1] = 9;
            data[i + 2] = 12;
            data[i + 3] = 255;
        }
    for (const p of O.points(s.selectedConsumer, w, h)) {
        const i = (h - 1 - p.y) * (w * 4 + 1) + 1 + p.x * 4;
        const b = O.pixel(s.selectedConsumer, s.outputs, s.time, w, h, p.x, p.y).display;
        for (let k = 0; k < 4; k++) data[i + k] = b[k];
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(w);
    header.writeUInt32BE(h, 4);
    header[8] = 8;
    header[9] = 6;
    const file = path.join(scratch, name + '.png');
    fs.writeFileSync(
        file,
        Buffer.concat([
            Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
            chunk('IHDR', header),
            chunk('IDAT', zlib.deflateSync(data)),
            chunk('IEND', Buffer.alloc(0)),
        ]),
    );
    return identity(file);
}
function state(
    consumer: string,
    bindings: any[],
    dpr: number,
    viewport = { width: 640, height: 400 },
    steps = B.GESTURE,
) {
    let time = 0;
    const pointerLog: any[] = [],
        frameLedger: any[] = [];
    let outputs = {};
    const w = viewport.width * dpr,
        h = viewport.height * dpr;
    for (const [i, g] of steps.entries()) {
        const pointer = { x: g.u, y: g.v };
        const event = {
            type: 'pointermove',
            isTrusted: true,
            isPrimary: true,
            pointerId: 1,
            timeStamp: i + 1,
            clientX: g.u * viewport.width,
            clientY: (1 - g.v) * viewport.height,
            rect: { left: 0, top: 0, ...viewport },
            uv: pointer,
            sequence: i + 1,
            generation: 2,
            frame: i + 1,
        };
        pointerLog.push(event);
        const before = time;
        time += g.dt;
        outputs = Object.fromEntries(
            bindings.map((p: any) => [p.target, O.computeBinding(p.binding, { time }, { pointer })]),
        );
        frameLedger.push({
            frame: i + 1,
            dt: g.dt,
            pointer,
            eventSequence: i + 1,
            generation: 2,
            timeBefore: before,
            timeAfter: time,
            outputs: clone(outputs),
            materialUniforms: O.uniforms(consumer, outputs, time, w, h),
            nodePosition: O.consumed(consumer, outputs).position,
            backing: { width: w, height: h },
        });
    }
    const pointer = steps.length ? { x: steps.at(-1).u, y: steps.at(-1).v } : { x: 0.5, y: 0.5 };
    if (!steps.length)
        outputs = Object.fromEntries(
            bindings.map((p: any) => [p.target, O.computeBinding(p.binding, { time }, { pointer })]),
        );
    const used = O.consumed(consumer, outputs);
    return {
        selectedConsumer: consumer,
        currentInstance: 7,
        frame: steps.length + 1,
        time,
        driver: { pointer, time, generation: 2, paused: false, released: false },
        bindings: clone(bindings),
        outputs,
        motherParams: used.params,
        nodePosition: used.position,
        uniformReadback: O.uniforms(consumer, outputs, time, w, h),
        updates: steps.length + 1,
        released: false,
        diagnostic: false,
        pointerLog,
        frameLedger,
        events: [],
        viewport,
        dpr,
        canvas: { width: w, height: h, css: viewport },
        oneCanvas: 1,
        shaders: [{ compiled: true }],
        memory: { bufferSize: 1000, textureSize: 100 },
        background: [8, 9, 12],
        listeners: { adds: 7, removes: 0, ledger: Array(7).fill('event') },
        resetReceipt: null,
    };
}
const retirement = () => ({
    id: 7,
    refs: ['mesh', 'material', 'effect'].map((kind) => ({ kind, before: 1, after: 0 })),
    renderersUnbound: true,
    nodesRemoved: true,
    registryRemoved: true,
    idempotent: false,
});
const release = () => ({
    retirement: retirement(),
    sceneCleared: true,
    listeners: { adds: 7, removes: 7 },
    controlsDisabled: true,
    postReleaseDispatchSilent: true,
});
function probe(s: any) {
    const captured = clone(s);
    captured.diagnostic = true;
    captured.frame++;
    return {
        state: captured,
        pixels: O.points(s.selectedConsumer, s.canvas.width, s.canvas.height).map((p: any) => ({
            ...p,
            rgba: O.linearBytes(
                O.pixel(s.selectedConsumer, s.outputs, s.time, s.canvas.width, s.canvas.height, p.x, p.y),
            ),
        })),
        gpuReceipt: {
            frame: captured.frame - 1,
            time: s.time,
            canvas: s.canvas,
            targetRGBA8: true,
            transparentClear: true,
            detached: true,
            disposed: true,
            glError: 0,
        },
        preserved: { instanceEqual: true, timeEqual: true, framesEqual: true, outputsEqual: true },
        tempRefs: { before: 1, after: 0 },
        rendererRestored: true,
    };
}
function base(phase: string) {
    return {
        schemaVersion: 'w5-driver-pilot/1',
        phase,
        requestedEngines: B.ENGINES,
        ...B.currentIdentity(),
        agentGate: 'NOT_RUN',
        galleryGate: 'NOT_RUN',
        subset: true,
        completed: false,
        build: { exitCode: 0, bundleBytes: 12345, log: identity(log) },
        cleanup: { serverClosed: true, proxyClosed: true, errors: [] },
        rows: [] as any[],
    };
}
function functional() {
    const report = base('functional');
    for (const engine of B.ENGINES)
        for (const consumer of B.CONSUMERS)
            for (const dpr of [1, 2]) {
                const row: any = {
                    engine,
                    consumer,
                    dpr,
                    browserVersion: 'NODE_CONTRACT',
                    pageErrors: [],
                    consoleErrors: [],
                    pageClosed: true,
                    browserClosed: true,
                    captures: [],
                    release: release(),
                };
                for (const id of B.CASES) {
                    const bindings = B.bindingsFor(consumer, id),
                        s = state(consumer, bindings, dpr);
                    row.captures.push({
                        id,
                        setReceipt: { ok: true, values: bindings },
                        state: s,
                        probe: probe(s),
                        png: png(s, engine + consumer + dpr + id),
                    });
                }
                row.invalids = B.invalidPlan(consumer).map((p: any) => ({
                    id: p.id,
                    before: { bindings: [] },
                    after: { bindings: [] },
                    receipt: { ok: false, errors: [{ code: p.code }] },
                }));
                row.boundaries = B.boundaryPlan(consumer).map((p: any) => ({
                    id: p.id,
                    receipt: { ok: true, values: p.bindings },
                    state: state(consumer, p.bindings, dpr, { width: 640, height: 400 }, []),
                }));
                row.resources = {
                    baseline: { bufferSize: 1000, textureSize: 100 },
                    rows: Array.from({ length: 100 }, (_, i) => ({
                        index: i,
                        id: i + 1,
                        before: { bufferSize: 1000, textureSize: 100 },
                        created: { bufferSize: 1128, textureSize: 100 },
                        after: { bufferSize: 1000, textureSize: 100 },
                        trace: retirement(),
                        repeat: { ...retirement(), idempotent: true },
                        assetsValid: [false, false, false],
                        nodeValid: false,
                    })),
                };
                const before = state(consumer, B.bindingsFor(consumer, 'pointer-x'), dpr),
                    after = state(consumer, B.bindingsFor(consumer, 'pointer-x'), dpr, { width: 480, height: 320 });
                row.resize = {
                    before,
                    after,
                    probe: probe(after),
                    png: png(after, engine + consumer + dpr + 'resize'),
                };
                if (dpr === 1)
                    row.normal = {
                        pause: { before: { time: 0.1 }, after: { time: 0.1, driver: { paused: true } } },
                        resume: { before: { time: 0.1 }, after: { time: 0.2, driver: { paused: false } } },
                        reset: { time: 0, generation: 2 },
                        generationBefore: 1,
                        release: release(),
                        releaseIdentity: true,
                        terminalCode: 'DRIVER_DISPOSED',
                        events: ['pause', 'resume', 'reset', 'release'].map((type, i) => ({
                            type,
                            isTrusted: true,
                            sequence: i + 1,
                        })),
                    };
                report.rows.push(row);
            }
    return report;
}
function performance() {
    const report = base('performance');
    for (const engine of B.ENGINES)
        for (const tuple of B.PERFORMANCE_PLAN) {
            const { consumer, profile } = tuple,
                bindings = B.bindingsFor(consumer, 'auto-animate');
            const fixedStart = state(consumer, bindings, profile.dpr, profile.viewport, []),
                fixedEnd = clone(fixedStart);
            fixedEnd.frameLedger = [];
            let time = 0;
            const frames = [],
                commands = [],
                draws = [],
                updateCalls = [];
            for (let i = 0; i < 91; i++) {
                const before = time;
                time += 0.07;
                const frame = i + 1,
                    pointer = { x: 0.5, y: 0.5 },
                    outputs = Object.fromEntries(
                        bindings.map((p: any) => [p.target, O.computeBinding(p.binding, { time }, { pointer })]),
                    );
                fixedEnd.frameLedger.push({
                    frame,
                    dt: 0.07,
                    pointer,
                    eventSequence: 0,
                    generation: 2,
                    timeBefore: before,
                    timeAfter: time,
                    outputs,
                    materialUniforms: O.uniforms(
                        consumer,
                        outputs,
                        time,
                        fixedEnd.canvas.width,
                        fixedEnd.canvas.height,
                    ),
                    nodePosition: O.consumed(consumer, outputs).position,
                    backing: { width: fixedEnd.canvas.width, height: fixedEnd.canvas.height },
                });
                if (i > 0) frames.push({ frame, intervalMs: 70, renderEnvelopeMs: 1, drawCalls: 1 });
                for (const operation of ['beginRenderPass', 'bindDescriptorSet', 'draw', 'endRenderPass'])
                    commands.push({ frame, operation, ms: 0.1 });
                draws.push({ frame, operation: 'drawElements', ms: 0.1 });
                updateCalls.push({ frame, ms: 0.1 });
            }
            const last = fixedEnd.frameLedger.at(-1);
            fixedEnd.time = time;
            fixedEnd.frame = 92;
            fixedEnd.outputs = last.outputs;
            fixedEnd.driver.time = time;
            fixedEnd.motherParams = O.consumed(consumer, last.outputs).params;
            fixedEnd.uniformReadback = last.materialUniforms;
            const expected = {
                viewport: profile.viewport,
                dpr: profile.dpr,
                backing: { w: profile.viewport.width * profile.dpr, h: profile.viewport.height * profile.dpr },
                crossOriginIsolated: true,
                coop: 'same-origin',
                coep: 'require-corp',
            };
            // Exact receipt schema taken from the production helper's public contract.
            const observation = {
                dpr: profile.dpr,
                backing: { w: expected.backing.w, h: expected.backing.h },
                css: { w: profile.viewport.width, h: profile.viewport.height },
                coi: true,
            };
            const environment: any = {
                ok: true,
                errors: [],
                expected,
                phases: [
                    { id: 'after-navigation', ...observation },
                    { id: 'after-viewport-repair', ...observation },
                ],
                responseStatus: 200,
                deliveredHeaders: { coop: 'same-origin', coep: 'require-corp' },
            };
            report.rows.push({
                engine,
                consumer,
                profile,
                dpr: profile.dpr,
                browserVersion: 'NODE_CONTRACT',
                pageErrors: [],
                consoleErrors: [],
                pageClosed: true,
                browserClosed: true,
                environment,
                precision: {
                    calls: 25000,
                    allRaw: [0.005, 0.01],
                    positiveCount: 2,
                    minimumPositiveDeltaMs: 0.005,
                    crossOriginIsolated: true,
                },
                release: release(),
                performance: {
                    fixedStart,
                    fixedEnd,
                    frames,
                    commands,
                    draws,
                    updateCalls,
                    warmupFrames: 30,
                    window: { start: 2, end: 91, durationMs: 6300 },
                    readPixelsDuringWindow: 0,
                    timerAvailable: false,
                    gpuSamples: [],
                    queryEvents: [],
                    methods: { instrumentation: 'instrumented NODE_CONTRACT', commands: 'native envelope' },
                    viewport: {
                        ...profile.viewport,
                        dpr: profile.dpr,
                        backing: { width: expected.backing.w, height: expected.backing.h },
                    },
                },
            });
        }
    return report;
}
let goodF: any, goodP: any;
beforeAll(() => {
    goodF = functional();
    goodP = performance();
});
afterAll(() => {
    const resolved = path.resolve(scratch);
    if (
        path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
        !path.basename(resolved).startsWith('air-driver-acceptance-')
    )
        throw new Error('unsafe cleanup');
    fs.rmSync(resolved, { recursive: true, force: true });
});
describe('Driver production complete report acceptance', () => {
    test('functional baseline is accepted including real temporary PNG decode', () => {
        expect(B.validateFiles(goodF)).toEqual({ ok: true, errors: [] });
    });
    test('performance baseline is accepted for all eighteen tuples', () => {
        expect(B.validateFiles(goodP)).toEqual({ ok: true, errors: [] });
    });
    test.each([
        ['pointer UV spoof', (r: any) => (r.rows[0].captures[0].state.pointerLog[0].uv.x = 0.9)],
        ['untrusted raw event', (r: any) => (r.rows[0].captures[0].state.pointerLog[0].isTrusted = false)],
        ['future event sequence', (r: any) => (r.rows[0].captures[0].state.frameLedger[0].eventSequence = 9)],
        ['wrong dt', (r: any) => (r.rows[0].captures[0].state.frameLedger[0].dt = 0.2)],
        ['uniform receipt spoof', (r: any) => (r.rows[0].captures[0].state.uniformReadback.holo0[1] = 1)],
        ['mother params spoof', (r: any) => (r.rows[0].captures[0].state.motherParams.scale = 2)],
        ['GPU byte whitewash', (r: any) => (r.rows[0].captures[0].probe.pixels[0].rgba = [0, 0, 0, 0])],
        ['GPU NaN preserved', (r: any) => (r.rows[0].captures[0].probe.pixels[0].rgba[0] = NaN)],
        ['wrong raw point', (r: any) => r.rows[0].captures[0].probe.pixels[0].x++],
        ['probe leaked ref', (r: any) => (r.rows[0].captures[0].probe.tempRefs.after = 1)],
        ['probe touched time', (r: any) => (r.rows[0].captures[0].probe.preserved.timeEqual = false)],
        ['resource zero allocation', (r: any) => (r.rows[0].resources.rows[0].created.bufferSize = 1000)],
        ['resource leak', (r: any) => (r.rows[0].resources.rows[0].trace.refs[0].after = 9)],
        ['resource missing cycle', (r: any) => r.rows[0].resources.rows.pop()],
        ['normal untrusted reset', (r: any) => (r.rows[0].normal.events[2].isTrusted = false)],
        ['release listeners leaked', (r: any) => (r.rows[0].release.listeners.removes = 1)],
        ['resize fake backing', (r: any) => (r.rows[0].resize.after.canvas.width = 640)],
        ['invalid accepted', (r: any) => (r.rows[0].invalids[0].receipt.ok = true)],
        ['duplicate row', (r: any) => (r.rows[1] = clone(r.rows[0]))],
        ['missing engine', (r: any) => r.rows.splice(0, 4)],
        ['source drift', (r: any) => (r.inputs[0].sha256 = '0'.repeat(64))],
        ['Agent false PASS', (r: any) => (r.agentGate = 'PASS')],
        ['cleanup false', (r: any) => (r.cleanup.serverClosed = false)],
    ])('rejects functional %s', (_name, mutate: any) => {
        const r = clone(goodF);
        mutate(r);
        expect(B.validateData(r).ok).toBe(false);
    });
    test.each([
        [
            'single pass omitted',
            (r: any) =>
                (r.rows[0].performance.commands = r.rows[0].performance.commands.filter(
                    (x: any) => x.operation !== 'beginRenderPass',
                )),
        ],
        ['timed readback', (r: any) => (r.rows[0].performance.readPixelsDuringWindow = 1)],
        ['missing profile', (r: any) => r.rows.pop()],
        ['duplicate profile', (r: any) => (r.rows[1] = clone(r.rows[0]))],
        ['GPU fake samples', (r: any) => (r.rows[0].performance.gpuSamples = [{ frame: 1, ms: 1 }])],
        ['clock NaN', (r: any) => (r.rows[0].precision.allRaw[0] = NaN)],
        ['wrong mobile DPR', (r: any) => (r.rows[2].environment.phases[1].dpr = 1)],
        ['no actual update', (r: any) => r.rows[0].performance.updateCalls.pop()],
    ])('rejects performance %s', (_name, mutate: any) => {
        const r = clone(goodP);
        mutate(r);
        expect(B.validateData(r).ok).toBe(false);
    });
    test('tampered PNG SHA is independently rejected', () => {
        const r = clone(goodF);
        r.rows[0].captures[0].png.sha256 = '0'.repeat(64);
        expect(B.validateFiles(r).ok).toBe(false);
    });
    test.each([
        ['missing boundary', (r: any) => r.rows[0].boundaries.pop()],
        ['boundary uniform spoof', (r: any) => (r.rows[0].boundaries[0].state.uniformReadback.holo0[1] = 999)],
        ['boundary accepted wrong value', (r: any) => (r.rows[0].boundaries[1].receipt.values[0].defaultValue = 999)],
    ])('rejects %s', (_name, mutate: any) => {
        const r = clone(goodF);
        mutate(r);
        expect(B.validateData(r).ok).toBe(false);
    });
    test('total malformed report does not throw', () => {
        for (const r of [null, {}, [], { rows: [null] }]) expect(() => B.validateFiles(r)).not.toThrow();
    });
    test('consumer adapter actually consumes both position coordinates and maternal uniform components', () => {
        const outputs = { 'neon.position': { x: 0.85, y: 0.25 }, 'neon.intensity': 2, 'neon.tubeThickness': 0.05 };
        const a = consume('neon', outputs);
        expect(a).toEqual(O.consumed('neon', outputs));
        expect(uniformValues('neon', a.params, 0.3, 640, 400, false)).toEqual(
            O.uniforms('neon', outputs, 0.3, 640, 400),
        );
    });
    test('consumer adapter rejects unknown and vector-to-scalar targets', () => {
        expect(
            validateConsumerBindings('neon', {
                bindings: [{ target: 'neon.nope', binding: { source: 'time' }, defaultValue: 0 }],
            }).ok,
        ).toBe(false);
        expect(
            validateConsumerBindings('neon', {
                bindings: [
                    {
                        target: 'neon.intensity',
                        binding: { source: 'pointer', axis: 'uv' },
                        defaultValue: { x: 0.5, y: 0.5 },
                    },
                ],
            }).ok,
        ).toBe(false);
    });
});
