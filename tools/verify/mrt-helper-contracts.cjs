/* Executed in the real paused browser by mrt-attachments.cjs --helper=1. */
module.exports = async function helperContracts({ sdk, renderer, samples }) {
    const m = await import(sdk),
        g = m.gfx;
    const app = await m.createAirApp({ canvas: '#GameCanvas', renderer });
    const device = m.director.root.device;
    const owned = [],
        own = (value) => (owned.push(value), value);
    const observations = [],
        expect = (value, message) => {
            if (!value) throw Error(message);
        };
    window.__mrtObservations = observations;
    expect(typeof m.createAirMRTTarget === 'function', 'The SDK must export the actual MRT helper');
    const formats =
        samples > 1 ? [g.Format.RGBA16F, g.Format.RG16F] : [g.Format.RGBA16F, g.Format.RG16F, g.Format.R32UI];
    const config = {
        width: 4,
        height: 4,
        samples,
        depthFormat: g.Format.DEPTH_STENCIL,
        colorAttachments: formats.map((format) => ({
            format,
            clearValue: format === g.Format.R32UI ? [43, 0, 0, 0] : [0, 0, 0, 0],
        })),
    };
    let target, clock, preview, material;
    const nativeHandles = new Set(),
        deleted = new WeakMap();
    const deletions = [];
    function observe(prototype, key) {
        const original = prototype[key];
        prototype[key] = function (...args) {
            const handle = key === 'destroy' ? this : args[0];
            if (handle && nativeHandles.has(handle)) deleted.set(handle, (deleted.get(handle) || 0) + 1);
            return original.apply(this, args);
        };
        deletions.push(() => {
            prototype[key] = original;
        });
    }
    if (renderer === 'webgpu') observe(GPUTexture.prototype, 'destroy');
    else {
        observe(WebGL2RenderingContext.prototype, 'deleteTexture');
        observe(WebGL2RenderingContext.prototype, 'deleteRenderbuffer');
    }
    function trackTexture(texture) {
        const data = texture.gpuTexture;
        if (renderer === 'webgpu') {
            if (data.gpuTexture) nativeHandles.add(data.gpuTexture);
            if (data.resolveTex?.gpuTexture) nativeHandles.add(data.resolveTex.gpuTexture);
        } else {
            for (const object of [
                data.glTexture,
                data.glRenderbuffer,
                data.resolveTex?.glTexture,
                data.resolveTex?.glRenderbuffer,
            ])
                if (object) nativeHandles.add(object);
        }
    }
    function trackTarget(value) {
        for (const texture of new Set([...value.textures, ...value.renderTextures])) trackTexture(texture);
        if (value.depthTexture) trackTexture(value.depthTexture);
    }
    const read = async (textures) => {
        const output = [new Uint16Array(4), new Uint16Array(2), new Uint32Array(1)];
        const region = new g.BufferTextureCopy();
        region.texExtent.width = region.texExtent.height = 1;
        for (let i = 0; i < textures.length; ++i) {
            if (renderer === 'webgpu') await device.copyTextureToBuffersAsync(textures[i], [output[i]], [region]);
            else device.copyTextureToBuffers(textures[i], [output[i]], [region]);
        }
        return { color: [...output[0]], velocity: [...output[1]], id: textures.length > 2 ? output[2][0] : undefined };
    };
    try {
        target = m.createAirMRTTarget(config);
        trackTarget(target);
        const layout = own(device.createDescriptorSetLayout(new g.DescriptorSetLayoutInfo([])));
        const pipelineLayout = own(device.createPipelineLayout(new g.PipelineLayoutInfo([layout])));
        const set = own(device.createDescriptorSet(new g.DescriptorSetInfo(layout)));
        set.update();
        const vertex =
            renderer === 'webgpu'
                ? 'void main(){vec2 p=vec2((gl_VertexIndex<<1)&2,gl_VertexIndex&2);gl_Position=vec4(p*2.0-1.0,0,1);}'
                : 'precision highp float;precision highp int;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);}';
        const vertices = own(
            device.createBuffer(new g.BufferInfo(g.BufferUsageBit.VERTEX, g.MemoryUsageBit.DEVICE, 12, 4)),
        );
        vertices.update(new Float32Array([0, 0, 0]));
        const assembler = own(device.createInputAssembler(new g.InputAssemblerInfo([], [vertices])));
        assembler.vertexCount = 3;
        const pipeline = (red, depthZ) => {
            const fragment =
                'precision highp float;precision highp int;layout(location=0) out vec4 color;layout(location=1) out vec2 velocity;' +
                (formats.length > 2 ? 'layout(location=2) out uint objectId;' : '') +
                'void main(){color=vec4(' +
                (red ? '1,0,0,1' : '0,0,1,1') +
                ');velocity=vec2(0.25,0.5);' +
                (formats.length > 2 ? 'objectId=16777217u;' : '') +
                '}';
            const info = new g.PipelineStateInfo();
            info.shader = own(
                device.createShader(
                    new g.ShaderInfo(red ? 'mrt-helper-red' : 'mrt-helper-blue', [
                        new g.ShaderStage(
                            g.ShaderStageFlagBit.VERTEX,
                            depthZ === undefined ? vertex : vertex.replace('0,1);}', `${depthZ},1);}`),
                        ),
                        new g.ShaderStage(g.ShaderStageFlagBit.FRAGMENT, fragment),
                    ]),
                ),
            );
            info.pipelineLayout = pipelineLayout;
            info.renderPass = target.renderPass;
            info.rasterizerState.cullMode = g.CullMode.NONE;
            info.depthStencilState.depthTest = info.depthStencilState.depthWrite = depthZ !== undefined;
            info.depthStencilState.depthFunc = g.ComparisonFunc.LESS;
            return own(device.createPipelineState(info));
        };
        const blue = pipeline(false),
            red = pipeline(true);
        const draw = (state, passOptions) => {
            const command = own(device.createCommandBuffer(new g.CommandBufferInfo(device.queue)));
            command.begin();
            target.beginPass(command, passOptions);
            try {
                command.bindPipelineState(state);
                command.bindDescriptorSet(0, set);
                command.bindInputAssembler(assembler);
                command.draw(assembler);
            } finally {
                target.endPass(command);
            }
            command.end();
            device.queue.submit([command]);
        };
        draw(blue);
        const first = await read(target.textures);
        expect(
            first.color.join() === [0, 0, 0x3c00, 0x3c00].join() &&
                first.velocity.join() === [0x3400, 0x3800].join() &&
                (formats.length < 3 || first.id === 16777217),
            'MRT helper did not actually render/resolve: ' + JSON.stringify(first),
        );
        observations.push({ name: 'helper-native-draw-and-resolve', info: target.info, first });
        const load = own(device.createCommandBuffer(new g.CommandBufferInfo(device.queue)));
        load.begin();
        target.beginPass(load, { clear: false });
        target.endPass(load);
        load.end();
        device.queue.submit([load]);
        expect(
            JSON.stringify(await read(target.textures)) === JSON.stringify(first),
            'clear:false did not override configured CLEAR',
        );
        observations.push({ name: 'force-load-overrides-clear' });

        const scene = new m.Scene('MRT material preview'),
            cameraNode = new m.Node('camera'),
            quad = new m.Node('quad');
        scene.addChild(cameraNode);
        scene.addChild(quad);
        cameraNode.setPosition(0, 0, 3);
        const camera = cameraNode.addComponent(m.Camera);
        Object.assign(camera, {
            projection: m.Camera.ProjectionType.ORTHO,
            orthoHeight: 1,
            near: 0.1,
            far: 100,
            visibility: m.Layers.Enum.DEFAULT,
            clearFlags: m.Camera.ClearFlag.SOLID_COLOR,
            clearColor: new m.Color(0, 0, 0, 255),
        });
        preview = new m.RenderTexture();
        preview.initialize({
            width: 4,
            height: 4,
            passInfo: new g.RenderPassInfo([new g.ColorAttachment(g.Format.RGBA8)]),
        });
        camera.targetTexture = preview;
        material = new m.Material();
        material.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } });
        const mesh = m.utils.createMesh(m.primitives.quad({ width: 2, height: 2 }));
        own(mesh);
        const rendererNode = quad.addComponent(m.MeshRenderer);
        rendererNode.mesh = mesh;
        rendererNode.setSharedMaterial(material, 0);
        const borrowed = target.textureViews[0];
        observations.push({
            name: 'material-binding-input',
            expectedType: g.Type.SAMPLER2D,
            passes: material.passes.map((pass) => {
                const handle = pass.getHandle('mainTexture');
                return {
                    program: pass.program,
                    handle,
                    type: (handle & 0xfc000000) >>> 26,
                    count: (handle & 0x000ff000) >>> 12,
                    samplers: pass._shaderInfo?.samplerTextures,
                };
            }),
        });
        target.bindTexture(material, 'mainTexture', 0);
        if (formats.includes(g.Format.R32UI)) {
            let rejected = false;
            try {
                target.bindTexture(material, 'mainTexture', formats.indexOf(g.Format.R32UI));
            } catch (error) {
                rejected = error.code === 'AIR_E_MRT_BINDING';
            }
            expect(
                rejected && material.getProperty('mainTexture') === borrowed,
                'Integer attachment must reject sampler2D binding before material mutation',
            );
            observations.push({ name: 'integer-sampler-mismatch-rejected' });
        }
        const sampler = borrowed.getGFXSampler(),
            samplerData = sampler.gpuSampler;
        app.run(scene);
        clock = m.createStepClock();
        clock.begin();
        const previewPixel = async () => {
            await clock.step(0);
            await clock.step(0);
            const output = new Uint8Array(4),
                region = new g.BufferTextureCopy();
            region.texExtent.width = region.texExtent.height = 1;
            region.texOffset.x = region.texOffset.y = 2;
            if (renderer === 'webgpu')
                await device.copyTextureToBuffersAsync(preview.getGFXTexture(), [output], [region]);
            else device.copyTextureToBuffers(preview.getGFXTexture(), [output], [region]);
            return [...output];
        };
        const previewBlue = await previewPixel();
        const referencePixel = async (rgba) => {
            const texture = own(new m.Texture2D());
            texture.reset({ width: 1, height: 1, format: m.Texture2D.PixelFormat.RGBA8888 });
            texture.uploadData(new Uint8Array(rgba));
            try {
                material.setProperty('mainTexture', texture);
                return await previewPixel();
            } finally {
                material.setProperty('mainTexture', borrowed);
            }
        };
        const referenceBlue = await referencePixel([0, 0, 255, 255]);
        expect(
            referenceBlue[2] > 0 && referenceBlue[0] === 0 && previewBlue.join() === referenceBlue.join(),
            'Borrowed material view differs from ordinary blue Texture2D: ' +
                JSON.stringify({ previewBlue, referenceBlue }),
        );
        const oldHandles = [...nativeHandles];
        target.resize(6, 6);
        trackTarget(target);
        draw(red);
        const second = await read(target.textures),
            previewRed = await previewPixel();
        const referenceRed = await referencePixel([255, 0, 0, 255]);
        expect(
            second.color.join() === [0x3c00, 0, 0, 0x3c00].join() &&
                referenceRed[0] > 0 &&
                referenceRed[2] === 0 &&
                previewRed.join() === referenceRed.join(),
            'Resize/material binding differs from ordinary red Texture2D: ' +
                JSON.stringify({ second, previewRed, referenceRed }),
        );
        expect(
            oldHandles.every((handle) => deleted.get(handle) === 1),
            'Resize failed to release original native allocations once',
        );
        observations.push({
            name: 'resize-native-pixels-and-material-rebind',
            second,
            previewBlue,
            previewRed,
            referenceBlue,
            referenceRed,
            info: target.info,
        });

        const generation = target.info.generation,
            originalTexture = target.textures[0],
            bytesBefore = device.memoryStatus.textureSize;
        const originalCreate = device.createTexture,
            injected = Error('injected MRT allocation failure');
        let calls = 0,
            failed;
        try {
            device.createTexture = function (...args) {
                if (++calls === 2) throw injected;
                const texture = originalCreate.apply(this, args);
                trackTexture(texture);
                return texture;
            };
            target.resize(8, 8);
        } catch (error) {
            failed = error;
        } finally {
            device.createTexture = originalCreate;
        }
        expect(
            failed === injected &&
                target.info.generation === generation &&
                target.textures[0] === originalTexture &&
                device.memoryStatus.textureSize === bytesBefore,
            'Failed resize did not preserve the old target and release partial resources',
        );
        draw(red);
        expect((await read(target.textures)).color[0] === 0x3c00, 'Old target stopped rendering after rollback');
        observations.push({
            name: 'allocation-failure-rollback',
            generation,
            calls,
            logicalBytesBefore: bytesBefore,
            logicalBytesAfter: device.memoryStatus.textureSize,
        });

        const active = own(device.createCommandBuffer(new g.CommandBufferInfo(device.queue)));
        active.begin();
        target.beginPass(active, { clear: false });
        let resizeRejected = false,
            disposeRejected = false;
        try {
            target.resize(10, 10);
        } catch (error) {
            resizeRejected = error.code === 'AIR_E_MRT_ACTIVE_PASS';
        }
        try {
            target.dispose();
        } catch (error) {
            disposeRejected = error.code === 'AIR_E_MRT_ACTIVE_PASS';
        }
        target.endPass(active);
        active.end();
        device.queue.submit([active]);
        expect(
            resizeRejected && disposeRejected && !target.info.disposed,
            'Borrowed active command ownership was violated',
        );
        observations.push({ name: 'active-pass-ownership', resizeRejected, disposeRejected });

        const depthBlue = pipeline(false, 0.2),
            farRed = pipeline(true, 0.8),
            nearRed = pipeline(true, 0.1);
        draw(depthBlue);
        draw(farRed, { clear: false });
        const far = await read(target.textures);
        expect(far.color.join() === [0, 0, 0x3c00, 0x3c00].join(), 'LOAD did not retain depth for occlusion');
        draw(nearRed, { clear: false });
        const near = await read(target.textures);
        expect(near.color.join() === [0x3c00, 0, 0, 0x3c00].join(), 'Near geometry did not pass the retained depth');
        observations.push({ name: 'depth-load-and-occlusion', far, near });

        target.dispose();
        target.dispose();
        expect(
            [...nativeHandles].every((handle) => deleted.get(handle) === 1),
            'Owned native textures/renderbuffers were not released exactly once',
        );
        expect(sampler.gpuSampler === samplerData && samplerData, 'Shared cached sampler was destroyed');
        expect(material.getProperty('mainTexture') !== borrowed, 'Material retained a disposed MRT view');
        observations.push({
            name: 'idempotent-dispose-and-shared-sampler',
            ownedNativeHandles: nativeHandles.size,
            explicitDestroyCounts: [...nativeHandles].map((handle) => deleted.get(handle)),
        });

        if (renderer === 'webgl2') {
            const legacy = m.createAirRenderTarget({ width: 4, height: 4, colorFormat: 'rgba8' });
            try {
                legacy.bindColor(material, 'mainTexture');
                const clearLegacy = (red) => {
                    const framebuffer = legacy.renderTexture.window.framebuffer;
                    const command = own(device.createCommandBuffer(new g.CommandBufferInfo(device.queue)));
                    command.begin();
                    command.beginRenderPass(
                        framebuffer.renderPass,
                        framebuffer,
                        new g.Rect(0, 0, legacy.info.width, legacy.info.height),
                        [red ? new g.Color(1, 0, 0, 1) : new g.Color(0, 0, 1, 1)],
                        1,
                        0,
                    );
                    command.endRenderPass();
                    command.end();
                    device.queue.submit([command]);
                    legacy.resolve();
                };
                clearLegacy(false);
                const blue = await previewPixel();
                legacy.resize(6, 6);
                clearLegacy(true);
                const red = await previewPixel();
                expect(
                    blue.join() === referenceBlue.join() && red.join() === referenceRed.join(),
                    'Legacy single-attachment binding/resize differs from ordinary textures',
                );
                legacy.dispose();
                legacy.dispose();
                expect(
                    material.getProperty('mainTexture') !== legacy.texture,
                    'Legacy material retained disposed view',
                );
                observations.push({ name: 'legacy-single-attachment-binding-resize-dispose', blue, red });
            } finally {
                legacy.dispose();
            }
        }
        const fallback = m.createAirMRTTarget({
            ...config,
            samples: 4,
            sampleFallback: 'lower',
            colorAttachments: [{ format: g.Format.R32UI, clearValue: [16777217, 0, 0, 0] }],
        });
        try {
            const command = own(device.createCommandBuffer(new g.CommandBufferInfo(device.queue)));
            command.begin();
            fallback.beginPass(command);
            fallback.endPass(command);
            command.end();
            device.queue.submit([command]);
            const output = new Uint32Array(1),
                region = new g.BufferTextureCopy();
            region.texExtent.width = region.texExtent.height = 1;
            if (renderer === 'webgpu') await device.copyTextureToBuffersAsync(fallback.textures[0], [output], [region]);
            else device.copyTextureToBuffers(fallback.textures[0], [output], [region]);
            expect(
                output[0] === 16777217 && fallback.info.samples <= 4 && fallback.info.requestedSamples === 4,
                'Fallback did not report actual samples or preserve integer clear',
            );
            observations.push({ name: 'explicit-sample-fallback', info: fallback.info, id: output[0] });
        } finally {
            fallback.dispose();
        }
        if (renderer === 'webgl2')
            expect(device.gl.getError() === device.gl.NO_ERROR, 'Helper polluted native GL errors');
        return {
            backend: device.gfxAPI,
            expectedBackend: renderer === 'webgpu' ? g.API.WEBGPU : g.API.WEBGL2,
            observations,
        };
    } finally {
        try {
            target?.dispose();
            await app.close();
            clock?.end();
        } finally {
            preview?.destroy();
            material?.destroy();
            for (const resource of owned.reverse()) resource.destroy();
            for (const restore of deletions.reverse()) restore();
        }
    }
};
