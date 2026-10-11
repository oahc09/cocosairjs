'use strict';
// E03 serialized performance reducer (single-pass shape effect: one native render pass per frame): same frozen profile/precision contract as the other
// Wave1/Wave2 shader collectors. Only run in a Lead-authorized quiet window.
// Read-only raw-measurement reduction. No browser launch or copied metric arrays.
const PROFILES = Object.freeze([
    { id: '720p', viewport: { width: 1280, height: 720 }, dpr: 1 },
    { id: '1080p', viewport: { width: 1920, height: 1080 }, dpr: 1 },
    { id: 'mobile-dpr', viewport: { width: 390, height: 844 }, dpr: 2 },
]);
const finite = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
function validatePerformance(raw, profile) {
    const errors = [];
    if (!raw || !profile) return { errors: ['missing profile'], measurements: 0 };
    const expected = PROFILES.find((p) => p.id === profile.id);
    if (!expected || JSON.stringify(expected) !== JSON.stringify(profile)) errors.push('profile descriptor');
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
        if (r.intervalMs <= 0 || !Number.isSafeInteger(r.drawCalls) || r.drawCalls < 1)
            errors.push('native draw/frame count');
    }
    // Any structurally invalid frame row makes the steady-window math meaningless; stop here
    // with the collected errors instead of dereferencing garbage downstream.
    if (errors.includes('frame row object')) return { errors, measurements: 0 };
    const steady = frames.slice(raw.warmupFrames),
        steadyIDs = new Set(steady.map((r) => r.frame));
    const arrays = { update: raw.updateCalls, command: raw.commands, dispatch: raw.draws, queue: raw.queueBookkeeping };
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
}
module.exports = { PROFILES, validatePerformance };
