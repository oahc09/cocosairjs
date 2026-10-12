'use strict';
const PROFILES = Object.freeze([
    { id: '720p', viewport: { width: 1280, height: 720 }, dpr: 1 },
    { id: '1080p', viewport: { width: 1920, height: 1080 }, dpr: 1 },
    { id: 'mobile-dpr', viewport: { width: 390, height: 844 }, dpr: 2 },
]);
const CONSUMERS = Object.freeze(['holographic', 'neon']);
const finite = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const integer = (x) => Number.isSafeInteger(x) && x >= 0;
const OPS = [
    'begin',
    'end',
    'beginRenderPass',
    'endRenderPass',
    'bindPipelineState',
    'bindDescriptorSet',
    'bindInputAssembler',
    'draw',
];
const DRAWS = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'];
function validatePerformance(raw, profile, consumer) {
    const errors = [];
    try {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: ['raw object required'] };
        if (!PROFILES.some((p) => JSON.stringify(p) === JSON.stringify(profile)) || !CONSUMERS.includes(consumer))
            errors.push('frozen profile/consumer');
        if (!Array.isArray(raw.frames) || raw.frames.length < 90) errors.push('frames window >=90');
        for (const f of raw.frames || [])
            if (
                !integer(f.frame) ||
                !finite(f.intervalMs) ||
                f.intervalMs <= 0 ||
                !finite(f.renderEnvelopeMs) ||
                f.drawCalls !== 1
            )
                errors.push('frame');
        if ((raw.frames || []).some((f, i, a) => i > 0 && f.frame <= a[i - 1].frame)) errors.push('frame order');
        for (const [key, names] of [
            ['commands', OPS],
            ['draws', DRAWS],
            ['updateCalls', null],
        ]) {
            if (!Array.isArray(raw[key]) || !raw[key].length) {
                errors.push('raw array:' + key);
                continue;
            }
            if (raw[key].some((x) => !integer(x.frame) || !finite(x.ms) || (names && !names.includes(x.operation))))
                errors.push('malformed:' + key);
        }
        for (const frame of (raw.frames || []).slice(30)) {
            const commands = raw.commands.filter((x) => x.frame === frame.frame);
            if (
                commands.filter((x) => x.operation === 'beginRenderPass').length !== 1 ||
                commands.filter((x) => x.operation === 'draw').length !== 1 ||
                raw.draws.filter((x) => x.frame === frame.frame).length !== 1 ||
                raw.updateCalls.filter((x) => x.frame === frame.frame).length !== 1
            )
                errors.push('native one pass/draw/update');
        }
        if (
            raw.warmupFrames !== 30 ||
            !finite(raw.window?.durationMs) ||
            raw.window.durationMs < 5000 ||
            raw.window.start !== raw.frames[0]?.frame ||
            raw.window.end !== raw.frames.at(-1)?.frame
        )
            errors.push('timed window');
        if (
            typeof raw.timerAvailable !== 'boolean' ||
            !Array.isArray(raw.gpuSamples) ||
            !Array.isArray(raw.queryEvents)
        )
            errors.push('GPU explicit');
        if (!raw.timerAvailable && (raw.gpuSamples.length || raw.queryEvents.length))
            errors.push('GPU unavailable contradiction');
        for (const sample of raw.gpuSamples) {
            if (!integer(sample.frame) || !finite(sample.ms)) errors.push('GPU sample');
            const events = raw.queryEvents.filter((x) => x.frame === sample.frame);
            const resolved = events.find((x) => x.event === 'resolved');
            if (
                !resolved ||
                resolved.disjoint !== false ||
                !finite(resolved.nanoseconds) ||
                Math.abs(resolved.nanoseconds / 1e6 - sample.ms) > 1e-9 ||
                !['begin', 'end', 'deleted'].every((event) => events.some((x) => x.event === event)) ||
                events.find((x) => x.event === 'deleted')?.nativeIsQueryAfter !== false
            )
                errors.push('GPU query pair');
        }
        if (!integer(raw.readPixelsDuringWindow) || raw.readPixelsDuringWindow !== 0) errors.push('timed readback');
        if (!raw.methods?.instrumentation?.includes('instrumented') || !raw.methods.commands?.includes('envelope'))
            errors.push('instrumentation disclosure');
        if (
            raw.viewport.width !== profile.viewport.width ||
            raw.viewport.height !== profile.viewport.height ||
            raw.viewport.dpr !== profile.dpr ||
            raw.viewport.backing.width !== profile.viewport.width * profile.dpr ||
            raw.viewport.backing.height !== profile.viewport.height * profile.dpr
        )
            errors.push('viewport');
        if (
            !raw.fixedStart ||
            !raw.fixedEnd ||
            raw.fixedStart.selectedConsumer !== consumer ||
            raw.fixedEnd.selectedConsumer !== consumer ||
            raw.fixedStart.currentInstance !== raw.fixedEnd.currentInstance ||
            raw.fixedEnd.frame <= raw.fixedStart.frame ||
            raw.fixedEnd.time <= raw.fixedStart.time
        )
            errors.push('fixed state progression');
    } catch (e) {
        errors.push('malformed:' + String(e.message));
    }
    return { errors };
}
module.exports = { PROFILES, CONSUMERS, validatePerformance };
