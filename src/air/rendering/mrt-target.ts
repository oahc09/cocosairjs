/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 of the Software, and to permit persons to whom the Software is furnished to
 do so, subject to the following conditions:

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
import { director } from '../../cocos/game/director';
import {
    API,
    Color,
    ColorAttachment,
    DepthStencilAttachment,
    Filter,
    Format,
    FormatFeatureBit,
    FormatInfos,
    CommandBufferType,
    FramebufferInfo,
    LoadOp,
    Rect,
    RenderPassInfo,
    SampleCount,
    StoreOp,
    TextureBlit,
    TextureInfo,
    TextureType,
    TextureUsageBit,
} from '../../cocos/gfx/base/define';
import type { Device } from '../../cocos/gfx/base/device';
import type { CommandBuffer } from '../../cocos/gfx/base/command-buffer';
import type { Framebuffer } from '../../cocos/gfx/base/framebuffer';
import type { RenderPass } from '../../cocos/gfx/base/render-pass';
import type { Texture } from '../../cocos/gfx/base/texture';
import type { TextureBase } from '../../cocos/asset/assets/texture-base';
import type { Material } from '../../cocos/asset/assets/material';
import { AttachmentView } from './attachment-view';
import { bindAttachmentTexture } from './attachment-binding';
import {
    AirMRTOptions,
    AirMRTAttachmentInfo,
    MRTConfiguration,
    mrtClear,
    mrtDimension,
    mrtError,
    normalizeMRTOptions,
} from './mrt-options';
export type { AirMRTOptions, AirMRTAttachmentOptions, AirMRTAttachmentInfo } from './mrt-options';

export interface AirMRTPassOptions {
    /** false forces LOAD on every attachment, overriding configured CLEAR/DISCARD. */
    clear?: boolean;
    clearValues?: readonly (readonly [number, number, number, number])[];
    clearDepth?: number;
    clearStencil?: number;
}
export interface AirMRTInfo {
    readonly name: string;
    readonly backend: 'webgl2' | 'webgpu';
    readonly width: number;
    readonly height: number;
    readonly requestedSamples: number;
    readonly samples: number;
    readonly scale: number;
    readonly generation: number;
    readonly disposed: boolean;
    readonly colorAttachments: readonly AirMRTAttachmentInfo[];
    readonly depthFormat: Format;
}
interface Allocation {
    width: number;
    height: number;
    samples: number;
    draw: readonly Texture[];
    readable: readonly Texture[];
    depth: Texture | null;
    pass: RenderPass;
    loadPass: RenderPass;
    framebuffer: Framebuffer;
    owned: { destroy(): void }[];
}
const activeCommands = new WeakMap<CommandBuffer, AirMRTTarget>();
function release(owned: { destroy(): void }[]): unknown[] {
    const failures: unknown[] = [];
    for (const resource of owned.splice(0).reverse()) {
        try {
            resource.destroy();
        } catch (error) {
            failures.push(error);
        }
    }
    return failures;
}

/** Owns native GFX attachments only. It neither creates a Scene nor drives a render loop. */
export class AirMRTTarget {
    private readonly device: Device;
    private readonly configuration: MRTConfiguration;
    private readonly clearColors: Color[];
    private renderArea = new Rect();
    private allocation: Allocation | null = null;
    private readonly views: AttachmentView[] = [];
    private readonly bindings = new Set<{ rebind(): void; unbind(): void }>();
    private active: CommandBuffer | null = null;
    private disposed = false;
    private width = 0;
    private height = 0;
    private samples = 1;
    private generation = 0;

