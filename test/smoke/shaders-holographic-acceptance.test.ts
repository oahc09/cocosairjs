/**
 * E03 collector acceptance (NODE_CONTRACT). Builds one complete synthetic functional report from
 * tmpdir PNGs + oracle math and drives the PRODUCTION validateFiles to a genuine PASS, then
 * applies one tamper per case and requires the specific rejection family. No browser was
 * launched and no output/ artifact is read.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

const collector = require('../../tools/verify/shaders-holographic-browser.cjs');
const oracle = require('../../tools/verify/shaders-holographic-oracle.cjs');
const ROOT = path.resolve(__dirname, '../..');
const defaults = oracle.defaults();
const CAPTURE_TIME = 0.25;
const KINDS = [...oracle.OWNED_KINDS];
let tmp: string;
beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'holographic-e03-acceptance-'));
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
// pngjs PNG.sync.write is pathologically slow under the jsdom realm; emit the same format
// directly through zlib (filter-0 scanlines, one IDAT). Decoding later stays on pngjs.
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
    const background = presentation.background || [9, 10, 14],
        rows: Buffer[] = [];
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
        const rgba = oracle.model(p.x, p.y, width, height, params, time, presentation).display,
            at = 1 + p.x * 4;
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
                rgba: value.cutout
                    ? [0, 0, 0, 0]
                    : value.straightLinear.map((x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255)),
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
function snapshot(
    params: any,
    instance: number,
    canvas: { width: number; height: number },
    dpr: number,
    extra: any = {},
): any {
    return {
        params: JSON.parse(JSON.stringify(params)),
        time: extra.time ?? CAPTURE_TIME,
        viewport: { width: 640, height: 400 },
        dpr,
        canvas: { width: canvas.width, height: canvas.height, css: { width: 640, height: 400 } },
        instance,
        background: extra.background ?? [9, 10, 14],
        linearDiagnostic: false,
        gpuReceipt: extra.gpuReceipt ?? { frame: 9, time: extra.time ?? CAPTURE_TIME, background: [9, 10, 14] },
        simulationStep: extra.simulationStep ?? 10,
        updates: extra.updates ?? 5,
        ...extra,
    };
}
function retirementFixture(id: number) {
    return {
        id,
        rendererUnbound: true,
        nodeRemoved: true,
        refs: KINDS.map((kind: string) => ({ kind, before: 1, after: 0 })),
    };
}
function resourceFixture(): any {
    return {
        rows: Array.from({ length: 100 }, (_, index) => ({
            index,
            id: index + 1,
            before: { bufferSize: 100, textureSize: 50 },
            created: { bufferSize: 496, textureSize: 50 },
            after: { bufferSize: 100, textureSize: 50 },
            refsBefore: [1, 1, 1],
            trace: retirementFixture(index + 1),
            repeat: { idempotent: true },
            nodeValid: false,
            assetsValid: [false, false, false],
            registryPresent: false,
        })),
    };
}
function buildReport(): any {
    const plan = collector.VISUAL_PLAN as any[],
        captures: any[] = [];
    let instance = 1,
        previousParams = defaults;
    for (const [index, entry] of plan.entries()) {
        if (entry.dpr === 2 && plan[index - 1] && plan[index - 1].dpr === 1) {
            instance = 1; // fresh DPR2 page restarts the owner chain
            previousParams = defaults;
        }
        const params = { ...defaults, ...entry.patch },
            presentation = { background: collector.BACKGROUND(entry.id), linearDiagnostic: false },
            width = 640 * entry.dpr,
            height = 400 * entry.dpr,
            shapeChanged = params.shape !== previousParams.shape,
            beforeInstance = instance;
        if (shapeChanged) instance++;
        const png = syntheticPng(width, height, params, CAPTURE_TIME, presentation);
        captures.push({
            id: entry.id,
            dpr: entry.dpr,
            params,
            time: CAPTURE_TIME,
            presentation,
            snapshot: snapshot(params, instance, { width, height }, entry.dpr),
            set: {
                before: snapshot(previousParams, beforeInstance, { width, height }, entry.dpr),
                receipt: shapeChanged
                    ? { ok: true, retirement: retirementFixture(beforeInstance) }
                    : { ok: true, retirement: null },
                after: snapshot(params, instance, { width, height }, entry.dpr),
            },
            png: identity(png),
            probe: syntheticProbe(width, height, params, CAPTURE_TIME, 40),
        });
        previousParams = params;
    }
    const boundaries = oracle.boundaryPlan().map((row: any, index: number) => {
        const valid = row.boundary !== 'invalid',
            afterParams = valid ? { ...defaults, [row.parameter]: row.value } : defaults;
        return {
            ...row,
            before: snapshot(defaults, 7, { width: 640, height: 400 }, 1, { updates: 10 + index }),
            after: snapshot(afterParams, 7, { width: 640, height: 400 }, 1, { updates: 10 + index + (valid ? 1 : 0) }),
            receipt: valid
                ? { ok: true, errors: [], retirement: null }
                : { ok: false, errors: [{ code: 'HOLOGRAPHIC_PARAMETER_TYPE', parameter: row.parameter }] },
        };
    });
    const invalids = collector.INVALID_CASES.map((frozen: any) => ({
        case: { kind: frozen.kind, parameter: frozen.parameter },
        receipt: { ok: false, errors: [{ code: frozen.code, parameter: frozen.parameter }] },
        before: snapshot(defaults, 7, { width: 640, height: 400 }, 1, { updates: 400 }),
        after: snapshot(defaults, 7, { width: 640, height: 400 }, 1, { updates: 400 }),
    }));
    const normal = {
        parameter: {
            before: snapshot(defaults, 7, { width: 640, height: 400 }, 1),
            after: snapshot({ ...defaults, rotation: 1 }, 7, { width: 640, height: 400 }, 1),
        },
        pause: {
            before: snapshot(defaults, 7, { width: 640, height: 400 }, 1, { time: 1 }),
            after: snapshot(defaults, 7, { width: 640, height: 400 }, 1, { time: 1 }),
        },
        resume: {
            before: snapshot(defaults, 7, { width: 640, height: 400 }, 1, { time: 1 }),
            after: snapshot(defaults, 7, { width: 640, height: 400 }, 1, { time: 1.4 }),
        },
        reset: snapshot(defaults, 7, { width: 640, height: 400 }, 1, { time: 0 }),
        events: [
            { type: 'parameter:rotation', isTrusted: true, frame: 3 },
            { type: 'pause', isTrusted: true, frame: 4 },
            { type: 'resume', isTrusted: true, frame: 5 },
            { type: 'reset', isTrusted: true, frame: 6 },
            { type: 'release', isTrusted: true, frame: 7 },
        ],
        release: {
            retirement: retirementFixture(7),
            sceneCleared: true,
            listenerAdds: 3,
            listenerRemoves: 3,
        },
    };
    const resizePngFile = syntheticPng(480, 320, defaults, CAPTURE_TIME, { background: [9, 10, 14] });
    const resize = {
        before: snapshot(defaults, 7, { width: 640, height: 400 }, 1, { time: CAPTURE_TIME }),
        after: snapshot(defaults, 7, { width: 480, height: 320 }, 1, { time: CAPTURE_TIME }),
        resizeFrames: Array.from({ length: 5 }, (_, i) =>
            snapshot(defaults, 7, { width: 480, height: 320 }, 1, { simulationStep: 20 + i, time: CAPTURE_TIME }),
        ),
        png: identity(resizePngFile),
        probe: syntheticProbe(480, 320, defaults, CAPTURE_TIME, 60),
    };
    resize.after.canvas = { width: 480, height: 320, css: { width: 480, height: 320 } };
    for (const frame of resize.resizeFrames)
        frame.canvas = { width: 480, height: 320, css: { width: 480, height: 320 } };
    const lifecycle = {
        recreated: {
            trace: { ...retirementFixture(7), idempotent: false },
            snapshot: snapshot(defaults, 8, { width: 480, height: 320 }, 1),
        },
        samePromise: true,
        terminalCode: 'HOLOGRAPHIC_DISPOSED',
        release: { sceneCleared: true, listenerAdds: 3, listenerRemoves: 3 },
    };
    // GPU temporal observation fixture: probes at both times, determinism + speed-0 equality,
    // and raw display readPixels that follow the CPU display-chain deltas.
    const temporalPoints = oracle.auditPoints(640, 400);
    const temporalPixels = (time: number, params: any = defaults) =>
        temporalPoints.map((p: any) => ({
            x: p.x,
            y: p.y,
            rgba: oracle.model(p.x, p.y, 640, 400, params, time).display.slice(0, 3).concat([255]),
        }));
    const temporalPngA = syntheticPng(640, 400, defaults, CAPTURE_TIME, { background: [9, 10, 14] });
    const temporalPngB = syntheticPng(640, 400, defaults, 0.27, { background: [9, 10, 14] });
    const temporalSnapshot = (params: any, instance: number, time: number, pixels: number[][]) => ({
        ...snapshot(params, instance, { width: 640, height: 400 }, 1, { time }),
        time,
        seed: params.seed,
        gpuReceipt: { frame: 11, time, background: [9, 10, 14] },
        frame: 12,
        pixels,
    });
    const temporal = {
        params: defaults,
        a: {
            time: CAPTURE_TIME,
            snapshot: temporalSnapshot(defaults, 7, CAPTURE_TIME, temporalPixels(CAPTURE_TIME)),
            png: identity(temporalPngA),
            probe: syntheticProbe(640, 400, defaults, CAPTURE_TIME, 40),
        },
        b: {
            time: 0.27,
            snapshot: temporalSnapshot(defaults, 7, 0.27, temporalPixels(0.27)),
            png: identity(temporalPngB),
            probe: syntheticProbe(640, 400, defaults, 0.27, 41),
        },
        determinism: {
            equal: true,
            snapshot: temporalSnapshot(defaults, 8, CAPTURE_TIME, temporalPixels(CAPTURE_TIME)),
        },
        speedZero: {
            params: { ...defaults, speed: 0 },
            a: temporalSnapshot(
                { ...defaults, speed: 0 },
                9,
                CAPTURE_TIME,
                temporalPixels(CAPTURE_TIME, { ...defaults, speed: 0 }),
            ),
            b: temporalSnapshot({ ...defaults, speed: 0 }, 9, 5.5, temporalPixels(5.5, { ...defaults, speed: 0 })),
            equal: true,
        },
    };
    const buildLog = path.join(tmp, 'build.log');
    fs.writeFileSync(buildLog, 'command=node tsc\nexitCode=0\n');
    const identitySnapshot = collector.currentIdentity();
    return {
        schemaVersion: 'e03-holographic/1',
        phase: 'functional',
        requestedEngines: ['chromium'],
        startedAt: '2026-10-11T12:00:00.000Z',
        endedAt: '2026-10-11T12:01:00.000Z',
        command: 'node tools/verify/shaders-holographic-browser.cjs --phase=functional --browser=chromium --out=x.json',
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
                temporal,
                boundaries,
                invalids,
                normal,
                lifecycle,
                resize,
                resources: resourceFixture(),
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
}
const clone = (report: any) => JSON.parse(JSON.stringify(report));
const text = (errors: any[]) => JSON.stringify(errors);

describe('E03 collector acceptance (NODE_CONTRACT, production validator, synthetic report)', () => {
    test('complete synthetic functional report passes the production validator', () => {
        const result = collector.validateFiles(buildReport());
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    test.each([
        ['null engine', (r: any) => (r.engines[0] = null), 'engine entry object'],
        ['missing pageErrors array', (r: any) => delete r.engines[0].pageErrors, 'explicit empty array'],
        ['missing consoleErrors array', (r: any) => delete r.engines[0].consoleErrors, 'explicit empty array'],
        ['shader compile dropped', (r: any) => (r.engines[0].shaderCompile = []), 'shader compile'],
        ['dpr tamper', (r: any) => (r.engines[0].captures[0].dpr = 99), 'tuple'],
        [
            'params chain break',
            (r: any) => (r.engines[0].captures[4].set.before.params.shape = 'rounded-box'),
            'before params chain',
        ],
        ['params tamper', (r: any) => (r.engines[0].captures[3].params.seed = 5), 'params not frozen'],
        ['time NaN', (r: any) => (r.engines[0].captures[0].time = null), 'time'],
        [
            'probe frame negative',
            (r: any) => {
                r.engines[0].captures[0].probe.frame = -1;
                r.engines[0].captures[0].probe.gpuReceipt.frame = -2;
            },
            'GPU receipt frame/time type',
        ],
        ['probe time unbound', (r: any) => (r.engines[0].captures[0].probe.time = 0.5), 'probe/receipt time binding'],
        ['build exit 1', (r: any) => (r.build.exitCode = 1), 'build exitCode'],
        ['missing build log', (r: any) => (r.build.raw = { path: 'nope.log', bytes: 1, sha256: '0' }), 'build log'],
        ['identity drift', (r: any) => (r.inputs[0].sha256 = '0'.repeat(64)), 'drift'],
        ['closure drift', (r: any) => r.inputs.push(r.inputs[0]), 'input closure'],
        ['cleanup server open', (r: any) => (r.cleanup.serverClosed = false), 'server not closed'],
        ['agent gate pass', (r: any) => (r.agentGate = 'PASS'), 'agentGate'],
        ['untrusted release', (r: any) => (r.engines[0].normal.events[4].isTrusted = false), 'untrusted release'],
        ['release refs9', (r: any) => (r.engines[0].normal.release.retirement.refs[0].after = 9), 'owned release'],
        ['resource refs9', (r: any) => (r.engines[0].resources.rows[2].trace.refs[1].after = 9), 'refs-lifecycle'],
        ['cycles omitted', (r: any) => r.engines[0].resources.rows.pop(), 'cycles'],
        [
            'boundary partial application',
            (r: any) => (r.engines[0].boundaries.find((b: any) => b.boundary === 'invalid').after.params.seed = 4),
            'partial parameter application',
        ],
        [
            'resize background pollution',
            (r: any) => {
                r.engines[0].resize.before.background = [180, 160, 140];
            },
            'resize before background',
        ],
        [
            'resize receipt mismatch',
            (r: any) => (r.engines[0].resize.after.gpuReceipt.background = [1, 2, 3]),
            'gpuReceipt background',
        ],
        ['temporal missing', (r: any) => delete r.engines[0].temporal, 'temporal observation required'],
        [
            'speedZero matching fabricated white frames',
            (r: any) => {
                const zero = r.engines[0].temporal.speedZero;
                for (const snapshot of [zero.a, zero.b])
                    for (const pixel of snapshot.pixels) pixel.rgba = [255, 255, 255, 255];
            },
            'oracle pixel mismatch',
        ],
        [
            'speedZero stale submitted frame',
            (r: any) => (r.engines[0].temporal.speedZero.a.gpuReceipt.time = 0.27),
            'receipt frame/time binding',
        ],
        [
            'speedZero changed unrelated parameter',
            (r: any) => (r.engines[0].temporal.speedZero.params.seed = 3),
            'speedZero frozen params',
        ],
        ['temporal seed not bound', (r: any) => (r.engines[0].temporal.determinism.snapshot.seed = 2), 'seed binding'],
        [
            'temporal invalid shared frame number',
            (r: any) => {
                const a = r.engines[0].temporal.a.snapshot;
                a.frame = a.gpuReceipt.frame = -1;
            },
            'receipt frame/time binding',
        ],
        [
            'Lead tamper 1: determinism pixels whitewashed, flag kept true',
            (r: any) => {
                r.engines[0].temporal.determinism.snapshot.pixels[0].rgba = [255, 255, 255, 255];
            },
            'determinism byte mismatch',
        ],
        [
            'Lead tamper 2: speedZero b pixels altered, flag kept true',
            (r: any) => {
                r.engines[0].temporal.speedZero.b.pixels[0].rgba = [255, 255, 255, 255];
            },
            'speedZero byte mismatch',
        ],
        [
            'Lead tamper 3: NaN byte in temporal a pixels',
            (r: any) => {
                r.engines[0].temporal.a.snapshot.pixels[0].rgba[0] = NaN;
            },
            'malformed byte channels',
        ],
        [
            'temporal determinism same instance',
            (r: any) => (r.engines[0].temporal.determinism.snapshot.instance = 7),
            'determinism instance not rebuilt',
        ],
        [
            'temporal determinism false',
            (r: any) => (r.engines[0].temporal.determinism.equal = false),
            'temporal determinism flag contradicts raw data',
        ],
        [
            'temporal speed-zero broken',
            (r: any) => (r.engines[0].temporal.speedZero.equal = false),
            'temporal speedZero flag contradicts raw data',
        ],
        [
            'temporal drift tampered',
            (r: any) => {
                r.engines[0].temporal.b.snapshot.pixels[0].rgba[1] = 250;
            },
            'temporal GPU drift disagrees',
        ],
        [
            'temporal times not frozen',
            (r: any) => (r.engines[0].temporal.b.time = 0.29),
            'temporal times not frozen plan',
        ],
        [
            'fake scope',
            (r: any) => {
                r.engines[0].consoleErrors.push('x');
                r.scopePassed = true;
            },
            'scopePassed contradicts',
        ],
        [
            'exit code mask',
            (r: any) => {
                r.engines[0].consoleErrors.push('x');
                r.exitCode = 0;
            },
            'exitCode contradicts',
        ],
    ])('rejects tamper: %s', (label, mutate, family) => {
        const report = buildReport();
        mutate(report);
        const result = collector.validateFiles(report);
        expect(result.ok).toBe(false);
        expect(text(result.errors)).toContain(family);
    });

    test('rejects PNG size tamper with refreshed identity', () => {
        const report = buildReport();
        const capture = report.engines[0].captures[0];
        const small = syntheticPng(320, 200, capture.params, CAPTURE_TIME, capture.presentation);
        capture.png = identity(small);
        const result = collector.validateFiles(report);
        expect(result.ok).toBe(false);
        expect(text(result.errors)).toContain('PNG size');
    });

    test('performance phase engages profile validation and rejects a missing profile', () => {
        const report = buildReport();
        report.phase = 'performance';
        report.authorization = 'quiet-window-x';
        report.command =
            'node tools/verify/shaders-holographic-browser.cjs --phase=performance --authorization=quiet-window-x';
        report.cleanup = { proxyClosed: true, serverClosed: true, errors: [] };
        report.engines[0].performance = [{ profile: collector.profiles[0] }, { profile: collector.profiles[1] }];
        const result = collector.validateFiles(report);
        expect(result.ok).toBe(false);
        expect(text(result.errors)).toContain('frozen profile set');
        expect(text(result.errors)).toContain('performance tuple total');
    });

    test('validateFiles is total on structural garbage', () => {
        for (const bad of [null, undefined, {}, [], 'x', { schemaVersion: 'e03-holographic/1', engines: [{}] }]) {
            let result: any;
            expect(() => {
                result = collector.validateFiles(bad);
            }).not.toThrow();
            expect(result.ok).toBe(false);
        }
    });
});
