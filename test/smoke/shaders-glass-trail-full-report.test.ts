// C03 FULL report acceptance: production collector.validateFiles accepts complete
// functional (3 engines × full tuples) and performance (3×3=9 tuples) reports built from
// tmpdir PNGs + oracle math, then rejects ≥20 complete-report mutations.
// The baseline report is built ONCE and deep-cloned per mutation (non-finite preserving).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {} from 'jest';
const collector = require('../../tools/verify/shaders-glass-trail-browser.cjs');
const performanceOracle = require('../../tools/verify/shaders-glass-trail-performance.cjs');
const oracle = require('../../tools/verify/shaders-glass-trail-oracle.cjs');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '../..');
const ENGINES = ['chromium', 'firefox', 'webkit'] as const;
const CAPTURE_TIME = collector.CAPTURE_TIME ?? 0.25;
const defaults = oracle.defaults();
const KINDS: string[] = [...oracle.OWNED_KINDS];
const POINTER_PLAN = collector.POINTER_PLAN;
/** Deep clone that PRESERVES NaN/Infinity (JSON clone would turn them into null). */
const clone = (r: any): any => {
    if (Array.isArray(r)) return r.map(clone);
    if (r && typeof r === 'object') {
        const out: any = {};
        for (const k of Object.keys(r)) out[k] = clone(r[k]);
        return out;
    }
    return r;
};

let tmp = '';
beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c03-full-'));
});
afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
});

