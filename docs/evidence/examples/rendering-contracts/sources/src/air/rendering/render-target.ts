import { RenderTexture } from '../../cocos/asset/assets/render-texture';
import { TextureBase } from '../../cocos/asset/assets/texture-base';
import { PixelFormat, TextureFilter, WrapMode } from '../../cocos/asset/assets/asset-enum';
import { Material, MaterialPropertyFull } from '../../cocos/asset/assets/material';
import { Camera } from '../../cocos/misc/camera-component';
import { director } from '../../cocos/game/director';
import { API, ColorAttachment, DepthStencilAttachment, Format, FormatFeatureBit, RenderPassInfo, Filter, Rect, SampleCount, Texture, Type } from '../../cocos/gfx';
import { PipelineEventType } from '../../cocos/rendering/pipeline-event';
import { WebGL2Device } from '../../cocos/gfx/webgl2/webgl2-device';
import { WebGL2Framebuffer } from '../../cocos/gfx/webgl2/webgl2-framebuffer';
import { WebGL2CmdFuncBlitFramebuffer } from '../../cocos/gfx/webgl2/webgl2-commands';
import { getTypeFromHandle, getCountFromHandle } from '../../cocos/render-scene/core/pass-utils';

export type AirTargetColorFormat = 'rgba8' | 'rgba16f' | 'rgba32f' | 'srgb8-alpha8';
export interface AirRenderTargetOptions {
    name?: string;
    /** Reference backing-pixel dimensions, before scale; not CSS dimensions. */
    width: number;
    height: number;
    scale?: number;
    colorFormat?: AirTargetColorFormat;
    depthFormat?: 'none' | 'depth24-stencil8';
    samples?: 1 | 2 | 4 | 8;
    filter?: 'nearest' | 'linear';
    sampleFallback?: 'error' | 'lower';
}
export interface AirRenderTargetInfo {
    readonly requested: Readonly<AirRenderTargetOptions>;
    readonly effective: Readonly<{ colorFormat: AirTargetColorFormat; depthFormat: 'none' | 'depth24-stencil8'; samples: number; filter: 'nearest' | 'linear'; scale: number }>;
    readonly width: number;
    readonly height: number;
    readonly samples: number;
    readonly generation: number;
    readonly framebufferComplete: boolean;
    readonly resolveRequired: boolean;
    readonly disposed: boolean;
    readonly supportedSamples: readonly number[];
    readonly glSamples: number;
}
const formats: Record<AirTargetColorFormat, Format> = {
    rgba8: Format.RGBA8, rgba16f: Format.RGBA16F, rgba32f: Format.RGBA32F, 'srgb8-alpha8': Format.SRGB8_A8,
};
function failure(code: string, message: string): never {
    const error = new Error(`[${code}] ${message}`);
    Object.assign(error, { code });
    throw error;
}
function positive(value: number, name: string): number {
    if (!Number.isFinite(value) || value <= 0) failure('AIR_E_RENDER_TARGET_SIZE', `${name} must be finite and positive`);
    return value;
}
/** Native TextureBase view; it borrows its GFX texture from the target, never owns it. */
class AttachmentView extends TextureBase {
    constructor(private readonly read: () => Texture, format: Format, filter: 'nearest' | 'linear') {
        super();
        this._format = format as unknown as PixelFormat;
        this.setWrapMode(WrapMode.CLAMP_TO_EDGE, WrapMode.CLAMP_TO_EDGE);
        this.setFilters(filter === 'linear' ? TextureFilter.LINEAR : TextureFilter.NEAREST,
            filter === 'linear' ? TextureFilter.LINEAR : TextureFilter.NEAREST);
        this.setMipFilter(TextureFilter.NONE);
    }
    public getGFXTexture(): Texture { return this.read(); }
    public updateSize(width: number, height: number): void { this._width = width; this._height = height; }
}

/** Owns native RenderTextures. WebGL2 legacy camera paths resolve before the next camera samples. */
export class AirRenderTarget {
    private rendering: RenderTexture;
    public get renderTexture(): RenderTexture { return this.rendering; }
    public readonly texture: TextureBase;
    public readonly depthTexture: TextureBase | null;
    private readonly device: WebGL2Device;
    private requested: Readonly<AirRenderTargetOptions>;
    private readonly effective: AirRenderTargetInfo['effective'];
    private readonly supportedSamples: number[];
    private output: RenderTexture;
    private readonly bindings = new Set<() => void>();
    private readonly rebind = new Set<() => void>();
    private readonly cameras = new Map<Camera, { previous: RenderTexture | null; detach: () => void }>();
    private width = 0;
    private height = 0;
    private generation = 0;
    private disposed = false;
    private glSamples = 0;

