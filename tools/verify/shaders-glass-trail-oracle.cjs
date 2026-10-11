'use strict';
// C03 Glass Trail independent CPU oracle. Composes E08 trail and E09 glass mother oracle
// functions directly (field/distance/lensUV/BLUR_DISK/unpremultiply/composite) with a
// parameterized trail-RT sampler. No global mutable state; bits passed explicitly.
const fs = require('node:fs'),
    path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const T = require('./shaders-cursor-trail-oracle.cjs');
const G = require('./shaders-glass-oracle.cjs');
const definition = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/shader-glass-trail/parameters.json'), 'utf8'));
const defaults = () => Object.fromEntries(Object.entries(definition.params).map(([k, d]) => [k, d.defaultValue]));
const clamp = (x) => Math.max(0, Math.min(1, x));

/** Map C03 params → E09 glass params (glass-prefixed keys override mother defaults). */
function glassParamsOf(params) {
    const g = { ...G.defaults(), shape: params.shape };
    for (const key of Object.keys(g)) {
        const prefixed = 'glass' + key[0].toUpperCase() + key.slice(1);
        if (params[prefixed] !== undefined) g[key] = params[prefixed];
    }
    return g;
}

/** Map C03 params → E08 trail params. */
function trailParamsOf(params) {
    return {
        ...T.defaults(),
        colorA: params.trailColorA,
        colorB: params.trailColorB,
        radius: params.trailRadius,
        shrink: params.trailShrink,
        softness: params.trailSoftness,
    };
}

/**
 * Trail RT texel: E08 capsule-chain scan at a texel, premultiplied and quantized to rgba8 bytes.
 * Returns raw bytes [r,g,b,a] (0–255). trail-off → [0,0,0,0].
 */
function trailTexel(bits, x, y, width, height, params) {
    if (params.trailEnabled === 'off') return [0, 0, 0, 0];
    const rgba = T.model(bits, x, y, width, height, trailParamsOf(params)).straightLinear;
    return rgba
        .slice(0, 3)
        .map((v) => Math.round(clamp(v * rgba[3]) * 255))
        .concat(Math.round(clamp(rgba[3]) * 255));
}

/**
 * Trail RT sampler callback: NEAREST texel lookup at (u,v), quantized bytes normalized to [0,1].
 * Returns premultiplied [r,g,b,a] in [0,1].
 */
function makeTrailSampler(bits, width, height, params) {
    return (u, v) => {
        const tx = Math.max(0, Math.min(width - 1, Math.floor(u * width)));
        const ty = Math.max(0, Math.min(height - 1, Math.floor(v * height)));
        return trailTexel(bits, tx, ty, width, height, params).map((a) => a / 255);
    };
}

/**
 * Full C03 model: E08 trail replay → RT texels → E09 glass chain (field/lensUV/Vogel blur/
 * aberration/composite) → straight linear RGBA. Uses mother oracle functions directly.
 */
/**
 * Production replay: rebuild the packed points texture from ACTUAL update frames, each with
 * its own deltaTime. dt === 0 frames are presentation-only ticks that must NOT ingest input
 * or advance the trajectory (frozen simulation contract); paused frames pass dt = 0.
 */
function replay(frames, params, width, height) {
    const aspect = width / height;
    const recorder = T.makeOracleRecorder();
    const ingested = [];
    for (const f of Array.isArray(frames) ? frames : []) {
        const dt = typeof f.dt === 'number' && Number.isFinite(f.dt) ? f.dt : 1 / 60;
        if (dt <= 0) continue; // presentation-only / paused tick: no point ingested
        // Each frame may carry its OWN aspect/trailLength/trailRadius (live resize or param
        // change mid-session); the CPU replays per-frame values, never the final ones
        // retrospectively.
        const fAspect = typeof f.aspect === 'number' && Number.isFinite(f.aspect) ? f.aspect : aspect;
        const fLen =
            typeof f.trailLength === 'number' && Number.isFinite(f.trailLength) ? f.trailLength : params.trailLength;
        const fRad =
            typeof f.trailRadius === 'number' && Number.isFinite(f.trailRadius) ? f.trailRadius : params.trailRadius;
        recorder.tick({ x: f.x, y: f.y }, dt, fLen, fRad, fAspect);
        ingested.push({ x: f.x, y: f.y, dt });
    }
    return { recorder, bits: recorder.texData, ingested };
}