function encode(x: number) {
    const c = Math.max(0, Math.min(1, x));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
/** Real decodable PNG written to tmpdir: display bytes from oracle.model over POINTER_PLAN. */
function syntheticPng(
    width: number,
    height: number,
    params: any,
    time: number,
    presentation: any,
    framesPlan?: { x: number; y: number; dt: number; aspect?: number }[],
): string {
    const png = new PNG({ width, height });
    const bg = presentation?.background ?? [8, 9, 12];
    for (const p of oracle.auditPoints(width, height)) {
        const m = oracle.model(p.x, p.y, width, height, params, time, framesPlan ?? planFrames(), presentation);
        const a = Math.max(0, Math.min(1, m.straightLinear[3]));
        const rgba = [
            ...m.straightLinear
                .slice(0, 3)
                .map((c: number, i: number) =>
                    Math.round(255 * Math.min(1, Math.max(0, encode(c) * a + (bg[i] / 255) * (1 - a)))),
                ),
            255,
        ];
        const offset = ((height - 1 - p.y) * width + p.x) * 4;
        rgba.forEach((v, i) => (png.data[offset + i] = v));
    }
    const file = path.join(tmp, `cap-${Math.random().toString(36).slice(2)}.png`);
    fs.writeFileSync(file, PNG.sync.write(png));
    return path.relative(ROOT, file).replace(/\\/g, '/');
}
function identity(file: string) {
    const abs = path.resolve(ROOT, file);
    const b = fs.readFileSync(abs);
    const crypto = require('node:crypto');
    return { path: file, bytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex') };
}
/** Linear-probe-shaped fixture: straight-linear bytes + gpuReceipt flags. */
function syntheticProbe(
    width: number,
    height: number,
    params: any,
    time: number,
    frame: number,
    framesPlan?: { x: number; y: number; dt: number; aspect?: number }[],
) {
    return {
        frame: frame + 1,
        time,
        pixels: oracle.auditPoints(width, height).map((p: any) => {
            const m = oracle.model(p.x, p.y, width, height, params, time, framesPlan ?? planFrames());
            return {
                x: p.x,
                y: p.y,
                rgba: m.straightLinear.map((v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255)),
            };
        }),
        gpuReceipt: {
            frame,
            time,
            glError: 0,
            targetRGBA8: true,
            transparentClear: true,
            detached: true,
            disposed: true,
            canvas: { width, height },
        },
        preserved: { packedEqual: true, countEqual: true, instanceEqual: true, framesEqual: true },
        tempRefs: { before: 1, after: 0 },
        rendererRestored: true,
    };
}
/** The REAL collector interaction: 5 trusted mouse moves (each + step 1/60) followed by
 * ONE extra positive-dt step with no new pointer (age continuation) = 6 simulation frames. */
function planFrames(): { x: number; y: number; dt: number; method: string }[] {
    const frames = POINTER_PLAN.map((p: any) => ({ x: p.x, y: p.y, dt: 1 / 60, method: 'REAL_POINTER' }));
    const last = POINTER_PLAN[POINTER_PLAN.length - 1];
    frames.push({ x: last.x, y: last.y, dt: 1 / 60, method: 'REAL_POINTER' }); // continuation
    return frames;
}
/** Upload ledger: one 512-byte upload per positive-dt frame, packed bytes from CPU replay. */
function planUploads(startFrame: number, generation: number, params: any = defaults) {
    const fnv = (words: number[]) => {
        const bytes = new Uint8Array(words.length * 2);
        new Uint16Array(words).forEach((w, i) => {
            bytes[i * 2] = w & 0xff;
            bytes[i * 2 + 1] = w >> 8;
        });
        let h = 0x811c9dc5;
        for (const b of bytes) {
            h ^= b;
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        return ('0000000' + h.toString(16)).slice(-8) + '-' + bytes.length;
    };
    const frames = planFrames();
    return frames.map((f: any, i: number) => {
        const { bits } = oracle.replay(frames.slice(0, i + 1), params, 640, 400);
        const packed = Array.from(bits);
        return {
            frame: startFrame + i,
            bytes: 512,
            count: 3 + i,
            generation,
            time: ((i + 1) * 1) / 60,
            packedTag: fnv(packed),
            packed,
            textureIdentity: 1,
            uploadNativeReceipt: { frame: startFrame + i, bytes: 512, target: 'same' },
        };
    });
}
/** Authoritative per-simulation-frame ledger (mirrors main.ts update()). */
function planSimulationFrames(startFrame: number, generation: number, params: any = defaults) {
    const uploads = planUploads(startFrame, generation, params);
    const frames = planFrames();
    return frames.map((f: any, i: number) => ({
        frame: startFrame + i,
        dt: f.dt,
        pointer: { x: f.x, y: f.y },
        aspect: 640 / 400,
        trailLength: params.trailLength,
        trailRadius: params.trailRadius,
        timeBefore: (i * 1) / 60,
        timeAfter: ((i + 1) * 1) / 60,
        sessionGeneration: generation,
        eventSequence: i < POINTER_PLAN.length ? i + 1 : POINTER_PLAN.length,
        method: f.method,
        packed: uploads[i].packed,
        packedTag: uploads[i].packedTag,
        textureIdentity: 1,
        uploadNativeReceipt: uploads[i].uploadNativeReceipt,
    }));
}
function snap(params: any, instance: number, canvas: { width: number; height: number }, dpr: number, extra: any = {}) {
    const frame = extra.frame ?? 20;
    const uploads = extra.uploads ?? planUploads(10, 1, params);
    const defines = {
        SHAPE_BOX: params.shape === 'rounded-box',
        USE_BLUR: params.glassBlur > 0,
        USE_ABERRATION: params.glassAberration > 0,
    };
    return {
        params: clone(params),
        time: extra.time ?? CAPTURE_TIME,
        viewport: { width: 640, height: 400 },
        dpr,
        defines,
        shaderPasses: [
            { program: 'air-w4-c03-trail-program', shaderCompiled: true, defines: {} },
            {
                program: 'air-w4-c03-glass-program',
                shaderCompiled: true,
                defines: { ...defines },
            },
        ],
        canvas: { width: canvas.width, height: canvas.height, css: { width: 640, height: 400 } },
        instance,
        background: extra.background ?? [8, 9, 12],
        linearDiagnostic: false,
        paused: extra.paused ?? false,
        frame,
        gpuReceipt: {
            frame: frame - 1,
            time: extra.time ?? CAPTURE_TIME,
            background: [8, 9, 12],
            canvas: { ...canvas },
        },
        simulationStep: extra.simulationStep ?? 10,
        updates: extra.updates ?? 5,
        trail: {
            count: extra.trailCount ?? 7,
            points: extra.trailPoints ?? 6,
            generations: extra.trailGenerations ?? 7,
            lastGeneration: extra.trailGenerations ?? 7,
            uploads,
            uploadCount: uploads.length,
            sessionGeneration: 1,
        },
        simulationFrames: extra.simulationFrames ?? planSimulationFrames(10, 1, params),
        pointerLog: extra.pointerLog ?? planPointerLog(),
        ...extra,
    };
}
/** Pointer log matching the canonical plan: trusted primary moves with real dt. */
function planPointerLog() {
    return POINTER_PLAN.map((p: any, i: number) => ({
        type: 'pointermove',
        x: p.x,
        y: p.y,
        frame: 10 + i,
        isTrusted: true,
        pointerId: 1,
        isPrimary: true,
        sequence: i + 1,
        generation: 1,
        clientX: p.x * 640,
        clientY: (1 - p.y) * 400,
        rect: { left: 0, top: 0, width: 640, height: 400 },
        dt: 1 / 60,
    }));
}
function retirement(id: number) {
    return {
        id,
        renderersUnbound: true,
        nodesRemoved: true,
        trailDetached: true,
        trailDisposed: true,
        refs: KINDS.map((kind: string) => ({ kind, before: 1, after: 0 })),
    };
}
function resourceRows(): any {
    return {
        rows: Array.from({ length: 100 }, (_, index) => ({
            index,
            id: index + 1,
            before: { bufferSize: 100, textureSize: 50 },
            created: { bufferSize: 496, textureSize: 300 },
            after: { bufferSize: 100, textureSize: 50 },
            refsBefore: KINDS.map(() => 1),
            trace: retirement(index + 1),
            repeat: { idempotent: true },
            nodeValid: false,
            registryPresent: false,
        })),
    };
}
function buildFunctional(): any {
    const plan = collector.VISUAL_PLAN as any[];
    const captures: any[] = [];
    let instance = 1;
    let previousParams = defaults;
    for (const [index, entry] of plan.entries()) {
        if (entry.dpr === 2 && plan[index - 1] && plan[index - 1].dpr === 1) {
            instance = 1;
            previousParams = defaults;
        }
        const params = { ...defaults, ...entry.patch };
        const presentation = { background: collector.BACKGROUND(entry.id), linearDiagnostic: false };
        const width = 640 * entry.dpr;
        const height = 400 * entry.dpr;
        const shapeChanged = params.shape !== previousParams.shape;
        const beforeInstance = instance;
        if (shapeChanged) instance++;
        const png = syntheticPng(width, height, params, CAPTURE_TIME, presentation);
        captures.push({
            id: entry.id,
            dpr: entry.dpr,
            params,
            time: CAPTURE_TIME,
            presentation,
            pointerPlan: POINTER_PLAN,
            pointerReceipt: POINTER_PLAN,
            glUploads: (() => {
                const frames = planFrames();
                return frames.map((f: any, i: number) => {
                    const packed = Array.from(oracle.replay(frames.slice(0, i + 1), params, 640, 400).bits.valueOf());
                    return {
                        call: 'texSubImage2D',
                        texture: 1,
                        target: 3553,
                        level: 0,
                        xoffset: 0,
                        yoffset: 0,
                        width: 64,
                        height: 1,
                        format: 6408,
                        type: 5131,
                        bytes: 512,
                        payloadWords: packed,
                        frame: 10 + i,
                        sessionGeneration: 1,
                    };
                });
            })(),
            hookErrors: [],
            hookErrors: [],
            pointerLog: planPointerLog(),
            snapshot: snap(params, instance, { width, height }, entry.dpr),
            set: {
                before: snap(previousParams, beforeInstance, { width, height }, entry.dpr),
                receipt: shapeChanged
                    ? { ok: true, retirement: retirement(beforeInstance) }
                    : { ok: true, retirement: null },
                after: snap(params, instance, { width, height }, entry.dpr),
            },
            png: identity(png),
            probe: syntheticProbe(width, height, params, CAPTURE_TIME, 40),
        });
        previousParams = params;
    }
    const boundaries = oracle.boundaryPlan().map((row: any, index: number) => {
        const valid = row.boundary !== 'invalid';
        const afterParams = valid ? { ...defaults, [row.parameter]: row.value } : defaults;
        return {
            ...row,
            before: snap(defaults, 7, { width: 640, height: 400 }, 1, { updates: 10 + index }),
            after: snap(afterParams, 7, { width: 640, height: 400 }, 1, {
                updates: 10 + index + (valid ? 1 : 0),
            }),
            receipt: valid
                ? { ok: true, errors: [], retirement: null }
                : { ok: false, errors: [{ code: 'GLASSTRAIL_PARAMETER_TYPE', parameter: row.parameter }] },
        };
    });
    const invalids = collector.INVALID_CASES.map((frozen: any) => ({
        case: { kind: frozen.kind, parameter: frozen.parameter },
        receipt: { ok: false, errors: [{ code: frozen.code, parameter: frozen.parameter }] },
        before: snap(defaults, 7, { width: 640, height: 400 }, 1, { updates: 400 }),
        after: snap(defaults, 7, { width: 640, height: 400 }, 1, { updates: 400 }),
    }));
    const normal = {
        parameter: {
            before: snap(defaults, 7, { width: 640, height: 400 }, 1),
            after: snap({ ...defaults, glassRefraction: 0.55 }, 7, { width: 640, height: 400 }, 1),
        },
        pause: {
            before: snap(defaults, 7, { width: 640, height: 400 }, 1, { time: 1 }),
            after: snap(defaults, 7, { width: 640, height: 400 }, 1, { time: 1 }),
        },
        resume: {
            before: snap(defaults, 7, { width: 640, height: 400 }, 1, { time: 1 }),
            after: snap(defaults, 7, { width: 640, height: 400 }, 1, { time: 1.4 }),
        },
        reset: {
            receipt: {
                params: clone(defaults),
                time: 0,
                sessionGeneration: 2,
                frame: 50,
                simulationStep: 12,
            },
            afterward: snap(defaults, 9, { width: 640, height: 400 }, 1, { time: 0.35, released: false }),
        },
        events: [
            { type: 'parameter:glassRefraction', isTrusted: true, frame: 3 },
            { type: 'pause', isTrusted: true, frame: 4 },
            { type: 'resume', isTrusted: true, frame: 5 },
            { type: 'reset', isTrusted: true, frame: 6 },
            { type: 'release', isTrusted: true, frame: 7 },
        ],
        release: {
            retirement: retirement(7),
            sceneCleared: true,
            listenerAdds: 6,
            listenerRemoves: 6,
            ledger: 6,
            postReleaseDispatchSilent: true,
        },
    };
    // The resize ledger: 6 seeded frames at 640x400 + ONE continuation at 480x320. The PNG
    // and probe are computed from the SAME frame sequence the validator replays.
    const resizeLedger = (() => {
        const seeded = planSimulationFrames(10, 1);
        const last = seeded[seeded.length - 1];
        seeded.push({
            ...last,
            frame: last.frame + 1,
            aspect: 480 / 320,
            timeBefore: last.timeAfter,
            timeAfter: last.timeAfter + 1 / 60,
        });
        return seeded;
    })();
    const resizePlan = resizeLedger.map((f: any) => ({
        x: f.pointer.x,
        y: f.pointer.y,
        dt: f.dt,
        aspect: f.aspect,
    }));
    const resizePngFile = syntheticPng(480, 320, defaults, CAPTURE_TIME, { background: [8, 9, 12] }, resizePlan);
    const resize = {
        before: snap(defaults, 7, { width: 640, height: 400 }, 1, { time: CAPTURE_TIME }),
        after: snap(defaults, 7, { width: 480, height: 320 }, 1, { time: CAPTURE_TIME }),
        resizeFrames: Array.from({ length: 5 }, (_, i) =>
            snap(defaults, 7, { width: 480, height: 320 }, 1, {
                simulationStep: 20 + i,
                time: CAPTURE_TIME,
            }),
        ),
        png: identity(resizePngFile),
        probe: syntheticProbe(480, 320, defaults, CAPTURE_TIME, 60, resizePlan),
    };
    resize.after.canvas = { width: 480, height: 320, css: { width: 480, height: 320 } };
    resize.after.simulationFrames = resizeLedger;
    resize.after.trail = {
        ...resize.after.trail,
        count: resizeLedger.length + 2,
        uploads: resizeLedger.map((f: any, i: number) => ({
            ...(resize.after.trail.uploads[i % resize.after.trail.uploads.length] ?? resize.after.trail.uploads[0]),
            frame: f.frame,
        })),
        uploadCount: resizeLedger.length,
    };
    for (const frame of resize.resizeFrames)
        frame.canvas = { width: 480, height: 320, css: { width: 480, height: 320 } };
    const lifecycle = {
        recreated: {
            trace: { ...retirement(7), idempotent: false },
            snapshot: snap(defaults, 8, { width: 480, height: 320 }, 1),
        },
        samePromise: true,
        terminalCode: 'GLASSTRAIL_DISPOSED',
        release: {
            sceneCleared: true,
            listenerAdds: 6,
            listenerRemoves: 6,
            ledger: 6,
            postReleaseDispatchSilent: true,
        },
    };
    const buildLog = path.join(tmp, 'build.log');
    fs.writeFileSync(buildLog, 'command=node tsc\nexitCode=0\n');
    const identitySnapshot = collector.currentIdentity();
    const report: any = {
        schemaVersion: 'w4-c03-glass-trail/1',
        phase: 'functional',
        requestedEngines: [...ENGINES],
        startedAt: '2026-10-12T12:00:00.000Z',
        endedAt: '2026-10-12T12:01:00.000Z',
        command: 'node tools/verify/shaders-glass-trail-browser.cjs --phase=functional --browser=all --out=x.json',
        cwd: ROOT,
        identity: identitySnapshot,
        inputs: identitySnapshot.inputs,
        reference: identitySnapshot.reference,
        build: { command: 'node tsc', exitCode: 0, bundleBytes: 53000, raw: identity(buildLog) },
        engines: [
            {
                engine: 'chromium',
                browserVersion: 'synthetic-120.0',
                pageErrors: [],
                consoleErrors: [],
                shaderCompile: [{ compiled: true, log: '', source: '' }],
                captures,
                temporal: temporalBlock(),
                boundaries,
                invalids,
                normal,
                lifecycle,
                resize,
                resources: resourceRows(),
                pageClosed: true,
                dpr2PageClosed: true,
                browserClosed: true,
            },
        ],
        cleanup: { proxyClosed: true, serverClosed: true, errors: [] },
        agentGate: 'NOT_RUN',
        subset: true,
        completed: false,
        scopePassed: true,
        exitCode: 0,
    };
    report.engines = (ENGINES as readonly string[]).map((engine) => ({
        ...clone(report.engines[0]),
        engine,
        browserVersion: 'SYNTHETIC-' + engine,
    }));
    return report;
}
function temporalBlock(): any {
    const pts = oracle.auditPoints(640, 400);
    const pixels = (time: number) =>
        pts.map((p: any) => ({
            x: p.x,
            y: p.y,
            rgba: oracle.model(p.x, p.y, 640, 400, defaults, time, planFrames(), {
                background: [8, 9, 12],
            }).display,
        }));
    const pngA = syntheticPng(640, 400, defaults, CAPTURE_TIME, { background: [8, 9, 12] });
    const pngB = syntheticPng(640, 400, defaults, 0.27, { background: [8, 9, 12] });
    const mkSnap = (time: number, inst: number, paused: boolean, frame: number) => {
        const s = snap(defaults, inst, { width: 640, height: 400 }, 1, { time, paused, frame });
        s.pixels = pixels(time);
        return s;
    };
    return {
        params: defaults,
        a: {
            time: CAPTURE_TIME,
            snapshot: mkSnap(CAPTURE_TIME, 7, false, 20),
            png: identity(pngA),
            probe: syntheticProbe(640, 400, defaults, CAPTURE_TIME, 40),
        },
        b: {
            time: 0.27,
            snapshot: mkSnap(0.27, 7, false, 21),
            png: identity(pngB),
            probe: syntheticProbe(640, 400, defaults, 0.27, 41),
        },
        determinism: { equal: true, snapshot: mkSnap(CAPTURE_TIME, 8, false, 22) },
        pause: {
            params: defaults,
            before: mkSnap(CAPTURE_TIME, 7, true, 30),
            after: mkSnap(CAPTURE_TIME, 7, true, 31),
            paused: true,
        },
        resume: {
            params: defaults,
            before: mkSnap(CAPTURE_TIME, 7, false, 31),
            after: mkSnap(CAPTURE_TIME + 1 / 60, 7, false, 32),
            dt: 1 / 60,
        },
    };
}
/** Honest deterministic diagnostic schedule: phase accumulates the actual per-frame dt. */
function buildPerfDiag(plan: any, frames: any[]) {
    const aspect = (plan.profile.viewport.width * plan.profile.dpr) / (plan.profile.viewport.height * plan.profile.dpr);
    const dts = frames.map((_, i) => 1 / 60 + (i % 3) * 0.0007); // actual dt, not i*0.016
    let phase = 0;
    let t = 0;
    return frames.map((r, i) => {
        const timeBefore = t;
        phase += dts[i];
        t += dts[i];
        return {
            x: 0.5 + 0.3 * Math.sin(1.7 * phase),
            y: 0.5 + 0.24 * Math.cos(2.3 * phase),
            frame: r.frame,
            dt: dts[i],
            aspect,
            trailLength: defaults.trailLength,
            trailRadius: defaults.trailRadius,
            sessionGeneration: 2,
            timeBefore,
            timeAfter: t,
        };
    });
}
function buildPerformance(): any {
    const base = buildFunctional();
    base.phase = 'performance';
    base.authorization = 'quiet-window-x';
    base.command =
        'node tools/verify/shaders-glass-trail-browser.cjs --phase=performance --browser=all --authorization=quiet-window-x';
    base.engines[0].performance = collector.PERFORMANCE_PLAN.map((plan: any) => {
        const frames = Array.from({ length: 120 }, (_, i) => ({
            frame: i + 1,
            intervalMs: 16,
            renderEnvelopeMs: 1,
            bufferBytes: 500,
            textureBytes: 500,
            drawCalls: 2,
        }));
        return {
            profile: plan.profile,
            frames,
            warmupFrames: 30,
            updateCalls: frames.map((r) => ({ frame: r.frame, ms: 0.1 })),
            // TWO beginRenderPass per frame: trail RT pass + glass screen pass (native evidence).
            commands: frames.flatMap((r) => [
                { frame: r.frame, name: 'beginRenderPass', ms: 0.3 },
                { frame: r.frame, name: 'beginRenderPass', ms: 0.25 },
                { frame: r.frame, name: 'bindDescriptorSet', ms: 0.05 },
                { frame: r.frame, name: 'draw', ms: 0.02 },
                { frame: r.frame, name: 'endRenderPass', ms: 0.1 },
                { frame: r.frame, name: 'endRenderPass', ms: 0.08 },
            ]),
            draws: frames.flatMap((r) => [
                { frame: r.frame, ms: 0.2, name: 'drawElements' },
                { frame: r.frame, ms: 0.15, name: 'drawElements' },
            ]),
            queueBookkeeping: frames.map((r) => ({ frame: r.frame, ms: 0.01 })),
            gpuSamples: [], // explicit empty: timer unavailable semantics
            queryEvents: [],
            timerAvailable: false,
            readPixelsDuringWindow: 0,
            // Fresh performance session: diagnostic input carries EACH frame's actual
            // dt/aspect (frozen profile backing)/trail params; uploads replay those exactly.
            // Honest deterministic schedule: phase accumulates the ACTUAL per-frame dt.
            diagnosticInput: (() => {
                const diag = buildPerfDiag(plan, frames);
                return diag.map((d) => ({
                    x: d.x,
                    y: d.y,
                    frame: d.frame,
                    dt: d.dt,
                    aspect: d.aspect,
                    trailLength: d.trailLength,
                    trailRadius: d.trailRadius,
                    sessionGeneration: d.sessionGeneration,
                }));
            })(),
            uploads: (() => {
                const diag = buildPerfDiag(plan, frames);
                return frames.map((r, i2) => {
                    const packed = Array.from(
                        oracle
                            .replay(
                                diag.slice(0, i2 + 1),
                                defaults,
                                plan.profile.viewport.width * plan.profile.dpr,
                                plan.profile.viewport.height * plan.profile.dpr,
                            )
                            .bits.valueOf(),
                    );
                    return {
                        frame: r.frame,
                        bytes: 512,
                        count: 3,
                        generation: 2,
                        time: diag[i2].timeAfter,
                        packedTag: `perf-${i2}`,
                        packed,
                        textureIdentity: 1,
                        uploadNativeReceipt: { frame: r.frame, bytes: 512, target: 'same' },
                    };
                });
            })(),
            hookErrors: [],
            glUploads: (() => {
                const diag = buildPerfDiag(plan, frames);
                return frames.map((r, i2) => ({
                    call: 'texSubImage2D',
                    texture: 3,
                    target: 3553,
                    level: 0,
                    xoffset: 0,
                    yoffset: 0,
                    width: 64,
                    height: 1,
                    format: 6408,
                    type: 5131,
                    bytes: 512,
                    payloadWords: Array.from(
                        oracle
                            .replay(
                                diag.slice(0, i2 + 1),
                                defaults,
                                plan.profile.viewport.width * plan.profile.dpr,
                                plan.profile.viewport.height * plan.profile.dpr,
                            )
                            .bits.valueOf(),
                    ),
                    frame: r.frame,
                    sessionGeneration: 2,
                }));
            })(),
            viewport: {
                ...plan.profile.viewport,
                dpr: plan.profile.dpr,
                backing: {
                    width: plan.profile.viewport.width * plan.profile.dpr,
                    height: plan.profile.viewport.height * plan.profile.dpr,
                },
            },
            device: { renderer: 'SYNTHETIC' },
            window: { start: 1, end: 120, durationMs: 1920 },
            methods: {
                commands: 'includes immediate GL',
                queue: 'not GPU command submission',
                frames: 'not monitor presentation',
                passes: 'two-pass composition: trail→RT, glass→screen per frame; one points upload per sim frame',
                diagnosticInput: 'DIAGNOSTIC_CPU_TRACE deterministic Lissajous schedule, not trusted UI input',
                instrumentation:
                    '512-byte upload trace + native gfx command wrapping add CPU envelope cost; instrumented diagnostic window, not an uninstrumented benchmark',
            },
            environmentReceipt: {
                ok: true,
                errors: [],
                phases: [
                    { id: 'after-navigation', dpr: 1 },
                    {
                        id: 'after-viewport-repair',
                        dpr: plan.profile.dpr,
                        backing: {
                            w: plan.profile.viewport.width * plan.profile.dpr,
                            h: plan.profile.viewport.height * plan.profile.dpr,
                        },
                        css: { w: plan.profile.viewport.width, h: plan.profile.viewport.height },
                        coi: true,
                    },
                ],
                url: 'https://synthetic/',
                responseStatus: 200,
                deliveredHeaders: { coop: 'same-origin', coep: 'require-corp' },
            },
            precision: {
                calls: 25000,
                crossOriginIsolated: true,
                positiveCount: 2,
                minimumPositiveDeltaMs: 0.1,
                allRaw: [0.1, 0.2],
            },
            httpDocument: { url: 'https://synthetic/', status: 200 },
            release: {
                sceneCleared: true,
                listenerAdds: 6,
                listenerRemoves: 6,
                ledger: 6,
                postReleaseDispatchSilent: true,
                retirement: retirement(7),
            },
            pageClosed: true,
            fixedStart: {
                params: clone(defaults),
                simulationFrames: [],
                trail: { uploads: [], uploadCount: 0, sessionGeneration: 2 },
                time: 0,
                viewport: { ...plan.profile.viewport },
                dpr: plan.profile.dpr,
                canvas: {
                    width: plan.profile.viewport.width * plan.profile.dpr,
                    height: plan.profile.viewport.height * plan.profile.dpr,
                    css: { width: plan.profile.viewport.width, height: plan.profile.viewport.height },
                },
                background: [8, 9, 12],
                linearDiagnostic: false,
                instance: 7,
                frame: 1,
                shaderPasses: [{ program: 'p', shaderCompiled: true }],
            },
            fixedEnd: (() => {
                const diag = buildPerfDiag(plan, frames);
                const simulationFrames = diag.map((d, i2) => ({
                    frame: d.frame,
                    dt: d.dt,
                    pointer: { x: d.x, y: d.y },
                    aspect: d.aspect,
                    trailLength: d.trailLength,
                    trailRadius: d.trailRadius,
                    timeBefore: d.timeBefore,
                    timeAfter: d.timeAfter,
                    sessionGeneration: d.sessionGeneration,
                    eventSequence: null,
                    method: 'DIAGNOSTIC_CPU_TRACE',
                    packed: [],
                    packedTag: `perf-${i2}`,
                    textureIdentity: 1,
                    uploadNativeReceipt: { frame: d.frame, bytes: 512, target: 'same' },
                }));
                return {
                    params: clone(defaults),
                    simulationFrames,
                    time: diag[diag.length - 1].timeAfter,
                    viewport: { ...plan.profile.viewport },
                    dpr: plan.profile.dpr,
                    canvas: {
                        width: plan.profile.viewport.width * plan.profile.dpr,
                        height: plan.profile.viewport.height * plan.profile.dpr,
                        css: { width: plan.profile.viewport.width, height: plan.profile.viewport.height },
                    },
                    background: [8, 9, 12],
                    linearDiagnostic: false,
                    instance: 7,
                    frame: 91,
                    shaderPasses: [{ program: 'p', shaderCompiled: true }],
                };
            })(),
        };
    });
    const e = base.engines[0];
    delete e.captures;
    delete e.temporal;
    delete e.boundaries;
    delete e.invalids;
    delete e.normal;
    delete e.lifecycle;
    delete e.resize;
    delete e.resources;
    base.engines = (ENGINES as readonly string[]).map((engine) => ({
        ...clone(e),
        engine,
        browserVersion: 'SYNTHETIC-' + engine,
    }));
    return base;
}

// Baselines are built ONCE per phase; mutations deep-clone them (perf: no PNG re-encoding).
let functionalBaseline: any = null;
let performanceBaseline: any = null;
const functional = () => (functionalBaseline ??= buildFunctional());
const performance = () => (performanceBaseline ??= buildPerformance());
const text = (errors: any[]) => JSON.stringify(errors);

describe('C03 FULL functional report acceptance', () => {
    test('complete synthetic functional report passes the production validator', () => {
        const report = functional();
        expect(report.engines).toHaveLength(3);
        const result = collector.validateFiles(report);
        expect(text(result.errors)).not.toContain('performance tuple');
        expect(result.ok).toBe(true);
    });
});

describe('C03 FULL performance report acceptance (9 tuples)', () => {
    test('3 engines × 3 profiles passes the production validator', () => {
        const report = performance();
        expect(report.engines).toHaveLength(3);
        expect(report.engines.reduce((n: number, e: any) => n + e.performance.length, 0)).toBe(9);
        for (const row of report.engines[0].performance) {
            const p = collector.PERFORMANCE_PLAN.find((q: any) => q.profile.id === row.profile.id)!.profile;
            const r = performanceOracle.validatePerformance(row, p);
            if (r.errors.length) throw new Error(row.profile.id + ': ' + r.errors.join(';'));
        }
        const result = collector.validateFiles(report);
        if (!result.ok) console.log('PERF ERRORS:', JSON.stringify(result.errors.slice(0, 6)));
        expect(result.ok).toBe(true);
    });
});

describe('C03 FULL report mutation rejection (≥20)', () => {
    const mutations: { name: string; phase: 'functional' | 'performance'; apply: (r: any) => void }[] = [
        {
            name: 'duplicate points upload in one frame',
            phase: 'functional',
            apply: (r) => {
                const u = r.engines[0].captures[0].snapshot.trail.uploads;
                u.push({ ...u[0] });
                r.engines[0].captures[0].snapshot.trail.uploadCount++;
            },
        },
        {
            name: 'packed upload bytes whitewashed',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].snapshot.trail.uploads[0].packed = new Array(256).fill(65535);
                r.engines[0].captures[0].snapshot.trail.uploads[0].packedTag = 'fabricated';
            },
        },
        {
            name: 'upload bytes not 512',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].snapshot.trail.uploads[0].bytes = 256;
            },
        },
        {
            name: 'pointer plan coordinates shifted',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].pointerPlan[0].x += 0.2;
            },
        },
        {
            name: 'pointer log event made untrusted',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].pointerLog[0].isTrusted = false;
            },
        },
        {
            name: 'missing pointer receipt',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].pointerReceipt = [];
            },
        },
        {
            name: 'upload without a simulation frame',
            phase: 'functional',
            apply: (r) => {
                const t = r.engines[0].captures[0].snapshot.trail;
                t.uploads.push({ ...t.uploads[0], frame: 99 });
                t.uploadCount++;
            },
        },
        {
            name: 'wrong glass params on capture',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].params.glassRefraction = 0.99;
            },
        },
        {
            name: 'wrong layer flag on capture',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].params.glassEnabled = 'off';
            },
        },
        {
            name: 'single-pass draw count',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].frames.forEach((f: any) => (f.drawCalls = 1));
            },
        },
        {
            name: 'native second beginRenderPass removed',
            phase: 'performance',
            apply: (r) => {
                const rows = r.engines[0].performance[0].commands;
                for (let i = rows.length - 1; i >= 0; i--)
                    if (rows[i].name === 'beginRenderPass') {
                        rows.splice(i, 1);
                        break;
                    }
            },
        },
        {
            name: 'empty performance window (no update calls)',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].updateCalls = [];
            },
        },
        {
            name: 'DPR backing mismatch',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[2].fixedStart.canvas.width = 390;
            },
        },
        {
            name: 'non-finite param NaN injection',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].snapshot.params.glassBlur = NaN;
            },
        },
        {
            name: 'fake performance scope (no authorization)',
            phase: 'performance',
            apply: (r) => {
                delete r.authorization;
            },
        },
        {
            name: 'agent gate falsified to PASS',
            phase: 'functional',
            apply: (r) => {
                r.agentGate = 'PASS';
            },
        },
        {
            name: 'mother closure drift',
            phase: 'functional',
            apply: (r) => {
                r.inputs[r.inputs.length - 1].sha256 = '0'.repeat(64);
            },
        },
        {
            name: 'resources not released (after≠before)',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].resources.rows[0].after.bufferSize = 496;
            },
        },
        {
            name: 'temporal time binding broken',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].temporal.a.probe.gpuReceipt.time = 0.99;
            },
            name: 'temporal simulation-frame ledger removed',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].temporal.a.snapshot.simulationFrames = [];
            },
        },
        {
            name: 'resize PNG replaced with wrong size',
            phase: 'functional',
            apply: (r) => {
                const wrong = syntheticPng(320, 200, defaults, CAPTURE_TIME, { background: [8, 9, 12] });
                r.engines[0].resize.png = identity(wrong);
            },
        },
        {
            name: 'boundary invalid case accepted',
            phase: 'functional',
            apply: (r) => {
                const row = r.engines[0].boundaries.find((b: any) => b.boundary === 'invalid');
                row.receipt = { ok: true, errors: [] };
            },
        },
        {
            name: 'engine set reduced to 1',
            phase: 'functional',
            apply: (r) => {
                r.engines = r.engines.slice(0, 1);
            },
        },
        {
            name: 'performance tuples reduced',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance = r.engines[0].performance.slice(0, 2);
            },
        },
        {
            name: 'release listener ledger mismatch',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].normal.release.listenerRemoves = 1;
            },
        },
        {
            name: 'post-release dispatch not silent',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].normal.release.postReleaseDispatchSilent = false;
            },
        },
        {
            name: 'lifecycle release promise identity broken',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].lifecycle.samePromise = false;
            },
        },
        {
            name: 'shader compile failure hidden',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].shaderCompile[0].compiled = false;
            },
        },
        {
            name: 'completed falsified to true',
            phase: 'functional',
            apply: (r) => {
                r.completed = true;
            },
        },
        {
            name: 'page not closed',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].pageClosed = false;
            },
        },
        {
            name: 'temporal probe pixels whitewashed',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].temporal.a.probe.pixels.forEach(
                    (p: { rgba: number[] }) => (p.rgba = [255, 255, 255, 255]),
                );
            },
        },
        {
            name: 'wrong raw dt on a simulation frame',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].snapshot.simulationFrames[0].dt = 0.5;
            },
        },
        {
            name: 'ledger frame dropped (6 to 5 frames)',
            phase: 'functional',
            apply: (r) => {
                const t = r.engines[0].captures[0].snapshot;
                t.simulationFrames.pop();
                t.trail.uploads.pop();
                t.trail.uploadCount--;
            },
        },
        {
            name: 'no native upload receipt',
            phase: 'functional',
            apply: (r) => {
                delete r.engines[0].captures[0].snapshot.trail.uploads[0].uploadNativeReceipt;
            },
        },
        {
            name: 'probe trajectory not preserved',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].probe.preserved.packedEqual = false;
            },
        },
        {
            name: 'probe ledgers touched by temp material',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].probe.preserved.framesEqual = false;
            },
        },
        {
            name: 'reset receipt forged (wrong generation)',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].normal.reset.receipt.sessionGeneration = 0;
            },
        },
        {
            name: 'reset receipt params not defaults',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].normal.reset.receipt.params.glassRefraction = 0.9;
            },
        },
        {
            name: 'extra double upload same frame',
            phase: 'functional',
            apply: (r) => {
                const t = r.engines[0].captures[0].snapshot;
                const dup = { ...t.trail.uploads[1] };
                t.trail.uploads.splice(1, 0, dup);
                t.trail.uploadCount++;
                t.simulationFrames.splice(1, 0, { ...t.simulationFrames[1] });
            },
        },
        {
            name: 'performance packed array whitewashed',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].uploads[0].packed = new Array(256).fill(0);
            },
        },
        {
            name: 'diagnostic input relabeled as trusted',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].methods.diagnosticInput = 'trusted UI input';
            },
        },
        {
            name: 'upload lifetime counter confused with session count',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[1].snapshot.trail.uploadCount = 12;
            },
        },
        {
            name: 'missing reseed after recreate (blank determinism ledger)',
            phase: 'functional',
            apply: (r) => {
                const det = r.engines[0].temporal.determinism.snapshot;
                det.simulationFrames = [];
                det.trail.count = 0;
                det.trail.uploads = [];
            },
        },
        {
            name: 'live resize replayed with wrong aspect',
            phase: 'functional',
            apply: (r) => {
                const rs = r.engines[0].resize.after.simulationFrames;
                rs[rs.length - 1].aspect = 1.6; // old aspect on the post-resize frame
            },
        },
        {
            name: 'compiled variant mismatch (blur params without USE_BLUR)',
            phase: 'functional',
            apply: (r) => {
                const cap = r.engines[0].captures.find((c: any) => c.id === 'blur-vogel');
                cap.snapshot.shaderPasses.find((x: any) => x.program.includes('glass')).defines.USE_BLUR = false;
            },
        },
        {
            name: 'normal reset receipt omitted',
            phase: 'functional',
            apply: (r) => {
                delete r.engines[0].normal.reset.receipt;
            },
        },
        {
            name: 'raw event vs ledger mismatch (pointer fabricated)',
            phase: 'functional',
            apply: (r) => {
                const cap = r.engines[0].captures[0];
                cap.pointerLog[0].clientX = 9999; // raw coords no longer match ledger pointer
            },
        },
        {
            name: 'native GL upload hook log missing',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].glUploads = [];
            },
        },
        {
            name: 'native GL uploads fewer than simulation frames',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].glUploads.splice(0, 2);
            },
        },
        {
            name: 'native upload bytes whitewashed',
            phase: 'functional',
            apply: (r) => {
                for (const u of r.engines[0].captures[0].glUploads) u.bytes = 0;
            },
        },
        {
            name: 'probe temp material refs not paired (leak)',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].probe.tempRefs = { before: 1, after: 1 };
            },
        },
        {
            name: 'probe renderer pointer not restored',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].probe.rendererRestored = false;
            },
        },
        {
            name: 'no points uploads (builtin logs only)',
            phase: 'functional',
            apply: (r) => {
                const cap = r.engines[0].captures[0];
                cap.glUploads = cap.glUploads.map((u: any) => ({ ...u, width: 16, height: 16 }));
            },
        },
        {
            name: 'native upload args shifted (width from height)',
            phase: 'functional',
            apply: (r) => {
                for (const u of r.engines[0].captures[0].glUploads) {
                    const t = u.width;
                    u.width = u.height;
                    u.height = t;
                }
            },
        },
        {
            name: 'native bytes whitewashed',
            phase: 'functional',
            apply: (r) => {
                for (const u of r.engines[0].captures[0].glUploads) u.bytes = 0;
            },
        },
        {
            name: 'native upload to wrong texture',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].glUploads[2].texture = 99; // one entry diverges
            },
        },
        {
            name: 'double native upload in one frame',
            phase: 'functional',
            apply: (r) => {
                const cap = r.engines[0].captures[0];
                cap.glUploads.push({ ...cap.glUploads[0] });
            },
        },
        {
            name: 'native raw words drift from CPU replay',
            phase: 'functional',
            apply: (r) => {
                const u = r.engines[0].captures[0].glUploads[0];
                u.payloadWords[0] = (u.payloadWords[0] + 1) % 65536;
            },
        },
        {
            name: 'mixed aspect replayed with final aspect only',
            phase: 'functional',
            apply: (r) => {
                const rs = r.engines[0].resize.after.simulationFrames;
                for (const f of rs) f.aspect = 1.5;
            },
        },
        {
            name: 'probe receipt stale finally values',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].probe.tempRefs = null;
                r.engines[0].captures[0].probe.rendererRestored = false;
            },
        },
        {
            name: 'variant old material leaked (retired not destroyed)',
            phase: 'functional',
            apply: (r) => {
                const snap = r.engines[0].captures.find((c: any) => c.id === 'blur-vogel').snapshot;
                if (snap.variantReceipt) snap.variantReceipt.retired.destroyed = false;
                else {
                    snap.variantReceipt = {
                        reason: 'pipeline-flags',
                        defines: { USE_BLUR: true },
                        retired: { refCountBefore: 1, refCountAfter: 1, destroyed: false },
                        fresh: { refCount: 1, initialized: true },
                        sameInstance: true,
                        borrowedTrailTargetRetained: true,
                    };
                }
            },
        },
        {
            name: 'perf fixedStart not a fresh session',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].fixedStart.simulationFrames =
                    r.engines[0].performance[0].fixedEnd.simulationFrames.slice(0, 3);
            },
        },
        {
            name: 'perf ledger missing (contradictory counts)',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].fixedEnd.simulationFrames =
                    r.engines[0].performance[0].fixedEnd.simulationFrames.slice(0, 50);
            },
        },
        {
            name: 'perf diag frame spoof (packed unchanged)',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].diagnosticInput[10].frame = 8888;
            },
        },
        {
            name: 'perf diag pointer spoof (schedule diverges)',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].diagnosticInput[5].x += 0.2;
            },
        },
        {
            name: 'perf ledger time backwards',
            phase: 'performance',
            apply: (r) => {
                const f = r.engines[0].performance[0].fixedEnd.simulationFrames[4];
                f.timeAfter = f.timeBefore - 0.001;
            },
        },
        {
            name: 'perf ledger NaN dt',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].fixedEnd.simulationFrames[7].dt = NaN;
            },
        },
        {
            name: 'perf hookErrors missing',
            phase: 'performance',
            apply: (r) => {
                delete r.engines[0].performance[0].hookErrors;
            },
        },
        {
            name: 'perf hookErrors malformed string',
            phase: 'performance',
            apply: (r) => {
                (r.engines[0].performance[0] as any).hookErrors = 'none';
            },
        },
        {
            name: 'perf native call switched to texImage2D',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].glUploads[2].call = 'texImage2D';
            },
        },
        {
            name: 'perf native wrong type (FLOAT not HALF_FLOAT)',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].glUploads[1].type = 5126;
            },
        },
        {
            name: 'perf uploadContext direct-field bug (native session null)',
            phase: 'performance',
            apply: (r) => {
                for (const u of r.engines[0].performance[0].glUploads) u.sessionGeneration = null;
            },
        },
        {
            name: 'perf false GPU samples while timer unavailable',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].gpuSamples = [{ frame: 40, ms: 3 }];
            },
        },
        {
            name: 'perf fixedEnd.time not the recorded last time',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].fixedEnd.time = 99.5;
            },
        },
        {
            name: 'perf diagnostic aspect does not match frozen profile',
            phase: 'performance',
            apply: (r) => {
                for (const d of r.engines[0].performance[0].diagnosticInput) d.aspect = 1.9;
            },
        },
        {
            name: 'perf native words mismatch at last index 255',
            phase: 'performance',
            apply: (r) => {
                const w = r.engines[0].performance[0].glUploads[3].payloadWords;
                w[255] = (w[255] + 1) % 65536;
            },
        },
        {
            name: 'perf native upload wrong frame binding',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].glUploads[5].frame = 999;
            },
        },
        {
            name: 'perf native upload wrong session generation',
            phase: 'performance',
            apply: (r) => {
                for (const u of r.engines[0].performance[0].glUploads) u.sessionGeneration = 7;
            },
        },
        {
            name: 'perf native upload wrong texture type',
            phase: 'performance',
            apply: (r) => {
                for (const u of r.engines[0].performance[0].glUploads) u.type = 5126;
            },
        },
        {
            name: 'perf extra native upload beyond updates',
            phase: 'performance',
            apply: (r) => {
                const row = r.engines[0].performance[0];
                row.glUploads.push({ ...row.glUploads[0] });
            },
        },
        {
            name: 'perf hook error recorded',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].hookErrors = ['TypeError: boom'];
            },
        },
        {
            name: 'perf unknown gfx command name',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].commands[0].name = 'fabricatedCommand';
            },
        },
        {
            name: 'perf readPixelsDuringWindow nonzero',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].readPixelsDuringWindow = 3;
            },
        },
        {
            name: 'perf one draw dispatch per frame',
            phase: 'performance',
            apply: (r) => {
                const row = r.engines[0].performance[0];
                row.draws = row.draws.filter((_: any, i: number) => i % 2 === 0);
            },
        },
        {
            name: 'perf bad profile descriptor',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].profile = { id: '720p', viewport: { width: 640, height: 480 }, dpr: 1 };
            },
        },
        {
            name: 'perf NaN frame timing',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].frames[40].intervalMs = NaN;
            },
        },
        {
            name: 'perf malformed raw never throws (array)',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[1] = [] as any;
            },
        },
        {
            name: 'perf diagnostic missing per-frame trail params',
            phase: 'performance',
            apply: (r) => {
                delete r.engines[0].performance[0].diagnosticInput[2].trailLength;
            },
        },
        {
            name: 'perf instrumentation label removed',
            phase: 'performance',
            apply: (r) => {
                delete r.engines[0].performance[0].methods.instrumentation;
            },
        },
        {
            name: 'diagnostic dt spoofed to zero',
            phase: 'performance',
            apply: (r) => {
                for (const d of r.engines[0].performance[0].diagnosticInput) d.dt = 0;
            },
        },
    ];
    test.each(mutations)('rejects: %s', ({ phase, apply }) => {
        const report = phase === 'performance' ? clone(performance()) : clone(functional());
        apply(report);
        const result = collector.validateFiles(report);
        expect(result.ok).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });
    test('mutation count ≥ 20', () => {
        expect(mutations.length).toBeGreaterThanOrEqual(20);
    });
});

