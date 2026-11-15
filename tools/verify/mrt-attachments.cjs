/* Native mixed-format MRT probe. Uses public GFX draws/readback; no raw GL state repair.
 * Writes a new --out directory; --bundle selects an existing isolated candidate.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const { verifySourceBinding } = require('../build/source-binding.cjs');
const root = path.resolve(__dirname, '../..');
const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')));
assert.ok(args.out, '--out=<new directory> required');
assert.ok(['webgl2', 'webgpu'].includes(args.renderer), '--renderer=webgl2|webgpu required');
assert.ok(!args.samples || ['1', '4'].includes(args.samples), '--samples=1|4');
const bundle = path.resolve(root, args.bundle || 'build/cocosair.module.js');
assert.ok(bundle.startsWith(root + path.sep), 'SDK must be inside this checkout');
const out = path.resolve(root, args.out);
assert.ok(!fs.existsSync(out), 'retain earlier attempts; choose a new output');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
    path.join(out, 'index.html'),
    '<!doctype html><head><link rel="icon" href="data:,"></head><canvas id="GameCanvas" width="64" height="64"></canvas>',
);
const inputs = [
    bundle,
    __filename,
    'src/cocos/gfx/webgl2/webgl2-commands.ts',
    'src/cocos/gfx/webgpu/webgpu-pipeline-state.ts',
    'src/cocos/gfx/webgpu/webgpu-command-buffer.ts',
    'src/air/rendering/render-target.ts',
    'src/air/rendering/shader-output-interface.ts',
    'src/air/rendering/webgl2-attachment-state.ts',
    'src/air/rendering/mrt-options.ts',
    'src/air/rendering/mrt-target.ts',
    'src/air/rendering/attachment-view.ts',
    'src/air/rendering/attachment-clear.ts',
    'src/air/rendering/attachment-binding.ts',
    'tools/verify/mrt-helper-contracts.cjs',
].map((file) => path.resolve(root, file));
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report = {
    completed: false,
    subset: true,
    renderer: args.renderer,
    indexedCapabilitySuppressed: args['without-indexed'] === '1',
    scope: 'mixed RGBA16F/RG16F/R32UI GFX attachment preservation; not full release acceptance',
    errors: [],
    fingerprints: Object.fromEntries(inputs.map((file) => [path.relative(root, file).replace(/\\/g, '/'), hash(file)])),
};

async function contracts({ sdk, renderer, samples, integerMSAA }) {
    const m = await import(sdk);
    const app = await m.createAirApp({ canvas: '#GameCanvas', renderer });
    const g = m.gfx,
        device = m.director.root.device;
    const clock = m.createStepClock();
    clock.begin();
    const owned = [],
        own = (resource) => (owned.push(resource), resource);
    const observations = [];
    window.__mrtObservations = observations;
    const expect = (condition, message) => {
        if (!condition) throw Error(message);
    };
    try {
        const formats =
            samples > 1 && !integerMSAA
                ? [g.Format.RGBA16F, g.Format.RG16F]
                : [g.Format.RGBA16F, g.Format.RG16F, g.Format.R32UI];
        const hasId = formats.length === 3;
        const capabilities = formats.map((format) => ({ format, features: device.getFormatFeatures(format) }));
        expect(
            capabilities.every((entry) => entry.features & g.FormatFeatureBit.RENDER_TARGET),
            'Device cannot render the requested mixed attachment formats: ' + JSON.stringify(capabilities),
        );
        const makeTexture = (format, count) => {
            const info = new g.TextureInfo(
                g.TextureType.TEX2D,
                g.TextureUsageBit.COLOR_ATTACHMENT |
                    g.TextureUsageBit.SAMPLED |
                    g.TextureUsageBit.TRANSFER_SRC |
                    g.TextureUsageBit.TRANSFER_DST,
                format,
                4,
                4,
            );
            info.samples = count;
            return own(device.createTexture(info));
        };
        if (integerMSAA) {
            const supportedSamples =
                renderer === 'webgl2'
                    ? [
                          ...device.gl.getInternalformatParameter(
                              device.gl.RENDERBUFFER,
                              device.gl.R32UI,
                              device.gl.SAMPLES,
                          ),
                      ]
                    : [];
            if (renderer === 'webgpu' || !supportedSamples.includes(samples)) {
                let rejected;
                try {
                    makeTexture(g.Format.R32UI, samples);
                } catch (error) {
                    rejected = { code: error.code, message: error.message };
                }
                expect(
                    rejected?.code ===
                        (renderer === 'webgpu'
                            ? 'WEBGPU_MULTISAMPLE_FORMAT_UNSUPPORTED'
                            : 'WEBGL2_TEXTURE_SAMPLES_UNSUPPORTED'),
                    'Unsupported integer MSAA must reject before native allocation: ' + JSON.stringify(rejected),
                );
                if (renderer === 'webgl2')
                    expect(device.gl.getError() === device.gl.NO_ERROR, 'Unsupported allocation polluted GL errors');
                observations.push({
                    name: 'integer-msaa-explicit-rejection',
                    status: 'unsupported',
                    rejected,
                    supportedSamples,
                });
                return {
                    backend: device.gfxAPI,
                    expectedBackend: renderer === 'webgpu' ? g.API.WEBGPU : g.API.WEBGL2,
                    observations,
                };
            }
        }
        const textures = formats.map((format) => makeTexture(format, samples));
        const readable = samples > 1 ? formats.map((format) => makeTexture(format, 1)) : textures;
        const pass = (loadOp) =>
            own(
                device.createRenderPass(
                    new g.RenderPassInfo(
                        formats.map((format) => {
                            const attachment = new g.ColorAttachment(format);
                            attachment.loadOp = loadOp;
                            attachment.sampleCount = samples;
                            attachment.storeOp = g.StoreOp.STORE;
                            return attachment;
                        }),
                    ),
                ),
            );
        const firstPass = pass(g.LoadOp.CLEAR),
            secondPass = pass(g.LoadOp.LOAD);
        const firstTarget = own(device.createFramebuffer(new g.FramebufferInfo(firstPass, textures)));
        const secondTarget = own(device.createFramebuffer(new g.FramebufferInfo(secondPass, textures)));
        const vertex =
            renderer === 'webgpu'
                ? 'void main(){vec2 p=vec2((gl_VertexIndex<<1)&2,gl_VertexIndex&2);gl_Position=vec4(p*2.0-1.0,0.0,1.0);}'
                : 'precision highp float;precision highp int;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0.0,1.0);}';
        const fragmentAll =
            'precision highp float;precision highp int;layout(location=0) out vec4 color;layout(location=1) out vec2 velocity;' +
            (hasId ? 'layout(location=2) out uint objectId;' : '') +
            'void main(){color=vec4(0,0,1,1);velocity=vec2(0.25,0.5);' +
            (hasId ? 'objectId=16777217u;' : '') +
            '}';
        const fragmentColor =
            'precision highp float;layout(location=0) out vec4 color;void main(){color=vec4(1,0,0,0.5);}';
        const layout = own(device.createDescriptorSetLayout(new g.DescriptorSetLayoutInfo([])));
        const pipelineLayout = own(device.createPipelineLayout(new g.PipelineLayoutInfo([layout])));
        const descriptors = own(device.createDescriptorSet(new g.DescriptorSetInfo(layout)));
        descriptors.update();
        const vertices = own(
            device.createBuffer(new g.BufferInfo(g.BufferUsageBit.VERTEX, g.MemoryUsageBit.DEVICE, 12, 4)),
        );
        vertices.update(new Float32Array([0, 0, 0]));
        const assembler = own(device.createInputAssembler(new g.InputAssemblerInfo([], [vertices])));
        assembler.vertexCount = 3;
        const pipeline = (name, fragment, renderPass, blend, configure) => {
            const shader = own(
                device.createShader(
                    new g.ShaderInfo(name, [
                        new g.ShaderStage(g.ShaderStageFlagBit.VERTEX, vertex),
                        new g.ShaderStage(g.ShaderStageFlagBit.FRAGMENT, fragment),
                    ]),
                ),
            );
            if (renderer === 'webgpu') {
                window.__mrtShaders ??= [];
                window.__mrtShaders.push({
                    name,
                    fragments: shader.gpuShader.gpuStages
                        .filter((stage) => stage.type === g.ShaderStageFlagBit.FRAGMENT)
                        .map((stage) => ({ source: stage.source, entryPoint: stage.gpuShader.entryPoint })),
                });
            }
            const info = new g.PipelineStateInfo();
            info.shader = shader;
            info.pipelineLayout = pipelineLayout;
            info.renderPass = renderPass;
            info.depthStencilState.depthTest = info.depthStencilState.depthWrite = false;
            info.rasterizerState.cullMode = g.CullMode.NONE;
            while (info.blendState.targets.length < formats.length) info.blendState.targets.push(new g.BlendTarget());
            const target = info.blendState.targets[0];
            target.blend = blend;
            target.blendSrc = g.BlendFactor.SRC_ALPHA;
            target.blendDst = g.BlendFactor.ONE_MINUS_SRC_ALPHA;
            target.blendSrcAlpha = g.BlendFactor.ONE;
            target.blendDstAlpha = g.BlendFactor.ONE_MINUS_SRC_ALPHA;
            configure?.(info.blendState);
            return own(device.createPipelineState(info));
        };
        const all = pipeline('mrt-all-attachments', fragmentAll, firstPass, false);
        const color = pipeline('mrt-color-only', fragmentColor, secondPass, true);
        const draw = (renderPass, framebuffer, state) => {
            const command = own(device.createCommandBuffer(new g.CommandBufferInfo(device.queue)));
            command.begin();
            command.beginRenderPass(
                renderPass,
                framebuffer,
                new g.Rect(0, 0, 4, 4),
                formats.map(() => new g.Color(0, 0, 0, 0)),
                1,
                0,
            );
            command.bindPipelineState(state);
            command.bindDescriptorSet(0, descriptors);
            command.bindInputAssembler(assembler);
            command.draw(assembler);
            command.endRenderPass();
            command.end();
            device.queue.submit([command]);
        };
        const read = async () => {
            if (samples > 1) {
                const copy = own(device.createCommandBuffer(new g.CommandBufferInfo(device.queue)));
                const blit = new g.TextureBlit();
                blit.srcExtent.width = blit.srcExtent.height = blit.dstExtent.width = blit.dstExtent.height = 4;
                copy.begin();
                for (let i = 0; i < textures.length; ++i)
                    copy.blitTexture(textures[i], readable[i], [blit], g.Filter.POINT);
                copy.end();
                device.queue.submit([copy]);
            }
            const output = [new Uint16Array(64), new Uint16Array(32), new Uint32Array(16)];
            const region = new g.BufferTextureCopy();
            region.texExtent.width = region.texExtent.height = 4;
            for (let i = 0; i < textures.length; ++i) {
                if (renderer === 'webgpu') await device.copyTextureToBuffersAsync(readable[i], [output[i]], [region]);
                else device.copyTextureToBuffers(readable[i], [output[i]], [region]);
            }
            return {
                color: [...output[0].slice(0, 4)],
                velocity: [...output[1].slice(0, 2)],
                id: hasId ? output[2][0] : undefined,
            };
        };
        draw(firstPass, firstTarget, all);
        const actualSamples =
            renderer === 'webgpu'
                ? textures[0].gpuTexture.gpuTexture.sampleCount
                : device.gl.getParameter(device.gl.SAMPLES);
        expect(Math.max(1, actualSamples) === samples, `Requested ${samples} actual ${actualSamples} samples`);
        const before = await read();
        observations.push({ name: 'all-mixed-formats-write', before });
        expect(
            before.color.join() === [0, 0, 0x3c00, 0x3c00].join() &&
                before.velocity.join() === [0x3400, 0x3800].join() &&
                (!hasId || before.id === 16777217),
            'First mixed-format draw/readback mismatch: ' + JSON.stringify(before),
        );
        draw(secondPass, secondTarget, color);
        const after = await read();
        observations.push({ name: 'color-only-blend-preserves-other-attachments', before, after });
        expect(
            after.velocity.join() === before.velocity.join() && after.id === before.id,
            'Color-only draw modified unwritten attachments: ' + JSON.stringify({ before, after }),
        );
        expect(
            after.color.join() === [0x3800, 0, 0x3800, 0x3c00].join(),
            'Color blend mismatch: ' + JSON.stringify(after),
        );
        draw(secondPass, firstTarget, color);
        const again = await read();
        expect(
            again.color.join() === [0x3a00, 0, 0x3400, 0x3c00].join() &&
                again.velocity.join() === before.velocity.join() &&
                again.id === before.id,
            'A-B-A shared attachments lost prior content: ' + JSON.stringify(again),
        );
        observations.push({ name: 'shared-attachments-A-B-A', samples, actualSamples, before, after, again });

        const clearing = own(device.createCommandBuffer(new g.CommandBufferInfo(device.queue)));
        clearing.begin();
        clearing.beginRenderPass(
            firstPass,
            firstTarget,
            new g.Rect(0, 0, 4, 4),
            [new g.Color(0.25, 0, 0, 1), new g.Color(0.5, 0.25, 0, 0), new g.Color(43, 0, 0, 0)].slice(
                0,
                formats.length,
            ),
            1,
            0,
        );
        clearing.endRenderPass();
        clearing.end();
        device.queue.submit([clearing]);
        const cleared = await read();
        expect(
            cleared.color.join() === [0x3400, 0, 0, 0x3c00].join() &&
                cleared.velocity.join() === [0x3800, 0x3400].join() &&
                (!hasId || cleared.id === 43),
            'Clear after narrowed draw buffers did not reach every attachment: ' + JSON.stringify(cleared),
        );
        observations.push({ name: 'clear-after-output-mask', samples, cleared });
        if (samples === 1) {
            const independent = pipeline(
                'mrt-independent',
                fragmentAll
                    .replace('color=vec4(0,0,1,1)', 'color=vec4(1,0,0,0.5)')
                    .replace('velocity=vec2(0.25,0.5)', 'velocity=vec2(0.75,0.75)')
                    .replace('16777217u', '16777219u'),
                secondPass,
                false,
                (state) => {
                    state.isIndepend = true;
                    state.targets[1].blendColorMask = g.ColorMask.G;
                    state.targets[2].blend = true; // Integer targets must ignore blending.
                },
            );
            draw(firstPass, firstTarget, all);
            const supported = renderer === 'webgpu' || !!device.gl.getExtension('OES_draw_buffers_indexed');
            let rejected;
            try {
                draw(secondPass, firstTarget, independent);
            } catch (error) {
                rejected = { code: error.code, message: error.message };
            }
            if (!supported) {
                expect(
                    rejected?.code === 'WEBGL2_INDEPENDENT_BLEND_UNSUPPORTED',
                    'Missing indexed-blend capability must reject explicitly',
                );
                const unchanged = await read();
                expect(
                    unchanged.id === before.id && unchanged.velocity.join() === before.velocity.join(),
                    'Rejected draw modified attachments',
                );
                observations.push({ name: 'independent-blend-unavailable', supported, rejected });
            } else {
                expect(!rejected, 'Indexed blend draw rejected: ' + JSON.stringify(rejected));
                const indexed = await read();
                expect(
                    indexed.color.join() === [0x3c00, 0, 0, 0x3800].join() &&
                        indexed.velocity.join() === [0x3400, 0x3a00].join() &&
                        indexed.id === 16777219,
                    'Independent masks or integer blend mismatch: ' + JSON.stringify(indexed),
                );
                observations.push({ name: 'independent-mask-and-integer-no-blend', indexed });
                draw(secondPass, firstTarget, color);
                const kept = await read();
                expect(
                    kept.velocity.join() === indexed.velocity.join() && kept.id === indexed.id,
                    'Shared blend after indexed state modified unwritten outputs',
                );
                const clearIndexed = own(device.createCommandBuffer(new g.CommandBufferInfo(device.queue)));
                clearIndexed.begin();
                clearIndexed.beginRenderPass(
                    firstPass,
                    firstTarget,
                    new g.Rect(0, 0, 4, 4),
                    [new g.Color(0.25, 0, 0, 1), new g.Color(0.5, 0.25, 0, 0), new g.Color(43, 0, 0, 0)],
                    1,
                    0,
                );
                clearIndexed.endRenderPass();
                clearIndexed.end();
                device.queue.submit([clearIndexed]);
                const reset = await read();
                expect(
                    reset.velocity.join() === [0x3800, 0x3400].join() && reset.id === 43,
                    'Clear did not reset indexed write masks: ' + JSON.stringify(reset),
                );
                observations.push({ name: 'clear-after-indexed-state', reset });
            }
        }
        if (renderer === 'webgl2') expect(device.gl.getError() === device.gl.NO_ERROR, 'WebGL2 error');
        if (renderer === 'webgl2' && samples === 1) {
            const arrayShader = pipeline(
                'mrt-array-outputs',
                'precision highp float;precision highp int;layout(location=0) out vec4 colors[2];layout(location=2) out uint objectId;void main(){colors[0]=vec4(0,0,1,1);colors[1]=vec4(0.25,0.5,0,1);objectId=16777217u;}',
                firstPass,
                false,
            );
            draw(firstPass, firstTarget, arrayShader);
            const arrayOutput = await read();
            expect(
                arrayOutput.color.join() === before.color.join() &&
                    arrayOutput.velocity.join() === before.velocity.join() &&
                    arrayOutput.id === before.id,
                'Linked array output locations were lost: ' + JSON.stringify(arrayOutput),
            );
            expect(device.gl.getError() === device.gl.NO_ERROR, 'Array reflection polluted GL errors');
            observations.push({ name: 'glsl-linked-array-output-locations', arrayOutput });
        }
        return {
            backend: device.gfxAPI,
            expectedBackend: renderer === 'webgpu' ? g.API.WEBGPU : g.API.WEBGL2,
            capabilities,
            observations,
        };
    } finally {
        for (const resource of owned.reverse()) resource.destroy();
        clock.end();
        await app.close();
    }
}
(async () => {
    let browser, server, page;
    const timeout = setTimeout(async () => {
        report.failure = 'MRT probe exceeded its original 90-second budget';
        process.exitCode = 1;
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        setTimeout(() => process.exit(1), 4000).unref();
        await browser?.close({ reason: report.failure }).catch(() => {});
    }, 90000);
    try {
        report.sourceBinding = verifySourceBinding(root, bundle);
        assert.equal(report.sourceBinding.matches, true, 'candidate must bind current source bytes');
        server = await startExampleServer(root);
        browser = await require('playwright').chromium.launch({
            ...launchOptions('chromium'),
            headless: true,
            env: loopbackBrowserEnv(),
        });
        report.browser = browser.version();
        page = await browser.newPage();
        if (args['without-indexed'] === '1') {
            await page.addInitScript(() => {
                const original = WebGL2RenderingContext.prototype.getExtension;
                WebGL2RenderingContext.prototype.getExtension = function (name) {
                    return name === 'OES_draw_buffers_indexed' ? null : original.call(this, name);
                };
            });
        }
        page.on('console', (message) => {
            if (message.type() === 'error') report.errors.push(message.text());
        });
        page.on('pageerror', (error) => report.errors.push(String(error)));
        await page.goto(server.origin + '/' + path.relative(root, path.join(out, 'index.html')).replace(/\\/g, '/'));
        report.result = await page.evaluate(args.helper === '1' ? require('./mrt-helper-contracts.cjs') : contracts, {
            sdk: '/' + path.relative(root, bundle).replace(/\\/g, '/'),
            renderer: args.renderer,
            samples: Number(args.samples || 1),
            integerMSAA: args['integer-msaa'] === '1',
        });
        assert.equal(report.result.backend, report.result.expectedBackend);
        assert.deepEqual(report.errors, []);
        for (const file of inputs)
            assert.equal(hash(file), report.fingerprints[path.relative(root, file).replace(/\\/g, '/')]);
        report.completed = true;
    } catch (error) {
        report.failure ??= String(error.stack || error);
        process.exitCode = 1;
        if (page) report.observations = await page.evaluate(() => window.__mrtObservations).catch(() => undefined);
    } finally {
        if (page) report.shaders = await page.evaluate(() => window.__mrtShaders).catch(() => undefined);
        if (browser) {
            await browser.close();
            report.shutdown = 'browser.close acknowledged; not compositor/OS shutdown acceptance';
        }
        if (server) await server.close();
        clearTimeout(timeout);
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(
            JSON.stringify({
                completed: report.completed,
                renderer: report.renderer,
                failure: report.failure,
                errors: report.errors,
                observations: report.result?.observations || report.observations,
            }),
        );
    }
})();
