import * as cc from 'cocosair';
import { createAirDepthSamplerTemplate } from '../../../tools/debug/effect-layout.js';

// Deliberately no numerical oracle here. The Node collector compares raw pixels with the independent CPU reference.
const records = [];
const originalSource = WebGL2RenderingContext.prototype.shaderSource;
WebGL2RenderingContext.prototype.shaderSource = function (shader, source) {
    records.push({ stage: this.getShaderParameter(shader, this.SHADER_TYPE), source });
    return originalSource.call(this, shader, source);
};
const errorRecord = (error) => ({ name: error.name, message: error.message, stack: error.stack });
const getErrors = (gl) => {
    const errors = [];
    for (let i = 0; i < 16; ++i) {
        const error = gl.getError();
        if (error === gl.NO_ERROR) break;
        errors.push(error);
    }
    return errors;
};
let app;
let running;

async function engineColor(vectors) {
    app = await cc.createAirApp({ canvas: document.querySelector('#GameCanvas') });
    const scene = new cc.Scene('U03 native unlit color');
    const cameraNode = new cc.Node('U03 camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(0, 0, 3);
    const camera = cameraNode.addComponent(cc.Camera);
    camera.projection = cc.Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 1;
    camera.clearColor = new cc.Color(0, 0, 0, 0);
    const node = new cc.Node('U03 flat ROI');
    scene.addChild(node);
    const renderer = node.addComponent(cc.MeshRenderer);
    renderer.mesh = cc.utils.createMesh({
        positions: [-2, -2, 0, 2, -2, 0, 2, 2, 0, -2, 2, 0],
        indices: [0, 1, 2, 0, 2, 3],
    });
    const material = new cc.Material();
    material.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: false } });
    renderer.setSharedMaterial(material, 0);
    const target = cc.createAirRenderTarget({
        width: 32,
        height: 32,
        colorFormat: 'rgba8',
        depthFormat: 'none',
        samples: 1,
    });
    const detach = target.attachCamera(camera);
    app.run(scene);
    const clock = cc.createStepClock();
    clock.begin();
    const rows = [];
    try {
        for (const toneMapping of ['default', 'linear']) {
            scene.globals.postSettings.toneMappingType = toneMapping === 'default' ? 0 : 1;
            for (const vector of vectors) {
                // colorScale has no authored-color conversion; mainColor RGB is white and alpha is linear.
                material.setProperty('mainColor', new cc.Vec4(1, 1, 1, vector.rgba[3]));
                material.setProperty('colorScale', new cc.Vec3(...vector.rgba.slice(0, 3)));
                await clock.step(1 / 60);
                rows.push({
                    kind: 'native-output',
                    id: `${toneMapping}/${vector.id}`,
                    input: vector.rgba,
                    toneMapping,
                    pixels: Array.from(target.readColor({ x: 14, y: 14, width: 4, height: 4 })),
                    pipelineMacros: { ...cc.director.root.pipeline.macros },
                });
            }
        }
        const gl = cc.director.root.device.gl;
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        return {
            rows,
            glErrors: getErrors(gl),
            renderer: gl.getParameter(gl.RENDERER),
            unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
            version: gl.getParameter(gl.VERSION),
        };
    } finally {
        detach();
        target.dispose();
        clock.end();
        await app.close();
    }
}

