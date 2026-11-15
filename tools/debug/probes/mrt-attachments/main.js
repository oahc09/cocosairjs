// Explicit developer probe. Reuses the main SDK and native GFX; no engine/runtime dependency is bundled here.
const status = document.querySelector('#status');
const failure = (error) =>
    String(error.stack || error) +
    (error.cause ? '\nCause: ' + String(error.cause.stack || error.cause.message || JSON.stringify(error.cause)) : '');
async function boot() {
    const query = new URLSearchParams(location.search);
    const sdk = new URL(query.get('sdk') || '/build/cocosair.module.js', location.href);
    if (sdk.origin !== location.origin) throw Error('Select a same-origin SDK');
    const m = await import(sdk.href),
        g = m.gfx;
    const renderer = query.get('renderer') || 'webgl2';
    const canvas = document.querySelector('canvas');
    const app = await m.createAirApp({
        canvas,
        renderer,
        screenMode: 'container',
        container: '#stage',
        pixelRatioCap: 1,
    });
    const device = m.director.root.device;
    const shaderSources = [];
    window.__mrtShaderSources = shaderSources;
    const compiler = renderer === 'webgpu' ? device.glslang : null,
        originalCompile = compiler?.compileGLSL;
    if (compiler)
        compiler.compileGLSL = function (source, stage, ...args) {
            shaderSources.push({ source, stage });
            if (shaderSources.length > 12) shaderSources.shift();
            return originalCompile.call(this, source, stage, ...args);
        };
    const samplerBase = Math.max(1, device.bindingMappingInfo.maxBlockCounts[0]);
    const scene = new m.Scene('MRT attachment probe'),
        cameraNode = new m.Node('display camera');
    scene.addChild(cameraNode);
    const camera = cameraNode.addComponent(m.Camera);
    camera.clearFlags = m.Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new m.Color(0, 0, 0, 255);
    let resources = null,
        size = 64,
        channel = 0,
        overlay = false,
        frames = 0,
        cycles = 0,
        error = null,
        lastRelease = null;
    const vertex = `precision highp float;precision highp int;void main(){vec2 p=vec2((${renderer === 'webgpu' ? 'gl_VertexIndex' : 'gl_VertexID'}<<1)&2,${renderer === 'webgpu' ? 'gl_VertexIndex' : 'gl_VertexID'}&2);gl_Position=vec4(p*2.0-1.0,0,1);}`;
    const block = 'layout(set=0,binding=0) uniform Parameters { vec4 params; };';
    const stages = (fragment) => [
        new g.ShaderStage(g.ShaderStageFlagBit.VERTEX, vertex),
        new g.ShaderStage(
            g.ShaderStageFlagBit.FRAGMENT,
            'precision highp float;precision highp int;' +
                (renderer === 'webgl2'
                    ? (block + fragment).replace(/layout\(set=\d+,binding=\d+\)/g, '')
                    : block + fragment),
        ),
    ];
    const half = (bits) => {
        const sign = bits & 0x8000 ? -1 : 1,
            exponent = (bits >> 10) & 31,
            mantissa = bits & 1023;
        return (
            sign *
            (exponent
                ? exponent === 31
                    ? Infinity
                    : (1 + mantissa / 1024) * 2 ** (exponent - 15)
                : mantissa * 2 ** -24)
        );
    };
    function allocate() {
        const owned = [],
            own = (value) => (owned.push(value), value);
        const target = m.createAirMRTTarget({
            name: 'MRT lab',
            width: size,
            height: size,
            colorAttachments: [{ format: g.Format.RGBA16F }, { format: g.Format.RG16F }, { format: g.Format.R32UI }],
        });
        try {
            const bindings = [0, 1, 2].map(
                (index) =>
                    new g.DescriptorSetLayoutBinding(
                        samplerBase + index,
                        g.DescriptorType.SAMPLER_TEXTURE,
                        1,
                        g.ShaderStageFlagBit.FRAGMENT,
                        g.MemoryAccessBit.READ_ONLY,
                        g.ViewDimension.TEX2D,
                        index === 2 ? g.SampleType.UINT : g.SampleType.FLOAT,
                    ),
            );
            bindings.unshift(
                new g.DescriptorSetLayoutBinding(0, g.DescriptorType.UNIFORM_BUFFER, 1, g.ShaderStageFlagBit.FRAGMENT),
            );
            const setLayout = own(device.createDescriptorSetLayout(new g.DescriptorSetLayoutInfo(bindings)));
            const layout = own(device.createPipelineLayout(new g.PipelineLayoutInfo([setLayout])));
            const uniformLayout = own(
                device.createDescriptorSetLayout(
                    new g.DescriptorSetLayoutInfo([
                        new g.DescriptorSetLayoutBinding(
                            0,
                            g.DescriptorType.UNIFORM_BUFFER,
                            1,
                            g.ShaderStageFlagBit.FRAGMENT,
                        ),
                    ]),
                ),
            );
            const writerLayout = own(device.createPipelineLayout(new g.PipelineLayoutInfo([uniformLayout])));
            const writerSet = own(device.createDescriptorSet(new g.DescriptorSetInfo(uniformLayout))),
                displaySet = own(device.createDescriptorSet(new g.DescriptorSetInfo(setLayout)));
            const makeBuffer = () =>
                own(
                    device.createBuffer(
                        new g.BufferInfo(
                            g.BufferUsageBit.UNIFORM | g.BufferUsageBit.TRANSFER_DST,
                            g.MemoryUsageBit.HOST | g.MemoryUsageBit.DEVICE,
                            16,
                            16,
                        ),
                    ),
                );
            const writerBuffer = makeBuffer(),
                displayBuffer = makeBuffer();
            writerSet.bindBuffer(0, writerBuffer);
            displaySet.bindBuffer(0, displayBuffer);
            const vertexBuffer = own(
                device.createBuffer(new g.BufferInfo(g.BufferUsageBit.VERTEX, g.MemoryUsageBit.DEVICE, 12, 4)),
            );
            vertexBuffer.update(new Float32Array([0, 0, 0]));
            const assembler = own(device.createInputAssembler(new g.InputAssemblerInfo([], [vertexBuffer])));
            assembler.vertexCount = 3;
            const shader = (name, fragment, sampled = false) => {
                const info = new g.ShaderInfo(name, stages(fragment));
                info.blocks = [new g.UniformBlock(0, 0, 'Parameters', [new g.Uniform('params', g.Type.FLOAT4, 1)], 1)];
                if (sampled)
                    info.samplerTextures = ['colors', 'velocities', 'identities'].map(
                        (name, index) =>
                            new g.UniformSamplerTexture(0, samplerBase + index, name, g.Type.SAMPLER2D, 1, index),
                    );
                return own(device.createShader(info));
            };
            const writer = shader(
                'mrt-lab-all',
                'layout(location=0) out vec4 color;layout(location=1) out vec2 velocity;layout(location=2) out uint identity;void main(){vec2 uv=gl_FragCoord.xy/params.xy;color=vec4(uv.x,uv.y*0.75,0.9,1);velocity=uv*vec2(0.25,0.5);uvec2 cell=uvec2(floor(uv*4.0));identity=16777217u+cell.x+cell.y*4u;}',
            );
            const colorOnly = shader(
                'mrt-lab-color-only',
                'layout(location=0) out vec4 color;void main(){color=vec4(1,0,0,0.5+params.w);}',
            );
            const display = shader(
                'mrt-lab-display',
                'layout(set=0,binding=1) uniform sampler2D colors;layout(set=0,binding=2) uniform sampler2D velocities;layout(set=0,binding=3) uniform highp usampler2D identities;layout(location=0) out vec4 color;void main(){vec2 uv=gl_FragCoord.xy/params.zw;if(params.x<0.5)color=texture(colors,uv);else if(params.x<1.5)color=vec4(texture(velocities,uv).xy,0.1,1);else{uint id=texelFetch(identities,ivec2(uv*vec2(textureSize(identities,0))),0).r;uint n=id*1664525u+1013904223u;color=vec4(vec3(float(n&255u),float((n>>8u)&255u),float((n>>16u)&255u))/255.0,1);}}'
                    .replace(/binding=(\d+)\)/g, (_, binding) => `binding=${samplerBase + Number(binding) - 1})`)
                    .replace('if(params.x<0.5)', (renderer === 'webgpu' ? 'uv.y=1.0-uv.y;' : '') + 'if(params.x<0.5)'),
                true,
            );
            const pipeline = (shader, pass, blend = false) => {
                const info = new g.PipelineStateInfo();
                Object.assign(info, {
                    shader,
                    pipelineLayout: shader === display ? layout : writerLayout,
                    renderPass: pass,
                });
                info.rasterizerState.cullMode = g.CullMode.NONE;
                info.depthStencilState.depthTest = info.depthStencilState.depthWrite = false;
                if (blend) {
                    const t = info.blendState.targets[0];
                    t.blend = true;
                    t.blendSrc = g.BlendFactor.SRC_ALPHA;
                    t.blendDst = g.BlendFactor.ONE_MINUS_SRC_ALPHA;
                    t.blendSrcAlpha = g.BlendFactor.ONE;
                    t.blendDstAlpha = g.BlendFactor.ONE_MINUS_SRC_ALPHA;
                }
                return own(device.createPipelineState(info));
            };
            const writerPSO = pipeline(writer, target.renderPass),
                overlayPSO = pipeline(colorOnly, target.renderPass, true),
                displayPSO = pipeline(display, m.director.root.mainWindow.framebuffer.renderPass);
            const command = own(device.createCommandBuffer(new g.CommandBufferInfo(device.queue))),
                sampler = device.getSampler(
                    new g.SamplerInfo(
                        g.Filter.POINT,
                        g.Filter.POINT,
                        g.Filter.NONE,
                        g.Address.CLAMP,
                        g.Address.CLAMP,
                        g.Address.CLAMP,
                    ),
                );
            const result = {
                target,
                owned,
                writerSet,
                displaySet,
                writerBuffer,
                displayBuffer,
                writerPSO,
                overlayPSO,
                displayPSO,
                command,
                assembler,
                sampler,
            };
            result.refreshPass = () => {
                for (const [key, shader, blend] of [
                    ['writerPSO', writer, false],
                    ['overlayPSO', colorOnly, true],
                ]) {
                    const old = result[key];
                    owned.splice(owned.indexOf(old), 1);
                    old.destroy();
                    result[key] = pipeline(shader, target.renderPass, blend);
                }
            };
            return result;
        } catch (cause) {
            for (const value of owned.reverse()) value.destroy();
            target.dispose();
            throw cause;
        }
    }
    function draw() {
        if (!resources || error) return;
        const r = resources,
            info = r.target.info;
        r.writerBuffer.update(new Float32Array([info.width, info.height, 0, 0]));
        r.displayBuffer.update(new Float32Array([channel, 0, canvas.width, canvas.height]));
        for (let i = 0; i < 3; ++i) {
            r.displaySet.bindTexture(samplerBase + i, r.target.textures[i]);
            r.displaySet.bindSampler(samplerBase + i, r.sampler);
        }
        r.writerSet.update();
        r.displaySet.update();
        const issue = (pso, set) => {
            r.command.bindPipelineState(pso);
            r.command.bindDescriptorSet(0, set);
            r.command.bindInputAssembler(r.assembler);
            r.command.draw(r.assembler);
        };
        r.command.begin();
        r.target.beginPass(r.command);
        try {
            issue(r.writerPSO, r.writerSet);
        } finally {
            r.target.endPass(r.command);
        }
        if (overlay) {
            r.target.beginPass(r.command, { clear: false });
            try {
                issue(r.overlayPSO, r.writerSet);
            } finally {
                r.target.endPass(r.command);
            }
        }
        const framebuffer = m.director.root.mainWindow.framebuffer;
        r.command.beginRenderPass(
            framebuffer.renderPass,
            framebuffer,
            new g.Rect(0, 0, canvas.width, canvas.height),
            [new g.Color(0, 0, 0, 1)],
            1,
            0,
        );
        try {
            issue(r.displayPSO, r.displaySet);
        } finally {
            r.command.endRenderPass();
        }
        r.command.end();
        device.queue.submit([r.command]);
        ++frames;
        status.textContent = `${renderer} · ${info.width}×${info.height} · generation ${info.generation}\nRGBA16F + RG16F + R32UI · ID starts at 16777217\n${overlay ? 'Color-only blend ON; other attachments preserved' : 'Base pass'} · frame ${frames}`;
    }
    function dispose() {
        if (!resources) return lastRelease;
        const r = resources;
        resources = null;
        const handles = renderer === 'webgl2' ? r.target.textures.map((texture) => texture.gpuTexture.glTexture) : [];
        const nativeDestroyCounts = [];
        if (renderer === 'webgpu')
            for (const texture of r.target.textures) {
                const handle = texture.gpuTexture.gpuTexture,
                    original = handle.destroy,
                    index = nativeDestroyCounts.length;
                nativeDestroyCounts.push(0);
                handle.destroy = function () {
                    ++nativeDestroyCounts[index];
                    return original.call(this);
                };
            }
        for (const value of r.owned.reverse()) value.destroy();
        r.target.dispose();
        r.target.dispose();
        lastRelease = {
            ownedObjects: r.owned.length,
            nativeTexturesDeleted:
                renderer === 'webgl2' ? handles.every((handle) => !device.gl.isTexture(handle)) : null,
            samplerPreserved: !!r.sampler.gpuSampler,
            nativeDestroyCounts,
        };
        status.textContent = 'RELEASED · 点击重新创建';
        for (const id of ['channel', 'overlay', 'resize', 'dispose']) document.getElementById(id).disabled = true;
        return lastRelease;
    }
    function rebuild() {
        dispose();
        error = null;
        resources = allocate();
        ++cycles;
        for (const id of ['channel', 'overlay', 'resize', 'dispose']) document.getElementById(id).disabled = false;
    }
    async function read() {
        if (!resources) throw Error('Disposed');
        const region = new g.BufferTextureCopy();
        region.texExtent.width = region.texExtent.height = 1;
        const arrays = [new Uint16Array(4), new Uint16Array(2), new Uint32Array(1)];
        for (let i = 0; i < 3; ++i) {
            if (renderer === 'webgpu')
                await device.copyTextureToBuffersAsync(resources.target.textures[i], [arrays[i]], [region]);
            else device.copyTextureToBuffers(resources.target.textures[i], [arrays[i]], [region]);
        }
        return { color: Array.from(arrays[0], half), velocity: Array.from(arrays[1], half), id: arrays[2][0] };
    }
    document.querySelector('#channel').addEventListener('change', (event) => (channel = Number(event.target.value)));
    document.querySelector('#overlay').addEventListener('change', (event) => (overlay = event.target.checked));
    document.querySelector('#resize').addEventListener('click', () => {
        size = size === 64 ? 128 : 64;
        resources?.target.resize(size, size);
        resources?.refreshPass();
    });
    document.querySelector('#dispose').addEventListener('click', dispose);
    document.querySelector('#rebuild').addEventListener('click', rebuild);
    const captureClock = query.get('capture') === '1' ? m.createStepClock() : null;
    if (captureClock) window.__mrtClock = captureClock;
    const render = () => {
        try {
            draw();
            if (captureClock && frames === 1) captureClock.begin();
        } catch (cause) {
            error = failure(cause);
            status.textContent = 'FAIL · ' + error;
        }
    };
    rebuild();
    m.director.on(m.Director.EVENT_AFTER_DRAW, render);
    app.run(scene);
    window.__mrtLab = {
        get ready() {
            return frames > 0;
        },
        get state() {
            return {
                frames,
                cycles,
                size,
                channel,
                overlay,
                error,
                resources: resources?.owned.length || 0,
                generation: resources?.target.info.generation || 0,
                lastRelease,
                renderer,
            };
        },
        read,
        async close() {
            m.director.off(m.Director.EVENT_AFTER_DRAW, render);
            dispose();
            await app.close();
            if (compiler) compiler.compileGLSL = originalCompile;
        },
    };
}
boot().catch((error) => {
    status.textContent = 'FAIL · ' + failure(error);
    window.__mrtLab = { state: { error: failure(error) } };
});
