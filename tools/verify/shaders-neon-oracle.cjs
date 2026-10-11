'use strict';
// Independent CPU neon oracle. Mirrors the shader's arithmetic in plain JS without parsing or
// executing GLSL. Separates core / tube / glow layers so parameter changes can be judged
// numerically instead of by screenshot similarity.
//
// Color format chain (documented contract):
//   1. `straightLinear` keeps the raw HDR math result (channels may exceed 1.0 or be negative
//      before masks); algorithm-level tests use it and it is NEVER clamped here.
//   2. The linear probe renders into an RGBA8 (UNORM) render target with blending disabled and a
//      transparent clear, so the stored value is clamp01(x) quantized to 0..255 per channel.
//   3. The preview writes the OETF-encoded fragment color into the fixed-point default
//      framebuffer. OpenGL ES converts the fragment color to the target's fixed-point
//      representation (clamped to [0,1]) BEFORE the SRC_ALPHA/ONE_MINUS_SRC_ALPHA blend; the
//      blended write is clamped and quantized again. The display model follows exactly that
//      chain: clamp01(encode(x)) * alpha + background * (1 - alpha), then round(255 * v).
const fs = require('node:fs'),
    path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const definition = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/shader-neon/parameters.json'), 'utf8'));
const defaults = () => Object.fromEntries(Object.entries(definition.params).map(([key, d]) => [key, d.defaultValue]));
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (lo, hi, x) => {
    const t = clamp((x - lo) / (hi - lo));
    return t * t * (3 - 2 * t);
};
// Reference light geometry constants (lz = 0.7, view = (0,0,1)).
const LZ = 0.7,
    INV_LIGHT_LEN = 1 / Math.sqrt(1 + LZ * LZ),
    LZN = LZ * INV_LIGHT_LEN,
    HZ = LZN + 1,
    INV_H_LEN = 1 / Math.sqrt(INV_LIGHT_LEN * INV_LIGHT_LEN + HZ * HZ);
const DEG_TO_RAD = Math.PI / 180;
function decodeColor(value) {
    const channel = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
    return [1, 3, 5].map((offset) => channel(parseInt(value.slice(offset, offset + 2), 16) / 255));
}
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
/**
 * Full layer-separated model. `pixelX/pixelY` are backing-store pixel coordinates; the same
 * 5-tap centre+cardinal stencil the shader uses is evaluated analytically here. `straightLinear`
 * stays HDR (unclamped); `display` applies the documented RGBA8 fixed-point chain.
 */
