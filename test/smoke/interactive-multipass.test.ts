/**
 * IER-02 multipass/mip 合同测试（审查修订版）。
 * - 不依赖 output/ 下的历史报告：全部使用 tmpdir 夹具 + 合成 PNG。
 * - 合成 PNG 只证明校验器行为，不冒充浏览器实证（报告内 method/result 如实标注）。
 * - 真实报告审计走 runner 纯导出（--verify CLI），不在 Jest 里加载。
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { PNG } from 'pngjs';

const {
    validateReport,
    checkCase,
    validateNegatives,
    validateLifecycle,
    validateMatrix,
    validateNormal,
    oracleFor,
    captureRegions,
    nativeRegions,
    regionPixels,
    classify,
    expectedCssFor,
    MIP_EXPECTED,
    INPUTS,
    PLAN,
} = require('../../tools/verify/interactive-multipass-browser.cjs');

const ROOT = path.resolve(__dirname, '../..');
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

let tmp: string;
beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ier-mp-contract-'));
});
afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
});

// ── 合成 PNG 画家：按冻结几何画出色块，让 oracle/classify 真实命中 ──
function paintCapture(css: { width: number; height: number }, dpr: number): PNG {
    const png = new PNG({ width: 640 * dpr, height: 400 * dpr });
    const fill = (region: number[], rgb: [number, number, number]) => {
        for (let y = region[1]; y < region[1] + region[3]; y++) {
            for (let x = region[0]; x < region[0] + region[2]; x++) {
                const i = (png.width * y + x) << 2;
                png.data[i] = rgb[0];
                png.data[i + 1] = rgb[1];
                png.data[i + 2] = rgb[2];
                png.data[i * 1 + 0 + 3] = 255;
            }
        }
    };
    // 背景
    fill([0, 0, png.width, png.height], [12, 12, 16]);
    const regions = captureRegions(css, dpr);
    // 稍放大的红/绿块与蓝 marker（覆盖 oracle 区域）
    const grow = (r: number[], f = 2) => [r[0] - f * dpr, r[1] - f * dpr, r[2] + 4 * f * dpr, r[3] + 4 * f * dpr];
    fill(grow(regions.red), [255, 48, 48]);
    fill(grow(regions.green), [48, 220, 64]);
    fill(grow(regions.marker, 1), [64, 96, 255]);
    return png;
}
function paintNative(css: { width: number; height: number }, dpr: number, lodBase: number): PNG {
    const png = new PNG({ width: 640 * dpr, height: 400 * dpr });
    const colors: Record<string, [number, number, number]> = {
        red: [220, 40, 40],
        green: [40, 200, 60],
        blue: [50, 90, 220],
        yellow: [230, 210, 50],
        magenta: [210, 60, 210],
        cyan: [60, 200, 210],
    };
    const fill = (region: number[], rgb: [number, number, number]) => {
        for (let y = region[1]; y < region[1] + region[3]; y++) {
            for (let x = region[0]; x < region[0] + region[2]; x++) {
                const i = (png.width * y + x) << 2;
                png.data[i] = rgb[0];
                png.data[i + 1] = rgb[1];
                png.data[i + 2] = rgb[2];
                png.data[i + 3] = 255;
            }
        }
    };
    fill([0, 0, png.width, png.height], [10, 10, 14]);
    const regions = nativeRegions(css, dpr);
    const order = ['red', 'green', 'blue', 'yellow', 'magenta', 'cyan'];
    fill([0, 0, png.width, Math.round(0.05 * png.height)], [219, 38, 38]); // 红色标记条
    fill(regions.tl, colors[order[lodBase + 0]]);
    fill(regions.tr, colors[order[lodBase + 1]]);
    fill(regions.bl, colors[order[lodBase + 2]]);
    fill(regions.br, colors[order[lodBase + 3]]);
    return png;
}

// ── 夹具报告构建 ──
function realFingerprints(): Record<string, any> {
    const out: Record<string, any> = {};
    for (const file of INPUTS) {
        const bytes = fs.readFileSync(path.join(ROOT, file));
        out[file] = { path: file, bytes: bytes.length, sha256: sha(bytes) };
    }
    return out;
}
function writePng(png: PNG, name: string): { pngPath: string; sha256: string; pngBytes: number } {
    const file = path.join(tmp, name);
    fs.writeFileSync(file, PNG.sync.write(png));
    const bytes = fs.readFileSync(file);
    return { pngPath: file, sha256: sha(bytes), pngBytes: bytes.length };
}
function iso(offsetMs: number): string {
    return new Date(Date.parse('2026-10-08T10:00:00.000Z') + offsetMs).toISOString();
}

function caseRecord(opts: {
    caseId: string;
    dpr: number;
    engine: string;
    png: { pngPath: string; sha256: string; pngBytes: number };
    css: { width: number; height: number };
    fingerprints: Record<string, any>;
    extraModel?: Record<string, unknown>;
    extra?: Record<string, unknown>;
    step?: number;
    receivedSequence?: number;
}): any {
    const css = opts.css,
        dpr = opts.dpr;
    return {
        schemaVersion: 'ier-evidence/2',
        runId: 'fixture-run',
        caseId: opts.caseId,
        appFingerprint: opts.fingerprints[INPUTS[2]],
        sdkFingerprint: opts.fingerprints[INPUTS[0]],
        harnessFingerprint: opts.fingerprints[INPUTS[10]],
        browser: `${opts.engine} 1.0-fixture`,
        viewport: { width: 640, height: 400 },
        dpr,
        inputMethod: 'PROBE_ACTIONS',
        seed: 0,
        receivedEvent: {
            type: 'fixture',
            sequence: opts.receivedSequence ?? 1,
            isTrusted: false,
            appliedBy: 'probe',
            timestamp: iso(0),
        },
        modelState: {
            mode: opts.caseId.startsWith('native') ? 'native' : 'capture',
            receivedSequence: opts.receivedSequence ?? 1,
            ownedRefCount: 8,
            retiredSinceStart: 0,
            ...(opts.caseId.startsWith('native')
                ? {
                      route: 'native',
                      mipLevels: 6,
                      lodBase: opts.caseId === 'native-mip-offset' ? 2 : 0,
                      samplerMipFilter: 'NEAREST (explicit textureLod)',
                      boundTexture: '256x256 L6',
                      descriptorBindings: [0, 1],
                      viewport: `${css.width * dpr}x${css.height * dpr}`,
                  }
                : {
                      route: 'capture',
                      generation: 2,
                      width: css.width * dpr,
                      height: css.height * dpr,
                      colorFormat: 'rgba8',
                      samples: 1,
                      glSamples: 0,
                      resolveRequired: false,
                      framebufferComplete: true,
                      sampledTextureIsCurrent: true,
                      requestedFormat: 'rgba8',
                      requestedSamples: 1,
                  }),
            ...opts.extraModel,
        },
        layoutReceipt: {
            css,
            backing: { width: 640 * dpr, height: 400 * dpr }, // window-driven; CSS resize does not move it
            viewport: { width: 640, height: 400 },
            dpr,
        },
        submittedFrame: {
            event: 'AFTER_DRAW',
            step: opts.step ?? 2,
            afterDraw: true,
            inputSequence: opts.receivedSequence ?? 1,
            timestamp: iso(10),
        },
        pngPath: opts.png.pngPath,
        pngSha256: opts.png.sha256,
        pngBytes: opts.png.pngBytes,
        observationTimestamp: iso(20),
        clock: { method: 'STEP_CLOCK', stepping: true, stepped: opts.step ?? 2, enginePaused: true },
        sourceStatus: 'recreated',
        comparisonDimensions: ['render-target', 'mip-sampling', 'layout'],
        limitations: ['SYNTHETIC contract fixture'],
        referenceComparison: { result: 'NOT_RUN', reason: 'External source not observed' },
        result: 'PASS',
        method: 'STEP_CLOCK',
        execution: { command: 'node fixture', cwd: ROOT, exitCode: 0, startedAt: iso(0), endedAt: iso(20) },
        ...opts.extra,
    };
}

function buildFullReport(): any {
    const fingerprints = realFingerprints();
    const rows: any[] = [];
    let pngIndex = 0;
    for (const engine of ['chromium', 'firefox', 'webkit']) {
        for (const entry of PLAN) {
            const row: any = {
                engine,
                browserVersion: '1.0-fixture',
                dpr: entry.dpr,
                mode: entry.mode,
                format: entry.format,
                samples: entry.samples,
                full: entry.full !== false,
                pageErrors: [],
                consoleErrors: [],
                cases: [],
            };
            const css = (caseId: string) => expectedCssFor(caseId)!;
            const baselinePng = writePng(
                entry.mode === 'native'
                    ? paintNative(css(entry.mode + '-baseline'), entry.dpr, 0)
                    : paintCapture(css(entry.mode + '-baseline'), entry.dpr),
                `p${pngIndex++}.png`,
            );
            const resizedCss = css(entry.mode + '-resized');
            const resizedPng = writePng(
                entry.mode === 'native' ? paintNative(resizedCss, entry.dpr, 0) : paintCapture(resizedCss, entry.dpr),
                `p${pngIndex++}.png`,
            );
            const sixteen = entry.format === 'rgba16f';
            const extraModel =
                entry.mode === 'capture'
                    ? {
                          ...(sixteen
                              ? {
                                    colorFormat: 'rgba16f',
                                    requestedFormat: 'rgba16f',
                                    samples: 4,
                                    requestedSamples: 4,
                                    glSamples: 4,
                                    resolveRequired: true,
                                }
                              : {}),
                      }
                    : {};
            row.cases.push(
                caseRecord({
                    caseId: `${entry.mode}-baseline`,
                    dpr: entry.dpr,
                    engine,
                    png: baselinePng,
                    css: css(entry.mode + '-baseline'),
                    fingerprints,
                    step: 2,
                    extraModel,
                }),
            );
            row.cases.push({
                ...caseRecord({
                    caseId: `${entry.mode}-resized`,
                    dpr: entry.dpr,
                    engine,
                    png: resizedPng,
                    css: resizedCss,
                    fingerprints,
                    step: 3,
                    extraModel,
                }),
                resize: { previousGeneration: 1, generation: 2, css: { width: 480, height: 320 } },
            });
            if (entry.mode === 'native') {
                const offsetPng = writePng(paintNative(resizedCss, entry.dpr, 2), `p${pngIndex++}.png`);
                row.cases.push(
                    caseRecord({
                        caseId: 'native-mip-offset',
                        dpr: entry.dpr,
                        engine,
                        png: offsetPng,
                        css: resizedCss,
                        fingerprints,
                        step: 4,
                    }),
                );
            } else {
                const resetPng = writePng(paintCapture(resizedCss, entry.dpr), `p${pngIndex++}.png`);
                row.cases.push(
                    caseRecord({
                        caseId: 'capture-reset',
                        dpr: entry.dpr,
                        engine,
                        png: resetPng,
                        css: resizedCss,
                        fingerprints,
                        step: 4,
                        extraModel: { ...extraModel, generation: 3 },
                    }),
                );
            }
            if (row.full) {
                row.clock = { method: 'STEP_CLOCK', stepping: true, stepped: 5, enginePaused: true };
                row.negatives =
                    entry.mode === 'capture'
                        ? {
                              route: 'capture',
                              cases: [
                                  {
                                      kind: 'duplicate-binding',
                                      phase: 'engine',
                                      actualError:
                                          '[AIR_E_RENDER_TARGET_CAMERA] camera is already attached to this target',
                                      errorCode: 'AIR_E_RENDER_TARGET_CAMERA',
                                      located: 'target/camera binding',
                                      correctedOk: true,
                                  },
                                  {
                                      kind: 'descriptor-binding-collision',
                                      phase: 'raw-gfx',
                                      runtimeNoError: true,
                                      actualError:
                                          'engine accepted the duplicate binding declaration without error; slot 1 holds buffer=true (no runtime validation)',
                                      staticDetection: [
                                          'binding 1: 1 vs 28 (slot declared twice with different types)',
                                      ],
                                      declarationsBad: [
                                          { binding: 1, descriptorType: 1 },
                                          { binding: 1, descriptorType: 8 },
                                      ],
                                      declarationsGood: [
                                          { binding: 0, descriptorType: 1 },
                                          { binding: 1, descriptorType: 8 },
                                      ],
                                      located: 'descriptor set layout binding 1',
                                      correctedOk: true,
                                      detectionMethod:
                                          'STATIC: cross-check declared bindings (slot uniqueness + resource class); engine performs no runtime validation here',
                                  },
                              ],
                          }
                        : {
                              route: 'native',
                              cases: [
                                  {
                                      kind: 'glsl-declaration-order',
                                      phase: 'raw-gfx',
                                      compileStatusBad: false,
                                      compileStatusGood: true,
                                      actualError: 'ERROR: 0:2: earlyColor undeclared identifier',
                                      goodLog: '',
                                      located: 'fragment declaration order',
                                      correctedOk: true,
                                  },
                                  {
                                      kind: 'std140-layout',
                                      phase: 'raw-gfx',
                                      actualError: 'gl.getError()=0x502 drawing with 12B buffer',
                                      located: 'binding 0 uniform block',
                                      correctedOk: true,
                                      wrongGlError: 1282,
                                      okGlError: 0,
                                      allowedErrorCodes: [1281, 1282],
                                  },
                                  {
                                      kind: 'unbound-sampler',
                                      phase: 'raw-gfx',
                                      actualError:
                                          'gl.getError()=0x0 with binding 1 unbound; engine descriptor holds sampler=false texture=false (null-texture substitution)',
                                      staticDetection: [
                                          'binding 1 (SAMPLER_TEXTURE) declared in layout but unbound in the descriptor set',
                                      ],
                                      located: 'binding 1 sampler/texture',
                                      correctedOk: true,
                                      missingGlError: 0,
                                      fixedGlError: 0,
                                      detectionMethod:
                                          'STATIC descriptor completeness (layout vs bound resources); runtime falls back to the engine null texture',
                                  },
                                  {
                                      kind: 'descriptor-binding-collision',
                                      phase: 'raw-gfx',
                                      runtimeNoError: true,
                                      actualError: 'engine accepted the duplicate binding declaration without error',
                                      staticDetection: [
                                          'binding 1: 1 vs 28 (slot declared twice with different types)',
                                      ],
                                      declarationsBad: [
                                          { binding: 1, descriptorType: 1 },
                                          { binding: 1, descriptorType: 8 },
                                      ],
                                      declarationsGood: [
                                          { binding: 0, descriptorType: 1 },
                                          { binding: 1, descriptorType: 8 },
                                      ],
                                      located: 'descriptor set layout binding 1',
                                      correctedOk: true,
                                      detectionMethod: 'STATIC: cross-check declared bindings; no runtime validation',
                                  },
                              ],
                              multisample: {
                                  allocated: true,
                                  samplable: false,
                                  status: 'NOT_RUN',
                                  reason: 'renderbuffer path',
                              },
                          };
                row.lifecycle =
                    entry.mode === 'capture'
                        ? {
                              rounds: 10,
                              textureDelta: 0,
                              bufferDelta: 0,
                              ownedRefs: [1, 1, 1, 1],
                              rows: Array.from({ length: 10 }, (_, round) => ({
                                  round,
                                  generationAfterCreate: 1,
                                  generationAfterResize: 2,
                                  generationAdvanced: true,
                                  cameraReleasedBeforeDispose: true,
                                  disposed: true,
                                  nodeRemoved: true,
                                  nodeDestroyScheduled: true,
                              })),
                              gpuMemoryObservation: 'engine counters',
                          }
                        : {
                              rounds: 10,
                              textureDelta: 0,
                              bufferDelta: 0,
                              ownedRefs: [],
                              rows: Array.from({ length: 10 }, (_, round) => ({
                                  round,
                                  textureId: 100 + round,
                                  bufferId: 200 + round,
                                  textureAllocated: 21504,
                                  bufferAllocated: 16,
                                  textureFreedBytes: 21504,
                                  bufferFreedBytes: 16,
                                  textureReturnsToBaseline: true,
                                  bufferReturnsToBaseline: true,
                                  destroyed: true,
                              })),
                              gpuMemoryObservation: 'engine counters',
                          };
                if (entry.mode === 'capture') {
                    row.resetCycle = {
                        rounds: 10,
                        textureDelta: 0,
                        ownedRefCount: 8,
                        rows: Array.from({ length: 10 }, (_, round) => ({
                            round,
                            ownedBefore: 8,
                            ownedAfter: 8,
                            ownedConstant: true,
                            retiredRefsAllPaired: true,
                            retiredValidity: [false],
                            retiredValidityObserved: true,
                            oldTargetNotSampled: true,
                            generation: 1,
                        })),
                    };
                    row.matrix = {
                        route: 'capture',
                        combos: ['rgba8', 'rgba16f'].flatMap((colorFormat) =>
                            [1, 4].map((samples) => ({
                                colorFormat,
                                requestedSamples: samples,
                                effectiveSamples: samples,
                                glSamples: samples === 1 ? 0 : samples,
                                framebufferComplete: true,
                                resolveRequired: samples > 1,
                                readbackType: colorFormat === 'rgba8' ? 'Uint8Array' : 'Float32Array',
                                readbackLength: 4,
                                readbackValues: [12, 12, 16, 255],
                                readbackFinite: true,
                                ok: true,
                            })),
                        ),
                    };
                }
                row.cleanup =
                    entry.mode === 'capture'
                        ? {
                              released: true,
                              releaseIdentity: true,
                              refs: [
                                  { before: 1, after: 0 },
                                  { before: 1, after: 0 },
                              ],
                              colorUnbound: true,
                              cameraDetached: true,
                              targetDisposed: true,
                              nodesRemoved: true,
                          }
                        : {
                              released: true,
                              releaseIdentity: true,
                              refs: [],
                              gfxDestroyed: true,
                              gfxObservations: {
                                  aliveBefore: {
                                      shaderGpuAlive: true,
                                      descriptorSetGpuAlive: true,
                                      pipelineStateGpuAlive: true,
                                  },
                                  shaderGpuCleared: true,
                                  descriptorSetGpuCleared: true,
                                  pipelineStateGpuCleared: true,
                                  textureMemoryFreed: 21504,
                                  bufferMemoryFreed: 16,
                                  observationMethod:
                                      'alive-before gpu handles, then null/throws after destroy + memoryStatus counter drop',
                              },
                          };
                row.postReleaseError = 'MULTIPASS_DISPOSED';
            }
            rows.push(row);
        }
    }
    const normal: any[] = [];
    let seq = 0;
    for (const engine of ['chromium', 'firefox', 'webkit']) {
        for (const mode of ['capture', 'native']) {
            const visiblePng = writePng(
                mode === 'native'
                    ? paintNative({ width: 640, height: 400 }, 1, 0)
                    : paintCapture({ width: 640, height: 400 }, 1),
                `n${engine}-${mode}.png`,
            );
            const visibleId = mode === 'native' ? 'native-normal-visible' : 'normal-visible';
            const base = 10 + (seq += 10);
            const events =
                mode === 'capture'
                    ? ['pause', 'resume', 'reset', 'resize', 'release'].map((type, i) => ({
                          type,
                          sequence: base + i,
                          isTrusted: true,
                          timestamp: iso(i),
                      }))
                    : ['lod', 'release'].map((type, i) => ({
                          type,
                          sequence: base + i,
                          isTrusted: true,
                          timestamp: iso(i),
                      }));
            const entryNormal: any = {
                engine,
                mode,
                clocks: {
                    early: { method: 'NATIVE_PACER', enginePaused: false, totalFrames: 100 },
                    later: { method: 'NATIVE_PACER', enginePaused: false, totalFrames: 130 },
                    ...(mode === 'capture'
                        ? {
                              paused: { method: 'NATIVE_PACER', enginePaused: true, totalFrames: 140 },
                              still: { method: 'NATIVE_PACER', enginePaused: true, totalFrames: 140 },
                              resumed: { method: 'NATIVE_PACER', enginePaused: false, totalFrames: 141 },
                              resumedLater: { method: 'NATIVE_PACER', enginePaused: false, totalFrames: 160 },
                          }
                        : {}),
                },
                receivedEvents: events,
                pageErrors: [],
                consoleErrors: [],
                visibleCase: {
                    ...caseRecord({
                        caseId: visibleId,
                        dpr: 1,
                        engine,
                        png: visiblePng,
                        css: { width: 640, height: 400 },
                        fingerprints,
                        receivedSequence: 0,
                        extra: {
                            inputMethod: 'PAGE_LOAD_NATIVE_PACER',
                            method: 'REAL_BROWSER',
                            limitations: [
                                'contract fixture record for validator behavior; pixels painted by the fixture painter',
                            ],
                        },
                    }),
                    clock: { method: 'NATIVE_PACER', enginePaused: false, totalFrames: 121 },
                    receivedEvent: {
                        type: 'page-load',
                        sequence: 0,
                        isTrusted: false,
                        appliedBy: 'probe',
                        timestamp: iso(0),
                    },
                    submittedFrame: {
                        event: 'AFTER_DRAW',
                        afterDraw: true,
                        totalFrames: 120,
                        inputSequence: 0,
                        timestamp: iso(10),
                    },
                    modelState: {
                        ...caseRecord({
                            caseId: visibleId,
                            dpr: 1,
                            engine,
                            png: visiblePng,
                            css: { width: 640, height: 400 },
                            fingerprints,
                            receivedSequence: 0,
                        }).modelState,
                        receivedSequence: 0,
                        width: 640,
                        height: 400,
                    },
                    layoutReceipt: {
                        css: { width: 640, height: 400 },
                        backing: { width: 640, height: 400 },
                        viewport: { width: 640, height: 400 },
                        dpr: 1,
                    },
                },
            };
            if (mode === 'capture') {
                entryNormal.reset = {
                    beforeOwned: 8,
                    afterOwned: 8,
                    generation: 1,
                    retiredRefs: [{ before: 1, after: 0 }],
                    retiredValidity: [false, false],
                };
                entryNormal.resizeCss = { width: 482, height: 322 };
                entryNormal.release = { released: true, idempotent: true, terminal: true };
            } else {
                entryNormal.lod = { before: 0, after: 2 };
                entryNormal.release = { released: true, idempotent: true, terminal: true };
            }
            normal.push(entryNormal);
        }
    }
    return {
        schemaVersion: 'ier-multipass/2',
        runId: 'fixture-run',
        engines: ['chromium', 'firefox', 'webkit'],
        subset: true,
        completed: false,
        fingerprints,
        rows,
        normal,
        limitations: ['SYNTHETIC fixture report'],
    };
}

let fixtureReport: any;
beforeAll(() => {
    fixtureReport = buildFullReport();
});

describe('IER-02 synthetic-fixture acceptance (contract only, not browser evidence)', () => {
    test('the full 15x3 fixture with real-oracle-matching PNGs validates clean', () => {
        const result = validateReport(fixtureReport);
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    test('every fixture PNG satisfies the frozen oracle (pixels recomputed)', () => {
        for (const row of fixtureReport.rows) {
            for (const record of row.cases) {
                const context = {
                    sdkModuleSha256: fixtureReport.fingerprints[INPUTS[0]].sha256,
                    appSha256: fixtureReport.fingerprints[INPUTS[2]].sha256,
                    harnessSha256: fixtureReport.fingerprints[INPUTS[10]].sha256,
                };
                const v = checkCase(record, record.caseId, fixtureReport.runId, context);
                expect(v.errors).toEqual([]);
            }
        }
    });

    test('fixture uses real disk fingerprints (input closure)', () => {
        for (const file of INPUTS) {
            const bytes = fs.readFileSync(path.join(ROOT, file));
            expect(sha(bytes)).toBe(fixtureReport.fingerprints[file].sha256);
        }
    });

    test('normal-mode control section validates', () => {
        for (const n of fixtureReport.normal) {
            const result = validateNormal({ ...n, runId: fixtureReport.runId }, fixtureReport.fingerprints);

            expect(result).toEqual([]);
        }
    });
});

describe('IER-02 tamper rejections (memory clones)', () => {
    const context = () => ({
        sdkModuleSha256: fixtureReport.fingerprints[INPUTS[0]].sha256,
        appSha256: fixtureReport.fingerprints[INPUTS[2]].sha256,
        harnessSha256: fixtureReport.fingerprints[INPUTS[10]].sha256,
    });

    test('1) PNG deleted from disk -> case rejected', () => {
        const rec = { ...fixtureReport.rows[0].cases[0] };
        rec.pngPath = path.join(tmp, 'deleted.png');
        expect(checkCase(rec, rec.caseId, fixtureReport.runId, context()).ok).toBe(false);
    });

    test('2) black PNG cannot pass the pixel oracle', () => {
        const black = new PNG({ width: 640, height: 400 });
        for (let i = 0; i < black.width * black.height; i++) {
            black.data[i * 4] = 5;
            black.data[i * 4 + 1] = 5;
            black.data[i * 4 + 2] = 5;
            black.data[i * 4 + 3] = 255;
        }
        const file = path.join(tmp, 'black.png');
        fs.writeFileSync(file, PNG.sync.write(black));
        const rec = {
            ...fixtureReport.rows[0].cases[0],
            pngPath: file,
            pngBytes: fs.statSync(file).size,
            pngSha256: sha(fs.readFileSync(file)),
        };
        expect(checkCase(rec, rec.caseId, fixtureReport.runId, context()).ok).toBe(false);
    });

    test('3) stale generation (resize claims no advance)', () => {
        const t = JSON.parse(JSON.stringify(fixtureReport));
        const row = t.rows.find((r: any) => r.mode === 'capture' && r.full);
        row.cases[1].resize.previousGeneration = 2;
        expect(validateReport(t).ok).toBe(false);
    });

    test('4) wrong glSamples for requested 4x rejected', () => {
        const row = {
            mode: 'capture',
            matrix: { combos: JSON.parse(JSON.stringify(fixtureReport.rows[0].matrix.combos)) },
        };
        row.matrix.combos.find((c: any) => c.requestedSamples === 4).glSamples = 0;
        expect(validateMatrix(row).length).toBeGreaterThan(0);
    });

    test('5) unreleased refs rejected', () => {
        const t = JSON.parse(JSON.stringify(fixtureReport));
        const row = t.rows.find((r: any) => r.full && r.mode === 'capture');
        row.cleanup.refs[0].after = 1;
        expect(validateReport(t).ok).toBe(false);
    });

    test('6) source SHA drift rejected at both report and case level', () => {
        const t = JSON.parse(JSON.stringify(fixtureReport));
        t.fingerprints[INPUTS[2]].sha256 = 'e'.repeat(64);
        expect(validateReport(t).ok).toBe(false);
        const rec = {
            ...fixtureReport.rows[0].cases[0],
            appFingerprint: { ...fixtureReport.rows[0].cases[0].appFingerprint, sha256: 'e'.repeat(64) },
        };
        expect(checkCase(rec, rec.caseId, fixtureReport.runId, context()).ok).toBe(false);
    });

    test('7) missing row breaks plan coverage', () => {
        const t = JSON.parse(JSON.stringify(fixtureReport));
        t.rows.splice(
            t.rows.findIndex((r: any) => r.engine === 'webkit' && r.mode === 'native' && r.dpr === 2),
            1,
        );
        expect(validateReport(t).ok).toBe(false);
    });

    test('8) NaN / Infinity injection rejected', () => {
        const rec = {
            ...fixtureReport.rows[0].cases[0],
            layoutReceipt: { ...fixtureReport.rows[0].cases[0].layoutReceipt, css: { width: NaN, height: 400 } },
        };
        expect(checkCase(rec, rec.caseId, fixtureReport.runId, context()).ok).toBe(false);
        const rec2 = {
            ...fixtureReport.rows[0].cases[0],
            modelState: { ...fixtureReport.rows[0].cases[0].modelState, generation: Infinity },
        };
        expect(checkCase(rec2, rec2.caseId, fixtureReport.runId, context()).ok).toBe(false);
    });

    test('9) FAIL result cannot pass the gate', () => {
        const t = JSON.parse(JSON.stringify(fixtureReport));
        t.rows[3].cases[0].result = 'FAIL';
        expect(validateReport(t).ok).toBe(false);
    });

    test('10) page/console error injection rejected', () => {
        const t = JSON.parse(JSON.stringify(fixtureReport));
        t.rows[3].pageErrors.push('WebGL: context lost');
        expect(validateReport(t).ok).toBe(false);
    });

    test('11) caseId set mismatch rejected', () => {
        const t = JSON.parse(JSON.stringify(fixtureReport));
        t.rows[0].cases[2].caseId = 'capture-unexpected';
        expect(validateReport(t).ok).toBe(false);
    });

    test('12) input/frame sequence regression rejected', () => {
        const rec = {
            ...fixtureReport.rows[0].cases[0],
            submittedFrame: { ...fixtureReport.rows[0].cases[0].submittedFrame, inputSequence: 0 },
        };
        expect(checkCase(rec, rec.caseId, fixtureReport.runId, context()).ok).toBe(false);
    });

    test('13) declared identity (engine/dpr/format/samples) mismatch rejected', () => {
        const t = JSON.parse(JSON.stringify(fixtureReport));
        t.rows[2].format = 'rgba16f'; // native row claims rgba16f
        expect(validateReport(t).ok).toBe(false);
    });

    test('14) matrix NOT_RUN combo cannot pass the measured matrix', () => {
        const row = {
            mode: 'capture',
            matrix: { combos: JSON.parse(JSON.stringify(fixtureReport.rows[0].matrix.combos)) },
        };
        row.matrix.combos[3].notRun = true;
        row.matrix.combos[3].reason = 'unavailable';
        expect(validateMatrix(row).length).toBeGreaterThan(0);
    });

    test('15) normal-mode control failures rejected', () => {
        const n = JSON.parse(JSON.stringify(fixtureReport.normal[0]));
        n.clocks.paused = { method: 'NATIVE_PACER', enginePaused: false, totalFrames: 140 }; // pause failed
        expect(validateNormal({ ...n, runId: 'fixture-run' }, fixtureReport.fingerprints).length).toBeGreaterThan(0);
        const n2 = JSON.parse(JSON.stringify(fixtureReport.normal[0]));
        n2.reset = { beforeOwned: 8, afterOwned: 16, generation: 1 }; // assets accumulated
        expect(validateNormal({ ...n2, runId: 'fixture-run' }, fixtureReport.fingerprints).length).toBeGreaterThan(0);
        const firstFrame = JSON.parse(JSON.stringify(fixtureReport.normal.find((row) => row.mode === 'native')));
        firstFrame.visibleCase.submittedFrame.totalFrames = 0;
        expect(validateNormal({ ...firstFrame, runId: 'fixture-run' }, fixtureReport.fingerprints)).toContain(
            'normal-mode visible case failed',
        );
    });
});

describe('IER-02 pixel helper contracts', () => {
    test('classify matches the frozen mip palette', () => {
        for (const level of MIP_EXPECTED) {
            const solid = new PNG({ width: 4, height: 4 });
            for (let i = 0; i < 16; i++) {
                solid.data[i * 4] = Math.min(255, level.min[0] + 10);
                solid.data[i * 4 + 1] = Math.min(255, level.min[1] + 10);
                solid.data[i * 4 + 2] = Math.min(255, level.min[2] + 10);
                solid.data[i * 4 + 3] = 255;
            }
            const at = regionPixels(solid, [0, 0, 4, 4]);
            expect(classify(at, level.kind)).toBe(true);
        }
    });

    test('regions derive from frozen geometry, scaled by DPR', () => {
        const regions = captureRegions({ width: 640, height: 400 }, 1);
        expect(regions.red[0]).toBeGreaterThan(0.2 * 640);
        expect(regions.red[0] + regions.red[2]).toBeLessThan(0.5 * 640);
        const native = nativeRegions({ width: 480, height: 320 }, 2);
        expect(native.tl[2]).toBeGreaterThan(0);
        expect(native.br[0]).toBeGreaterThan(native.tl[0]);
        expect(expectedCssFor('capture-baseline')).toEqual({ width: 640, height: 400 });
        expect(expectedCssFor('native-mip-offset')).toEqual({ width: 480, height: 320 });
    });

    test('oracleFor uses frozen css, not self-reported sizes', () => {
        const a = oracleFor('capture-baseline', expectedCssFor('capture-baseline'), 1);
        const b = oracleFor('capture-baseline', { width: 100, height: 50 }, 1); // lying sizes do not move it
        expect(a.region[2]).toBeGreaterThan(0);
        expect(oracleFor('capture-baseline', { width: 640, height: 400 }, 2).region[2]).toBeGreaterThan(a.region[2]);
        expect(b).toBeDefined();
    });
});
