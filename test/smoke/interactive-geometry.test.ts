/**
 * IER-04 geometry contract tests. Temp fixtures + synthetic PNGs only — no output/ report
 * dependency, never a browser claim. Real-report audit runs through the collector's
 * pure exports (--verify CLI).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { PNG } from 'pngjs';

const {
    checkCase, validateReport, validateNormals, cutOracle, planFor, GESTURE, GESTURE_RESIZED,
    CUT_ERROR_BUDGET, BLADE_ERROR_BUDGET, INPUTS,
} = require('../../tools/verify/interactive-geometry-browser.cjs');
// pure geometry-contract module (compiled by ts-jest via babel? no — use the runner copy):
// import the pure functions through a tiny esbuild-free transpile: replicate key invariants here
// by importing the contract as text is overkill; instead test through checkCase/plan gates plus
// direct math from the compiled page module is not available. So: contract math is covered by the
// example strict tsc + browser run; here we cover gates and tamper rejection.

const ROOT = path.resolve(__dirname, '../..');
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
let tmp: string;
beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ier-geo-')); });
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

function realFingerprints (): Record<string, any> {
    const out: Record<string, any> = {};
    for (const file of INPUTS) {
        const bytes = fs.readFileSync(path.join(ROOT, file));
        out[file] = { path: file, bytes: bytes.length, sha256: sha(bytes) };
    }
    return out;
}
function iso (ms: number): string { return new Date(Date.parse('2026-10-09T10:00:00.000Z') + ms).toISOString(); }
function paintCut (caseId: string, dpr: number, name: string): { pngPath: string; sha256: string; pngBytes: number } {
    const resized = caseId.endsWith('resized');
    const page = resized ? { width: 480, height: 320 } : { width: 640, height: 400 };
    const png = new PNG({ width: Math.round(page.width * dpr), height: Math.round(page.height * dpr) });
    for (let i = 0; i < png.width * png.height; i++) { png.data[i * 4] = 13; png.data[i * 4 + 1] = 15; png.data[i * 4 + 2] = 22; png.data[i * 4 + 3] = 255; }
    const gesture = resized ? GESTURE_RESIZED : GESTURE;
    const css = resized ? { width: 480, height: 320 } : { width: 640, height: 400 };
    const oracle = cutOracle(gesture, dpr);
    // paint all three objects: red cut on the line, yellow stroke slightly above, cyan blade at the start
    const steps = 200;
    for (let i = 0; i <= steps; i++) {
        const t0 = i / steps;
        const cx = (gesture.a.x * (1 - t0) + gesture.b.x * t0) * dpr;
        const cy = (gesture.a.y * (1 - t0) + gesture.b.y * t0) * dpr;
        const paint = (x: number, y: number, rgb: [number, number, number]) => {
            for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
                const px = Math.round(x) + dx, py = Math.round(y) + dy;
                if (px < 0 || py < 0 || px >= png.width || py >= png.height) continue;
                const idx = (png.width * py + px) << 2;
                png.data[idx] = rgb[0]; png.data[idx + 1] = rgb[1]; png.data[idx + 2] = rgb[2]; png.data[idx + 3] = 255;
            }
        };
        paint(cx, cy, [235, 70, 70]);                       // cut surface (red) on the line
        paint(cx, cy - 10 * dpr, [255, 235, 90]);           // input stroke (yellow) above it
        if (i < steps * 0.12) paint(cx, cy, [160, 230, 255]); // animated blade (cyan) near the start
    }
    void oracle;
    const file = path.join(tmp, name);
    fs.writeFileSync(file, PNG.sync.write(png));
    const bytes = fs.readFileSync(file);
    return { pngPath: file, sha256: sha(bytes), pngBytes: bytes.length };
}

// 合成正交相机：world(±4, ±2.5) → css 640×400（与 runner 独立投影同构）
const VP = [0.25, 0, 0, 0, 0, 0.4, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]; // row-major m00..m15
function cssToWorld (css: { x: number; y: number }, size: { width: number; height: number }): { x: number; y: number; z: number } {
    return { x: (css.x / size.width * 2 - 1) * 4, y: (1 - 2 * css.y / size.height) * 2.5, z: 0 };
}
// 真切面：延长线与合成 slab（±4 × ±2.5）边界的交点链（顶点在无限延长线上）
function cutChainUpload (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): { positions: number[]; indices16: number[] } {
    const dx = b.x - a.x, dy = b.y - a.y;
    const tVals: number[] = [];
    for (const target of [-4, 4]) if (Math.abs(dx) > 1e-9) tVals.push((target - a.x) / dx);
    for (const target of [-2.5, 2.5]) if (Math.abs(dy) > 1e-9) tVals.push((target - a.y) / dy);
    const inside = tVals.filter((t) => t >= 0 && t <= 1).map((t) => ({ x: a.x + dx * t, y: a.y + dy * t }));
    inside.sort((p, q) => (p.x - q.x) || (p.y - q.y));
    const chain = inside.length >= 2 ? [inside[0], inside[inside.length - 1]] : [a, b];
    return { positions: [chain[0].x, chain[0].y, 0, chain[0].x, chain[0].y, 0.001, chain[1].x, chain[1].y, 0, chain[1].x, chain[1].y, 0.001],
        indices16: [0, 1, 2, 1, 3, 2] };
}

function quadUpload (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, thickness: number): { positions: number[]; indices16: number[] } {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (thickness / 2), ny = (dx / len) * (thickness / 2);
    return { positions: [a.x - nx, a.y - ny, 0, b.x - nx, b.y - ny, 0, a.x + nx, a.y + ny, 0, b.x + nx, b.y + ny, 0],
        indices16: [0, 1, 2, 1, 3, 2] };
}

function cutRecord (opts: { engine: string; caseId: string; dpr: number; projection: string; cam: string; png: { pngPath: string; sha256: string; pngBytes: number }; fingerprints: Record<string, any>; step: number }): any {
    const resized = opts.caseId.endsWith('resized');
    const css = resized ? { width: 480, height: 320 } : { width: 640, height: 400 };
    const dpr = opts.dpr;
    const g = resized ? GESTURE_RESIZED : GESTURE;
    const w1 = cssToWorld(g.a, css); const w2 = cssToWorld(g.b, css);
    const uploads = {
        stroke: { ...quadUpload(w1, w2, 0.02), nodeTranslation: [0, 0, 0.06] },
        cut: { ...cutChainUpload(w1, w2), nodeTranslation: [0, 0, 0.0005] },
        blade: { ...quadUpload(w1, w2, 0.22), nodeTranslation: [0, 0, 0.03], phase: 0 },
    };
    const raw = { uploads, camera: { viewProjection: VP, viewport: { x: 0, y: 0, width: 1, height: 1 },
        backing: { width: Math.round(css.width * dpr), height: Math.round(css.height * dpr) }, cssSize: css, dpr },
        cssLine: [g.a, g.b], worldHits: [w1, w2], inputEvents: [
            { type: 'pointerdown', clientX: g.a.x, clientY: g.a.y, isTrusted: true, sequence: 2, session: 1, timestamp: iso(0) },
            { type: 'pointerup', clientX: g.b.x, clientY: g.b.y, isTrusted: true, sequence: 3, session: 1, timestamp: iso(1) }],
        rect: { left: 0, top: 0 }, session: 1, measuredAtStep: opts.step - 1 };
    const resizeTransition = resized ? {
        before: { backing: { width: 640, height: 400 }, css: { width: 640, height: 400 }, session: 1 },
        after: { backing: { width: 480, height: 320 }, css: { width: 480, height: 320 }, session: 2 },
        sessionAdvanced: 1 } : null;
    return {
        schemaVersion: 'ier-evidence/2', runId: 'fixture-run', caseId: opts.caseId,
        appFingerprint: opts.fingerprints[INPUTS[2]], sdkFingerprint: opts.fingerprints[INPUTS[0]],
        harnessFingerprint: opts.fingerprints[INPUTS[5]],
        browser: `${opts.engine} 1.0-fixture`, viewport: { width: resized ? 480 : 640, height: resized ? 320 : 400 }, dpr,
        inputMethod: 'REAL_POINTER_GESTURE', seed: 0,
        receivedEvent: { type: 'pointerup', sequence: 3, isTrusted: true, appliedBy: 'dom', timestamp: iso(1) },
        modelState: { mode: 'cut', session: 1, records: 1, hitTarget: true,
            cutErrorPx: [0, 0], strokeErrorPx: [0, 0],
            blade: { phase: 0.01, errorPx: 0, lineDriftPx: 0 },
            measuredBeforeFirstStep: true, receivedEventIsTrusted: true, raw, resizeTransition,
            receivedSequence: 3, ownedRefCount: 7, projection: opts.projection, cam: opts.cam },
        layoutReceipt: { css, backing: { width: Math.round(css.width * dpr), height: Math.round(css.height * dpr) },
            rect: { left: 0, top: 0 }, viewport: { width: resized ? 480 : 640, height: resized ? 320 : 400 }, dpr },
        submittedFrame: { event: 'AFTER_DRAW', afterDraw: true, step: opts.step, inputSequence: 3, timestamp: iso(10) },
        pngPath: opts.png.pngPath, pngSha256: opts.png.sha256, pngBytes: opts.png.pngBytes,
        observationTimestamp: iso(20), clock: { method: 'STEP_CLOCK', stepping: true, stepped: opts.step, enginePaused: true },
        sourceStatus: 'recreated', comparisonDimensions: ['projection', 'geometry', 'layout'],
        limitations: ['fixture'], referenceComparison: { result: 'NOT_RUN', reason: 'External source not observed' },
        result: 'PASS', method: 'STEP_CLOCK',
        execution: { command: 'node fixture', cwd: ROOT, exitCode: 0, startedAt: iso(0), endedAt: iso(20) },
    };
}

function paintRibbonPair (name: string, shift: number): { pngPath: string; sha256: string; bytes: number } {
    const png = new PNG({ width: 640, height: 400 });
    for (let i = 0; i < png.width * png.height; i++) { png.data[i * 4] = 13; png.data[i * 4 + 1] = 15; png.data[i * 4 + 2] = 22; png.data[i * 4 + 3] = 255; }
    const x0 = 200 + shift, x1 = 420 + shift; // the band actually moves between frames
    for (let y = 80; y < 140; y++) for (let x = x0; x < x1; x++) {
        if (x < 0 || x >= png.width) continue;
        const idx = (png.width * y + x) << 2;
        png.data[idx] = 90; png.data[idx + 1] = 200; png.data[idx + 2] = 255; png.data[idx + 3] = 255;
    }
    const file = path.join(tmp, name);
    fs.writeFileSync(file, PNG.sync.write(png));
    const bytes = fs.readFileSync(file);
    return { pngPath: file, sha256: sha(bytes), bytes: bytes.length };
}

function buildReport (): any {
    const fingerprints = realFingerprints();
    const rows: any[] = [];
    let pngIndex = 0;
    const cachedPngs = new Map<string, ReturnType<typeof paintCut>>();
    for (const engine of ['chromium', 'firefox', 'webkit']) {
        let step = 2;
        for (const entry of planFor()) {
            const caseId = entry.caseType === 'offset' ? 'cut-offset' : entry.caseType === 'resized' ? 'cut-resized' : 'cut-baseline';
            const imageKey = `${caseId}/${entry.dpr}`;
            if (!cachedPngs.has(imageKey)) cachedPngs.set(imageKey, paintCut(caseId, entry.dpr, `p${pngIndex++}.png`));
            const png = cachedPngs.get(imageKey)!;
            const record = cutRecord({ engine, caseId, dpr: entry.dpr, projection: entry.projection, cam: entry.cam, png, fingerprints, step: step++ });
            // offset rows keep the baseline canvas size (only the container moves)
            if (entry.caseType === 'offset') {
                record.layoutReceipt.css = { width: 640, height: 400 };
                record.layoutReceipt.backing = { width: 640, height: 400 };
                record.layoutReceipt.rect = { left: 72, top: 40 };
                record.modelState.raw.rect = { left: 72, top: 40 };
                for (const ev of record.modelState.raw.inputEvents) { ev.clientX += 72; ev.clientY += 40; }
            }
            rows.push({ engine, browserVersion: '1.0-fixture', caseType: entry.caseType, projection: entry.projection, cam: entry.cam, dpr: entry.dpr,
                pageErrors: [], consoleErrors: [], cases: [record] });
        }
    }
    return { schemaVersion: 'ier-geometry/2', runId: 'fixture-run', engines: ['chromium', 'firefox', 'webkit'],
        subset: true, completed: false, fingerprints, rows,
        ribbons: ['chromium', 'firefox', 'webkit'].flatMap((engine) => [1, 2].map((dpr) => {
            const before = paintRibbonPair(`rb-${engine}-${dpr}-b.png`, 0);
            const after = paintRibbonPair(`rb-${engine}-${dpr}-a.png`, 40);
            return { engine, dpr, movedCssPx: 13.4, centroidDeltaPx: 40, coloredPixels: 4200, frames: 22, nodeCount: 1, before, after };
        })),
        meshRows: ['chromium', 'firefox', 'webkit'].map((engine) => {
            const orangeShot = (name: string, shift: number): { pngPath: string; sha256: string; bytes: number } => {
                const png = new PNG({ width: 640, height: 400 });
                for (let i = 0; i < png.width * png.height; i++) { png.data[i * 4] = 13; png.data[i * 4 + 1] = 15; png.data[i * 4 + 2] = 22; png.data[i * 4 + 3] = 255; }
                for (let y = 150; y < 260; y++) for (let x = 380 + shift; x < 500 + shift; x++) {
                    if (x < 0 || x >= png.width) continue;
                    const idx = (png.width * y + x) << 2;
                    png.data[idx] = 240; png.data[idx + 1] = 170; png.data[idx + 2] = 60; png.data[idx + 3] = 255;
                }
                const file = path.join(tmp, `mesh-${engine}-${name}.png`);
                fs.writeFileSync(file, PNG.sync.write(png));
                const bytes = fs.readFileSync(file);
                return { pngPath: file, sha256: sha(bytes), bytes: bytes.length };
            };
            const shot = (name: string) => paintRibbonPair(`mesh-${engine}-${name}.png`, 0);
            return { engine, frames: 10, preflightOk: true,
                boundsFinite: true, boundsBefore: [0, 0, 0, 1, 1, 0], boundsAfter: [0, -1, 0, 1, 2, 0],
                staticPng: shot('static'), dynamicPng: orangeShot('dynamic', 0), dynamicAfterPng: orangeShot('after', 30) };
        }),
        lifecycles: ['chromium', 'firefox', 'webkit'].map((engine) => ({ engine, rounds: 10, ownedPerRound: [7,7,7,7,7,7,7,7,7,7],
            refs: [{ before: 1, after: 0 }, { before: 1, after: 0 }], renderersUnbound: true, nodesRemoved: true, controlsDisabled: true,
            rawEvents: [{ type: 'pointerdown' }, { type: 'pointerup' }, { type: 'escape' }, { type: 'pointerup' }],
            staleUpNoCut: true, newGestureWorks: true, idempotent: true, postReleaseError: 'GEOMETRY_DISPOSED',
            perRoundRefs: Array(10).fill(true),
            resetRounds: Array.from({length: 10}, (_, round) => ({
                refs: Array.from({length: 4}, (_, i) => ({id: round * 4 + i, before: 1, after: 0})),
                retained: Array.from({length: 6}, (_, i) => ({id: 100 + i, before: 1, after: 1})) })),
            variants: Object.fromEntries(['reset', 'escape', 'resize'].map((name, i) => [name, {
                before: {records: 0, session: i+1}, after: {records: 0, session: i+2},
                events: [{type: 'pointerdown', isTrusted: true}, {type: name, isTrusted: true}, {type: 'pointerup', isTrusted: true}] }])) })),
        normals: ['chromium', 'firefox', 'webkit'].flatMap(engine => ['mesh', 'cut', 'ribbon'].map(mode => {
            const png = new PNG({width: 640, height: 400});
            for (let y=80; y<180; y++) for (let x=100; x<500; x++) {
                const rgb = x<200 ? [229,0,0] : x<300 ? [255,235,90] : x<400 ? [90,200,255] : [240,170,60];
                png.data.set([...rgb,255], (y*640+x)*4);
            }
            const file = path.join(tmp, `normal-${engine}-${mode}.png`), bytes=PNG.sync.write(png);
            fs.writeFileSync(file, bytes);
            const state = (session: number, frames: number) => ({clock: {method: 'NATIVE_PACER', enginePaused: false, totalFrames: frames},
                modelState: {session, ownedRefCount: 4}, submittedFrame: {afterDraw: true}});
            return {engine, mode, pageErrors: [], consoleErrors: [], before: state(1,1), running: state(1,20),
                resets: [1,2,3].map(n => ({before: state(n,20+n), after: state(n+1,21+n)})),
                events: ['reset','escape','release'].map((type, i) => ({type, sequence: i+1, isTrusted: true})),
                cleanup: {controlsDisabled:true,controlsDetached:true,pointerDetached:true,renderersUnbound:true,nodesRemoved:true,
                    refs: Array(4).fill({before:1,after:0}), rendererValidity:[false]}, releaseIdentity:true,
                visible: {pngPath:file,sha256:sha(bytes),bytes:bytes.length}};
        })),
        limitations: ['fixture'] };
}
let fixture: any;
beforeAll(() => { fixture = buildReport(); });

describe('IER-04 acceptance: synthetic full-plan fixture validates clean', () => {
    test('full matrix validates (37 rows per browser, synthetic fixture)', () => {
        const result = validateReport(fixture);
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
        expect(fixture.rows).toHaveLength(37 * 3);
    });
    test('every case PNG matches the frozen cut oracle', () => {
        for (const row of fixture.rows) {
            const record = row.cases[0];
            const v = checkCase(record, record.caseId, fixture.runId, {
                sdkModuleSha256: fixture.fingerprints[INPUTS[0]].sha256,
                appSha256: fixture.fingerprints[INPUTS[2]].sha256,
                harnessSha256: fixture.fingerprints[INPUTS[5]].sha256,
            });
            expect(v.errors).toEqual([]);
        }
    });
    test('fixture fingerprints are real disk identities', () => {
        for (const file of INPUTS) {
            expect(sha(fs.readFileSync(path.join(ROOT, file)))).toBe(fixture.fingerprints[file].sha256);
        }
    });
});

describe('IER-04 tamper rejections (memory clones)', () => {
    const context = () => ({
        sdkModuleSha256: fixture.fingerprints[INPUTS[0]].sha256,
        appSha256: fixture.fingerprints[INPUTS[2]].sha256,
        harnessSha256: fixture.fingerprints[INPUTS[5]].sha256,
    });
    test('1) cut upload displaced beyond the frozen 0.15 px budget rejected', () => {
        const base = fixture.rows[0].cases[0];
        const raw = JSON.parse(JSON.stringify(base.modelState.raw));
        raw.uploads.cut.positions = raw.uploads.cut.positions.map((v: number, i: number) => (i % 3 === 0 ? v + 1 : v));
        const rec = { ...base, modelState: { ...base.modelState, raw } };
        expect(checkCase(rec, rec.caseId, fixture.runId, context()).ok).toBe(false);
    });
    test('2) blade upload offset beyond its own budget rejected (raw recomputation)', () => {
        const base = fixture.rows[0].cases[0];
        const raw = JSON.parse(JSON.stringify(base.modelState.raw));
        // move the blade 0.2 world units perpendicular: well over the 1.5 px blade budget
        raw.uploads.blade.positions = raw.uploads.blade.positions.map((v: number, i: number) => (i % 3 === 1 ? v + 0.2 : v));
        const rec = { ...base, modelState: { ...base.modelState, raw } };
        expect(checkCase(rec, rec.caseId, fixture.runId, context()).ok).toBe(false);
        const pristine = { ...base };
        expect(checkCase(pristine, pristine.caseId, fixture.runId, context()).ok).toBe(true);
    });
    test('3) untrusted input cannot pass as real pointer', () => {
        const rec = { ...fixture.rows[0].cases[0], modelState: { ...fixture.rows[0].cases[0].modelState, receivedEventIsTrusted: false } };
        expect(checkCase(rec, rec.caseId, fixture.runId, context()).ok).toBe(false);
    });
    test('4) target miss rejected', () => {
        const rec = { ...fixture.rows[0].cases[0], modelState: { ...fixture.rows[0].cases[0].modelState, hitTarget: false } };
        expect(checkCase(rec, rec.caseId, fixture.runId, context()).ok).toBe(false);
    });
    test('5) projection identity mismatch with the row plan rejected', () => {
        const t = JSON.parse(JSON.stringify(fixture));
        t.rows[0].cases[0].modelState.projection = 'ortho';
        expect(validateReport(t).ok).toBe(false);
    });
    test('6) missing plan row rejected', () => {
        const t = JSON.parse(JSON.stringify(fixture));
        t.rows.splice(t.rows.length - 1, 1);
        expect(validateReport(t).ok).toBe(false);
    });
    test('7) duplicate plan row rejected', () => {
        const t = JSON.parse(JSON.stringify(fixture));
        t.rows.push(JSON.parse(JSON.stringify(t.rows[0])));
        expect(validateReport(t).ok).toBe(false);
    });
    test('8) NOT_RUN case cannot count as tested', () => {
        const t = JSON.parse(JSON.stringify(fixture));
        t.rows[0].cases[0].result = 'NOT_RUN';
        expect(validateReport(t).ok).toBe(false);
    });
    test('9) future input sequence rejected (exact equality)', () => {
        const rec = { ...fixture.rows[0].cases[0], submittedFrame: { ...fixture.rows[0].cases[0].submittedFrame, inputSequence: 999 } };
        expect(checkCase(rec, rec.caseId, fixture.runId, context()).ok).toBe(false);
    });
    test('10) stale measurement (after first step) rejected', () => {
        const rec = { ...fixture.rows[0].cases[0], modelState: { ...fixture.rows[0].cases[0].modelState, measuredBeforeFirstStep: false } };
        expect(checkCase(rec, rec.caseId, fixture.runId, context()).ok).toBe(false);
    });
    test('11) input SHA drift rejected', () => {
        const t = JSON.parse(JSON.stringify(fixture));
        t.fingerprints[INPUTS[2]].sha256 = 'e'.repeat(64);
        expect(validateReport(t).ok).toBe(false);
    });
    test('12) black PNG rejected by pixel recomputation', () => {
        const black = new PNG({ width: 640, height: 400 });
        for (let i = 0; i < 640 * 400; i++) { black.data[i * 4] = 5; black.data[i * 4 + 1] = 5; black.data[i * 4 + 2] = 5; black.data[i * 4 + 3] = 255; }
        const file = path.join(tmp, 'black.png');
        fs.writeFileSync(file, PNG.sync.write(black));
        const rec = { ...fixture.rows[0].cases[0], pngPath: file,
            pngBytes: fs.statSync(file).size, pngSha256: sha(fs.readFileSync(file)) };
        expect(checkCase(rec, rec.caseId, fixture.runId, context()).ok).toBe(false);
    });
    test('13) ribbon identical before/after with zero centroid rejected', () => {
        const t = JSON.parse(JSON.stringify(fixture));
        t.ribbons[0].after = { ...t.ribbons[0].before };
        t.ribbons[0].centroidDeltaPx = 0;
        t.ribbons[0].coloredPixels = 0;
        expect(validateReport(t).ok).toBe(false);
    });
    test('14) lifecycle stale-release contract failure rejected', () => {
        const t = JSON.parse(JSON.stringify(fixture));
        t.lifecycles[0].staleUpNoCut = false;
        expect(validateReport(t).ok).toBe(false);
    });
    test('15) page error injection rejected', () => {
        const t = JSON.parse(JSON.stringify(fixture));
        t.rows[3].pageErrors.push('boom');
        expect(validateReport(t).ok).toBe(false);
    });
});

describe('IER-04 plan and oracle contracts', () => {
    test('every engine covers the full T1 matrix (baseline + live resize + offset)', () => {
        expect(planFor()).toHaveLength(2 * 3 * 3 * 2 + 1);
        for (const row of planFor()) expect([1, 1.25, 2]).toContain(row.dpr);
    });
    test('the frozen budget is 0.15 CSS px (design target, not a historical claim)', () => {
        expect(CUT_ERROR_BUDGET).toBe(0.15);
        expect(BLADE_ERROR_BUDGET).toBeGreaterThan(CUT_ERROR_BUDGET);
    });
    test('cut oracle region follows the gesture, not a fixed screen band', () => {
        const a = cutOracle(GESTURE, 1);
        const b = cutOracle(GESTURE_RESIZED, 1);
        expect(a.region).not.toEqual(b.region);
        const scaled = cutOracle(GESTURE, 2);
        expect(scaled.region[2]).toBeGreaterThan(a.region[2]); // DPR scales the pixel region
    });
});


describe('Lead closure gates: raw correlation and native controls', () => {
    const context = () => ({sdkModuleSha256: fixture.fingerprints[INPUTS[0]].sha256,
        appSha256: fixture.fingerprints[INPUTS[2]].sha256, harnessSha256: fixture.fingerprints[INPUTS[5]].sha256});
    test.each([
        ['missing raw events', (r: any) => {delete r.modelState.raw.inputEvents;}],
        ['wrong client coordinates', (r: any) => {r.modelState.raw.inputEvents[1].clientX += 20;}],
        ['late session', (r: any) => {r.modelState.raw.inputEvents[1].session += 1;}],
        ['future measurement', (r: any) => {r.modelState.raw.measuredAtStep = r.submittedFrame.step;}],
        ['missing world intersections', (r: any) => {delete r.modelState.raw.worldHits;}],
    ])('rejects %s independently of self-reported error scalars', (_, mutate) => {
        const r = JSON.parse(JSON.stringify(fixture.rows[0].cases[0])); mutate(r);
        expect(checkCase(r, r.caseId, fixture.runId, context()).ok).toBe(false);
    });
    test('native normal-mode baseline accepts visible synthetic fixture', () => {
        expect(validateNormals(fixture)).toEqual({ok: true, errors: []});
    });
    test.each([
        ['untrusted controls', (r: any) => {r.normals[0].events.forEach((e: any) => e.isTrusted = false);} ],
        ['reset resource accumulation', (r: any) => {r.normals[0].resets[0].after.modelState.ownedRefCount += 4;} ],
        ['pacer did not advance', (r: any) => {r.normals[0].running.clock.totalFrames = r.normals[0].before.clock.totalFrames;} ],
        ['unreleased refs', (r: any) => {r.normals[0].cleanup.refs[0].after = 9;} ],
        ['listener not detached', (r: any) => {r.normals[0].cleanup.controlsDetached = false;} ],
        ['missing mode', (r: any) => {r.normals.pop();} ],
    ])('rejects normal %s', (_, mutate) => {
        const r = JSON.parse(JSON.stringify(fixture)); mutate(r);
        expect(validateNormals(r).ok).toBe(false);
    });
});
