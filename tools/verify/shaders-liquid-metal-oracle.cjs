'use strict';
// Independent CPU Liquid Metal oracle. Mirrors the shader's arithmetic in plain JS without
// parsing or executing GLSL, including the MaterialX perlin port (lookup3 lattice hash, u32
// semantics). NOISE SUBSTITUTION documented: upstream's relief reads perlin12d (Fi-hash
// hash22 — not adopted); the substitute is mx perlin with central-difference slopes.
const fs = require('node:fs'),
    path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const definition = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/shader-liquid-metal/parameters.json'), 'utf8'));
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
// ── Upstream helper bodies (verified sources) ─────────────────────────────────────────────
/** materialParts.ts flowWarpOffset: two incommensurate sin·cos products. */
function flowWarp(wx, wy, flowT) {
    return [
        Math.sin(wx * 1.7 + flowT * 0.7 + 1.7) * Math.cos(wy * 1.3 + flowT * 0.5 + 2.3),
        Math.cos(wx * 1.4 + flowT * 0.9 + 8.7) * Math.sin(wy * 1.6 + flowT * 0.6 + 5.1),
    ];
}
/** effects/bevel.ts bevelSin: round vs machined sin-theta profile. */
function bevelSin(t, shape) {
    const sRound = 1 - t,
        k1 = smooth(0, 0.14, t),
        k2 = smooth(0.68, 0.92, t),
        sMach = 1 + (0.72 * (1 - k2) - 1) * k1;
    return sRound + (sMach - sRound) * shape;
}
/** lighting.ts bevelledFlatNormal. */
function bevelledFlatNormal(grad, sinTilt) {
    const glen = Math.max(Math.hypot(...grad), 0.0001),
        sB = Math.min(sinTilt, 0.9995);
    return [(grad[0] / glen) * sB, (grad[1] / glen) * sB, -Math.sqrt(1 - sB * sB)];
}
/** LiquidMetal index.ts liquidStudio: 3-softbox studio, rotated env frame. */
function liquidStudio(rx, ry, envC, envS, keyRad, drift, envStr) {
    const ex = rx * envC - ry * envS,
        ey = rx * envS + ry * envC,
        sky = smooth(-0.7, 0.85, ey);
    let lum = sky * sky * 0.4;
    const boxes = [
        [0.0 + drift, 0.55, keyRad * 1.05, 1.75],
        [-0.45 + drift, -0.4, keyRad * 1.25, 1.15],
        [0.55 + drift, 0.1, keyRad * 1.15, 1.1],
    ];
    for (const [bx, by, r, gain] of boxes) {
        const d = Math.hypot(ex - bx, ey - by),
            box = 1 - smooth(r * 0.2, r, d); // explicit ordered inverse
        lum += box * gain * envStr;
    }
    return lum;
}
/** E03-verified upstream silhouetteAlpha chain. */
function silhouetteAlpha(sdf, edgeSoftness, pxH) {
    const sharpEdge = Math.max(edgeSoftness * 0.5, 0.001);
    const w = Math.max(sharpEdge * 0.03125, pxH * 1.5);
    const m = Math.max(0, Math.min(1, -sdf / w));
    return m * m * (3 - 2 * m);
}
const DEG_TO_RAD = Math.PI / 180,
    FEPS = 0.01,
    RELIEF_EPS = 0.1;
