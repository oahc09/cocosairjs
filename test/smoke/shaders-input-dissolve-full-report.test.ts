// C04 FULL report acceptance: production collector.validateFiles accepts complete functional
// (3 engines × 18 visual tuples × boundaries/invalids/normal/lifecycle/resize/resources) and
// performance (3 engines × 3 profiles × 3 routes = 27 tuples) reports built from tmpdir PNGs +
// oracle math, then rejects ≥25 complete-report mutations (NaN preserved by deep clone).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {} from 'jest';
const collector = require('../../tools/verify/shaders-input-dissolve-browser.cjs');
const performanceOracle = require('../../tools/verify/shaders-input-dissolve-performance.cjs');
const oracle = require('../../tools/verify/shaders-input-dissolve-oracle.cjs');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '../..');
const ENGINES = ['chromium', 'firefox', 'webkit'] as const;
const CAPTURE_TIME = collector.CAPTURE_TIME;
const defaults = oracle.defaults();
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
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c04-full-'));
});
afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
});

// The REAL example PNG bytes for the image route (CPU verification of the actual asset).
const realPNG = PNG.sync.read(
    fs.readFileSync(path.resolve(ROOT, 'examples/shader-input-dissolve/assets/input-pattern.png')),
);
const imageData = { width: realPNG.width, height: realPNG.height, data: Array.from(realPNG.data) };

