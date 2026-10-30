import {
    ranges,
    formats,
    pairs,
    projection,
    convention,
    validateExperiment,
    decodeFloat,
    depthAt,
    reconstruct,
} from './model.mjs';

const vertex = `#version 300 es
precision highp float;
uniform mat4 projection;
uniform float distance;
void main() {
    vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) * 2.0 - 1.0;
    gl_Position = projection * vec4(corner * distance, -distance, 1.0);
}`;
const fragment = `#version 300 es
precision highp float;
uniform vec4 marker;
out vec4 color;
void main() { color = marker; }`;
const sampleVertex = `#version 300 es
precision highp float;
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const sampleFragment = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D sceneDepth;
uniform vec4 reconstruction;
uniform bool reconstructDistance;
out vec4 color;
void main() {
    float value = texture(sceneDepth, vec2(0.5)).r;
    if (reconstructDistance) {
        float n = reconstruction.x, f = reconstruction.y;
        value = n * f / (reconstruction.z == 0.0 ? f - value * (f - n) : n + value * (f - n));
    }
    uint bits = floatBitsToUint(value);
    color = vec4(uvec4(bits, bits >> 8u, bits >> 16u, bits >> 24u) & 255u) / 255.0;
}`;
function run(options = {}) {
    const selected = validateExperiment(options);
    if (selected.pipeline !== 'isolated') throw new Error('UNSUPPORTED_PIPELINE: use native-target fixture separately');
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false });
    if (!gl) throw new Error('WEBGL2_REQUIRED');
    const sources = [],
        programs = [],
        shaders = [],
        textures = [],
        framebuffers = [];
    const failOnError = (stage) => {
        const error = gl.getError();
        if (error !== gl.NO_ERROR) throw new Error(`GL_ERROR:${stage}:${error}`);
    };
    const program = (vert, frag) => {
        const result = gl.createProgram();
        programs.push(result);
        for (const [type, source] of [
            [gl.VERTEX_SHADER, vert],
            [gl.FRAGMENT_SHADER, frag],
        ]) {
            const shader = gl.createShader(type);
            shaders.push(shader);
            sources.push({ stage: type, source });
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
                throw new Error(`SHADER_COMPILE:${gl.getShaderInfoLog(shader)}`);
            gl.attachShader(result, shader);
        }
        gl.linkProgram(result);
        if (!gl.getProgramParameter(result, gl.LINK_STATUS))
            throw new Error(`PROGRAM_LINK:${gl.getProgramInfoLog(result)}`);
        return result;
    };
    const texture = (internal) => {
        const tex = gl.createTexture();
        textures.push(tex);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texStorage2D(gl.TEXTURE_2D, 1, internal, 8, 8);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        failOnError('allocate');
        return tex;
    };
    const target = (color, depth, attachment) => {
        const fbo = gl.createFramebuffer();
        framebuffers.push(fbo);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
        if (depth) gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, depth, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
            throw new Error('UNSUPPORTED_FORMAT: framebuffer incomplete');
        return fbo;
    };
    const metadata = (() => {
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
        return {
            backend: 'webgl2',
            renderer: gl.getParameter(gl.RENDERER),
            vendor: gl.getParameter(gl.VENDOR),
            version: gl.getParameter(gl.VERSION),
            shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
            unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
            unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
            driver: 'not separately exposed by WebGL',
            userAgent: navigator.userAgent,
            context: gl.getContextAttributes(),
            fragmentHighp: {
                precision: precision.precision,
                rangeMin: precision.rangeMin,
                rangeMax: precision.rangeMax,
            },
        };
    })();
    try {
        const drawProgram = program(vertex, fragment),
            sampleProgram = program(sampleVertex, sampleFragment);
        const internal = {
            depth16: gl.DEPTH_COMPONENT16,
            depth24: gl.DEPTH_COMPONENT24,
            depth32f: gl.DEPTH_COMPONENT32F,
            'depth24-stencil8': gl.DEPTH24_STENCIL8,
        }[selected.format];
        const depth = texture(internal);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.NONE);
        const color = texture(gl.RGBA8),
            sampledColor = texture(gl.RGBA8);
        const attachment = selected.format === 'depth24-stencil8' ? gl.DEPTH_STENCIL_ATTACHMENT : gl.DEPTH_ATTACHMENT;
        const source = target(color, depth, attachment);
        const allocated = {
            immutableStorageInternalFormat: internal,
            framebufferComplete: true,
            depthBits: gl.getFramebufferAttachmentParameter(
                gl.FRAMEBUFFER,
                gl.DEPTH_ATTACHMENT,
                gl.FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE,
            ),
            componentType: gl.getFramebufferAttachmentParameter(
                gl.FRAMEBUFFER,
                gl.DEPTH_ATTACHMENT,
                gl.FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE,
            ),
            stencilBits:
                selected.format === 'depth24-stencil8'
                    ? gl.getFramebufferAttachmentParameter(
                          gl.FRAMEBUFFER,
                          gl.STENCIL_ATTACHMENT,
                          gl.FRAMEBUFFER_ATTACHMENT_STENCIL_SIZE,
                      )
                    : 0,
        };
        const expectedBits = selected.format === 'depth16' ? 16 : selected.format === 'depth32f' ? 32 : 24;
        if (
            allocated.depthBits !== expectedBits ||
            allocated.componentType !== (selected.format === 'depth32f' ? gl.FLOAT : gl.UNSIGNED_NORMALIZED)
        )
            throw new Error('ALLOCATED_FORMAT_MISMATCH');
        const destination = target(sampledColor);
        gl.viewport(0, 0, 8, 8);
        gl.disable(gl.BLEND);
        gl.disable(gl.DITHER);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.SCISSOR_TEST);
        gl.activeTexture(gl.TEXTURE0);
        const read = () => {
            const bytes = new Uint8Array(4);
            gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
            return Array.from(bytes);
        };
        const sample = (near, far, mode, linear = false) => {
            gl.bindFramebuffer(gl.FRAMEBUFFER, destination);
            gl.disable(gl.DEPTH_TEST);
            gl.depthMask(false);
            gl.useProgram(sampleProgram);
            gl.bindTexture(gl.TEXTURE_2D, depth);
            gl.uniform1i(gl.getUniformLocation(sampleProgram, 'sceneDepth'), 0);
            gl.uniform4f(
                gl.getUniformLocation(sampleProgram, 'reconstruction'),
                near,
                far,
                mode === 'normal' ? 0 : 1,
                0,
            );
            gl.uniform1i(gl.getUniformLocation(sampleProgram, 'reconstructDistance'), linear ? 1 : 0);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            const bytes = read();
            return { bytes, value: decodeFloat(bytes) };
        };
        const draw = (distances, near, far, mode) => {
            const config = convention(mode);
            gl.bindFramebuffer(gl.FRAMEBUFFER, source);
            gl.enable(gl.DEPTH_TEST);
            gl.depthMask(true);
            gl.depthFunc(gl[config.compare]);
            gl.clearColor(0, 0, 0, 1);
            gl.clearDepth(config.clear);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.useProgram(drawProgram);
            gl.uniformMatrix4fv(
                gl.getUniformLocation(drawProgram, 'projection'),
                false,
                new Float32Array(projection(near, far, mode)),
            );
            for (const [distance, marker] of distances) {
                gl.uniform1f(gl.getUniformLocation(drawProgram, 'distance'), distance);
                gl.uniform4fv(gl.getUniformLocation(drawProgram, 'marker'), marker);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            }
            const color = read(),
                depth = sample(near, far, mode),
                reconstructed = sample(near, far, mode, true);
            failOnError('draw/read');
            return { color, depth, reconstructed };
        };
        const rows = [];
        // A requested run is one explicitly chosen mode/format, never a silent fallback.
        for (const { near, far } of ranges)
            for (const pair of pairs(near, far)) {
                const [a, b] = pair.distances,
                    red = [1, 0, 0, 1],
                    blue = [0, 0, 1, 1];
                const single = [
                    draw([[a, red]], near, far, selected.mode),
                    draw([[b, blue]], near, far, selected.mode),
                ];
                const orders = [
                    draw(
                        [
                            [a, red],
                            [b, blue],
                        ],
                        near,
                        far,
                        selected.mode,
                    ),
                    draw(
                        [
                            [b, blue],
                            [a, red],
                        ],
                        near,
                        far,
                        selected.mode,
                    ),
                ];
                rows.push({
                    id: `${near}/${far}/${pair.id}`,
                    near,
                    far,
                    distances: pair.distances,
                    mode: selected.mode,
                    convention: convention(selected.mode),
                    projectionFloat32: Array.from(new Float32Array(projection(near, far, selected.mode))),
                    single,
                    orders,
                    analyticDepth: pair.distances.map((z) => depthAt(z, near, far, selected.mode)),
                    cpuReconstructionOfObserved: single.map((v) =>
                        reconstruct(v.depth.value, near, far, selected.mode),
                    ),
                });
            }
        return {
            schema: 'air-upstream-depth-experiment/1',
            status: 'OBSERVED_NOT_VALIDATED',
            requested: selected,
            allocated,
            metadata,
            rows,
            submittedSources: sources,
            glError: gl.getError(),
            runtimeIntegrated: false,
            compositorEvidence: false,
            performanceClaim: false,
        };
    } finally {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        for (const p of programs) gl.deleteProgram(p);
        for (const s of shaders) gl.deleteShader(s);
        for (const t of textures) gl.deleteTexture(t);
        for (const f of framebuffers) gl.deleteFramebuffer(f);
    }
}
window.__upstreamDepthExperiments = { ready: true, formats, run };
document.querySelector('#status').textContent =
    'Ready. Isolated full-convention experiment, not an engine Reverse-Z implementation. Run each explicit normal/reverse × depth16/depth24/depth32f/depth24-stencil8 choice. No GPU result is claimed until collected.';

// User-triggered only. No automatic execution or acceptance promotion.
let rawReport;
document.querySelector('#run').addEventListener('click', async () => {
    const button = document.querySelector('#run');
    button.disabled = true;
    try {
        rawReport = await window.__upstreamDepthExperiments.run({
            format: document.querySelector('#format').value,
            mode: document.querySelector('#mode').value,
        });
        window.__upstreamExperimentRaw = rawReport;
        document.querySelector('#status').textContent = JSON.stringify(
            {
                status: rawReport.status,
                rows: rawReport.rows.length,
                allocated: rawReport.allocated,
                note: 'Save raw observations and run the independent validator. This is not acceptance or compositor evidence.',
            },
            null,
            2,
        );
        document.querySelector('#save').disabled = false;
    } catch (error) {
        document.querySelector('#status').textContent = `${error.name}: ${error.message}`;
    } finally {
        button.disabled = false;
    }
});
document.querySelector('#save').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(rawReport, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'upstream-depth-experiments-raw.json';
    link.click();
    URL.revokeObjectURL(url);
});
