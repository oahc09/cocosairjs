'use strict';
// C04 input-dissolve independent CPU oracle. The noise/reveal math is reimplemented from the
// pinned E01 lineage (MaterialX/OSL Perlin + 3-octave fbm + reveal mask) — pure JS, no GLSL
// parsing and no generator dependency. Input sampling is route-specific and independent:
// image = the real PNG bytes (sRGB→linear), procedural = the content shader math, rendered =
// the scene content math. Storage is premultiplied rgba8 with safe inverse.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const definition = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'examples/shader-input-dissolve/parameters.json'), 'utf8'),
);
const defaults = () => Object.fromEntries(Object.entries(definition.params).map(([k, d]) => [k, d.default]));

// ── Mother noise: MaterialX/OSL 2D gradient hash (uint32 semantics in JS) ──
const u32 = (x) => x >>> 0;
const rotate32 = (x, k) => u32((u32(x) << k) | (u32(x) >>> (32 - k)));
const latticeHash = (xi, yi) => {
    const origin = u32(0xdeadbeef + 8 + 13);
    let a = u32(origin + u32(xi)),
        b = u32(origin + u32(yi)),
        c = origin;
    c ^= b;
    c = u32(c - rotate32(b, 14));
    a ^= c;
    a = u32(a - rotate32(c, 11));
    b ^= a;
    b = u32(b - rotate32(a, 25));
    c ^= b;
    c = u32(c - rotate32(b, 16));
    a ^= c;
    a = u32(a - rotate32(c, 4));
    b ^= a;
    b = u32(b - rotate32(a, 14));
    c ^= b;
    c = u32(c - rotate32(b, 24));
    return c;
};
const gradient = (xi, yi, dx, dy) => {
    const h = u32(latticeHash(xi, yi)) & 7;
    const a = h < 4 ? dx : dy;
    const b = 2 * (h < 4 ? dy : dx);
    return ((h & 1) !== 0 ? -a : a) + ((h & 2) !== 0 ? -b : b);
};
const perlin = (px, py) => {
    const cx = Math.floor(px),
        cy = Math.floor(py);
    const fx = px - cx,
        fy = py - cy;
    const qx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const qy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = gradient(cx, cy, fx, fy);
    const b = gradient(cx + 1, cy, fx - 1, fy);
    const c = gradient(cx, cy + 1, fx, fy - 1);
    const d = gradient(cx + 1, cy + 1, fx - 1, fy - 1);
    return 0.6616 * ((a + (b - a) * qx) * (1 - qy) + (c + (d - c) * qx) * qy);
};
/** Aspect-aware stable 3-octave fbm coverage (mother coverage.noise). */
const coverage = (u, v, scale, seed, aspect) => {
    const px = u * aspect * scale + seed * 13.7;
    const py = v * scale + seed * 7.9;
    const a = perlin(px, py);
    const b = perlin(px * 2 + 17.3 + seed * 3.1, py * 2 + 9.1);
    const c = perlin(px * 4 + 41.7, py * 4 + 27.9 + seed * 5.3);
    return Math.max(0, Math.min(1, 0.5 + (0.9 * (a + 0.5 * b + 0.25 * c)) / 1.75));
};
/** Reveal mask (mother reveal): endpoints exact, hard or feathered front. */
const maskOf = (progress, softness, cov) => {
    if (progress <= 0) return 1;
    if (progress >= 1) return 0;
    if (softness === 0) return cov >= progress ? 1 : 0;
    const f = Math.max(softness, 0.0001);
    const front = progress * (1 + 2 * f) - f;
    const t = Math.max(0, Math.min(1, (cov - (front - f)) / (2 * f)));
    return t * t * (3 - 2 * t);
};

