// SPK-09 gfx probe (Spark native-gfx data-path contracts).
// Positioning: this is a development/verification diagnostic that exercises the *native* cc.gfx
// contracts the frozen Spark splat renderer depends on (integer formats, integer attributes,
// array-texture layer attachment selection, MRT, public + async PBO readback). It uses only the
// public engine gfx API plus read-only raw-GL state queries, so it lives under
// tools/debug/probes/ (per repository convention "resident probes live in tools/debug/probes/, the
// name states the diagnostic subject") rather than src/air/spark/ (which would be a shipped runtime
// surface). XR branches are excluded by SPK-10; nothing here opens an XR session.
//
// Design contract (mirrors the webgl2-gfx-contracts precedent):
//   * every case carries a COMPUTED expectation derived from the same inputs it uploads — no copied
//     literal result arrays;
//   * gl.getError() is drained at every stage so a stale error can never be attributed to a later
//     stage;
//   * negative-control cases assert the engine *rejects* an invalid path without leaking a GL error;
//   * a Spark-symbol integration case is reported as BLOCKED (never a fabricated PASS) until
//     src/air/spark lands and SPK-12 wires it into the build export surface.
const parameters = new URLSearchParams(location.search);
const sdk = parameters.get('sdk') || '/build/cocosair.module.js';
if (!/^\/build\/[a-zA-Z0-9_.-]+\.js$/.test(sdk)) throw new Error('Invalid SDK path');
const cc = await import(sdk);
const selected = parameters.get('cases')?.split(',');

const results = [];
window.__sparkGfxProbe = { ready: false, results };

