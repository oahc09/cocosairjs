'use strict';
// C04 input-dissolve serialized performance reducer: per (profile, route) window. Route pass
// contract: image = 1 actual pass + 1 draw; procedural/rendered = 2 passes + 2 draws.
const PROFILES = Object.freeze([
    { id: '720p', viewport: { width: 1280, height: 720 }, dpr: 1 },
    { id: '1080p', viewport: { width: 1920, height: 1080 }, dpr: 1 },
    { id: 'mobile-dpr', viewport: { width: 390, height: 844 }, dpr: 2 },
]);
const ROUTES = Object.freeze(['image', 'procedural', 'rendered']);
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
const finite = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const expectedPasses = (route) => (route === 'image' ? 1 : 2);
function validatePerformance(raw, profile, route) {
    // Guarded throughout: malformed raw/profile/route never throw.
    const errors = [];
    try {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            return { errors: ['raw object required'], measurements: 0 };
        if (!profile || typeof profile !== 'object') return { errors: ['missing profile'], measurements: 0 };
        if (!ROUTES.includes(route)) return { errors: ['unknown route'], measurements: 0 };
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
            if (r.intervalMs <= 0 || !Number.isSafeInteger(r.drawCalls) || r.drawCalls < expectedPasses(route))
                errors.push('native draw/frame count below the route pass contract');
        }
        if (errors.includes('frame row object')) return { errors, measurements: 0 };
        const steady = frames.slice(raw.warmupFrames);
        // readPixels must be exactly 0 inside the measured window.
        if (!Number.isSafeInteger(raw.readPixelsDuringWindow) || raw.readPixelsDuringWindow !== 0)
            errors.push('readPixelsDuringWindow must be exactly 0');
        // Command names + timing sanity.
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
        // Per steady frame: >= expectedPasses beginRenderPass AND >= expectedPasses real draws.
        const passByFrame = new Map(),
            drawByFrame = new Map();
        for (const r of Array.isArray(raw.commands) ? raw.commands : [])
            if (r?.name === 'beginRenderPass' && Number.isSafeInteger(r.frame))
                passByFrame.set(r.frame, (passByFrame.get(r.frame) || 0) + 1);
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
        for (const frame of steady) {
            const want = expectedPasses(route);
            if ((passByFrame.get(frame.frame) || 0) < want)
                errors.push(`beginRenderPass ${frame.frame} below route contract ${want}`);
            if ((drawByFrame.get(frame.frame) || 0) < want)
                errors.push(`native draw dispatch ${frame.frame} below route contract ${want}`);
        }
        // Active window: update evidence must exist.
        if (!Array.isArray(raw.updateCalls) || !raw.updateCalls.length) errors.push('update missing (empty window)');
        // GPU structures explicit even when the timer is unavailable.
        if (typeof raw.timerAvailable !== 'boolean') errors.push('timerAvailable must be a boolean');
        if (!Array.isArray(raw.gpuSamples)) errors.push('gpuSamples array required');
        else if (!raw.timerAvailable && raw.gpuSamples.length !== 0)
            errors.push('gpuSamples must be empty when the timer is unavailable');
        else if (
            raw.gpuSamples.some((g) => !g || typeof g !== 'object' || !Number.isSafeInteger(g.frame) || !finite(g.ms))
        )
            errors.push('malformed GPU sample');
        if (!Array.isArray(raw.queryEvents)) errors.push('queryEvents array required');
        else if (
            raw.queryEvents.some(
                (q) => !q || typeof q !== 'object' || !Number.isSafeInteger(q.frame) || typeof q.event !== 'string',
            )
        )
            errors.push('malformed query event');
        // Fixed-state snapshots: FULL structure required — params/route/viewport/backing/
        // background/linearDiagnostic/instance/frame/time/shaderPasses/renderTargets.
        const defaults = require('./shaders-input-dissolve-oracle.cjs').defaults();
        for (const [label, fsnap] of [
            ['fixedStart', raw.fixedStart],
            ['fixedEnd', raw.fixedEnd],
        ]) {
            if (!fsnap || typeof fsnap !== 'object') {
                errors.push(`${label} snapshot required`);
                continue;
            }
            if (fsnap.params?.route !== route) errors.push(`${label} route mismatch`);
            if (!sameParams(fsnap.params, defaults)) errors.push(`${label} params not frozen defaults`);
            if (
                fsnap.viewport?.width !== profile.viewport.width ||
                fsnap.viewport?.height !== profile.viewport.height ||
                fsnap.dpr !== profile.dpr ||
                fsnap.canvas?.width !== profile.viewport.width * profile.dpr ||
                fsnap.canvas?.height !== profile.viewport.height * profile.dpr
            )
                errors.push(`${label} viewport/canvas`);
            if (JSON.stringify(fsnap.background) !== JSON.stringify([8, 9, 12])) errors.push(`${label} background`);
            if (fsnap.linearDiagnostic !== false) errors.push(`${label} linearDiagnostic must be false`);
            if (!Number.isSafeInteger(f_snap_instance(fsnap)) || f_snap_instance(fsnap) <= 0)
                errors.push(`${label} positive instance`);
            if (!Number.isSafeInteger(fsnap.frame) || fsnap.frame < 0) errors.push(`${label} frame`);
            if (typeof fsnap.time !== 'number' || !Number.isFinite(fsnap.time) || fsnap.time < 0)
                errors.push(`${label} time`);
            if (
                !Array.isArray(fsnap.shaderPasses) ||
                !fsnap.shaderPasses.length ||
                fsnap.shaderPasses.some((sp) => sp?.shaderCompiled !== true)
            )
                errors.push(`${label} compiled shader passes`);
            if (
                route !== 'image' &&
                (fsnap.renderTargets?.source?.width !== profile.viewport.width * profile.dpr ||
                    fsnap.renderTargets?.source?.height !== profile.viewport.height * profile.dpr ||
                    fsnap.renderTargets?.source?.attached !== true)
            )
                errors.push(`${label} source RT evidence`);
        }
        if (Number.isSafeInteger(raw.fixedStart?.frame) && Number.isSafeInteger(raw.fixedEnd?.frame)) {
            if (raw.fixedEnd.frame <= raw.fixedStart.frame) errors.push('fixed frame did not advance');
            if (raw.fixedEnd.time <= raw.fixedStart.time) errors.push('fixed time did not advance');
            if (f_snap_instance(raw.fixedEnd) !== f_snap_instance(raw.fixedStart))
                errors.push('instance changed inside the window');
        }
        if (raw.fixedStart?.route !== undefined && raw.fixedEnd?.route !== raw.fixedStart?.route)
            errors.push('route changed inside the window');
        // Every command/draw sample: finite timing AND frame bound to the window frames.
        {
            const inWindow = (f) =>
                Number.isSafeInteger(f) && // The first AFTER_DRAW has no preceding interval and is omitted from frames.
                // Its native commands are retained as an explicit initial warmup frame.
                f >= frames[0].frame - 1 &&
                f <= frames[frames.length - 1].frame;
            if (
                Array.isArray(raw.commands) &&
                raw.commands.some((c) => !c || typeof c !== 'object' || !inWindow(c.frame) || !finite(c.ms))
            )
                errors.push('command frame outside window or non-finite ms');
            if (
                Array.isArray(raw.draws) &&
                raw.draws.some((d) => !d || typeof d !== 'object' || !inWindow(d.frame) || !finite(d.ms))
            )
                errors.push('draw frame outside window or non-finite ms');
        }
        // GPU samples REQUIRE paired query events: begin + end + resolved(non-disjoint) per
        // sampled frame; samples without pairing are fabricated evidence.
        if (Array.isArray(raw.gpuSamples) && raw.gpuSamples.length) {
            for (const g of raw.gpuSamples) {
                const events = Array.isArray(raw.queryEvents) ? raw.queryEvents.filter((q) => q.frame === g.frame) : [];
                if (
                    events.filter((q) => q.event === 'begin').length !== 1 ||
                    events.filter((q) => q.event === 'end').length !== 1 ||
                    events.filter((q) => q.event === 'resolved' && !q.disjoint).length !== 1
                )
                    errors.push('GPU sample frame ' + g.frame + ' lacks paired begin/end/resolved query events');
            }
        }
        // updateCalls: exactly one per steady frame with finite ms (not just any rows).
        if (Array.isArray(raw.updateCalls)) {
            const byFrame = new Map();
            let malformed = false;
            for (const u of raw.updateCalls) {
                if (!u || typeof u !== 'object' || !Number.isSafeInteger(u.frame) || !finite(u.ms)) {
                    malformed = true;
                    break;
                }
                byFrame.set(u.frame, (byFrame.get(u.frame) || 0) + 1);
            }
            if (malformed) errors.push('update call malformed');
            else
                for (const f of steady)
                    if ((byFrame.get(f.frame) || 0) !== 1) {
                        errors.push('update call missing/duplicate on steady frame ' + f.frame);
                        break;
                    }
        }
        // Device/window envelope.
        if (
            !raw.device?.renderer ||
            !finite(raw.window?.durationMs) ||
            raw.window.durationMs <= 0 ||
            raw.window.start !== frames[0].frame ||
            raw.window.end !== frames.at(-1).frame
        )
            errors.push('device/window');
        // Honest instrumentation labeling.
        if (!raw.methods?.instrumentation?.includes('instrumented')) errors.push('instrumentation cost label missing');
        const summary = (values) => {
            if (!values.length) return { available: false, count: 0, p50: null, p95: null };
            const sorted = [...values].sort((a, b) => a - b);
            return {
                available: true,
                count: values.length,
                p50: sorted[Math.floor((sorted.length - 1) * 0.5)],
                p95: sorted[Math.floor((sorted.length - 1) * 0.95)],
            };
        };
        const steadyIds = new Set(steady.map((f) => f.frame));
        return {
            statistics: {
                intervalMs: summary(steady.map((f) => f.intervalMs)),
                renderEnvelopeMs: summary(steady.map((f) => f.renderEnvelopeMs)),
                updateMs: summary(raw.updateCalls.filter((f) => steadyIds.has(f.frame)).map((f) => f.ms)),
                gpuMs: summary(raw.gpuSamples.filter((f) => steadyIds.has(f.frame)).map((f) => f.ms)),
            },
            errors: errors.length ? errors : [],
            measurements: steady.length,
            steadyFrames: steady.map((r) => r.frame),
            frameMs: steady.map((r) => r.intervalMs),
        };
    } catch (error) {
        errors.push('validator malformed input rejected: ' + String(error && error.message ? error.message : error));
        return { errors, measurements: 0 };
    }
}
const f_snap_instance = (fsnap) => fsnap?.instance;
function sameParams(a, b) {
    // Route is compared separately (each window runs ONE route against the frozen defaults).
    const keys = ['progress', 'scale', 'softness', 'seed', 'invert', 'dissolveEnabled'];
    return keys.every((k) => a?.[k] === b?.[k]);
}
module.exports = { PROFILES, ROUTES, validatePerformance, expectedPasses };