function model(pixelX, pixelY, width, height, params, time, presentation = {}) {
    const f = field(pixelX, pixelY, width, height, params);
    const smoothEPS = 0.008 + params.cornerSmoothing * 0.03,
        pxH = 1 / height,
        glowR = Math.max(params.glowRadius, 0.001),
        softPx = Math.max(pxH / params.scale, 0.004);
    const sC = distance(f[0], f[1], params.shape),
        sR = distance(f[0] + smoothEPS, f[1], params.shape),
        sL = distance(f[0] - smoothEPS, f[1], params.shape),
        sU = distance(f[0], f[1] + smoothEPS, params.shape),
        sD = distance(f[0], f[1] - smoothEPS, params.shape);
    const gradX = (sR - sL) / (smoothEPS * 2),
        gradY = (sU - sD) / (smoothEPS * 2),
        smoothedSdf = (sC + sR + sL + sU + sD) / 5,
        sdf = sC + (smoothedSdf - sC) * params.cornerSmoothing;
    const gradLen = Math.max(Math.hypot(gradX, gradY), 0.0001),
        gnx = gradX / gradLen,
        gny = gradY / gradLen;
    const depthNorm = clamp(-sdf / Math.max(params.tubeThickness, 0.001));
    // Explicit ordered-edge inverses of the reference's reverse-edge smoothsteps.
    const innerMask = 1 - smooth(params.tubeThickness - softPx, params.tubeThickness + softPx, -sdf),
        outerMask = 1 - smooth(-softPx, softPx, sdf),
        tubeMask = outerMask * innerMask;
    const cylinderZ = Math.sqrt(Math.max(depthNorm * (2 - depthNorm), 0)),
        cylinderR = 1 - depthNorm,
        nx = gnx * cylinderR,
        ny = gny * cylinderR,
        nz = cylinderZ;
    const lightRad = params.lightAngle * DEG_TO_RAD,
        lxn = Math.cos(lightRad) * INV_LIGHT_LEN,
        lyn = Math.sin(lightRad) * INV_LIGHT_LEN,
        diffuse = clamp(nx * lxn + ny * lyn + nz * LZN),
        NdotH = nx * (lxn * INV_H_LEN) + ny * (lyn * INV_H_LEN) + nz * (HZ * INV_H_LEN),
        shininess = Math.pow(2, 8 - params.specularSize * 7),
        specular = Math.pow(clamp(NdotH), shininess) * params.specularIntensity;
    const flowAngle = Math.atan2(f[1], f[0]),
        flowPhase = flowAngle * 2 + time * params.flowSpeed,
        flowMod = 1 + (Math.sin(flowPhase) * 0.5 + 0.5 - 1) * params.flowAmount;
    const tube = decodeColor(params.tubeColor),
        secondary = decodeColor(params.secondaryColor),
        glowColor = decodeColor(params.glowColor);
    const twoTone = secondary.map((c, i) => c + (tube[i] - c) * diffuse),
        baseColor = tube.map((c, i) => c + (twoTone[i] - c) * params.secondaryBlend),
        shade = 0.12 + diffuse * 0.55 + cylinderZ * 0.35,
        tubeRgb = baseColor.map((c) => c * shade + specular);
    const coreProfile = smooth(0.55, 1, depthNorm),
        hotCoreAmt = coreProfile * params.hotCoreIntensity * flowMod,
        hotCoreCol = tube.map((c) => c + (1 - c) * 0.75);
    const tubeWithCore = tubeRgb.map((c, i) => c + (hotCoreCol[i] - c) * hotCoreAmt),
        tubeFlowed = tubeWithCore.map((c) => c * (1 + (flowMod - 1) * 0.4));
    const sdfOutside = Math.max(sdf, 0),
        innerGlow = Math.exp(-sdfOutside * (12 / glowR)) * 0.7,
        outerGlow = Math.exp(-sdfOutside * (4 / glowR)) * 0.35,
        glowMasked = (innerGlow + outerGlow) * params.glowIntensity * smooth(-0.003, 0.003, sdf);
    const flickerTime = time * params.flickerSpeed,
        combined =
            Math.sin(flickerTime * 17.13) + Math.sin(flickerTime * 31.71) * 0.5 + Math.sin(flickerTime * 47.29) * 0.3,
        threshold = -2 + (0.8 - -2) * params.flickerAmount,
        flicker = smooth(threshold - 0.1, threshold + 0.1, combined),
        intensityMul = params.intensity * flicker;
    const finalTube = tubeFlowed.map((c) => c * intensityMul),
        finalGlow = glowColor.map((c) => c * glowMasked * intensityMul),
        rgb = finalGlow.map((g, i) => g + (finalTube[i] - g) * tubeMask),
        alpha = Math.max(tubeMask, clamp(glowMasked * 0.6));
    const threshOut = glowR * 1.5 + softPx + smoothEPS,
        cutout = sC > threshOut;
    const straight = cutout ? [0, 0, 0, 0] : [...rgb, alpha];
    // Documented display chain: encode the HDR math, clamp the encoded fragment color to the
    // fixed-point target range, composite with SRC_ALPHA over the background, quantize to 8 bit.
    const encode = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    const background = presentation.background || [8, 10, 18],
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
        stencil: { sC, sR, sL, sU, sD, smoothEPS, softPx, threshOut },
        geometry: {
            sdf,
            gradient: [gradX, gradY],
            normal: [gnx, gny],
            depthNorm,
            cylinderZ,
            tubeMask,
            innerMask,
            outerMask,
        },
        light: { diffuse, specular, shininess, NdotH },
        modulation: { flowMod, flicker, intensityMul },
        layers: {
            tube: { shaded: tubeRgb, flowed: tubeFlowed, final: finalTube, mask: tubeMask },
            core: { profile: coreProfile, amount: hotCoreAmt, color: hotCoreCol },
            glow: {
                inner: innerGlow,
                outer: outerGlow,
                masked: glowMasked,
                alpha: clamp(glowMasked * 0.6),
                final: finalGlow,
            },
        },
        cutout,
        straightLinear: straight,
        display,
    };
}
// RGBA8 target quantization plus float32 GPU arithmetic stay within 2 code values.
const BYTE_TOLERANCE = 2;
const DOMAINS = [
    [0, 0],
    [-0.36, 0],
    [-0.3, 0],
    [-0.292, 0],
    [-0.27, 0],
    [0.288, 0],
    [0, 0.2],
    [0, 0.275],
    [0, 0.31],
    [0.12, 0.085],
    [-0.12, 0.085],
    [0.24, 0.16],
    [-0.24, -0.16],
    [0.6, 0],
];
function auditPoints(width, height) {
    return DOMAINS.map(([x, y]) => ({
        x: Math.max(0, Math.min(width - 1, Math.floor(width / 2 + x * height))),
        y: Math.max(0, Math.min(height - 1, Math.floor(height / 2 + y * height))),
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
    const bg = presentation.background || [8, 10, 18];
    let nonBackgroundPixels = 0,
        whitePixels = 0;
    for (let i = 0; i < png.data.length; i += 4) {
        if (png.data[i] !== bg[0] || png.data[i + 1] !== bg[1] || png.data[i + 2] !== bg[2]) nonBackgroundPixels++;
        if (png.data[i] === 255 && png.data[i + 1] === 255 && png.data[i + 2] === 255) whitePixels++;
    }
    // The far cutout must actually fire: a full-shape render needs both lit and pure-background
    // sample points, otherwise the audit is vacuous.
    const anyBackground = points.some((p) => p.actual[0] === bg[0] && p.actual[1] === bg[1] && p.actual[2] === bg[2]);
    const anyLit = points.some((p) => p.maxError >= 0 && (p.actual[0] !== bg[0] || p.actual[1] !== bg[1]));
    if (!anyBackground || !anyLit) failures.push({ rule: 'vacuous-sample-plan', anyBackground, anyLit });
    return {
        errors: failures,
        measurements: points.length,
        points,
        width: png.width,
        height: png.height,
        tolerance: BYTE_TOLERANCE,
        background: bg,
        nonBackgroundPixels,
        whitePixels,
    };
}
const safeInt = (v) => Number.isSafeInteger(v);
/** Byte channel contract: exactly 4 entries, each a finite integer in 0..255. */
function byteChannels(value) {
    return (
        Array.isArray(value) &&
        value.length === 4 &&
        value.every((v) => typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0 && v <= 255)
    );
}
/**
 * Linear straight-RGBA render-target audit. The RGBA8 target stores clamp01(x) quantized to
 * 0..255; far-field pixels must read exactly (0,0,0,0). `options.width/height` optionally bind
 * the receipt canvas to the frozen capture plan.
 */
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
    if (!safeInt(receipt.frame) || typeof receipt.time !== 'number' || !Number.isFinite(receipt.time))
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
    // Frame binding is mandatory, not conditional: both sides must be non-negative safe
    // integers and exactly adjacent (the probe frame renders one step after the receipt).
    if (!safeInt(probe.frame) || probe.frame < 0) errors.push('probe frame non-negative safe integer');
    if (!safeInt(receipt.frame) || receipt.frame < 0) errors.push('receipt frame non-negative safe integer');
    if (
        safeInt(probe.frame) &&
        probe.frame >= 0 &&
        safeInt(receipt.frame) &&
        receipt.frame >= 0 &&
        receipt.frame + 1 !== probe.frame
    )
        errors.push('GPU receipt/FBO/frame binding');
    // Time binding is mandatory: finite, equal on both sides, and equal to the frozen plan.
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
        const value = model(p.x, p.y, receipt.canvas.width, receipt.canvas.height, params, time, {
            linearDiagnostic: true,
        });
        // RGBA8 UNORM storage: clamp to [0,1] before the 0..255 quantization.
        const expected = value.cutout ? [0, 0, 0, 0] : value.straightLinear.map((x) => Math.round(clamp(x) * 255));
        const error = Math.max(...expected.map((n, i) => Math.abs(p.rgba[i] - n)));
        if (error > BYTE_TOLERANCE || !Number.isFinite(error))
            errors.push({ x: p.x, y: p.y, expected, actual: p.rgba, error });
        if (value.cutout && (p.rgba[0] || p.rgba[1] || p.rgba[2] || p.rgba[3]))
            errors.push({ x: p.x, y: p.y, rule: 'far-cutout-not-zero', actual: p.rgba });
    }
    return { errors, measurements: pixels.length };
}
/** Owned-resource retirement audit: exactly 100 cycles, one mesh/material/effect ref each. */
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
            if (JSON.stringify(kinds) !== JSON.stringify(['effect', 'material', 'mesh']))
                errors.push(`refs-kinds-${index}`);
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
            value: d.type === 'number' ? 'wrong-type' : d.enum ? 'invalid-shape' : 'not-a-color',
        });
    }
    return plan;
}
module.exports = {
    definition,
    defaults,
    decodeColor,
    field,
    distance,
    model,
    pngAudit,
    probeAudit,
    resourceAudit,
    boundaryPlan,
    auditPoints,
    byteChannels,
    BYTE_TOLERANCE,
};