/**
 * Full C03 model: E08 trail replay → RT texels → E09 glass chain (field/lensUV/Vogel blur/
 * aberration/composite) → straight linear RGBA. Uses mother oracle functions directly.
 * pointerPath entries may carry per-frame dt (default 1/60); dt 0 entries ingest nothing.
 */
function model(pixelX, pixelY, width, height, params, time, pointerPath, presentation = {}) {
    const aspect = width / height;
    // Consume the PRODUCTION replay helper: identical per-frame dt/aspect/length/radius
    // semantics (the old inline loop replayed every frame with the FINAL params — wrong for
    // mixed-aspect sessions such as a live resize).
    const bits = replay(pointerPath ?? [{ x: 0.5, y: 0.5 }], params, width, height).bits;
    // Map glass params.
    const g = glassParamsOf(params);
    // Trail sampler (NEAREST, premultiplied [0,1]).
    const sample = makeTrailSampler(bits, width, height, params);
    const uv = [(pixelX + 0.5) / width, (pixelY + 0.5) / height];
    const f = G.field(pixelX, pixelY, width, height, g);
    const s = G.distance(f[0], f[1], g.shape);
    const grad = [
        (G.distance(f[0] + 0.01, f[1], g.shape) - s) / 0.01,
        (G.distance(f[0], f[1] + 0.01, g.shape) - s) / 0.01,
    ];
    // Glass OFF: display copy — un-premultiply the base sample by its STORED alpha byte/255.
    if (params.glassEnabled === 'off') {
        const bytes = trailTexel(bits, pixelX, pixelY, width, height, params);
        const storedAlpha = bytes[3];
        const straight =
            storedAlpha > 0 ? [bytes[0] / storedAlpha, bytes[1] / storedAlpha, bytes[2] / storedAlpha] : [0, 0, 0];
        const bg0 = presentation.background || [8, 9, 12];
        const a0 = storedAlpha / 255;
        const encode0 = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
        const display0 = [
            ...straight.map((c, i) =>
                Math.round(255 * clamp(clamp(encode0(clamp(c))) * a0 + (bg0[i] / 255) * (1 - a0))),
            ),
            255,
        ];
        return { straightLinear: [...straight, storedAlpha / 255], display: display0, trailBytes: bytes };
    }
    // Full E09 glass chain: lens UV, Vogel blur, aberration, composite.
    const coords = G.lensUV(uv, s / g.scale, grad, g, aspect);
    const vogel = (at) => {
        if (g.blur === 0) return sample(at[0], at[1]);
        const sum = [0, 0, 0, 0];
        for (const [dx, dy] of G.BLUR_DISK) {
            const texel = sample(at[0] + (dx / width) * g.blur * 2, at[1] + (dy / height) * g.blur * 2);
            texel.forEach((v, i) => {
                sum[i] += v / 9;
            });
        }
        return sum;
    };
    const green = vogel(coords.lens);
    const lens = g.aberration > 0 ? [vogel(coords.red)[0], green[1], vogel(coords.blue)[2], green[3]] : green;
    const result = G.composite(
        G.unpremultiply(sample(uv[0], uv[1])),
        G.unpremultiply(lens),
        s / g.scale,
        grad,
        g,
        height,
    );
    const bg = presentation.background || [8, 9, 12];
    const a = clamp(result.straightLinear[3]);
    const encodeCh = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    const display = [
        ...result.straightLinear
            .slice(0, 3)
            .map((c, i) => Math.round(255 * clamp(clamp(encodeCh(clamp(c))) * a + (bg[i] / 255) * (1 - a)))),
        255,
    ];
    return {
        straightLinear: result.straightLinear,
        display,
        trailBytes: trailTexel(bits, pixelX, pixelY, width, height, params),
    };
}