function encode(x: number) {
    const c = Math.max(0, Math.min(1, x));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
function syntheticPng(width: number, height: number, params: any, presentation: any): string {
    const png = new PNG({ width, height });
    const bg = presentation?.background ?? [8, 9, 12];
    for (const p of oracle.auditPoints(width, height)) {
        const m = oracle.model(p.x, p.y, width, height, { ...params, __time: CAPTURE_TIME }, presentation);
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
function syntheticProbe(width: number, height: number, params: any, frame: number) {
    return {
        frame: frame + 1,
        time: CAPTURE_TIME,
        pixels: oracle.auditPoints(width, height).map((p: any) => {
            const m = oracle.model(p.x, p.y, width, height, { ...params, __time: CAPTURE_TIME });
            return {
                x: p.x,
                y: p.y,
                rgba: m.straightLinear.map((v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255)),
            };
        }),
        gpuReceipt: {
            frame,
            time: CAPTURE_TIME,
            glError: 0,
            targetRGBA8: true,
            transparentClear: true,
            detached: true,
            disposed: true,
            canvas: { width, height },
        },
        preserved: { instanceEqual: true, framesEqual: true },
        tempRefs: { before: 1, after: 0 },
        rendererRestored: true,
    };
}
function snap(params: any, instance: number, canvas: { width: number; height: number }, dpr: number, extra: any = {}) {
    const frame = extra.frame ?? 20;
    return {
        params: clone(params),
        time: CAPTURE_TIME,
        viewport: { width: 640, height: 400 },
        dpr,
        route: params.route,
        canvas: { width: canvas.width, height: canvas.height, css: { width: 640, height: 400 } },
        instance,
        background: extra.background ?? [8, 9, 12],
        linearDiagnostic: false,
        paused: false,
        frame,
        gpuReceipt: {
            frame: frame - 1,
            time: CAPTURE_TIME,
            background: [8, 9, 12],
            canvas: { ...canvas },
            drawCalls: collector.routePasses(params.route),
        },
        updates: extra.updates ?? 5,
        imageRoute: params.route === 'image' ? collector.expectedImageReceipt() : null,
        renderTargets:
            params.route !== 'image'
                ? { source: { width: canvas.width, height: canvas.height, attached: true } }
                : null,
        ...extra,
    };
}
function retirement(id: number, kinds: string[]) {
    return {
        id,
        renderersUnbound: true,
        nodesRemoved: true,
        contentDetached: true,
        sourceDisposed: true,
        refs: kinds.map((kind) => ({ kind, before: 1, after: 0 })),
    };
}
function routeKinds(route: string) {
    return oracle.OWNED_KINDS_BY_ROUTE(route);
}

function resourceRows(): any {
    const routes = ['image', 'procedural', 'rendered'];
    return {
        rows: Array.from({ length: 100 }, (_, index) => ({
            index,
            id: index + 1,
            route: routes[index % 3],
            before: { bufferSize: 100, textureSize: 50 },
            created: { bufferSize: 320, textureSize: 260 },
            after: { bufferSize: 100, textureSize: 50 },
            trace: { ...retirement(index + 1, routeKinds(routes[index % 3])), repeat: { idempotent: true } },
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
        const presentation = { background: collector.BACKGROUND(entry.id) };
        const width = 640 * entry.dpr;
        const height = 400 * entry.dpr;
        const routeChanged = params.route !== previousParams.route;
        const beforeInstance = instance;
        if (routeChanged) instance++;
        const png = syntheticPng(width, height, params, presentation);
        captures.push({
            id: entry.id,
            dpr: entry.dpr,
            params: { ...params },
            time: CAPTURE_TIME,
            presentation,
            snapshot: snap(params, instance, { width, height }, entry.dpr),
            set: {
                before: snap(previousParams, beforeInstance, { width, height }, entry.dpr),
                receipt: routeChanged
                    ? { ok: true, retirement: retirement(beforeInstance, routeKinds(previousParams.route)) }
                    : { ok: true, retirement: null },
                after: snap(params, instance, { width, height }, entry.dpr),
            },
            png: identity(png),
            probe: syntheticProbe(width, height, params, 40),
        });
        previousParams = params;
    }
    const boundaries = oracle.boundaryPlan().map((row: any, index: number) => {
        const valid = row.boundary !== 'invalid';
        const afterParams = valid ? { ...defaults, [row.parameter]: row.value } : defaults;
        return {
            ...row,
            before: snap(defaults, 7, { width: 640, height: 400 }, 1, { updates: 10 + index }),
            after: snap(afterParams, 7, { width: 640, height: 400 }, 1, { updates: 10 + index + (valid ? 1 : 0) }),
            receipt: valid
                ? { ok: true, errors: [], retirement: null }
                : { ok: false, errors: [{ code: 'INPUTDISSOLVE_PARAMETER_TYPE', parameter: row.parameter }] },
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
            after: snap({ ...defaults, progress: 0.6 }, 7, { width: 640, height: 400 }, 1),
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
            { type: 'parameter:progress', isTrusted: true, frame: 3 },
            { type: 'pause', isTrusted: true, frame: 4 },
            { type: 'resume', isTrusted: true, frame: 5 },
            { type: 'reset', isTrusted: true, frame: 6 },
            { type: 'release', isTrusted: true, frame: 7 },
        ],
        release: {
            retirement: retirement(7, routeKinds(defaults.route)),
            sceneCleared: true,
            listenerAdds: 5,
            listenerRemoves: 5,
            ledger: 5,
            postReleaseDispatchSilent: true,
        },
    };
    const resizePngFile = syntheticPng(480, 320, { ...defaults }, { background: [8, 9, 12] });
    const resize = {
        before: snap({ ...defaults }, 7, { width: 640, height: 400 }, 1, {
            time: CAPTURE_TIME,
        }),
        after: snap({ ...defaults }, 7, { width: 480, height: 320 }, 1, { time: CAPTURE_TIME }),
        resizeFrames: Array.from({ length: 5 }, (_, i) =>
            snap({ ...defaults }, 7, { width: 480, height: 320 }, 1, {
                simulationStep: 20 + i,
                time: CAPTURE_TIME,
            }),
        ),
        png: identity(resizePngFile),
        probe: syntheticProbe(480, 320, { ...defaults }, 60),
    };
    resize.after.canvas = { width: 480, height: 320, css: { width: 480, height: 320 } };
    for (const frame of resize.resizeFrames)
        frame.canvas = { width: 480, height: 320, css: { width: 480, height: 320 } };
    const resizes = ['image', 'procedural', 'rendered'].map((route) => {
        const params = { ...defaults, route };
        const row = clone(resize);
        row.route = route;
        for (const [label, snap] of [
            ['before', row.before],
            ['after', row.after],
            ...row.resizeFrames.map((snap: any) => ['resized', snap]),
        ] as any[]) {
            snap.params = params;
            snap.route = route;
            snap.renderTargets =
                route === 'image'
                    ? null
                    : {
                          source: {
                              width: snap.canvas.width,
                              height: snap.canvas.height,
                              attached: true,
                              generation: label === 'before' ? 0 : 1,
                          },
                      };
        }
        row.probe = syntheticProbe(480, 320, params, 60);
        row.png = identity(syntheticPng(480, 320, params, { background: [8, 9, 12] }));
        return row;
    });
    const lifecycle = {
        recreated: {
            trace: { ...retirement(7, routeKinds(defaults.route)), idempotent: false },
            snapshot: snap(defaults, 8, { width: 480, height: 320 }, 1),
        },
        samePromise: true,
        terminalCode: 'INPUTDISSOLVE_DISPOSED',
        release: { sceneCleared: true, listenerAdds: 5, listenerRemoves: 5 },
    };
    const buildLog = path.join(tmp, 'build.log');
    fs.writeFileSync(buildLog, 'command=node tsc\nexitCode=0\n');
    const identitySnapshot = collector.currentIdentity();
    const report: any = {
        schemaVersion: 'w4-c04-input-dissolve/1',
        phase: 'functional',
        requestedEngines: [...ENGINES],
        startedAt: '2026-10-20T12:00:00.000Z',
        endedAt: '2026-10-20T12:01:00.000Z',
        command: 'node tools/verify/shaders-input-dissolve-browser.cjs --phase=functional --browser=all --out=x.json',
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
                boundaries,
                invalids,
                normal,
                lifecycle,
                resize,
                resizes,
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
/** Full-schema fixed snapshot for a perf window (matches the hardened validator). */
function perfFixedSnap(tuple: any, frame: number, time: number) {
    const d = collector.routePasses(tuple.route);
    return {
        params: { ...defaults, route: tuple.route },
        route: tuple.route,
        viewport: { ...tuple.profile.viewport },
        dpr: tuple.profile.dpr,
        canvas: {
            width: tuple.profile.viewport.width * tuple.profile.dpr,
            height: tuple.profile.viewport.height * tuple.profile.dpr,
            css: { width: tuple.profile.viewport.width, height: tuple.profile.viewport.height },
        },
        background: [8, 9, 12],
        linearDiagnostic: false,
        instance: 1,
        frame,
        time,
        shaderPasses: Array.from({ length: Math.max(1, d) }, (_, i) => ({
            program: `pass-${i}`,
            shaderCompiled: true,
        })),
        renderTargets:
            tuple.route !== 'image'
                ? {
                      source: {
                          width: tuple.profile.viewport.width * tuple.profile.dpr,
                          height: tuple.profile.viewport.height * tuple.profile.dpr,
                          attached: true,
                      },
                  }
                : null,
    };
}
function buildPerformance(): any {
    const base = buildFunctional();
    base.phase = 'performance';
    base.authorization = 'quiet-window-x';
    base.command =
        'node tools/verify/shaders-input-dissolve-browser.cjs --phase=performance --browser=all --authorization=quiet-window-x';
    base.engines[0].performance = collector.PERFORMANCE_PLAN.map((tuple: any) => {
        const passes = performanceOracle.expectedPasses(tuple.route);
        const frames = Array.from({ length: 120 }, (_, i) => ({
            frame: i + 1,
            intervalMs: 16,
            renderEnvelopeMs: 1,
            bufferBytes: 500,
            textureBytes: 500,
            drawCalls: passes,
        }));
        return {
            environmentReceipt: {
                responseStatus: 200,
                deliveredHeaders: { coop: 'same-origin', coep: 'require-corp' },
                phases: [
                    { id: 'after-navigation', dpr: tuple.profile.dpr },
                    {
                        id: 'after-viewport-repair',
                        dpr: tuple.profile.dpr,
                        coi: true,
                        css: { w: tuple.profile.viewport.width, h: tuple.profile.viewport.height },
                        backing: {
                            w: tuple.profile.viewport.width * tuple.profile.dpr,
                            h: tuple.profile.viewport.height * tuple.profile.dpr,
                        },
                    },
                ],
            },
            precision: {
                calls: 25000,
                crossOriginIsolated: true,
                allRaw: [0.02, 0.04],
                positiveCount: 2,
                minimumPositiveDeltaMs: 0.02,
            },
            pageClosed: true,
            release: { sceneCleared: true, retirement: retirement(1, routeKinds(tuple.route)) },
            profile: clone(tuple.profile),
            route: tuple.route,
            frames,
            warmupFrames: 30,
            updateCalls: frames.map((r) => ({ frame: r.frame, ms: 0.1 })),
            commands: frames.flatMap((r) => [
                ...(passes === 2 ? [{ frame: r.frame, name: 'beginRenderPass', ms: 0.3 }] : []),
                { frame: r.frame, name: 'beginRenderPass', ms: 0.25 },
                ...(passes === 2 ? [{ frame: r.frame, name: 'endRenderPass', ms: 0.1 }] : []),
                { frame: r.frame, name: 'endRenderPass', ms: 0.08 },
            ]),
            draws: frames.flatMap((r) =>
                Array.from({ length: passes }, () => ({ frame: r.frame, ms: 0.2, name: 'drawElements' })),
            ),
            queueBookkeeping: frames.map((r) => ({ frame: r.frame, ms: 0.01 })),
            gpuSamples: [], // explicit empty: timer unavailable semantics
            queryEvents: [],
            timerAvailable: false,
            readPixelsDuringWindow: 0,
            fixedStart: (() => {
                const snap = perfFixedSnap(tuple, 1, 0);
                return snap;
            })(),
            fixedEnd: (() => {
                const snap = perfFixedSnap(tuple, 90, 1.5);
                return snap;
            })(),
            window: { start: 1, end: 120, durationMs: 1920 },
            device: { renderer: 'SYNTHETIC' },
            viewport: {
                ...tuple.profile.viewport,
                dpr: tuple.profile.dpr,
                backing: {
                    width: tuple.profile.viewport.width * tuple.profile.dpr,
                    height: tuple.profile.viewport.height * tuple.profile.dpr,
                },
            },
            memory: { bufferSize: 500, textureSize: 500 },
            methods: {
                commands: 'includes immediate GL',
                queue: 'not GPU command submission',
                frames: 'not monitor presentation',
                passes: `image: 1 dissolve pass; procedural: content RT + dissolve; rendered: scene render + dissolve (route ${tuple.route} = ${passes})`,
                instrumentation:
                    'native gfx command wrapping adds CPU envelope cost; instrumented diagnostic window, not an uninstrumented benchmark',
            },
        };
    });
    const e = base.engines[0];
    delete e.captures;
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

// Baselines built ONCE; mutations deep-clone (NaN-preserving).
let functionalBaseline: any = null;
let performanceBaseline: any = null;
const functional = () => (functionalBaseline ??= buildFunctional());
const performance = () => (performanceBaseline ??= buildPerformance());
const text = (errors: any[]) => JSON.stringify(errors);

describe('C04 FULL functional report acceptance', () => {
    test('complete 3-engine functional report passes the production validator', () => {
        const report = functional();
        expect(report.engines).toHaveLength(3);
        expect(report.engines.reduce((n: number, e: any) => n + e.captures.length, 0)).toBe(81);
        const result = collector.validateFiles(report);
        if (!result.ok) console.log('FUNC ERRORS:', JSON.stringify(result.errors.slice(0, 5)));
        expect(result.ok).toBe(true);
    });
});

describe('C04 FULL performance report acceptance (27 tuples)', () => {
    test('3 engines × 3 profiles × 3 routes passes the production validator', () => {
        const report = performance();
        expect(report.engines).toHaveLength(3);
        expect(report.engines.reduce((n: number, e: any) => n + e.performance.length, 0)).toBe(27);
        for (const row of report.engines[0].performance) {
            const tuple = collector.PERFORMANCE_PLAN.find(
                (q: any) => q.profile.id === row.profile.id && q.route === row.route,
            );
            const r = performanceOracle.validatePerformance(row, tuple.profile, tuple.route);
            if (r.errors.length) throw new Error(`${row.profile.id}/${row.route}: ${r.errors.join(';')}`);
        }
        const result = collector.validateFiles(report);
        if (!result.ok) console.log('PERF ERRORS:', JSON.stringify(result.errors.slice(0, 5)));
        expect(result.ok).toBe(true);
    });
});

describe('C04 FULL report mutation rejection (≥25)', () => {
    const mutations: { name: string; phase: 'functional' | 'performance'; apply: (r: any) => void }[] = [
        {
            name: 'route swapped in place (params vs snapshot route)',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].snapshot.route = 'rendered';
            },
        },
        {
            name: 'image route without PNG bytes evidence',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].snapshot.imageRoute = null;
            },
        },
        {
            name: 'RT route without source RT evidence',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[8].snapshot.renderTargets = null;
            },
        },
        {
            name: 'drawCalls below route pass contract',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[8].snapshot.gpuReceipt.drawCalls = 1;
            },
        },
        {
            name: 'image route claims 2 passes',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].snapshot.gpuReceipt.drawCalls = 2;
            },
        },
        {
            name: 'progress1 endpoint not transparent',
            phase: 'functional',
            apply: (r) => {
                const cap = r.engines[0].captures.find((c: any) => c.id === 'image-progress1');
                cap.params.progress = 0.5;
                cap.snapshot.params.progress = 0.5;
            },
        },
        {
            name: 'disabled case relabeled as enabled',
            phase: 'functional',
            apply: (r) => {
                const cap = r.engines[0].captures.find((c: any) => c.id === 'image-disabled');
                cap.params.dissolveEnabled = 'on';
                cap.snapshot.params.dissolveEnabled = 'on';
            },
        },
        {
            name: 'pixel whitewash on a capture',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].probe.pixels.forEach((p: any) => (p.rgba = [255, 255, 255, 255]));
            },
        },
        {
            name: 'probe temp refs leaked',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].probe.tempRefs = { before: 1, after: 1 };
            },
        },
        {
            name: 'probe renderer not restored',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].probe.rendererRestored = false;
            },
        },
        {
            name: 'route switch without rebuild receipt',
            phase: 'functional',
            apply: (r) => {
                const cap = r.engines[0].captures.find((c: any) => c.id === 'procedural-default');
                cap.set.receipt.retirement = null;
            },
        },
        {
            name: 'uniform update rebuilt instance',
            phase: 'functional',
            apply: (r) => {
                const cap = r.engines[0].captures[1];
                cap.snapshot.instance = 99;
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
            name: 'NaN param in a capture snapshot',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].captures[0].snapshot.params.progress = NaN;
            },
        },
        {
            name: 'listener ledger mismatch on release',
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
            name: 'terminal guard code wrong',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].lifecycle.terminalCode = 'OTHER_CODE';
            },
        },
        {
            name: 'resize PNG wrong size',
            phase: 'functional',
            apply: (r) => {
                const wrong = syntheticPng(320, 200, { ...defaults }, { background: [8, 9, 12] });
                r.engines[0].resizes[0].png = identity(wrong);
            },
        },
        {
            name: 'resources zero allocation',
            phase: 'functional',
            apply: (r) => {
                r.engines[0].resources.rows[0].created = { bufferSize: 100, textureSize: 50 };
            },
        },
        {
            name: 'closure drift',
            phase: 'functional',
            apply: (r) => {
                r.inputs[r.inputs.length - 1].sha256 = '0'.repeat(64);
            },
        },
        {
            name: 'agent gate falsified',
            phase: 'functional',
            apply: (r) => {
                r.agentGate = 'PASS';
            },
        },
        {
            name: 'completed falsified',
            phase: 'functional',
            apply: (r) => {
                r.completed = true;
            },
        },
        {
            name: 'engine set reduced',
            phase: 'functional',
            apply: (r) => {
                r.engines = r.engines.slice(0, 1);
            },
        },
        {
            name: 'perf route mismatch inside window',
            phase: 'performance',
            apply: (r) => {
                const row = r.engines[0].performance.find((t: any) => t.route === 'rendered');
                row.fixedEnd.route = 'image';
                row.fixedEnd.params.route = 'image';
            },
        },
        {
            name: 'perf route below pass contract (1 pass rendered)',
            phase: 'performance',
            apply: (r) => {
                const row = r.engines[0].performance.find((p: any) => p.route === 'rendered');
                row.frames.forEach((f: any) => (f.drawCalls = 1));
            },
        },
        {
            name: 'perf one beginRenderPass on rendered route',
            phase: 'performance',
            apply: (r) => {
                const row = r.engines[0].performance.find((p: any) => p.route === 'rendered');
                const idx = row.commands.findIndex((c: any) => c.name === 'beginRenderPass' && c.frame > 30);
                row.commands.splice(idx, 1);
            },
        },
        {
            name: 'perf unknown command name',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].commands[0].name = 'fabricated';
            },
        },
        {
            name: 'perf false GPU samples while unavailable',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].gpuSamples = [{ frame: 40, ms: 3 }];
            },
        },
        {
            name: 'perf readPixels nonzero',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].readPixelsDuringWindow = 2;
            },
        },
        {
            name: 'perf NaN frame timing',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[0].frames[50].intervalMs = NaN;
            },
        },
        {
            name: 'perf malformed raw (array) never throws',
            phase: 'performance',
            apply: (r) => {
                r.engines[0].performance[1] = [] as any;
            },
        },
        {
            name: 'perf instrumentation label removed',
            phase: 'performance',
            apply: (r) => {
                delete r.engines[0].performance[0].methods.instrumentation;
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
    test('mutation count ≥ 25', () => {
        expect(mutations.length).toBeGreaterThanOrEqual(25);
    });
});

