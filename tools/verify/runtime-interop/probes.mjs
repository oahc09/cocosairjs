/* Shared behavior probes for browsers and native WebGPU hosts. No AIR engine special cases. */
export const CASE_IDS = Object.freeze([
    'canvas-dom-events',
    'module-assets',
    'wasm-shader',
    'gpu-submit-present',
    'gpu-errors-loss',
]);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function bounded(promise, label, milliseconds = 10000) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

function errorDetails(error) {
    return { name: error?.name || 'Error', message: String(error?.message || error) };
}

async function observePhase(observations, name, operation) {
    observations.phases ??= {};
    const phase = { status: 'FAIL' };
    observations.phases[name] = phase;
    observations.stage = name;
    try {
        await operation();
        phase.status = 'PASS';
    } catch (error) {
        phase.error = errorDetails(error);
    }
    return phase.status === 'PASS';
}

async function loadTranslator(name, base, observations) {
    const jsUrl = new URL(`${name}.js`, base).href;
    const wasmUrl = new URL(`${name}.wasm`, base).href;
    observations[name] = { jsUrl, wasmUrl, stage: 'module-and-fetch', instantiated: false };
    const [module, response] = await bounded(Promise.all([import(jsUrl), fetch(wasmUrl)]), `${name} asset load`);
    assert(response.ok, `${name} WASM HTTP ${response.status}`);
    const binary = await bounded(response.arrayBuffer(), `${name} WASM bytes`);
    Object.assign(observations[name], { wasmBytes: binary.byteLength, stage: 'instantiate-wasm' });
    const factory = new Promise((resolve, reject) => {
        Promise.resolve(
            module.default({
                wasmPath: wasmUrl,
                instantiateWasm(imports, receive) {
                    WebAssembly.instantiate(binary, imports)
                        .then((result) => {
                            observations[name].instantiated = true;
                            observations[name].stage = 'factory-ready';
                            receive(result.instance);
                        })
                        .catch(reject);
                    return {};
                },
            }),
        ).then(resolve, reject);
    });
    return bounded(factory, `${name} factory`, 30000);
}