const BYTE_TOLERANCE = 2;
const DOMAINS = [
    [0.5, 0.5],
    [0.45, 0.5],
    [0.5, 0.35],
    [0.5, 0.65],
    [0.5, 0.2],
    [0.5, 0.8],
    [0.3125, 0.5],
    [0.6875, 0.5],
    [0.08, 0.5],
    [0.92, 0.5],
    [0.5, 0.08],
    [0.5, 0.92],
    [0.25, 0.25],
    [0.75, 0.75],
    [0.35, 0.66],
];
function auditPoints(width, height) {
    return DOMAINS.map(([u, v]) => ({
        x: Math.max(0, Math.min(width - 1, Math.floor(u * width))),
        y: Math.max(0, Math.min(height - 1, Math.floor(v * height))),
    })).filter((p, i, a) => a.findIndex((q) => q.x === p.x && q.y === p.y) === i);
}
function pngAudit(file, params, time, pointerPath, presentation = {}) {
    // Structured rejection: a malformed pointerPath (e.g. presentation accidentally passed in
    // its place) must produce errors, never a TypeError.
    if (
        !Array.isArray(pointerPath) ||
        pointerPath.some(
            (p) =>
                !p ||
                typeof p.x !== 'number' ||
                typeof p.y !== 'number' ||
                !Number.isFinite(p.x) ||
                !Number.isFinite(p.y),
        )
    )
        return { errors: ['pointerPath must be an array of finite {x,y} points'], measurements: 0 };
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
        const m = model(p.x, p.y, png.width, png.height, params, time, pointerPath, presentation);
        const encode = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
        const bg = presentation.background || [8, 9, 12];
        const a = clamp(m.straightLinear[3]);
        const display = [
            ...m.straightLinear
                .slice(0, 3)
                .map((c, i) => Math.round(255 * clamp(clamp(encode(c)) * a + (bg[i] / 255) * (1 - a)))),
            255,
        ];
        const offset = ((png.height - 1 - p.y) * png.width + p.x) * 4;
        const actual = Array.from(png.data.subarray(offset, offset + 4));
        const maxError = Math.max(...actual.map((v, i) => Math.abs(v - display[i])));
        points.push({ x: p.x, y: p.y, actual, expected: display, maxError });
        if (maxError > BYTE_TOLERANCE || !Number.isFinite(maxError))
            failures.push({ x: p.x, y: p.y, maxError, actual, expected: display });
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
function byteChannels(v) {
    return (
        Array.isArray(v) &&
        v.length === 4 &&
        v.every((x) => typeof x === 'number' && Number.isFinite(x) && Number.isInteger(x) && x >= 0 && x <= 255)
    );
}
function probeAudit(probe, params, time, pointerPath, options = {}) {
    const errors = [];
    if (!probe || typeof probe !== 'object') return { errors: ['probe object required'], measurements: 0 };
    const r = probe.gpuReceipt;
    if (!r || typeof r !== 'object') return { errors: ['GPU receipt object required'], measurements: 0 };
    if (r.targetRGBA8 !== true || r.transparentClear !== true || r.detached !== true || r.disposed !== true)
        return { errors: ['flags'], measurements: 0 };
    if (r.glError !== 0 || !safeInt(r.glError)) return { errors: ['glError'], measurements: 0 };
    if (!safeInt(r.frame) || r.frame < 0 || typeof r.time !== 'number' || !Number.isFinite(r.time))
        return { errors: ['frame/time'], measurements: 0 };
    if (!safeInt(r.canvas?.width) || !safeInt(r.canvas?.height)) return { errors: ['canvas'], measurements: 0 };
    if (options.width !== undefined && r.canvas.width !== options.width) errors.push('width');
    if (options.height !== undefined && r.canvas.height !== options.height) errors.push('height');
    if (!safeInt(probe.frame) || probe.frame < 0) errors.push('probe frame');
    if (safeInt(probe.frame) && safeInt(r.frame) && r.frame + 1 !== probe.frame) errors.push('frame binding');
    if (typeof probe.time !== 'number' || !Number.isFinite(probe.time)) errors.push('probe time');
    else if (probe.time !== r.time) errors.push('time binding');
    if (r.time !== time) errors.push('frozen');
    const pixels = probe.pixels;
    if (!Array.isArray(pixels) || !pixels.length) return { errors: [...errors, 'pixels'], measurements: 0 };
    const planned = auditPoints(r.canvas.width, r.canvas.height);
    if (pixels.length !== planned.length || pixels.some((p, i) => !p || p.x !== planned[i].x || p.y !== planned[i].y))
        return { errors: [...errors, 'sample set'], measurements: 0 };
    for (const p of pixels) {
        if (!byteChannels(p.rgba)) {
            errors.push({ x: p.x, y: p.y, rule: 'malformed' });
            continue;
        }
        const val = model(p.x, p.y, r.canvas.width, r.canvas.height, params, time, pointerPath);
        const expected = val.straightLinear.map((x) => Math.round(clamp(x) * 255));
        const error = Math.max(...expected.map((n, i) => Math.abs(p.rgba[i] - n)));
        if (error > BYTE_TOLERANCE) errors.push({ x: p.x, y: p.y, expected, actual: p.rgba, error });
    }
    return { errors, measurements: pixels.length };
}
const OWNED_KINDS = ['mesh', 'trailMaterial', 'glassMaterial', 'trailEffect', 'glassEffect', 'pointsTexture'];
function resourceAudit(raw) {
    const errors = [];
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.rows))
        return { errors: ['rows array required'], measurements: 0 };
    if (raw.rows.length !== 100) return { errors: ['exact 100'], measurements: 0 };
    let base;
    for (const [index, entry] of raw.rows.entries()) {
        const r = entry;
        if (!r || typeof r !== 'object') {
            errors.push(`row-${index}`);
            continue;
        }
        if (r.index !== index || !safeInt(r.id)) errors.push(`alloc-${index}`);
        const refs = r.trace?.refs;
        if (!Array.isArray(refs) || refs.length !== OWNED_KINDS.length) errors.push(`shape-${index}`);
        else {
            const kinds = refs.map((x) => x?.kind).sort();
            if (JSON.stringify(kinds) !== JSON.stringify([...OWNED_KINDS].sort())) errors.push(`kinds-${index}`);
            if (!refs.every((x) => x?.before === 1 && x?.after === 0)) errors.push(`lifecycle-${index}`);
        }
        if (r.trace?.renderersUnbound !== true) errors.push(`unbind-${index}`);
        if (r.trace?.nodesRemoved !== true) errors.push(`nodes-${index}`);
        if (r.trace?.trailDetached !== true) errors.push(`detach-${index}`);
        if (r.trace?.trailDisposed !== true) errors.push(`disposed-${index}`);
        if (r.repeat?.idempotent !== true) errors.push(`idem-${index}`);
        if (r.nodeValid !== false) errors.push(`valid-${index}`);
        if (r.registryPresent !== false) errors.push(`registry-${index}`);
        // Memory must be finite safe non-negative integers; each cycle must actually
        // allocate (created exceeds baseline in at least one class) and return to baseline.
        if (
            !Number.isFinite(r.before?.bufferSize) ||
            !Number.isFinite(r.before?.textureSize) ||
            !Number.isFinite(r.created?.bufferSize) ||
            !Number.isFinite(r.created?.textureSize) ||
            !Number.isFinite(r.after?.bufferSize) ||
            !Number.isFinite(r.after?.textureSize)
        )
            errors.push(`mem-${index}-finite`);
        else if (
            [
                r.before.bufferSize,
                r.before.textureSize,
                r.created.bufferSize,
                r.created.textureSize,
                r.after.bufferSize,
                r.after.textureSize,
            ].some((v) => !Number.isSafeInteger(v) || v < 0)
        )
            errors.push(`mem-${index}-safe`);
        else {
            if (!base) base = r.before;
            for (const key of ['bufferSize', 'textureSize']) {
                if (r.before[key] !== base[key] || r.after[key] !== r.before[key]) errors.push(`mem-${index}-${key}`);
                if (r.created[key] <= r.before[key]) errors.push(`mem-${index}-${key}-noalloc`);
            }
        }
    }
    if (new Set(raw.rows.filter((r) => r && safeInt(r.id)).map((r) => r.id)).size !== 100) errors.push('dup');
    return { errors, measurements: raw.rows.length };
}
function boundaryPlan() {
    const plan = [];
    for (const [name, d] of Object.entries(definition.params)) {
        if (name === 'time') continue;
        plan.push({ caseId: `${name}:default`, parameter: name, boundary: 'default', value: d.defaultValue });
        if (d.type === 'number') {
            const span = d.max - d.min,
                near = span * 1e-6;
            for (const [b, v] of [
                ['min', d.min],
                ['max', d.max],
                ['near-min', d.min + near],
                ['near-max', d.max - near],
            ])
                plan.push({ caseId: `${name}:${b}`, parameter: name, boundary: b, value: v });
        }
        plan.push({
            caseId: `${name}:invalid`,
            parameter: name,
            boundary: 'invalid',
            value: d.type === 'number' ? 'wrong-type' : 'invalid-enum',
        });
    }
    return plan;
}
module.exports = {
    replay,
    definition,
    defaults,
    glassParamsOf,
    trailParamsOf,
    trailTexel,
    makeTrailSampler,
    model,
    pngAudit,
    probeAudit,
    resourceAudit,
    boundaryPlan,
    auditPoints,
    byteChannels,
    OWNED_KINDS,
    BYTE_TOLERANCE,
};
