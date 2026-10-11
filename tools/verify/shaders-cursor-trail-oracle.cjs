'use strict';
// Independent CPU oracle for E08: a SECOND implementation of the recorder semantics and the
// capsule-chain pixel scan, written from the upstream sources (not from our GLSL or recorder.ts)
// so a shared generator error is impossible. Includes the exact half-float converter port.
const fs = require('node:fs'),
    path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const definition = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/shader-cursor-trail/parameters.json'), 'utf8'));
const defaults = () => Object.fromEntries(Object.entries(definition.params).map(([key, d]) => [key, d.defaultValue]));
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (lo, hi, x) => {
    const t = clamp((x - lo) / (hi - lo));
    return t * t * (3 - 2 * t);
};
// ── Exact upstream half-float converter (dataEncoding.ts @ dbfd42ab, MIT) ──────────────────
const _f32 = new Float32Array(1),
    _i32 = new Int32Array(_f32.buffer);
function toHalfFloat(val) {
    const v = Math.max(-65504, Math.min(65504, val));
    _f32[0] = v;
    const x = _i32[0];
    let bits = (x >> 16) & 0x8000;
    let m = (x >> 12) & 0x07ff;
    const e = (x >> 23) & 0xff;
    if (e < 103) return bits;
    if (e > 142) {
        bits |= 0x7c00;
        bits |= (e === 255 ? 0 : 1) && x & 0x007fffff;
        return bits;
    }
    if (e < 113) {
        m |= 0x0800;
        bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
        return bits;
    }
    bits |= ((e - 112) << 10) | (m >> 1);
    bits += m & 1;
    return bits;
}
function fromHalfFloat(bits) {
    const sign = bits & 0x8000 ? -1 : 1;
    const exp = (bits >> 10) & 0x1f;
    const frac = bits & 0x3ff;
    if (exp === 0) return sign * frac * Math.pow(2, -24);
    if (exp === 31) return frac ? Number.NaN : sign * Number.POSITIVE_INFINITY;
    return sign * (frac / 1024 + 1) * Math.pow(2, exp - 15);
}
const MAX_POINTS = 64,
    SUBDIVISIONS = 3,
    WIDTH_MIN = 0.2,
    SPEED_FULL = 1.5;
