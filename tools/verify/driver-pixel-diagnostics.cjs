'use strict';
// Diagnostic replay only. Nothing in this module can satisfy an example/API proof.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const oracle = require('./shaders-driver-pilot-oracle.cjs');
const SCHEMA = 'driver-pixel-diagnostic-replay/1';
const KEY = '__driverPixelDiagnosticReplay';
const ANCHOR = 'float transition = insideMaskV * insideMaskV * (3.0 - 2.0 * insideMaskV);';
const FIELDS = Object.freeze([
    'v_uv.x',
    'v_uv.y',
    'aspect',
    'delta.x',
    'delta.y',
    'cosR',
    'sinR',
    'f.x',
    'f.y',
    'dot(f, f)',
    'length(f)',
    's0',
    'sdf',
    'pxH',
    'sharpEdge',
    'silhouetteW',
    'insideMaskV',
    'transition',
]);
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
function injection() {
    return (
        '\n    highp float driverDiagnosticValue = 0.0;\n' +
        FIELDS.map(
            (name, i) => `    ${i ? 'else ' : ''}if (driverDiagnosticIndex == ${i}) driverDiagnosticValue = ${name};`,
        ).join('\n') +
        '\n    highp uint driverDiagnosticBits = floatBitsToUint(driverDiagnosticValue);\n' +
        '    highp uvec4 driverDiagnosticBytes = uvec4(driverDiagnosticBits, driverDiagnosticBits >> 8u, driverDiagnosticBits >> 16u, driverDiagnosticBits >> 24u) & uvec4(255u);\n' +
        '    cc_FragColor = vec4(driverDiagnosticBytes) / 255.0;\n    return;\n'
    );
}
function instrumentFragment(source) {
    if (source.split(ANCHOR).length !== 2 || source.split('void main() {').length !== 2)
        throw Error('Diagnostic fragment anchors are not unique');
    return source
        .replace('void main() {', 'uniform highp int driverDiagnosticIndex;\nvoid main() {')
        .replace(ANCHOR, ANCHOR + injection());
}
function mismatchDetails(data) {
    const state = data?.stepped;
    if (data?.errors?.length || !state || !Array.isArray(data.probe?.pixels)) return [];
    const points = oracle.points('holographic', state.canvas.width, state.canvas.height);
    if (data.probe.pixels.length !== points.length) return [];
    return data.probe.pixels.flatMap((pixel, i) => {
        const point = points[i];
        if (pixel.x !== point.x || pixel.y !== point.y || !Array.isArray(pixel.rgba) || pixel.rgba.length !== 4)
            return [];
        const expected = oracle.linearBytes(
            oracle.pixel(
                'holographic',
                state.outputs,
                state.time,
                state.canvas.width,
                state.canvas.height,
                point.x,
                point.y,
            ),
        );
        const delta = pixel.rgba.map((v, c) => Math.abs(v - expected[c]));
        return delta.some((v) => v > 2) ? [{ ...point, actual: [...pixel.rgba], expected, delta, tolerance: 2 }] : [];
    });
}
function failure(error) {
    return {
        schema: SCHEMA,
        diagnosticOnly: true,
        canonicalEffect: 'none',
        status: 'error',
        errors: [String(error.stack || error)],
    };
}
// Self-contained browser callback: no engine tick, material mutation, async observation,
// extension enablement, or product/oracle modification. All GL objects are diagnostic-owned.
async function inPage(config) {
    const key = config.key;
    if (typeof config.token !== 'string' || !config.token) throw Error('Diagnostic ownership token required');
    if (config.action !== 'prepare') {
        const session = window[key];
        if (!session || session.token !== config.token)
            return { ...config.label, status: 'error', errors: ['Diagnostic capture session missing'] };
        try {
            return session.finish(config);
        } finally {
            if (session.isStopped()) delete window[key];
        }
    }
    // Serialized callbacks do not inherit this CJS file's strict mode. Reject
    // even an undefined/accessor slot rather than silently failing publication.
    if (key in window) throw Error('Diagnostic capture session already exists');
    const cc = await import('/build/cocosair.module.js');
    const trace = window.__apiTrace;
    function observe(read) {
        if (trace) trace.observing++;
        try {
            return read();
        } finally {
            if (trace) trace.observing--;
        }
    }
    return observe(() => {
        const hook = window.__driverpilot;
        const app = trace?.app || window.__airApp;
        const canvas = document.querySelector('#GameCanvas');
        const gl = canvas?.getContext('webgl2');
        const node = app?.getScene()?.getChildByName('driver-' + hook.snapshot().currentInstance);
        const renderer = node?.getComponent(cc.MeshRenderer);
        // Read the actual rendered submodel variant, including its macro patches,
        // rather than asking a material pass for an unpatched candidate variant.
        const shader = renderer?.model?.subModels?.[0]?.shaders?.[0]?.gpuShader;
        if (!gl || !shader?.glProgram || shader.gpuStages.length !== 2) throw Error('Linked Driver shader unavailable');
        const originalProgram = shader.glProgram;
        if (!gl.getProgramParameter(originalProgram, gl.LINK_STATUS))
            throw Error('Original Driver program is not linked');
        const result = {
            ...config.label,
            status: 'capture-installed',
            errors: [],
            matchingDraws: 0,
            interpretation:
                'Separately linked diagnostic replay; instrumentation may change compiler optimization. These scalars are not an independent read of the original program execution.',
            sourceProvenance: config.sourceProvenance,
            source: {
                programName: shader.name,
                linkStatus: gl.getProgramParameter(originalProgram, gl.LINK_STATUS),
                infoLog: gl.getProgramInfoLog(originalProgram),
                stages: shader.gpuStages.map((stage) => ({
                    stage: stage.type === cc.gfx.ShaderStageFlagBit.VERTEX ? 'vertex' : 'fragment',
                    source: '#version 300 es\n' + stage.source,
                })),
                precision: ['VERTEX_SHADER', 'FRAGMENT_SHADER'].flatMap((stage) =>
                    ['LOW_FLOAT', 'MEDIUM_FLOAT', 'HIGH_FLOAT', 'LOW_INT', 'MEDIUM_INT', 'HIGH_INT'].map((type) => {
                        const p = gl.getShaderPrecisionFormat(gl[stage], gl[type]);
                        return { stage, type, rangeMin: p?.rangeMin, rangeMax: p?.rangeMax, precision: p?.precision };
                    }),
                ),
                version: gl.getParameter(gl.VERSION),
                shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
                vendor: gl.getParameter(gl.VENDOR),
                renderer: gl.getParameter(gl.RENDERER),
                contextAttributes: gl.getContextAttributes(),
            },
        };
        const methods = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'];
        const originals = methods.map((name) => ({
            name,
            fn: gl[name],
            descriptor: Object.getOwnPropertyDescriptor(gl, name),
        }));
        const flags = [
            'BLEND',
            'DEPTH_TEST',
            'CULL_FACE',
            'STENCIL_TEST',
            'SCISSOR_TEST',
            'DITHER',
            'RASTERIZER_DISCARD',
            'SAMPLE_ALPHA_TO_COVERAGE',
            'SAMPLE_COVERAGE',
        ];
        let captured = null;
        let wrappersRestored = false;
        function stop() {
            if (wrappersRestored) return;
            const errors = [];
            for (const entry of originals) {
                try {
                    if (entry.descriptor) Object.defineProperty(gl, entry.name, entry.descriptor);
                    else delete gl[entry.name];
                } catch (error) {
                    errors.push(entry.name + ': ' + String(error));
                }
            }
            wrappersRestored = originals.every((entry) => gl[entry.name] === entry.fn);
            result.wrappersRestored = wrappersRestored;
            if (errors.length) result.errors.push(...errors);
            if (!wrappersRestored) throw Error('Diagnostic draw wrappers not restored');
        }
        function capture(name, args) {
            if (
                gl.getParameter(gl.CURRENT_PROGRAM) !== originalProgram ||
                gl.isEnabled(gl.BLEND) ||
                gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) === null
            )
                return;
            result.matchingDraws++;
            if (result.matchingDraws !== 1) return;
            const genericUBO = gl.getParameter(gl.UNIFORM_BUFFER_BINDING);
            try {
                const blocks = [];
                const count = gl.getProgramParameter(originalProgram, gl.ACTIVE_UNIFORM_BLOCKS);
                if (count < 1 || count > 8) throw Error('Unbounded diagnostic uniform blocks');
                let totalBytes = 0;
                for (let index = 0; index < count; index++) {
                    const name = gl.getActiveUniformBlockName(originalProgram, index);
                    const binding = gl.getActiveUniformBlockParameter(originalProgram, index, gl.UNIFORM_BLOCK_BINDING);
                    const blockBytes = gl.getActiveUniformBlockParameter(
                        originalProgram,
                        index,
                        gl.UNIFORM_BLOCK_DATA_SIZE,
                    );
                    const buffer = gl.getIndexedParameter(gl.UNIFORM_BUFFER_BINDING, binding);
                    const offset = gl.getIndexedParameter(gl.UNIFORM_BUFFER_START, binding);
                    const rangeBytes = gl.getIndexedParameter(gl.UNIFORM_BUFFER_SIZE, binding);
                    if (!buffer || blockBytes < 1 || (totalBytes += blockBytes) > 65536)
                        throw Error('Invalid diagnostic UBO size');
                    gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
                    const bufferBytes = gl.getBufferParameter(gl.UNIFORM_BUFFER, gl.BUFFER_SIZE);
                    if (offset + blockBytes > bufferBytes || (rangeBytes && blockBytes > rangeBytes))
                        throw Error('Diagnostic UBO range insufficient');
                    const bytes = new Uint8Array(blockBytes);
                    gl.getBufferSubData(gl.UNIFORM_BUFFER, offset, bytes);
                    blocks.push({ name, binding, blockBytes, offset, rangeBytes, bufferBytes, bytes });
                }
                const uniformCount = gl.getProgramParameter(originalProgram, gl.ACTIVE_UNIFORMS);
                if (uniformCount > 256) throw Error('Unbounded diagnostic active uniforms');
                const indexes = Array.from({ length: uniformCount }, (_, i) => i);
                if (
                    indexes.length &&
                    Array.from(gl.getActiveUniforms(originalProgram, indexes, gl.UNIFORM_BLOCK_INDEX)).some(
                        (v) => v < 0,
                    )
                )
                    throw Error('Non-block uniforms require an explicit capture implementation');
                const attributes = Array.from(
                    { length: gl.getProgramParameter(originalProgram, gl.ACTIVE_ATTRIBUTES) },
                    (_, i) => {
                        const a = gl.getActiveAttrib(originalProgram, i);
                        return {
                            name: a.name,
                            type: a.type,
                            size: a.size,
                            location: gl.getAttribLocation(originalProgram, a.name),
                        };
                    },
                );
                const enabled = Object.fromEntries(flags.map((name) => [name, gl.isEnabled(gl[name])]));
                if (flags.some((name) => !['DITHER', 'SCISSOR_TEST'].includes(name) && enabled[name]))
                    throw Error('Unsupported canonical diagnostic draw state');
                const colorMask = Array.from(gl.getParameter(gl.COLOR_WRITEMASK));
                if (colorMask.some((v) => !v)) throw Error('Canonical color mask is not full RGBA');
                const vao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
                if (!vao || !gl.isVertexArray(vao)) throw Error('Canonical draw requires a live VAO');
                captured = {
                    name,
                    args: Array.from(args),
                    blocks,
                    attributes,
                    vao,
                    enabled,
                    colorMask,
                    viewport: Array.from(gl.getParameter(gl.VIEWPORT)),
                    scissor: Array.from(gl.getParameter(gl.SCISSOR_BOX)),
                    samples: gl.getParameter(gl.SAMPLES),
                };
                result.capture = {
                    draw: { method: name, args: captured.args },
                    attributes,
                    enabled,
                    colorMask,
                    viewport: captured.viewport,
                    scissor: captured.scissor,
                    samples: captured.samples,
                    blocks: blocks.map((b) => ({ ...b, bytes: Array.from(b.bytes) })),
                };
            } finally {
                gl.bindBuffer(gl.UNIFORM_BUFFER, genericUBO);
            }
        }
        function replay(input) {
            // Never consume GL errors: existing downstream checks must see the
            // unchanged queue, including any diagnostic-generated GL errors.
            result.glErrorQueue = 'unread-preserved';
            result.glErrorFreeClaim = false;
            if (result.matchingDraws !== 1 || !captured) throw Error('Expected exactly one captured canonical draw');
            if (!gl.isVertexArray(captured.vao)) throw Error('Captured canonical VAO no longer exists');
            if (captured.samples !== 0 && captured.samples !== 1)
                throw Error('Diagnostic target is single-sample only');
            const { width, height } = input.canvas;
            if (width !== 480 || height !== 360 || captured.viewport.join() !== [0, 0, width, height].join())
                throw Error('Diagnostic scope must retain original 480x360 viewport');
            if (input.pixels.length !== 15) throw Error('Diagnostic replay requires all 15 original points');
            const stages = result.source.stages;
            const vertex = stages.find((s) => s.stage === 'vertex').source;
            const fragment = stages.find((s) => s.stage === 'fragment').source;
            if (fragment.split(config.anchor).length !== 2 || fragment.split('void main() {').length !== 2)
                throw Error('Diagnostic fragment anchors are not unique');
            const instrumented = fragment
                .replace('void main() {', 'uniform highp int driverDiagnosticIndex;\nvoid main() {')
                .replace(config.anchor, config.anchor + config.injection);
            result.variants = [
                { role: 'unchanged-replay', executed: false, vertex, fragment },
                {
                    role: 'instrumented-replay',
                    executed: false,
                    vertex,
                    fragment: instrumented,
                    insertionAfter: config.anchor,
                },
            ];
            const own = { shaders: [], programs: [], buffers: [], textures: [], framebuffers: [] };
            const saved = {
                program: gl.getParameter(gl.CURRENT_PROGRAM),
                vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
                elementBuffer: gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING),
                draw: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
                read: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
                readBuffer: gl.getParameter(gl.READ_BUFFER),
                drawBuffers: Array.from({ length: gl.getParameter(gl.MAX_DRAW_BUFFERS) }, (_, i) =>
                    gl.getParameter(gl.DRAW_BUFFER0 + i),
                ),
                activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE),
                texture: null,
                genericUBO: gl.getParameter(gl.UNIFORM_BUFFER_BINDING),
                pbo: gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING),
                viewport: Array.from(gl.getParameter(gl.VIEWPORT)),
                scissor: Array.from(gl.getParameter(gl.SCISSOR_BOX)),
                colorMask: Array.from(gl.getParameter(gl.COLOR_WRITEMASK)),
                clearColor: Array.from(gl.getParameter(gl.COLOR_CLEAR_VALUE)),
                enabled: Object.fromEntries(flags.map((name) => [name, gl.isEnabled(gl[name])])),
                pack: Object.fromEntries(
                    ['PACK_ALIGNMENT', 'PACK_ROW_LENGTH', 'PACK_SKIP_PIXELS', 'PACK_SKIP_ROWS'].map((name) => [
                        name,
                        gl.getParameter(gl[name]),
                    ]),
                ),
                ubos: [...new Set(captured.blocks.map((b) => b.binding))].map((binding) => ({
                    binding,
                    buffer: gl.getIndexedParameter(gl.UNIFORM_BUFFER_BINDING, binding),
                    offset: gl.getIndexedParameter(gl.UNIFORM_BUFFER_START, binding),
                    size: gl.getIndexedParameter(gl.UNIFORM_BUFFER_SIZE, binding),
                })),
            };
            try {
                gl.activeTexture(gl.TEXTURE0);
                saved.texture = gl.getParameter(gl.TEXTURE_BINDING_2D);
            } finally {
                gl.activeTexture(saved.activeTexture);
            }
            function resource(kind, create) {
                const object = create();
                if (!object) throw Error('Diagnostic resource allocation failed: ' + kind);
                own[kind].push(object);
                return object;
            }
            function compile(type, source) {
                const shader = resource('shaders', () => gl.createShader(type));
                gl.shaderSource(shader, source);
                gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
                    throw Error(gl.getShaderInfoLog(shader) || 'Diagnostic compile failed');
                return shader;
            }
            function program(fragmentSource) {
                const program = resource('programs', () => gl.createProgram());
                gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
                gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
                for (const attribute of captured.attributes)
                    gl.bindAttribLocation(program, attribute.location, attribute.name);
                gl.linkProgram(program);
                if (!gl.getProgramParameter(program, gl.LINK_STATUS))
                    throw Error(gl.getProgramInfoLog(program) || 'Diagnostic link failed');
                for (const block of captured.blocks) {
                    const index = gl.getUniformBlockIndex(program, block.name);
                    if (index === gl.INVALID_INDEX) continue;
                    if (
                        gl.getActiveUniformBlockParameter(program, index, gl.UNIFORM_BLOCK_DATA_SIZE) !==
                        block.blockBytes
                    )
                        throw Error('Diagnostic UBO layout changed: ' + block.name);
                    gl.uniformBlockBinding(program, index, block.binding);
                }
                return program;
            }
            function read() {
                return input.pixels.map(({ x, y }) => {
                    const rgba = new Uint8Array(4);
                    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
                    return { x, y, rgba: Array.from(rgba) };
                });
            }
            function draw() {
                gl.disable(gl.SCISSOR_TEST);
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);
                if (captured.enabled.SCISSOR_TEST) gl.enable(gl.SCISSOR_TEST);
                originals.find((entry) => entry.name === captured.name).fn.apply(gl, captured.args);
            }
            try {
                gl.activeTexture(gl.TEXTURE0);
                const texture = resource('textures', () => gl.createTexture());
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
                const framebuffer = resource('framebuffers', () => gl.createFramebuffer());
                gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
                gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
                gl.readBuffer(gl.COLOR_ATTACHMENT0);
                if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
                    throw Error('Diagnostic FBO incomplete');
                gl.bindVertexArray(captured.vao);
                for (const block of captured.blocks) {
                    const buffer = resource('buffers', () => gl.createBuffer());
                    gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
                    gl.bufferData(gl.UNIFORM_BUFFER, block.bytes, gl.STATIC_DRAW);
                    gl.bindBufferBase(gl.UNIFORM_BUFFER, block.binding, buffer);
                }
                gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
                for (const name of Object.keys(saved.pack)) gl.pixelStorei(gl[name], name === 'PACK_ALIGNMENT' ? 1 : 0);
                gl.viewport(...captured.viewport);
                gl.scissor(...captured.scissor);
                gl.colorMask(...captured.colorMask);
                for (const name of flags) gl[captured.enabled[name] ? 'enable' : 'disable'](gl[name]);
                const original = program(fragment);
                gl.useProgram(original);
                draw();
                result.variants[0].executed = true;
                result.unchangedReplay = { pixels: read() };
                result.unchangedReplay.exact =
                    JSON.stringify(result.unchangedReplay.pixels) === JSON.stringify(input.pixels);
                if (!result.unchangedReplay.exact)
                    throw Error('Unchanged replay differs; instrumented intermediates were not collected');
                const instrument = program(instrumented);
                gl.useProgram(instrument);
                gl.disable(gl.DITHER);
                const index = gl.getUniformLocation(instrument, 'driverDiagnosticIndex');
                if (index === null) throw Error('Diagnostic selector uniform missing');
                result.intermediates = [];
                for (let field = 0; field < config.fields.length; field++) {
                    gl.uniform1i(index, field);
                    draw();
                    result.variants[1].executed = true;
                    result.intermediates.push({
                        field: config.fields[field],
                        pixels: read().map((pixel) => {
                            const bytes = Uint8Array.from(pixel.rgba),
                                data = new DataView(bytes.buffer);
                            const value = data.getFloat32(0, true);
                            return {
                                ...pixel,
                                bits: data.getUint32(0, true).toString(16).padStart(8, '0'),
                                value: Number.isFinite(value) ? value : null,
                                finite: Number.isFinite(value),
                            };
                        }),
                    });
                }
                result.status = 'observed';
            } finally {
                const cleanupErrors = [];
                function clean(name, action) {
                    try {
                        action();
                    } catch (error) {
                        cleanupErrors.push(name + ': ' + String(error));
                    }
                }
                clean('program', () => gl.useProgram(saved.program));
                clean('vao', () => gl.bindVertexArray(saved.vao));
                clean('draw framebuffer', () => gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, saved.draw));
                clean('read framebuffer', () => gl.bindFramebuffer(gl.READ_FRAMEBUFFER, saved.read));
                clean('texture', () => {
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, saved.texture);
                    gl.activeTexture(saved.activeTexture);
                });
                for (const b of saved.ubos)
                    clean('ubo ' + b.binding, () => {
                        if (b.buffer && b.size)
                            gl.bindBufferRange(gl.UNIFORM_BUFFER, b.binding, b.buffer, b.offset, b.size);
                        else gl.bindBufferBase(gl.UNIFORM_BUFFER, b.binding, b.buffer);
                    });
                clean('generic ubo', () => gl.bindBuffer(gl.UNIFORM_BUFFER, saved.genericUBO));
                clean('pack buffer', () => gl.bindBuffer(gl.PIXEL_PACK_BUFFER, saved.pbo));
                for (const [name, value] of Object.entries(saved.pack))
                    clean(name, () => gl.pixelStorei(gl[name], value));
                clean('viewport', () => gl.viewport(...saved.viewport));
                clean('scissor', () => gl.scissor(...saved.scissor));
                clean('mask', () => gl.colorMask(...saved.colorMask));
                clean('clear color', () => gl.clearColor(...saved.clearColor));
                for (const name of flags) clean(name, () => gl[saved.enabled[name] ? 'enable' : 'disable'](gl[name]));
                for (const [kind, method] of [
                    ['programs', 'deleteProgram'],
                    ['shaders', 'deleteShader'],
                    ['buffers', 'deleteBuffer'],
                    ['textures', 'deleteTexture'],
                    ['framebuffers', 'deleteFramebuffer'],
                ])
                    for (const object of own[kind]) clean(method, () => gl[method](object));
                result.cleanup = {
                    errors: cleanupErrors,
                    created: Object.fromEntries(Object.entries(own).map(([kind, objects]) => [kind, objects.length])),
                    resourcesDeleted: [
                        ['programs', 'isProgram'],
                        ['shaders', 'isShader'],
                        ['buffers', 'isBuffer'],
                        ['textures', 'isTexture'],
                        ['framebuffers', 'isFramebuffer'],
                    ].every(([kind, method]) => own[kind].every((object) => !gl[method](object))),
                    programRestored: gl.getParameter(gl.CURRENT_PROGRAM) === saved.program,
                    vaoRestored: gl.getParameter(gl.VERTEX_ARRAY_BINDING) === saved.vao,
                    elementBufferRestored: gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING) === saved.elementBuffer,
                    framebuffersRestored:
                        gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) === saved.draw &&
                        gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) === saved.read,
                    framebufferBuffersRestored:
                        gl.getParameter(gl.READ_BUFFER) === saved.readBuffer &&
                        saved.drawBuffers.every((value, i) => gl.getParameter(gl.DRAW_BUFFER0 + i) === value),
                    genericUBORestored: gl.getParameter(gl.UNIFORM_BUFFER_BINDING) === saved.genericUBO,
                    indexedUBOsRestored: saved.ubos.every(
                        (b) =>
                            gl.getIndexedParameter(gl.UNIFORM_BUFFER_BINDING, b.binding) === b.buffer &&
                            gl.getIndexedParameter(gl.UNIFORM_BUFFER_START, b.binding) === b.offset &&
                            gl.getIndexedParameter(gl.UNIFORM_BUFFER_SIZE, b.binding) === b.size,
                    ),
                    packRestored:
                        gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) === saved.pbo &&
                        Object.entries(saved.pack).every(([name, value]) => gl.getParameter(gl[name]) === value),
                    stateRestored:
                        JSON.stringify(Array.from(gl.getParameter(gl.VIEWPORT))) === JSON.stringify(saved.viewport) &&
                        JSON.stringify(Array.from(gl.getParameter(gl.SCISSOR_BOX))) === JSON.stringify(saved.scissor) &&
                        JSON.stringify(Array.from(gl.getParameter(gl.COLOR_WRITEMASK))) ===
                            JSON.stringify(saved.colorMask) &&
                        JSON.stringify(Array.from(gl.getParameter(gl.COLOR_CLEAR_VALUE))) ===
                            JSON.stringify(saved.clearColor) &&
                        flags.every((name) => gl.isEnabled(gl[name]) === saved.enabled[name]),
                    activeTextureRestored: gl.getParameter(gl.ACTIVE_TEXTURE) === saved.activeTexture,
                };
                try {
                    gl.activeTexture(gl.TEXTURE0);
                    result.cleanup.textureRestored = gl.getParameter(gl.TEXTURE_BINDING_2D) === saved.texture;
                } finally {
                    gl.activeTexture(saved.activeTexture);
                }
                if (cleanupErrors.length || Object.values(result.cleanup).some((v) => v === false))
                    throw Error('Diagnostic cleanup/restoration failed; see retained receipt');
            }
        }
        const session = {
            token: config.token,
            isStopped: () => wrappersRestored,
            finish(input) {
                return observe(() => {
                    const executedBefore = JSON.stringify({ calls: trace?.calls, reads: trace?.reads });
                    try {
                        stop();
                        result.mismatches = input.mismatches || [];
                        if (input.action === 'abort') result.status = 'aborted';
                        else if (!result.mismatches.length) result.status = 'not-needed';
                        else if (result.errors.length) result.status = 'error';
                        else replay(input);
                    } catch (error) {
                        result.status = 'error';
                        result.errors.push(String(error.stack || error));
                    } finally {
                        try {
                            stop();
                        } catch (error) {
                            result.status = 'error';
                            result.errors.push(String(error));
                        }
                    }
                    result.trace = {
                        synchronousObservationOnly: true,
                        executionCountsUnchanged:
                            executedBefore === JSON.stringify({ calls: trace?.calls, reads: trace?.reads }),
                    };
                    if (!result.trace.executionCountsUnchanged) {
                        result.status = 'error';
                        result.errors.push('Diagnostic replay contaminated execution counts');
                    }
                    return result;
                });
            },
        };
        // Recheck after the module-import await, immediately before publication.
        if (key in window) throw Error('Diagnostic capture session already exists');
        Object.defineProperty(window, key, { value: session, configurable: true });
        if (window[key] !== session || !Object.getOwnPropertyDescriptor(window, key)?.configurable)
            throw Error('Diagnostic capture session publication failed');
        try {
            for (const entry of originals) {
                const wrapper = function (...args) {
                    const value = entry.fn.apply(this, args);
                    // Never place the original product draw inside observing.
                    try {
                        if (this === gl) observe(() => capture(entry.name, args));
                    } catch (error) {
                        result.errors.push(String(error.stack || error));
                    }
                    return value;
                };
                gl[entry.name] = wrapper;
                if (gl[entry.name] !== wrapper)
                    throw Error('Diagnostic draw wrapper installation failed: ' + entry.name);
            }
        } catch (error) {
            try {
                stop();
            } finally {
                delete window[key];
            }
            throw error;
        }
        return { ...config.label, status: 'capture-installed' };
    });
}
function label() {
    return { schema: SCHEMA, diagnosticOnly: true, canonicalEffect: 'none' };
}
const createToken = () => crypto.randomUUID();
async function prepare(page, token) {
    const rel = 'src/cocos/gfx/webgl2/webgl2-commands.ts';
    const source = fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');
    if (!source.includes('gl.shaderSource(gpuStage.glShader, `#version 300 es\\n${gpuStage.source}`)'))
        throw Error('Frozen WebGL submitted-source prefix changed');
    return page.evaluate(inPage, {
        action: 'prepare',
        token,
        key: KEY,
        label: label(),
        anchor: ANCHOR,
        injection: injection(),
        fields: FIELDS,
        sourceProvenance: {
            kind: 'engine-retained-stages-plus-verified-submit-prefix',
            independentGetShaderSource: false,
            reason: 'The engine detaches/deletes shader objects after linking; these are reconstructed submitted stages associated with the linked program.',
            prefix: '#version 300 es\n',
            sourceFile: rel,
            sourceSha256: sha256(source),
        },
    });
}
async function finish(page, data, abort = false, token) {
    const result = await page.evaluate(inPage, {
        action: abort ? 'abort' : 'finish',
        token,
        key: KEY,
        label: label(),
        mismatches: abort ? [] : mismatchDetails(data),
        canvas: data?.stepped?.canvas,
        pixels: data?.probe?.pixels,
    });
    for (const stage of result.source?.stages || []) stage.sha256 = sha256(stage.source);
    for (const block of result.capture?.blocks || []) block.sha256 = sha256(Uint8Array.from(block.bytes));
    for (const variant of result.variants || []) {
        variant.vertexSha256 = sha256(variant.vertex);
        variant.fragmentSha256 = sha256(variant.fragment);
    }
    return result;
}
module.exports = {
    SCHEMA,
    KEY,
    ANCHOR,
    FIELDS,
    injection,
    instrumentFragment,
    mismatchDetails,
    failure,
    inPage,
    createToken,
    prepare,
    finish,
};
