'use strict';

const { readFileSync, statSync } = require('node:fs');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');
const { digest, writeNew } = require('./evidence.cjs');

const maxTraceBytes = 32 * 1024 * 1024;
const maxFrames = 120;
const maxFrameBytes = 3 * 1024 * 1024;
const maxPixels = 1920 * 1080;
const anchorName = 'AIR_TRACE_DOCUMENT_BEGIN';
const captureCategory = 'disabled-by-default-devtools.screenshot';

function decode(bytes) {
    if (!Buffer.isBuffer(bytes) || bytes.length > maxFrameBytes) throw new Error('Screenshot too large');
    if (bytes.length > 24 && bytes.toString('hex', 0, 8) === '89504e470d0a1a0a') {
        const w = bytes.readUInt32BE(16);
        const h = bytes.readUInt32BE(20);
        if (!w || !h || w * h > maxPixels) throw new Error('PNG dimensions outside calibration bounds');
        return PNG.sync.read(bytes);
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8)
        return jpeg.decode(bytes, { maxResolutionInMP: 2, maxMemoryUsageInMB: 32, tolerantDecoding: false });
    throw new Error('Trace snapshot has unsupported format');
}

const at = (image, u, v) => {
    const x = Math.min(image.width - 1, Math.floor(u * image.width));
    const y = Math.min(image.height - 1, Math.floor(v * image.height));
    const i = 4 * (x + y * image.width);
    return [image.data[i], image.data[i + 1], image.data[i + 2]];
};
const rgbDistance = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

function makeSignature(absent, present, bounds) {
    if (absent.width !== present.width || absent.height !== present.height)
        throw new Error('Reference viewport mismatch');
    if (
        !Array.isArray(bounds) ||
        bounds.length !== 4 ||
        bounds.some((n) => !Number.isFinite(n) || n < 0 || n > 1) ||
        bounds[0] >= bounds[2] ||
        bounds[1] >= bounds[3]
    )
        throw new Error('Expected normalized [left, top, right, bottom] ROI');
    const [l, t, r, b] = bounds;
    const points = [];
    // Only use strong, locally stable differences, away from resampling edges.
    for (let yi = 0; yi < 28; yi++) {
        for (let xi = 0; xi < 28; xi++) {
            const x = l + ((xi + 0.5) / 28) * (r - l);
            const y = t + ((yi + 0.5) / 28) * (b - t);
            const bg = at(absent, x, y);
            const fg = at(present, x, y);
            if (rgbDistance(bg, fg) < 90) continue;
            const neighbors = [
                [x - (r - l) / 56, y],
                [x + (r - l) / 56, y],
                [x, y - (b - t) / 56],
                [x, y + (b - t) / 56],
            ];
            if (
                neighbors.some(
                    ([u, v]) => rgbDistance(bg, at(absent, u, v)) > 20 || rgbDistance(fg, at(present, u, v)) > 20,
                )
            )
                continue;
            points.push({ x, y, bg, fg });
        }
    }
    if (points.length < 32) throw new Error('Insufficient isolated signature points');
    // A color fill can match an object-interior ROI. Require at least some background
    // context inside the ROI with no reference difference, away from the object boundary.
    const context = [];
    for (let yi = 0; yi < 14; yi++)
        for (let xi = 0; xi < 14; xi++) {
            const x = l + ((xi + 0.5) / 14) * (r - l);
            const y = t + ((yi + 0.5) / 14) * (b - t);
            const bg = at(absent, x, y);
            if (rgbDistance(bg, at(present, x, y)) < 8) context.push({ x, y, bg });
        }
    if (context.length < 16) throw new Error('Include distinctive stable canvas context in ROI');
    return { ratio: present.width / present.height, points, context };
}

function recognize(image, signature) {
    if (Math.abs(image.width / image.height / signature.ratio - 1) > 0.02)
        return { state: 'unknown', reason: 'ASPECT_MISMATCH' };
    const count = (points, k) => points.filter((p) => rgbDistance(at(image, p.x, p.y), p[k]) <= 38).length;
    const absentFraction = count(signature.points, 'bg') / signature.points.length;
    const presentFraction = count(signature.points, 'fg') / signature.points.length;
    const contextFraction = count(signature.context, 'bg') / signature.context.length;
    const state =
        contextFraction < 0.85
            ? 'unknown'
            : presentFraction >= 0.85
              ? 'present'
              : absentFraction >= 0.85
                ? 'absent'
                : 'unknown';
    return { state, absentFraction, presentFraction, contextFraction };
}

