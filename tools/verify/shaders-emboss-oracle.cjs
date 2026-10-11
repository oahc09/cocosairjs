'use strict';
// Independent CPU emboss oracle. Mirrors the two-pass native pipeline in plain JS without
// parsing or executing GLSL:
//   1. Child pattern pass: a deterministic pattern evaluated at 256x256 texel centres, stored
//      PREMULTIPLIED and quantized to rgba8 (the render-target contents).
//   2. Emboss pass: signed SDF height with central differences, two shadow-trace taps, a
//      parallax-like child UV warp, nearest-texel child sampling with alpha-safe unpremultiply,
//      straight RGBA output and the GLES fixed-point display chain.
const fs = require('node:fs'),
    path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const definition = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/shader-emboss/parameters.json'), 'utf8'));
const defaults = () => Object.fromEntries(Object.entries(definition.params).map(([key, d]) => [key, d.defaultValue]));
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (lo, hi, x) => {
    const t = clamp((x - lo) / (hi - lo));
    return t * t * (3 - 2 * t);
};
const INV_LIGHT_LEN = 1 / Math.sqrt(1 + 0.7 * 0.7),
    LZN = 0.7 * INV_LIGHT_LEN;
const DEG_TO_RAD = Math.PI / 180;
const EPS = 0.003,
    TW = 0.003;
const CHILD_WIDTH = 256,
    CHILD_HEIGHT = 256;
// ── Child pattern (straight values at RT texel centres; v up) ─────────────────────────────
function pattern(u, v, kind) {
    if (kind === 'blank') return { rgb: [0, 0, 0], alpha: 0 };
    const cell = Math.floor(u * 8) + Math.floor(v * 8),
        check = cell % 2 === 0 ? 0.35 : 0.65,
        rgb = [check, check * 0.8, check * 0.6];
    rgb[0] += u * 0.1;
    let alpha = u < 0.5 ? 1 : 0.5;
    if (Math.hypot(u - 0.75, v - 0.25) < 0.08) {
        return { rgb: [1, 0.437, 0], alpha: 0 }; // hidden RGB under alpha 0
    }
    if (Math.hypot(u - 0.25, v - 0.75) < 0.08) {
        return { rgb: [0.9, 0.2, 0.5], alpha: 1 }; // opaque anchor disc
    }
    return { rgb, alpha };
}
/** Premultiplied rgba8 render-target byte at texel (i, j); pattern evaluated at the texel centre. */
function childTexel(i, j, kind) {
    const u = (i + 0.5) / CHILD_WIDTH,
        v = (j + 0.5) / CHILD_HEIGHT,
        { rgb, alpha } = pattern(u, v, kind);
    return rgb.map((c) => Math.round(clamp(c) * alpha * 255)).concat(Math.round(alpha * 255));
}
// ── Emboss field math ──────────────────────────────────────────────────────────────────────
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
/** Signed plateau height; explicit ordered-edge inverse of the reference's smoothstep(tw, -tw, s). */
function heightField(s, depth, transitionW) {
    return depth * (1 - smooth(-transitionW, transitionW, s));
}
/** Sample the stored child RT at a UV with CLAMP_TO_EDGE + NEAREST filtering, then unpremultiply. */
function sampleChild(u, v, kind) {
    const i = Math.max(0, Math.min(CHILD_WIDTH - 1, Math.floor(u * CHILD_WIDTH))),
        j = Math.max(0, Math.min(CHILD_HEIGHT - 1, Math.floor(v * CHILD_HEIGHT))),
        texel = childTexel(i, j, kind),
        alpha = texel[3] / 255;
    // Alpha-safe unpremultiply: exactly the reference's alpha > 0.001 guard.
    const straight = alpha > 0.001 ? texel.slice(0, 3).map((c) => c / 255 / alpha) : [0, 0, 0];
    return { straight, alpha, texel };
}
/**
 * Full two-pass model at a canvas pixel. Returns the layer separation (heights, normal, edge
 * lighting, cast shadow, warp, child sample) plus straight linear RGBA and display bytes.
 */
