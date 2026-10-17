/* Executed inside the paused browser page by webgpu-backend.cjs. Uses the shipped GFX API. */
module.exports = async function resourceContracts() {
    const m = await import('/build/cocosair.module.js');
    const g = m.gfx;
    const device = m.director.root.device;
    const owned = [];
    const own = (value) => {
        owned.push(value);
        return value;
    };
    const result = {};
    try {
        const texture = own(
            device.createTexture(
                new g.TextureInfo(
                    g.TextureType.TEX2D,
                    g.TextureUsageBit.SAMPLED | g.TextureUsageBit.TRANSFER_SRC | g.TextureUsageBit.TRANSFER_DST,
                    g.Format.RGBA8,
                    3,
                    2,
                ),
            ),
        );
        const region = new g.BufferTextureCopy();
        region.texExtent.width = 3;
        region.texExtent.height = 2;
        const source = new Uint8Array(24);
        for (let index = 0; index < source.length; index++) source[index] = index + 1;
        device.copyBuffersToTexture([source], texture, [region]);
        const target = new Uint8Array(40).fill(199);
        const read = new g.BufferTextureCopy();
        read.copy(region);
        read.buffOffset = 4;
        read.buffStride = 5;
        await device.copyTextureToBuffersAsync(texture, [target], [read]);
        result.readback =
            [...target.slice(4, 16), ...target.slice(24, 36)].every((value, index) => value === source[index]) &&
            target.slice(16, 24).every((value) => value === 199);
        if (!result.readback) throw new Error('Odd-width padded readback returned incorrect bytes.');

        if (device.gfxAPI !== g.API.WEBGPU) return result;
        try {
            device.copyTextureToBuffers(texture, [target], [region]);
        } catch (error) {
            result.syncReadbackRejected = error.code === 'WEBGPU_ASYNC_READBACK_REQUIRED';
        }

        const msaaInfo = new g.TextureInfo(
            g.TextureType.TEX2D,
            g.TextureUsageBit.COLOR_ATTACHMENT | g.TextureUsageBit.SAMPLED | g.TextureUsageBit.TRANSFER_SRC,
            g.Format.RGBA8,
            3,
            2,
        );
        msaaInfo.samples = g.SampleCount.X4;
        const msaa = own(device.createTexture(msaaInfo));
        const colorAttachment = new g.ColorAttachment(g.Format.RGBA8);
        colorAttachment.sampleCount = g.SampleCount.X4;
        const msaaPass = own(device.createRenderPass(new g.RenderPassInfo([colorAttachment])));
        const msaaFramebuffer = own(device.createFramebuffer(new g.FramebufferInfo(msaaPass, [msaa])));
        const render = own(device.createCommandBuffer(new g.CommandBufferInfo(device.queue)));
        render.begin();
        render.beginRenderPass(
            msaaPass,
            msaaFramebuffer,
            new g.Rect(0, 0, 3, 2),
            [new g.Color(0.25, 0.5, 0.75, 1)],
            1,
            0,
        );
        render.endRenderPass();
        const blit = new g.TextureBlit();
        blit.srcExtent.width = blit.dstExtent.width = 3;
        blit.srcExtent.height = blit.dstExtent.height = 2;
        render.blitTexture(msaa, texture, [blit], g.Filter.POINT);
        render.end();
        const resolved = new Uint8Array(24);
        await device.copyTextureToBuffersAsync(texture, [resolved], [region]);
        result.msaaResolve =
            Math.abs(resolved[0] - 64) <= 1 &&
            Math.abs(resolved[1] - 128) <= 1 &&
            Math.abs(resolved[2] - 191) <= 1 &&
            resolved[3] === 255;
        if (!result.msaaResolve) throw new Error(`MSAA resolve returned ${resolved.slice(0, 4)}`);

        const arrayInfo = new g.TextureInfo(
            g.TextureType.TEX2D_ARRAY,
            g.TextureUsageBit.SAMPLED | g.TextureUsageBit.COLOR_ATTACHMENT | g.TextureUsageBit.TRANSFER_SRC,
            g.Format.RGBA8,
            4,
            4,
        );
        arrayInfo.layerCount = 2;
        arrayInfo.levelCount = 2;
        const array = own(device.createTexture(arrayInfo));
        const viewInfo = new g.TextureViewInfo();
        viewInfo.texture = array;
        viewInfo.type = g.TextureType.TEX2D;
        viewInfo.format = g.Format.RGBA8;
        viewInfo.baseLevel = 1;
        viewInfo.levelCount = 1;
        viewInfo.baseLayer = 1;
        viewInfo.layerCount = 1;
        const view = own(device.createTexture(viewInfo));
        const pass = own(device.createRenderPass(new g.RenderPassInfo([new g.ColorAttachment(g.Format.RGBA8)])));
        const framebuffer = own(device.createFramebuffer(new g.FramebufferInfo(pass, [view])));
        render.begin();
        render.beginRenderPass(pass, framebuffer, new g.Rect(0, 0, 2, 2), [new g.Color(0, 1, 0, 1)], 1, 0);
        render.endRenderPass();
        render.end();
        const viewRegion = new g.BufferTextureCopy();
        viewRegion.texExtent.width = viewRegion.texExtent.height = 2;
        const viewBytes = new Uint8Array(16);
        await device.copyTextureToBuffersAsync(view, [viewBytes], [viewRegion]);
        result.mipLayerAttachment =
            framebuffer.width === 2 &&
            framebuffer.height === 2 &&
            viewBytes[0] === 0 &&
            viewBytes[1] === 255 &&
            viewBytes[3] === 255;
        if (!result.mipLayerAttachment) throw new Error('Selected mip/layer attachment readback failed.');

        const secondColor = own(
            device.createTexture(
                new g.TextureInfo(
                    g.TextureType.TEX2D,
                    g.TextureUsageBit.COLOR_ATTACHMENT | g.TextureUsageBit.TRANSFER_SRC,
                    g.Format.RGBA8,
                    3,
                    2,
                ),
            ),
        );
        const firstColor = own(
            device.createTexture(
                new g.TextureInfo(
                    g.TextureType.TEX2D,
                    g.TextureUsageBit.COLOR_ATTACHMENT | g.TextureUsageBit.TRANSFER_SRC,
                    g.Format.RGBA8,
                    3,
                    2,
                ),
            ),
        );
        const depth = own(
            device.createTexture(
                new g.TextureInfo(
                    g.TextureType.TEX2D,
                    g.TextureUsageBit.DEPTH_STENCIL_ATTACHMENT | g.TextureUsageBit.SAMPLED,
                    g.Format.DEPTH,
                    3,
                    2,
                ),
            ),
        );
        const mrtInfo = new g.RenderPassInfo([
            new g.ColorAttachment(g.Format.RGBA8),
            new g.ColorAttachment(g.Format.RGBA8),
        ]);
        mrtInfo.depthStencilAttachment = new g.DepthStencilAttachment(g.Format.DEPTH);
        const mrtPass = own(device.createRenderPass(mrtInfo));
        const mrtFramebuffer = own(
            device.createFramebuffer(new g.FramebufferInfo(mrtPass, [firstColor, secondColor], depth)),
        );
        render.begin();
        render.beginRenderPass(
            mrtPass,
            mrtFramebuffer,
            new g.Rect(0, 0, 3, 2),
            [new g.Color(1, 0, 0, 1), new g.Color(0, 0, 1, 1)],
            0.25,
            0,
        );
        render.endRenderPass();
        render.end();
        const red = new Uint8Array(24),
            blue = new Uint8Array(24);
        await device.copyTextureToBuffersAsync(firstColor, [red], [region]);
        await device.copyTextureToBuffersAsync(secondColor, [blue], [region]);
        result.mrtDepth = red[0] === 255 && red[2] === 0 && blue[0] === 0 && blue[2] === 255;
        if (!result.mrtDepth) throw new Error('MRT/depth clear did not reach both attachments.');

        const binding = new g.DescriptorSetLayoutBinding(
            0,
            g.DescriptorType.STORAGE_BUFFER,
            1,
            g.ShaderStageFlagBit.COMPUTE,
            g.MemoryAccessBit.READ_WRITE,
        );
        const setLayout = own(device.createDescriptorSetLayout(new g.DescriptorSetLayoutInfo([binding])));
        const pipelineLayout = own(device.createPipelineLayout(new g.PipelineLayoutInfo([setLayout])));
        const shader = own(
            device.createShader(
                new g.ShaderInfo('webgpu-compute-contract', [
                    new g.ShaderStage(
                        g.ShaderStageFlagBit.COMPUTE,
                        'layout(local_size_x=1,local_size_y=1,local_size_z=1) in; layout(set=0,binding=0,std430) buffer Values { uint data[]; } values; void main(){values.data[gl_GlobalInvocationID.x]=gl_GlobalInvocationID.x+7u;}',
                    ),
                ]),
            ),
        );
        const info = new g.PipelineStateInfo();
        info.shader = shader;
        info.pipelineLayout = pipelineLayout;
        info.bindPoint = g.PipelineBindPoint.COMPUTE;
        const pipeline = own(device.createPipelineState(info));
        const buffer = own(
            device.createBuffer(
                new g.BufferInfo(
                    g.BufferUsageBit.STORAGE | g.BufferUsageBit.TRANSFER_SRC,
                    g.MemoryUsageBit.DEVICE,
                    16,
                    4,
                ),
            ),
        );
        const descriptor = own(device.createDescriptorSet(new g.DescriptorSetInfo(setLayout)));
        descriptor.bindBuffer(0, buffer);
        descriptor.update();
        const command = own(device.createCommandBuffer(new g.CommandBufferInfo(device.queue)));
        command.begin();
        command.bindPipelineState(pipeline);
        command.bindDescriptorSet(0, descriptor);
        command.dispatch(new g.DispatchInfo(4, 1, 1));
        command.end();
        const native = device.nativeDevice;
        const staging = native.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        try {
            const encoder = native.createCommandEncoder();
            encoder.copyBufferToBuffer(buffer.gpuBuffer.gpuBuffer, 0, staging, 0, 16);
            native.queue.submit([encoder.finish()]);
            await staging.mapAsync(GPUMapMode.READ);
            result.compute = Array.from(new Uint32Array(staging.getMappedRange())).join(',') === '7,8,9,10';
            if (!result.compute) throw new Error('GFX compute dispatch did not write the expected values.');
        } finally {
            staging.unmap();
            staging.destroy();
        }

        const storageTexture = own(
            device.createTexture(
                new g.TextureInfo(
                    g.TextureType.TEX2D,
                    g.TextureUsageBit.STORAGE | g.TextureUsageBit.SAMPLED | g.TextureUsageBit.TRANSFER_SRC,
                    g.Format.RGBA8,
                    2,
                    2,
                ),
            ),
        );
        const imageBinding = new g.DescriptorSetLayoutBinding(
            0,
            g.DescriptorType.STORAGE_IMAGE,
            1,
            g.ShaderStageFlagBit.COMPUTE,
            g.MemoryAccessBit.WRITE_ONLY,
        );
        imageBinding.viewDimension = g.ViewDimension.TEX2D;
        imageBinding.format = g.Format.RGBA8;
        const imageLayout = own(device.createDescriptorSetLayout(new g.DescriptorSetLayoutInfo([imageBinding])));
        const imagePipelineLayout = own(device.createPipelineLayout(new g.PipelineLayoutInfo([imageLayout])));
        const imageShader = own(
            device.createShader(
                new g.ShaderInfo('webgpu-storage-image-contract', [
                    new g.ShaderStage(
                        g.ShaderStageFlagBit.COMPUTE,
                        'layout(local_size_x=1,local_size_y=1,local_size_z=1) in; layout(set=0,binding=0,rgba8) writeonly uniform image2D outputImage; void main(){ imageStore(outputImage,ivec2(gl_GlobalInvocationID.xy),vec4(1.0,0.5,0.25,1.0)); }',
                    ),
                ]),
            ),
        );
        const imageInfo = new g.PipelineStateInfo();
        imageInfo.shader = imageShader;
        imageInfo.pipelineLayout = imagePipelineLayout;
        imageInfo.bindPoint = g.PipelineBindPoint.COMPUTE;
        const imagePipeline = own(device.createPipelineState(imageInfo));
        const imageDescriptor = own(device.createDescriptorSet(new g.DescriptorSetInfo(imageLayout)));
        imageDescriptor.bindTexture(0, storageTexture);
        imageDescriptor.update();
        command.begin();
        command.bindPipelineState(imagePipeline);
        command.bindDescriptorSet(0, imageDescriptor);
        command.dispatch(new g.DispatchInfo(2, 2, 1));
        command.end();
        const imageRegion = new g.BufferTextureCopy();
        imageRegion.texExtent.width = imageRegion.texExtent.height = 2;
        const imageBytes = new Uint8Array(16);
        await device.copyTextureToBuffersAsync(storageTexture, [imageBytes], [imageRegion]);
        result.storageTexture =
            imageBytes[0] === 255 &&
            Math.abs(imageBytes[1] - 128) <= 1 &&
            Math.abs(imageBytes[2] - 64) <= 1 &&
            imageBytes[3] === 255;
        if (!result.storageTexture) throw new Error('GFX storage texture dispatch returned incorrect pixels.');

        const sampleBinding = new g.DescriptorSetLayoutBinding(
            0,
            g.DescriptorType.SAMPLER_TEXTURE,
            1,
            g.ShaderStageFlagBit.FRAGMENT,
        );
        sampleBinding.viewDimension = g.ViewDimension.TEX2D;
        const sampleLayout = own(device.createDescriptorSetLayout(new g.DescriptorSetLayoutInfo([sampleBinding])));
        const samplePipelineLayout = own(device.createPipelineLayout(new g.PipelineLayoutInfo([sampleLayout])));
        const sampleInfo = new g.ShaderInfo('webgpu-compute-to-draw', [
            new g.ShaderStage(
                g.ShaderStageFlagBit.VERTEX,
                'layout(location=0) out vec2 uv; void main(){vec2 p=vec2((gl_VertexIndex<<1)&2,gl_VertexIndex&2); uv=p; gl_Position=vec4(p*2.0-1.0,0.0,1.0);}',
            ),
            new g.ShaderStage(
                g.ShaderStageFlagBit.FRAGMENT,
                'layout(location=0) in vec2 uv; layout(location=0) out vec4 color; layout(set=0,binding=0) uniform sampler2D mainTexture; void main(){color=texture(mainTexture,uv);}',
            ),
        ]);
        sampleInfo.samplerTextures.push(new g.UniformSamplerTexture(0, 0, 'mainTexture', g.Type.SAMPLER2D, 1));
        const sampleShader = own(device.createShader(sampleInfo));
        const drawInfo = new g.PipelineStateInfo();
        drawInfo.shader = sampleShader;
        drawInfo.pipelineLayout = samplePipelineLayout;
        drawInfo.renderPass = pass;
        drawInfo.rasterizerState.cullMode = g.CullMode.NONE;
        const drawPipeline = own(device.createPipelineState(drawInfo));
        const sampleDescriptor = own(device.createDescriptorSet(new g.DescriptorSetInfo(sampleLayout)));
        sampleDescriptor.bindTexture(0, storageTexture);
        sampleDescriptor.bindSampler(0, device.getSampler(new g.SamplerInfo()));
        sampleDescriptor.update();
        // Cocos GFX requires a vertex buffer even when GLSL uses gl_VertexIndex.
        const vertices = own(
            device.createBuffer(new g.BufferInfo(g.BufferUsageBit.VERTEX, g.MemoryUsageBit.DEVICE, 12, 4)),
        );
        const assembler = own(device.createInputAssembler(new g.InputAssemblerInfo([], [vertices])));
        assembler.vertexCount = 3;
        const drawFramebuffer = own(device.createFramebuffer(new g.FramebufferInfo(pass, [firstColor])));
        command.begin();
        command.bindPipelineState(imagePipeline);
        command.bindDescriptorSet(0, imageDescriptor);
        command.dispatch(new g.DispatchInfo(2, 2, 1));
        command.beginRenderPass(pass, drawFramebuffer, new g.Rect(0, 0, 3, 2), [new g.Color(0, 0, 0, 1)], 1, 0);
        command.bindPipelineState(drawPipeline);
        command.bindDescriptorSet(0, sampleDescriptor);
        command.bindInputAssembler(assembler);
        command.draw(assembler);
        command.endRenderPass();
        command.end();
        await device.copyTextureToBuffersAsync(firstColor, [red], [region]);
        result.computeToDraw = red[0] === 255 && Math.abs(red[1] - 128) <= 1 && Math.abs(red[2] - 64) <= 1;
        if (!result.computeToDraw) throw new Error('Compute storage output was not consumed by the render pass.');
        // Both projected sets reference the same texture object. A resize replaces its native resource;
        // refreshing the compute set must not hide that replacement from the sampled set.
        storageTexture.resize(4, 4);
        command.begin();
        command.bindPipelineState(imagePipeline);
        command.bindDescriptorSet(0, imageDescriptor);
        command.dispatch(new g.DispatchInfo(4, 4, 1));
        command.beginRenderPass(pass, drawFramebuffer, new g.Rect(0, 0, 3, 2), [new g.Color(0, 0, 0, 1)], 1, 0);
        command.bindPipelineState(drawPipeline);
        command.bindDescriptorSet(0, sampleDescriptor);
        command.bindInputAssembler(assembler);
        command.draw(assembler);
        command.endRenderPass();
        command.end();
        await device.copyTextureToBuffersAsync(firstColor, [red], [region]);
        result.resizeRebind = red[0] === 255 && Math.abs(red[1] - 128) <= 1 && Math.abs(red[2] - 64) <= 1;
        if (!result.resizeRebind) throw new Error('Texture resize did not refresh all dependent descriptor sets.');
        return result;
    } finally {
        owned.reverse().forEach((value) => value.destroy());
    }
};