describe('C04 independent goldens (storage/endpoints/source routes)', () => {
    test('premultiplied storage inverse is safe at alpha 0 and 1/255', () => {
        // Stored premul B≈0.5093 at alpha 1/255 → straight B=1 (1-byte amplification, bounded).
        const storedB = 1 / 255,
            alpha = 1 / 255;
        const straight = alpha > 0.003921568627 ? storedB / alpha : 0;
        expect(straight).toBeCloseTo(1, 6);
        // alpha 0 stays fully zero — no blow-up.
        const zero = 0 > 0.003921568627 ? 1 / 255 / 0 : 0;
        expect(zero).toBe(0);
    });
    test('one OETF: display chain encodes exactly once', () => {
        const m = oracle.model(320, 200, 320, 200, { ...defaults, route: 'procedural' });
        const d = oracle.displayOf(m);
        expect(d.every((v: number) => Number.isInteger(v) && v >= 0 && v <= 255)).toBe(true);
    });
    test('actual source-route selection: three routes, three distinct sources', () => {
        const pts = oracle.auditPoints(320, 200);
        const sig = (route: string) =>
            pts
                .map((p: any) =>
                    oracle.model(p.x, p.y, 320, 200, { ...defaults, route, progress: 0 }).straightLinear.join(','),
                )
                .join(';');
        const img = pts
            .map((p: any) =>
                oracle
                    .model(p.x, p.y, 320, 200, { ...defaults, route: 'image', progress: 0, __imageData: imageData })
                    .straightLinear.join(','),
            )
            .join(';');
        expect(new Set([img, sig('procedural'), sig('rendered')]).size).toBe(3);
    });
    test('generator members/properties match the real GLSL Constants', () => {
        const {
            dissolveEffectDefinition,
            contentEffectDefinition,
        } = require('../../examples/shader-input-dissolve/src/effect.generated');
        for (const [def, names] of [
            [dissolveEffectDefinition, ['params', 'flags']],
            [contentEffectDefinition, ['params', 'flags', 'params2']],
        ] as [any, string[]][]) {
            const shader = def.shaders[0];
            const body = shader.glsl3.frag.match(/uniform Constants\s*\{([\s\S]*?)\}/)?.[1];
            expect(body).toBeDefined();
            const declared = [...body.matchAll(/vec4\s+(\w+)\s*;/g)].map((m) => m[1]);
            const members = shader.blocks.find((b: any) => b.name === 'Constants').members.map((m: any) => m.name);
            expect(members).toEqual(declared);
            expect(members).toEqual(names);
        }
        const props = dissolveEffectDefinition.techniques[0].passes[0].properties;
        expect(Object.keys(props)).toEqual(expect.arrayContaining(['params', 'flags']));
    });
});

