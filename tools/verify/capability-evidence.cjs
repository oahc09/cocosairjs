/* A capability label is not proof: require current, complete rendered parameter A/B. */
function validatePhysicalEvidence(report, expected) {
    if (!report || report.ok !== true || report.candidateDrift) return { ok: false, reason: 'no successful complete physical report' };
    for (const field of ['bundleSha256', 'sourceSha256', 'runnerSha256']) {
        if (report[field] !== expected[field]) return { ok: false, reason: `stale ${field}` };
    }
    if (report.fixture?.sha256 !== expected.fixtureSha256) return { ok: false, reason: 'stale physical fixture' };
    if (!Array.isArray(report.records) || report.records.length !== 3) return { ok: false, reason: 'physical report must cover three browsers' };
    const engines = new Set();
    for (const row of report.records) {
        if (engines.has(row.engine) || !['chromium', 'firefox', 'webkit'].includes(row.engine)) return { ok: false, reason: 'duplicate or unsupported browser' };
        engines.add(row.engine);
        const r = row.result;
        if (!row.ok || row.failures?.length || !r || r.glError !== 0 || !r.sceneColorBound || !r.transmissionEnabled ||
            r.uniforms?.[0] !== 0 || r.uniforms?.[1] !== 1) return { ok: false, reason: `${row.engine}: invalid rendered control` };
        for (const [signal, minimum] of [[r.changedPixels, 50], [r.absoluteDifference, 1000],
            [r.volumeDifference?.changedPixels, 50], [r.dispersionDifference?.changedPixels, 20]]) {
            if (!Number.isFinite(signal) || signal < minimum) return { ok: false, reason: `${row.engine}: insufficient parameter pixel signal` };
        }
    }
    return { ok: true, reason: 'current three-browser transmission/volume/dispersion parameter pixels' };
}
module.exports = { validatePhysicalEvidence };
