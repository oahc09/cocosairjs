/* Focused native WebGPU texture lifetime regression. Writes only a new --out directory.
 * --bundle selects a built SDK; no canonical evidence or default build is overwritten.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const { serveStaticFile } = require('./static-file-response.cjs');
const root = path.resolve(__dirname, '../..');
const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')));
assert.ok(!args.renderer || ['webgl2', 'webgpu'].includes(args.renderer), 'renderer must be webgl2 or webgpu');
assert.ok(
    !args['readback-race'] || ['resize', 'close', 'view', 'loss'].includes(args['readback-race']),
    'unknown readback race',
);
assert.ok(
    !args['asset-terminal'] || ['loss', 'abort', 'restored'].includes(args['asset-terminal']),
    'unknown asset terminal case',
);
assert.ok(args['asset-terminal'] !== 'restored' || args.renderer === 'webgl2', 'restored case requires WebGL2');
assert.ok(args.out, '--out=<new directory> required');
const out = path.resolve(root, args.out);
assert.ok(!fs.existsSync(out), 'retain previous attempts; choose a new --out');
fs.mkdirSync(out, { recursive: true });
const bundle = path.resolve(root, args.bundle || 'build/cocosair.module.js');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const { PNG } = require('pngjs');
const imageFixture = new PNG({ width: 1, height: 1 });
imageFixture.data.set([37, 89, 143, 255]);
const imageBytes = PNG.sync.write(imageFixture);
const inputs = [
    bundle,
    __filename,
    'src/cocos/gfx/webgpu/webgpu-commands.ts',
    'src/cocos/gfx/webgpu/webgpu-command-buffer.ts',
    'src/cocos/gfx/webgpu/webgpu-device.ts',
    'src/cocos/gfx/webgpu/webgpu-descriptor-set.ts',
    'src/air/rendering/webgpu-resource-lifetime.ts',
    'src/air/rendering/webgl2-context-health.ts',
    'src/cocos/gfx/webgl2/webgl2-commands.ts',
    'src/cocos/gfx/webgl2/webgl2-device.ts',
    'src/air/context-health.ts',
    'src/air/assets/gltf/loader.ts',
    'src/air/assets/gltf/material.ts',
    'src/air/assets/gltf/parser-context.ts',
    'src/air/assets/gltf/request-policy.ts',
    'tools/verify/webgpu-resource-contracts.cjs',
]
    .map((file) => path.resolve(root, file))
    .filter((file) => fs.existsSync(file));
const report = {
    completed: false,
    subset: true,
    scope: 'focused GFX texture lifetime and ordinary WebGL2 regression; not full release acceptance',
    errors: [],
    fingerprints: Object.fromEntries(inputs.map((file) => [path.relative(root, file).replace(/\\/g, '/'), hash(file)])),
};
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end('<!doctype html><canvas id="GameCanvas" width="320" height="240"></canvas>');
        return;
    }
    if (url.pathname === '/favicon.ico') return res.writeHead(204).end();
    if (url.pathname === '/probe.png') {
        res.setHeader('Content-Type', 'image/png');
        res.end(imageBytes);
        return;
    }
    const relative = url.pathname.startsWith('/build/') ? url.pathname.slice('/build/'.length) : '';
    const file = path.resolve(path.dirname(bundle), relative);
    if (!relative || !file.startsWith(path.dirname(bundle) + path.sep) || !fs.existsSync(file))
        return res.writeHead(404).end();
    return serveStaticFile(req, res, file, file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
});
async function contracts() {
    const m = await import('/build/cocosair.module.js');
    const app = await m.createAirApp({ canvas: '#GameCanvas', renderer: 'webgpu' });
    const g = m.gfx;
    const device = m.director.root.device;
    const clock = m.createStepClock();
    clock.begin();
    const native = device.nativeDevice;
    const owned = [];
    const own = (resource) => (owned.push(resource), resource);
    const originalDestroy = GPUTexture.prototype.destroy;
    const destroys = new WeakMap();
    GPUTexture.prototype.destroy = function () {
        destroys.set(this, (destroys.get(this) || 0) + 1);
        return originalDestroy.call(this);
    };
    const result = { backend: device.gfxAPI, expectedBackend: g.API.WEBGPU, renderer: device.renderer, cases: [] };
    const check = (condition, message) => {
        if (!condition) throw Error(message);
    };
    try {
        const texture = (size = 64) =>
            own(
                device.createTexture(
                    new g.TextureInfo(
                        g.TextureType.TEX2D,
                        g.TextureUsageBit.SAMPLED |
                            g.TextureUsageBit.TRANSFER_SRC |
                            g.TextureUsageBit.TRANSFER_DST |
                            g.TextureUsageBit.COLOR_ATTACHMENT,
                        g.Format.RGBA8,
                        size,
                        size,
                    ),
                ),
            );
        const region = (size) => {
            const value = new g.BufferTextureCopy();
            value.texExtent.width = value.texExtent.height = size;
            return value;
        };
        const upload = (target, color) => {
            const bytes = new Uint8Array(target.width * target.height * 4);
            for (let i = 0; i < bytes.length; i += 4) bytes.set(color, i);
            device.copyBuffersToTexture([bytes], target, [region(target.width)]);
        };
        const pass = own(device.createRenderPass(new g.RenderPassInfo([new g.ColorAttachment(g.Format.RGBA8)])));
        const output = texture(4);
        const framebuffer = own(device.createFramebuffer(new g.FramebufferInfo(pass, [output])));
        const binding = new g.DescriptorSetLayoutBinding(
            0,
            g.DescriptorType.SAMPLER_TEXTURE,
            1,
            g.ShaderStageFlagBit.FRAGMENT,
        );
        binding.viewDimension = g.ViewDimension.TEX2D;
        const layout = own(device.createDescriptorSetLayout(new g.DescriptorSetLayoutInfo([binding])));
        const pipelineLayout = own(device.createPipelineLayout(new g.PipelineLayoutInfo([layout])));
        const shaderInfo = new g.ShaderInfo('texture-retirement', [
            new g.ShaderStage(
                g.ShaderStageFlagBit.VERTEX,
                'layout(location=0) out vec2 uv; void main(){vec2 p=vec2((gl_VertexIndex<<1)&2,gl_VertexIndex&2); uv=p; gl_Position=vec4(p*2.0-1.0,0.0,1.0);}',
            ),
            new g.ShaderStage(
                g.ShaderStageFlagBit.FRAGMENT,
                'layout(location=0) in vec2 uv; layout(location=0) out vec4 color; layout(set=0,binding=0) uniform sampler2D image; void main(){color=texture(image,uv);}',
            ),
        ]);
        shaderInfo.samplerTextures.push(new g.UniformSamplerTexture(0, 0, 'image', g.Type.SAMPLER2D, 1));
        const pipelineInfo = new g.PipelineStateInfo();
        pipelineInfo.shader = own(device.createShader(shaderInfo));
        pipelineInfo.pipelineLayout = pipelineLayout;
        pipelineInfo.renderPass = pass;
        pipelineInfo.rasterizerState.cullMode = g.CullMode.NONE;
        pipelineInfo.depthStencilState.depthTest = pipelineInfo.depthStencilState.depthWrite = false;
        const pipeline = own(device.createPipelineState(pipelineInfo));
        const descriptor = own(device.createDescriptorSet(new g.DescriptorSetInfo(layout)));
        descriptor.bindSampler(0, device.getSampler(new g.SamplerInfo()));
        const vertices = own(
            device.createBuffer(new g.BufferInfo(g.BufferUsageBit.VERTEX, g.MemoryUsageBit.DEVICE, 12, 4)),
        );
        const assembler = own(device.createInputAssembler(new g.InputAssemblerInfo([], [vertices])));
        assembler.vertexCount = 3;
        const encode = (source, filter = g.Filter.LINEAR) => {
            const command = own(device.createCommandBuffer(new g.CommandBufferInfo(device.queue)));
            descriptor.bindTexture(0, source);
            descriptor.bindSampler(0, device.getSampler(new g.SamplerInfo(filter, filter)));
            descriptor.update();
            command.begin();
            command.beginRenderPass(pass, framebuffer, new g.Rect(0, 0, 4, 4), [new g.Color(0, 0, 0, 1)], 1, 0);
            command.bindPipelineState(pipeline);
            command.bindDescriptorSet(0, descriptor);
            command.bindInputAssembler(assembler);
            command.draw(assembler);
            return command;
        };
        const finish = async (command, expected) => {
            command.endRenderPass();
            command.end();
            device.queue.submit([command]);
            const bytes = new Uint8Array(64);
            await device.copyTextureToBuffersAsync(output, [bytes], [region(4)]);
            const pixel = [...bytes.slice(0, 4)];
            check(
                pixel.every((value, i) => value === expected[i]),
                `Expected ${expected}, got ${pixel}`,
            );
            return pixel;
        };
        const blue = [0, 0, 255, 255],
            red = [255, 0, 0, 255];
        const source = texture();
        upload(source, blue);
        const first = encode(source);
        const old = source.gpuTexture.gpuTexture;
        source.resize(128, 128);
        upload(source, red);
        const destroyedBeforeSubmit = destroys.get(old) || 0;
        const oldPixel = await finish(first, blue);
        check(!destroyedBeforeSubmit, 'resize destroyed a texture retained by an unsubmitted GFX draw');
        check(destroys.get(old) === 1, 'old texture must be released once after its last pending submission');
        const newPixel = await finish(encode(source), red);
        result.cases.push({ name: 'resize-before-submit', oldPixel, newPixel, oldDestroyCount: destroys.get(old) });

        upload(source, blue);
        const a = encode(source),
            b = encode(source, g.Filter.POINT);
        const shared = source.gpuTexture.gpuTexture;
        source.resize(64, 64);
        upload(source, red);
        await finish(b, blue);
        check(!destroys.get(shared), 'one command submission released another pending command texture');
        await finish(a, blue);
        check(destroys.get(shared) === 1, 'shared old resource must be released exactly once');
        await finish(encode(source), red);
        result.cases.push({ name: 'two-command-buffers-share-old-resource', oldDestroyCount: destroys.get(shared) });

        const storage = own(
            device.createTexture(
                new g.TextureInfo(
                    g.TextureType.TEX2D,
                    g.TextureUsageBit.STORAGE |
                        g.TextureUsageBit.SAMPLED |
                        g.TextureUsageBit.TRANSFER_SRC |
                        g.TextureUsageBit.TRANSFER_DST,
                    g.Format.RGBA8,
                    4,
                    4,
                ),
            ),
        );
        upload(storage, blue);
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
        const computeInfo = new g.PipelineStateInfo();
        computeInfo.pipelineLayout = own(device.createPipelineLayout(new g.PipelineLayoutInfo([imageLayout])));
        computeInfo.bindPoint = g.PipelineBindPoint.COMPUTE;
        computeInfo.shader = own(
            device.createShader(
                new g.ShaderInfo('texture-retirement-compute', [
                    new g.ShaderStage(
                        g.ShaderStageFlagBit.COMPUTE,
                        'layout(local_size_x=1,local_size_y=1,local_size_z=1) in; layout(set=0,binding=0,rgba8) writeonly uniform image2D outputImage; void main(){imageStore(outputImage,ivec2(gl_GlobalInvocationID.xy),vec4(0,1,0,1));}',
                    ),
                ]),
            ),
        );
        const computePipeline = own(device.createPipelineState(computeInfo));
        const computeSet = own(device.createDescriptorSet(new g.DescriptorSetInfo(imageLayout)));
        computeSet.bindTexture(0, storage);
        computeSet.update();
        const compute = own(device.createCommandBuffer(new g.CommandBufferInfo(device.queue)));
        compute.begin();
        compute.bindPipelineState(computePipeline);
        compute.bindDescriptorSet(0, computeSet);
        compute.dispatch(new g.DispatchInfo(4, 4, 1));
        const sampled = encode(storage),
            computed = storage.gpuTexture.gpuTexture;
        storage.resize(8, 8);
        upload(storage, red);
        compute.end();
        check(!destroys.get(computed), 'compute submission must preserve an outstanding sampled use');
        await finish(sampled, [0, 255, 0, 255]);
        check(destroys.get(computed) === 1, 'compute/render replacement must release the old texture once');
        await finish(encode(storage), red);
        result.cases.push({
            name: 'compute-render-retain-old-storage-texture',
            oldDestroyCount: destroys.get(computed),
        });

        const msaaInfo = new g.TextureInfo(
            g.TextureType.TEX2D,
            g.TextureUsageBit.COLOR_ATTACHMENT | g.TextureUsageBit.SAMPLED | g.TextureUsageBit.TRANSFER_SRC,
            g.Format.RGBA8,
            4,
            4,
        );
        msaaInfo.samples = g.SampleCount.X4;
        const msaa = own(device.createTexture(msaaInfo));
        const attachment = new g.ColorAttachment(g.Format.RGBA8);
        attachment.sampleCount = g.SampleCount.X4;
        const msaaPass = own(device.createRenderPass(new g.RenderPassInfo([attachment])));
        const msaaFramebuffer = own(device.createFramebuffer(new g.FramebufferInfo(msaaPass, [msaa])));
        const clearing = own(device.createCommandBuffer(new g.CommandBufferInfo(device.queue)));
        clearing.begin();
        clearing.beginRenderPass(msaaPass, msaaFramebuffer, new g.Rect(0, 0, 4, 4), [new g.Color(0, 0, 1, 1)], 1, 0);
        const readingResolve = encode(msaa);
        const oldSamples = msaa.gpuTexture.gpuTexture,
            oldResolve = msaa.gpuTexture.resolveTex.gpuTexture;
        msaa.resize(8, 8);
        clearing.endRenderPass();
        clearing.end();
        check(
            !destroys.get(oldSamples) && !destroys.get(oldResolve),
            'MSAA allocations retired before the pending resolve reader',
        );
        await finish(readingResolve, blue);
        check(
            destroys.get(oldSamples) === 1 && destroys.get(oldResolve) === 1,
            'MSAA samples and resolve allocations must retire once',
        );
        result.cases.push({
            name: 'msaa-resize-pending-resolve',
            samplesDestroyed: destroys.get(oldSamples),
            resolveDestroyed: destroys.get(oldResolve),
        });

        const pending = encode(source),
            abandoned = source.gpuTexture.gpuTexture;
        source.resize(128, 128);
        pending.destroy();
        check(destroys.get(abandoned) === 1, 'abandoning a command must release its retained old texture');
        result.cases.push({ name: 'abandon-before-submit', oldDestroyCount: destroys.get(abandoned) });

        upload(source, blue);
        const faulted = encode(source),
            faultedTexture = source.gpuTexture.gpuTexture;
        source.resize(64, 64);
        const originalSubmit = GPUQueue.prototype.submit;
        let rejected = false;
        try {
            GPUQueue.prototype.submit = function () {
                throw Error('injected synchronous submit failure');
            };
            faulted.endRenderPass();
        } catch (error) {
            rejected = error.message === 'injected synchronous submit failure';
        } finally {
            GPUQueue.prototype.submit = originalSubmit;
        }
        check(
            rejected && destroys.get(faultedTexture) === 1,
            'failed submission must abandon its retained allocations',
        );
        faulted.end();
        upload(source, red);
        await finish(encode(source), red);
        result.cases.push({
            name: 'submission-exception-releases-retired-texture',
            oldDestroyCount: destroys.get(faultedTexture),
        });

        const logicalBytesBefore = device.memoryStatus.textureSize;
        for (let i = 0; i < 30; ++i) {
            upload(source, blue);
            const command = encode(source),
                oldAllocation = source.gpuTexture.gpuTexture;
            source.resize(i % 2 ? 64 : 128, i % 2 ? 64 : 128);
            upload(source, red);
            await finish(command, blue);
            check(destroys.get(oldAllocation) === 1, 'resize cycle retained or double-destroyed an old allocation');
            await finish(encode(source), red);
        }
        check(device.memoryStatus.textureSize === logicalBytesBefore, 'logical owned texture bytes did not converge');
        result.cases.push({
            name: 'thirty-resize-cycles',
            cycles: 30,
            logicalBytesBefore,
            logicalBytesAfter: device.memoryStatus.textureSize,
            caveat: 'logical GFX allocations and native destroy calls, not physical GPU resident-memory measurement',
        });

        upload(source, blue);
        const last = encode(source),
            destroyed = source.gpuTexture.gpuTexture;
        source.destroy();
        check(!destroys.get(destroyed), 'destroy released a pending draw texture');
        await finish(last, blue);
        check(destroys.get(destroyed) === 1, 'destroyed owner must release its old native texture once');
        result.cases.push({ name: 'destroy-before-submit', oldDestroyCount: destroys.get(destroyed) });
        await native.queue.onSubmittedWorkDone();
        const lossSource = texture(4);
        upload(lossSource, blue);
        const lostCommand = encode(lossSource),
            lostTexture = lossSource.gpuTexture.gpuTexture;
        lossSource.resize(8, 8);
        native.destroy();
        await native.lost;
        let lossRejected = false;
        try {
            lostCommand.endRenderPass();
        } catch (error) {
            lossRejected = error.message === 'WEBGPU_DEVICE_LOST';
        }
        check(
            lossRejected && destroys.get(lostTexture) === 1,
            'device loss must release retained textures and reject deferred submit',
        );
        check(
            app.contextHealth.snapshot().state === 'failed',
            'device loss must retain the public controlled-reload contract',
        );
        result.cases.push({ name: 'device-loss-drains-pending-textures', oldDestroyCount: destroys.get(lostTexture) });
        return result;
    } finally {
        try {
            for (const resource of owned.reverse()) resource.destroy();
        } finally {
            GPUTexture.prototype.destroy = originalDestroy;
            clock.end();
            await app.close();
        }
    }
}
async function webgl2Regression() {
    const m = await import('/build/cocosair.module.js');
    const app = await m.createAirApp({ canvas: '#GameCanvas', renderer: 'webgl2' });
    const g = m.gfx,
        device = m.director.root.device;
    const clock = m.createStepClock();
    clock.begin();
    const texture = device.createTexture(
        new g.TextureInfo(
            g.TextureType.TEX2D,
            g.TextureUsageBit.SAMPLED |
                g.TextureUsageBit.COLOR_ATTACHMENT |
                g.TextureUsageBit.TRANSFER_SRC |
                g.TextureUsageBit.TRANSFER_DST,
            g.Format.RGBA8,
            4,
            4,
        ),
    );
    const result = { backend: device.gfxAPI, expectedBackend: g.API.WEBGL2, renderer: device.renderer, cases: [] };
    try {
        for (const size of [4, 8, 4]) {
            texture.resize(size, size);
            const region = new g.BufferTextureCopy();
            region.texExtent.width = region.texExtent.height = size;
            const bytes = new Uint8Array(size * size * 4);
            for (let i = 0; i < bytes.length; i += 4) bytes.set([37, 89, 143, 255], i);
            device.copyBuffersToTexture([bytes], texture, [region]);
            const output = new Uint8Array(bytes.length);
            device.copyTextureToBuffers(texture, [output], [region]);
            if (!bytes.every((value, index) => value === output[index]))
                throw Error('WebGL2 resize/upload/readback changed');
            result.cases.push({ name: 'ordinary-webgl2-resize-upload-readback', size, pixel: [...output.slice(0, 4)] });
        }
        const error = device.gl.getError();
        if (error !== device.gl.NO_ERROR) throw Error(`WebGL2 error ${error}`);
        return result;
    } finally {
        texture.destroy();
        clock.end();
        await app.close();
    }
}
async function initializationLoss() {
    const m = await import('/build/cocosair.module.js');
    const originalRequest = GPUAdapter.prototype.requestDevice;
    const originalFetch = window.fetch;
    const factories = ['createTexture', 'createBuffer', 'createBindGroup'];
    const originals = new Map(factories.map((name) => [name, GPUDevice.prototype[name]]));
    let native,
        injected = false,
        allocationsAfterLoss = 0,
        app,
        rejection;
    GPUAdapter.prototype.requestDevice = async function (...args) {
        native = await originalRequest.apply(this, args);
        return native;
    };
    for (const name of factories) {
        GPUDevice.prototype[name] = function (...args) {
            if (injected && this === native) allocationsAfterLoss++;
            return originals.get(name).apply(this, args);
        };
    }
    window.fetch = async function (input, ...args) {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (native && !injected && /\/webgpu\/.*\.wasm(?:\?|$)/.test(url)) {
            injected = true;
            native.destroy();
            await native.lost;
        }
        return originalFetch.call(this, input, ...args);
    };
    try {
        try {
            app = await m.createAirApp({ canvas: '#GameCanvas', renderer: 'webgpu' });
        } catch (error) {
            rejection = { code: error.code, message: error.message };
        }
        if (!injected) throw Error('No native device loss injected during translator loading');
        if (app || rejection?.code !== 'WEBGPU_DEVICE_LOST' || allocationsAfterLoss !== 0)
            throw Error(JSON.stringify({ initialized: !!app, rejection, allocationsAfterLoss }));
        return {
            backend: m.gfx.API.WEBGPU,
            expectedBackend: m.gfx.API.WEBGPU,
            cases: [{ name: 'device-loss-during-translator-load', injected, rejection, allocationsAfterLoss }],
        };
    } finally {
        GPUAdapter.prototype.requestDevice = originalRequest;
        window.fetch = originalFetch;
        for (const [name, original] of originals) GPUDevice.prototype[name] = original;
        if (app) await app.close();
        native?.destroy();
    }
}
async function readbackRace(mode) {
    const m = await import('/build/cocosair.module.js');
    const app = await m.createAirApp({ canvas: '#GameCanvas', renderer: 'webgpu' });
    const g = m.gfx,
        device = m.director.root.device;
    const clock = m.createStepClock();
    clock.begin();
    let texture = device.createTexture(
        new g.TextureInfo(
            g.TextureType.TEX2D,
            g.TextureUsageBit.SAMPLED | g.TextureUsageBit.TRANSFER_SRC | g.TextureUsageBit.TRANSFER_DST,
            g.Format.RGBA8,
            4,
            4,
        ),
    );
    app.session.own(() => texture.destroy(), 'readback source');
    if (mode === 'view') {
        const parent = texture;
        app.session.own(() => parent.destroy(), 'readback view parent');
        const viewInfo = new g.TextureViewInfo();
        viewInfo.texture = parent;
        viewInfo.type = g.TextureType.TEX2D;
        viewInfo.format = g.Format.RGBA8;
        viewInfo.levelCount = viewInfo.layerCount = 1;
        texture = device.createTexture(viewInfo);
    }
    const upload = (color) => {
        const bytes = new Uint8Array(texture.width * texture.height * 4);
        for (let i = 0; i < bytes.length; i += 4) bytes.set(color, i);
        const region = new g.BufferTextureCopy();
        region.texExtent.width = region.texExtent.height = texture.width;
        device.copyBuffersToTexture([bytes], texture, [region]);
    };
    upload([0, 0, 255, 255]);
    const regions = [0, 2].map((x) => {
        const region = new g.BufferTextureCopy();
        region.texOffset.x = x;
        region.texExtent.width = region.texExtent.height = 2;
        return region;
    });
    const buffers = [new Uint8Array(16).fill(77), new Uint8Array(16).fill(77)];
    const originalMap = GPUBuffer.prototype.mapAsync;
    const originalBufferDestroy = GPUBuffer.prototype.destroy;
    const stagingDestructions = new Map();
    let resume, ready;
    const release = new Promise((resolve) => {
        resume = resolve;
    });
    const mapped = new Promise((resolve) => {
        ready = resolve;
    });
    GPUBuffer.prototype.mapAsync = async function (...args) {
        if (this.usage & GPUBufferUsage.MAP_READ) stagingDestructions.set(this, 0);
        const value = await originalMap.apply(this, args);
        if (this.usage & GPUBufferUsage.MAP_READ) {
            ready();
            await release;
        }
        return value;
    };
    GPUBuffer.prototype.destroy = function () {
        if (stagingDestructions.has(this)) stagingDestructions.set(this, stagingDestructions.get(this) + 1);
        return originalBufferDestroy.call(this);
    };
    try {
        const work = device.copyTextureToBuffersAsync(texture, buffers, regions).then(
            () => ({ status: 'fulfilled' }),
            (error) => ({ status: 'rejected', code: error.code, message: error.message, cause: error.cause?.message }),
        );
        await mapped;
        if (mode === 'resize') {
            texture.resize(8, 8);
            upload([255, 0, 0, 255]);
        } else if (mode === 'view') texture.destroy();
        else if (mode === 'loss') {
            const native = device.nativeDevice;
            native.destroy();
            await native.lost;
        } else await app.close();
        resume();
        const outcome = await work;
        const stagingDestroyCounts = [...stagingDestructions.values()];
        if (stagingDestroyCounts.length !== 2 || !stagingDestroyCounts.every((count) => count === 1))
            throw Error(JSON.stringify({ stagingDestroyCounts }));
        const pixels = buffers.map((buffer) => [...buffer.slice(0, 4)]);
        if (mode === 'resize') {
            if (
                outcome.status !== 'fulfilled' ||
                !buffers.every((b) => b.every((v, i) => v === [0, 0, 255, 255][i % 4]))
            )
                throw Error(JSON.stringify({ mode, outcome, pixels }));
        } else if (
            outcome.status !== 'rejected' ||
            !(
                mode === 'loss'
                    ? ['WEBGPU_DEVICE_LOST', 'WEBGPU_READBACK_ABORTED']
                    : ['WEBGPU_READBACK_TEXTURE_DESTROYED']
            ).includes(outcome.code) ||
            !buffers.every((b) => b.every((v) => v === 77))
        )
            throw Error(JSON.stringify({ mode, outcome, pixels }));
        if (mode === 'loss' && !outcome.cause) throw Error('Device-loss readback did not preserve its cause');
        if (mode === 'loss' && app.contextHealth.snapshot().state !== 'failed')
            throw Error('Device loss did not reach the public failed state');
        if (mode === 'close') {
            let releasedSourceError;
            try {
                await device.copyTextureToBuffersAsync(texture, buffers, regions);
            } catch (error) {
                releasedSourceError = error.code;
            }
            if (releasedSourceError !== 'WEBGPU_READBACK_TEXTURE_DESTROYED')
                throw Error(`Released source error: ${releasedSourceError}`);
            // app.close releases its owned source but deliberately retains the shared GFX
            // device. Actual native loss is a separate terminal condition.
            const native = device.nativeDevice;
            native.destroy();
            await native.lost;
            let readbackError, textureError;
            try {
                await device.copyTextureToBuffersAsync(texture, buffers, regions);
            } catch (error) {
                readbackError = error.code;
            }
            try {
                device.createTexture(
                    new g.TextureInfo(g.TextureType.TEX2D, g.TextureUsageBit.SAMPLED, g.Format.RGBA8, 1, 1),
                );
            } catch (error) {
                textureError = error.code;
            }
            if (readbackError !== 'WEBGPU_DEVICE_LOST' || textureError !== 'WEBGPU_DEVICE_LOST')
                throw Error(JSON.stringify({ readbackError, textureError }));
        }
        return {
            backend: device.gfxAPI,
            expectedBackend: g.API.WEBGPU,
            cases: [{ name: `readback-${mode}-during-map`, outcome, pixels, stagingDestroyCounts }],
        };
    } finally {
        resume();
        GPUBuffer.prototype.mapAsync = originalMap;
        GPUBuffer.prototype.destroy = originalBufferDestroy;
        clock.end();
        await app.close();
    }
}
async function assetTerminal(options) {
    const { mode, renderer } = options;
    const m = await import('/build/cocosair.module.js');
    const app = await m.createAirApp({ canvas: '#GameCanvas', renderer });
    const device = m.director.root.device,
        native = device.nativeDevice;
    const clock = m.createStepClock();
    clock.begin();
    const controller = new AbortController();
    const originalFetch = window.fetch,
        createURL = URL.createObjectURL,
        revokeURL = URL.revokeObjectURL;
    const liveURLs = new Set();
    let injected = false,
        asset,
        rejection;
    URL.createObjectURL = function (...args) {
        const url = createURL.apply(this, args);
        liveURLs.add(url);
        return url;
    };
    URL.revokeObjectURL = function (url) {
        liveURLs.delete(url);
        return revokeURL.call(this, url);
    };
    window.fetch = async function (input, ...args) {
        const response = await originalFetch.call(this, input, ...args);
        const url = typeof input === 'string' ? input : input.url;
        if (url.endsWith('/probe.png')) {
            injected = true;
            if (mode === 'abort') controller.abort();
            else if (renderer === 'webgpu') {
                native.destroy();
                await native.lost;
            } else {
                const extension = device.gl.getExtension('WEBGL_lose_context');
                if (!extension) throw Error('WEBGL_lose_context unavailable');
                const lost = new Promise((resolve) =>
                    document.querySelector('canvas').addEventListener('webglcontextlost', resolve, { once: true }),
                );
                extension.loseContext();
                await lost;
                if (mode === 'restored') {
                    // The lost-event microtask runs before dispatch has fully completed.
                    // Yield one task so preventDefault has authorized restoration.
                    await new Promise((resolve) => setTimeout(resolve, 0));
                    const restored = new Promise((resolve) =>
                        document
                            .querySelector('canvas')
                            .addEventListener('webglcontextrestored', resolve, { once: true }),
                    );
                    extension.restoreContext();
                    await restored;
                }
            }
        }
        return response;
    };
    try {
        const loader = new m.GLTFLoader({ signal: controller.signal });
        const document = {
            asset: { version: '2.0' },
            images: [{ uri: '/probe.png' }],
            textures: [{ source: 0 }],
            materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
        };
        try {
            asset = await loader.parseAsync(JSON.stringify(document), location.href);
        } catch (error) {
            rejection = { code: error.code, name: error.name, message: error.message };
        }
        if (
            asset ||
            !injected ||
            liveURLs.size ||
            (mode === 'abort'
                ? rejection?.name !== 'AbortError'
                : rejection?.code !== (renderer === 'webgpu' ? 'WEBGPU_DEVICE_LOST' : 'WEBGL2_CONTEXT_LOST'))
        )
            throw Error(JSON.stringify({ initialized: !!asset, injected, rejection, liveURLs: liveURLs.size }));
        return {
            backend: device.gfxAPI,
            expectedBackend: renderer === 'webgpu' ? m.gfx.API.WEBGPU : m.gfx.API.WEBGL2,
            cases: [{ name: `gltf-image-${mode}-terminal`, rejection, liveURLs: liveURLs.size }],
        };
    } finally {
        asset?.destroy();
        window.fetch = originalFetch;
        URL.createObjectURL = createURL;
        URL.revokeObjectURL = revokeURL;
        clock.end();
        await app.close();
    }
}
(async () => {
    let browser;
    const timeout = setTimeout(async () => {
        report.failure = 'Texture lifetime probe exceeded its original 120-second budget';
        process.exitCode = 1;
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.error(report.failure);
        const closing = setTimeout(() => process.exit(1), 4000);
        closing.unref();
        try {
            await browser?.close({ reason: report.failure });
        } catch {
            /* The terminal report above retains the original timeout. */
        }
        server.close();
    }, 120000);
    try {
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        browser = await require('playwright').chromium.launch({
            ...launchOptions('chromium'),
            headless: true,
            env: loopbackBrowserEnv(),
        });
        report.browser = browser.version();
        const page = await browser.newPage();
        page.on('console', (message) => {
            if (message.type() === 'error') report.errors.push(message.text());
        });
        page.on('pageerror', (error) => report.errors.push(String(error)));
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        if (args['native-contracts']) {
            const backend = await page.evaluate(async () => {
                const m = await import('/build/cocosair.module.js');
                window.__waApp = await m.createAirApp({ canvas: '#GameCanvas', renderer: 'webgpu' });
                window.__waClock = m.createStepClock();
                window.__waClock.begin();
                return { backend: m.director.root.device.gfxAPI, expectedBackend: m.gfx.API.WEBGPU };
            });
            try {
                report.result = {
                    ...backend,
                    cases: [
                        {
                            name: 'existing-native-resource-contracts',
                            observations: await page.evaluate(require('./webgpu-resource-contracts.cjs')),
                        },
                    ],
                };
            } finally {
                await page.evaluate(async () => {
                    __waClock.end();
                    await __waApp.close();
                });
            }
        } else
            report.result = args['asset-terminal']
                ? await page.evaluate(assetTerminal, {
                      mode: args['asset-terminal'],
                      renderer: args.renderer || 'webgpu',
                  })
                : args['readback-race']
                  ? await page.evaluate(readbackRace, args['readback-race'])
                  : await page.evaluate(
                        args['init-loss']
                            ? initializationLoss
                            : args.renderer === 'webgl2'
                              ? webgl2Regression
                              : contracts,
                    );
        assert.equal(report.result.backend, report.result.expectedBackend, 'expected actual selected GFX backend');
        assert.deepEqual(report.errors, []);
        for (const file of inputs)
            assert.equal(
                hash(file),
                report.fingerprints[path.relative(root, file).replace(/\\/g, '/')],
                'input changed during probe',
            );
        report.completed = true;
    } catch (error) {
        report.failure ??= String(error.stack || error);
        process.exitCode = 1;
    } finally {
        if (browser) {
            await browser.close();
            report.shutdown = 'browser.close acknowledged; no compositor/OS shutdown acceptance claimed';
        }
        server.close();
        clearTimeout(timeout);
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(
            JSON.stringify({
                completed: report.completed,
                cases: report.result?.cases.length || 0,
                failure: report.failure,
                errors: report.errors,
            }),
        );
    }
})();
