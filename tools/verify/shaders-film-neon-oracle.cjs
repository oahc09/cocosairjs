'use strict';
// Independent CPU oracle for C02 ThinFilm+Neon. Reads the parent effects' independent CPU
// functions (thin-film E02, neon E04) and performs the premultiplied source-over composition
// independently. Does NOT read or parse the C02 GLSL.
const fs = require('node:fs'),
    path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const film = require('./shaders-thin-film-oracle.cjs');
const neon = require('./shaders-neon-oracle.cjs');
const definition = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/shader-film-neon/parameters.json'), 'utf8'));
const defaults = () => Object.fromEntries(Object.entries(definition.params).map(([key, d]) => [key, d.defaultValue]));
const clamp = (x) => Math.max(0, Math.min(1, x));
function decodeColor(value) {
    const channel = (x) => (x / 255 <= 0.04045 ? x / 255 / 12.92 : Math.pow((x / 255 + 0.055) / 1.055, 2.4));
    return [1, 3, 5].map((o) => channel(parseInt(value.slice(o, o + 2), 16)));
}
/** Map C02 params → E02 film params (identity when filmEnabled=off). */
function filmParamsOf(params) {
    return {
        shape: params.shape,
        rimWidth: params.rimWidth,
        edgeSoftness: params.edgeSoftness,
        thickness: params.thickness,
        dispersion: params.dispersion,
        saturation: params.saturation,
        phase: params.phase,
        lightAngle: params.lightAngle,
        speed: 0,
        opacity: params.opacity,
    };
}
/** Map C02 params → E04 neon params (identity when neonEnabled=off). */
function neonParamsOf(params) {
    return {
        shape: params.shape,
        scale: 1,
        rotation: 0,
        tubeColor: params.tubeColor,
        secondaryColor: params.secondaryColor,
        glowColor: params.glowColor,
        secondaryBlend: params.secondaryBlend,
        tubeThickness: params.tubeThickness,
        intensity: params.intensity,
        hotCoreIntensity: params.hotCoreIntensity,
        glowIntensity: params.glowIntensity,
        glowRadius: params.glowRadius,
        lightAngle: params.lightAngle,
        specularIntensity: params.specularIntensity,
        specularSize: params.specularSize,
        cornerSmoothing: params.cornerSmoothing,
        flickerSpeed: 0,
        flickerAmount: 0,
        flowSpeed: 0,
        flowAmount: 0,
    };
}
/**
 * Full composition model: film layer (straight) → neon layer (straight) → premultiplied
 * source-over (NEON over FILM) → alpha-safe un-premultiply → straight linear → display chain.
 */
function model(pixelX, pixelY, width, height, params, time, presentation = {}) {
    const filmP = filmParamsOf(params),
        neonP = neonParamsOf(params);
    const filmM = film.model(pixelX, pixelY, width, height, filmP, time, {
        linearDiagnostic: true,
        background: [0, 0, 0],
    });
    const neonM = neon.model(pixelX, pixelY, width, height, neonP, time);
    // Layer straight values (identity gate: off layer = exactly zero).
    const filmOn = params.filmEnabled === 'on',
        neonOn = params.neonEnabled === 'on';
    const filmStraight = filmOn ? filmM.linearStraight : [0, 0, 0, 0];
    const filmAlpha = filmOn ? filmM.alpha : 0;
    const neonStraight = neonOn ? neonM.straightLinear : [0, 0, 0, 0];
    // Premultiplied source-over: neon over film.
    const nA = neonStraight[3],
        fA = filmAlpha;
    const outA = nA + fA * (1 - nA);
    const outPm = [0, 1, 2].map((i) => neonStraight[i] * nA + filmStraight[i] * fA * (1 - nA));
    // Alpha-safe un-premultiply: positive alpha divides (HDR preserved); zero alpha → zero.
    const straightRgb = outA > 0 ? outPm.map((v) => v / outA) : [0, 0, 0];
    const straight = [...straightRgb, outA];
    // Format chain: encode → clamp → blend over background → quantize. The math layer stays HDR.
    const encode = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    const background = presentation.background || [8, 9, 12];
    const fragment = straightRgb.map((c) => clamp(encode(c)));
    const alpha = clamp(outA);
    // Screen-target semantics: the compositor clears opaque (alpha=1) and blends
    // ONE/ONE_MINUS_SRC_ALPHA — so the displayed alpha channel is source*1 + bg*(1-source) = 1.
    // The transparent no-blend diagnostic target stores clamp(sourceA)*255 (probeAudit path).
    const display = [
        ...fragment.map((c, i) => Math.round(255 * clamp(c * alpha + (background[i] / 255) * (1 - alpha)))),
        255,
    ];
    return {
        film: { straight: filmStraight, alpha: filmAlpha, model: filmM },
        neon: { straight: neonStraight, model: neonM },
        composite: { outA, outPm, straight },
        straightLinear: straight,
        display,
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
    // Anti-vacuous coverage: a LEGAL all-off identity (both layers disabled) is valid — its
    // expected pixels are the frozen background everywhere, so the plan is vacuous only if the
    // MODEL produces lit points. Normal plans must hit both lit and background regions. The
    // per-point byte comparisons above already enforce the exact background in both cases.
    const models = points.map((p, i) =>
        model(
            auditPoints(png.width, png.height)[i].x,
            auditPoints(png.width, png.height)[i].y,
            png.width,
            png.height,
            params,
            time,
            presentation,
        ),
    );
    const coverage = {
        lit: models.some((m) => m.straightLinear[3] > 0.05),
        outside: models.some((m) => m.straightLinear[3] === 0),
    };
    const identityPlan = params.filmEnabled === 'off' && params.neonEnabled === 'off';
    if (identityPlan) {
        if (coverage.lit) failures.push({ rule: 'identity-plan-has-lit', coverage });
    } else if (!coverage.lit || !coverage.outside) failures.push({ rule: 'coverage-plan', coverage });
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
        const expected = value.straightLinear.map((x) => Math.round(clamp(x) * 255));
        const error = Math.max(...expected.map((n, i) => Math.abs(p.rgba[i] - n)));
        if (error > BYTE_TOLERANCE || !Number.isFinite(error))
            errors.push({ x: p.x, y: p.y, expected, actual: p.rgba, error });
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
            value: d.type === 'number' ? 'wrong-type' : 'invalid-enum',
        });
    }
    return plan;
}
module.exports = {
    definition,
    defaults,
    filmParamsOf,
    neonParamsOf,
    decodeColor,
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