    constructor(options: AirMRTOptions) {
        this.configuration = normalizeMRTOptions(options);
        this.clearColors = this.configuration.colors.map((attachment) => {
            const value = attachment.clearValue;
            return new Color(value[0], value[1], value[2], value[3]);
        });
        const device = director.root?.device;
        if (!device || ![API.WEBGL2, API.WEBGPU].includes(device.gfxAPI))
            throw mrtError('AIR_E_MRT_DEVICE', 'Await createAirApp() with WebGL2 or WebGPU first');
        this.device = device;
        const colors = this.configuration.colors;
        if (colors.length > device.capabilities.maxColorRenderTargets)
            throw mrtError('AIR_E_MRT_LIMIT', 'Attachment count exceeds the device limit');
        for (const [index, attachment] of colors.entries()) {
            const features = device.getFormatFeatures(attachment.format);
            if (!(features & FormatFeatureBit.RENDER_TARGET) || !(features & FormatFeatureBit.SAMPLED_TEXTURE))
                throw mrtError('AIR_E_MRT_FORMAT', `Attachment ${index} is not renderable and sampled on this device`);
            if (attachment.filter === 'linear' && !(features & FormatFeatureBit.LINEAR_FILTER))
                throw mrtError('AIR_E_MRT_FILTER', `Attachment ${index} does not support linear filtering`);
        }
        if (device.gfxAPI === API.WEBGPU) {
            const limits = (
                device as unknown as { nativeDevice?: { limits: { maxColorAttachmentBytesPerSample?: number } } }
            ).nativeDevice?.limits;
            const budget = limits?.maxColorAttachmentBytesPerSample ?? 32;
            const cost = colors.reduce(
                (sum, attachment) =>
                    sum +
                    ([Format.RGBA8, Format.SRGB8_A8].includes(attachment.format)
                        ? 8
                        : FormatInfos[attachment.format].size),
                0,
            );
            if (cost > budget)
                throw mrtError(
                    'AIR_E_MRT_COLOR_BUDGET',
                    'Attachment formats exceed the native per-sample color budget',
                );
        }
        if (
            this.configuration.depthFormat !== Format.UNKNOWN &&
            !(device.getFormatFeatures(this.configuration.depthFormat) & FormatFeatureBit.RENDER_TARGET)
        )
            throw mrtError('AIR_E_MRT_DEPTH', 'Depth format is not renderable on this device');
        this.resize(options.width, options.height);
        try {
            colors.forEach((attachment, index) => {
                const view = new AttachmentView(
                    () => this.current().readable[index],
                    attachment.format,
                    attachment.filter,
                );
                view.updateSize(this.width, this.height);
                this.views.push(view);
            });
        } catch (cause) {
            try {
                this.dispose();
            } catch (cleanup) {
                throw Object.assign(
                    mrtError('AIR_E_MRT_ALLOCATION_CLEANUP', 'View creation and cleanup failed', cause),
                    { cleanup },
                );
            }
            throw cause;
        }
    }
    private current(): Allocation {
        if (this.disposed || !this.allocation) throw mrtError('AIR_E_MRT_DISPOSED', 'The MRT target is disposed');
        return this.allocation;
    }
    public get info(): Readonly<AirMRTInfo> {
        return Object.freeze({
            name: this.configuration.name,
            backend: this.device.gfxAPI === API.WEBGPU ? 'webgpu' : 'webgl2',
            width: this.width,
            height: this.height,
            requestedSamples: this.configuration.samples,
            samples: this.samples,
            scale: this.configuration.scale,
            generation: this.generation,
            disposed: this.disposed,
            colorAttachments: this.configuration.colors,
            depthFormat: this.configuration.depthFormat,
        });
    }
    /** Borrowed. A resize replaces these GFX identities; raw descriptor users must rebind. */
    public get textures(): readonly Texture[] {
        return this.current().readable;
    }
    public get renderTextures(): readonly Texture[] {
        return this.current().draw;
    }
    public get textureViews(): readonly TextureBase[] {
        this.current();
        return this.views.slice();
    }
    public get depthTexture(): Texture | null {
        return this.current().depth;
    }
    public get framebuffer(): Framebuffer {
        return this.current().framebuffer;
    }
    public get renderPass(): RenderPass {
        return this.current().pass;
    }

