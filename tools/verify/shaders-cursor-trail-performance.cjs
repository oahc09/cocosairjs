'use strict';
// Shared numeric timing reducer is reused unchanged; E08 adds its active-data workload gate.
const base = require('./shaders-liquid-metal-performance.cjs');
function validatePerformance(raw, profile) {
    const result = base.validatePerformance(raw, profile);
    const errors = [...result.errors];
    if (raw?.performancePath !== true || raw?.pointBudget !== 64) errors.push('active trace contract');
    const O = require('./shaders-cursor-trail-oracle.cjs');
    const expected = { ...O.defaults(), length: 2 };
    for (const snap of [raw?.fixedStart, raw?.fixedEnd]) {
        if (
            !snap ||
            JSON.stringify(snap.params) !== JSON.stringify(expected) ||
            snap.oneCanvas !== 1 ||
            snap.released !== false ||
            snap.paused !== false ||
            snap.trail?.count !== 64
        )
            errors.push('frozen active trail state');
    }
    if (!(raw?.fixedEnd?.frame > raw?.fixedStart?.frame) || !(raw?.fixedEnd?.time > raw?.fixedStart?.time))
        errors.push('timed state did not advance');
    if (!Array.isArray(raw?.frames)) return { ...result, errors };
    for (const row of raw.frames.slice(30)) {
        if (row?.trailCount !== 64 || row?.uploadBytes !== 512 || row?.uploadMethod !== 'DIAGNOSTIC_CPU_TRACE')
            errors.push('active 64-texel / 512-byte steady frame');
    }
    return { ...result, errors };
}
module.exports = { PROFILES: base.PROFILES, validatePerformance };
