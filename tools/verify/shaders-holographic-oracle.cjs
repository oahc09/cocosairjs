'use strict';
// Independent CPU holographic oracle. Mirrors the shader's arithmetic in plain JS without
// parsing or executing GLSL, including an exact port of MaterialX `mx_noise_float` (2D): the
// Bob Jenkins lookup3 lattice hash with u32 wrap semantics, quintic fade, the 8-entry gradient
// table, bilerp and the 0.6616 scale. Not the Fi-hash family (different algorithm, unresolved
// provenance) — this is the MaterialX/OSL perlin the upstream surfaceNoise actually calls.
const fs = require('node:fs'),
    path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const definition = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/shader-holographic/parameters.json'), 'utf8'));
const defaults = () => Object.fromEntries(Object.entries(definition.params).map(([key, d]) => [key, d.defaultValue]));
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (lo, hi, x) => {
    const t = clamp((x - lo) / (hi - lo));
    return t * t * (3 - 2 * t);
};
// ── MaterialX perlin (2D) — u32 arithmetic, wrapping like WGSL ─────────────────────────────
const u32 = (x) => x >>> 0;
function rotl32(x, k) {
    return u32((x << k) | (x >>> (32 - k)));
}
function bjfinal(a0, b0, c0) {
    let a = a0,
        b = b0,
        c = c0;
    c = u32(c ^ b);
    c = u32(c - rotl32(b, 14));
    a = u32(a ^ c);
    a = u32(a - rotl32(c, 11));
    b = u32(b ^ a);
    b = u32(b - rotl32(a, 25));
    c = u32(c ^ b);
    c = u32(c - rotl32(b, 16));
    a = u32(a ^ c);
    a = u32(a - rotl32(c, 4));
    b = u32(b ^ a);
    b = u32(b - rotl32(a, 14));
    c = u32(c ^ b);
    c = u32(c - rotl32(b, 24));
    return c;
}
const DEADBEEF_SEED2 = u32(0xdeadbeef + 21);
function mxHashInt1(x, y) {
    return bjfinal(u32(DEADBEEF_SEED2 + x), u32(DEADBEEF_SEED2 + y), DEADBEEF_SEED2);
}
function mxGradientFloat2(hash, x, y) {
    const h = hash & 7,
        u = h < 4 ? x : y,
        v = 2 * (h < 4 ? y : x),
        uu = (h & 1) !== 0 ? -u : u,
        vv = (h & 2) !== 0 ? -v : v;
    return uu + vv;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
/** mx_perlin_noise_float (2D): exact CPU port of the GPU lattice noise. */
function mxNoiseFloat2(px, py) {
    const X = Math.floor(px),
        Y = Math.floor(py),
        fx = px - X,
        fy = py - Y,
        u = fade(fx),
        v = fade(fy),
        g0 = mxGradientFloat2(mxHashInt1(X, Y), fx, fy),
        g1 = mxGradientFloat2(mxHashInt1(X + 1, Y), fx - 1, fy),
        g2 = mxGradientFloat2(mxHashInt1(X, Y + 1), fx, fy - 1),
        g3 = mxGradientFloat2(mxHashInt1(X + 1, Y + 1), fx - 1, fy - 1),
        s1 = 1 - u;
    return 0.6616 * ((1 - v) * (g0 * s1 + g1 * u) + v * (g2 * s1 + g3 * u));
}
// ── Folded constants (300° studio key light; L pre-folded at f32 upstream) ────────────────
const LIGHT_X = Math.cos((300 * Math.PI) / 180),
    LIGHT_Y = Math.sin((300 * Math.PI) / 180),
    L = [0.37164708971977234, -0.6437116265296936, -0.6689647436141968];
const HLEN = Math.hypot(L[0], L[1], L[2] - 1);
const H = [L[0] / HLEN, L[1] / HLEN, (L[2] - 1) / HLEN];
const EPS = 0.008,
    NEPS = 0.02,
    TWO_PI = Math.PI * 2;
const SILVER = [0.72, 0.73, 0.76];
// IQ cosine palette with the EXACT thirds (thin-film's 0.3333/0.6667 stays distinct).
const rainbow = (t) => [0, 1 / 3, 2 / 3].map((phase) => Math.cos((t + phase) * TWO_PI) * 0.5 + 0.5);
function field(pixelX, pixelY, width, height, params) {
    const aspect = width / height,
        dx = ((pixelX + 0.5) / width - 0.5) * aspect,
        dy = (pixelY + 0.5) / height - 0.5,
        rad = params.rotation * (Math.PI / 180);
    return [
        (dx * Math.cos(rad) + dy * Math.sin(rad)) / params.scale,
        (dy * Math.cos(rad) - dx * Math.sin(rad)) / params.scale,
    ];
}
function distance(x, y, shape) {
    if (shape === 'circle') return Math.hypot(x, y) - 0.3;
    const qx = Math.abs(x) - 0.24,
        qy = Math.abs(y) - 0.16;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 0.04;
}
/**
 * Full layer-separated model at a canvas pixel. Returns the mx-noise taps, the dome/wrinkle
 * normal, the diffraction hue chain, lighting, flakes, grain, and the straight/display RGBA.
 */
function model(pixelX, pixelY, width, height, params, time, presentation = {}) {
    const f = field(pixelX, pixelY, width, height, params),
        suv = [f[0] + 0.5, f[1] + 0.5],
        pat = [suv[0] - 0.5, suv[1] - 0.5],
        sx = params.seed * 13.37,
        sy = params.seed * 7.77,
        pxH = 1 / height,
        t = time * params.speed;
    const s0 = distance(f[0], f[1], params.shape),
        sX = distance(f[0] + EPS, f[1], params.shape),
        sY = distance(f[0], f[1] + EPS, params.shape),
        sdf = s0 / params.scale;
    // Exact upstream silhouetteAlpha (materialParts.ts @ dbfd42ab): sharpEdge floor 0.001,
    // insideMask width max(sharpEdge/32, 1.5px), smoothstep(0,1,m) ease.
    const sharpEdge = Math.max(params.edgeSoftness * 0.5, 0.001),
        silhouetteW = Math.max(sharpEdge * 0.03125, pxH * 1.5),
        insideMask = clamp(-sdf / silhouetteW),
        transition = insideMask * insideMask * (3 - 2 * insideMask),
        cutout = sdf > pxH * 2;
    const grad = [(sX - s0) / EPS, (sY - s0) / EPS],
        edgeT = clamp(-sdf / 0.06),
        domeSlope = (1 - edgeT) * 0.35,
        baseN = [grad[0] * domeSlope, grad[1] * domeSlope],
        steepAtten = 1;
    const crScale = params.crinkleScale * 1.35,
        crAmp = params.crinkle * 0.8 * steepAtten,
        noiseAt = (x, y) => mxNoiseFloat2(x + sx, y + sy),
        w0 = noiseAt(pat[0] * crScale + 2.7, pat[1] * crScale + 11.3),
        wx = (noiseAt((pat[0] + NEPS) * crScale + 2.7, pat[1] * crScale + 11.3) - w0) / NEPS,
        wy = (noiseAt(pat[0] * crScale + 2.7, (pat[1] + NEPS) * crScale + 11.3) - w0) / NEPS,
        nRaw = [baseN[0] + wx * crAmp * 0.4, baseN[1] + wy * crAmp * 0.4, -1],
        nLen = Math.hypot(...nRaw),
        n = nRaw.map((v) => v / nLen);
    const fScale = params.foilScale * 2.2,
        drift = t * 0.06,
        blotchA = noiseAt(pat[0] * fScale + drift * LIGHT_X, pat[1] * fScale + drift * LIGHT_Y),
        blotchB =
            noiseAt(
                pat[0] * fScale * 2.1 + 5.2 - drift * LIGHT_X * 1.6,
                pat[1] * fScale * 2.1 + 9.4 - drift * LIGHT_Y * 1.6,
            ) * 0.4,
        blotch = blotchA + blotchB,
        normalTilt = n[0] * LIGHT_X + n[1] * LIGHT_Y,
        ramp = (pat[0] * LIGHT_X + pat[1] * LIGHT_Y) * 0.8,
        hue = blotch * 0.45 + ramp + normalTilt * 1.4 + t * 0.18 + params.hueShift / 360;
    const saturationC = clamp(params.saturation),
        spectral = rainbow(hue),
        foilTint = SILVER.map((c, i) => c + (spectral[i] - c) * saturationC * 0.85);
    const roughnessC = clamp(params.roughness),
        dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
        ndl = clamp(dot(n, L) * 0.5 + 0.5),
        ndh = clamp(dot(n, H)),
        sheen = Math.pow(ndh, 7) * 0.45 * (1 - roughnessC * 0.35),
        specExp = 42 + (12 - 42) * roughnessC,
        specCore = Math.pow(ndh, specExp) * 0.85 * (1 - roughnessC * 0.55),
        specRgb = foilTint.map((c, i) => c * sheen + (c + (1 - c) * 0.6) * specCore);
    const flakeN = noiseAt(pat[0] * 190, pat[1] * 190),
        flakePhase = noiseAt(pat[0] * 190 + 47.3, pat[1] * 190 - 31.1),
        twinkle = Math.sin(t * 2.2 + flakePhase * 12.6) * 0.5 + 0.5,
        flakeMask = smooth(0.52, 0.62, flakeN * 0.75 + twinkle * 0.3) * clamp(params.sparkle) * steepAtten,
        flakeHue = hue + 0.33 + flakePhase * 0.5,
        flakeRgb = rainbow(flakeHue).map((c) => c * (0.85 + twinkle * 0.55) * (ndl * 0.6 + 0.7));
    const grain = noiseAt((suv[0] - 0.5) * 420, (suv[1] - 0.5) * 420),
        grainMul = 1 + grain * roughnessC * 0.28,
        foilBase = foilTint.map((c, i) => c * (ndl * 0.5 + 0.62) + specRgb[i]),
        foilRgb = foilBase.map((c, i) => (c + (flakeRgb[i] - c) * flakeMask) * grainMul),
        finalRgb = foilRgb.map(clamp),
        straight = cutout ? [0, 0, 0, 0] : [...finalRgb, transition];
    // GLES fixed-point display chain: clamp the encoded fragment colour before SRC_ALPHA blend.
    const encode = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    const background = presentation.background || [9, 10, 14],
        displayAlpha = clamp(straight[3]),
        fragment = straight.slice(0, 3).map((c) => clamp(encode(c))),
        display = [
            ...fragment.map((c, i) =>
                Math.round(255 * clamp(c * displayAlpha + (background[i] / 255) * (1 - displayAlpha))),
            ),
            255,
        ];
    return {
        domain: f,
        stencil: { s0, sX, sY, eps: EPS, pxH, sdf },
        silhouette: { sharpEdge, w: silhouetteW, insideMask, transition, cutout },
        normal: { grad, edgeT, domeSlope, baseN, w0, wx, wy, crScale, crAmp, n },
        hue: { blotchA, blotchB, blotch, ramp, normalTilt, hue, spectral, foilTint },
        light: { ndl, ndh, sheen, specExp, specCore, specRgb },
        layers: {
            flakes: { flakeN, flakePhase, twinkle, mask: flakeMask, rgb: flakeRgb },
            grain: { value: grain, mul: grainMul },
            base: { rgb: foilBase, final: finalRgb },
        },
        cutout,
        straightLinear: straight,
        display,
    };
}
const BYTE_TOLERANCE = 2;
const DOMAINS = [
    [0.5, 0.5],
    [0.5, 0.35],
    [0.5, 0.65],
    [0.44, 0.5],
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
    })).filter((p, index, all) => all.findIndex((q) => q.x === p.x && q.y === p.y) === index);
}
function pngAudit(file, params, time, presentation = {}) {
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
        const expected = model(p.x, p.y, png.width, png.height, params, time, presentation),
            offset = ((png.height - 1 - p.y) * png.width + p.x) * 4,
            actual = Array.from(png.data.subarray(offset, offset + 4));
        const maxError = Math.max(...actual.map((v, i) => Math.abs(v - expected.display[i])));
        points.push({ x: p.x, y: p.y, actual, expected: expected.display, maxError });
        if (maxError > BYTE_TOLERANCE || !Number.isFinite(maxError))
            failures.push({ x: p.x, y: p.y, maxError, actual, expected: expected.display });
    }
    // The plan must include lit interior, silhouette-band and hard-zero outside points.
    const coverage = {
        lit: points.some((p, i) => !model(p.x, p.y, png.width, png.height, params, time, presentation).cutout),
        outside: points.some((p, i) => model(p.x, p.y, png.width, png.height, params, time, presentation).cutout),
    };
    if (!coverage.lit || !coverage.outside) failures.push({ rule: 'coverage-plan', coverage });
    return {
        errors: failures,
        measurements: points.length,
        points,
        width: png.width,
        height: png.height,
        tolerance: BYTE_TOLERANCE,
        background: presentation.background || [9, 10, 14],
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
/** Linear straight-RGBA render-target audit with strict frame/time binding. */
function probeAudit(probe, params, time, options = {}) {
    const errors = [];
    if (!probe || typeof probe !== 'object') return { errors: ['probe object required'], measurements: 0 };
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
    if (typeof probe.time !== 'number' || !Number.isFinite(probe.time)) errors.push('probe time finite number');
    else if (probe.time !== receipt.time) errors.push('probe/receipt time binding');
    if (receipt.time !== time) errors.push('probe time not frozen plan');
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
        const value = model(p.x, p.y, receipt.canvas.width, receipt.canvas.height, params, time);
        const expected = value.cutout ? [0, 0, 0, 0] : value.straightLinear.map((x) => Math.round(clamp(x) * 255));
        const error = Math.max(...expected.map((n, i) => Math.abs(p.rgba[i] - n)));
        if (error > BYTE_TOLERANCE || !Number.isFinite(error))
            errors.push({ x: p.x, y: p.y, expected, actual: p.rgba, error });
        if (value.cutout && (p.rgba[0] || p.rgba[1] || p.rgba[2] || p.rgba[3]))
            errors.push({ x: p.x, y: p.y, rule: 'outside-guard-not-zero', actual: p.rgba });
    }
    return { errors, measurements: pixels.length };
}
const OWNED_KINDS = ['mesh', 'material', 'effect'];
/** Owned-resource retirement audit: exactly 100 single-pass instances. */
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
        if (!Array.isArray(r.refsBefore) || r.refsBefore.length !== 3 || !r.refsBefore.every((x) => x === 1))
            errors.push(`refsBefore-${index}`);
        const refs = r.trace?.refs;
        if (!Array.isArray(refs) || refs.length !== 3) errors.push(`refs-shape-${index}`);
        else {
            const kinds = refs.map((x) => x?.kind).sort();
            if (JSON.stringify(kinds) !== JSON.stringify([...OWNED_KINDS].sort())) errors.push(`refs-kinds-${index}`);
            if (!refs.every((x) => x && safeInt(x.before) && safeInt(x.after) && x.before === 1 && x.after === 0))
                errors.push(`refs-lifecycle-${index}`);
        }
        if (r.trace?.rendererUnbound !== true) errors.push(`unbind-${index}`);
        if (r.trace?.nodeRemoved !== true) errors.push(`node-removed-${index}`);
        if (r.repeat?.idempotent !== true) errors.push(`idempotent-${index}`);
        if (r.nodeValid !== false) errors.push(`node-valid-${index}`);
        if (!Array.isArray(r.assetsValid) || r.assetsValid.length !== 3 || !r.assetsValid.every((x) => x === false))
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
            value: d.type === 'number' ? 'wrong-type' : 'invalid-shape',
        });
    }
    return plan;
}
/** Pure upstream silhouetteAlpha chain (materialParts.ts @ dbfd42ab) for direct math goldens. */
function silhouetteAlpha(sdf, edgeSoftness, pxH) {
    const sharpEdge = Math.max(edgeSoftness * 0.5, 0.001);
    const w = Math.max(sharpEdge * 0.03125, pxH * 1.5);
    const m = Math.max(0, Math.min(1, -sdf / w));
    return m * m * (3 - 2 * m);
}
module.exports = {
    silhouetteAlpha,
    definition,
    defaults,
    mxNoiseFloat2,
    mxHashInt1,
    mxGradientFloat2,
    bjfinal,
    rotl32,
    fade,
    rainbow,
    field,
    distance,
    model,
    pngAudit,
    probeAudit,
    resourceAudit,
    boundaryPlan,
    auditPoints,
    byteChannels,
    OWNED_KINDS,
    LIGHT_X,
    LIGHT_Y,
    L,
    H,
    BYTE_TOLERANCE,
};
