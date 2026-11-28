const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { brotliCompressSync, constants, gzipSync } = require('node:zlib');

function digest(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function writeNew(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 4) + '\n', { flag: 'wx' });
}

function identity(bytes) {
    return {
        sha256: digest(bytes),
        rawBytes: bytes.length,
        gzipBytes: gzipSync(bytes, { level: 9 }).length,
        brBytes: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }).length,
    };
}

function timingPresent(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function audit(attempt, viewport) {
    const mark = attempt?.marks;
    const required = [
        'bootstrapEntry',
        'moduleImportStart',
        'moduleImportEnd',
        'engineInitStart',
        'engineInitEnd',
        'sceneBuildStart',
        'sceneBuildEnd',
        'sceneActivateStart',
        'firstDrawEvent',
    ];
    if (
        !mark ||
        !required.every((key, i) => timingPresent(mark[key]) && (i === 0 || mark[key] >= mark[required[i - 1]]))
    )
        return 'MISSING_OR_UNORDERED_MARK';
    if (attempt.errors?.length !== 0) return 'BROWSER_ERROR';
    if (
        !Array.isArray(mark.framebuffer) ||
        mark.framebuffer[0] !== viewport.width ||
        mark.framebuffer[1] !== viewport.height ||
        mark.dpr !== viewport.dpr ||
        mark.antialias !== viewport.msaa
    )
        return 'FRAMEBUFFER_MISMATCH';
    if (attempt.caseId === 'S02') {
        if (
            !timingPresent(mark.inputAt) ||
            mark.inputAt < mark.firstDrawEvent ||
            !timingPresent(mark.inputDrawEvent) ||
            mark.inputDrawEvent < mark.inputAt ||
            !(mark.inputFrame >= 2) ||
            !Number.isFinite(mark.rotation) ||
            Math.abs(mark.rotation - 15) > 0.001
        )
            return 'INPUT_EFFECT_MISSING';
    } else if (attempt.caseId !== 'S01') {
        return 'CASE_NOT_IMPLEMENTED';
    }
    const bytes = attempt.bundleTiming?.decodedBodySize;
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes !== attempt.bundleBytes) return 'BUNDLE_TIMING_MISMATCH';
    return null;
}

function visualProbe(caseId, before, after) {
    const colorAt = (image, x, y) => [...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 3)];
    const sample = (image) => ({
        center: colorAt(image, image.width >> 1, image.height >> 1),
        corner: colorAt(image, 16, 16),
    });
    if (
        before.width !== 1280 ||
        before.height !== 720 ||
        (after && (after.width !== before.width || after.height !== before.height))
    )
        return { ok: false };
    const initial = sample(before);
    const close = (value, expected) => value.every((channel, i) => Math.abs(channel - expected[i]) <= 4);
    const clear = [56, 56, 56];
    if (caseId === 'S01') return { initial, ok: close(initial.corner, clear) && close(initial.center, clear) };
    if (!after) return { initial, ok: false };
    const rotated = sample(after);
    let changed = 0;
    for (let i = 0; i < before.data.length; i += 4) {
        if (Math.abs(before.data[i] - after.data[i]) > 16) changed += 1;
    }
    const orange = [255, 128, 64];
    return {
        initial,
        rotated,
        changed,
        ok:
            close(initial.corner, clear) &&
            close(rotated.corner, clear) &&
            close(initial.center, orange) &&
            close(rotated.center, orange) &&
            changed >= 100,
    };
}

module.exports = { audit, digest, identity, visualProbe, writeNew };
