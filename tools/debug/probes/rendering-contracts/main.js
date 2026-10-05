import * as cc from 'cocosair';
import { createAirDepthSamplerTemplate, prepareEffectForRegistration } from '../../effect-layout.js';

const canvas = document.querySelector('#GameCanvas');
const app = await cc.createAirApp({ canvas });
window.__airApp = app;
const device = cc.director.root.device;
const gl = device.gl || canvas.getContext('webgl2');
if (!gl) throw new Error('WEBGL2_REQUIRED');
const status = document.querySelector('#status');
const results = [];

function errorRecord(error) {
    return { name: error?.name || 'Error', code: error?.code ?? null, message: String(error?.message || error) };
}
function takeGLErrors() {
    const errors = [];
    for (let index = 0; index < 16; ++index) {
        const code = gl.getError();
        if (code === gl.NO_ERROR) break;
        errors.push(code);
    }
    return errors;
}
function preserveBindings(run) {
    const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    const draw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
    const renderbuffer = gl.getParameter(gl.RENDERBUFFER_BINDING);
    try {
        return run();
    } finally {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
        gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
    }
}
function capabilities() {
    const renderer = gl.getExtension('WEBGL_debug_renderer_info');
    const extension = !!gl.getExtension('EXT_color_buffer_float');
    const query = (format) => {
        try {
            return Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, format, gl.SAMPLES) || []);
        } catch (error) {
            return { error: errorRecord(error) };
        }
    };
    return {
        webglVersion: gl.getParameter(gl.VERSION),
        shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        renderer: renderer ? gl.getParameter(renderer.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        maxSamples: gl.getParameter(gl.MAX_SAMPLES),
        floatColorAttachment: extension,
        gpuTimer: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
        formats: {
            RGBA8: { samples: query(gl.RGBA8), featureMask: device.getFormatFeatures(cc.gfx.Format.RGBA8) },
            RGBA16F: { samples: query(gl.RGBA16F), featureMask: device.getFormatFeatures(cc.gfx.Format.RGBA16F) },
        },
    };
}
function attachment(framebuffer, attachment = gl.COLOR_ATTACHMENT0) {
    return preserveBindings(() => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        const type = gl.getFramebufferAttachmentParameter(
            gl.FRAMEBUFFER,
            attachment,
            gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE,
        );
        const object = gl.getFramebufferAttachmentParameter(
            gl.FRAMEBUFFER,
            attachment,
            gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME,
        );
        const result = {
            framebufferStatus: gl.checkFramebufferStatus(gl.FRAMEBUFFER),
            objectType: type,
            componentType: gl.getFramebufferAttachmentParameter(
                gl.FRAMEBUFFER,
                attachment,
                gl.FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE,
            ),
            redBits: gl.getFramebufferAttachmentParameter(
                gl.FRAMEBUFFER,
                attachment,
                gl.FRAMEBUFFER_ATTACHMENT_RED_SIZE,
            ),
            greenBits: gl.getFramebufferAttachmentParameter(
                gl.FRAMEBUFFER,
                attachment,
                gl.FRAMEBUFFER_ATTACHMENT_GREEN_SIZE,
            ),
            blueBits: gl.getFramebufferAttachmentParameter(
                gl.FRAMEBUFFER,
                attachment,
                gl.FRAMEBUFFER_ATTACHMENT_BLUE_SIZE,
            ),
            alphaBits: gl.getFramebufferAttachmentParameter(
                gl.FRAMEBUFFER,
                attachment,
                gl.FRAMEBUFFER_ATTACHMENT_ALPHA_SIZE,
            ),
            samples: 1,
        };
        if (type === gl.RENDERBUFFER) {
            gl.bindRenderbuffer(gl.RENDERBUFFER, object);
            result.samples = gl.getRenderbufferParameter(gl.RENDERBUFFER, gl.RENDERBUFFER_SAMPLES);
            result.internalFormat = gl.getRenderbufferParameter(gl.RENDERBUFFER, gl.RENDERBUFFER_INTERNAL_FORMAT);
            result.width = gl.getRenderbufferParameter(gl.RENDERBUFFER, gl.RENDERBUFFER_WIDTH);
            result.height = gl.getRenderbufferParameter(gl.RENDERBUFFER, gl.RENDERBUFFER_HEIGHT);
        }
        return result;
    });
}
async function baseline() {
    const rows = [];
    for (const formatName of ['RGBA8', 'RGBA16F'])
        for (const samples of [1, 4]) {
            let target;
            try {
                const color = new cc.gfx.ColorAttachment();
                color.format = cc.gfx.Format[formatName];
                color.sampleCount = samples;
                const depth = new cc.gfx.DepthStencilAttachment();
                depth.format = cc.gfx.Format.DEPTH_STENCIL;
                depth.sampleCount = samples;
                target = new cc.RenderTexture();
                target.initialize({ width: 64, height: 48, passInfo: new cc.gfx.RenderPassInfo([color], depth) });
                const framebuffer = target.window.framebuffer.getGpuFramebuffer().glFramebuffer;
                const actual = attachment(framebuffer);
                rows.push({
                    requested: { format: formatName, samples },
                    actual,
                    gfxFormat: target.getGFXTexture().format,
                    status: actual.framebufferStatus === gl.FRAMEBUFFER_COMPLETE ? 'OBSERVED' : 'INCOMPLETE',
                });
            } catch (error) {
                rows.push({ requested: { format: formatName, samples }, status: 'ERROR', error: errorRecord(error) });
            } finally {
                target?.destroy();
            }
        }
    const report = { kind: 'legacy-baseline', capabilities: capabilities(), rows };
    status.textContent = JSON.stringify(report, null, 2);
    return report;
}