// ── Route samplers: straight-linear RGBA in [0,1] at a UV (texel-center, CLAMP, y-down top) ──
const srgbToLinear = (x) => {
    const c = x / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
/** The REAL example PNG, decoded once (deterministic asset — CPU verification source). */
let _imageData = null;
function realImageBytes() {
    if (!_imageData) {
        const { PNG } = require('pngjs');
        const png = PNG.sync.read(
            fs.readFileSync(path.join(ROOT, 'examples/shader-input-dissolve/assets/input-pattern.png')),
        );
        _imageData = { width: png.width, height: png.height, data: Array.from(png.data) };
    }
    return _imageData;
}
/** Image route: sample the REAL PNG bytes (sRGB → linear). */
function imageSampler(imageData, u, v) {
    const { width, height, data } = imageData;
    const tx = Math.max(0, Math.min(width - 1, Math.floor(u * width)));
    const ty = Math.max(0, Math.min(height - 1, Math.floor(v * height)));
    const i = (ty * width + tx) * 4;
    const straight = [srgbToLinear(data[i]), srgbToLinear(data[i + 1]), srgbToLinear(data[i + 2]), data[i + 3] / 255];
    return quantizedPremulRoundTrip(straight);
}
/** Procedural route: the content shader math in JS (deterministic hash + bands). */
// uint32 hash identical to the GPU chain (>>> 0 semantics in JS).
const hashU32 = (x) => {
    x = x >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    x = Math.imul(x, 0x7feb352d) >>> 0;
    x = (x ^ (x >>> 15)) >>> 0;
    x = Math.imul(x, 0x846ca68b) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    return x >>> 0;
};
const proceduralHash = (x, y) => hashU32((x + Math.imul(19349663, y)) >>> 0) / 4294967295;
function proceduralSampler(u, v, time, bands) {
    const band = Math.floor(u * Math.max(bands, 1));
    const lum = 0.2 + 0.6 * proceduralHash(band >>> 0, Math.floor(time * 60) >>> 0);
    const vertical = Math.min(1, Math.max(0, v));
    const t = vertical * vertical * (3 - 2 * vertical);
    const straight = [
        lum * 0.2 + (lum - lum * 0.2) * t,
        lum * 0.5 + (lum * 0.6 - lum * 0.5) * t,
        lum + (lum * 0.3 - lum) * t,
        1,
    ];
    return quantizedPremulRoundTrip(straight);
}
/** Rendered route: real multi-node scene content - four horizontal geometry bands with
 * distinct colors and a transparent window band (mirrors the rendered node layout). */
function renderedSampler(u, v) {
    const band = Math.min(3, Math.floor(u * 4));
    if (band === 0) return quantizedPremulRoundTrip([0.08, 0.2, 0.65, 1]);
    if (band === 1) return quantizedPremulRoundTrip([0.9, 0.55, 0.1, 0.5]);
    if (band === 2) return [0, 0, 0, 0];
    return quantizedPremulRoundTrip([0.12, 0.7, 0.25, 1]);
}
/** Route through the real storage contract: premultiplied rgba8 quantize -> safe inverse
 * (positive alpha divides; exactly zero alpha zeroes RGB). */
function quantizedPremulRoundTrip(straight) {
    const q = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255) / 255;
    const a = q(straight[3]);
    const premul = [straight[0], straight[1], straight[2]].map((c) => q(q(c) * a));
    const out = a > 0 ? premul.map((x) => x / a) : [0, 0, 0];
    return [out[0], out[1], out[2], a];
}

/**
 * Full model for one pixel. Routes: image (bytes) | procedural | rendered.
 * Returns straight linear RGBA (alpha scaled by the mask) and the display bytes
 * (one OETF + background blend).
 */
function model(pixelX, pixelY, width, height, params, presentation = {}) {
    const aspect = width / height;
    // Texel-center UV with the shader's y flip (visual top = v 0).
    const u = (pixelX + 0.5) / width;
    const v = 1 - (pixelY + 0.5) / height;
    const source =
        params.route === 'image'
            ? imageSampler(params.__imageData ?? realImageBytes(), u, v)
            : params.route === 'procedural'
              ? proceduralSampler(u, v, params.__time ?? 0, 8)
              : renderedSampler(u, v);
    if (params.dissolveEnabled === 'off') {
        // True input copy: straight passthrough, one OETF at display.
        return { straightLinear: [...source], mask: 1, coverage: null };
    }
    let cov = coverage(u, v, params.scale, params.seed, aspect);
    if (params.invert === 'on') cov = 1 - cov;
    const mask = maskOf(params.progress, params.softness, cov);
    return {
        straightLinear: [source[0], source[1], source[2], source[3] * mask],
        mask,
        coverage: cov,
        source,
    };
}
const encode = (x) => {
    const c = Math.max(0, Math.min(1, x));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
};
function displayOf(m, presentation = {}) {
    const bg = presentation.background || [8, 9, 12];
    const a = Math.max(0, Math.min(1, m.straightLinear[3]));
    return [
        ...m.straightLinear
            .slice(0, 3)
            .map((c, i) => Math.round(255 * Math.min(1, Math.max(0, encode(c) * a + (bg[i] / 255) * (1 - a))))),
        255,
    ];
}

