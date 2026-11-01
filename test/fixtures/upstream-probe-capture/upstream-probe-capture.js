/* Research fixture only. No Cocos imports and no automatic browser launch. */
'use strict';
const sh = globalThis.UpstreamProbeSH;
const faceSize = 32;
const probeCount = 4;
const measuredPairs = 6;
const vertexSource = `#version 300 es
precision highp float;
precision highp int;
uniform bool atlas;
uniform int serialTile;
uniform int probes;
out vec2 uv;
flat out int tile;
void main() {
    vec2 corners[6] = vec2[6](vec2(0,0), vec2(1,0), vec2(0,1), vec2(0,1), vec2(1,0), vec2(1,1));
    uv = corners[gl_VertexID];
    tile = atlas ? gl_InstanceID : serialTile;
    vec2 p = uv;
    if (atlas) p = (uv + vec2(tile % 6, tile / 6)) / vec2(6, probes);
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const fragmentSource = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
flat in int tile;
out vec4 color;
vec3 ray(int face, vec2 q) {
    if (face == 0) return normalize(vec3(1, -q.y, -q.x));
    if (face == 1) return normalize(vec3(-1, -q.y, q.x));
    if (face == 2) return normalize(vec3(q.x, 1, q.y));
    if (face == 3) return normalize(vec3(q.x, -1, -q.y));
    if (face == 4) return normalize(vec3(q.x, -q.y, 1));
    return normalize(vec3(-q.x, -q.y, -1));
}
void main() {
    vec3 d = ray(tile % 6, uv * 2.0 - 1.0);
    float p = float(tile / 6);
    // Continuous, positive, linear radiance, not display color or a preconvolved irradiance map.
    color = vec4(0.7 + 0.1 * p + 0.2 * d.x,
                 0.8 + 0.15 * d.y + 0.1 * (d.z*d.z - 1.0/3.0),
                 0.9 + 0.1 * d.z + 0.12 * d.x*d.y, 1.0);
}`;
const pixelIndex = (face, x, y, size) => ((face * size + y) * size + x) * 4;
const radiance = (p, d) => [
    0.7 + 0.1 * p + 0.2 * d[0],
    0.8 + 0.15 * d[1] + 0.1 * (d[2] * d[2] - 1 / 3),
    0.9 + 0.1 * d[2] + 0.12 * d[0] * d[1],
];
let report;
const result = document.getElementById('result');
const download = document.getElementById('download');

