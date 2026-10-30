/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
import { Camera } from '../../cocos/misc/camera-component';
import { director } from '../../cocos/game/director';
import { Material } from '../../cocos/asset/assets/material';
import { EffectAsset } from '../../cocos/asset/assets/effect-asset';
import { createMesh } from '../../cocos/3d/misc';
import { Mesh } from '../../cocos/3d/assets/mesh';
import { Vec4 } from '../../cocos/core/math';
import {
    API,
    Color,
    Rect,
    ColorAttachment,
    DepthStencilAttachment,
    LoadOp,
    Format,
    InputAssembler,
    InputState,
    PipelineState,
    PipelineStateInfo,
    RenderPass,
    RenderPassInfo,
} from '../../cocos/gfx';
import { ForwardPipeline } from '../../cocos/rendering/forward/forward-pipeline';
import { PipelineEventType } from '../../cocos/rendering/pipeline-event';
import { SetIndex } from '../../cocos/rendering/define';
import { NodeEventType } from '../../cocos/scene-graph/node-event';
import { AirRenderTarget, createAirRenderTarget } from './render-target';
import { createAirScreenEffect } from './screen-effect';
import { registerAirHDRCamera } from './hdr-context';
import {
    AirPostProcessOptions,
    AirPostProcessSettings,
    AirPostProcessState,
    normalizePostSettings,
    postProcessError,
} from './post-process-settings';
import { POST_PREFILTER, POST_DOWN, POST_UP, POST_OUTPUT } from './post-process-shaders';
export type {
    AirPostProcessOptions,
    AirPostProcessSettings,
    AirPostProcessState,
    AirToneMapping,
} from './post-process-settings';

type Kind = 'prefilter' | 'down' | 'up' | 'output';
interface Stage {
    kind: Kind;
    input: AirRenderTarget;
    base?: AirRenderTarget;
    target?: AirRenderTarget;
    material: Material;
    pso: PipelineState | null;
    unbind: (() => void)[];
}
// Four immutable, shared effect/layout/shader caches, like the engine's builtin resources.
// Targets, materials, IA and PSOs are owned by each handle and are released on dispose.
const effects = new Map<Kind, EffectAsset>();
const owners = new WeakMap<Camera, AirPostProcess>();
let serial = 0;
function effectFor(kind: Kind): EffectAsset {
    let effect = effects.get(kind);
    if (effect?.isValid && EffectAsset.get(effect.name) === effect) return effect;
    const bodies = { prefilter: POST_PREFILTER, down: POST_DOWN, up: POST_UP, output: POST_OUTPUT };
    effect = createAirScreenEffect({
        name: `air-post-hdr-${kind}-v1`,
        body: bodies[kind],
        constants: kind === 'output' ? ['params', 'viewport'] : ['params'],
        samplers:
            kind === 'output'
                ? ['sourceTexture', 'bloomTexture']
                : kind === 'up'
                  ? ['sourceTexture', 'baseTexture']
                  : ['sourceTexture'],
    });
    effects.set(kind, effect);
    return effect;
}

export interface AirPostProcessInfo {
    readonly enabled: boolean;
    readonly disposed: boolean;
    readonly width: number;
    readonly height: number;
    readonly levels: number;
    readonly samples: number;
    readonly intermediateFormat: 'rgba16f';
    readonly ownedTargets: number;
    readonly ownedMaterials: number;
    readonly settings: Readonly<AirPostProcessState>;
}
export interface AirPostProcess {
    /** Owned linear HDR capture. Readback is diagnostic; do not dispose it separately. */
    readonly source: AirRenderTarget;
    readonly enabled: boolean;
    readonly info: Readonly<AirPostProcessInfo>;
    setOptions(options: AirPostProcessSettings): void;
    setEnabled(enabled: boolean): void;
    dispose(): void;
}

/** Linear RGBA16F capture → multiscale Bloom → exposure → tone mapping → one display encoding.
 * Call after createAirApp; the camera may be in a scene which has not run yet. Custom shaders
 * must output linear radiance. Native standard/unlit output conversion is scoped to this camera.
 * WebGL2 default forward only; unsupported HDR attachments fail explicitly, without an LDR fallback.
 */