export async function runRuntimeInterop({ canvas, assetBaseUrl, moduleUrl, capturePresentation } = {}) {
    const report = { schema: 'air-runtime-interop-probes-v1', completed: false, cases: [], pass: false };
    let device, context, translated;
    const buffers = [];
    const previousSize = canvas && { width: canvas.width, height: canvas.height };
    async function record(id, operation, blocked) {
        const entry = { id, status: blocked ? 'BLOCKED' : 'FAIL', observations: {} };
        report.cases.push(entry);
        if (blocked) {
            entry.reason = blocked;
            return;
        }
        try {
            const result = await operation(entry.observations);
            const failedPhases = Object.entries(entry.observations.phases || {}).filter(
                ([, phase]) => phase.status === 'FAIL',
            );
            entry.status = failedPhases.length ? 'FAIL' : result?.status || 'PASS';
            if (failedPhases.length)
                entry.error = {
                    name: 'Error',
                    message: failedPhases
                        .map(([name, phase]) => `${name}: ${phase.error?.message || 'failed'}`)
                        .join('; '),
                };
            if (result?.reason) entry.reason = result.reason;
        } catch (error) {
            entry.error = errorDetails(error);
        }
    }

    try {
        await record(CASE_IDS[0], async (observations) => {
            assert(typeof document !== 'undefined', 'document is unavailable');
            assert(typeof HTMLCanvasElement === 'function', 'HTMLCanvasElement is unavailable');
            assert(canvas instanceof HTMLCanvasElement, 'Canvas does not inherit HTMLCanvasElement');
            const parent = canvas.parentNode;
            const next = canvas.nextSibling;
            const tabIndex = canvas.tabIndex;
            const outer = document.createElement('div');
            const inner = document.createElement('div');
            const marker = document.createElement('span');
            outer.id = 'air-runtime-interop-dom-probe';
            let eventCount = 0;
            const listener = (event) => {
                eventCount++;
                event.preventDefault();
            };
            try {
                document.body.appendChild(outer);
                outer.appendChild(marker);
                outer.insertBefore(inner, marker);
                inner.appendChild(canvas);
                assert(outer.contains(canvas) && canvas.parentElement === inner, 'DOM ancestry is inconsistent');
                assert(document.getElementById(outer.id) === outer, 'getElementById misses inserted node');
                assert(document.querySelector(`#${outer.id}`) === outer, 'querySelector misses inserted node');
                const rect = canvas.getBoundingClientRect();
                observations.rect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                assert(
                    Object.values(observations.rect).every(Number.isFinite) && rect.width > 0 && rect.height > 0,
                    'Canvas has no finite positive layout rectangle',
                );
                canvas.tabIndex = 0;
                canvas.focus();
                observations.focused = document.activeElement === canvas;
                assert(observations.focused, 'Canvas focus did not update document.activeElement');
                canvas.addEventListener('runtime-interop-probe', listener);
                const event = new Event('runtime-interop-probe', { cancelable: true });
                const dispatched = canvas.dispatchEvent(event);
                canvas.removeEventListener('runtime-interop-probe', listener);
                canvas.dispatchEvent(new Event('runtime-interop-probe'));
                observations.event = { count: eventCount, dispatched, defaultPrevented: event.defaultPrevented };
                observations.inputScope = 'Synthetic dispatch only; physical input is not exercised.';
                assert(eventCount === 1 && !dispatched && event.defaultPrevented, 'Cancelable event behavior failed');
            } finally {
                canvas.removeEventListener('runtime-interop-probe', listener);
                canvas.tabIndex = tabIndex;
                if (parent) parent.insertBefore(canvas, next?.parentNode === parent ? next : null);
                else canvas.parentNode?.removeChild(canvas);
                outer.parentNode?.removeChild(outer);
            }
        });

        await record(CASE_IDS[1], async (observations) => {
            const expectedUrl = new URL(moduleUrl).href;
            observations.stage = 'dynamic-import-and-fetch';
            observations.requestedUrl = expectedUrl;
            const [module, response] = await bounded(
                Promise.all([import(expectedUrl), fetch(expectedUrl)]),
                'Module and fetch fixture',
            );
            assert(response.ok, `Module fixture HTTP ${response.status}`);
            const body = await bounded(response.text(), 'Module fixture response body');
            observations.module = { url: module.url, token: module.token, responseBytes: body.length };
            observations.stage = 'module-loaded';
            assert(module.token === 'air-runtime-interop-fixture-v1', 'Dynamic module export is incorrect');
            assert(module.url === expectedUrl, 'import.meta.url does not identify the loaded module');
            assert(body.includes(module.token), 'fetch and module loader do not resolve the same fixture');
            const baseURI = typeof document === 'undefined' ? undefined : document.baseURI;
            observations.baseURI = baseURI ?? null;
            assert(typeof baseURI === 'string' && baseURI.length > 0, 'document.baseURI is unavailable');
            const relative = new URL('./module-fixture.mjs', baseURI);
            observations.relativeURL = relative.href;
            assert(new URL(relative.href).href === relative.href, 'Relative URL resolution is unstable');
        });

        await record(CASE_IDS[2], async (observations) => {
            const base = new URL(assetBaseUrl).href.replace(/\/?$/, '/');
            const loaded = await Promise.allSettled([
                loadTranslator('glslang', base, observations),
                loadTranslator('twgsl', base, observations),
            ]);
            const failed = loaded.find((result) => result.status === 'rejected');
            if (failed) throw failed.reason;
            const [glslang, twgsl] = loaded.map((result) => result.value);
            const sources = {
                vertex: `#version 450
void main() {
    vec2 positions[3] = vec2[](vec2(0.0, 0.8), vec2(-0.8, -0.8), vec2(0.8, -0.8));
    gl_Position = vec4(positions[gl_VertexIndex], 0.0, 1.0);
}`,
                fragment: `#version 450
layout(location = 0) out vec4 outColor;
void main() { outColor = vec4(1.0, 0.0, 0.0, 1.0); }`,
            };
            const shaders = {};
            for (const [stage, source] of Object.entries(sources)) {
                const spirv = glslang.compileGLSL(source, stage, false, '1.3');
                const wgsl = twgsl.convertSpirV2WGSL(spirv);
                assert(spirv[0] === 0x07230203 && spirv.length > 5, `${stage} SPIR-V is invalid`);
                const entry = new RegExp(`@${stage}\\b[\\s\\S]*?\\bfn\\s+(\\w+)\\s*\\(`).exec(wgsl);
                assert(entry, `${stage} WGSL has no entry point`);
                shaders[stage] = { code: wgsl, entryPoint: entry[1] };
                observations[stage] = { spirvWords: spirv.length, wgsl, entryPoint: entry[1] };
            }
            translated = shaders;
        });

        await record(CASE_IDS[3], async (observations) => {
            observations.phases = Object.fromEntries(
                ['adapterInfo', 'deviceNegotiation', 'render', 'readback', 'presentation'].map((name) => [
                    name,
                    { status: 'BLOCKED', reason: 'Prerequisite phase has not completed' },
                ]),
            );
            let gpu, adapter;
            const available = await observePhase(observations, 'adapter', async () => {
                gpu = typeof navigator === 'undefined' ? undefined : navigator.gpu;
                assert(gpu, 'navigator.gpu is unavailable');
                adapter = await bounded(gpu.requestAdapter(), 'GPU adapter');
                assert(adapter, 'requestAdapter returned null');
            });
            if (!available) return { status: 'FAIL', reason: 'GPU adapter acquisition failed' };
            await observePhase(observations, 'adapterInfo', async () => {
                observations.adapter = {};
                for (const key of ['vendor', 'device', 'description']) {
                    assert(typeof adapter.info?.[key] === 'string', `GPUAdapter.info.${key} is unavailable`);
                    observations.adapter[key] = adapter.info[key];
                }
            });
            const negotiated = await observePhase(observations, 'deviceNegotiation', async () => {
                observations.features = Array.from(adapter.features);
                const requiredLimits = {};
                for (const key of ['maxVertexAttributes', 'maxSampledTexturesPerShaderStage']) {
                    assert(
                        Number.isFinite(adapter.limits[key]) && adapter.limits[key] > 0,
                        `Invalid adapter limit ${key}`,
                    );
                    requiredLimits[key] = adapter.limits[key];
                }
                observations.requiredLimits = requiredLimits;
                device = await bounded(adapter.requestDevice({ requiredLimits, requiredFeatures: [] }), 'GPU device');
                observations.deviceLimits = {};
                for (const [key, required] of Object.entries(requiredLimits)) {
                    const actual = device.limits?.[key];
                    observations.deviceLimits[key] = actual ?? null;
                    assert(
                        Number.isFinite(actual) && actual >= required,
                        `GPUDevice.limits.${key} does not satisfy ${required}`,
                    );
                }
                assert(device.lost && typeof device.lost.then === 'function', 'GPUDevice.lost is not a Promise');
            });
            if (!translated || !negotiated) {
                const reason = !translated
                    ? 'Real shader translators did not produce shaders'
                    : 'Required device limits were not negotiated';
                for (const name of ['render', 'readback', 'presentation']) observations.phases[name].reason = reason;
                return { status: 'BLOCKED', reason };
            }
            observations.stage = 'render';
            observations.phases.render = { status: 'FAIL' };
            const unexpectedErrors = [];
            const onError = (event) => {
                unexpectedErrors.push(String(event.error?.message || event.error));
                event.preventDefault();
            };
            device.addEventListener('uncapturederror', onError);
            let staging,
                scopeOpen = false;
            try {
                device.pushErrorScope('validation');
                scopeOpen = true;
                canvas.width = 64;
                canvas.height = 64;
                context = canvas.getContext('webgpu');
                assert(context, 'Canvas cannot acquire a WebGPU context');
                const format = gpu.getPreferredCanvasFormat();
                context.configure({
                    device,
                    format,
                    alphaMode: 'opaque',
                    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
                });
                const stages = {};
                for (const stage of ['vertex', 'fragment']) {
                    const module = device.createShaderModule({ code: translated[stage].code });
                    const compilation = await bounded(module.getCompilationInfo(), `${stage} GPU compilation`);
                    assert(
                        !compilation.messages.some((message) => message.type === 'error'),
                        `${stage} GPU compilation failed`,
                    );
                    stages[stage] = { module, entryPoint: translated[stage].entryPoint };
                }
                const pipeline = device.createRenderPipeline({
                    layout: 'auto',
                    vertex: stages.vertex,
                    fragment: { ...stages.fragment, targets: [{ format }] },
                    primitive: { topology: 'triangle-list' },
                });
                const target = context.getCurrentTexture();
                staging = device.createBuffer({
                    size: 256 * 64,
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                });
                buffers.push(staging);
                const encoder = device.createCommandEncoder();
                const pass = encoder.beginRenderPass({
                    colorAttachments: [
                        {
                            view: target.createView(),
                            clearValue: { r: 0, g: 0, b: 1, a: 1 },
                            loadOp: 'clear',
                            storeOp: 'store',
                        },
                    ],
                });
                pass.setPipeline(pipeline);
                pass.draw(3);
                pass.end();
                encoder.copyTextureToBuffer({ texture: target }, { buffer: staging, bytesPerRow: 256 }, [64, 64]);
                device.queue.submit([encoder.finish()]);
                observations.phases.render.status = 'PASS';
                observations.stage = 'readback';
                observations.phases.readback = { status: 'FAIL' };
                await bounded(staging.mapAsync(GPUMapMode.READ), 'GPU readback');
                const raw = Array.from(
                    new Uint8Array(staging.getMappedRange()).slice(32 * 256 + 32 * 4, 32 * 256 + 32 * 4 + 4),
                );
                const rgba = format.startsWith('bgra') ? [raw[2], raw[1], raw[0], raw[3]] : raw;
                observations.readback = { raw, rgba, format, sample: { x: 32, y: 32 }, expected: [255, 0, 0, 255] };
                assert(
                    rgba.every((value, index) => Math.abs(value - observations.readback.expected[index]) <= 1),
                    'GPU triangle readback is incorrect',
                );
                observations.phases.readback.status = 'PASS';
                staging.unmap();
                await bounded(device.queue.onSubmittedWorkDone(), 'GPU submission completion');
                observations.stage = 'presentation';
                observations.phases.presentation = { status: 'FAIL' };
                await bounded(
                    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
                    'Compositor frame boundary',
                );
                if (typeof capturePresentation !== 'function') {
                    observations.presentation = {
                        status: 'NOT_RUN',
                        reason: 'Host supplied no screenshot observer',
                    };
                    observations.phases.presentation = observations.presentation;
                    return {
                        status: 'NOT_RUN',
                        reason: 'GPU readback passed; independent presentation evidence is absent',
                    };
                }
                observations.presentation = await bounded(
                    capturePresentation({ canvas, expected: [255, 0, 0, 255], sample: { x: 32, y: 32 } }),
                    'Presentation capture',
                );
                if (observations.presentation?.status === 'NOT_RUN') {
                    observations.phases.presentation = observations.presentation;
                    return {
                        status: 'NOT_RUN',
                        reason: observations.presentation.reason || 'Host presentation capture was not run',
                    };
                }
                assert(observations.presentation?.pass === true, 'Host screenshot pixel verification did not pass');
                observations.phases.presentation = { status: 'PASS' };
            } finally {
                try {
                    staging?.unmap();
                } finally {
                    try {
                        if (scopeOpen) {
                            const validation = await bounded(device.popErrorScope(), 'GPU validation scope');
                            observations.validationError = validation?.message || null;
                            observations.unexpectedErrors = unexpectedErrors;
                            assert(!validation && unexpectedErrors.length === 0, 'Unexpected GPU validation error');
                        }
                    } finally {
                        device.removeEventListener('uncapturederror', onError);
                    }
                }
            }
        });

        await record(CASE_IDS[4], async (observations) => {
            observations.acquisition = device ? 'reused-probe-device' : 'independent-default-device';
            const acquired = await observePhase(observations, 'acquisition', async () => {
                if (!device) {
                    const gpu = typeof navigator === 'undefined' ? undefined : navigator.gpu;
                    assert(gpu, 'navigator.gpu is unavailable');
                    const adapter = await bounded(gpu.requestAdapter(), 'Independent error probe adapter');
                    assert(adapter, 'Independent requestAdapter returned null');
                    device = await bounded(adapter.requestDevice(), 'Independent default device');
                }
            });
            if (!acquired) return { status: 'FAIL', reason: 'No device available for independent error/lost probes' };
            const invalidDescriptor = () => ({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_SRC });
            await observePhase(observations, 'errorScope', async () => {
                device.pushErrorScope('validation');
                let scoped;
                try {
                    buffers.push(device.createBuffer(invalidDescriptor()));
                } finally {
                    scoped = await bounded(device.popErrorScope(), 'Expected validation scope');
                }
                observations.scopedError = scoped?.message || null;
                assert(
                    typeof scoped?.message === 'string' && scoped.message.length > 0,
                    'Error scope missed invalid buffer usage',
                );
            });
            await observePhase(observations, 'uncapturedError', async () => {
                let onError;
                let registered = false;
                assert(typeof device.addEventListener === 'function', 'GPUDevice.addEventListener is unavailable');
                assert(
                    typeof device.removeEventListener === 'function',
                    'GPUDevice.removeEventListener is unavailable',
                );
                try {
                    const eventReceived = new Promise((resolve) => {
                        onError = (event) => {
                            event.preventDefault();
                            resolve({ message: event.error?.message, defaultPrevented: event.defaultPrevented });
                        };
                        device.addEventListener('uncapturederror', onError);
                        registered = true;
                    });
                    const invalidBuffer = device.createBuffer(invalidDescriptor());
                    buffers.push(invalidBuffer);
                    // Flush the device timeline so native validation callbacks reach the JS event target.
                    device.queue.submit([]);
                    await bounded(device.queue.onSubmittedWorkDone(), 'Uncaptured error delivery submission');
                    observations.uncapturedError = await bounded(eventReceived, 'Expected uncaptured validation event');
                    assert(
                        typeof observations.uncapturedError.message === 'string' &&
                            observations.uncapturedError.message.length > 0 &&
                            observations.uncapturedError.defaultPrevented,
                        'Uncaptured error event contract failed',
                    );
                } finally {
                    if (registered) device.removeEventListener('uncapturederror', onError);
                }
            });
            await observePhase(observations, 'lost', async () => {
                try {
                    context?.unconfigure();
                } finally {
                    context = undefined;
                    device.destroy();
                }
                const lost = await bounded(device.lost, 'Destroyed device lost Promise');
                observations.lost = { reason: lost.reason, message: lost.message };
                assert(
                    lost.reason === 'destroyed' && typeof lost.message === 'string',
                    'Destroyed device lost result is incorrect',
                );
            });
            const failures = Object.values(observations.phases)
                .filter((phase) => phase.status === 'FAIL')
                .map((phase) => phase.error);
            if (failures.length) observations.failures = failures;
        });
    } finally {
        const cleanupErrors = [];
        for (const cleanup of [
            () => context?.unconfigure(),
            ...buffers.map((buffer) => () => buffer.destroy()),
            () => device?.destroy(),
            () => {
                if (canvas && previousSize) {
                    canvas.width = previousSize.width;
                    canvas.height = previousSize.height;
                }
            },
        ]) {
            try {
                cleanup();
            } catch (error) {
                cleanupErrors.push(errorDetails(error));
            }
        }
        if (cleanupErrors.length) report.cleanupErrors = cleanupErrors;
        report.completed = report.cases.length === CASE_IDS.length;
        report.pass =
            report.completed && report.cases.every((entry) => entry.status === 'PASS') && !cleanupErrors.length;
    }
    return report;
}