async function run() {
    report = {
        schemaVersion: 1,
        experiment: 'U08-C/T33',
        decision: 'BLOCKED',
        scope: 'standalone-webgl2-analytic-radiance-not-cocos-scene',
        startedAt: new Date().toISOString(),
        userAgent: navigator.userAgent,
        inputs: {
            faceSize,
            probeCount,
            measuredPairs,
            seed: 0,
            faceOrder: sh.FACE_ORDER,
            rows: 'bottom-to-top',
            handedness: 'right-handed-world',
            basis: 'orthonormal-real-l<=2-y-z-x',
            colorSpace: 'linear-radiance',
            cosineConvolved: false,
            exposure: 1,
            toneMapping: 'none',
            msaa: 0,
            depth: 'none',
            mipmaps: false,
            alpha: 1,
            premultipliedAlpha: false,
        },
        finalSources: { vertexSource, fragmentSource },
        samples: [],
        blockers: [
            'Actual Cocos scene traversal/submission and serial/atlas engine integration not measured.',
            'Actual peak/incremental driver VRAM unavailable: texture allocation ledger is not observed VRAM.',
            'Candidate SDK/build fingerprints, production camera orientation calibration and browser matrix required.',
        ],
    };
    const gl = document.getElementById('canvas').getContext('webgl2', {
        alpha: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('INFRA_BLOCKED: WebGL2 context unavailable');
    const resources = [];
    const shaders = [];
    const queries = [];
    let program;
    const allocate = (width, height) => {
        const texture = gl.createTexture(),
            framebuffer = gl.createFramebuffer();
        resources.push({ texture, framebuffer });
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
            throw new Error('INFRA_BLOCKED: RGBA32F framebuffer incomplete');
        return { texture, framebuffer, width, height };
    };
    try {
        if (!gl.getExtension('EXT_color_buffer_float'))
            throw new Error('INFRA_BLOCKED: EXT_color_buffer_float required');
        const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        if (!timer)
            report.blockers.push('GPU elapsed-time query unavailable; CPU time is not a GPU timing substitute.');
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        report.device = {
            vendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
            renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
            version: gl.getParameter(gl.VERSION),
            shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
            contextAttributes: gl.getContextAttributes(),
            maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
            floatColorBuffer: true,
            timerQuery: Boolean(timer),
            driverVersion: null,
        };
        const compile = (type, source) => {
            const shader = gl.createShader(type);
            shaders.push(shader);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS),
                log = gl.getShaderInfoLog(shader);
            if (!ok) {
                throw new Error(`SHADER_COMPILE: ${log}`);
            }
            return shader;
        };
        program = gl.createProgram();
        const vertex = compile(gl.VERTEX_SHADER, vertexSource);
        const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);
        const uniform = Object.fromEntries(
            ['atlas', 'serialTile', 'probes'].map((name) => [name, gl.getUniformLocation(program, name)]),
        );
        gl.uniform1i(uniform.probes, probeCount);
        const atlas = allocate(faceSize * 6, faceSize * probeCount);
        const serial = Array.from({ length: probeCount * 6 }, () => allocate(faceSize, faceSize));
        report.allocationLedger = {
            requestedAndAllocatedFormat: 'RGBA32F',
            bytesPerTexel: 16,
            serialTextureBytes: probeCount * 6 * faceSize ** 2 * 16,
            atlasTextureBytes: probeCount * 6 * faceSize ** 2 * 16,
            bothResidentDuringComparison: true,
            actualPeakDriverVRAMBytes: null,
            excludes: ['driver overhead', 'program', 'framebuffer metadata', 'canvas/compositor', 'readback staging'],
        };
        report.framebufferObservation = {
            redBits: gl.getFramebufferAttachmentParameter(
                gl.FRAMEBUFFER,
                gl.COLOR_ATTACHMENT0,
                gl.FRAMEBUFFER_ATTACHMENT_RED_SIZE,
            ),
            componentType: gl.getFramebufferAttachmentParameter(
                gl.FRAMEBUFFER,
                gl.COLOR_ATTACHMENT0,
                gl.FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE,
            ),
            framebufferComplete: true,
        };
        const reference = Array.from({ length: probeCount }, (_, p) => sh.project(faceSize, (d) => radiance(p, d)));
        const capture = async (mode, retainPixels) => {
            const query = timer && gl.createQuery();
            if (query) queries.push(query);
            const start = performance.now();
            if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
            const submitStart = performance.now();
            gl.uniform1i(uniform.atlas, mode === 'atlas' ? 1 : 0);
            if (mode === 'atlas') {
                gl.bindFramebuffer(gl.FRAMEBUFFER, atlas.framebuffer);
                gl.viewport(0, 0, atlas.width, atlas.height);
                gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, probeCount * 6);
            } else {
                serial.forEach((target, tile) => {
                    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
                    gl.viewport(0, 0, faceSize, faceSize);
                    gl.uniform1i(uniform.serialTile, tile);
                    gl.drawArrays(gl.TRIANGLES, 0, 6);
                });
            }
            const cpuSubmissionMs = performance.now() - submitStart;
            if (query) gl.endQuery(timer.TIME_ELAPSED_EXT);
            const readStart = performance.now();
            const pixels = Array.from({ length: probeCount }, () => new Float32Array(6 * faceSize ** 2 * 4));
            if (mode === 'atlas') {
                const raw = new Float32Array(atlas.width * atlas.height * 4);
                gl.readPixels(0, 0, atlas.width, atlas.height, gl.RGBA, gl.FLOAT, raw);
                for (let p = 0; p < probeCount; p++)
                    for (let face = 0; face < 6; face++)
                        for (let y = 0; y < faceSize; y++)
                            for (let x = 0; x < faceSize; x++) {
                                const source = ((p * faceSize + y) * atlas.width + face * faceSize + x) * 4;
                                pixels[p].set(raw.subarray(source, source + 4), pixelIndex(face, x, y, faceSize));
                            }
            } else {
                serial.forEach((target, tile) => {
                    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
                    const face = tile % 6,
                        p = Math.floor(tile / 6);
                    gl.readPixels(
                        0,
                        0,
                        faceSize,
                        faceSize,
                        gl.RGBA,
                        gl.FLOAT,
                        pixels[p].subarray(face * faceSize ** 2 * 4, (face + 1) * faceSize ** 2 * 4),
                    );
                });
            }
            const readbackAndRepackMs = performance.now() - readStart;
            const projectionStart = performance.now();
            const coefficients = pixels.map((data) =>
                sh.project(faceSize, (_d, face, x, y) => {
                    const i = pixelIndex(face, x, y, faceSize);
                    return [data[i], data[i + 1], data[i + 2]];
                }),
            );
            const cpuSHMs = performance.now() - projectionStart;
            const totalBakeMs = performance.now() - start;
            let gpuMs = null;
            if (query) {
                const deadline = performance.now() + 10000;
                while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) && performance.now() < deadline)
                    await new Promise((resolve) => setTimeout(resolve, 10));
                const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
                const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT);
                if (available && !disjoint) gpuMs = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
                else report.blockers.push(`GPU timer ${available ? 'disjoint' : 'timeout'} in ${mode}.`);
            }
            const error = gl.getError();
            if (error !== gl.NO_ERROR) throw new Error(`WEBGL_ERROR: ${error}`);
            let maxCoefficientError = 0,
                maxPixelError = 0;
            pixels.forEach((data, p) =>
                sh.forEachTexel(faceSize, (d, _w, face, x, y) => {
                    const expected = radiance(p, d),
                        offset = pixelIndex(face, x, y, faceSize);
                    for (let c = 0; c < 3; c++)
                        maxPixelError = Math.max(maxPixelError, Math.abs(data[offset + c] - expected[c]));
                }),
            );
            coefficients.forEach((rows, p) =>
                rows.forEach((rgb, i) =>
                    rgb.forEach((v, c) => {
                        maxCoefficientError = Math.max(maxCoefficientError, Math.abs(v - reference[p][i][c]));
                    }),
                ),
            );
            if (!Number.isFinite(maxCoefficientError) || maxCoefficientError > 1e-5 || maxPixelError > 1e-5)
                throw new Error(`REFERENCE_MISMATCH: coefficients=${maxCoefficientError}, pixels=${maxPixelError}`);
            return {
                mode,
                cpuSceneTraversalMs: null,
                cpuSubmissionMs,
                gpuMs,
                readbackAndRepackMs,
                cpuSHMs,
                totalBakeMs,
                maxCoefficientError,
                maxPixelError,
                draws: mode === 'atlas' ? 1 : probeCount * 6,
                coefficients,
                rawPixels: retainPixels ? pixels.map((data) => Array.from(data)) : undefined,
            };
        };
        // Warm both configurations and retain the explicit order, not a fabricated speedup statistic.
        report.warmups = [await capture('serial', false), await capture('atlas', false)];
        for (let pair = 0; pair < measuredPairs; pair++) {
            const order = pair % 2 === 0 ? ['serial', 'atlas'] : ['atlas', 'serial'];
            const samples = [];
            for (const mode of order) samples.push(await capture(mode, pair === 0));
            let serialAtlasCoefficientError = 0;
            samples[0].coefficients.forEach((rows, p) =>
                rows.forEach((rgb, i) =>
                    rgb.forEach((value, c) => {
                        serialAtlasCoefficientError = Math.max(
                            serialAtlasCoefficientError,
                            Math.abs(value - samples[1].coefficients[p][i][c]),
                        );
                    }),
                ),
            );
            if (serialAtlasCoefficientError > 1e-5)
                throw new Error(`SERIAL_ATLAS_MISMATCH: ${serialAtlasCoefficientError}`);
            report.samples.push({ pair, order, serialAtlasCoefficientError, samples });
        }
        report.referenceFixtureCompleted = true;
        report.endedAt = new Date().toISOString();
        report.notice =
            'Synthetic readback correctness only; T33 remains BLOCKED. No engine or device-wide performance conclusion.';
    } finally {
        resources.forEach(({ texture, framebuffer }) => {
            gl.deleteTexture(texture);
            gl.deleteFramebuffer(framebuffer);
        });
        shaders.forEach((shader) => gl.deleteShader(shader));
        queries.forEach((query) => gl.deleteQuery(query));
        if (program) gl.deleteProgram(program);
        report.resourceCleanupIssued = true; // Not physical browser-close proof.
    }
}
document.getElementById('run').addEventListener('click', async () => {
    const button = document.getElementById('run');
    button.disabled = true;
    result.textContent = 'Running standalone synthetic capture. This does not certify Cocos scene capture.';
    try {
        await run();
    } catch (error) {
        report ??= { decision: 'BLOCKED' };
        report.error = String(error);
    } finally {
        result.textContent = JSON.stringify(
            {
                ...report,
                samples: report.samples?.map((pair) => ({
                    ...pair,
                    samples: pair.samples.map(({ rawPixels, ...sample }) => sample),
                })),
            },
            null,
            2,
        );
        globalThis.upstreamProbeCaptureReport = report;
        download.disabled = false;
        button.disabled = false;
    }
});
download.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'upstream-probe-capture-raw.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});