// Metal ramp: sRGB #141414 → #eef0f6 decoded to linear once.
function srgb8ToLinear(x) {
    const c = x / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const DARK = [0x14, 0x14, 0x14].map(srgb8ToLinear),
    LIGHT = [0xee, 0xf0, 0xf6].map(srgb8ToLinear);
function field(pixelX, pixelY, width, height, params) {
    const aspect = width / height,
        dx = ((pixelX + 0.5) / width - 0.5) * aspect,
        dy = (pixelY + 0.5) / height - 0.5,
        rad = params.rotation * DEG_TO_RAD;
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
/** Substitute relief slope: mx perlin central differences, gain 0.62, clamp ±4. */
function clampedReliefSlope(qw) {
    const e = RELIEF_EPS,
        dx = (mxNoiseFloat2(qw[0] + e, qw[1]) - mxNoiseFloat2(qw[0] - e, qw[1])) / (e * 2),
        dy = (mxNoiseFloat2(qw[0], qw[1] + e) - mxNoiseFloat2(qw[0], qw[1] - e)) / (e * 2);
    return [Math.max(-4, Math.min(4, dx * 0.62)), Math.max(-4, Math.min(4, dy * 0.62))];
}
/**
 * Full layer-separated model at a canvas pixel: field stencil, silhouette, bevel normal,
 * flow-warped relief, reflection, studio banks, specular, quality-tier chroma split, metal ramp.
 */
function model(pixelX, pixelY, width, height, params, time, presentation = {}) {
    const f = field(pixelX, pixelY, width, height, params),
        pat = f,
        pxH = 1 / height,
        t = time * params.speed;
    const s0 = distance(f[0], f[1], params.shape),
        sX = distance(f[0] + FEPS, f[1], params.shape),
        sY = distance(f[0], f[1] + FEPS, params.shape),
        sdf = s0 / params.scale;
    const transition = silhouetteAlpha(sdf, params.edgeSoftness, pxH),
        cutout = sdf > pxH * 2;
    const rimT = clamp(-sdf / Math.max(params.bevelWidth, 0.003)),
        grad = [(sX - s0) / FEPS, (sY - s0) / FEPS],
        sinTilt = bevelSin(rimT, params.bevelShape),
        nGeo = bevelledFlatNormal(grad, sinTilt);
    const freq = params.ripple * 2.6,
        flowT = t * 0.12,
        q = [pat[0] * freq + params.seed * 13.37, pat[1] * freq + params.seed * 13.37],
        w = flowWarp(q[0] * 0.6, q[1] * 0.6, flowT),
        qw = [q[0] + w[0] * (params.warp * 0.9), q[1] + w[1] * (params.warp * 0.9)],
        hg = clampedReliefSlope(qw),
        relief = params.turbulence * 0.5,
        nRaw = [nGeo[0] - hg[0] * relief, nGeo[1] - hg[1] * relief, nGeo[2]],
        nLen = Math.hypot(...nRaw),
        n = nRaw.map((v) => v / nLen);
    const u = (pixelX + 0.5) / width,
        v = (pixelY + 0.5) / height,
        aspect = width / height,
        viewRaw = [(u - 0.5) * aspect * 0.6, (v - 0.5) * 0.6, 1],
        viewLen = Math.hypot(...viewRaw),
        viewI = viewRaw.map((x) => x / viewLen),
        dotIN = viewI[0] * n[0] + viewI[1] * n[1] + viewI[2] * n[2],
        R = [viewI[0] - 2 * dotIN * n[0], viewI[1] - 2 * dotIN * n[1], viewI[2] - 2 * dotIN * n[2]];
    const sharp = clamp(params.sharpness),
        keyRad = 0.5 + (0.18 - 0.5) * sharp,
        drift = Math.sin(t * 0.07) * 0.05,
        envRad = params.envRotation * DEG_TO_RAD,
        envC = Math.cos(envRad),
        envS = Math.sin(envRad);
    const lightRad = params.lightAngle * DEG_TO_RAD,
        Llen = Math.hypot(Math.cos(lightRad), Math.sin(lightRad), 0.7),
        L = [Math.cos(lightRad) / Llen, Math.sin(lightRad) / Llen, -0.7 / Llen],
        Hraw = [L[0], L[1], L[2] - 1],
        Hlen = Math.hypot(...Hraw),
        H = Hraw.map((x) => x / Hlen),
        ndh = clamp(n[0] * H[0] + n[1] * H[1] + n[2] * H[2]),
        spec = Math.pow(ndh, 60 + (900 - 60) * sharp) * (0.4 + (1.4 - 0.4) * sharp);
    const lumG = liquidStudio(R[0], R[1], envC, envS, keyRad, drift, params.environment) + spec;
    let lumR,
        lumB,
        studioEvals = 1;
    if (params.quality === 'high') {
        const grazeD = 1 - clamp(-n[2]),
            dth = params.dispersion * 0.09 * (0.4 + grazeD * 1.3);
        lumB = liquidStudio(R[0] + R[1] * dth, R[1] - R[0] * dth, envC, envS, keyRad, drift, params.environment) + spec;
        lumR = lumG * 2 - lumB;
        studioEvals = 2;
    } else {
        lumR = lumG;
        lumB = lumG;
    }
    const lums = [lumR, lumG, lumB].map((l) => Math.max(0, Math.min(1.8, l))),
        finalRgb = lums.map((l, i) => clamp(DARK[i] + (LIGHT[i] - DARK[i]) * l)),
        straight = cutout ? [0, 0, 0, 0] : [...finalRgb, transition];
    const encode = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    const background = presentation.background || [8, 9, 12],
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
        stencil: { s0, sX, sY, eps: FEPS, pxH, sdf },
        silhouette: {
            transition,
            cutout,
            w: Math.max(Math.max(params.edgeSoftness * 0.5, 0.001) * 0.03125, pxH * 1.5),
        },
        normal: { rimT, grad, sinTilt, nGeo, q, w, qw, hg, relief, n },
        reflection: { viewI, R },
        light: { L, H, ndh, spec, keyRad, drift, envC, envS, sharp },
        layers: {
            studio: { lumG, lumR, lumB, studioEvals, skyG: liquidStudio(R[0], R[1], envC, envS, keyRad, drift, 0) },
            ramp: lums,
            metal: finalRgb,
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
        background: presentation.background || [8, 9, 12],
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
module.exports = {
    definition,
    defaults,
    mxNoiseFloat2,
    mxHashInt1,
    mxGradientFloat2,
    bjfinal,
    rotl32,
    fade,
    flowWarp,
    bevelSin,
    bevelledFlatNormal,
    liquidStudio,
    silhouetteAlpha,
    clampedReliefSlope,
    DARK,
    LIGHT,
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
    BYTE_TOLERANCE,
};