    constructor(options: AirRenderTargetOptions) {
        const device = director.root?.device;
        if (!device || device.gfxAPI !== API.WEBGL2) failure('AIR_E_RENDER_TARGET_DEVICE', 'await createAirApp(); this target requires WebGL2');
        this.device = device as WebGL2Device;
        if (!options || typeof options !== 'object') failure('AIR_E_RENDER_TARGET_OPTIONS', 'provide target options');
        for (const key of Object.keys(options)) if (!['name', 'width', 'height', 'scale', 'colorFormat', 'depthFormat', 'samples', 'filter', 'sampleFallback'].includes(key))
            failure('AIR_E_RENDER_TARGET_OPTION', `unknown option ${key}; use the explicit colorFormat/depthFormat contract`);
        for (const key of ['colorFormat', 'depthFormat', 'samples', 'filter', 'scale', 'sampleFallback'] as const) {
            if (Object.prototype.hasOwnProperty.call(options, key) && options[key] === undefined)
                failure('AIR_E_RENDER_TARGET_OPTION', `${key} was explicitly undefined; check the enum/name or omit it to use the default`);
        }
        const colorFormat = options.colorFormat ?? 'rgba8';
        const depthFormat = options.depthFormat ?? 'depth24-stencil8';
        const filter = options.filter ?? 'nearest';
        const fallback = options.sampleFallback ?? 'error';
        const scale = positive(options.scale ?? 1, 'scale');
        const samples = options.samples ?? 1;
        if (!Object.prototype.hasOwnProperty.call(formats, colorFormat)) failure('AIR_E_RENDER_TARGET_FORMAT', `unknown colorFormat ${String(colorFormat)}`);
        if (!['none', 'depth24-stencil8'].includes(depthFormat) || !['nearest', 'linear'].includes(filter)
            || !['error', 'lower'].includes(fallback) || ![1, 2, 4, 8].includes(samples))
            failure('AIR_E_RENDER_TARGET_OPTION', 'unsupported depthFormat/filter/sampleFallback/samples');
        const features = device.getFormatFeatures(formats[colorFormat]);
        if (!(features & FormatFeatureBit.RENDER_TARGET) || !(features & FormatFeatureBit.SAMPLED_TEXTURE))
            failure('AIR_E_RENDER_TARGET_FORMAT', `${colorFormat} is not a renderable sampled format on this device`);
        if (filter === 'linear' && !(features & FormatFeatureBit.LINEAR_FILTER))
            failure('AIR_E_RENDER_TARGET_FILTER', `${colorFormat} does not support linear filtering`);
        const gl = this.device.gl;
        const internal = { rgba8: gl.RGBA8, rgba16f: gl.RGBA16F, rgba32f: gl.RGBA32F, 'srgb8-alpha8': gl.SRGB8_ALPHA8 }[colorFormat];
        const colorSamples = [1, ...Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, internal, gl.SAMPLES) as Int32Array)];
        const depthSamples = depthFormat === 'none' ? colorSamples
            : [1, ...Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, gl.SAMPLES) as Int32Array)];
        this.supportedSamples = [...new Set(colorSamples.filter((sample) => depthSamples.includes(sample)))].sort((a, b) => a - b);
        const actualSamples = this.supportedSamples.includes(samples) ? samples
            : fallback === 'lower' ? Math.max(...this.supportedSamples.filter((sample) => sample <= samples)) : 0;
        if (!actualSamples) failure('AIR_E_RENDER_TARGET_SAMPLES', `${colorFormat}/${depthFormat} cannot use ${samples} samples; supported=${this.supportedSamples.join(',')}`);
        this.requested = Object.freeze({ ...options });
        this.effective = Object.freeze({ colorFormat, depthFormat, filter, samples: actualSamples, scale });
        this.rendering = new RenderTexture(options.name);
        this.output = this.rendering;
        this.texture = new AttachmentView(() => this.colorGFX(), formats[colorFormat], filter);
        this.depthTexture = depthFormat === 'none' ? null : new AttachmentView(() => this.depthGFX(), Format.DEPTH_STENCIL, 'nearest');
        try { this.resize(options.width, options.height); }
        catch (error) { this.dispose(); throw error; }
    }
    private alive(): void { if (this.disposed) failure('AIR_E_RENDER_TARGET_DISPOSED', 'target has been disposed'); }
    private colorGFX(): Texture { this.alive(); return this.output.getGFXTexture()!; }
    private depthGFX(): Texture {
        this.alive();
        const texture = this.output.window?.framebuffer.depthStencilTexture;
        if (!texture) failure('AIR_E_RENDER_TARGET_DEPTH', 'target has no readable depth attachment');
        return texture;
    }
    public get info(): Readonly<AirRenderTargetInfo> {
        return Object.freeze({ requested: this.requested, effective: this.effective, width: this.width, height: this.height,
            samples: this.effective.samples, generation: this.generation, framebufferComplete: !this.disposed,
            resolveRequired: this.effective.samples > 1, disposed: this.disposed,
            supportedSamples: Object.freeze([...this.supportedSamples]), glSamples: this.glSamples });
    }
    private pass(samples: number): RenderPassInfo {
        const color = new ColorAttachment(formats[this.effective.colorFormat], samples as SampleCount);
        const depth = new DepthStencilAttachment(this.effective.depthFormat === 'none' ? Format.UNKNOWN : Format.DEPTH_STENCIL, samples as SampleCount);
        return new RenderPassInfo([color], depth);
    }
    private checkFramebuffer(target: RenderTexture): number {
        const gl = this.device.gl;
        const beforeDraw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const beforeRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        try {
            const framebuffer = target.window!.framebuffer as WebGL2Framebuffer;
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer.getGpuFramebuffer().glFramebuffer);
            if (gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
                failure('AIR_E_RENDER_TARGET_INCOMPLETE', `${this.effective.colorFormat} framebuffer is incomplete`);
            return gl.getParameter(gl.SAMPLES) as number;
        } finally {
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, beforeDraw);
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, beforeRead);
        }
    }
    public resize(baseWidth: number, baseHeight: number): void {
        this.alive();
        const width = Math.max(1, Math.floor(positive(baseWidth, 'width') * this.effective.scale));
        const height = Math.max(1, Math.floor(positive(baseHeight, 'height') * this.effective.scale));
        if (width > this.device.capabilities.maxTextureSize || height > this.device.capabilities.maxTextureSize)
            failure('AIR_E_RENDER_TARGET_SIZE', 'scaled dimensions exceed MAX_TEXTURE_SIZE');
        if (width === this.width && height === this.height) return;
        const rendering = new RenderTexture(this.requested.name);
        const output = this.effective.samples > 1 ? new RenderTexture(`${this.requested.name || 'AirTarget'} resolved`) : rendering;
        let glSamples: number;
        try {
            rendering.initialize({ name: this.requested.name, width, height, passInfo: this.pass(this.effective.samples) });
            if (output !== rendering) output.initialize({ width, height, passInfo: this.pass(1) });
            glSamples = this.checkFramebuffer(rendering);
            this.checkFramebuffer(output);
            if (Math.max(1, glSamples) !== this.effective.samples)
                failure('AIR_E_RENDER_TARGET_SAMPLES', `driver allocated ${glSamples} samples instead of ${this.effective.samples}`);
        } catch (error) {
            if (output !== rendering) output.destroy();
            rendering.destroy();
            throw error;
        }
        const oldRendering = this.rendering, oldOutput = this.output;
        this.rendering = rendering; this.output = output; this.glSamples = glSamples;
        this.requested = Object.freeze({ ...this.requested, width: baseWidth, height: baseHeight });
        this.width = width; this.height = height; ++this.generation;
        (this.texture as AttachmentView).updateSize(width, height);
        (this.depthTexture as AttachmentView | null)?.updateSize(width, height);
        for (const camera of this.cameras.keys()) { camera.targetTexture = null; camera.targetTexture = this.renderTexture; }
        for (const bind of this.rebind) bind();
        if (oldOutput !== oldRendering) oldOutput.destroy();
        oldRendering.destroy();
    }
    public attachCamera(camera: Camera, beforeRender?: () => void): () => void {
        this.alive();
        if (this.cameras.has(camera)) failure('AIR_E_RENDER_TARGET_CAMERA', 'camera is already attached to this target');
        const previous = camera.targetTexture;
        const events = director.root!.pipelineEvent;
        const begin = (native: unknown): void => { if (native === camera.camera) beforeRender?.(); };
        const end = (native: unknown): void => { if (native === camera.camera) this.resolve(); };
        camera.targetTexture = this.renderTexture;
        events.on(PipelineEventType.RENDER_CAMERA_BEGIN, begin);
        events.on(PipelineEventType.RENDER_CAMERA_END, end);
        const detach = (): void => {
            if (!this.cameras.delete(camera)) return;
            events.off(PipelineEventType.RENDER_CAMERA_BEGIN, begin);
            events.off(PipelineEventType.RENDER_CAMERA_END, end);
            if (camera.isValid && camera.targetTexture === this.renderTexture) camera.targetTexture = previous;
        };
        this.cameras.set(camera, { previous, detach });
        return detach;
    }
    public resolve(): void {
        this.alive();
        if (this.output === this.renderTexture) return;
        const gl = this.device.gl;
        const oldRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const oldDraw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        // Native FRAMEBUFFER binds affect both targets; legacy draws can leave
        // the separate READ cache stale. Seed it from actual GL state before blit.
        const cache = this.device.getStateCache();
        cache.glFramebuffer = oldDraw; cache.glReadFramebuffer = oldRead;
        try {
            WebGL2CmdFuncBlitFramebuffer(this.device,
                (this.renderTexture.window!.framebuffer as WebGL2Framebuffer).getGpuFramebuffer(),
                (this.output.window!.framebuffer as WebGL2Framebuffer).getGpuFramebuffer(),
                new Rect(0, 0, this.width, this.height), new Rect(0, 0, this.width, this.height), Filter.POINT);
            const error = gl.getError();
            if (error !== gl.NO_ERROR) failure('AIR_E_RENDER_TARGET_RESOLVE', `resolve failed with GL error ${error}`);
        } finally {
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, oldDraw);
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, oldRead);
            cache.glFramebuffer = oldDraw; cache.glReadFramebuffer = oldRead;
        }
    }
    private bind(material: Material, property: string, view: TextureBase, passIdx?: number): () => void {
        this.alive();
        const passes = passIdx === undefined ? material.passes : [material.passes[passIdx]];
        if (!passes.length || passes.some((pass) => !pass || !pass.getHandle(property)
            || getTypeFromHandle(pass.getHandle(property)) !== Type.SAMPLER2D || getCountFromHandle(pass.getHandle(property)) !== 1))
            failure('AIR_E_RENDER_TARGET_BINDING', `${material.name}.${property} must be an active sampler2D in the requested pass`);
        const previous = material.getProperty(property, passIdx) as MaterialPropertyFull;
        const rebind = (): void => { if (material.isValid && material.passes.length) material.setProperty(property, view, passIdx); };
        rebind(); this.rebind.add(rebind);
        const unbind = (): void => {
            if (!this.bindings.delete(unbind)) return;
            this.rebind.delete(rebind);
            if (material.isValid && material.passes.length && material.getProperty(property, passIdx) === view)
                material.setProperty(property, previous ?? null, passIdx);
        };
        this.bindings.add(unbind);
        return unbind;
    }
    public bindColor(material: Material, property: string, passIdx?: number): () => void { return this.bind(material, property, this.texture, passIdx); }
    public bindDepth(material: Material, property: string, passIdx?: number): () => void {
        if (!this.depthTexture) failure('AIR_E_RENDER_TARGET_DEPTH', 'request depth24-stencil8 before binding depth');
        return this.bind(material, property, this.depthTexture, passIdx);
    }
    public readColor(region: { x?: number; y?: number; width?: number; height?: number } = {}): Float32Array | Uint8Array {
        this.alive(); this.resolve();
        const x = region.x ?? 0, y = region.y ?? 0, width = region.width ?? this.width, height = region.height ?? this.height;
        if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width < 1 || height < 1 || x + width > this.width || y + height > this.height)
            failure('AIR_E_RENDER_TARGET_READ', 'read rectangle must be integral and inside the target');
        const floats = ['rgba16f', 'rgba32f'].includes(this.effective.colorFormat);
        const data = floats ? new Float32Array(width * height * 4) : new Uint8Array(width * height * 4);
        const gl = this.device.gl;
        const previous = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        try {
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, (this.output.window!.framebuffer as WebGL2Framebuffer).getGpuFramebuffer().glFramebuffer);
            gl.readBuffer(gl.COLOR_ATTACHMENT0);
            gl.readPixels(x, y, width, height, gl.RGBA, floats ? gl.FLOAT : gl.UNSIGNED_BYTE, data);
            const error = gl.getError();
            if (error !== gl.NO_ERROR) failure('AIR_E_RENDER_TARGET_READ', `color readback failed with GL error ${error}`);
        } finally { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previous); }
        return data;
    }
    public dispose(): void {
        if (this.disposed) return;
        for (const unbind of [...this.bindings]) unbind();
        for (const record of [...this.cameras.values()]) record.detach();
        this.disposed = true;
        this.texture.destroy(); this.depthTexture?.destroy();
        if (this.output !== this.renderTexture) this.output.destroy();
        this.renderTexture.destroy();
    }
}
export function createAirRenderTarget(options: AirRenderTargetOptions): AirRenderTarget { return new AirRenderTarget(options); }