    private allocate(width: number, height: number, samples: number): Allocation {
        const owned: { destroy(): void }[] = [];
        const own = <T extends { destroy(): void }>(resource: T): T => {
            owned.push(resource);
            return resource;
        };
        try {
            const draw = this.configuration.colors.map((attachment) => {
                const info = new TextureInfo(
                    TextureType.TEX2D,
                    TextureUsageBit.COLOR_ATTACHMENT |
                        TextureUsageBit.SAMPLED |
                        TextureUsageBit.TRANSFER_SRC |
                        TextureUsageBit.TRANSFER_DST,
                    attachment.format,
                    width,
                    height,
                );
                info.samples = samples as SampleCount;
                return own(this.device.createTexture(info));
            });
            const readable =
                samples === 1
                    ? draw
                    : this.configuration.colors.map((attachment) =>
                          own(
                              this.device.createTexture(
                                  new TextureInfo(
                                      TextureType.TEX2D,
                                      TextureUsageBit.COLOR_ATTACHMENT |
                                          TextureUsageBit.SAMPLED |
                                          TextureUsageBit.TRANSFER_SRC |
                                          TextureUsageBit.TRANSFER_DST,
                                      attachment.format,
                                      width,
                                      height,
                                  ),
                              ),
                          ),
                      );
            let depth: Texture | null = null;
            if (this.configuration.depthFormat !== Format.UNKNOWN) {
                const info = new TextureInfo(
                    TextureType.TEX2D,
                    TextureUsageBit.DEPTH_STENCIL_ATTACHMENT | TextureUsageBit.SAMPLED,
                    this.configuration.depthFormat,
                    width,
                    height,
                );
                info.samples = samples as SampleCount;
                depth = own(this.device.createTexture(info));
            }
            const createPass = (forceLoad: boolean): RenderPass =>
                own(
                    this.device.createRenderPass(
                        new RenderPassInfo(
                            this.configuration.colors.map(
                                (attachment) =>
                                    new ColorAttachment(
                                        attachment.format,
                                        samples as SampleCount,
                                        forceLoad ? LoadOp.LOAD : attachment.loadOp,
                                        attachment.storeOp,
                                    ),
                            ),
                            new DepthStencilAttachment(
                                this.configuration.depthFormat,
                                samples as SampleCount,
                                forceLoad ? LoadOp.LOAD : LoadOp.CLEAR,
                                StoreOp.STORE,
                                forceLoad ? LoadOp.LOAD : LoadOp.CLEAR,
                                StoreOp.STORE,
                            ),
                        ),
                    ),
                );
            const pass = createPass(false),
                loadPass = createPass(true);
            const framebuffer = own(this.device.createFramebuffer(new FramebufferInfo(pass, draw, depth)));
            return {
                width,
                height,
                samples,
                draw: Object.freeze(draw.slice()),
                readable: Object.freeze(readable.slice()),
                depth,
                pass,
                loadPass,
                framebuffer,
                owned,
            };
        } catch (cause) {
            const failures = release(owned);
            if (failures.length)
                throw Object.assign(
                    mrtError('AIR_E_MRT_ALLOCATION_CLEANUP', 'Allocation failed and cleanup was incomplete', cause),
                    { failures },
                );
            throw cause;
        }
    }
    public resize(referenceWidth: number, referenceHeight: number): void {
        if (this.disposed) throw mrtError('AIR_E_MRT_DISPOSED', 'The MRT target is disposed');
        if (this.active) throw mrtError('AIR_E_MRT_ACTIVE_PASS', 'End the borrowed command pass before resizing');
        const width = Math.max(1, Math.floor(mrtDimension(referenceWidth, 'width') * this.configuration.scale));
        const height = Math.max(1, Math.floor(mrtDimension(referenceHeight, 'height') * this.configuration.scale));
        if (width > this.device.capabilities.maxTextureSize || height > this.device.capabilities.maxTextureSize)
            throw mrtError('AIR_E_MRT_SIZE', 'Scaled target exceeds the device texture limit');
        if (width === this.width && height === this.height) return;
        const requested = this.configuration.samples;
        const attempts =
            this.configuration.sampleFallback === 'lower' ? [8, 4, 2, 1].filter((n) => n <= requested) : [requested];
        let next: Allocation | undefined, last: unknown;
        for (const count of attempts) {
            if (this.device.gfxAPI === API.WEBGPU && count !== 1 && count !== 4) {
                last = mrtError('AIR_E_MRT_SAMPLES', `WebGPU cannot use ${count} samples`);
                continue;
            }
            try {
                next = this.allocate(width, height, count);
                break;
            } catch (cause) {
                last = cause;
                const code = (cause as { code?: string })?.code;
                if (
                    this.configuration.sampleFallback !== 'lower' ||
                    !['WEBGL2_TEXTURE_SAMPLES_UNSUPPORTED', 'WEBGPU_MULTISAMPLE_FORMAT_UNSUPPORTED'].includes(
                        code || '',
                    )
                )
                    throw cause;
            }
        }
        if (!next) throw last;
        const previous = this.allocation;
        this.allocation = next;
        this.width = width;
        this.height = height;
        this.renderArea = new Rect(0, 0, width, height);
        this.samples = next.samples;
        ++this.generation;
        this.views.forEach((view) => view.updateSize(width, height));
        const failures: unknown[] = [];
        for (const binding of this.bindings) {
            try {
                binding.rebind();
            } catch (error) {
                failures.push(error);
            }
        }
        if (previous) failures.push(...release(previous.owned));
        if (failures.length)
            throw Object.assign(
                mrtError('AIR_E_MRT_RESIZE_CLEANUP', 'New target committed but rebinding/old resource cleanup failed'),
                { failures },
            );
    }
    public beginPass(command: CommandBuffer, options: AirMRTPassOptions = {}): void {
        const allocation = this.current();
        if (!command || command.type !== CommandBufferType.PRIMARY)
            throw mrtError('AIR_E_MRT_COMMAND', 'Use an initialized primary GFX command buffer');
        if (this.active || activeCommands.has(command))
            throw mrtError('AIR_E_MRT_ACTIVE_PASS', 'An MRT pass is already open');
        for (const key of Object.keys(options))
            if (!['clear', 'clearValues', 'clearDepth', 'clearStencil'].includes(key))
                throw mrtError('AIR_E_MRT_OPTION', `Unknown pass option ${key}`);
        if (options.clear !== undefined && typeof options.clear !== 'boolean')
            throw mrtError('AIR_E_MRT_OPTION', 'clear must be boolean');
        const values = options.clearValues;
        if (values !== undefined && (!Array.isArray(values) || values.length !== this.configuration.colors.length))
            throw mrtError('AIR_E_MRT_CLEAR_VALUE', 'Provide one clear value per attachment');
        const clears = values
            ? values.map((value, index) => {
                  const color = mrtClear(this.configuration.colors[index].format, value);
                  return new Color(color[0], color[1], color[2], color[3]);
              })
            : this.clearColors;
        const depth = options.clearDepth ?? 1,
            stencil = options.clearStencil ?? 0;
        if (
            !Number.isFinite(depth) ||
            depth < 0 ||
            depth > 1 ||
            !Number.isInteger(stencil) ||
            stencil < 0 ||
            stencil > 255
        )
            throw mrtError('AIR_E_MRT_CLEAR_VALUE', 'Invalid depth/stencil clear');
        command.beginRenderPass(
            options.clear === false ? allocation.loadPass : allocation.pass,
            allocation.framebuffer,
            this.renderArea,
            clears,
            depth,
            stencil,
        );
        this.active = command;
        activeCommands.set(command, this);
    }
    public endPass(command: CommandBuffer): void {
        const allocation = this.current();
        if (this.active !== command || activeCommands.get(command) !== this)
            throw mrtError('AIR_E_MRT_ACTIVE_PASS', 'End the matching command pass');
        try {
            command.endRenderPass();
            if (allocation.samples > 1) {
                const blit = new TextureBlit();
                blit.srcExtent.width = blit.dstExtent.width = allocation.width;
                blit.srcExtent.height = blit.dstExtent.height = allocation.height;
                for (let i = 0; i < allocation.draw.length; ++i)
                    if (this.configuration.colors[i].storeOp === StoreOp.STORE)
                        command.blitTexture(allocation.draw[i], allocation.readable[i], [blit], Filter.POINT);
            }
        } finally {
            this.active = null;
            activeCommands.delete(command);
        }
    }
    /** Borrowed Asset view; automatically refresh this material binding after a successful resize. */
    public bindTexture(material: Material, property: string, index = 0, passIdx?: number): () => void {
        this.current();
        if (!Number.isSafeInteger(index) || !this.views[index])
            throw mrtError('AIR_E_MRT_ATTACHMENT', 'Invalid attachment index');
        if ([Format.R32UI, Format.R32I].includes(this.configuration.colors[index].format))
            throw mrtError(
                'AIR_E_MRT_BINDING',
                'Integer attachments require native integer sampler descriptors, not sampler2D',
            );
        const value = bindAttachmentTexture(material, property, this.views[index], 'AIR_E_MRT_BINDING', passIdx);
        const binding = {
            rebind: value.rebind,
            unbind: (): void => {
                if (!this.bindings.delete(binding)) return;
                value.unbind();
            },
        };
        this.bindings.add(binding);
        return binding.unbind;
    }
    public dispose(): void {
        if (this.disposed) return;
        if (this.active) throw mrtError('AIR_E_MRT_ACTIVE_PASS', 'End the borrowed command pass before disposal');
        this.disposed = true;
        const failures: unknown[] = [];
        for (const binding of [...this.bindings]) {
            try {
                binding.unbind();
            } catch (error) {
                failures.push(error);
            }
        }
        for (const view of this.views) {
            try {
                view.destroy();
            } catch (error) {
                failures.push(error);
            }
        }
        if (this.allocation) failures.push(...release(this.allocation.owned));
        this.allocation = null;
        if (failures.length)
            throw Object.assign(mrtError('AIR_E_MRT_DISPOSE', 'Resource cleanup was incomplete'), { failures });
    }
}
export function createAirMRTTarget(options: AirMRTOptions): AirMRTTarget {
    return new AirMRTTarget(options);
}
