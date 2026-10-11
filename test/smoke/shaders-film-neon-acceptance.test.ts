/**
 * C02 FULL acceptance (NODE_CONTRACT). Builds one complete synthetic functional AND performance
 * report from tmpdir PNGs + oracle math and drives the PRODUCTION validateFiles to a genuine
 * PASS for each, then applies >=15 mutations per report from the accepted baseline.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

const collector = require('../../tools/verify/shaders-film-neon-browser.cjs');
const oracle = require('../../tools/verify/shaders-film-neon-oracle.cjs');
const ROOT = path.resolve(__dirname, '../..');
const defaults = oracle.defaults();
const CAPTURE_TIME = collector.CAPTURE_TIME;
const KINDS = [...oracle.OWNED_KINDS];
const RESUME_DT = 1 / 60;
const ENGINES = ['chromium', 'firefox', 'webkit'];
const clone = (r: any) => JSON.parse(JSON.stringify(r));
let tmp: string;
beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'film-neon-c02-full-'));
});
afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
});
const hash = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const identity = (absolute: string) => ({
    path: absolute.replaceAll('\\', '/'),
    bytes: fs.statSync(absolute).size,
    sha256: hash(fs.readFileSync(absolute)),
});
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();
function crc32(bytes: Buffer): number {
    let c = 0xffffffff;
    for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
}
const { deflateSync } = require('node:zlib');
function syntheticPng(width: number, height: number, params: any, time: number, presentation: any): string {
    const background = presentation.background || [8, 9, 12];
    const rows: Buffer[] = [];
    for (let y = 0; y < height; y++) {
        const row = Buffer.alloc(1 + width * 4);
        for (let x = 0; x < width; x++) {
            const at = 1 + x * 4;
            row[at] = background[0];
            row[at + 1] = background[1];
            row[at + 2] = background[2];
            row[at + 3] = 255;
        }
        rows.push(row);
    }
    for (const p of oracle.auditPoints(width, height)) {
        const rgba = oracle.model(p.x, p.y, width, height, params, time, presentation).display;
        const at = 1 + p.x * 4;
        for (let c = 0; c < 4; c++) rows[height - 1 - p.y][at + c] = rgba[c];
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const bytes = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(Buffer.concat(rows))),
        chunk('IEND', Buffer.alloc(0)),
    ]);
    const file = path.join(tmp, `png-${width}x${height}-${Math.random().toString(36).slice(2, 8)}.png`);
    fs.writeFileSync(file, bytes);
    return file;
}
function syntheticProbe(width: number, height: number, params: any, time: number, frame: number): any {
    return {
        frame,
        time,
        pixels: oracle.auditPoints(width, height).map((p: any) => {
            const value = oracle.model(p.x, p.y, width, height, params, time);
            return {
                ...p,
                rgba: value.straightLinear.map((x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255)),
            };
        }),
        gpuReceipt: {
            frame: frame - 1,
            time,
            canvas: { width, height },
            targetRGBA8: true,
            transparentClear: true,
            detached: true,
            disposed: true,
            glError: 0,
        },
    };
}
function snap(
    params: any,
    instance: number,
    canvas: { width: number; height: number },
    dpr: number,
    extra: any = {},
): any {
    const frame = extra.frame ?? 20;
    return {
        params: JSON.parse(JSON.stringify(params)),
        time: extra.time ?? CAPTURE_TIME,
        viewport: { width: 640, height: 400 },
        dpr,
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
        ...extra,
    };
}
function retirement(id: number) {
    return {
        id,
        rendererUnbound: true,
        nodeRemoved: true,
        refs: KINDS.map((kind: string) => ({ kind, before: 1, after: 0 })),
    };
}
function resourceRows(): any {
    return {
        rows: Array.from({ length: 100 }, (_, index) => ({
            index,
            id: index + 1,
            before: { bufferSize: 100, textureSize: 50 },
            created: { bufferSize: 496, textureSize: 50 },
            after: { bufferSize: 100, textureSize: 50 },
            refsBefore: [1, 1, 1],
            trace: retirement(index + 1),
            repeat: { idempotent: true },
            nodeValid: false,
            assetsValid: [false, false, false],
            registryPresent: false,
        })),
    };
}
function temporalBlock(): any {
    const pts = oracle.auditPoints(640, 400);
    const pixels = (time: number) =>
        pts.map((p: any) => ({
            x: p.x,
            y: p.y,
            rgba: oracle.model(p.x, p.y, 640, 400, defaults, time).display,
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
            after: mkSnap(CAPTURE_TIME + RESUME_DT, 7, false, 32),
            dt: RESUME_DT,
        },
    };
}
function constructFunctional(): any {
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
                : { ok: false, errors: [{ code: 'FILMNEON_PARAMETER_TYPE', parameter: row.parameter }] },
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
            after: snap({ ...defaults, thickness: 0.51 }, 7, { width: 640, height: 400 }, 1),
        },
        pause: {
            before: snap(defaults, 7, { width: 640, height: 400 }, 1, { time: 1 }),
            after: snap(defaults, 7, { width: 640, height: 400 }, 1, { time: 1 }),
        },
        resume: {
            before: snap(defaults, 7, { width: 640, height: 400 }, 1, { time: 1 }),
            after: snap(defaults, 7, { width: 640, height: 400 }, 1, { time: 1.4 }),
        },
        reset: snap(defaults, 7, { width: 640, height: 400 }, 1, { time: 0 }),
        events: [
            { type: 'parameter:thickness', isTrusted: true, frame: 3 },
            { type: 'pause', isTrusted: true, frame: 4 },
            { type: 'resume', isTrusted: true, frame: 5 },
            { type: 'reset', isTrusted: true, frame: 6 },
            { type: 'release', isTrusted: true, frame: 7 },
        ],
        release: { retirement: retirement(7), sceneCleared: true, listenerAdds: 3, listenerRemoves: 3 },
    };
    const resizePngFile = syntheticPng(480, 320, defaults, CAPTURE_TIME, { background: [8, 9, 12] });
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
        probe: syntheticProbe(480, 320, defaults, CAPTURE_TIME, 60),
    };
    resize.after.canvas = { width: 480, height: 320, css: { width: 480, height: 320 } };
    for (const frame of resize.resizeFrames)
        frame.canvas = { width: 480, height: 320, css: { width: 480, height: 320 } };
    const lifecycle = {
        recreated: {
            trace: { ...retirement(7), idempotent: false },
            snapshot: snap(defaults, 8, { width: 480, height: 320 }, 1),
        },
        samePromise: true,
        terminalCode: 'FILMNEON_DISPOSED',
        release: { sceneCleared: true, listenerAdds: 3, listenerRemoves: 3 },
    };
    const buildLog = path.join(tmp, 'build.log');
    fs.writeFileSync(buildLog, 'command=node tsc\nexitCode=0\n');
    const identitySnapshot = collector.currentIdentity();
    const report = {
        schemaVersion: 'w4-c02-film-neon/1',
        phase: 'functional',
        requestedEngines: [...ENGINES],
        startedAt: '2026-10-12T12:00:00.000Z',
        endedAt: '2026-10-12T12:01:00.000Z',
        command: 'node tools/verify/shaders-film-neon-browser.cjs --phase=functional --browser=all --out=x.json',
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
    report.engines = ENGINES.map((engine) => ({
        ...clone(report.engines[0]),
        engine,
        browserVersion: 'SYNTHETIC-' + engine,
    }));
    return report;
}
function constructPerformance(): any {
    const base = buildFunctional();
    base.phase = 'performance';
    base.authorization = 'quiet-window-x';
    base.command =
        'node tools/verify/shaders-film-neon-browser.cjs --phase=performance --browser=all --authorization=quiet-window-x';
    base.cleanup = { proxyClosed: true, serverClosed: true, errors: [] };
    base.engines[0].performance = collector.PERFORMANCE_PLAN.map((plan: any) => {
        const frames = Array.from({ length: 120 }, (_, i) => ({
            frame: i + 1,
            intervalMs: 16,
            renderEnvelopeMs: 1,
            bufferBytes: 500,
            textureBytes: 500,
            drawCalls: 1,
        }));
        return {
            profile: plan.profile,
            frames,
            warmupFrames: 30,
            updateCalls: frames.map((r) => ({ frame: r.frame, ms: 0.1 })),
            commands: frames.flatMap((r) => [
                { frame: r.frame, name: 'beginRenderPass', ms: 0.3 },
                { frame: r.frame, name: 'bindDescriptorSet', ms: 0.05 },
                { frame: r.frame, name: 'draw', ms: 0.02 },
                { frame: r.frame, name: 'endRenderPass', ms: 0.1 },
            ]),
            draws: frames.map((r) => ({ frame: r.frame, ms: 0.2, name: 'drawElements' })),
            queueBookkeeping: frames.map((r) => ({ frame: r.frame, ms: 0.01 })),
            gpuSamples: [],
            queryEvents: [],
            timerAvailable: false,
            readPixelsDuringWindow: 0,
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
            release: { sceneCleared: true, listenerAdds: 3, listenerRemoves: 3, retirement: retirement(7) },
            pageClosed: true,
            fixedStart: {
                params: JSON.parse(JSON.stringify(defaults)),
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
                time: 1.0,
                frame: 1,
                shaderPasses: [{ program: 'p', shaderCompiled: true }],
            },
            fixedEnd: {
                params: JSON.parse(JSON.stringify(defaults)),
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
                time: 7.0,
                frame: 91,
                shaderPasses: [{ program: 'p', shaderCompiled: true }],
            },
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
    base.engines = ENGINES.map((engine) => ({ ...clone(e), engine, browserVersion: 'SYNTHETIC-' + engine }));
    return base;
}
// Reuse immutable PNG fixtures, but give every mutation an independent report.
let functionalBaseline: any;
let performanceBaseline: any;
function buildFunctional(): any {
    functionalBaseline ??= constructFunctional();
    return clone(functionalBaseline);
}
function buildPerformance(): any {
    performanceBaseline ??= constructPerformance();
    return clone(performanceBaseline);
}
const text = (errors: any[]) => JSON.stringify(errors);

describe('C02 FULL functional acceptance', () => {
    test('complete synthetic functional report passes the production validator', () => {
        const report = buildFunctional();
        expect(report.engines).toHaveLength(3);
        expect(report.engines.reduce((n: number, e: any) => n + e.captures.length, 0)).toBe(39);
        const result = collector.validateFiles(report);
        expect(text(result.errors)).not.toContain('performance tuple');
        expect(result.ok).toBe(true);
    });
    test.each([
        ['null engine', (r: any) => (r.engines[0] = null), 'engine entry object'],
        ['missing pageErrors', (r: any) => delete r.engines[0].pageErrors, 'explicit empty array'],
        ['dpr tamper', (r: any) => (r.engines[0].captures[0].dpr = 99), 'tuple'],
        ['params pollution', (r: any) => (r.engines[0].captures[3].params.thickness = 0.99), 'params not frozen'],
        ['time NaN', (r: any) => (r.engines[0].captures[0].time = Number.NaN), 'time'],
        ['time null', (r: any) => (r.engines[0].captures[0].time = null), 'time'],
        ['build exit 1', (r: any) => (r.build.exitCode = 1), 'build exitCode'],
        ['cleanup server open', (r: any) => (r.cleanup.serverClosed = false), 'server not closed'],
        ['agentGate PASS', (r: any) => (r.agentGate = 'PASS'), 'agentGate'],
        ['untrusted release', (r: any) => (r.engines[0].normal.events[4].isTrusted = false), 'untrusted release'],
        ['resource refs9', (r: any) => (r.engines[0].resources.rows[2].trace.refs[1].after = 9), 'refs-lifecycle'],
        ['cycles omitted', (r: any) => r.engines[0].resources.rows.pop(), 'cycles'],
        [
            'temporal pause after time missing',
            (r: any) => delete r.engines[0].temporal.pause.after.time,
            'after time missing',
        ],
        [
            'temporal resume dt doubled',
            (r: any) => {
                r.engines[0].temporal.resume.dt = 2 / 60;
            },
            'frozen production constant',
        ],
        [
            'temporal pause instance changed',
            (r: any) => (r.engines[0].temporal.pause.after.instance = 99),
            'pause instance',
        ],
        [
            'fake scope with error',
            (r: any) => {
                r.engines[0].consoleErrors.push('x');
                r.scopePassed = true;
            },
            'scopePassed contradicts',
        ],
        ['identity drift', (r: any) => (r.inputs[0].sha256 = '0'.repeat(64)), 'drift'],
    ])('rejects mutation: %s', (label, mutate, family) => {
        const report = buildFunctional();
        expect(collector.validateFiles(report).ok).toBe(true);
        mutate(report);
        const result = collector.validateFiles(report);
        expect(result.ok).toBe(false);
        expect(text(result.errors)).toContain(family);
    });
    test('rejects PNG size tamper with refreshed identity', () => {
        const report = buildFunctional();
        expect(collector.validateFiles(report).ok).toBe(true);
        const capture = report.engines[0].captures[0];
        const small = syntheticPng(320, 200, capture.params, CAPTURE_TIME, capture.presentation);
        capture.png = identity(small);
        const result = collector.validateFiles(report);
        expect(result.ok).toBe(false);
        expect(text(result.errors)).toContain('PNG size');
    });
});

describe('C02 FULL performance acceptance', () => {
    test('complete synthetic performance report passes the production validator', () => {
        const report = buildPerformance();
        expect(report.engines).toHaveLength(3);
        expect(report.engines.reduce((n: number, e: any) => n + e.performance.length, 0)).toBe(9);
        const result = collector.validateFiles(report);
        expect(text(result.errors)).not.toContain('performance tuple');
        expect(result.ok).toBe(true);
    });
    test.each([
        ['profile dropped', (r: any) => r.engines[0].performance.pop(), 'performance rows 2'],
        [
            'profile duplicate',
            (r: any) => (r.engines[0].performance[1] = clone(r.engines[0].performance[0])),
            'duplicate performance profile',
        ],
        ['fixed missing', (r: any) => delete r.engines[0].performance[0].fixedStart, 'fixedStart missing'],
        [
            'fixed params',
            (r: any) => (r.engines[0].performance[0].fixedEnd.params.filmEnabled = 'off'),
            'params not frozen',
        ],
        ['fixed backing', (r: any) => (r.engines[0].performance[0].fixedStart.canvas.width = 1), 'canvas backing'],
        ['fixed css', (r: any) => (r.engines[0].performance[0].fixedEnd.canvas.css.height = 1), 'canvas backing'],
        [
            'fixed frame missing',
            (r: any) => delete r.engines[0].performance[0].fixedEnd.frame,
            'frame not non-negative',
        ],
        ['fixed time NaN', (r: any) => (r.engines[0].performance[0].fixedEnd.time = NaN), 'time not finite'],
        [
            'refs duplicate kind',
            (r: any) => r.engines[0].performance[0].release.retirement.refs.forEach((x: any) => (x.kind = 'mesh')),
            'owned release',
        ],
        ['clock missing', (r: any) => delete r.engines[0].performance[0].precision.allRaw, 'clock calibration'],
        ['environment missing', (r: any) => delete r.engines[0].performance[0].environmentReceipt, 'receipt must be'],
        ['environment coi', (r: any) => (r.engines[0].performance[0].environmentReceipt.phases[1].coi = false), 'COI'],
        ['proxy open', (r: any) => (r.cleanup.proxyClosed = false), 'HTTP servers'],
        [
            'release ref9',
            (r: any) => (r.engines[0].performance[0].release.retirement.refs[0].after = 9),
            'owned release',
        ],
        [
            'missing pass frame',
            (r: any) => {
                r.engines[0].performance[0].commands = r.engines[0].performance[0].commands.filter(
                    (c: any) => !(c.frame === 80 && c.name === 'beginRenderPass'),
                );
            },
            'missing beginRenderPass',
        ],
        [
            'wrong pass name',
            (r: any) => {
                const c = r.engines[0].performance[0].commands.find(
                    (x: any) => x.frame === 80 && x.name === 'beginRenderPass',
                );
                c.name = 'updateBuffer';
            },
            'unknown operation',
        ],
        [
            'readPixels in window',
            (r: any) => (r.engines[0].performance[0].readPixelsDuringWindow = 1),
            'readPixelsDuringWindow',
        ],
        ['missing consoleErrors', (r: any) => delete r.engines[0].consoleErrors, 'explicit empty array'],
        [
            'exit code mask',
            (r: any) => {
                r.engines[0].pageErrors.push('x');
                r.exitCode = 0;
            },
            'exitCode contradicts',
        ],
    ])('rejects perf mutation: %s', (label, mutate, family) => {
        const report = buildPerformance();
        expect(collector.validateFiles(report).ok).toBe(true);
        mutate(report);
        const result = collector.validateFiles(report);
        expect(result.ok).toBe(false);
        expect(text(result.errors)).toContain(family);
    });
    test('validateFiles is total on structural garbage', () => {
        for (const bad of [null, undefined, {}, [], 'x']) {
            let result: any;
            expect(() => {
                result = collector.validateFiles(bad);
            }).not.toThrow();
            expect(result.ok).toBe(false);
        }
    });
});
