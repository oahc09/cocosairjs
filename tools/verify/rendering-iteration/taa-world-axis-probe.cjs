'use strict';

// Isolate the production getVelocity and history lookup at zero jitter.
// This is not a native TAA scene test or a WebGPU result.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require('playwright');

const shaderFile = resolve(__dirname, '../../../vendor/builtin-source/generated/custom-effects.json');
const fovScale = Math.sqrt(3);
const aspect = 1.6;
const near = 1;
const far = 100;
const historyWidth = 160;

async function main(executablePath, output) {
    assert(executablePath && output, 'Usage: node taa-world-axis-probe.cjs <Chromium executable> <new-report.json>');
    const bytes = readFileSync(shaderFile);
    const taa = JSON.parse(bytes).find(({ name }) => name === 'pipeline/post-process/taa');
    const fragment = taa.shaders[0].glsl3.frag;
    const get = (name) => {
        const match = fragment.match(
            new RegExp('^(\\s*(?:vec2|vec3) ' + name + '\\([^\\n]+\\{\\n[\\s\\S]*?^\\})', 'm'),
        );
        assert(match, `Missing frozen WebGL2 helper: ${name}`);
        return match[1];
    };
    const velocity = get('getVelocity');
    const axisGuard =
        /if \(abs\(worldPos\.x\) < 0\.0001 && abs\(worldPos\.y\) < 0\.0001\)\s*\{\s*return vec2\(0\.\);\s*\}/;
    const hasAxisGuard = axisGuard.test(velocity);
    const hasDepthGuard = /if \(depth >= 1\.\)/.test(velocity);
    assert(hasAxisGuard || hasDepthGuard, 'Frozen fallback changed; review fixture expectations');
    const candidate = hasAxisGuard ? velocity.replace(axisGuard, 'if (depth >= 1.) { return vec2(0.); }') : velocity;
    const browser = await chromium.launch({
        executablePath: resolve(executablePath),
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    let report;
    try {
        const page = await browser.newPage();
        const samples = [4, 8].flatMap((distance) => [
            ...[0, -0.00009, 0.00009, -0.00011, 0.00011].map((x) => ({ distance, x, y: 0, previousX: 1 })),
            { distance, x: 0, y: 0.00011, previousX: 1 },
            { distance, x: 0, y: 0, previousX: 0 },
        ]);
        samples.push({ distance: far, x: 0, y: 0.5, previousX: 1, clear: true });
        const result = await page.evaluate(
            ({ common, variants, f, aspect, near, far, width, samples }) => {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 1;
                const gl = canvas.getContext('webgl2');
                if (!gl?.getExtension('EXT_color_buffer_float')) throw new Error('WebGL2 float readback unavailable');
                const shader = (type, source) => {
                    const s = gl.createShader(type);
                    gl.shaderSource(s, '#version 300 es\nprecision highp float;\n' + source);
                    gl.compileShader(s);
                    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
                    return s;
                };
                const texture = (slot, internal, format, type, width, data) => {
                    gl.activeTexture(gl.TEXTURE0 + slot);
                    const t = gl.createTexture();
                    gl.bindTexture(gl.TEXTURE_2D, t);
                    gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, 1, 0, format, type, data);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                    return t;
                };
                const fbo = gl.createFramebuffer();
                gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
                const output = texture(2, gl.RGBA32F, gl.RGBA, gl.FLOAT, 1, null);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output, 0);
                if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
                    throw new Error('Incomplete readback framebuffer');
                texture(
                    1,
                    gl.R8,
                    gl.RED,
                    gl.UNSIGNED_BYTE,
                    width,
                    Uint8Array.from({ length: width }, (_, x) => x),
                );
                texture(0, gl.R32F, gl.RED, gl.FLOAT, 1, null);
                const sx = f / aspect;
                const a = -(far + near) / (far - near);
                const b = (-2 * far * near) / (far - near);
                const inv = [1 / sx, 0, 0, 0, 0, 1 / f, 0, 0, 0, 0, 0, 1 / b, 0, 0, -1, a / b];
                const rows = [];
                for (const [mode, fn] of Object.entries(variants)) {
                    const p = gl.createProgram();
                    gl.attachShader(
                        p,
                        shader(gl.VERTEX_SHADER, 'void main(){gl_Position=vec4(0.,0.,0.,1.);gl_PointSize=1.;}'),
                    );
                    gl.attachShader(
                        p,
                        shader(
                            gl.FRAGMENT_SHADER,
                            `
                        uniform mat4 cc_matViewProjInv, taaPrevViewProj;
                        uniform vec4 cc_cameraPos;
                        uniform highp sampler2D depthTex;
                        uniform sampler2D history;
                        uniform vec2 uv;
                        out vec4 result;
                        ${common}
                        ${fn}
                        void main() {
                            float d;
                            vec2 prior = uv + getVelocity(uv, uv, d);
                            result = vec4(prior, texture(history, prior).r, d);
                        }`,
                        ),
                    );
                    gl.linkProgram(p);
                    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
                    gl.useProgram(p);
                    const loc = (x) => gl.getUniformLocation(p, x);
                    gl.uniformMatrix4fv(loc('cc_matViewProjInv'), false, inv);
                    gl.uniform4f(loc('cc_cameraPos'), 0, 0, 0, 3);
                    gl.uniform1i(loc('depthTex'), 0);
                    gl.uniform1i(loc('history'), 1);
                    for (const sample of samples) {
                        const { distance: d, x, y, previousX } = sample;
                        const depth = sample.clear ? 1 : (-a + b / d) / 2 + 0.5;
                        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, 1, gl.RED, gl.FLOAT, new Float32Array([depth]));
                        gl.uniformMatrix4fv(loc('taaPrevViewProj'), false, [
                            sx,
                            0,
                            0,
                            0,
                            0,
                            f,
                            0,
                            0,
                            0,
                            0,
                            a,
                            -1,
                            -sx * previousX,
                            0,
                            b,
                            0,
                        ]);
                        gl.uniform2f(loc('uv'), 0.5 + (x * sx) / (2 * d), 0.5 + (y * f) / (2 * d));
                        gl.drawArrays(gl.POINTS, 0, 1);
                        const read = new Float32Array(4);
                        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, read);
                        if (gl.getError() !== gl.NO_ERROR) throw new Error('WebGL2 readback error');
                        rows.push({
                            mode,
                            ...sample,
                            sampledU: read[0],
                            sampledV: read[1],
                            texel: Math.round(read[2] * 255),
                            sampledDepth: read[3],
                        });
                    }
                }
                return { webgl: gl.getParameter(gl.VERSION), rows };
            },
            {
                common: [get('screen2WS'), get('NDCScToUV')].join('\n'),
                variants: { frozen: velocity, clearDepthControl: candidate },
                f: fovScale,
                aspect,
                near,
                far,
                width: historyWidth,
                samples,
            },
        );
        report = {
            browserVersion: browser.version(),
            frozenEffectsSHA256: createHash('sha256').update(bytes).digest('hex'),
            probeSHA256: createHash('sha256').update(readFileSync(__filename)).digest('hex'),
            hasAxisGuard,
            hasDepthGuard,
            passed: false,
            ...result,
        };
        for (const row of report.rows) {
            const { x, y, distance: d, previousX } = row;
            const currentU = 0.5 + (x * fovScale) / (aspect * 2 * d);
            const expectedU = currentU - (previousX * fovScale) / (aspect * 2 * d);
            const expectedV = 0.5 + (y * fovScale) / (2 * d);
            const oldSkip = row.mode === 'frozen' && hasAxisGuard && Math.abs(x) < 0.0001 && Math.abs(y) < 0.0001;
            const clearSkip = row.clear && (row.mode === 'clearDepthControl' || hasDepthGuard);
            row.geometricU = expectedU;
            row.lookupErrorPx = Math.abs(row.sampledU - expectedU) * historyWidth;
            const actualU = oldSkip || clearSkip ? currentU : expectedU;
            assert(Math.abs(row.sampledU - actualU) < 0.000003, JSON.stringify(row));
            assert(Math.abs(row.sampledV - expectedV) < 0.000003, JSON.stringify(row));
            assert(Math.abs(historyWidth * row.sampledU - row.texel - 0.5) <= 0.50002, JSON.stringify(row));
        }
        report.passed = true;
    } finally {
        try {
            await browser.close();
        } finally {
            if (report) writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        }
    }
}
main(...process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