const BYTE_TOLERANCE = 2;
const DOMAINS = [
    [0.5, 0.5],
    [0.25, 0.5],
    [0.75, 0.5],
    [0.5, 0.25],
    [0.5, 0.75],
    [0.125, 0.5],
    [0.375, 0.5],
    [0.625, 0.5],
    [0.875, 0.5],
    [0.5, 0.125],
    [0.5, 0.375],
    [0.5, 0.625],
    [0.5, 0.875],
    [0.25, 0.25],
    [0.75, 0.75],
];
const auditPoints = (width, height) =>
    DOMAINS.map(([u, v]) => ({
        x: Math.max(0, Math.min(width - 1, Math.floor(u * width))),
        y: Math.max(0, Math.min(height - 1, Math.floor(v * height))),
    })).filter((p, i, a) => a.findIndex((q) => q.x === p.x && q.y === p.y) === i);

function pngAudit(file, params, presentation = {}) {
    if (!params || typeof params !== 'object' || !['image', 'procedural', 'rendered'].includes(params.route))
        return { errors: ['params with a valid route required'], measurements: 0 };
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
        const expected = displayOf(model(p.x, p.y, png.width, png.height, params, presentation), presentation);
        const offset = ((png.height - 1 - p.y) * png.width + p.x) * 4;
        const actual = Array.from(png.data.subarray(offset, offset + 4));
        const maxError = Math.max(...actual.map((v, i) => Math.abs(v - expected[i])));
        points.push({ x: p.x, y: p.y, actual, expected, maxError });
        if (maxError > BYTE_TOLERANCE || !Number.isFinite(maxError))
            failures.push({ x: p.x, y: p.y, maxError, actual, expected });
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
function probeAudit(probe, params, options = {}) {
    const errors = [];
    if (!probe || typeof probe !== 'object') return { errors: ['probe object required'], measurements: 0 };
    const r = probe.gpuReceipt;
    if (!r || typeof r !== 'object') return { errors: ['GPU receipt object required'], measurements: 0 };
    if (r.targetRGBA8 !== true || r.transparentClear !== true || r.detached !== true || r.disposed !== true)
        return { errors: ['GPU receipt flags'], measurements: 0 };
    if (r.glError !== 0 || !Number.isSafeInteger(r.glError))
        return { errors: ['GPU receipt glError'], measurements: 0 };
    if (!Number.isSafeInteger(r.frame) || r.frame < 0) return { errors: ['GPU receipt frame'], measurements: 0 };
    if (!Number.isSafeInteger(r.canvas?.width) || !Number.isSafeInteger(r.canvas?.height))
        return { errors: ['GPU receipt canvas'], measurements: 0 };
    if (options.width !== undefined && r.canvas.width !== options.width) errors.push('canvas width');
    if (options.height !== undefined && r.canvas.height !== options.height) errors.push('canvas height');
    const pixels = probe.pixels;
    if (!Array.isArray(pixels) || !pixels.length) return { errors: [...errors, 'pixels'], measurements: 0 };
    const planned = auditPoints(r.canvas.width, r.canvas.height);
    if (pixels.length !== planned.length || pixels.some((p, i) => !p || p.x !== planned[i].x || p.y !== planned[i].y))
        return { errors: [...errors, 'sample set'], measurements: 0 };
    for (const p of pixels) {
        const rgba = Array.isArray(p.rgba) ? p.rgba : null;
        if (
            !rgba ||
            rgba.length !== 4 ||
            rgba.some((v) => typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v) || v < 0 || v > 255)
        ) {
            errors.push({ x: p.x, y: p.y, rule: 'malformed rgba (need exactly 4 finite integer bytes)' });
            continue;
        }
        const m = model(p.x, p.y, r.canvas.width, r.canvas.height, params);
        const expected = m.straightLinear.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255));
        const error = Math.max(...expected.map((n, i) => Math.abs(p.rgba[i] - n)));
        if (error > BYTE_TOLERANCE) errors.push({ x: p.x, y: p.y, expected, actual: p.rgba, error });
    }
    return { errors, measurements: pixels.length };
}
const OWNED_KINDS_BY_ROUTE = (route) =>
    route === 'image'
        ? ['mesh', 'material0', 'effect0', 'effect1', 'sourceTexture']
        : route === 'procedural'
          ? ['mesh', 'material0', 'material1', 'effect0', 'effect1']
          : [
                // rendered: 3 real scene slabs (opaque blue / half amber / transparent window skipped /
                // opaque green) each own their material + the dissolve material.
                'mesh',
                'slabMesh0',
                'slabMesh1',
                'slabMesh2',
                'material0',
                'material1',
                'material2',
                'material3',
                'effect0',
                'effect1',
            ];
