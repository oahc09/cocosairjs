'use strict';
// C01 serialized performance reducer (three-pass composition): same frozen profile/precision contract as the other
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
    if (!raw || typeof raw !== 'object') return { errors: ['missing raw'], measurements: 0 };
    if (!profile || typeof profile !== 'object' || !profile.id)
        return { errors: ['malformed profile'], measurements: 0 };
    const expected = PROFILES.find((p) => p.id === profile.id);
    if (!expected) return { errors: ['unknown profile: ' + profile.id], measurements: 0 };
    // Structure gate BEFORE any raw dereference: the FROZEN expected provides the viewport.
    if (
        !expected.viewport ||
        typeof expected.viewport.width !== 'number' ||
        typeof expected.viewport.height !== 'number' ||
        typeof expected.dpr !== 'number'
    )
        return { errors: ['frozen profile missing viewport/dpr'], measurements: 0 };
    if (!raw.viewport || typeof raw.viewport !== 'object')
        return { errors: ['raw viewport object required'], measurements: 0 };
    if (JSON.stringify(expected) !== JSON.stringify(profile)) errors.push('profile descriptor');
    if (
        !profile.viewport ||
        typeof profile.viewport.width !== 'number' ||
        typeof profile.viewport.height !== 'number'
    ) {
        errors.push('profile viewport missing/malformed');
    } else if (
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
        if (r.intervalMs <= 0 || !Number.isSafeInteger(r.drawCalls) || r.drawCalls < 3)
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
    // Every steady frame must show an actual beginRenderPass command and a real GL draw
    // dispatch (drawElements / drawArrays / instanced variants). Unknown operation names in
    // the timed window are structural garbage. readPixels during the window rejects.
    {
        const steadyIds = new Set(steady.map((f) => f.frame));
        const validDrawOps = new Set(['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']);
        const validPassOps = new Set([
            'beginRenderPass',
            'endRenderPass',
            'begin',
            'end',
            'bindPipelineState',
            'bindDescriptorSet',
            'bindInputAssembler',
            'draw',
        ]);
        // Only beginRenderPass counts as the pass; all others are valid commands but not passes.
        const passOnly = new Set(['beginRenderPass']);
        for (const c of Array.isArray(raw.commands) ? raw.commands : []) {
            if (!c || typeof c !== 'object' || !Number.isSafeInteger(c.frame)) {
                errors.push('command row structure');
                continue;
            }
            if (steadyIds.has(c.frame) && !validPassOps.has(c.name ?? c.operation))
                errors.push('command: unknown operation ' + (c.name ?? c.operation));
        }
        for (const d of Array.isArray(raw.draws) ? raw.draws : []) {
            if (!d || typeof d !== 'object' || !Number.isSafeInteger(d.frame)) {
                errors.push('draw row structure');
                continue;
            }
            if (steadyIds.has(d.frame) && !validDrawOps.has(d.name ?? d.operation))
                errors.push('draw: unknown draw operation ' + (d.name ?? d.operation));
        }
        const cmdArr = Array.isArray(raw.commands) ? raw.commands : [];
        const drawArr = Array.isArray(raw.draws) ? raw.draws : [];
        if (!Array.isArray(raw.commands)) errors.push('commands must be an array');
        if (!Array.isArray(raw.draws)) errors.push('draws must be an array');
        for (const frame of steady) {
            const hasPass =
                cmdArr.filter((c) => c && c.frame === frame.frame && passOnly.has(c.name ?? c.operation)).length >= 3;
            const hasDraw =
                drawArr.filter((d) => d && d.frame === frame.frame && validDrawOps.has(d.name ?? d.operation)).length >=
                3;
            if (!hasPass) errors.push('steady frame ' + frame.frame + ' missing beginRenderPass');
            if (!hasDraw) errors.push('steady frame ' + frame.frame + ' missing native draw');
        }
        if (!Number.isSafeInteger(raw.readPixelsDuringWindow) || raw.readPixelsDuringWindow !== 0)
            errors.push(
                'readPixelsDuringWindow must be a finite safe integer exactly 0, got ' +
                    String(raw.readPixelsDuringWindow),
            );
    }
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
        for (const s of Array.isArray(gpu) ? gpu : []) {
            const events = (Array.isArray(raw.queryEvents) ? raw.queryEvents : []).filter(
                (e) => e && e.frame === s.frame,
            );
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
        gpu: raw.timerAvailable && Array.isArray(gpu) ? gpu.filter((r) => steadyIDs.has(r.frame)) : [],
        durationSeconds: steady.reduce((n, r) => n + r.intervalMs, 0) / 1000,
    };
}
module.exports = { PROFILES, validatePerformance };
