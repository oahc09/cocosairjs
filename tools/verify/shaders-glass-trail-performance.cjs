'use strict';
// C03 serialized performance reducer (two-pass composition: trail RT + glass screen): same frozen profile/precision contract as the other
// Wave1/Wave2 shader collectors. Only run in a Lead-authorized quiet window.
// Read-only raw-measurement reduction. No browser launch or copied metric arrays.
const PROFILES = Object.freeze([
    { id: '720p', viewport: { width: 1280, height: 720 }, dpr: 1 },
    { id: '1080p', viewport: { width: 1920, height: 1080 }, dpr: 1 },
    { id: 'mobile-dpr', viewport: { width: 390, height: 844 }, dpr: 2 },
]);
const finite = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
let _oracleDefaults = null;
function oracleDefaults() {
    if (!_oracleDefaults) _oracleDefaults = require('./shaders-glass-trail-oracle.cjs').defaults();
    return _oracleDefaults;
}
const REAL_COMMAND_NAMES = new Set([
    'begin',
    'end',
    'beginRenderPass',
    'endRenderPass',
    'bindPipelineState',
    'bindDescriptorSet',
    'bindInputAssembler',
    'draw',
]);
const REAL_DRAW_NAMES = new Set(['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']);
function validatePerformance(raw, profile) {
    // Hardened: every dereference is guarded - malformed raw/profile/arrays NEVER throw.
    const errors = [];
    try {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            return { errors: ['raw object required'], measurements: 0 };
        if (!profile || typeof profile !== 'object') return { errors: ['missing profile'], measurements: 0 };
        const expected = PROFILES.find((q) => q.id === profile.id);
        if (!expected || JSON.stringify(expected) !== JSON.stringify(profile)) {
            errors.push('profile descriptor (frozen 3-profile set is the only authority)');
            return { errors, measurements: 0 };
        }
        if (
            raw.viewport?.width !== profile.viewport.width ||
            raw.viewport?.height !== profile.viewport.height ||
            raw.viewport?.dpr !== profile.dpr ||
            raw.viewport?.backing?.width !== profile.viewport.width * profile.dpr ||
            raw.viewport?.backing?.height !== profile.viewport.height * profile.dpr
        )
            errors.push('actual viewport/DPR/backing');
        const frames = raw.frames;
        if (!Array.isArray(frames) || frames.length < 90 || raw.warmupFrames !== 30)
            return { errors: [...errors, 'frame window/warmup'], measurements: 0 };
        const ids = new Set();
        for (const [i, entry] of frames.entries()) {
            const r = entry;
            if (!r || typeof r !== 'object') {
                errors.push('frame row object');
                continue;
            }
            if (
                !Number.isSafeInteger(r.frame) ||
                ids.has(r.frame) ||
                (i && frames[i - 1] && r.frame !== frames[i - 1].frame + 1)
            )
                errors.push('frame sequence');
            ids.add(r.frame);
            for (const key of ['intervalMs', 'renderEnvelopeMs', 'bufferBytes', 'textureBytes'])
                if (!finite(r[key])) errors.push(`frame ${key}`);
            if (r.intervalMs <= 0 || !Number.isSafeInteger(r.drawCalls) || r.drawCalls < 2)
                errors.push('native draw/frame count');
        }
        // Any structurally invalid frame row makes the steady-window math meaningless; stop here
        // with the collected errors instead of dereferencing garbage downstream.
        if (errors.includes('frame row object')) return { errors, measurements: 0 };
        const steady = frames.slice(raw.warmupFrames),
            steadyIDs = new Set(steady.map((r) => r.frame));
        // Two-pass composition: the native command stream must actually show >= 2 beginRenderPass
        // per steady frame (trail RT pass + glass screen pass); a single-pass window is rejected.

        const passByFrame = new Map();
        for (const r of Array.isArray(raw.commands) ? raw.commands : [])
            if (r?.name === 'beginRenderPass' && Number.isSafeInteger(r.frame))
                passByFrame.set(r.frame, (passByFrame.get(r.frame) || 0) + 1);
        const steady2 = frames.slice(raw.warmupFrames);
        // No readPixels inside the measured window: any GL readback invalidates the measurement.
        if (!Number.isSafeInteger(raw.readPixelsDuringWindow) || raw.readPixelsDuringWindow !== 0)
            errors.push('readPixelsDuringWindow must be exactly 0 (got ' + raw.readPixelsDuringWindow + ')');
        // Command stream sanity: real gfx method names only, finite timing.
        if (Array.isArray(raw.commands))
            for (const c of raw.commands) {
                if (!c || typeof c !== 'object' || !REAL_COMMAND_NAMES.has(c.name)) {
                    errors.push('unknown command name: ' + (c && c.name));
                    break;
                }
                if (!Number.isSafeInteger(c.frame) || !finite(c.ms)) {
                    errors.push('command frame/ms invalid');
                    break;
                }
            }
        const drawByFrame = new Map();
        for (const r of Array.isArray(raw.draws) ? raw.draws : []) {
            if (!r || typeof r !== 'object' || !REAL_DRAW_NAMES.has(r.name)) continue;
            if (Number.isSafeInteger(r.frame)) drawByFrame.set(r.frame, (drawByFrame.get(r.frame) || 0) + 1);
        }
        if (Array.isArray(raw.draws))
            for (const d of raw.draws)
                if (d && typeof d === 'object' && !REAL_DRAW_NAMES.has(d.name)) {
                    errors.push('unknown draw dispatch name: ' + d.name);
                    break;
                }
        for (const frame of steady2) {
            const passes = passByFrame.get(frame.frame) || 0;
            if (passes < 2) errors.push(`beginRenderPass ${frame.frame}: ${passes} < 2 (single-pass window)`);
            // >= 2 ACTUAL GL draw dispatches with real names (not the self-reported drawCalls).
            const dispatches = drawByFrame.get(frame.frame) || 0;
            if (dispatches < 2) errors.push(`native draw dispatch ${frame.frame}: ${dispatches} < 2 (one-draw window)`);
        }
        // Active-window requirement: update evidence must exist for the steady window (an empty
        // idle scene cannot masquerade as a performance measurement).
        if (!Array.isArray(raw.updateCalls) || !raw.updateCalls.length) errors.push('update missing (empty window)');
        // Upload contract: one 512-byte points upload per positive-dt update call with raw packed
        // arrays (256 uint16) and native GL receipts — not a self-reported count.
        if (!Array.isArray(raw.uploads) || raw.uploads.length !== raw.updateCalls.length)
            errors.push('uploads must match update calls one-per-frame');
        else if (
            raw.uploads.some(
                (u) =>
                    u?.bytes !== 512 ||
                    !Array.isArray(u?.packed) ||
                    u.packed.length !== 256 ||
                    u.packed.some((w) => !Number.isInteger(w) || w < 0 || w > 65535) ||
                    !u?.uploadNativeReceipt ||
                    u.uploadNativeReceipt?.bytes !== 512,
            )
        )
            errors.push('upload raw bytes/receipt invalid');
        else if (Array.isArray(raw.diagnosticInput) && raw.diagnosticInput.length === raw.uploads.length) {
            // Anti-whitewash: rebuild the packed texture from the recorded diagnostic input frames
            // using EACH frame's actual dt/aspect/length/radius (no fixed 640x400 or default dt
            // fallback) and require full 256-word byte equality per upload.
            const oracleMod = require('./shaders-glass-trail-oracle.cjs');
            const frozenAspect = (profile.viewport.width * profile.dpr) / (profile.viewport.height * profile.dpr);
            const diagFrames = raw.diagnosticInput.map((d) => ({
                x: d?.x,
                y: d?.y,
                dt: typeof d?.dt === 'number' && Number.isFinite(d.dt) && d.dt > 0 ? d.dt : NaN,
                aspect: typeof d?.aspect === 'number' && Number.isFinite(d.aspect) && d.aspect > 0 ? d.aspect : NaN,
                trailLength: typeof d?.trailLength === 'number' && Number.isFinite(d.trailLength) ? d.trailLength : NaN,
                trailRadius: typeof d?.trailRadius === 'number' && Number.isFinite(d.trailRadius) ? d.trailRadius : NaN,
            }));
            if (diagFrames.some((f) => !Number.isFinite(f.dt)))
                errors.push('diagnostic input frames must record their actual positive dt');
            if (diagFrames.some((f) => !Number.isFinite(f.aspect) || Math.abs(f.aspect - frozenAspect) > 1e-9))
                errors.push('diagnostic input aspect must match the frozen profile backing aspect');
            if (diagFrames.some((f) => !Number.isFinite(f.trailLength) || !Number.isFinite(f.trailRadius)))
                errors.push('diagnostic input frames must record their actual trail params');
            for (let i = 0; i < raw.uploads.length; i++) {
                const rebuilt = Array.from(
                    oracleMod.replay(
                        diagFrames.slice(0, i + 1),
                        oracleMod.defaults(),
                        profile.viewport.width * profile.dpr,
                        profile.viewport.height * profile.dpr,
                    ).bits,
                );
                const recorded = raw.uploads[i].packed;
                if (rebuilt.length !== recorded.length || rebuilt.some((w, k) => w !== recorded[k]))
                    errors.push(`upload ${i} packed bytes do not match diagnostic replay`);
            }
        } else errors.push('diagnostic input must cover every upload frame');
        // Diagnostic input labeling: the active trajectory is CPU-driven and MUST stay marked as
        // DIAGNOSTIC_CPU_TRACE; relabeling it as trusted UI input is a false measurement claim.
        if (!raw.methods?.diagnosticInput?.includes('DIAGNOSTIC_CPU_TRACE'))
            errors.push('diagnostic input must stay labeled DIAGNOSTIC_CPU_TRACE');
        // Instrumentation cost must be labeled honestly: this is an instrumented window.
        if (!raw.methods?.instrumentation?.includes('instrumented'))
            errors.push('instrumentation cost label missing (not an uninstrumented benchmark)');
        // INDEPENDENT LEDGER BIND: frozen start shows a FRESH session; the end ledger carries
        // exactly one frame per update/diagnostic/upload/native call, one session, all finite.
        {
            const fs = raw.fixedStart ?? null,
                fe = raw.fixedEnd ?? null;
            const fsFrames = Array.isArray(fs?.simulationFrames) ? fs.simulationFrames : null;
            const feFrames = Array.isArray(fe?.simulationFrames) ? fe.simulationFrames : null;
            if (!fs || typeof fs !== 'object') errors.push('fixedStart snapshot required');
            else {
                if (!fsFrames || fsFrames.length !== 0)
                    errors.push('fixedStart must show an EMPTY simulation ledger (fresh session)');
                if (!Array.isArray(fs?.trail?.uploads) || fs.trail.uploads.length !== 0)
                    errors.push('fixedStart must show EMPTY session uploads');
                if (fs?.trail?.uploadCount !== 0) errors.push('fixedStart uploadCount must be 0');
            }
            const nUpd = Array.isArray(raw.updateCalls) ? raw.updateCalls.length : -1;
            const nDiag = Array.isArray(raw.diagnosticInput) ? raw.diagnosticInput.length : -1;
            const nUpl = Array.isArray(raw.uploads) ? raw.uploads.length : -1;
            if (!fe || typeof fe !== 'object') errors.push('fixedEnd snapshot required');
            else if (!feFrames || !feFrames.length) errors.push('fixedEnd simulation ledger required');
            else {
                if (nUpd >= 0 && feFrames.length !== nUpd)
                    errors.push('fixedEnd ledger ' + feFrames.length + ' != updateCalls ' + nUpd);
                if (nDiag >= 0 && feFrames.length !== nDiag)
                    errors.push('fixedEnd ledger ' + feFrames.length + ' != diagnosticInput ' + nDiag);
                if (nUpl >= 0 && feFrames.length !== nUpl)
                    errors.push('fixedEnd ledger ' + feFrames.length + ' != uploads ' + nUpl);
                const sessions = new Set(feFrames.map((f) => f?.sessionGeneration));
                if (sessions.size !== 1 || !Number.isSafeInteger([...sessions][0]) || [...sessions][0] <= 0)
                    errors.push('fixedEnd ledger must carry ONE positive session generation');
                const EPS_DT = 1e-9;
                const froz = oracleDefaults();
                let prevFrame = -Infinity,
                    prevTimeAfter = -Infinity;
                for (const [li, f] of feFrames.entries()) {
                    if (!f || typeof f !== 'object') {
                        errors.push('ledger frame ' + li + ' object required');
                        break;
                    }
                    const nums = [f.dt, f.aspect, f.trailLength, f.trailRadius, f.timeBefore, f.timeAfter];
                    if (nums.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
                        errors.push('ledger frame ' + li + ' non-finite field');
                        break;
                    }
                    if (
                        typeof f.pointer?.x !== 'number' ||
                        typeof f.pointer?.y !== 'number' ||
                        !Number.isFinite(f.pointer.x) ||
                        !Number.isFinite(f.pointer.y) ||
                        f.pointer.x < 0 ||
                        f.pointer.x > 1 ||
                        f.pointer.y < 0 ||
                        f.pointer.y > 1
                    ) {
                        errors.push('ledger frame ' + li + ' pointer outside [0,1]');
                        break;
                    }
                    if (f.method !== 'DIAGNOSTIC_CPU_TRACE') {
                        errors.push('ledger frame ' + li + ' method must be DIAGNOSTIC_CPU_TRACE');
                        break;
                    }
                    if (!Number.isSafeInteger(f.frame) || f.frame <= prevFrame) {
                        errors.push('ledger frame ' + li + ' frame not strictly increasing');
                        break;
                    }
                    if (f.timeBefore < prevTimeAfter - EPS_DT || f.timeAfter < f.timeBefore - EPS_DT) {
                        errors.push('ledger frame ' + li + ' times backwards/non-monotonic');
                        break;
                    }
                    if (Math.abs(f.dt - (f.timeAfter - f.timeBefore)) > 1e-7) {
                        errors.push('ledger frame ' + li + ' dt != timeAfter-timeBefore (tight bound)');
                        break;
                    }
                    if (f.trailLength !== froz.trailLength || f.trailRadius !== froz.trailRadius) {
                        errors.push('ledger frame ' + li + ' trail params not frozen defaults');
                        break;
                    }
                    const d = Array.isArray(raw.diagnosticInput) ? raw.diagnosticInput[li] : null;
                    if (
                        d &&
                        (d.frame !== f.frame ||
                            d.sessionGeneration !== f.sessionGeneration ||
                            d.x !== f.pointer.x ||
                            d.y !== f.pointer.y ||
                            Math.abs((d.dt ?? NaN) - f.dt) > EPS_DT)
                    ) {
                        errors.push('ledger frame ' + li + ' does not bind its diagnostic entry');
                        break;
                    }
                    const u = Array.isArray(raw.uploads) ? raw.uploads[li] : null;
                    if (u && (u.frame !== f.frame || u.uploadNativeReceipt?.frame !== f.frame)) {
                        errors.push('ledger frame ' + li + ' does not bind its upload/native receipt');
                        break;
                    }
                    prevFrame = f.frame;
                    prevTimeAfter = f.timeAfter;
                }
                if (
                    feFrames.length &&
                    typeof fs?.time === 'number' &&
                    Math.abs(fs.time - feFrames[0].timeBefore) > 1e-9
                )
                    errors.push('fixedStart.time must equal the first ledger timeBefore');
                if (
                    feFrames.length &&
                    typeof fe?.time === 'number' &&
                    Math.abs(fe.time - feFrames[feFrames.length - 1].timeAfter) > 1e-9
                )
                    errors.push('fixedEnd.time must equal the last ledger timeAfter');
            }
            // Deterministic Lissajous schedule recomputed from accumulated ACTUAL dt with a
            // stated float-precision bound: phase = sum(dt); x=.5+.3sin(1.7p); y=.5+.24cos(2.3p).
            if (Array.isArray(raw.diagnosticInput) && raw.diagnosticInput.length) {
                let phase = 0;
                const EPS_POS = 1e-6;
                for (const [i2, d] of raw.diagnosticInput.entries()) {
                    const dt = typeof d?.dt === 'number' && Number.isFinite(d.dt) && d.dt > 0 ? d.dt : NaN;
                    if (!Number.isFinite(dt)) break;
                    phase += dt;
                    const ex = 0.5 + 0.3 * Math.sin(1.7 * phase);
                    const ey = 0.5 + 0.24 * Math.cos(2.3 * phase);
                    if (Math.abs(d.x - ex) > EPS_POS || Math.abs(d.y - ey) > EPS_POS) {
                        errors.push('diagnostic input ' + i2 + ' diverges from the deterministic Lissajous schedule');
                        break;
                    }
                }
            }
        }
        // NATIVE GL upload proof (session-scoped hook log): every positive-dt update gets EXACTLY
        // ONE 64x1 RGBA/HALF_FLOAT/level0/offset0 upload on ONE stable texture; the full 256-word
        // payload must match the independent CPU replay of the diagnostic input.
        // hookErrors must be an EXPLICIT empty array (missing/string/false all reject).
        if (!Array.isArray(raw.hookErrors) || raw.hookErrors.length !== 0)
            errors.push('hookErrors must be an explicit empty array');
        const glLog = Array.isArray(raw.glUploads) ? raw.glUploads : [];
        // ALL 64x1 calls enter the selection first — an unexpected texImage2D 64x1 cannot
        // vanish; the actual upload method must then be texSubImage2D.
        const nativePoints = glLog.filter((u) => u?.width === 64 && u?.height === 1);
        if (nativePoints.some((u) => u.call !== 'texSubImage2D'))
            errors.push('native 64x1 upload used a call other than texSubImage2D');
        if (!glLog.length) errors.push('native GL upload log missing for the window');
        else if (!nativePoints.length) errors.push('no native 64x1 points uploads in the window');
        else if (nativePoints.length !== (Array.isArray(raw.updateCalls) ? raw.updateCalls.length : -1))
            errors.push(
                'native 64x1 uploads ' +
                    nativePoints.length +
                    ' != update calls (exact one-per-positive-dt, double/missing rejected)',
            );
        else if (
            nativePoints.some(
                (u) =>
                    u.target !== 3553 ||
                    u.level !== 0 ||
                    u.xoffset !== 0 ||
                    u.yoffset !== 0 ||
                    u.format !== 6408 ||
                    u.type !== 5131 ||
                    u.bytes !== 512,
            )
        )
            errors.push('native points upload target/format/type/level/offset/bytes invalid');
        else if (
            nativePoints.some((u) => !Number.isSafeInteger(u.texture) || u.texture <= 0) ||
            new Set(nativePoints.map((u) => u.texture)).size !== 1
        )
            errors.push('native points uploads need ONE positive safe-integer texture id');
        if (nativePoints.some((u) => !Number.isSafeInteger(u.sessionGeneration) || u.sessionGeneration <= 0))
            errors.push('native points uploads need positive safe-integer session generation');
        // Frame + session binding: each native upload's frame must match the corresponding update
        // call's frame; all uploads carry ONE session generation matching the diagnostic input.
        if (
            Array.isArray(raw.updateCalls) &&
            nativePoints.length === raw.updateCalls.length &&
            nativePoints.some((u, i2) => raw.updateCalls[i2]?.frame !== u.frame)
        )
            errors.push('native upload frame does not match the update-call sequence');
        if (new Set(nativePoints.map((u) => u.sessionGeneration)).size !== 1)
            errors.push('native uploads span multiple session generations (window contamination)');
        if (Array.isArray(raw.diagnosticInput) && raw.diagnosticInput.length && nativePoints.length) {
            const diagGen = raw.diagnosticInput[0]?.sessionGeneration;
            if (nativePoints.some((u) => u.sessionGeneration !== diagGen))
                errors.push('native upload session generation does not match diagnostic input');
        }
        if (Array.isArray(raw.diagnosticInput) && raw.diagnosticInput.length === nativePoints.length) {
            const oracleMod = require('./shaders-glass-trail-oracle.cjs');
            for (let i = 0; i < nativePoints.length; i++) {
                const words = nativePoints[i].payloadWords;
                if (
                    !Array.isArray(words) ||
                    words.length !== 256 ||
                    words.some((w) => !Number.isInteger(w) || w < 0 || w > 65535)
                ) {
                    errors.push('native upload ' + i + ' missing full 256-word integer payload (0-255)');
                    continue;
                }
                const rebuilt = Array.from(
                    oracleMod.replay(
                        raw.diagnosticInput.slice(0, i + 1),
                        oracleMod.defaults(),
                        profile.viewport.width * profile.dpr,
                        profile.viewport.height * profile.dpr,
                    ).bits,
                );
                if (rebuilt.length !== 256 || rebuilt.some((w, wi) => w !== words[wi])) {
                    errors.push('native upload ' + i + ' full payload does not match CPU replay (0-255)');
                    break;
                }
            }
        }
        const arrays = {
            update: raw.updateCalls,
            command: raw.commands,
            dispatch: raw.draws,
            queue: raw.queueBookkeeping,
        };
        const samples = {};
        for (const [kind, rows] of Object.entries(arrays)) {
            if (!Array.isArray(rows) || !rows.length) {
                errors.push(`${kind} missing`);
                continue;
            }
            if (
                rows.some(
                    (r) =>
                        !r ||
                        typeof r !== 'object' ||
                        !Number.isSafeInteger(r.frame) ||
                        !finite(r.ms) ||
                        r.frame < frames[0].frame - 1 ||
                        r.frame > frames.at(-1).frame,
                )
            )
                errors.push(`${kind} invalid raw sample`);
            samples[kind] = steady.map((frame) => {
                const r = rows.filter((row) => row && row.frame === frame.frame);
                if (!r.length || (kind === 'update' && r.length !== 1))
                    errors.push(`${kind} missing/duplicate ${frame.frame}`);
                return r.reduce((n, x) => n + x.ms, 0);
            });
        }
        if (
            !raw.methods?.commands?.includes('includes immediate GL') ||
            !raw.methods?.queue?.includes('not GPU command submission') ||
            !raw.methods?.frames?.includes('not monitor presentation')
        )
            errors.push('measurement semantics');
        // timerAvailable must be a real boolean.
        if (typeof raw.timerAvailable !== 'boolean') errors.push('timerAvailable must be a boolean');
        // Explicit structures even when the timer is unavailable: gpuSamples/queryEvents must
        // be explicit arrays (empty when unavailable) — malformed entries reject regardless.
        if (!Array.isArray(raw.gpuSamples)) errors.push('gpuSamples array required');
        else if (!raw.timerAvailable && raw.gpuSamples.length !== 0)
            errors.push('gpuSamples must be empty when the timer is unavailable');
        else if (
            raw.gpuSamples.some(
                (g) =>
                    !g ||
                    typeof g !== 'object' ||
                    !Number.isSafeInteger(g.frame) ||
                    typeof g.ms !== 'number' ||
                    !Number.isFinite(g.ms),
            )
        )
            errors.push('malformed GPU sample');
        if (!Array.isArray(raw.queryEvents)) errors.push('queryEvents array required');
        else if (
            raw.queryEvents.some(
                (q) => !q || typeof q !== 'object' || !Number.isSafeInteger(q.frame) || typeof q.event !== 'string',
            )
        )
            errors.push('malformed query event');
        const gpu = raw.gpuSamples;
        if (raw.timerAvailable) {
            if (
                !Array.isArray(gpu) ||
                !gpu.length ||
                gpu.some((r) => !r || typeof r !== 'object' || !Number.isSafeInteger(r.frame) || !finite(r.ms)) ||
                new Set(gpu.map((r) => r.frame)).size !== gpu.length
            )
                errors.push('native GPU samples');
            if (
                !Array.isArray(raw.queryEvents) ||
                raw.queryEvents.some((r) => !r || typeof r !== 'object' || r.event === 'timeout' || r.disjoint === true)
            )
                errors.push('GPU timeout/disjoint');
            for (const s of gpu || []) {
                const events = raw.queryEvents.filter((e) => e.frame === s.frame);
                if (
                    events.filter((e) => e.event === 'begin').length !== 1 ||
                    events.filter((e) => e.event === 'end').length !== 1 ||
                    events.filter((e) => e.event === 'resolved' && !e.disjoint).length !== 1
                )
                    errors.push('query frame pairing');
            }
        }
        if (
            !raw.device?.renderer ||
            !finite(raw.window?.durationMs) ||
            raw.window.durationMs <= 0 ||
            raw.window.start !== frames[0].frame ||
            raw.window.end !== frames.at(-1).frame
        )
            errors.push('device/window');
        return {
            errors,
            measurements: steady.length,
            steadyFrames: steady.map((r) => r.frame),
            warmup: frames.slice(0, 30),
            samples,
            frameMs: steady.map((r) => r.intervalMs),
            gpu: raw.timerAvailable ? (gpu || []).filter((r) => steadyIDs.has(r.frame)) : [],
            durationSeconds: steady.reduce((n, r) => n + r.intervalMs, 0) / 1000,
        };
    } catch (error) {
        errors.push('validator malformed input rejected: ' + String(error && error.message ? error.message : error));
        return { errors, measurements: 0 };
    }
}
module.exports = { PROFILES, validatePerformance };