function isolatedGpu() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 4;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: false });
    if (!gl) throw new Error('WEBGL2_REQUIRED: isolated texture/depth context');
    const programs = [],
        shaders = [],
        textures = [],
        framebuffers = [];
    const prefix = '#version 300 es\nprecision highp float;\n';
    const vertex =
        prefix +
        'void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }';
    const program = (fragment) => {
        const p = gl.createProgram();
        programs.push(p);
        for (const [type, source] of [
            [gl.VERTEX_SHADER, vertex],
            [gl.FRAGMENT_SHADER, prefix + fragment],
        ]) {
            const shader = gl.createShader(type);
            shaders.push(shader);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
                throw new Error(`SHADER_COMPILE: ${gl.getShaderInfoLog(shader)}`);
            gl.attachShader(p, shader);
        }
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`PROGRAM_LINK: ${gl.getProgramInfoLog(p)}`);
        return p;
    };
    const texture = (format, external, type, bytes) => {
        const value = gl.createTexture();
        textures.push(value);
        gl.bindTexture(gl.TEXTURE_2D, value);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, format, 1, 1, 0, external, type, bytes);
        return value;
    };
    const output = texture(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const framebuffer = gl.createFramebuffer();
    framebuffers.push(framebuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error('FRAMEBUFFER_INCOMPLETE');
    gl.viewport(0, 0, 1, 1);
    const draw = () => {
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const pixel = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return Array.from(pixel);
    };
    const rows = [];
    try {
        const sample = program(
            'uniform highp sampler2D colorInput; uniform int softwareDecode; out vec4 color; void main() { color = texture(colorInput, vec2(0.5)); if (softwareDecode == 1) color.rgb *= color.rgb; }',
        );
        gl.useProgram(sample);
        gl.uniform1i(gl.getUniformLocation(sample, 'colorInput'), 0);
        const bytes = [128, 64, 192, 102];
        for (const mode of ['none', 'shader-srgb', 'hardware-srgb']) {
            texture(
                mode === 'hardware-srgb' ? gl.SRGB8_ALPHA8 : gl.RGBA8,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                new Uint8Array(bytes),
            );
            gl.uniform1i(gl.getUniformLocation(sample, 'softwareDecode'), mode === 'shader-srgb' ? 1 : 0);
            rows.push({ kind: 'texture-decode', id: mode, bytes, mode, pixels: draw() });
        }
        const blend = program('uniform vec4 rgba; out vec4 color; void main() { color = rgba; }');
        gl.useProgram(blend);
        const input = [0.2, 0.4, 0.6, 0.25],
            destination = [0.1, 0.2, 0.3, 0.8];
        for (const premultiplied of [false, true]) {
            gl.disable(gl.BLEND);
            gl.clearColor(...destination);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.enable(gl.BLEND);
            gl.blendEquation(gl.FUNC_ADD);
            gl.blendFuncSeparate(
                premultiplied ? gl.ONE : gl.SRC_ALPHA,
                gl.ONE_MINUS_SRC_ALPHA,
                gl.ONE,
                gl.ONE_MINUS_SRC_ALPHA,
            );
            gl.uniform4fv(
                gl.getUniformLocation(blend, 'rgba'),
                input.map((value, i) => (premultiplied && i < 3 ? value * input[3] : value)),
            );
            rows.push({
                kind: 'linear-blend',
                id: premultiplied ? 'premultiplied' : 'straight',
                input,
                destination,
                pixels: draw(),
            });
        }
        gl.disable(gl.BLEND);
        const depthTemplate = createAirDepthSamplerTemplate({ name: 'sceneDepth', binding: 0, mode: 'manual-compare' });
        const depth = program(
            depthTemplate.glsl3 +
                '\nuniform vec2 compareParams; out vec4 color; void main() { float d = texture(sceneDepth, vec2(0.5)).r; color = vec4(sceneDepthVisibility(vec2(0.5), compareParams.x, compareParams.y), d, 0.0, 1.0); }',
        );
        gl.useProgram(depth);
        gl.uniform1i(gl.getUniformLocation(depth, 'sceneDepth'), 0);
        for (const value of [0.125, 0.5, 0.875]) {
            // Real depth24 normalized storage, no compare-mode sampler or fabricated color-depth texture.
            texture(
                gl.DEPTH_COMPONENT24,
                gl.DEPTH_COMPONENT,
                gl.UNSIGNED_INT,
                new Uint32Array([Math.round(value * 0xffffffff)]),
            );
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.NONE);
            for (const [label, offset, bias] of [
                ['below', -(2 ** -20), 0],
                ['above', 2 ** -20, 0],
                ['bias', 2 ** -20, 2 ** -19],
            ]) {
                gl.uniform2f(gl.getUniformLocation(depth, 'compareParams'), value + offset, bias);
                rows.push({
                    kind: 'depth24-compare',
                    id: `${value}/${label}`,
                    depth: value,
                    referenceDepth: value + offset,
                    bias,
                    pixels: draw(),
                });
            }
        }
        const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
        return {
            rows,
            glErrors: getErrors(gl),
            highFloat: { rangeMin: precision.rangeMin, rangeMax: precision.rangeMax, precision: precision.precision },
        };
    } finally {
        for (const value of programs) gl.deleteProgram(value);
        for (const value of shaders) gl.deleteShader(value);
        for (const value of textures) gl.deleteTexture(value);
        for (const value of framebuffers) gl.deleteFramebuffer(value);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
}
async function run() {
    const response = await fetch('./vectors.json');
    if (!response.ok) throw new Error(`Fixture HTTP ${response.status}`);
    const vectors = await response.json();
    try {
        const engine = await engineColor(vectors.vectors);
        const isolated = isolatedGpu();
        document.querySelector('#status').textContent =
            `${engine.rows.length} native color rows and ${isolated.rows.length} texture/blend/depth rows observed. Independent validation runs in the collector. This screenshot is diagnostic only, not compositor evidence.`;
        return {
            schemaVersion: 1,
            status: 'OBSERVED_NOT_VALIDATED',
            engine,
            isolated,
            submittedSources: records,
            compositorEvidence: false,
        };
    } finally {
        WebGL2RenderingContext.prototype.shaderSource = originalSource;
    }
}
window.__upstreamColorProbe = { ready: true, run: () => (running ||= run()) };
document.querySelector('#status').textContent =
    'Ready. Run window.__upstreamColorProbe.run() or the U03 collector. Results are raw observations until independently validated.';
window.addEventListener('unhandledrejection', (event) => {
    document.querySelector('#status').textContent = JSON.stringify(errorRecord(event.reason));
});
