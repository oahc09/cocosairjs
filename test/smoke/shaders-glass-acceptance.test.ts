/**
 * E09 collector acceptance (NODE_CONTRACT). Builds one complete synthetic functional report from
 * tmpdir PNGs + oracle math and drives the PRODUCTION validateFiles to a genuine PASS, then
 * applies one tamper per case and requires the specific rejection family. No browser was
 * launched and no output/ artifact is read.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

const collector = require('../../tools/verify/shaders-glass-browser.cjs');
const oracle = require('../../tools/verify/shaders-glass-oracle.cjs');
const ROOT = path.resolve(__dirname, '../..');
const defaults = oracle.defaults();
const CAPTURE_TIME = collector.CAPTURE_TIME;
const KINDS = [...oracle.OWNED_KINDS];
let tmp: string;
beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glass-e05-acceptance-'));
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
    const background = presentation.background || [10, 12, 16],
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
                rgba: value.straightLinear.map((x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255)),
            };
        }),
        gpuReceipt: {
            frame: frame - 1,
            time,
            canvas: { width, height },
            targetRGBA8: true,
            transparentClear: true,
            childStillAttached: true,
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
        childTarget: { width: 256, height: 256, attached: true },
        background: extra.background ?? [10, 12, 16],
        linearDiagnostic: false,
        gpuReceipt: extra.gpuReceipt ?? { frame: 9, time: extra.time ?? CAPTURE_TIME, background: [10, 12, 16] },
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
        childRendererUnbound: true,
        childNodeRemoved: true,
        childTargetDetached: true,
        childTargetDisposed: true,
        refs: KINDS.map((kind: string) => ({ kind, before: 1, after: 0 })),
    };
}
function resourceFixture(): any {
    return {
        rows: Array.from({ length: 100 }, (_, index) => ({
            index,
            id: index + 1,
            before: { bufferSize: 100, textureSize: 50 },
            created: { bufferSize: 640, textureSize: 262208 },
            after: { bufferSize: 100, textureSize: 50 },
            refsBefore: [1, 1, 1, 1, 1, 1],
            trace: retirementFixture(index + 1),
            repeat: { idempotent: true },
            nodeValid: false,
            childNodeValid: false,
            assetsValid: [false, false, false, false, false, false],
            childTargetDisposedAfterRetire: true,
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
            shapeChanged = collector.variantKey(params) !== collector.variantKey(previousParams),
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
            after: snapshot(
                afterParams,
                valid && collector.variantKey(afterParams) !== collector.variantKey(defaults) ? 8 : 7,
                { width: 640, height: 400 },
                1,
                { updates: 10 + index + (valid ? 1 : 0) },
            ),
            receipt: valid
                ? {
                      ok: true,
                      errors: [],
                      retirement:
                          collector.variantKey(afterParams) !== collector.variantKey(defaults)
                              ? retirementFixture(7)
                              : null,
                  }
                : { ok: false, errors: [{ code: 'GLASS_PARAMETER_TYPE', parameter: row.parameter }] },
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
            after: snapshot({ ...defaults, refraction: 1.01 }, 7, { width: 640, height: 400 }, 1),
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
            { type: 'parameter:refraction', isTrusted: true, frame: 3 },
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
    const resizePngFile = syntheticPng(480, 320, defaults, CAPTURE_TIME, { background: [10, 12, 16] });
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
        terminalCode: 'GLASS_DISPOSED',
        release: { sceneCleared: true, listenerAdds: 3, listenerRemoves: 3 },
    };
    const buildLog = path.join(tmp, 'build.log');
    fs.writeFileSync(buildLog, 'command=node tsc\nexitCode=0\n');
    const identitySnapshot = collector.currentIdentity();
    return {
        schemaVersion: 'e09-glass/1',
        phase: 'functional',
        requestedEngines: ['chromium'],
        startedAt: '2026-10-11T10:00:00.000Z',
        endedAt: '2026-10-11T10:01:00.000Z',
        command: 'node tools/verify/shaders-glass-browser.cjs --phase=functional --browser=chromium --out=x.json',
        cwd: ROOT,
        identity: identitySnapshot,
        inputs: identitySnapshot.inputs,
        reference: identitySnapshot.reference,
        build: { command: 'node tsc', exitCode: 0, bundleBytes: 62000, raw: identity(buildLog) },
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

describe('E09 collector acceptance (NODE_CONTRACT, production validator, synthetic report)', () => {
    test('complete synthetic functional report passes the production validator', () => {
        const result = collector.validateFiles(buildReport());
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    test.each([
        ['dpr tamper', (r: any) => (r.engines[0].captures[0].dpr = 99), 'tuple'],
        ['duplicate capture', (r: any) => (r.engines[0].captures[1] = clone(r).engines[0].captures[0]), 'tuple'],
        ['missing capture', (r: any) => r.engines[0].captures.pop(), 'tuple count'],
        ['params tamper', (r: any) => (r.engines[0].captures[3].params.refraction = 0.123), 'params not frozen'],
        [
            'snapshot backing',
            (r: any) => (r.engines[0].captures[0].snapshot.canvas = { width: 320, height: 200 }),
            'snapshot backing',
        ],
        [
            'child target detached',
            (r: any) => (r.engines[0].captures[0].snapshot.childTarget.attached = false),
            'child target not attached',
        ],
        ['build exit 1', (r: any) => (r.build.exitCode = 1), 'build exitCode'],
        ['cleanup server open', (r: any) => (r.cleanup.serverClosed = false), 'server not closed'],
        ['agent gate pass', (r: any) => (r.agentGate = 'PASS'), 'agentGate'],
        ['page error', (r: any) => r.engines[0].pageErrors.push('boom'), 'runtime errors'],
        ['dpr2 page open', (r: any) => (r.engines[0].dpr2PageClosed = false), 'dpr2 page not closed'],
        [
            'shape no rebuild',
            (r: any) => (r.engines[0].captures[1].snapshot.instance = 1),
            'shape switch did not rebuild',
        ],
        [
            'shape receipt missing',
            (r: any) => (r.engines[0].captures[1].set.receipt.retirement = null),
            'without rebuild receipt',
        ],
        [
            'set observation chain',
            (r: any) => (r.engines[0].captures[4].set.before.params.shape = 'rounded-box'),
            'before params chain',
        ],
        [
            'boundary partial application',
            (r: any) =>
                (r.engines[0].boundaries.find((b: any) => b.boundary === 'invalid').after.params.refraction = 0.5),
            'partial parameter application',
        ],
        [
            'boundary uniform rebuild',
            (r: any) => (r.engines[0].boundaries.find((b: any) => b.boundary === 'max').after.instance = 42),
            'must not rebuild',
        ],
        ['invalid dropped', (r: any) => r.engines[0].invalids.pop(), 'invalid case count'],
        [
            'invalid wrong code',
            (r: any) => (r.engines[0].invalids[0].receipt = { ok: false, errors: [{ code: 'OTHER', parameter: 'x' }] }),
            'error code',
        ],
        ['untrusted release', (r: any) => (r.engines[0].normal.events[4].isTrusted = false), 'untrusted release'],
        ['event order', (r: any) => r.engines[0].normal.events.reverse(), 'event order'],
        [
            'release child leak',
            (r: any) => (r.engines[0].normal.release.retirement.childTargetDisposed = false),
            'owned release',
        ],
        [
            'recreate same instance',
            (r: any) => (r.engines[0].lifecycle.recreated.snapshot.instance = 7),
            'not distinct',
        ],
        ['resize dims', (r: any) => (r.engines[0].resize.after.canvas = { width: 640, height: 400 }), 'resize result'],
        [
            'resize background-light pollution',
            (r: any) => {
                r.engines[0].resize.before.background = [180, 160, 140];
                r.engines[0].resize.after.background = [180, 160, 140];
            },
            'resize before background',
        ],
        [
            'resize receipt background mismatch',
            (r: any) => (r.engines[0].resize.after.gpuReceipt.background = [180, 160, 140]),
            'resize after gpuReceipt background',
        ],
        [
            'resize linear diagnostic',
            (r: any) => (r.engines[0].resize.before.linearDiagnostic = true),
            'resize before linearDiagnostic',
        ],
        [
            'resize params polluted',
            (r: any) => (r.engines[0].resize.before.params.refraction = 0.5),
            'resize before params not defaults',
        ],
        [
            'lifecycle child detach missing',
            (r: any) => (r.engines[0].lifecycle.recreated.trace.childTargetDetached = false),
            'recreate retirement',
        ],
        [
            'release child detach false',
            (r: any) => (r.engines[0].normal.release.retirement.childTargetDetached = false),
            'owned release',
        ],
        ['resource refs missing', (r: any) => r.engines[0].resources.rows[2].trace.refs.pop(), 'refs-shape'],
        [
            'resource dup kind',
            (r: any) =>
                (r.engines[0].resources.rows[2].trace.refs = KINDS.map(() => ({ kind: 'mesh', before: 1, after: 0 }))),
            'refs-kinds',
        ],
        ['resource texture leak', (r: any) => (r.engines[0].resources.rows[3].after.textureSize += 8), 'memory-3'],
        ['resource count', (r: any) => r.engines[0].resources.rows.pop(), 'cycles'],
        [
            'fake scope with error',
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
        ['engine null', (r: any) => (r.engines[0] = null), 'engine entry object'],
        ['probe frame missing', (r: any) => delete r.engines[0].captures[0].probe.frame, 'probe frame'],
        [
            'probe negative frame',
            (r: any) => {
                r.engines[0].captures[0].probe.frame = -1;
                r.engines[0].captures[0].probe.gpuReceipt.frame = -2;
            },
            'GPU receipt frame/time type',
        ],
        [
            'probe child detached',
            (r: any) => (r.engines[0].captures[0].probe.gpuReceipt.childStillAttached = false),
            'GPU receipt flags',
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

    test('rejects PNG removal and probe pixel tamper', () => {
        const report = buildReport();
        fs.rmSync(report.engines[0].captures[0].png.path);
        expect(collector.validateFiles(report).ok).toBe(false);
        const second = buildReport();
        // Tamper a point whose child alpha is a known non-zero value (opaque anchor side).
        second.engines[0].captures[0].probe.pixels[1].rgba = [0, 0, 0, 3];
        expect(collector.validateFiles(second).ok).toBe(false);
    });

    test('performance phase engages two-pass profile validation', () => {
        const report = buildReport();
        report.phase = 'performance';
        report.authorization = 'quiet-window-x';
        report.command =
            'node tools/verify/shaders-glass-browser.cjs --phase=performance --authorization=quiet-window-x';
        report.cleanup = { proxyClosed: true, serverClosed: true, errors: [] };
        report.engines[0].performance = [{ profile: collector.profiles[0] }];
        const result = collector.validateFiles(report);
        expect(result.ok).toBe(false);
        expect(text(result.errors)).toContain('frozen profile set');
        expect(text(result.errors)).toContain('performance tuple total');
    });

    test('validateFiles is total on structural garbage', () => {
        for (const bad of [null, undefined, {}, [], 'x', { schemaVersion: 'e09-glass/1', engines: [{}] }]) {
            let result: any;
            expect(() => {
                result = collector.validateFiles(bad);
            }).not.toThrow();
            expect(result.ok).toBe(false);
        }
    });
});