function model(pixelX, pixelY, width, height, params, time, presentation = {}) {
    const f = field(pixelX, pixelY, width, height, params),
        depth = params.depth;
    const sC = distance(f[0], f[1], params.shape),
        sR = distance(f[0] + EPS, f[1], params.shape),
        sL = distance(f[0] - EPS, f[1], params.shape),
        sU = distance(f[0], f[1] + EPS, params.shape),
        sD = distance(f[0], f[1] - EPS, params.shape);
    const lightRad = params.lightAngle * DEG_TO_RAD,
        lx = Math.cos(lightRad),
        ly = Math.sin(lightRad),
        absDepth = Math.max(Math.abs(depth), 0.0001),
        spread = absDepth * 0.06;
    const h1raw = distance(f[0] + lx * spread * 0.5, f[1] + ly * spread * 0.5, params.shape),
        h2raw = distance(f[0] + lx * spread, f[1] + ly * spread, params.shape);
    const hR = heightField(sR, depth, TW),
        hL = heightField(sL, depth, TW),
        hU = heightField(sU, depth, TW),
        hD = heightField(sD, depth, TW),
        dhx = (hR - hL) / (EPS * 2),
        dhy = (hU - hD) / (EPS * 2),
        nLen = Math.sqrt(dhx * dhx + dhy * dhy + 1),
        normal = [-dhx / nLen, -dhy / nLen, 1 / nLen],
        NdotL = normal[0] * (lx * INV_LIGHT_LEN) + normal[1] * (ly * INV_LIGHT_LEN) + normal[2] * LZN,
        edgeLighting = (NdotL - LZN) * params.lightIntensity,
        highlight = Math.max(edgeLighting, 0),
        edgeShadow = Math.max(-edgeLighting, 0);
    const hC = heightField(sC, depth, TW),
        shadowTw = absDepth * 0.06,
        h1 = heightField(h1raw, depth, shadowTw),
        h2 = heightField(h2raw, depth, shadowTw),
        diff1 = (h1 - hC) / absDepth,
        diff2 = (h2 - hC) / absDepth,
        castShadow = smooth(0, 0.5, diff1) * 0.55 + smooth(0, 0.5, diff2) * 0.45,
        totalShadow = clamp(edgeShadow + castShadow) * params.shadowIntensity;
    const inside = 1 - smooth(-TW, TW, sC),
        dispScale = 1 - depth * 0.05 * inside,
        u = (pixelX + 0.5) / width,
        v = (pixelY + 0.5) / height,
        warped = [0.5 + (u - 0.5) * dispScale, 0.5 + (v - 0.5) * dispScale],
        child = sampleChild(warped[0], warped[1], params.sourceKind);
    const finalRgb = child.straight.map((c) => clamp(c * (1 - totalShadow) + highlight)),
        alpha = child.alpha,
        straightLinear = [...finalRgb, alpha];
    // GLES fixed-point display chain: clamp the encoded fragment colour before SRC_ALPHA blend.
    const encode = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    const background = presentation.background || [10, 12, 16],
        fragment = finalRgb.map((c) => clamp(encode(c))),
        display = [
            ...fragment.map((c, i) => Math.round(255 * clamp(c * alpha + (background[i] / 255) * (1 - alpha)))),
            255,
        ];
    return {
        domain: f,
        stencil: { sC, sR, sL, sU, sD, h1raw, h2raw, eps: EPS, tw: TW, spread },
        heights: { hC, hR, hL, hU, hD, h1, h2, diff1, diff2 },
        geometry: { dhx, dhy, normal, inside, dispScale, warped },
        light: { NdotL, edgeLighting, highlight, edgeShadow, castShadow, totalShadow },
        child,
        straightLinear,
        display,
    };
}
const BYTE_TOLERANCE = 2;
/** Sample domains in canvas UV: interior/boundary/outside plus the child anchors and alpha edge. */
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
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.5],
    [0.25, 0.5],
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
    // The plan must touch the alpha families the active source can produce — otherwise the audit
    // cannot detect premultiply mistakes. The blank source is transparent everywhere by design.
    const kinds = points.map((p, i) => model(p.x, p.y, png.width, png.height, params, time, presentation).child.alpha);
    const coverage = {
        transparent: kinds.some((a) => a === 0),
        semi: kinds.some((a) => a > 0 && a < 1),
        opaque: kinds.some((a) => a === 1),
    };
    const required = params.sourceKind === 'blank' ? ['transparent'] : ['transparent', 'semi', 'opaque'];
    if (required.some((key) => !coverage[key])) failures.push({ rule: 'alpha-coverage-plan', coverage });
    return {
        errors: failures,
        measurements: points.length,
        points,
        width: png.width,
        height: png.height,
        tolerance: BYTE_TOLERANCE,
        background: presentation.background || [10, 12, 16],
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
        receipt.disposed !== true ||
        receipt.childStillAttached !== true
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
        const expected = value.straightLinear.map((x) => Math.round(clamp(x) * 255));
        const error = Math.max(...expected.map((n, i) => Math.abs(p.rgba[i] - n)));
        if (error > BYTE_TOLERANCE || !Number.isFinite(error))
            errors.push({ x: p.x, y: p.y, expected, actual: p.rgba, error });
    }
    return { errors, measurements: pixels.length };
}
const OWNED_KINDS = ['mesh', 'material', 'effect', 'childMesh', 'childMaterial', 'childEffect'];
/** Owned-resource retirement audit: exactly 100 full two-pass instances. */
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
        if (!Array.isArray(r.refsBefore) || r.refsBefore.length !== 6 || !r.refsBefore.every((x) => x === 1))
            errors.push(`refsBefore-${index}`);
        const refs = r.trace?.refs;
        if (!Array.isArray(refs) || refs.length !== 6) errors.push(`refs-shape-${index}`);
        else {
            const kinds = refs.map((x) => x?.kind).sort();
            if (JSON.stringify(kinds) !== JSON.stringify([...OWNED_KINDS].sort())) errors.push(`refs-kinds-${index}`);
            if (!refs.every((x) => x && safeInt(x.before) && safeInt(x.after) && x.before === 1 && x.after === 0))
                errors.push(`refs-lifecycle-${index}`);
        }
        if (r.trace?.rendererUnbound !== true) errors.push(`unbind-${index}`);
        if (r.trace?.nodeRemoved !== true) errors.push(`node-removed-${index}`);
        if (r.trace?.childRendererUnbound !== true) errors.push(`child-unbind-${index}`);
        if (r.trace?.childNodeRemoved !== true) errors.push(`child-node-removed-${index}`);
        if (r.trace?.childTargetDetached !== true) errors.push(`child-detach-${index}`);
        if (r.trace?.childTargetDisposed !== true) errors.push(`child-disposed-${index}`);
        if (r.childTargetDisposedAfterRetire !== true) errors.push(`child-disposed-observed-${index}`);
        if (r.repeat?.idempotent !== true) errors.push(`idempotent-${index}`);
        if (r.nodeValid !== false || r.childNodeValid !== false) errors.push(`node-valid-${index}`);
        if (!Array.isArray(r.assetsValid) || r.assetsValid.length !== 6 || !r.assetsValid.every((x) => x === false))
            errors.push(`assets-invalid-${index}`);
        if (r.registryPresent !== false) errors.push(`registry-${index}`);
        if (
            !Number.isFinite(r.before?.bufferSize) ||
            !Number.isFinite(r.before?.textureSize) ||
            !Number.isFinite(r.after?.bufferSize) ||
            !Number.isFinite(r.after?.textureSize) ||
            !Number.isFinite(r.created?.bufferSize) ||
            !Number.isFinite(r.created?.textureSize)
        ) {
            errors.push(`memory-finite-${index}`);
        } else {
            if (!base) base = r.before;
            for (const key of ['bufferSize', 'textureSize'])
                if (r.before[key] !== base[key] || r.after[key] !== r.before[key])
                    errors.push(`memory-${index}-${key}`);
            if (r.created.bufferSize <= r.before.bufferSize) errors.push(`no-buffer-allocation-${index}`);
            if (r.created.textureSize <= r.before.textureSize) errors.push(`no-texture-allocation-${index}`);
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
    pattern,
    childTexel,
    sampleChild,
    field,
    distance,
    heightField,
    model,
    pngAudit,
    probeAudit,
    resourceAudit,
    boundaryPlan,
    auditPoints,
    byteChannels,
    CHILD_WIDTH,
    CHILD_HEIGHT,
    OWNED_KINDS,
    BYTE_TOLERANCE,
};