let fixture;
async function prepareFixture() {
    if (fixture) return fixture;
    const definitions = await Promise.all(
        ['source', 'sample', 'depth'].map(async (name) => {
            const response = await fetch(new URL(`./${name}.effect.json`, import.meta.url));
            if (!response.ok) throw new Error(`Effect definition ${name}: HTTP ${response.status}`);
            return response.json();
        }),
    );
    const template = createAirDepthSamplerTemplate({ name: 'sceneDepth', binding: 1, mode: 'manual-compare' });
    const depthShader = definitions[2].shaders[0];
    depthShader.glsl4.frag = depthShader.glsl4.frag.replace(
        'layout(set = 1, binding = 1) uniform sampler2D sceneDepth;',
        template.glsl4,
    );
    depthShader.glsl3.frag = depthShader.glsl3.frag.replace('uniform sampler2D sceneDepth;', template.glsl3);
    depthShader.samplerTextures[0] = template.resource;
    const effects = definitions.map((definition) => {
        definition = prepareEffectForRegistration(definition).effect;
        const effect = Object.assign(new cc.EffectAsset(), definition);
        effect.onLoaded();
        return effect;
    });
    const scene = new cc.Scene('Rendering contracts');
    const sourceNode = new cc.Node('Source Camera');
    scene.addChild(sourceNode);
    sourceNode.setPosition(0, 0, 3);
    const sourceCamera = sourceNode.addComponent(cc.Camera);
    sourceCamera.near = 0.1;
    sourceCamera.far = 30;
    sourceCamera.visibility = 1 << 3;
    sourceCamera.priority = 0;
    sourceCamera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
    sourceCamera.clearColor = new cc.Color(0, 0, 0, 255);
    const displayNode = new cc.Node('Display Camera');
    scene.addChild(displayNode);
    displayNode.setPosition(0, 0, 3);
    const displayCamera = displayNode.addComponent(cc.Camera);
    displayCamera.projection = cc.Camera.ProjectionType.ORTHO;
    displayCamera.orthoHeight = 1;
    displayCamera.visibility = cc.Layers.Enum.DEFAULT;
    displayCamera.priority = 1;
    displayCamera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
    displayCamera.clearColor = new cc.Color(12, 18, 28, 255);
    const sourceMaterial = new cc.Material();
    sourceMaterial.initialize({ effectAsset: effects[0] });
    const displayMaterial = new cc.Material();
    displayMaterial.initialize({ effectAsset: effects[1] });
    const depthMaterial = new cc.Material();
    depthMaterial.initialize({ effectAsset: effects[2] });
    const geometries = [
        { positions: [-2, -2, 0, 2, -2, 0, 2, 2, 0, -2, 2, 0], indices: [0, 1, 2, 0, 2, 3] },
        { positions: [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], indices: [0, 1, 2, 0, 2, 3] },
    ];
    const nodes = geometries.map((geometry, index) => {
        const node = new cc.Node(index ? 'Resolved Sampler' : 'HDR Source');
        node.layer = index ? cc.Layers.Enum.DEFAULT : 1 << 3;
        scene.addChild(node);
        const renderer = node.addComponent(cc.MeshRenderer);
        renderer.mesh = cc.utils.createMesh(geometry);
        renderer.setSharedMaterial(index ? displayMaterial : sourceMaterial, 0);
        return node;
    });
    app.run(scene);
    const clock = cc.createStepClock();
    clock.begin();
    fixture = {
        scene,
        sourceCamera,
        displayMaterial,
        displayCamera,
        depthMaterial,
        sourceMaterial,
        nodes,
        effects,
        clock,
        target: null,
        unbind: [],
        lastOptions: null,
    };
    return fixture;
}
async function stepTimed() {
    const targetFixture = await prepareFixture();
    const extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    let query;
    let gpuMs = null;
    let gpuUnavailableReason = extension ? null : 'EXT_disjoint_timer_query_webgl2 unavailable';
    if (extension) {
        query = gl.createQuery();
        if (query) gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
        else gpuUnavailableReason = 'GPU timer query allocation failed';
    }
    const start = performance.now();
    await targetFixture.clock.step(1 / 60);
    const cpuSubmitMs = performance.now() - start;
    if (query) {
        gl.endQuery(extension.TIME_ELAPSED_EXT);
        gl.flush();
        const deadline = performance.now() + 2000;
        while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) && performance.now() < deadline)
            await new Promise((resolve) => setTimeout(resolve, 5));
        if (gl.getParameter(extension.GPU_DISJOINT_EXT)) gpuUnavailableReason = 'GPU timer disjoint';
        else if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE))
            gpuUnavailableReason = 'GPU timer result timeout';
        else gpuMs = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(query);
    }
    return { cpuSubmitMs, gpuMs, gpuUnavailableReason };
}
function normalizedColor(values) {
    return Array.from(values.slice(0, 4), (value) => (values instanceof Uint8Array ? value / 255 : value));
}
async function choose(options) {
    const current = await prepareFixture();
    current.sourceMaterial.setProperty('hdrColor', new cc.Vec4(4, 2, 0.5, 1));
    current.displayMaterial.setProperty('contrast', new cc.Vec4(1, 1, 1, 1));
    for (const unbind of current.unbind) unbind();
    current.unbind = [];
    current.target?.dispose();
    current.target = cc.createAirRenderTarget(options);
    current.lastOptions = options;
    current.unbind.push(
        current.target.attachCamera(current.sourceCamera),
        current.target.bindColor(current.displayMaterial, 'colorSource'),
    );
    await stepTimed();
    return current.target;
}
function actualTarget(target) {
    const framebuffer = target.renderTexture.window.framebuffer.getGpuFramebuffer().glFramebuffer;
    return attachment(framebuffer);
}
function actualSampleTexture(target) {
    const texture = target.texture.getGFXTexture().gpuTexture.glTexture;
    return preserveBindings(() => {
        const framebuffer = gl.createFramebuffer();
        try {
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            return attachment(framebuffer);
        } finally {
            gl.deleteFramebuffer(framebuffer);
        }
    });
}
async function disposalProof() {
    const current = await prepareFixture();
    const target = await choose({ width: 64, height: 48, colorFormat: 'rgba8', samples: 4, sampleFallback: 'lower' });
    const framebuffer = target.renderTexture.window.framebuffer.getGpuFramebuffer().glFramebuffer;
    const texture = target.texture.getGFXTexture().gpuTexture.glTexture;
    target.dispose();
    target.dispose();
    let readError;
    try {
        target.readColor();
    } catch (error) {
        readError = errorRecord(error);
    }
    const checks = [
        { name: 'camera-binding-restored', ok: current.sourceCamera.targetTexture === null },
        {
            name: 'material-binding-restored',
            ok: current.displayMaterial.getProperty('colorSource') !== target.texture,
        },
        { name: 'gpu-storage-released', ok: !gl.isFramebuffer(framebuffer) && !gl.isTexture(texture) },
        { name: 'disposed-read-diagnostic', ok: readError?.code === 'AIR_E_RENDER_TARGET_DISPOSED' },
        { name: 'idempotent-dispose', ok: target.info.disposed },
    ];
    return {
        name: 'dispose-release-restore',
        status: checks.every((check) => check.ok) ? 'PASS' : 'FAIL',
        checks,
        readError,
    };
}
async function resizeAndRebind() {
    const current = await prepareFixture();
    if (!current.target) await choose({ width: 128, height: 96, colorFormat: 'rgba8', samples: 1 });
    const before = { ...current.target.info };
    current.target.resize(160, 120);
    // A new color after allocation prevents a stale, previously rendered texture from passing.
    current.sourceMaterial.setProperty('hdrColor', new cc.Vec4(0.2, 0.8, 0.4, 1));
    await stepTimed();
    const report = {
        before,
        after: { ...current.target.info },
        actual: actualTarget(current.target),
        center: normalizedColor(
            current.target.readColor({
                x: Math.floor(current.target.info.width / 2),
                y: Math.floor(current.target.info.height / 2),
                width: 1,
                height: 1,
            }),
        ),
    };
    report.glErrors = takeGLErrors();
    return report;
}
async function contrast() {
    const current = await prepareFixture();
    current.displayMaterial.setProperty('contrast', new cc.Vec4(0.18, 1, 1, 1));
    await stepTimed();
    return { contrast: 0.18 };
}
async function depthProof() {
    const current = await prepareFixture();
    const depthRows = [];
    for (const samples of [1, 4]) {
        let visualization;
        let detach;
        let unbind;
        try {
            const target = await choose({
                width: 128,
                height: 96,
                colorFormat: 'rgba8',
                samples,
                depthFormat: 'depth24-stencil8',
            });
            visualization = cc.createAirRenderTarget({
                width: 128,
                height: 96,
                colorFormat: 'rgba8',
                depthFormat: 'none',
            });
            const referenceDepth = 30 / 29.9 - 3 / (29.9 * 3);
            current.depthMaterial.setProperty('depthParams', new cc.Vec4(0.1, 30, referenceDepth + 0.01, 0));
            current.nodes[1].getComponent(cc.MeshRenderer).setSharedMaterial(current.depthMaterial, 0);
            detach = visualization.attachCamera(current.displayCamera);
            unbind = target.bindDepth(current.depthMaterial, 'sceneDepth');
            const timing = await stepTimed();
            const center = normalizedColor(visualization.readColor({ x: 64, y: 48, width: 1, height: 1 }));
            const glErrors = takeGLErrors();
            // Plane view distance is 3. Red stores reconstructed view distance / 10;
            // green manually compares an occluded reference, blue stores raw projected depth.
            const checks = [
                { name: 'perspective-depth-reconstruction', ok: Math.abs(center[0] * 10 - 3) < 0.06 },
                { name: 'manual-occlusion-comparison', ok: center[1] < 0.01 },
                { name: 'raw-depth-texture-sampling', ok: Math.abs(center[2] - referenceDepth) < 0.01 },
            ];
            const beforeGeneration = target.info.generation;
            target.resize(160, 120);
            current.nodes[0].setPosition(0, 0, 1);
            await stepTimed();
            const resizedCenter = normalizedColor(visualization.readColor({ x: 64, y: 48, width: 1, height: 1 }));
            glErrors.push(...takeGLErrors());
            checks.push({ name: 'depth-gl-error-free', ok: glErrors.length === 0 });
            checks.push({
                name: 'depth-resize-rebind-new-geometry',
                ok: target.info.generation > beforeGeneration && Math.abs(resizedCenter[0] * 10 - 2) < 0.06,
            });
            depthRows.push({
                samples,
                status: checks.every((check) => check.ok) ? 'PASS' : 'FAIL',
                center,
                resizedCenter,
                glErrors,
                reconstructedViewDistance: center[0] * 10,
                expectedViewDistance: 3,
                referenceDepth,
                checks,
                timing,
            });
        } catch (error) {
            depthRows.push({ samples, status: 'FAIL', error: errorRecord(error) });
        } finally {
            current.nodes[0].setPosition(0, 0, 0);
            unbind?.();
            detach?.();
            visualization?.dispose();
            current.nodes[1].getComponent(cc.MeshRenderer).setSharedMaterial(current.displayMaterial, 0);
        }
    }
    return { status: depthRows.every((row) => row.status === 'PASS') ? 'PASS' : 'FAIL', rows: depthRows };
}
async function run() {
    if (typeof cc.createAirRenderTarget !== 'function') {
        const report = {
            status: 'NOT_IMPLEMENTED',
            capabilities: capabilities(),
            reason: 'AirRenderTarget public API is absent from this bundle.',
            checks: [],
        };
        status.textContent = JSON.stringify(report, null, 2);
        return report;
    }
    const caps = capabilities();
    const rows = [];
    for (const format of ['rgba8', 'rgba16f'])
        for (const samples of [1, 4]) {
            const requested = {
                width: 128,
                height: 96,
                colorFormat: format,
                depthFormat: 'depth24-stencil8',
                samples,
                sampleFallback: 'error',
                filter: 'nearest',
            };
            let target;
            try {
                target = await choose(requested);
                const timing = await stepTimed();
                const actual = actualTarget(target);
                const sampled = actualSampleTexture(target);
                const pixel = target.readColor({
                    x: Math.floor(target.info.width / 2),
                    y: Math.floor(target.info.height / 2),
                    width: 1,
                    height: 1,
                });
                const center = normalizedColor(pixel);
                const glErrors = takeGLErrors();
                const checks = [
                    { name: 'gl-error-free', ok: glErrors.length === 0 },
                    { name: 'framebuffer-complete', ok: actual.framebufferStatus === gl.FRAMEBUFFER_COMPLETE },
                    {
                        name: 'actual-color-storage',
                        ok:
                            format === 'rgba16f'
                                ? actual.componentType === gl.FLOAT && actual.redBits === 16
                                : actual.redBits === 8,
                    },
                    { name: 'actual-samples', ok: actual.samples === samples },
                    {
                        name: 'resolved-sampled-attachment',
                        ok:
                            sampled.objectType === gl.TEXTURE &&
                            sampled.samples === 1 &&
                            sampled.framebufferStatus === gl.FRAMEBUFFER_COMPLETE &&
                            sampled.redBits === actual.redBits &&
                            sampled.componentType === actual.componentType,
                    },
                    {
                        name: 'color-readback',
                        ok: format === 'rgba16f' ? pixel instanceof Float32Array && center[0] > 1.5 : center[0] > 0.9,
                    },
                ];
                rows.push({
                    requested,
                    status: checks.every((check) => check.ok) ? 'PASS' : 'FAIL',
                    info: { ...target.info },
                    actual,
                    sampled,
                    center,
                    glErrors,
                    pixelType: pixel.constructor.name,
                    checks,
                    timing,
                });
            } catch (error) {
                const unsupported =
                    format === 'rgba16f' &&
                    (!caps.floatColorAttachment || (samples > 1 && !caps.formats.RGBA16F.samples.includes(samples)));
                rows.push({
                    requested,
                    status:
                        unsupported &&
                        ['AIR_E_RENDER_TARGET_FORMAT', 'AIR_E_RENDER_TARGET_SAMPLES'].includes(error?.code)
                            ? 'UNSUPPORTED'
                            : 'FAIL',
                    error: errorRecord(error),
                });
                if (unsupported && samples === 4) {
                    try {
                        const lower = await choose({ ...requested, sampleFallback: 'lower' });
                        const actual = actualTarget(lower);
                        const valid =
                            lower.info.samples <= samples &&
                            lower.info.supportedSamples.includes(lower.info.samples) &&
                            actual.samples === lower.info.samples &&
                            lower.info.requested.samples === samples;
                        rows[rows.length - 1].lowerFallback = {
                            status: valid ? 'PASS' : 'FAIL',
                            info: { ...lower.info },
                            actual,
                        };
                        if (!valid) rows[rows.length - 1].status = 'FAIL';
                    } catch (fallbackError) {
                        const validUnsupported =
                            !caps.floatColorAttachment && fallbackError?.code === 'AIR_E_RENDER_TARGET_FORMAT';
                        rows[rows.length - 1].lowerFallback = {
                            status: validUnsupported ? 'UNSUPPORTED' : 'FAIL',
                            error: errorRecord(fallbackError),
                        };
                        if (!validUnsupported) rows[rows.length - 1].status = 'FAIL';
                    }
                }
            }
        }
    await choose({
        width: 128,
        height: 96,
        colorFormat: 'rgba8',
        depthFormat: 'depth24-stencil8',
        samples: 4,
        sampleFallback: 'lower',
        scale: 0.5,
    });
    const resizing = await resizeAndRebind();
    rows.push({
        name: 'scale-resize-rebind',
        status:
            resizing.after.width === 80 &&
            resizing.after.height === 60 &&
            resizing.after.generation > resizing.before.generation &&
            Math.abs(resizing.center[0] - 0.2) < 0.01 &&
            Math.abs(resizing.center[1] - 0.8) < 0.01 &&
            resizing.glErrors.length === 0
                ? 'PASS'
                : 'FAIL',
        ...resizing,
    });
    const depth = await depthProof();
    rows.push(await disposalProof());
    await choose({ width: 128, height: 96, colorFormat: 'rgba8', samples: 4, sampleFallback: 'lower', scale: 0.5 });
    const report = {
        status:
            rows.every((row) => ['PASS', 'UNSUPPORTED'].includes(row.status)) && depth.status === 'PASS'
                ? 'PASS'
                : 'FAIL',
        capabilities: caps,
        coverage: {
            requestedColorCombinations: 4,
            executedColorCombinations: rows.filter((row) => row.requested && row.status === 'PASS').length,
            unsupportedColorCombinations: rows
                .filter((row) => row.status === 'UNSUPPORTED')
                .map((row) => row.requested),
        },
        rows,
        depth,
    };
    status.textContent = JSON.stringify(report, null, 2);
    return report;
}
window.__renderingContracts = {
    ready: true,
    capabilities,
    baseline,
    run,
    results,
    attachment,
    resizeAndRebind,
    contrast,
    stepTimed,
};
document.querySelector('[data-action="baseline"]').onclick = () =>
    baseline().catch((error) => {
        status.textContent = JSON.stringify(errorRecord(error));
    });
document.querySelector('[data-action="run"]').onclick = () =>
    run().catch((error) => {
        status.textContent = JSON.stringify(errorRecord(error));
    });
status.textContent = JSON.stringify({ ready: true, capabilities: capabilities() }, null, 2);
document.querySelector('[data-action="resize"]').onclick = () =>
    resizeAndRebind().then((report) => {
        results.push({ action: 'resize', report });
        status.textContent = JSON.stringify(report, null, 2);
    });
document.querySelector('[data-action="contrast"]').onclick = () =>
    contrast().then((report) => {
        results.push({ action: 'contrast', report });
        status.textContent = JSON.stringify(report, null, 2);
    });
