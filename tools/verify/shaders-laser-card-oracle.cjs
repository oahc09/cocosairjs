'use strict';
// C01 Laser Card independent CPU oracle. Stage 1 (Holo) and stage 2 (Emboss) call the
// verified mother oracle models directly with parameter mapping. Stage 3 (Sparkle) is an
// independent port of E06's grid/hash/star math parameterized by a linear sampler callback
// so it consumes the actual composed content, not a hardcoded input.
const fs = require('node:fs'),
    path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const H = require('./shaders-holographic-oracle.cjs');
const E = require('./shaders-emboss-oracle.cjs');
const S = require('./shaders-sparkle-oracle.cjs');
const definition = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/shader-laser-card/parameters.json'), 'utf8'));
const defaults = () => Object.fromEntries(Object.entries(definition.params).map(([k, d]) => [k, d.defaultValue]));
const clamp = (x) => Math.max(0, Math.min(1, x));
// ── Parameter mapping: C01 → mother E03 ─────────────────────────────────────────────────────
function holoParamsOf(params) {
    // Map ONLY the C01 declared params; the mother defaults stay for everything else,
    // matching the Lead's motherHolo() mapping exactly.
    return {
        ...H.defaults(),
        shape: params.shape,
        roughness: params.holoRoughness,
        crinkle: params.holoCrinkle,
        sparkle: params.holoSparkle,
        foilScale: params.holoFoilScale,
        saturation: params.holoSaturation,
        hueShift: params.holoHueShift,
    };
}
// ── Stage 1: Holographic (full E03 model → premultiplied rgba8 RT bytes) ───────────────────
function holoStage(fx, fy, width, height, params, time) {
    if (params.holoEnabled === 'off') {
        // Neutral card: a deterministic 8×8 gray-64 checker in linear space with alpha=1.
        // This is the frozen identity input — NOT transparent absence.
        const u = fx / (width / height) + 0.5;
        const v = fy + 0.5;
        const cell = Math.floor(u * 8) + Math.floor(v * 8);
        const lum = cell % 2 === 0 ? S.decode(64 / 255) : S.decode(96 / 255);
        return {
            premul: [Math.round(lum * 255), Math.round(lum * 255), Math.round(lum * 255), 255],
            straight: [lum, lum, lum],
            alpha: 1,
            neutral: true,
        };
    }
    // Map field coords back to pixel coords for the mother model.
    const aspect = width / height;
    const px = (fx / aspect + 0.5) * width - 0.5;
    const py = (fy + 0.5) * height - 0.5;
    const mother = H.model(px, py, width, height, holoParamsOf(params), time);
    const a = mother.straightLinear[3];
    const premul = mother.straightLinear
        .slice(0, 3)
        .map((v) => Math.round(clamp(v) * a * 255))
        .concat(Math.round(clamp(a) * 255));
    return { premul, straight: mother.straightLinear.slice(0, 3), alpha: a, neutral: false, mother };
}
// ── Stage 2: Emboss (full E05 geometry/light chain, sampling the Holo RT) ──────────────────
function embossStage(fx, fy, width, height, params, time, holoTexel) {
    const aspect = width / height,
        px = (fx / aspect + 0.5) * width - 0.5,
        py = (fy + 0.5) * height - 0.5;
    const mother = E.model(
        px,
        py,
        width,
        height,
        {
            ...E.defaults(),
            shape: params.shape,
            depth: params.embossDepth,
            lightAngle: params.embossLightAngle,
            shadowIntensity: params.embossShadowIntensity,
        },
        time,
    );
    const bypass = params.embossEnabled === 'off';
    const uv = bypass ? [(px + 0.5) / width, (py + 0.5) / height] : mother.geometry.warped;
    const child = typeof holoTexel === 'function' ? holoTexel(...uv) : holoTexel;
    if (bypass) return { premul: child, passthrough: true, normal: mother.geometry.normal, totalShadow: 0, mother };
    const childA = child[3] / 255;
    const straight = child.slice(0, 3).map((v) => (childA > 0 ? v / 255 / childA : 0));
    const totalShadow = mother.light.totalShadow,
        highlight = mother.light.highlight;
    const premul = straight
        .map((c) => Math.round(clamp(c * (1 - totalShadow) + highlight) * childA * 255))
        .concat(child[3]);
    return { premul, passthrough: false, normal: mother.geometry.normal, totalShadow, highlight, mother };
}
// ── Stage 3: Sparkle (independent E06 port with sampler callback) ──────────────────────────
// E06 constants
const E06_SPEED_FULL = 1;
function sparkleStage(pixelX, pixelY, cssWidth, cssHeight, backing, params, time, sampleLinear) {
    // sampleLinear(u,v) → [r,g,b,a] straight linear (actual composed content).
    const dpr = backing.width / cssWidth;
    // pixelX/pixelY are BACKING pixels; compute UV via backing, CSS grid via cssWidth.
    const u = (pixelX + 0.5) / backing.width;
    const v = (pixelY + 0.5) / backing.height;
    const base = sampleLinear(u, v);
    const baseAlpha = base[3];
    const baseRgb = base.slice(0, 3);
    if (params.sparkleEnabled === 'off') {
        return { straightLinear: [...baseRgb, baseAlpha], glow: [0, 0, 0], samples: 1 };
    }
    const px = u * cssWidth;
    const py = v * cssHeight;
    const glow = [0, 0, 0];
    let sampleCount = 1; // base sample
    for (let layer = 0; layer < 2; layer++) {
        const cellSize = params.sparkleSize * (layer === 0 ? 1 : 2 / 3);
        const bx = Math.floor(px / cellSize - 0.5);
        const by = Math.floor(py / cellSize - 0.5);
        const seed = (params.sparkleSeed ?? 0) + layer * 0.31;
        for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
                const cell = [bx + dx, by + dy];
                const r = S.random(cell[0], cell[1], Math.floor(seed * 4096));
                const point = [
                    (cell[0] + 0.5 + (r[0] - 0.5) * 0.6) * cellSize,
                    (cell[1] + 0.5 + (r[1] - 0.5) * 0.6) * cellSize,
                ];
                // Sample the ACTUAL source at the star position (straight linear).
                const smp = sampleLinear(point[0] / cssWidth, point[1] / cssHeight);
                sampleCount++;
                const lum = (smp[0] * 0.2126 + smp[1] * 0.7152 + smp[2] * 0.0722) * smp[3];
                const presence = S.smooth(
                    params.sparkleThreshold,
                    params.sparkleThreshold + 0.12,
                    Math.sqrt(Math.max(lum, 0)),
                );
                const blink = Math.max(0, Math.sin(time * (0.8 + r[2] * 1.2) + r[0] * 2 * Math.PI));
                // blink^8 (E06: not ^16)
                const b2 = blink * blink;
                const b4 = b2 * b2;
                const blink8 = b4 * b4;
                const level = r[2] >= 0.45 ? 1 : 0.35;
                const lumSrc = smp[0] * 0.2126 + smp[1] * 0.7152 + smp[2] * 0.0722;
                const tint = [0, 1, 2].map(
                    (i) => 1 + ((smp[i] / Math.max(lumSrc, 0.001)) * 0.6 - 1) * params.sparkleColorize,
                );
                const star = S.star(px - point[0], py - point[1], cellSize, params.sparkleRayLength);
                for (let i = 0; i < 3; i++)
                    glow[i] += tint[i] * star * blink8 * presence * level * params.sparkleIntensity;
            }
        }
    }
    // Associated alpha composite (linear).
    const alpha = Math.min(baseAlpha + Math.max(...glow), 1);
    const associated = baseRgb.map((c, i) => c * baseAlpha + glow[i]);
    const finalRgb = alpha > 0 ? associated.map((c) => c / alpha) : [0, 0, 0];
    return { straightLinear: [...finalRgb, alpha], glow, samples: sampleCount };
}
// ── Full C01 model at a canvas pixel (backing-store coordinates) ───────────────────────────
function model(pixelX, pixelY, width, height, params, time, presentation = {}) {
    const aspect = width / height;
    const u = (pixelX + 0.5) / width,
        v = (pixelY + 0.5) / height;
    const fx = (u - 0.5) * aspect,
        fy = v - 0.5;
    const cache = new Map();
    const holoSampler = (su, sv) => {
        const tx = Math.max(0, Math.min(width - 1, Math.floor(su * width)));
        const ty = Math.max(0, Math.min(height - 1, Math.floor(sv * height)));
        const key = tx + ',' + ty;
        if (!cache.has(key))
            cache.set(
                key,
                holoStage(((tx + 0.5) / width - 0.5) * aspect, (ty + 0.5) / height - 0.5, width, height, params, time),
            );
        return cache.get(key).premul;
    };
    const holoResult = holoStage(fx, fy, width, height, params, time);
    const embossResult = embossStage(fx, fy, width, height, params, time, holoSampler);
    const sampler = (su, sv) => {
        const tx = Math.max(0, Math.min(width - 1, Math.floor(su * width)));
        const ty = Math.max(0, Math.min(height - 1, Math.floor(sv * height)));
        const sfx = ((tx + 0.5) / width - 0.5) * aspect,
            sfy = (ty + 0.5) / height - 0.5;
        const result = embossStage(sfx, sfy, width, height, params, time, holoSampler);
        const a = result.premul[3] / 255;
        return [...result.premul.slice(0, 3).map((c) => (a > 0 ? c / 255 / a : 0)), a];
    };
    const dpr = presentation.dpr ?? 1;
    const spark = sparkleStage(pixelX, pixelY, width / dpr, height / dpr, { width, height }, params, time, sampler);
    const totalAlpha = spark.straightLinear[3];
    const finalRgb = spark.straightLinear.slice(0, 3);
    // ONE OETF + screen blend (the RT stores linear premultiplied — no decodeRGB here).
    const encode = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    const background = presentation.background || [8, 9, 12];
    const fragment = finalRgb.map((c) => clamp(encode(c)));
    const display = [
        ...fragment.map((c, i) => Math.round(255 * clamp(c * totalAlpha + (background[i] / 255) * (1 - totalAlpha)))),
        255,
    ];
    return {
        holo: holoResult,
        emboss: embossResult,
        sparkle: spark,
        straightLinear: spark.straightLinear,
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
    })).filter((p, i, a) => a.findIndex((q) => q.x === p.x && q.y === p.y) === i);
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
        const expected = model(p.x, p.y, png.width, png.height, params, time, presentation);
        const offset = ((png.height - 1 - p.y) * png.width + p.x) * 4;
        const actual = Array.from(png.data.subarray(offset, offset + 4));
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
function byteChannels(v) {
    return (
        Array.isArray(v) &&
        v.length === 4 &&
        v.every((x) => typeof x === 'number' && Number.isFinite(x) && Number.isInteger(x) && x >= 0 && x <= 255)
    );
}
function probeAudit(probe, params, time, options = {}) {
    const errors = [];
    if (!probe || typeof probe !== 'object') return { errors: ['probe object required'], measurements: 0 };
    const r = probe.gpuReceipt;
    if (!r || typeof r !== 'object') return { errors: ['GPU receipt object required'], measurements: 0 };
    if (r.targetRGBA8 !== true || r.transparentClear !== true || r.detached !== true || r.disposed !== true)
        return { errors: ['GPU receipt flags'], measurements: 0 };
    if (r.glError !== 0 || !safeInt(r.glError)) return { errors: ['GPU receipt glError'], measurements: 0 };
    if (!safeInt(r.frame) || r.frame < 0 || typeof r.time !== 'number' || !Number.isFinite(r.time))
        return { errors: ['GPU receipt frame/time type'], measurements: 0 };
    if (!safeInt(r.canvas?.width) || !safeInt(r.canvas?.height))
        return { errors: ['GPU receipt canvas dims'], measurements: 0 };
    if (options.width !== undefined && r.canvas.width !== options.width) errors.push('canvas width not frozen plan');
    if (options.height !== undefined && r.canvas.height !== options.height)
        errors.push('canvas height not frozen plan');
    if (!safeInt(probe.frame) || probe.frame < 0) errors.push('probe frame non-negative safe integer');
    if (safeInt(probe.frame) && safeInt(r.frame) && r.frame + 1 !== probe.frame)
        errors.push('GPU receipt/FBO/frame binding');
    if (typeof probe.time !== 'number' || !Number.isFinite(probe.time)) errors.push('probe time finite number');
    else if (probe.time !== r.time) errors.push('probe/receipt time binding');
    if (r.time !== time) errors.push('probe time not frozen plan');
    const pixels = probe.pixels;
    if (!Array.isArray(pixels) || !pixels.length) return { errors: [...errors, 'GPU pixel scope'], measurements: 0 };
    const planned = auditPoints(r.canvas.width, r.canvas.height);
    if (pixels.length !== planned.length || pixels.some((p, i) => !p || p.x !== planned[i].x || p.y !== planned[i].y))
        return { errors: [...errors, 'probe sample set'], measurements: 0 };
    for (const p of pixels) {
        if (!byteChannels(p.rgba)) {
            errors.push({ x: p.x, y: p.y, rule: 'malformed-byte-channels' });
            continue;
        }
        const val = model(p.x, p.y, r.canvas.width, r.canvas.height, params, time, { dpr: options.dpr ?? 1 });
        const expected = val.straightLinear.map((x) => Math.round(clamp(x) * 255));
        const error = Math.max(...expected.map((n, i) => Math.abs(p.rgba[i] - n)));
        if (error > BYTE_TOLERANCE || !Number.isFinite(error))
            errors.push({ x: p.x, y: p.y, expected, actual: p.rgba, error });
    }
    return { errors, measurements: pixels.length };
}
const OWNED_KINDS = [
    'mesh',
    'holoMaterial',
    'embossMaterial',
    'sparkleMaterial',
    'holoEffect',
    'embossEffect',
    'sparkleEffect',
];
function resourceAudit(raw) {
    const errors = [];
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.rows))
        return { errors: ['rows array required'], measurements: 0 };
    if (raw.rows.length !== 100) return { errors: ['Missing exact 100 cycles'], measurements: 0 };
    let base;
    for (const [index, entry] of raw.rows.entries()) {
        const r = entry;
        if (!r || typeof r !== 'object') {
            errors.push(`row-${index}`);
            continue;
        }
        if (r.index !== index || !safeInt(r.id)) errors.push(`alloc-${index}`);
        const refs = r.trace?.refs;
        if (!Array.isArray(refs) || refs.length !== OWNED_KINDS.length) errors.push(`refs-shape-${index}`);
        else {
            const kinds = refs.map((x) => x?.kind).sort();
            if (JSON.stringify(kinds) !== JSON.stringify([...OWNED_KINDS].sort())) errors.push(`refs-kinds-${index}`);
            if (!refs.every((x) => x && x.before === 1 && x.after === 0)) errors.push(`refs-lifecycle-${index}`);
        }
        if (r.trace?.renderersUnbound !== true) errors.push(`unbind-${index}`);
        if (r.trace?.nodesRemoved !== true) errors.push(`nodes-${index}`);
        if (r.trace?.holoDetached !== true) errors.push(`holo-detach-${index}`);
        if (r.trace?.embossDetached !== true) errors.push(`emboss-detach-${index}`);
        if (r.trace?.holoDisposed !== true) errors.push(`holo-disposed-${index}`);
        if (r.trace?.embossDisposed !== true) errors.push(`emboss-disposed-${index}`);
        if (r.repeat?.idempotent !== true) errors.push(`idempotent-${index}`);
        if (r.nodeValid !== false) errors.push(`node-valid-${index}`);
        if (
            !Array.isArray(r.assetsValid) ||
            r.assetsValid.length !== OWNED_KINDS.length ||
            r.assetsValid.some((v) => v !== false)
        )
            errors.push('assets-valid-' + index);
        if (r.registryPresent !== false) errors.push(`registry-${index}`);
        if (!Number.isFinite(r.before?.bufferSize) || !Number.isFinite(r.after?.bufferSize))
            errors.push(`memory-${index}`);
        else {
            if (!base) base = r.before;
            for (const key of ['bufferSize', 'textureSize'])
                if (r.before[key] !== base[key] || r.after[key] !== r.before[key])
                    errors.push(`memory-${index}-${key}`);
            if (!Number.isFinite(r.created?.textureSize) || r.created.textureSize <= r.before.textureSize)
                errors.push('no-texture-' + index);
            if (!Number.isFinite(r.created?.bufferSize) || r.created.bufferSize <= r.before.bufferSize)
                errors.push(`no-buffer-${index}`);
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
    definition,
    defaults,
    holoParamsOf,
    holoStage,
    embossStage,
    sparkleStage,
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