try {
    cc.macro.ENABLE_WEBGL_ANTIALIAS = false;
    const app = await cc.createAirApp({ canvas: '#GameCanvas' });
    const scene = new cc.Scene('SparkNativeGfxProbe');
    const camera = new cc.Node('camera');
    scene.addChild(camera);
    camera.addComponent(cc.Camera).visibility = 0;
    app.run(scene);
    cc.game.pause();

    const d = cc.director.root.device;
    const g = cc.gfx;
    const gl = d.gl;
    const stage = g.ShaderStageFlagBit.VERTEX | g.ShaderStageFlagBit.FRAGMENT;
    const binding = Math.max(1, -d.bindingMappings.samplerTextureOffsets[0]);

    const drain = () => {
        const values = [];
        for (let i = 0; i < 32; i++) {
            const value = gl.getError();
            if (!value) break;
            values.push(value);
        }
        return values;
    };
    const startupErrors = drain();

    const attachmentUsages =
        g.TextureUsageBit.COLOR_ATTACHMENT | g.TextureUsageBit.SAMPLED | g.TextureUsageBit.TRANSFER_SRC;
    const sourceUsages = g.TextureUsageBit.SAMPLED | g.TextureUsageBit.TRANSFER_DST;

    const tex = (format, type = g.TextureType.TEX2D, width = 1, layers = 1, usages = attachmentUsages, height = 1) =>
        d.createTexture(
            new g.TextureInfo(
                type,
                usages,
                format,
                width,
                height,
                g.TextureFlagBit.NONE,
                layers,
                1,
                g.SampleCount.X1,
                1,
            ),
        );

    const region = (w = 1, layer = 0, layers = 1) => {
        const r = new g.BufferTextureCopy();
        r.texExtent = new g.Extent(w, 1, 1);
        r.texSubres.baseArrayLayer = layer;
        r.texSubres.layerCount = layers;
        return r;
    };

    const upload = (buffers, target, regions) => d.copyBuffersToTexture(buffers, target, regions);

    const sampler = (filter = g.Filter.POINT) =>
        d.getSampler(
            new g.SamplerInfo(
                filter,
                filter,
                g.Filter.NONE,
                g.Address.CLAMP,
                g.Address.CLAMP,
                g.Address.CLAMP,
                0,
                g.ComparisonFunc.ALWAYS,
            ),
        );

    const defaultVS = `precision highp float; precision highp int;
void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); gl_Position=vec4(p*2.-1.,0.,1.); }`;

    // Generic public-gfx render. Returns the framebuffer so an async PBO diagnostic can target it.
    const draw = (keep, mark, opts) => {
        const {
            attachments,
            sampled = null,
            input = g.Type.SAMPLER2D_ARRAY,
            ub = null,
            attrs = [],
            vertexData = null,
            vertexStride = 0,
            instances = 0,
            vertexCount = 3,
            vs = defaultVS,
            fragment,
            clear = [0, 0, 0, 0],
            samplerFilter = g.Filter.POINT,
            drawEnabled = true,
        } = opts;
        const colors = attachments.map((t) => new g.ColorAttachment(t.format));
        const pass = keep(
            d.createRenderPass(new g.RenderPassInfo(colors, new g.DepthStencilAttachment(g.Format.UNKNOWN))),
        );
        const fb = keep(d.createFramebuffer(new g.FramebufferInfo(pass, attachments, null)));
        const info = new g.ShaderInfo();
        info.name = 'SparkGfxProbe';
        info.stages = [
            new g.ShaderStage(g.ShaderStageFlagBit.VERTEX, vs),
            new g.ShaderStage(g.ShaderStageFlagBit.FRAGMENT, `precision highp float; precision highp int; ${fragment}`),
        ];
        if (ub) info.blocks = [new g.UniformBlock(0, 0, 'Values', [new g.Uniform('base', g.Type.UINT4, 1)], 1)];
        if (sampled) info.samplerTextures = [new g.UniformSamplerTexture(0, binding, 'packed', input, 1)];

        const bindings = [];
        if (ub) bindings.push(new g.DescriptorSetLayoutBinding(0, g.DescriptorType.UNIFORM_BUFFER, 1, stage));
        if (sampled)
            bindings.push(new g.DescriptorSetLayoutBinding(binding, g.DescriptorType.SAMPLER_TEXTURE, 1, stage));
        const shader = keep(d.createShader(info));
        const layout = keep(d.createDescriptorSetLayout(new g.DescriptorSetLayoutInfo(bindings)));
        const pl = keep(d.createPipelineLayout(new g.PipelineLayoutInfo([layout])));
        const set = keep(d.createDescriptorSet(new g.DescriptorSetInfo(layout)));
        if (ub) {
            const buf = keep(
                d.createBuffer(
                    new g.BufferInfo(
                        g.BufferUsageBit.UNIFORM | g.BufferUsageBit.TRANSFER_DST,
                        g.MemoryUsageBit.HOST | g.MemoryUsageBit.DEVICE,
                        16,
                        16,
                    ),
                ),
            );
            buf.update(ub);
            set.bindBuffer(0, buf);
        }
        if (sampled) {
            set.bindTexture(binding, sampled);
            set.bindSampler(binding, sampler(samplerFilter));
        }
        if (ub || sampled) set.update();
        const vb = keep(
            d.createBuffer(
                new g.BufferInfo(
                    g.BufferUsageBit.VERTEX,
                    g.MemoryUsageBit.DEVICE,
                    vertexData?.byteLength || 12,
                    vertexStride || (vertexData ? vertexData.BYTES_PER_ELEMENT : 4),
                ),
            ),
        );
        vb.update(vertexData || new Float32Array([0, 0, 0]));
        const ia = keep(d.createInputAssembler(new g.InputAssemblerInfo(attrs, [vb])));
        const rs = new g.RasterizerState();
        rs.cullMode = g.CullMode.NONE;
        const ps = keep(
            d.createPipelineState(
                new g.PipelineStateInfo(
                    shader,
                    pl,
                    pass,
                    new g.InputState(attrs),
                    rs,
                    new g.DepthStencilState(false, false),
                ),
            ),
        );
        const cmd = keep(d.createCommandBuffer(new g.CommandBufferInfo(d.queue, g.CommandBufferType.PRIMARY)));
        mark('resources-and-shader');
        cmd.begin();
        cmd.beginRenderPass(
            pass,
            fb,
            new g.Rect(0, 0, attachments[0].width, attachments[0].height),
            attachments.map((_, i) => new g.Color(...(Array.isArray(clear[0]) ? clear[i] : clear))),
            1,
            0,
        );
        mark('clear');
        cmd.bindPipelineState(ps);
        cmd.bindDescriptorSet(0, set);
        cmd.bindInputAssembler(ia);
        if (drawEnabled) cmd.draw(new g.DrawInfo(vertexCount, 0, 0, 0, 0, instances));
        cmd.endRenderPass();
        cmd.end();
        d.queue.submit([cmd]);
        mark('draw');
        return { fb, shader, pass };
    };

    const readback = (texture, output, w = 1, layer = 0, layers = 1) => {
        d.copyTextureToBuffers(texture, [output], [region(w, layer, layers)]);
        return output;
    };

    const pollFence = (fence) =>
        new Promise((resolve, reject) => {
            const tick = () => {
                const state = gl.clientWaitSync(fence, 0, 0);
                if (state === gl.WAIT_FAILED) reject(new Error('Probe readback fence failed'));
                else if (state === gl.TIMEOUT_EXPIRED) setTimeout(tick, 0);
                else resolve();
            };
            tick();
        });

    const matches = (value, wanted) => JSON.stringify(value) === JSON.stringify(wanted);

    const run = async (id, variant, expected, body) => {
        if (selected && !selected.includes(id)) return;
        const stages = { preExisting: drain() };
        const owned = [];
        const keep = (resource) => {
            owned.push(resource);
            return resource;
        };
        const mark = (name) => {
            stages[name] = [...(stages[name] || []), ...drain()];
        };
        let actual;
        let exception;
        try {
            actual = await body(keep, mark);
        } catch (error) {
            exception = String(error.stack || error);
        }
        mark('completion');
        for (const resource of owned.reverse()) {
            try {
                resource.destroy();
            } catch (error) {
                exception = `${exception || ''}\ncleanup: ${error}`;
            }
        }
        mark('cleanup');
        const clean = Object.values(stages).every((v) => !v.length);
        results.push({
            id,
            variant,
            status: !exception && matches(actual, expected) && clean ? 'PASS' : 'FAIL',
            expected,
            actual,
            exception,
            stages,
            glClean: clean,
        });
    };

    // ---- Spark composed data-path scenario inputs. Every expected value below is computed from
    // these inputs, never copied from the ported probe's literal array.
    const packedData = [
        [7, 11, 13, 17],
        [19, 23, 29, 31],
    ];
    const baseU = [1, 2, 3, 4];
    const nativeIndex = 16777217; // > 2**24: not representable exactly by a float32 path
    const instances = 2;
    const attachLayer = 1; // both the attachment view baseLayer and the readback layer
    const lastInstance = instances - 1; // with no blending the final instance write survives
    const expectedValue = packedData[lastInstance].map((v, i) => (v + baseU[i] + (i === 0 ? nativeIndex : 0)) >>> 0);
    const expectedA = expectedValue;
    const expectedB = expectedValue.map((v) => (v * 2) >>> 0);
    const expectedC = expectedValue.map((v) => v & 255);

    // SPK-05/06/07/08/09 composed: integer upload + integer attribute + array-layer view attach
    // + MRT + native readback of each attachment's selected layer.
    await run(
        'SPK-C1',
        'spark-integer-mrt-array-layer-native-readback',
        { a: expectedA, b: expectedB, c: expectedC },
        (keep, mark) => {
            const input = keep(tex(g.Format.RGBA32UI, g.TextureType.TEX2D_ARRAY, 1, 2, sourceUsages));
            upload([new Uint32Array(packedData[0]), new Uint32Array(packedData[1])], input, [region(1, 0, 2)]);
            mark('upload');
            const formats = [g.Format.RGBA32UI, g.Format.RGBA32UI, g.Format.RGBA8];
            const outputs = formats.map((format) =>
                keep(tex(format, g.TextureType.TEX2D_ARRAY, 4, 2, attachmentUsages)),
            );
            const views = outputs.map((t) =>
                keep(d.createTexture(new g.TextureViewInfo(t, t.type, t.format, 0, 1, attachLayer, 1))),
            );
            draw(keep, mark, {
                attachments: views,
                sampled: input,
                ub: new Uint32Array(baseU),
                attrs: [new g.Attribute('nativeIndex', g.Format.R32UI, false, 0, false, 0)],
                vertexData: new Uint32Array([nativeIndex, nativeIndex, nativeIndex]),
                instances,
                vs: `precision highp float; precision highp int; precision highp usampler2DArray;
in uint nativeIndex; uniform usampler2DArray packed; layout(std140) uniform Values { uvec4 base; }; flat out uvec4 value;
void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); gl_Position=vec4(p*2.-1.,0.,1.);
value=texelFetch(packed,ivec3(0,0,gl_InstanceID),0)+base+uvec4(nativeIndex,0u,0u,0u); }`,
                fragment: `flat in uvec4 value;
layout(location=0) out uvec4 a; layout(location=1) out uvec4 b; layout(location=2) out vec4 c;
void main(){ a=value; b=value*2u; c=vec4(value & 255u)/255.; }`,
            });
            const a = readback(outputs[0], new Uint32Array(16), 4, attachLayer).slice(0, 4);
            const b = readback(outputs[1], new Uint32Array(16), 4, attachLayer).slice(0, 4);
            const c = readback(outputs[2], new Uint8Array(16), 4, attachLayer).slice(0, 4);
            mark('public-native-readback');
            return { a: Array.from(a), b: Array.from(b), c: Array.from(c) };
        },
    );

    // SPK-09 device escape: async PBO + WebGL2 fence readback must be bit-exact with the public
    // synchronous readback for an integer value outside the float32 exact range.
    const asyncValue = [nativeIndex, 11, 13, 17];
    await run(
        'SPK-C2',
        'async-pbo-fence-readback-exactness',
        { sample: asyncValue, overFloat32: true, matchesSync: true },
        async (keep, mark) => {
            const target = keep(tex(g.Format.RGBA32UI, g.TextureType.TEX2D_ARRAY, 4, 1, attachmentUsages));
            const view = keep(d.createTexture(new g.TextureViewInfo(target, target.type, target.format, 0, 1, 0, 1)));
            const { fb } = draw(keep, mark, {
                attachments: [view],
                fragment: `out uvec4 color; void main(){ color=uvec4(${asyncValue[0]}u,${asyncValue[1]}u,${asyncValue[2]}u,${asyncValue[3]}u); }`,
            });
            const sync = Array.from(readback(target, new Uint32Array(16), 4, 0).slice(0, 4));
            mark('sync-public-readback');

            const bytes = 4 * 16; // RGBA32UI: 4 channels * 4 bytes * 4 texels
            const staging = keep(
                d.createBuffer(
                    new g.BufferInfo(
                        g.BufferUsageBit.VERTEX,
                        g.MemoryUsageBit.HOST | g.MemoryUsageBit.DEVICE,
                        bytes,
                        4,
                    ),
                ),
            );
            const prevRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
            const prevPack = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb.getGpuFramebuffer().glFramebuffer);
            gl.readBuffer(gl.COLOR_ATTACHMENT0);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, staging.getGpuBuffer().glBuffer);
            gl.readPixels(0, 0, 4, 1, gl.RGBA_INTEGER, gl.UNSIGNED_INT, 0);
            const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
            gl.flush();
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevRead);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, prevPack);
            d.getStateCache().glReadFramebuffer = prevRead;
            mark('async-issue');
            await pollFence(fence);
            const out = new Uint32Array(16);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, staging.getGpuBuffer().glBuffer);
            gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, prevPack);
            gl.deleteSync(fence);
            mark('async-completion');
            const sample = Array.from(out.slice(0, 4));
            return {
                sample,
                overFloat32: nativeIndex > 2 ** 24, // outside the float32 exact-integer range: the
                // readback is provably a native integer path, not a reinterpreted float
                matchesSync: sample.every((v, i) => v === sync[i]) && sync.every((v, i) => v === asyncValue[i]),
            };
        },
    );

    // Negative control: sampling an integer texture with a LINEAR-filtered sampler must be rejected
    // by the engine before submission and must leave no residual GL error behind. The integer texel
    // must actually be referenced by the fragment, otherwise the descriptor is optimised out and the
    // runtime guard at webgl2-commands.ts:2403-2411 never fires.
    await run('SPK-C3', 'integer-linear-filter-rejected-without-gl-error', { rejected: true }, (keep, mark) => {
        const source = keep(tex(g.Format.RGBA32UI, g.TextureType.TEX2D, 1, 1, sourceUsages));
        upload([new Uint32Array(packedData[0])], source, [region(1, 0, 1)]);
        mark('upload');
        const target = keep(tex(g.Format.RGBA32UI, g.TextureType.TEX2D, 1, 1, attachmentUsages));
        try {
            draw(keep, mark, {
                attachments: [target],
                sampled: source,
                input: g.Type.SAMPLER2D,
                samplerFilter: g.Filter.LINEAR,
                fragment:
                    'uniform highp usampler2D packed; out uvec4 color; void main(){ color = texelFetch(packed, ivec2(0), 0); }',
            });
            return { rejected: false };
        } catch (error) {
            return { rejected: String(error).includes('WEBGL2_INTEGER_TEXTURE_FILTER') };
        }
    });

    // Negative control: a texture view that selects an out-of-range array layer must be rejected.
    await run('SPK-C4', 'reject-invalid-array-layer-view', { rejected: true }, (keep) => {
        const target = keep(tex(g.Format.RGBA8, g.TextureType.TEX2D_ARRAY, 1, 2, attachmentUsages));
        try {
            keep(d.createTexture(new g.TextureViewInfo(target, target.type, target.format, 0, 1, 2, 1)));
            return { rejected: false };
        } catch {
            return { rejected: true };
        }
    });

    // Capability preconditions the composed case relies on (computed from the live device).
    await run(
        'SPK-C5',
        'array-layer-and-mrt-capability',
        true,
        () => d.capabilities.maxArrayTextureLayers >= 2 && gl.getParameter(gl.MAX_DRAW_BUFFERS) >= 3,
    );
    await run(
        'SPK-C6',
        'integer-format-not-linear-filterable',
        true,
        () => !(d.getFormatFeatures(g.Format.RGBA32UI) & g.FormatFeatureBit.LINEAR_FILTER),
    );

    // Spark integration observation. The native-gfx contracts above are engine-only and fully
    // exercisable against the current build. This case depends on the AIR Spark integration layer
    // (src/air/spark, SPK-07/08) being wired into the build export surface (SPK-12). Until then it
    // reports BLOCKED honestly — it is never counted as a fabricated PASS.
    {
        const id = 'SPK-INT';
        const variant = 'spark-export-surface-presence';
        const sparkSymbols = ['CocosSparkLayer', 'CocosRenderer', 'createCocosSparkLayer'].filter((name) => name in cc);
        if (sparkSymbols.length) {
            results.push({
                id,
                variant,
                status: 'PASS',
                expected: 'Spark integration symbols exported',
                actual: sparkSymbols,
            });
        } else {
            results.push({
                id,
                variant,
                status: 'BLOCKED',
                reason: 'src/air/spark integration symbols are not present in the build export surface yet (SPK-07/08 landing, SPK-12 wiring). The native-gfx contracts in SPK-C1..C6 do not depend on them.',
            });
        }
    }

    window.__sparkGfxProbe = {
        ready: true,
        results,
        startupErrors,
        device: d.constructor.name,
        renderer: gl.getParameter(gl.RENDERER),
        version: gl.getParameter(gl.VERSION),
        capabilities: {
            maxArrayTextureLayers: d.capabilities.maxArrayTextureLayers,
            maxDrawBuffers: gl.getParameter(gl.MAX_DRAW_BUFFERS),
            rgba32uiLinear: !!(d.getFormatFeatures(g.Format.RGBA32UI) & g.FormatFeatureBit.LINEAR_FILTER),
        },
        scenarioInputs: { packedData, baseU, nativeIndex, instances, attachLayer, expectedValue },
        diagnostics:
            'Public gfx owns every resource, upload, state apply and draw; raw GL is read-only state plus the async-PBO diagnostic with explicit state restore.',
    };
} catch (error) {
    window.__sparkGfxProbe = { ready: true, results, startupException: String(error.stack || error) };
}