function resourceAudit(raw) {
    const errors = [];
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.rows))
        return { errors: ['rows array required'], measurements: 0 };
    if (raw.rows.length !== 100) return { errors: ['exact 100'], measurements: 0 };
    let base;
    for (const [index, r] of raw.rows.entries()) {
        if (!r || typeof r !== 'object') {
            errors.push(`row-${index}`);
            continue;
        }
        if (r.index !== index || !Number.isSafeInteger(r.id)) errors.push(`alloc-${index}`);
        // Exact OWNED KINDS per route (order-insensitive set equality).
        const route = r.route;
        const want = OWNED_KINDS_BY_ROUTE(route);
        const refs = r.trace?.refs;
        if (!Array.isArray(refs) || !want) errors.push(`shape-${index}`);
        else {
            const got = refs.map((x) => x?.kind).sort();
            const expected = [...want].sort();
            if (JSON.stringify(got) !== JSON.stringify(expected)) errors.push(`kinds-${index}`);
            if (
                !refs.every(
                    (x) => x?.before === 1 && x?.after === 0 && Number.isFinite(x?.before) && Number.isFinite(x?.after),
                )
            )
                errors.push(`lifecycle-${index}`);
        }
        if (r.trace?.renderersUnbound !== true) errors.push(`unbind-${index}`);
        if (r.trace?.nodesRemoved !== true) errors.push(`nodes-${index}`);
        // RT routes REQUIRE real camera detach + RT disposal; image route has no RT (true).
        if (r.trace?.contentDetached !== true) errors.push(`detach-${index}`);
        if (r.trace?.sourceDisposed !== true) errors.push(`disposed-${index}`);
        // Repeat retirement idempotence lives on the trace (production structure).
        if (r.trace?.repeat?.idempotent !== true) errors.push(`idem-${index}`);
        if (r.nodeValid !== false) errors.push(`valid-${index}`);
        if (r.registryPresent !== false) errors.push(`registry-${index}`);
        const mems = [r.before, r.created, r.after].map((m) => [m?.bufferSize, m?.textureSize]).flat();
        if (mems.some((v) => !Number.isSafeInteger(v) || v < 0)) errors.push(`mem-${index}-safe`);
        else {
            if (!base) base = r.before;
            for (const key of ['bufferSize', 'textureSize']) {
                if (r.before[key] !== base[key] || r.after[key] !== r.before[key]) errors.push(`mem-${index}-${key}`);
                if (r.created[key] <= r.before[key]) errors.push(`mem-${index}-${key}-noalloc`);
            }
        }
    }
    if (new Set(raw.rows.filter((r) => r && Number.isSafeInteger(r.id)).map((r) => r.id)).size !== 100)
        errors.push('dup');
    return { errors, measurements: raw.rows.length };
}
function boundaryPlan() {
    const plan = [];
    for (const [name, d] of Object.entries(definition.params)) {
        if (name === 'time') continue;
        plan.push({ caseId: `${name}:default`, parameter: name, boundary: 'default', value: d.default });
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
    definition,
    defaults,
    coverage,
    maskOf,
    perlin,
    latticeHash,
    proceduralHash,
    quantizedPremulRoundTrip,
    coverage,
    maskOf,
    perlin,
    latticeHash,
    imageSampler,
    proceduralSampler,
    renderedSampler,
    model,
    displayOf,
    pngAudit,
    probeAudit,
    resourceAudit,
    boundaryPlan,
    auditPoints,
    OWNED_KINDS_BY_ROUTE,
    BYTE_TOLERANCE,
};
