import * as cc from 'cocosair';
import { createAirDepthSamplerTemplate, prepareEffectForRegistration } from '../../../tools/debug/effect-layout.js';
import { validateExperiment, decodeFloat, depthAt } from '../upstream-depth-experiments/model.mjs';
import { makeDepthEffect } from './effect.mjs';

let used = false;
async function run(options = {}) {
    const selected = validateExperiment({ pipeline: 'native-target', ...options });
    if (selected.pipeline !== 'native-target') throw new Error('UNSUPPORTED_PIPELINE');
    if (used) throw new Error('FRESH_PAGE_REQUIRED: engine close does not authorize same-page recreation');
    used = true;
    const sources = [];
    const original = WebGL2RenderingContext.prototype.shaderSource;
    WebGL2RenderingContext.prototype.shaderSource = function (shader, source) {
        sources.push({ stage: this.getShaderParameter(shader, this.SHADER_TYPE), source });
        return original.call(this, shader, source);
    };
    let app, clock, sourceTarget, outputTarget, effect, material, mesh, sourceMesh, sourceMaterial, unbind, gl, dither;
    try {
        app = await cc.createAirApp({ canvas: '#GameCanvas', pixelRatioCap: 1 });
        gl = cc.director.root.device.gl;
        dither = gl.isEnabled(gl.DITHER);
        gl.disable(gl.DITHER);
        const scene = new cc.Scene('U08 native depth sampling, not OIT');
        const camera = (name) => {
            const node = new cc.Node(name);
            scene.addChild(node);
            const camera = node.addComponent(cc.Camera);
            camera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
            camera.clearColor = new cc.Color(0, 0, 0, 255);
            return camera;
        };
        const captureCamera = camera('capture'),
            sampleCamera = camera('sample');
        sampleCamera.near = 0.1;
        sampleCamera.far = 100;
        sampleCamera.enabled = false;
        sourceTarget = cc.createAirRenderTarget({
            width: 16,
            height: 16,
            colorFormat: 'rgba8',
            depthFormat: 'depth24-stencil8',
            samples: 1,
        });
        outputTarget = cc.createAirRenderTarget({
            width: 16,
            height: 16,
            colorFormat: 'rgba8',
            depthFormat: 'none',
            samples: 1,
        });
        sourceTarget.attachCamera(captureCamera);
        outputTarget.attachCamera(sampleCamera);
        effect = Object.assign(
            new cc.EffectAsset(),
            prepareEffectForRegistration(
                makeDepthEffect(
                    createAirDepthSamplerTemplate({ name: 'sceneDepth', binding: 1, mode: 'manual-compare' }),
                ),
            ).effect,
        );
        effect.onLoaded();
        material = new cc.Material();
        material.initialize({ effectAsset: effect });
        unbind = sourceTarget.bindDepth(material, 'sceneDepth');
        const samplerNode = new cc.Node('depth sample quad');
        scene.addChild(samplerNode);
        samplerNode.setPosition(0, 0, -2);
        samplerNode.active = false;
        mesh = cc.utils.createMesh({
            positions: [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0],
            indices: [0, 1, 2, 0, 2, 3],
        });
        const samplerRenderer = samplerNode.addComponent(cc.MeshRenderer);
        samplerRenderer.mesh = mesh;
        samplerRenderer.setSharedMaterial(material, 0);
        const sourceNode = new cc.Node('native opaque depth plane');
        scene.addChild(sourceNode);
        sourceMesh = cc.utils.createMesh({
            positions: [-2, -2, 0, 2, -2, 0, 2, 2, 0, -2, 2, 0],
            indices: [0, 1, 2, 0, 2, 3],
        });
        sourceMaterial = new cc.Material();
        sourceMaterial.initialize({ effectName: 'builtin-unlit' });
        const renderer = sourceNode.addComponent(cc.MeshRenderer);
        renderer.mesh = sourceMesh;
        renderer.setSharedMaterial(sourceMaterial, 0);
        app.run(scene);
        clock = cc.createStepClock({ stepTimeoutMs: 10000 });
        clock.begin();
        // No animation, physics, business callbacks, random generator or user input in this fixture.
        const sample = async (referenceDepth, bias, outputMode, near, far) => {
            material.setProperty('compareParams', new cc.Vec4(referenceDepth, bias, outputMode, 0));
            material.setProperty('rangeParams', new cc.Vec4(near, far, 0, 0));
            await clock.step(0);
            return Array.from(outputTarget.readColor({ x: 8, y: 8, width: 1, height: 1 }));
        };
        const rows = [];
        for (const [near, far] of [
            [0.1, 100],
            [1, 1000],
            [10, 10000],
        ])
            for (const distance of [near * 2, Math.sqrt(near * far), far * 0.5]) {
                captureCamera.near = near;
                captureCamera.far = far;
                captureCamera.enabled = sourceNode.active = true;
                sampleCamera.enabled = samplerNode.active = false;
                sourceNode.setPosition(0, 0, -distance);
                sourceNode.setScale(distance, distance, 1);
                await clock.step(0);
                captureCamera.enabled = sourceNode.active = false;
                sampleCamera.enabled = samplerNode.active = true;
                const depthBytes = await sample(0, 0, 0, near, far),
                    depth = decodeFloat(depthBytes);
                const reconstructedBytes = await sample(0, 0, 2, near, far);
                const analyticDepth = depthAt(distance, near, far);
                const comparisons = [];
                for (const [label, offset, bias] of [
                    ['below', -(2 ** -18), 0],
                    ['above', 2 ** -18, 0],
                    ['bias', 2 ** -18, 2 ** -17],
                ]) {
                    const referenceDepth = Math.fround(analyticDepth + offset);
                    comparisons.push({
                        label,
                        referenceDepth,
                        bias,
                        pixels: await sample(referenceDepth, bias, 1, near, far),
                    });
                }
                rows.push({
                    near,
                    far,
                    distance,
                    analyticDepth,
                    depthBytes,
                    depth,
                    reconstructedBytes,
                    reconstructed: decodeFloat(reconstructedBytes),
                    comparisons,
                    projection: cc.Mat4.toArray([], captureCamera.camera.matProj),
                    clearDepth: captureCamera.clearDepth,
                    depthFunction: sourceMaterial.passes[0].depthStencilState.depthFunc,
                });
            }
        const previousDraw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
            previousRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
        let allocated;
        try {
            gl.bindFramebuffer(
                gl.FRAMEBUFFER,
                sourceTarget.renderTexture.window.framebuffer.getGpuFramebuffer().glFramebuffer,
            );
            allocated = {
                framebufferComplete: gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE,
                depthBits: gl.getFramebufferAttachmentParameter(
                    gl.FRAMEBUFFER,
                    gl.DEPTH_ATTACHMENT,
                    gl.FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE,
                ),
                stencilBits: gl.getFramebufferAttachmentParameter(
                    gl.FRAMEBUFFER,
                    gl.STENCIL_ATTACHMENT,
                    gl.FRAMEBUFFER_ATTACHMENT_STENCIL_SIZE,
                ),
                componentType: gl.getFramebufferAttachmentParameter(
                    gl.FRAMEBUFFER,
                    gl.DEPTH_ATTACHMENT,
                    gl.FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE,
                ),
                engineInternalFormat: sourceTarget.depthTexture.getGFXTexture().gpuTexture.glInternalFmt,
            };
        } finally {
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, previousDraw);
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previousRead);
        }
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        const result = {
            schema: 'air-upstream-native-depth/1',
            status: 'OBSERVED_NOT_VALIDATED',
            algorithm: 'sorted-alpha-blending-not-OIT',
            requested: selected,
            targetInfo: sourceTarget.info,
            allocated,
            metadata: {
                backend: 'webgl2',
                renderer: gl.getParameter(gl.RENDERER),
                vendor: gl.getParameter(gl.VENDOR),
                unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
                context: gl.getContextAttributes(),
                version: gl.getParameter(gl.VERSION),
                unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
                driver: 'not separately exposed',
                userAgent: navigator.userAgent,
            },
            rows,
            submittedSources: sources,
            glError: gl.getError(),
            compositorEvidence: false,
            performanceClaim: false,
        };
        if (
            !allocated.framebufferComplete ||
            allocated.depthBits !== 24 ||
            allocated.stencilBits !== 8 ||
            allocated.componentType !== gl.UNSIGNED_NORMALIZED ||
            allocated.engineInternalFormat !== gl.DEPTH24_STENCIL8
        )
            throw new Error('ALLOCATED_FORMAT_MISMATCH');
        return result;
    } finally {
        try {
            unbind?.();
            sourceTarget?.dispose();
            outputTarget?.dispose();
            clock?.end();
            material?.destroy();
            sourceMaterial?.destroy();
            mesh?.destroy();
            sourceMesh?.destroy();
            if (effect) {
                cc.EffectAsset.remove(effect);
                effect.destroy();
            }
            if (gl && dither) gl.enable(gl.DITHER);
            if (app) await app.close();
        } finally {
            WebGL2RenderingContext.prototype.shaderSource = original;
        }
    }
}
window.__upstreamNativeDepth = { ready: true, run };
document.querySelector('#status').textContent =
    'Ready. Native AirRenderTarget depth attachment → bindDepth → highp sampler. Sorted transparency is not OIT. Fresh current build required; this fixture is not yet GPU-validated.';

// User-triggered only. No automatic execution or acceptance promotion.
let rawReport;
document.querySelector('#run').addEventListener('click', async () => {
    const button = document.querySelector('#run');
    button.disabled = true;
    try {
        rawReport = await window.__upstreamNativeDepth.run({});
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
    }
    // A native-engine retry requires a fresh page, even after failure.
});
document.querySelector('#save').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(rawReport, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'upstream-experiments-transparency-raw.json';
    link.click();
    URL.revokeObjectURL(url);
});