export function createAirPostProcess(camera: Camera, options: AirPostProcessOptions = {}): AirPostProcess {
    if (!options || typeof options !== 'object' || Array.isArray(options))
        postProcessError('options must be an object');
    const { levels = 5, resolutionScale = 1, samples = 1, ...runtime } = options;
    let settings = normalizePostSettings(runtime);
    if (!Number.isInteger(levels) || levels < 1 || levels > 8) postProcessError('levels must be an integer in [1,8]');
    if (!Number.isFinite(resolutionScale) || resolutionScale <= 0 || resolutionScale > 1)
        postProcessError('resolutionScale must be in (0,1]');
    if (![1, 2, 4, 8].includes(samples)) postProcessError('samples must be 1,2,4 or 8');
    if (!(camera instanceof Camera) || !camera.isValid || !camera.node)
        postProcessError('camera must be a valid camera component');
    if (owners.has(camera)) postProcessError('this camera already owns a post-process handle');
    const root = director.root;
    if (!root || root.device.gfxAPI !== API.WEBGL2 || !(root.pipeline instanceof ForwardPipeline))
        postProcessError('requires initialized WebGL2 default forward pipeline');
    const device = root.device,
        pipeline = root.pipeline,
        events = root.pipelineEvent;
    const previousTarget = camera.targetTexture;
    const outputWindow = () => (previousTarget ? previousTarget.window! : root.mainWindow!);
    const name = `air-post-${++serial}`;
    let source: AirRenderTarget | null = null;
    let mesh: Mesh | null = null;
    let ia: InputAssembler | null = null;
    let stages: Stage[] = [];
    let targets: AirRenderTarget[] = [];
    let outputPass: RenderPass | null = null;
    let outputHash = -1;
    let chainWidth = 0,
        chainHeight = 0,
        actualLevels = 0;
    let enabled = false,
        disposed = false;
    let detach: (() => void) | null = null;
    let markedCamera: object | null = null;
    const assertAlive = () => {
        if (disposed) postProcessError('handle has been disposed');
    };
    const destroyStages = (list: Stage[], resources: AirRenderTarget[]) => {
        for (const stage of list) {
            for (const unbind of stage.unbind) unbind();
            stage.pso?.destroy();
            stage.material.destroy();
        }
        for (const target of resources) target.dispose();
    };
    const createStage = (
        kind: Kind,
        input: AirRenderTarget,
        target?: AirRenderTarget,
        base?: AirRenderTarget,
    ): Stage => {
        const material = new Material();
        const unbind: (() => void)[] = [];
        try {
            material.initialize({ effectAsset: effectFor(kind) });
            unbind.push(input.bindColor(material, 'sourceTexture'));
            if (base) unbind.push(base.bindColor(material, kind === 'output' ? 'bloomTexture' : 'baseTexture'));
            return { kind, input, target, base, material, unbind, pso: null };
        } catch (error) {
            unbind.forEach((fn) => fn());
            material.destroy();
            throw error;
        }
    };
    const rebuild = () => {
        const nextStages: Stage[] = [],
            nextTargets: AirRenderTarget[] = [],
            down: AirRenderTarget[] = [];
        let width = source!.info.width,
            height = source!.info.height;
        const makeTarget = (w: number, h: number) => {
            const target = createAirRenderTarget({
                name: `${name}-level-${nextTargets.length}`,
                width: w,
                height: h,
                colorFormat: 'rgba16f',
                depthFormat: 'none',
                filter: 'linear',
            });
            nextTargets.push(target);
            return target;
        };
        try {
            let input = source!;
            for (let i = 0; i < levels; ++i) {
                width = Math.max(1, Math.floor(width / 2));
                height = Math.max(1, Math.floor(height / 2));
                const target = makeTarget(width, height);
                down.push(target);
                nextStages.push(createStage(i === 0 ? 'prefilter' : 'down', input, target));
                input = target;
                if (width === 1 && height === 1) break;
            }
            for (let i = down.length - 2; i >= 0; --i) {
                const target = makeTarget(down[i].info.width, down[i].info.height);
                nextStages.push(createStage('up', input, target, down[i]));
                input = target;
            }
            nextStages.push(createStage('output', source!, undefined, input));
        } catch (error) {
            destroyStages(nextStages, nextTargets);
            throw error;
        }
        destroyStages(stages, targets);
        stages = nextStages;
        targets = nextTargets;
        chainWidth = source!.info.width;
        chainHeight = source!.info.height;
        actualLevels = down.length;
    };
    const sync = () => {
        const window = outputWindow();
        if (!window || !window.width || !window.height) postProcessError('output window is unavailable');
        source!.resize(window.width, window.height);
        if (source!.info.width !== chainWidth || source!.info.height !== chainHeight) rebuild();
    };
    const beforeRender = () => {
        if (!enabled) return;
        if (camera.targetTexture !== source!.renderTexture)
            postProcessError('camera target changed; dispose and recreate the handle');
        sync();
        // Capture resize can change the camera aspect after Root's early update.
        // Refresh matrices before culling/UBO upload, including the first portrait frame.
        camera.camera?.update(true);
        if (markedCamera && markedCamera !== camera.camera) registerAirHDRCamera(markedCamera, false);
        markedCamera = camera.camera;
        if (markedCamera) registerAirHDRCamera(markedCamera, true);
    };
    const makeOutputPass = () => {
        const original = outputWindow().framebuffer.renderPass;
        if (outputPass && outputHash === original.hash) return;
        const last = stages[stages.length - 1];
        last.pso?.destroy();
        last.pso = null;
        outputPass?.destroy();
        const colors = original.colorAttachments.map((color) => new ColorAttachment().copy(color));
        for (const color of colors) color.loadOp = LoadOp.LOAD;
        const depth = original.depthStencilAttachment
            ? new DepthStencilAttachment().copy(original.depthStencilAttachment)
            : undefined;
        if (depth) depth.depthLoadOp = depth.stencilLoadOp = LoadOp.LOAD;
        outputPass = device.createRenderPass(new RenderPassInfo(colors, depth));
        outputHash = original.hash;
    };
    const params = new Vec4(),
        viewport = new Vec4(),
        rect = new Rect(),
        clear = [new Color(0, 0, 0, 0)];
    const afterRender = (native: unknown) => {
        if (!enabled || native !== camera.camera) return;
        makeOutputPass();
        const commands = pipeline.commandBuffers[0];
        for (const stage of stages) {
            if (stage.kind !== 'output' && !settings.bloom.enabled) continue;
            if (stage.kind === 'output') {
                const hardwareSRGB = outputPass!.colorAttachments[0].format === Format.SRGB8_A8;
                params.set(
                    settings.exposure,
                    settings.bloom.enabled ? settings.bloom.intensity : 0,
                    settings.toneMapping === 'aces' ? 0 : settings.toneMapping === 'reinhard' ? 1 : 2,
                    hardwareSRGB ? 1 : 0,
                );
                const r = camera.rect;
                viewport.set(r.x, r.y, r.width, r.height);
                stage.material.setProperty('viewport', viewport);
            } else {
                params.set(
                    1 / stage.input.info.width,
                    1 / stage.input.info.height,
                    stage.kind === 'up' ? settings.bloom.scatter : settings.bloom.threshold,
                    settings.bloom.softKnee,
                );
            }
            stage.material.setProperty('params', params);
            const pass = stage.material.passes[0];
            pass.update();
            const framebuffer = stage.target
                ? stage.target.renderTexture.window!.framebuffer
                : outputWindow().framebuffer;
            const renderPass = stage.target ? framebuffer.renderPass : outputPass!;
            if (!stage.pso)
                stage.pso = device.createPipelineState(
                    new PipelineStateInfo(
                        pass.getShaderVariant()!,
                        pass.pipelineLayout,
                        renderPass,
                        new InputState(ia!.attributes),
                        pass.rasterizerState,
                        pass.depthStencilState,
                        pass.blendState,
                        pass.primitive,
                        pass.dynamicStates,
                    ),
                );
            if (stage.target) {
                rect.x = rect.y = 0;
                rect.width = stage.target.info.width;
                rect.height = stage.target.info.height;
            } else {
                const r = camera.rect,
                    window = outputWindow();
                rect.x = Math.floor(r.x * window.width);
                rect.y = Math.floor(r.y * window.height);
                rect.width = Math.max(1, Math.floor(r.width * window.width));
                rect.height = Math.max(1, Math.floor(r.height * window.height));
            }
            commands.beginRenderPass(renderPass, framebuffer, rect, clear, 1, 0);
            commands.bindPipelineState(stage.pso);
            commands.bindDescriptorSet(SetIndex.GLOBAL, pipeline.descriptorSet);
            commands.bindDescriptorSet(SetIndex.MATERIAL, pass.descriptorSet);
            commands.bindInputAssembler(ia!);
            commands.draw(ia!);
            commands.endRenderPass();
        }
    };
    const unbind = () => {
        detach?.();
        detach = null;
        if (markedCamera) registerAirHDRCamera(markedCamera, false);
        markedCamera = null;
    };
    const dispose = () => {
        if (disposed) return;
        enabled = false;
        unbind();
        events.off(PipelineEventType.RENDER_CAMERA_END, afterRender);
        camera.node.off(NodeEventType.NODE_DESTROYED, dispose);
        destroyStages(stages, targets);
        stages = [];
        targets = [];
        outputPass?.destroy();
        outputPass = null;
        ia?.destroy();
        mesh?.destroy();
        source?.dispose();
        owners.delete(camera);
        disposed = true;
    };
    try {
        const window = outputWindow();
        source = createAirRenderTarget({
            name,
            width: window.width,
            height: window.height,
            scale: resolutionScale,
            colorFormat: 'rgba16f',
            depthFormat: 'depth24-stencil8',
            filter: 'linear',
            samples,
            sampleFallback: 'lower',
        });
        mesh = createMesh({
            positions: [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0],
            uvs: [0, 0, 1, 0, 0, 1, 1, 1],
            indices: [0, 1, 2, 1, 3, 2],
        });
        mesh.initialize();
        ia = device.createInputAssembler(mesh.renderingSubMeshes[0].iaInfo);
        rebuild();
        enabled = true;
        detach = source.attachCamera(camera, beforeRender);
        events.on(PipelineEventType.RENDER_CAMERA_END, afterRender);
        camera.node.on(NodeEventType.NODE_DESTROYED, dispose);
    } catch (error) {
        dispose();
        throw error;
    }
    const handle: AirPostProcess = {
        source,
        get enabled() {
            return enabled;
        },
        get info() {
            return Object.freeze({
                enabled,
                disposed,
                width: source!.info.width,
                height: source!.info.height,
                levels: actualLevels,
                samples: source!.info.samples,
                intermediateFormat: 'rgba16f' as const,
                ownedTargets: disposed ? 0 : 1 + targets.length,
                ownedMaterials: stages.length,
                settings: Object.freeze({ ...settings, bloom: Object.freeze({ ...settings.bloom }) }),
            });
        },
        setOptions(next) {
            assertAlive();
            settings = normalizePostSettings(next, settings);
        },
        setEnabled(value) {
            assertAlive();
            if (typeof value !== 'boolean') postProcessError('enabled must be boolean');
            if (value === enabled) return;
            if (!value) {
                enabled = false;
                unbind();
            } else {
                if (camera.targetTexture !== previousTarget)
                    postProcessError('camera target changed; recreate the handle');
                if (!camera.isValid) postProcessError('camera is invalid');
                sync();
                detach = source!.attachCamera(camera, beforeRender);
                // Resolve must run before the output callback, including after re-enabling MSAA capture.
                events.off(PipelineEventType.RENDER_CAMERA_END, afterRender);
                events.on(PipelineEventType.RENDER_CAMERA_END, afterRender);
                enabled = true;
            }
        },
        dispose,
    };
    owners.set(camera, handle);
    return handle;
}