// ── Oracle recorder: independent mirror of the upstream host recipe ────────────────────────
function makeOracleRecorder(origin = { x: 0.5, y: 0.5 }) {
    let prevX = origin.x,
        prevY = origin.y,
        smoothVX = 0,
        smoothVY = 0,
        headDist = 0,
        wasActive = false;
    const points = [];
    const texData = new Uint16Array(MAX_POINTS * 4);
    for (let i = 0; i < MAX_POINTS; i++) texData[i * 4 + 2] = toHalfFloat(1);
    function tick(pointer, deltaTime, length, radius, aspect) {
        const rawDt = Math.max(0, deltaTime);
        const dt = Math.min(rawDt, 0.1);
        const drawRadius = radius * 0.1;
        // Tracker (smoothing 0.2).
        const dx = pointer.x - prevX,
            dy = pointer.y - prevY;
        prevX = pointer.x;
        prevY = pointer.y;
        const invDt = 1 / Math.max(dt, 0.001);
        smoothVX = smoothVX * 0.8 + dx * invDt * 0.2;
        smoothVY = smoothVY * 0.8 + dy * invDt * 0.2;
        const smoothSpeed = Math.hypot(smoothVX, smoothVY);
        const dragDist = Math.hypot(dx, dy);
        const move = { x: pointer.x, y: pointer.y, prevX: pointer.x - dx, prevY: pointer.y - dy, dx, dy, smoothSpeed };
        // Age + front-cull.
        const ageRate = Math.min(rawDt, 0.25) / Math.max(0.1, length);
        for (const p of points) p.age = Math.min(1, p.age + ageRate);
        while (points.length > 0 && points[0].age >= 1) points.shift();
        if (dragDist > 0.001) {
            const stepDist = Math.hypot(move.dx * aspect, move.dy);
            const widthNow = Math.min(1, Math.max(WIDTH_MIN, Math.sqrt(Math.max(0, smoothSpeed) / SPEED_FULL)));
            if (points.length === 0) {
                points.push({ x: move.prevX, y: move.prevY, age: 0, link: 0, width: widthNow });
                points.push({ x: move.x, y: move.y, age: 0, link: 1, width: widthNow });
                headDist = stepDist;
            } else {
                const head = points[points.length - 1];
                head.x = move.x;
                head.y = move.y;
                head.age = 0;
                head.width = widthNow;
                headDist += stepDist;
                if (headDist >= Math.max(0.006, drawRadius * 0.5)) {
                    const n = points.length;
                    if (n >= 3 && points[n - 2].link === 1) {
                        const a = points[n - 3],
                            b = points[n - 2],
                            c = points[n - 1];
                        b.x = 0.25 * a.x + 0.5 * b.x + 0.25 * c.x;
                        b.y = 0.25 * a.y + 0.5 * b.y + 0.25 * c.y;
                    }
                    points.push({ x: move.x, y: move.y, age: 0, link: 1, width: widthNow });
                    headDist = 0;
                }
            }
            while (points.length > MAX_POINTS - 1) points.shift();
        }
        const active = points.length > 0;
        let count = 0;
        if (active || wasActive) {
            count = points.length > 0 ? points.length + 1 : 0;
            const one = toHalfFloat(1);
            for (let i = 0; i < MAX_POINTS; i++) {
                const base = i * 4;
                if (i < count) {
                    const p = points[Math.min(i, points.length - 1)];
                    texData[base] = toHalfFloat(p.x);
                    texData[base + 1] = toHalfFloat(p.y);
                    texData[base + 2] = toHalfFloat(p.age);
                    texData[base + 3] = toHalfFloat(i === points.length || p.link === 1 ? p.width : -p.width);
                } else {
                    texData[base] = 0;
                    texData[base + 1] = 0;
                    texData[base + 2] = one;
                    texData[base + 3] = 0;
                }
            }
        }
        wasActive = active;
        return { count, texData, points: points.map((p) => ({ ...p })) };
    }
    return { tick, points, texData };
}
// ── Oracle pixel scan — from the packed texels (decode half) ──────────────────────────────
function decodeTexel(bits, i) {
    const base = i * 4;
    return {
        x: fromHalfFloat(bits[base]),
        y: fromHalfFloat(bits[base + 1]),
        age: fromHalfFloat(bits[base + 2]),
        w: fromHalfFloat(bits[base + 3]),
    };
}
function scanPixel(bits, uv, aspect, radius, shrink, softness, viewportH) {
    const px = uv[0] * aspect,
        py = uv[1];
    const baseRadius = radius * 0.1;
    const edgeW = 1.5 / Math.max(viewportH, 1) + softness * baseRadius;
    const sharp = 4 / Math.max(baseRadius, 0.005);
    let minSdf = 100,
        ageSum = 0,
        wSum = 0,
        prev = null,
        prev2 = null,
        segments = 0;
    for (let i = 0; i < MAX_POINTS; i++) {
        const cur = decodeTexel(bits, i);
        if (cur.age < 1) {
            const cx = cur.x * aspect,
                cy = cur.y;
            const linked = cur.w > 0,
                prevAlive = prev !== null && prev.age < 1;
            if (linked && prevAlive) {
                const usePrev2 = prev.w > 0 && prev2 !== null && prev2.age < 1;
                const jx = prev.x * aspect,
                    jy = prev.y;
                const sx0 = usePrev2 ? (prev2.x * aspect + jx) / 2 : jx;
                const sy0 = usePrev2 ? (prev2.y + jy) / 2 : jy;
                const ageS = usePrev2 ? (prev2.age + prev.age) / 2 : prev.age;
                const widPrev = Math.abs(prev.w);
                const widS = usePrev2 ? (Math.abs(prev2.w) + widPrev) / 2 : widPrev;
                const ex = (jx + cx) / 2,
                    ey = (jy + cy) / 2,
                    ageE = (prev.age + cur.age) / 2,
                    widE = (widPrev + Math.abs(cur.w)) / 2;
                let sx = sx0,
                    sy = sy0,
                    sAge = ageS,
                    sWid = widS,
                    jMin = 100,
                    jAge = 1;
                for (let k = 0; k < SUBDIVISIONS; k++) {
                    const t = (k + 1) / SUBDIVISIONS,
                        omt = 1 - t;
                    const bx = omt * omt * sx0 + 2 * omt * t * jx + t * t * ex;
                    const by = omt * omt * sy0 + 2 * omt * t * jy + t * t * ey;
                    const bAge = ageS + (ageE - ageS) * t,
                        bWid = widS + (widE - widS) * t;
                    const ra = baseRadius * sWid * (1 - sAge * shrink),
                        rb = baseRadius * bWid * (1 - bAge * shrink);
                    const bax = bx - sx,
                        bay = by - sy;
                    const denom = Math.max(bax * bax + bay * bay, 1e-8);
                    const tt = clamp(((px - sx) * bax + (py - sy) * bay) / denom);
                    const dist = Math.hypot(px - (sx + bax * tt), py - (sy + bay * tt)) - (ra + (rb - ra) * tt);
                    if (dist < jMin) {
                        jMin = dist;
                        jAge = sAge + (bAge - sAge) * tt;
                    }
                    sx = bx;
                    sy = by;
                    sAge = bAge;
                    sWid = bWid;
                }
                minSdf = Math.min(minSdf, jMin);
                const w = Math.exp(-jMin * sharp);
                ageSum += jAge * w;
                wSum += w;
                segments++;
            } else {
                const dist = Math.hypot(px - cx, py - cy) - baseRadius * Math.abs(cur.w) * (1 - cur.age * shrink);
                minSdf = Math.min(minSdf, dist);
                const w = Math.exp(-dist * sharp);
                ageSum += cur.age * w;
                wSum += w;
            }
        }
        prev2 = prev;
        prev = cur;
    }
    const age = wSum > 0 ? ageSum / Math.max(wSum, 1e-20) : 0;
    const coverage = (1 - smooth(-edgeW, edgeW, minSdf)) * (1 - smooth(0.8, 1, age));
    return { age, coverage, minSdf, segments, wSum };
}
function decodeColor(value) {
    const channel = (x) => (x / 255 <= 0.04045 ? x / 255 / 12.92 : Math.pow((x / 255 + 0.055) / 1.055, 2.4));
    return [1, 3, 5].map((o) => channel(parseInt(value.slice(o, o + 2), 16)));
}
/** Full pixel model: packed texels → scan → age color ramp × coverage → display chain. */
function model(bits, pixelX, pixelY, width, height, params, presentation = {}) {
    const u = (pixelX + 0.5) / width,
        v = (pixelY + 0.5) / height,
        aspect = width / height;
    const scan = scanPixel(bits, [u, v], aspect, params.radius, params.shrink, params.softness, height);
    const a = decodeColor(params.colorA),
        b = decodeColor(params.colorB);
    const rgb = a.map((c, i) => c + (b[i] - c) * clamp(scan.age));
    const alpha = scan.coverage;
    const straight = [...rgb, alpha];
    const encode = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    const background = presentation.background || [8, 9, 12];
    const fragment = straight.slice(0, 3).map((c) => clamp(encode(c)));
    const display = [
        ...fragment.map((c, i) => Math.round(255 * clamp(c * alpha + (background[i] / 255) * (1 - alpha)))),
        255,
    ];
    return { scan, straightLinear: straight, display };
}
const BYTE_TOLERANCE = 2;
const DOMAINS = [
    [0.5, 0.5],
    [0.45, 0.5],
    [0.55, 0.5],
    [0.3, 0.5],
    [0.7, 0.5],
    [0.2, 0.5],
    [0.8, 0.5],
    [0.5, 0.3],
    [0.5, 0.7],
    [0.08, 0.08],
    [0.92, 0.92],
    [0.5, 0.42],
    [0.5, 0.58],
    [0.35, 0.5],
    [0.65, 0.5],
];
function auditPoints(width, height) {
    return DOMAINS.map(([u, v]) => ({
        x: Math.max(0, Math.min(width - 1, Math.floor(u * width))),
        y: Math.max(0, Math.min(height - 1, Math.floor(v * height))),
    })).filter((p, index, all) => all.findIndex((q) => q.x === p.x && q.y === p.y) === index);
}
function pngAudit(file, bits, params, presentation = {}) {
    let png;
    try {
        const { PNG } = require('pngjs');
        png = PNG.sync.read(fs.readFileSync(file));
    } catch (error) {
        return { errors: ['unreadable PNG: ' + String(error.message || error).split('\n')[0]], measurements: 0 };
    }
    const failures = [],
        points = [];
    for (const p of auditPoints(png.width, png.height)) {
        const expected = model(bits, p.x, p.y, png.width, png.height, params, presentation),
            offset = ((png.height - 1 - p.y) * png.width + p.x) * 4,
            actual = Array.from(png.data.subarray(offset, offset + 4));
        const maxError = Math.max(...actual.map((v, i) => Math.abs(v - expected.display[i])));
        points.push({ x: p.x, y: p.y, actual, expected: expected.display, maxError });
        if (maxError > BYTE_TOLERANCE || !Number.isFinite(maxError))
            failures.push({ x: p.x, y: p.y, maxError, actual, expected: expected.display });
    }
    return {
        errors: failures,
        measurements: points.length,
        points,
        width: png.width,
        height: png.height,
        tolerance: BYTE_TOLERANCE,
    };
}
const safeInt = (v) => Number.isSafeInteger(v);
function byteChannels(value) {
    return (
        Array.isArray(value) &&
        value.length === 4 &&
        value.every((v) => typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0 && v <= 255)
    );
}
function probeAudit(probe, bits, params, options = {}) {
    const errors = [];
    if (!probe || typeof probe !== 'object') return { errors: ['probe object required'], measurements: 0 };
    if (!Array.isArray(bits) && !ArrayBuffer.isView(bits))
        return { errors: ['packed texels required'], measurements: 0 };
    if (
        bits.length !== 256 ||
        Array.from(bits).some((x) => !Number.isInteger(x) || x < 0 || x > 65535 || !Number.isFinite(fromHalfFloat(x)))
    )
        return { errors: ['packed half channels'], measurements: 0 };
    const receipt = probe.gpuReceipt;
    if (!receipt || typeof receipt !== 'object') return { errors: ['GPU receipt object required'], measurements: 0 };
    if (
        receipt.targetRGBA8 !== true ||
        receipt.transparentClear !== true ||
        receipt.detached !== true ||
        receipt.disposed !== true
    )
        return { errors: ['GPU receipt flags'], measurements: 0 };
    if (receipt.glError !== 0 || !safeInt(receipt.glError)) return { errors: ['GPU receipt glError'], measurements: 0 };
    if (
        !safeInt(receipt.frame) ||
        receipt.frame < 0 ||
        typeof receipt.time !== 'number' ||
        !Number.isFinite(receipt.time)
    )
        return { errors: ['GPU receipt frame/time type'], measurements: 0 };
    if (
        !safeInt(receipt.canvas?.width) ||
        !safeInt(receipt.canvas?.height) ||
        receipt.canvas.width <= 0 ||
        receipt.canvas.height <= 0
    )
        return { errors: ['GPU receipt canvas dims'], measurements: 0 };
    if (options.width !== undefined && receipt.canvas.width !== options.width)
        errors.push('canvas width not frozen plan');
    if (options.height !== undefined && receipt.canvas.height !== options.height)
        errors.push('canvas height not frozen plan');
    if (!safeInt(probe.frame) || probe.frame < 0) errors.push('probe frame non-negative safe integer');
    if (
        safeInt(probe.frame) &&
        probe.frame >= 0 &&
        safeInt(receipt.frame) &&
        receipt.frame >= 0 &&
        receipt.frame + 1 !== probe.frame
    )
        errors.push('GPU receipt/FBO/frame binding');
    if (probe.time !== receipt.time || (options.time !== undefined && receipt.time !== options.time))
        errors.push('GPU time binding');
    const pixels = probe.pixels;
    if (!Array.isArray(pixels) || !pixels.length) return { errors: [...errors, 'GPU pixel scope'], measurements: 0 };
    const planned = auditPoints(receipt.canvas.width, receipt.canvas.height);
    if (pixels.length !== planned.length || pixels.some((p, i) => !p || p.x !== planned[i].x || p.y !== planned[i].y))
        return { errors: [...errors, 'probe sample set'], measurements: 0 };
    for (const p of pixels) {
        if (!byteChannels(p.rgba)) {
            errors.push({ x: p.x, y: p.y, rule: 'malformed-byte-channels', rgba: p.rgba });
            continue;
        }
        const value = model(bits, p.x, p.y, receipt.canvas.width, receipt.canvas.height, params);
        const expected = value.straightLinear.map((x) => Math.round(clamp(x) * 255));
        const error = Math.max(...expected.map((n, i) => Math.abs(p.rgba[i] - n)));
        if (error > BYTE_TOLERANCE || !Number.isFinite(error))
            errors.push({ x: p.x, y: p.y, expected, actual: p.rgba, error });
    }
    return { errors, measurements: pixels.length };
}
const OWNED_KINDS = ['mesh', 'material', 'effect', 'pointsTexture'];
function resourceAudit(raw) {
    const errors = [];
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.rows))
        return { errors: ['rows array required'], measurements: 0 };
    if (raw.rows.length !== 100) return { errors: ['Missing exact 100 cycles'], measurements: 0 };
    let base;
    for (const [index, entry] of raw.rows.entries()) {
        const r = entry;
        if (!r || typeof r !== 'object') {
            errors.push(`row-${index}-object`);
            continue;
        }
        if (r.index !== index || !safeInt(r.id)) errors.push(`allocation-${index}`);
        if (!Array.isArray(r.refsBefore) || r.refsBefore.length !== 4 || !r.refsBefore.every((x) => x === 1))
            errors.push(`refsBefore-${index}`);
        const refs = r.trace?.refs;
        if (!Array.isArray(refs) || refs.length !== 4) errors.push(`refs-shape-${index}`);
        else {
            const kinds = refs.map((x) => x?.kind).sort();
            if (JSON.stringify(kinds) !== JSON.stringify([...OWNED_KINDS].sort())) errors.push(`refs-kinds-${index}`);
            if (!refs.every((x) => x && safeInt(x.before) && safeInt(x.after) && x.before === 1 && x.after === 0))
                errors.push(`refs-lifecycle-${index}`);
        }
        if (r.trace?.samplerUnbound !== true) errors.push(`sampler-unbound-${index}`);
        if (r.trace?.rendererUnbound !== true) errors.push(`unbind-${index}`);
        if (r.trace?.nodeRemoved !== true) errors.push(`node-removed-${index}`);
        if (r.repeat?.idempotent !== true) errors.push(`idempotent-${index}`);
        if (r.nodeValid !== false) errors.push(`node-valid-${index}`);
        if (!Array.isArray(r.assetsValid) || r.assetsValid.length !== 4 || !r.assetsValid.every((x) => x === false))
            errors.push(`assets-invalid-${index}`);
        if (r.registryPresent !== false) errors.push(`registry-${index}`);
        if (
            !Number.isFinite(r.before?.bufferSize) ||
            !Number.isFinite(r.before?.textureSize) ||
            !Number.isFinite(r.after?.bufferSize) ||
            !Number.isFinite(r.after?.textureSize) ||
            !Number.isFinite(r.created?.bufferSize)
        ) {
            errors.push(`memory-finite-${index}`);
        } else {
            if (!base) base = r.before;
            for (const key of ['bufferSize', 'textureSize'])
                if (r.before[key] !== base[key] || r.after[key] !== r.before[key])
                    errors.push(`memory-${index}-${key}`);
            if (r.created.bufferSize <= r.before.bufferSize) errors.push(`no-buffer-allocation-${index}`);
        }
    }
    if (new Set(raw.rows.filter((r) => r && safeInt(r.id)).map((r) => r.id)).size !== 100)
        errors.push('duplicate-owner');
    return { errors, measurements: raw.rows.length };
}
function boundaryPlan() {
    const plan = [];
    for (const [name, d] of Object.entries(definition.params)) {
        plan.push({ caseId: `${name}:default`, parameter: name, boundary: 'default', value: d.defaultValue });
        if (d.type === 'number') {
            const span = d.max - d.min,
                near = span * 1e-6;
            for (const [boundary, value] of [
                ['min', d.min],
                ['max', d.max],
                ['near-min', d.min + near],
                ['near-max', d.max - near],
            ])
                plan.push({ caseId: `${name}:${boundary}`, parameter: name, boundary, value });
        }
        plan.push({
            caseId: `${name}:invalid`,
            parameter: name,
            boundary: 'invalid',
            value: d.type === 'number' ? 'wrong-type' : 'not-a-color',
        });
    }
    return plan;
}
module.exports = {
    definition,
    defaults,
    toHalfFloat,
    fromHalfFloat,
    makeOracleRecorder,
    scanPixel,
    decodeTexel,
    decodeColor,
    model,
    pngAudit,
    probeAudit,
    resourceAudit,
    boundaryPlan,
    auditPoints,
    byteChannels,
    OWNED_KINDS,
    MAX_POINTS,
    SUBDIVISIONS,
    WIDTH_MIN,
    SPEED_FULL,
    BYTE_TOLERANCE,
};