const hasCategory = (event, name) => typeof event.cat === 'string' && event.cat.split(',').includes(name);

function analyze(events, signature) {
    if (!Array.isArray(events)) throw new Error('Expected Chromium traceEvents');
    const anchors = events.filter((e) => e.name === anchorName && hasCategory(e, 'blink.user_timing'));
    if (anchors.length !== 1 || !Number.isSafeInteger(anchors[0].ts))
        throw new Error('Missing or ambiguous document mark');
    const start = anchors[0].ts;
    const screenshots = events.filter((e) => e.name === 'Screenshot' && hasCategory(e, captureCategory));
    if (screenshots.length > maxFrames) throw new Error('Snapshot count exceeds bound');
    const series = [];
    let lastTs = -1;
    for (const event of screenshots.sort((a, b) => a.ts - b.ts)) {
        if (!Number.isSafeInteger(event.ts) || event.ts <= lastTs)
            throw new Error('Invalid or ambiguous screenshot clock');
        lastTs = event.ts;
        if (event.ts < start) continue;
        const b64 = event.args?.snapshot;
        if (
            typeof b64 !== 'string' ||
            b64.length > Math.ceil(maxFrameBytes / 3) * 4 ||
            !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)
        )
            throw new Error('Invalid screenshot payload');
        const bytes = Buffer.from(b64, 'base64');
        series.push({ ms: (event.ts - start) / 1000, sha256: digest(bytes), ...recognize(decode(bytes), signature) });
    }
    const first = series.findIndex((s) => s.state === 'present');
    const before = series
        .slice(0, first < 0 ? series.length : first)
        .filter((s) => s.state === 'absent')
        .at(-1);
    const after = first < 0 ? null : series[first];
    const unstable = Boolean(after && series.slice(first + 1).some((s) => s.state === 'absent'));
    const lower = before?.ms ?? null;
    const upper = after?.ms ?? null;
    const status = unstable
        ? 'unstable'
        : !series.length
          ? 'no-postmark-snapshots'
          : upper === null
            ? 'not-observed'
            : lower === null
              ? 'left-censored'
              : 'bounded';
    return {
        timeOrigin: anchorName,
        declaredViewportAspect: signature.ratio,
        status,
        intervalMs: { lastAbsent: lower, firstPresent: upper, width: status === 'bounded' ? upper - lower : null },
        displayPresentMs: null,
        snapshots: series,
    };
}

function main([tracePath, absentPath, presentPath, roi, reportPath, ...rest]) {
    if (!tracePath || !absentPath || !presentPath || !roi || !reportPath || rest.length)
        throw new Error('Usage: visual-trace.cjs TRACE ABSENT.png PRESENT.png left,top,right,bottom NEW_REPORT.json');
    if (statSync(tracePath).size > maxTraceBytes) throw new Error('Trace file too large');
    for (const path of [absentPath, presentPath])
        if (statSync(path).size > maxFrameBytes) throw new Error('Reference image too large');
    const trace = readFileSync(tracePath);
    const absent = readFileSync(absentPath);
    const present = readFileSync(presentPath);
    const coords = roi.split(',');
    if (coords.some((part) => !part.trim())) throw new Error('Missing ROI coordinate');
    const region = coords.map(Number);
    const signature = makeSignature(decode(absent), decode(present), region);
    const report = analyze(JSON.parse(trace).traceEvents, signature);
    writeNew(reportPath, {
        scope: 'diagnostic-content-bracket-not-display-presentation',
        referenceSha256: { absent: digest(absent), present: digest(present) },
        signaturePoints: signature.points.length,
        roi: region,
        traceSha256: digest(trace),
        ...report,
    });
    if (report.status !== 'bounded') process.exitCode = 1;
}

if (require.main === module) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
module.exports = { anchorName, captureCategory, makeSignature, analyze, recognize };