describe('C03 actual-Chromium regressions (attempt-1 evidence)', () => {
    test('perf state is declared before the first update tick (TDZ regression)', () => {
        const main = fs.readFileSync(path.join(ROOT, 'examples/shader-glass-trail/src/main.ts'), 'utf8');
        const perfDecl = main.indexOf('const perf = {');
        const updateFn = main.indexOf('function update(dt: number)');
        const updaterReg = main.indexOf('addComponent(GlassTrailUpdater)');
        expect(perfDecl).toBeGreaterThan(-1);
        expect(updateFn).toBeGreaterThan(perfDecl); // declaration precedes the function that reads it
        expect(updaterReg).toBeGreaterThan(perfDecl); // and precedes component registration/first tick
    });
    test('linearProbe preserves the trajectory (no retire/createInstance inside)', () => {
        const main = fs.readFileSync(path.join(ROOT, 'examples/shader-glass-trail/src/main.ts'), 'utf8');
        const start = main.indexOf('async function linearProbe()');
        expect(start).toBeGreaterThan(-1);
        // Function body ends at the next top-level "const controls" or similar anchor.
        const end = main.indexOf('const controls =', start);
        const body = main.slice(start, end);
        expect(body).not.toMatch(/\bretire\(/);
        expect(body).not.toMatch(/createInstance\(\)/);
        expect(body).toContain('finally');
        expect(body).toContain('paused = true'); // host frozen during the probe tick
    });
    test('dt=0 presentation ticks ingest nothing (oracle replay contract)', () => {
        const withZero = oracle.replay(
            [
                { x: 0.2, y: 0.4, dt: 0 },
                { x: 0.3, y: 0.5, dt: 1 / 60 },
            ],
            defaults,
            640,
            400,
        );
        const without = oracle.replay([{ x: 0.3, y: 0.5, dt: 1 / 60 }], defaults, 640, 400);
        expect(withZero.ingested).toHaveLength(1);
        expect([...withZero.bits]).toEqual([...without.bits]);
    });
    test('variable-dt replay matches direct recorder ticks', () => {
        const T = require('../../tools/verify/shaders-cursor-trail-oracle.cjs');
        const rec = T.makeOracleRecorder();
        rec.tick({ x: 0.3, y: 0.5 }, 0.02, defaults.trailLength, defaults.trailRadius, 640 / 400);
        rec.tick({ x: 0.4, y: 0.55 }, 0.005, defaults.trailLength, defaults.trailRadius, 640 / 400);
        const r = oracle.replay(
            [
                { x: 0.3, y: 0.5, dt: 0.02 },
                { x: 0.4, y: 0.55, dt: 0.005 },
            ],
            defaults,
            640,
            400,
        );
        expect([...r.bits]).toEqual([...rec.texData]);
    });
    test('uploads at the wrong path (top-level) are rejected, trail.uploads accepted', () => {
        const report = clone(functional());
        const snap = report.engines[0].captures[0].snapshot;
        snap.uploads = snap.trail.uploads; // wrongly mirrored top-level
        snap.trail.uploads = [];
        snap.trail.uploadCount = 0;
        expect(collector.validateFiles(report).ok).toBe(false);
    });
    test('clone preserves NaN across mutation (real non-finite semantics)', () => {
        const report = clone(functional());
        report.engines[0].captures[0].snapshot.params.glassBlur = NaN;
        expect(Number.isNaN(report.engines[0].captures[0].snapshot.params.glassBlur)).toBe(true);
        expect(collector.validateFiles(report).ok).toBe(false);
    });
    test('real collector flow: 5 pointer events + 1 continuation = 6 frames, 6 uploads', () => {
        const frames = planFrames();
        expect(frames).toHaveLength(6);
        expect(frames.slice(0, 5).every((f: any) => f.method === 'REAL_POINTER')).toBe(true);
        // The 6th frame has NO new pointer event: it repeats the last position (age continuation).
        expect(frames[5].x).toBe(frames[4].x);
        expect(frames[5].y).toBe(frames[4].y);
        // Every frame is positive dt.
        expect(frames.every((f: any) => f.dt > 0)).toBe(true);
        // Packed evolution: 6 prefix replays give 6 DISTINCT packed arrays.
        const tags = frames.map((_: any, i: number) =>
            JSON.stringify(Array.from(oracle.replay(frames.slice(0, i + 1), defaults, 640, 400).bits)),
        );
        expect(new Set(tags).size).toBe(6);
    });
    test('resume advances age WITHOUT new pointer events (ledger, not pointerLog)', () => {
        const before = oracle.replay(planFrames(), defaults, 640, 400).bits;
        const after = oracle.replay(
            [...planFrames(), { x: planFrames()[5].x, y: planFrames()[5].y, dt: 1 / 60 }],
            defaults,
            640,
            400,
        ).bits;
        // Age continuation must CHANGE the packed texture (head ages, points shift).
        expect(Array.from(after).some((w, i) => w !== before[i])).toBe(true);
    });
    test('session reset creates a FRESH recorder origin (no retained velocity)', () => {
        const main = fs.readFileSync(path.join(ROOT, 'examples/shader-glass-trail/src/main.ts'), 'utf8');
        // __resetSession and the reset handler both replace the recorder with a NEW instance.
        const rsStart = main.indexOf('__resetSession()');
        const rsEnd = main.indexOf('},', rsStart);
        const resetSession = main.slice(rsStart, rsEnd);
        expect(resetSession).toContain('instance.recorder = new TrailRecorder()');
        const rhStart = main.indexOf("action === 'reset'");
        const rhEnd = main.indexOf('lastResetReceipt', rhStart);
        const resetHandler = main.slice(rhStart, rhEnd);
        expect(resetHandler).toContain('instance.recorder = new TrailRecorder()');
        // recorder.reset() (which retains the tracker's last point) is no longer CALLED
        // for sessions (the only mention left is an explanatory comment).
        const NL = String.fromCharCode(10);
        const stripped = main
            .split(NL)
            .map((l) => l.split('//')[0])
            .join(NL);
        expect(stripped).not.toMatch(/recorder[.]reset[(][)]/);
    });

    test('reset receipt is real-time truth; afterward snapshot may advance under the pacer', () => {
        const report = functional();
        const reset = report.engines[0].normal.reset;
        expect(reset.receipt.time).toBe(0);
        expect(reset.receipt.params).toEqual(defaults);
        expect(reset.afterward.time).toBeGreaterThanOrEqual(0);
        expect(reset.afterward.released).toBe(false);
    });

    test('try/finally receipt ordering: values are read AFTER finally (real async helper)', async () => {
        const correctPattern = async () => {
            let refs: { before: number; after: number } | null = null;
            let restored = false;
            let captured = 0;
            try {
                captured = 41;
            } finally {
                refs = { before: 1, after: 0 };
                restored = true;
            }
            return { captured, refs, restored };
        };
        const wrongPattern = async () => {
            let refs: { before: number; after: number } | null = null;
            let restored = false;
            try {
                return { captured: 41, refs, restored };
            } finally {
                refs = { before: 1, after: 0 };
                restored = true;
            }
        };
        const throwing = async () => {
            let ranFinally = false;
            try {
                throw new Error('path A');
            } finally {
                ranFinally = true;
            }
        };
        const good = await correctPattern();
        expect(good.refs).toEqual({ before: 1, after: 0 });
        expect(good.restored).toBe(true);
        const bad = await wrongPattern();
        expect(bad.refs).toBeNull();
        expect(bad.restored).toBe(false);
        await expect(throwing()).rejects.toThrow('path A');
    });

    test('variant swap uses a fresh Material (base recompileShaders is warn-only)', () => {
        const main = fs.readFileSync(path.join(ROOT, 'examples/shader-glass-trail/src/main.ts'), 'utf8');
        const NL = String.fromCharCode(10);
        const stripped = main
            .split(NL)
            .map((l) => l.split('//')[0])
            .join(NL);
        expect(stripped).not.toMatch(/[.]recompileShaders[(]/);
        const i = main.indexOf('let lastVariantReceipt');
        const j = main.indexOf('lastGlassDefines = { ...desired };', i);
        const body = main.slice(i, j);
        expect(body).toMatch(/const fresh = new Material[(][)]/);
        expect(body).toMatch(/fresh[.]initialize[(]/);
        expect(body).toMatch(/target[.]renderers\[1\][.]setSharedMaterial[(]fresh, 0[)]/);
        expect(body).toMatch(/target[.]materials\[1\] = fresh/);
        expect(body).toMatch(/glassMat[.]decRef[(]/);
        expect(body).toMatch(/glassMat[.]destroy[(]/);
        expect(body).not.toMatch(/retire[(]/);
        expect(body).not.toMatch(/createInstance[(]/);
    });

    test('model() consumes the production replay: mixed-aspect equals direct recorder ticks', () => {
        const T = require('../../tools/verify/shaders-cursor-trail-oracle.cjs');
        const frames = [
            { x: 0.3, y: 0.5, dt: 1 / 60, aspect: 1.6 },
            { x: 0.4, y: 0.5, dt: 1 / 60, aspect: 1.5 },
            { x: 0.45, y: 0.5, dt: 1 / 60, aspect: 1.5 },
        ];
        const rec = T.makeOracleRecorder();
        for (const f of frames)
            rec.tick({ x: f.x, y: f.y }, f.dt, defaults.trailLength, defaults.trailRadius, f.aspect);
        const viaModel = oracle.model(240, 160, 480, 320, defaults, 0.25, frames);
        const viaReplay = oracle.replay(frames, defaults, 480, 320);
        expect([...viaReplay.bits]).toEqual([...rec.texData]);
        const expected = oracle.trailTexel(rec.texData, 240, 160, 480, 320, defaults);
        expect(viaModel.trailBytes).toEqual(expected);
    });

    test('GL hook reads DIRECT uploadContext fields (frame 17 / session 3), no getError, full 256', () => {
        const hook = collector.installGLUploadHook;
        const calls: any[][] = [];
        const getErrorCalls: number[] = [];
        const fakeTex = {};
        const fakeProto: any = {
            createTexture: function () {
                return fakeTex;
            },
            texSubImage2D: function (...args: any[]) {
                calls.push(args);
            },
            texImage2D: function (...args: any[]) {
                calls.push(args);
            },
        };
        const fakeSelf: any = {
            getParameter: () => fakeTex,
            getError: () => {
                getErrorCalls.push(1);
                return 0;
            },
            TEXTURE_BINDING_2D: 1,
        };
        const win: any = {
            __glasstrail: {
                // The REAL cheap accessor shape: direct frame + sessionGeneration fields.
                uploadContext: () => ({ frame: 17, sessionGeneration: 3, perfActive: true }),
            },
        };
        hook(fakeProto, win);
        fakeProto.createTexture.call(fakeSelf);
        const words = new Uint16Array(256);
        for (let i = 0; i < 256; i++) words[i] = (i * 257) % 65536;
        words[255] = 65280; // last index carries a sentinel
        fakeProto.texSubImage2D.call(fakeSelf, 3553, 0, 0, 0, 64, 1, 6408, 5131, words);
        const e = win.__gtGLUploads[0];
        // Direct fields read from uploadContext — the attempt-1 bug (state.trail.sessionGeneration)
        // returned null here; the direct contract must hold.
        expect(e.frame).toBe(17);
        expect(e.sessionGeneration).toBe(3);
        // Original called exactly once with unchanged args; NO getError consumed by the hook.
        expect(calls).toHaveLength(1);
        expect(calls[0].length).toBe(9);
        expect(calls[0][8]).toBe(words);
        expect(getErrorCalls).toHaveLength(0);
        // Full 256-word payload including the LAST index.
        expect(e.payloadWords).toHaveLength(256);
        expect(e.payloadWords[255]).toBe(65280);
        expect(e.payloadWords[0]).toBe(0);
        expect(e.bytes).toBe(512);
        expect(e.texture).toBe(1);
        expect(win.__gtGLHookErrors).toEqual([]);
    });

    test('storage conversion golden: rgba8 unit byte rounding + 1/255 alpha amplification', () => {
        // The trail stage stores floor(clamp(premul,0,1)*255+0.5)/255 (explicit quantization).
        const quantize = (v: number) => Math.floor(Math.max(0, Math.min(1, v)) * 255 + 0.5) / 255;
        // Premultiplied B≈0.5093 at alpha≈1/255 → stored byte 1/255; the inverse
        // un-premultiply amplifies a 1-byte difference (FF/WK resize diagnostic fact).
        const premulB = 0.5093;
        const stored = quantize(premulB * (1 / 255)); // ≈ 0.0020032...
        expect(stored).toBeCloseTo(1 / 255, 6);
        // The amplified straight value after un-premultiply: stored / storedAlpha.
        const storedAlpha = quantize(1 / 255);
        const amplified = stored / storedAlpha;
        expect(amplified).toBeCloseTo(1, 6); // 1 byte of B over 1 byte of alpha -> full B
        // Unit-byte round trip: every k/255 lands exactly on the byte grid.
        for (let k = 0; k <= 255; k++) expect(quantize(k / 255)).toBeCloseTo(k / 255, 12);
        // .5 rounding: x*255+0.5 floors to the NEAREST byte (ties toward +inf).
        expect(quantize(0.5 / 255)).toBe(1 / 255);
        expect(quantize(0.499999 / 255)).toBe(0);
        // CPU oracle unchanged: the glass model still consumes the quantized bytes
        // (trailTexel emits integer bytes); ±2 tolerance and the mother math are untouched.
        const bytes = oracle.trailTexel(
            oracle.replay([{ x: 0.3, y: 0.5, dt: 1 / 60 }], defaults, 640, 400).bits,
            320,
            200,
            640,
            400,
            defaults,
        );
        expect(bytes.every((b: number) => Number.isInteger(b) && b >= 0 && b <= 255)).toBe(true);
    });

    test('generator emits the explicit quantization in BOTH web shader variants', () => {
        const { trailEffectDefinition } = require('../../examples/shader-glass-trail/src/effect.generated');
        for (const key of ['glsl3', 'glsl4']) {
            const frag = trailEffectDefinition.shaders[0][key].frag;
            expect(frag).toContain('floor(premultiplied * 255.0 + 0.5) / 255.0');
            expect(frag).toContain('clamp(vec4(rgb * coverage, coverage), 0.0, 1.0)');
        }
    });

    test('GL upload hook: real fake-WebGL call forwards identical args and records bytes', () => {
        const hook = collector.installGLUploadHook;
        expect(typeof hook).toBe('function');
        const calls: any[][] = [];
        const fakeTex = {};
        const fakeProto: any = {
            createTexture: function () {
                return fakeTex;
            },
            texSubImage2D: function (...args: any[]) {
                calls.push(args);
            },
            texImage2D: function (...args: any[]) {
                calls.push(args);
            },
        };
        const fakeSelf = { getParameter: () => fakeTex, getError: () => 0, TEXTURE_BINDING_2D: 1 };
        const win: any = {};
        hook(fakeProto, win);
        fakeProto.createTexture.call(fakeSelf);
        const words = new Uint16Array(256);
        words[0] = 1234;
        words[1] = 5678;
        fakeProto.texSubImage2D.call(fakeSelf, 3553, 0, 0, 0, 64, 1, 6408, 5131, words);
        const e = win.__gtGLUploads[0];
        expect(calls).toHaveLength(1);
        expect(calls[0][4]).toBe(64);
        expect(calls[0][5]).toBe(1);
        expect(calls[0][8]).toBe(words);
        expect(e.width).toBe(64);
        expect(e.height).toBe(1);
        expect(e.bytes).toBe(512);
        expect(e.payloadWords[0]).toBe(1234);
        expect(e.payloadWords[1]).toBe(5678);
        expect(e.texture).toBe(1);
        fakeProto.texImage2D.call(fakeSelf, 3553, 0, 6408, 64, 1, 0, 6408, 5131, words);
        const e2 = win.__gtGLUploads[1];
        expect(e2.width).toBe(64);
        expect(e2.height).toBe(1);
        expect(e2.bytes).toBe(512);
    });

    test('fixed glass defaults module equals the E09 mother defaults', () => {
        const mother = JSON.parse(
            fs.readFileSync(path.join(ROOT, 'examples/shader-glass/parameters.json'), 'utf8'),
        ).params;
        const mod = fs.readFileSync(path.join(ROOT, 'examples/shader-glass-trail/src/glass-defaults.ts'), 'utf8');
        for (const key of ['highlightSoftness', 'fresnelSoftness', 'tintIntensity', 'tintPreserveLuminosity'])
            expect(mod).toContain(`${key}: ${mother[key].defaultValue}`);
        // No cross-example runtime fetch remains.
        const main = fs.readFileSync(path.join(ROOT, 'examples/shader-glass-trail/src/main.ts'), 'utf8');
        expect(main).not.toContain("fetch('../shader-glass/");
    });
});