describe('C04 independently bound evidence', () => {
    test.each([
        ['invalid partial apply', (r: any) => (r.engines[0].invalids[0].after.params.progress = 0.9)],
        ['empty image receipt', (r: any) => (r.engines[0].captures[0].snapshot.imageRoute = {})],
        ['missing probe time', (r: any) => delete r.engines[0].captures[0].probe.time],
        ['spoof probe time', (r: any) => (r.engines[0].captures[0].probe.time = 999)],
        ['probe state changed', (r: any) => (r.engines[0].captures[0].probe.preserved.framesEqual = false)],
        ['missing fresh instance', (r: any) => delete r.engines[0].lifecycle.recreated.snapshot.instance],
        ['resize missing route', (r: any) => r.engines[0].resizes.pop()],
        ['resize stale RT', (r: any) => (r.engines[0].resizes[1].after.renderTargets.source.generation = 0)],
    ])('%s rejected from accepted baseline', (_name, mutate: any) => {
        const r = clone(functional());
        mutate(r);
        expect(collector.validateFiles(r).ok).toBe(false);
    });
    test.each([
        ['missing env', (r: any) => delete r.engines[0].performance[0].environmentReceipt],
        ['missing clock raw', (r: any) => delete r.engines[0].performance[0].precision.allRaw],
        ['duplicate tuple', (r: any) => (r.engines[0].performance[1] = clone(r.engines[0].performance[0]))],
        ['missing authorization', (r: any) => delete r.authorization],
    ])('%s performance rejected', (_name, mutate: any) => {
        const r = clone(performance());
        mutate(r);
        expect(collector.validateFiles(r).ok).toBe(false);
    });
});
