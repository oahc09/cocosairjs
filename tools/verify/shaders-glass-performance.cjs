'use strict';
// Our two-pass timing reducer is reused unchanged; Glass adds actual frosted-state binding.
const B = require('./shaders-emboss-performance.cjs');
const O = require('./shaders-glass-oracle.cjs');
function validatePerformanceInner(raw, profile) {
    if (!B.PROFILES.some((p) => JSON.stringify(p) === JSON.stringify(profile)))
        return { errors: ['frozen profile descriptor'], measurements: 0 };
    const r = B.validatePerformance(raw, profile),
        errors = [...r.errors],
        expected = { ...O.defaults(), blur: 8 };
    for (const state of [raw?.fixedStart, raw?.fixedEnd]) {
        if (
            !state ||
            JSON.stringify(state.params) !== JSON.stringify(expected) ||
            state.oneCanvas !== 1 ||
            state.released !== false ||
            state.linearDiagnostic !== false ||
            state.paused !== false ||
            JSON.stringify(state.viewport) !== JSON.stringify(profile.viewport) ||
            state.dpr !== profile.dpr ||
            state.canvas?.width !== profile.viewport.width * profile.dpr ||
            state.canvas?.height !== profile.viewport.height * profile.dpr ||
            state.childTarget?.attached !== true
        )
            errors.push('frozen native frosted state');
    }
    if (raw?.readPixelsDuringWindow !== 0) errors.push('timed readback');
    for (const f of Array.isArray(raw?.frames) ? raw.frames.slice(30) : []) {
        if (
            !Array.isArray(raw.commands) ||
            raw.commands.filter((c) => c?.frame === f?.frame && c.operation === 'beginRenderPass').length < 2
        )
            errors.push('missing two native passes');
        if (
            !Array.isArray(raw.draws) ||
            raw.draws.filter(
                (c) =>
                    c?.frame === f?.frame &&
                    ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'].includes(
                        c.operation,
                    ),
            ).length < 2
        )
            errors.push('missing two native draw dispatches');
    }
    return { ...r, errors };
}
function validatePerformance(raw, profile) {
    try {
        return validatePerformanceInner(raw, profile);
    } catch (error) {
        return { errors: ['malformed raw performance: ' + error.message], measurements: 0 };
    }
}
module.exports = { PROFILES: B.PROFILES, validatePerformance };
