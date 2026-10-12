'use strict';
// W5 Driver Pilot independent CPU oracle: recomputes driver outputs from raw events and
// real per-frame dt without importing the production driver.ts.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');

/** Map a raw pointer event to normalized UV (v-up) using the recorded rect. */
function pointerToUV(clientX, clientY, rect) {
    return {
        x: (clientX - rect.left) / Math.max(1, rect.width),
        y: 1 - (clientY - rect.top) / Math.max(1, rect.height),
    };
}

/** Compute one binding's output from the state and frame (independent reimplementation). */
function computeBinding(binding, state, frame) {
    let value;
    if (binding.source === 'pointer') {
        if (!frame) return binding.defaultValue ?? 0;
        if (binding.axis === 'uv') return { x: frame.pointer.x, y: frame.pointer.y };
        if (binding.axis === 'x') value = frame.pointer.x;
        else value = frame.pointer.y;
    } else if (binding.source === 'time') {
        value = state.time;
    } else if (binding.source === 'auto') {
        const period = binding.period ?? 1;
        const amplitude = binding.amplitude ?? 1;
        const phase = binding.phase ?? 0;
        value = amplitude * Math.sin((state.time / period) * Math.PI * 2 + phase);
    } else {
        return binding.defaultValue ?? 0;
    }
    if (
        binding.inputMin !== undefined &&
        binding.inputMax !== undefined &&
        binding.outputMin !== undefined &&
        binding.outputMax !== undefined
    ) {
        const t = (value - binding.inputMin) / (binding.inputMax - binding.inputMin);
        let mapped = binding.outputMin + t * (binding.outputMax - binding.outputMin);
        if (binding.clamp !== false) mapped = Math.max(binding.outputMin, Math.min(binding.outputMax, mapped));
        value = mapped;
    }
    return Number.isFinite(value) ? value : (binding.defaultValue ?? 0);
}

/** Replay the full frame ledger to recompute all outputs per frame. */
function replay(frameLedger, bindings) {
    let time = 0;
    return frameLedger.map((entry) => {
        if (entry.dt > 0) time += entry.dt;
        const state = { time, pointer: entry.pointer };
        const outputs = {};
        for (const p of bindings) outputs[p.target] = computeBinding(p.binding, state, entry);
        return { frame: entry.frame, outputs, time };
    });
}

/** Validate the driver contract structurally. */
function validateBindings(bindings) {
    const errors = [];
    if (!Array.isArray(bindings)) return { errors: ['bindings array required'] };
    for (const [i, p] of bindings.entries()) {
        if (!p || typeof p !== 'object') {
            errors.push(`bindings[${i}] object`);
            continue;
        }
        if (!p.target) errors.push(`bindings[${i}].target`);
        const b = p.binding;
        if (!b || typeof b !== 'object') {
            errors.push(`bindings[${i}].binding`);
            continue;
        }
        if (!['pointer', 'time', 'auto'].includes(b.source)) errors.push(`bindings[${i}].source "${b.source}"`);
        if (b.inputMin !== undefined && b.inputMax !== undefined && b.inputMin >= b.inputMax)
            errors.push(`bindings[${i}].range`);
    }
    return { errors };
}

const mothers = {
    holographic: require('./shaders-holographic-oracle.cjs'),
    neon: require('./shaders-neon-oracle.cjs'),
};
function defaults(consumer) {
    const spec = JSON.parse(fs.readFileSync(path.join(ROOT, `examples/shader-${consumer}/parameters.json`), 'utf8'));
    return Object.fromEntries(Object.entries(spec.params).map(([k, v]) => [k, v.defaultValue]));
}
const ranges = {
    holographic: { rotation: [0, 360], hueShift: [0, 360], foilScale: [0.3, 6] },
    neon: { rotation: [0, 360], intensity: [0, 3], tubeThickness: [0, 0.08] },
};
function consumed(consumer, outputs) {
    const params = defaults(consumer),
        position = { x: 0, y: 0 };
    for (const [target, value] of Object.entries(outputs)) {
        const [ns, key] = target.split('.');
        if (ns !== consumer) throw new Error('oracle target namespace');
        if (key === 'position') {
            position.x = (value.x - 0.5) * 0.1;
            position.y = (value.y - 0.5) * 0.1;
        } else {
            const r = ranges[consumer][key];
            if (!r) throw new Error('oracle target');
            params[key] = Math.min(r[1], Math.max(r[0], value));
        }
    }
    return { params, position };
}
function uniforms(consumer, outputs, time, width, height) {
    const p = consumed(consumer, outputs).params;
    const hex = (v) =>
        [1, 3, 5].map((i) => {
            const x = parseInt(v.slice(i, i + 2), 16) / 255;
            return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
    return consumer === 'holographic'
        ? {
              holo0: [p.scale, p.rotation, p.hueShift, p.foilScale],
              holo1: [p.saturation, p.roughness, p.speed, p.crinkle],
              holo2: [p.crinkleScale, p.sparkle, p.edgeSoftness, p.seed],
              holo3: [time * p.speed, width, height, 0],
          }
        : {
              neon0: [p.scale, p.rotation, p.secondaryBlend, p.tubeThickness],
              neon1: [p.intensity, p.hotCoreIntensity, p.glowIntensity, p.glowRadius],
              neon2: [p.lightAngle, p.specularIntensity, p.specularSize, p.cornerSmoothing],
              neon3: [p.flickerSpeed, p.flickerAmount, p.flowSpeed, p.flowAmount],
              neon4: [time, width, height, 0],
              neonColor0: [...hex(p.tubeColor), 0],
              neonColor1: [...hex(p.secondaryColor), 0],
              neonColor2: [...hex(p.glowColor), 0],
          };
}
function points(consumer, w, h) {
    return mothers[consumer].auditPoints(w, h);
}
function pixel(consumer, outputs, time, w, h, x, y) {
    const used = consumed(consumer, outputs);
    // Native orthoHeight=1: world translation maps to half the backing height.
    const localX = x - (used.position.x * h) / 2,
        localY = y - (used.position.y * h) / 2;
    return mothers[consumer].model(localX, localY, w, h, used.params, time, { background: [8, 9, 12] });
}
function linearBytes(value) {
    return value.straightLinear.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255));
}
module.exports = {
    pointerToUV,
    computeBinding,
    replay,
    validateBindings,
    defaults,
    consumed,
    uniforms,
    points,
    pixel,
    linearBytes,
};
