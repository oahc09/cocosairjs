const parameters = new URLSearchParams(location.search);
const sdk = parameters.get('sdk') || '/build/cocosair.module.js';
if (!/^\/(?:build|output\/webgl2-gfx-contracts\/variants)\/[a-zA-Z0-9_.-]+\.js$/.test(sdk))
    throw new Error('Invalid SDK path');
const cc = await import(sdk);
const selectedCases = parameters.get('cases')?.split(',');

// All resource creation, uploads, state application and draws use public gfx.
// Raw WebGL is restricted to read-only state queries. Public readback selects
// the exact owning texture/view; no raw binding/state repair.
const results = [];
window.__wglContracts = { ready: false, results };
try {
    cc.macro.ENABLE_WEBGL_ANTIALIAS = false;
    const app = await cc.createAirApp({ canvas: '#GameCanvas' });
    const scene = new cc.Scene('WebGL2Contracts');
    const camera = new cc.Node('camera');
    scene.addChild(camera);
    camera.addComponent(cc.Camera).visibility = 0;
    app.run(scene);
    cc.game.pause();
    const d = cc.director.root.device,
        g = cc.gfx,
        gl = d.gl;
    const errors = () => {
        const values = [];
        for (let i = 0; i < 32; i++) {
            const value = gl.getError();
            if (!value) break;
            values.push(value);
        }
        return values;
    };
    const startupErrors = errors();
    let shaderDiagnostics = [];
    let caseInputs = [];
    let readTarget;
    const binding = Math.max(1, -d.bindingMappings.samplerTextureOffsets[0]);
    const defaultVS = `precision highp float; precision highp int;
void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.); }`;
    const texture = (format, type = g.TextureType.TEX2D, width = 1, layers = 1, options = {}) =>
        d.createTexture(
            new g.TextureInfo(
                type,
                g.TextureUsageBit.SAMPLED |
                    g.TextureUsageBit.COLOR_ATTACHMENT |
                    g.TextureUsageBit.TRANSFER_SRC |
                    g.TextureUsageBit.TRANSFER_DST,
                format,
                width,
                options.height || 1,
                g.TextureFlagBit.NONE,
                layers,
                options.levels || 1,
                g.SampleCount.X1,
                options.depth || 1,
            ),
        );
    const region = (width = 1, layer = 0, layers = 1) => {
        const r = new g.BufferTextureCopy();
        r.texExtent = new g.Extent(width, 1, 1);
        r.texSubres.baseArrayLayer = layer;
        r.texSubres.layerCount = layers;
        return r;
    };
    const upload = (buffers, target, regions) => {
        caseInputs.push({
            operation: 'copyBuffersToTexture',
            type: target.type,
            format: target.format,
            buffers: buffers.map((v) => ({ typedArray: v.constructor.name, byteOffset: v.byteOffset, values: [...v] })),
            regions,
        });
        d.copyBuffersToTexture(buffers, target, regions);
    };
    const sampler = (filter = g.Filter.POINT, compare = g.ComparisonFunc.ALWAYS, anisotropy = 0) =>
        d.getSampler(
            new g.SamplerInfo(
                filter,
                filter,
                g.Filter.NONE,
                g.Address.CLAMP,
                g.Address.CLAMP,
                g.Address.CLAMP,
                anisotropy,
                compare,
            ),
        );
    const run = async (id, variant, expected, body) => {
        if (selectedCases && !selectedCases.includes(id)) return;
        shaderDiagnostics = [];
        caseInputs = [];
        const stages = { preExisting: errors() },
            owned = [];
        const keep = (resource) => {
            owned.push(resource);
            return resource;
        };
        const mark = (name) => {
            stages[name] = [...(stages[name] || []), ...errors()];
        };
        let actual, exception;
        let cleanupSucceeded = 0;
        try {
            actual = await body(keep, mark);
        } catch (e) {
            exception = String(e.stack || e);
        }
        mark('completion');
        for (const resource of owned.reverse()) {
            try {
                resource.destroy();
                cleanupSucceeded++;
            } catch (e) {
                exception = `${exception || ''}\ncleanup: ${e}`;
            }
        }
        mark('cleanup');
        const matches = (value, wanted) =>
            wanted?.channelRanges
                ? Array.isArray(value) &&
                  value.length === wanted.channelRanges.length &&
                  value.every((v, i) => v >= wanted.channelRanges[i][0] && v <= wanted.channelRanges[i][1])
                : Array.isArray(wanted)
                  ? Array.isArray(value) &&
                    value.length === wanted.length &&
                    value.every((v, i) => matches(v, wanted[i]))
                  : JSON.stringify(value) === JSON.stringify(wanted);
        const equal = matches(actual, expected);
        results.push({
            id,
            variant,
            expected,
            actual,
            equal,
            exception,
            stages,
            shaderDiagnostics,
            inputs: caseInputs,
            resources: {
                created: owned.length,
                cleanupAttempted: owned.length,
                cleanupSucceeded,
                samplerOwnership: 'device cache except explicit destroy/recreate case',
            },
            status: !exception && equal && Object.values(stages).every((v) => !v.length) ? 'PASS' : 'FAIL',
        });
    };
    const draw = (
        keep,
        mark,
        {
            target,
            targets,
            depthTarget,
            depthState,
            depthClear = 1,
            load = false,
            fragment,
            input,
            sampled,
            samplerObject,
            vs = defaultVS,
            attrs = [],
            vertexData,
            vertexStride,
            instances = 0,
            rasterizer,
            dynamicBias,
            clear = [0, 0, 0, 0],
            drawEnabled = true,
        },
    ) => {
        targets = targets || [target];
        target = targets[0];
        const colors = targets.map((t) => {
            const attachment = new g.ColorAttachment(t.format);
            if (load) attachment.loadOp = g.LoadOp.LOAD;
            return attachment;
        });
        const depthAttachment = new g.DepthStencilAttachment(depthTarget?.format || g.Format.UNKNOWN);
        if (load) depthAttachment.depthLoadOp = depthAttachment.stencilLoadOp = g.LoadOp.LOAD;
        const pass = keep(d.createRenderPass(new g.RenderPassInfo(colors, depthAttachment)));
        const fb = keep(d.createFramebuffer(new g.FramebufferInfo(pass, targets, depthTarget || null)));
        const info = new g.ShaderInfo();
        info.name = 'WGLContract';
        info.stages = [
            new g.ShaderStage(g.ShaderStageFlagBit.VERTEX, vs),
            new g.ShaderStage(g.ShaderStageFlagBit.FRAGMENT, `precision highp float;precision highp int;${fragment}`),
        ];
        if (sampled)
            info.samplerTextures = [new g.UniformSamplerTexture(0, binding, 'source', input || g.Type.SAMPLER2D, 1)];
        const shader = keep(d.createShader(info));
        const layout = keep(
            d.createDescriptorSetLayout(
                new g.DescriptorSetLayoutInfo(
                    sampled
                        ? [
                              new g.DescriptorSetLayoutBinding(
                                  binding,
                                  g.DescriptorType.SAMPLER_TEXTURE,
                                  1,
                                  g.ShaderStageFlagBit.FRAGMENT | g.ShaderStageFlagBit.VERTEX,
                              ),
                          ]
                        : [],
                ),
            ),
        );
        const pl = keep(d.createPipelineLayout(new g.PipelineLayoutInfo([layout])));
        const set = keep(d.createDescriptorSet(new g.DescriptorSetInfo(layout)));
        if (sampled) {
            set.bindTexture(binding, sampled);
            set.bindSampler(binding, samplerObject || sampler());
            set.update();
        }
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
        const rs = rasterizer || new g.RasterizerState();
        rs.cullMode = g.CullMode.NONE;
        // Seed distinct static values so dynamic-path assertions cannot pass
        // merely because the cache skipped a redundant dynamic application.
        if (dynamicBias) {
            rs.depthBias = 19;
            rs.depthBiasSlop = 2.75;
        }
        const pi = new g.PipelineStateInfo(
            shader,
            pl,
            pass,
            new g.InputState(attrs),
            rs,
            depthState || new g.DepthStencilState(false, false),
        );
        if (dynamicBias) pi.dynamicStates = g.DynamicStateFlagBit.DEPTH_BIAS;
        const ps = keep(d.createPipelineState(pi));
        const cmd = keep(d.createCommandBuffer(new g.CommandBufferInfo(d.queue, g.CommandBufferType.PRIMARY)));
        mark('resources-and-shader');
        cmd.begin();
        caseInputs.push({
            operation: 'beginRenderPass-and-draw',
            formats: targets.map((t) => t.format),
            clear,
            depthClear,
            depthState: depthState
                ? { test: depthState.depthTest, write: depthState.depthWrite, func: depthState.depthFunc }
                : null,
            rasterizer: { enabled: rs.depthBiasEnabled, constant: rs.depthBias, slope: rs.depthBiasSlop },
            dynamicBias,
            attributes: attrs,
            vertexData: vertexData
                ? { type: vertexData.constructor.name, values: [...vertexData], stride: vertexStride }
                : null,
            instances,
            drawEnabled,
        });
        cmd.beginRenderPass(
            pass,
            fb,
            new g.Rect(0, 0, target.width, target.height),
            targets.map((_, i) => new g.Color(...(Array.isArray(clear[0]) ? clear[i] : clear))),
            depthClear,
            0,
        );
        mark('clear');
        cmd.bindPipelineState(ps);
        cmd.bindDescriptorSet(0, set);
        cmd.bindInputAssembler(ia);
        if (dynamicBias) cmd.setDepthBias(...dynamicBias);
        if (drawEnabled) cmd.draw(new g.DrawInfo(3, 0, 0, 0, 0, instances));
        cmd.endRenderPass();
        cmd.end();
        d.queue.submit([cmd]);
        readTarget = target;
        mark('draw');
        const program = gl.getParameter(gl.CURRENT_PROGRAM);
        if (program)
            shaderDiagnostics.push({
                name: info.name,
                linkStatus: gl.getProgramParameter(program, gl.LINK_STATUS),
                programLog: gl.getProgramInfoLog(program),
                stages: info.stages.map((stage) => ({ stage: stage.stage, source: stage.source })),
            });
        return { fb, shader };
    };
    const readCurrent = (out, x = 0, y = 0) => {
        const r = region();
        r.texOffset.x = x;
        r.texOffset.y = y;
        d.copyTextureToBuffers(readTarget, [out], [r]);
    };
    const rgba = () => {
        const out = new Uint8Array(4);
        readCurrent(out);
        return [...out];
    };
    const uint = () => {
        const out = new Uint32Array(4);
        readCurrent(out);
        return [...out];
    };
    const depthSource = (keep, mark) => {
        const source = keep(
            d.createTexture(
                new g.TextureInfo(
                    g.TextureType.TEX2D,
                    g.TextureUsageBit.SAMPLED | g.TextureUsageBit.DEPTH_STENCIL_ATTACHMENT,
                    g.Format.DEPTH_STENCIL,
                    1,
                    1,
                ),
            ),
        );
        const pass = keep(d.createRenderPass(new g.RenderPassInfo([], new g.DepthStencilAttachment(source.format))));
        const fb = keep(d.createFramebuffer(new g.FramebufferInfo(pass, [], source)));
        const cmd = keep(d.createCommandBuffer(new g.CommandBufferInfo(d.queue, g.CommandBufferType.PRIMARY)));
        cmd.begin();
        cmd.beginRenderPass(pass, fb, new g.Rect(0, 0, 1, 1), [], 0.75, 0);
        cmd.endRenderPass();
        cmd.end();
        d.queue.submit([cmd]);
        mark('depth-source-clear');
        return source;
    };
    await run(
        'WGL-01',
        'half-float-linear-capability',
        true,
        () => !!(d.getFormatFeatures(g.Format.RGBA16F) & g.FormatFeatureBit.LINEAR_FILTER),
    );
    await run('WGL-02', 'less-comparison-real-sampler-state', [gl.COMPARE_REF_TO_TEXTURE, gl.LESS], (keep, mark) => {
        const source = depthSource(keep, mark);
        draw(keep, mark, {
            target: keep(texture(g.Format.RGBA8)),
            sampled: source,
            samplerObject: sampler(g.Filter.POINT, g.ComparisonFunc.LESS),
            fragment:
                'uniform highp sampler2DShadow source;out vec4 color;void main(){color=vec4(texture(source,vec3(.5,.5,.5)));}',
        });
        const s = gl.getParameter(gl.SAMPLER_BINDING);
        return [gl.getSamplerParameter(s, gl.TEXTURE_COMPARE_MODE), gl.getSamplerParameter(s, gl.TEXTURE_COMPARE_FUNC)];
    });
    const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
    if (anisotropy)
        await run(
            'WGL-03',
            'anisotropy-four-real-sampler-state',
            Math.min(4, gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)),
            (keep, mark) => {
                const source = keep(texture(g.Format.RGBA8));
                upload([new Uint8Array([255, 0, 0, 255])], source, [region()]);
                draw(keep, mark, {
                    target: keep(texture(g.Format.RGBA8)),
                    sampled: source,
                    samplerObject: sampler(g.Filter.LINEAR, g.ComparisonFunc.ALWAYS, 4),
                    fragment: 'uniform sampler2D source;out vec4 color;void main(){color=texture(source,vec2(.5));}',
                });
                return gl.getSamplerParameter(
                    gl.getParameter(gl.SAMPLER_BINDING),
                    anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
                );
            },
        );
    else if (!selectedCases || selectedCases.includes('WGL-03'))
        results.push({ id: 'WGL-03', status: 'UNSUPPORTED', reason: 'EXT_texture_filter_anisotropic unavailable' });
    for (const dynamic of [false, true])
        await run('WGL-04', dynamic ? 'dynamic-state' : 'static-state', [true, -4, 1.25], (keep, mark) => {
            const rs = new g.RasterizerState();
            rs.depthBiasEnabled = true;
            rs.depthBias = -4;
            rs.depthBiasSlop = 1.25;
            draw(keep, mark, {
                target: keep(texture(g.Format.RGBA8)),
                rasterizer: rs,
                dynamicBias: dynamic ? [-4, 0, 1.25] : null,
                fragment: 'out vec4 color;void main(){color=vec4(1,0,0,1);}',
            });
            return [
                gl.isEnabled(gl.POLYGON_OFFSET_FILL),
                gl.getParameter(gl.POLYGON_OFFSET_UNITS),
                gl.getParameter(gl.POLYGON_OFFSET_FACTOR),
            ];
        });
    await run('WGL-05', 'integer-upload-and-native-integer-sampling', [16777217, 11, 13, 17], (keep, mark) => {
        const source = keep(texture(g.Format.RGBA32UI));
        upload([new Uint32Array([16777217, 11, 13, 17])], source, [region()]);
        mark('upload');
        draw(keep, mark, {
            target: keep(texture(g.Format.RGBA32UI)),
            sampled: source,
            fragment:
                'uniform highp usampler2D source;out uvec4 color;void main(){color=texelFetch(source,ivec2(0),0);}',
        });
        const value = uint();
        mark('public-native-readback');
        return value;
    });
    await run('WGL-06', 'integer-clear-only-no-covering-draw', [16777217, 2147483649, 13, 17], (keep, mark) => {
        draw(keep, mark, {
            target: keep(texture(g.Format.RGBA32UI)),
            clear: [16777217, 2147483649, 13, 17],
            drawEnabled: false,
            fragment: 'out uvec4 color;void main(){color=uvec4(0);}',
        });
        const value = uint();
        mark('public-native-readback');
        return value;
    });
    await run('WGL-07', 'uint-attribute-native-output', [16777217, 0, 0, 1], (keep, mark) => {
        draw(keep, mark, {
            target: keep(texture(g.Format.RGBA32UI)),
            attrs: [new g.Attribute('value', g.Format.R32UI, false)],
            vertexData: new Uint32Array([16777217, 16777217, 16777217]),
            vs: 'precision highp float;precision highp int;in uint value;flat out uint v;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);v=value;}',
            fragment: 'flat in uint v;out uvec4 color;void main(){color=uvec4(v,0u,0u,1u);}',
        });
        const value = uint();
        mark('public-native-readback');
        return value;
    });
    await run('WGL-08', 'array-attachment-view-nonzero-layer', 1, (keep, mark) => {
        const target = keep(texture(g.Format.RGBA8, g.TextureType.TEX2D_ARRAY, 1, 2));
        const view = keep(d.createTexture(new g.TextureViewInfo(target, target.type, target.format, 0, 1, 1, 1)));
        draw(keep, mark, { target: view, fragment: 'out vec4 color;void main(){color=vec4(1,0,0,1);}' });
        return gl.getFramebufferAttachmentParameter(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.FRAMEBUFFER_ATTACHMENT_TEXTURE_LAYER,
        );
    });
    await run('WGL-09', 'readback-byte-offset-and-row-layout', [99, 99, 255, 0, 0, 255, 99, 99], (keep, mark) => {
        const target = keep(texture(g.Format.RGBA8));
        draw(keep, mark, { target, fragment: 'out vec4 color;void main(){color=vec4(1,0,0,1);}' });
        const out = new Uint8Array(8).fill(99),
            r = region();
        r.buffOffset = 2;
        d.copyTextureToBuffers(target, [out], [r]);
        mark('public-readback');
        return [...out];
    });
    for (const filter of [g.Filter.LINEAR, g.Filter.POINT])
        await run(
            'WGL-01',
            filter === g.Filter.LINEAR ? 'half-float-linear-midpoint' : 'half-float-point-midpoint',
            filter === g.Filter.LINEAR
                ? {
                      channelRanges: [
                          [127, 128],
                          [127, 128],
                          [127, 128],
                          [255, 255],
                      ],
                  }
                : [255, 255, 255, 255],
            (keep, mark) => {
                const source = keep(texture(g.Format.RGBA16F, g.TextureType.TEX2D, 2));
                upload([new Uint16Array([0, 0, 0, 0x3c00, 0x3c00, 0x3c00, 0x3c00, 0x3c00])], source, [region(2)]);
                mark('upload');
                draw(keep, mark, {
                    target: keep(texture(g.Format.RGBA8)),
                    sampled: source,
                    samplerObject: sampler(filter),
                    fragment: 'uniform sampler2D source;out vec4 color;void main(){color=texture(source,vec2(.5));}',
                });
                const value = rgba();
                mark('public-native-readback');
                return value;
            },
        );
    for (const [name, compare, ref, expected] of [
        ['less-white', g.ComparisonFunc.LESS, 0.5, 255],
        ['less-equal-black', g.ComparisonFunc.LESS_EQUAL, 0.9, 0],
        ['greater-black', g.ComparisonFunc.GREATER, 0.5, 0],
        ['never-black', g.ComparisonFunc.NEVER, 0.5, 0],
    ])
        await run('WGL-02', name, [expected, expected, expected, 255], (keep, mark) => {
            draw(keep, mark, {
                target: keep(texture(g.Format.RGBA8)),
                sampled: depthSource(keep, mark),
                samplerObject: sampler(g.Filter.POINT, compare),
                fragment: `uniform highp sampler2DShadow source;out vec4 color;void main(){float v=texture(source,vec3(.5,.5,${ref}));color=vec4(v,v,v,1);}`,
            });
            const value = rgba();
            mark('public-native-readback');
            return value;
        });
    await run('REGRESSION', 'ordinary-depth-sampler', [191, 191, 191, 255], (keep, mark) => {
        draw(keep, mark, {
            target: keep(texture(g.Format.RGBA8)),
            sampled: depthSource(keep, mark),
            samplerObject: sampler(),
            fragment:
                'uniform sampler2D source;out vec4 color;void main(){float v=texture(source,vec2(.5)).r;color=vec4(v,v,v,1);}',
        });
        const value = rgba();
        mark('public-native-readback');
        return value;
    });
    if (anisotropy)
        for (const requested of [0, 1, 16, 1000])
            await run(
                'WGL-03',
                `anisotropy-${requested}`,
                Math.max(1, Math.min(requested, gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT))),
                (keep, mark) => {
                    const source = keep(texture(g.Format.RGBA8));
                    draw(keep, mark, {
                        target: keep(texture(g.Format.RGBA8)),
                        sampled: source,
                        samplerObject: sampler(g.Filter.LINEAR, g.ComparisonFunc.ALWAYS, requested),
                        fragment:
                            'uniform sampler2D source;out vec4 color;void main(){color=texture(source,vec2(.5));}',
                    });
                    return gl.getSamplerParameter(
                        gl.getParameter(gl.SAMPLER_BINDING),
                        anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
                    );
                },
            );
    await run('WGL-04', 'enabled-then-disabled', [false, 0, 0], (keep, mark) => {
        const rs = new g.RasterizerState();
        rs.depthBiasEnabled = true;
        rs.depthBias = -4;
        rs.depthBiasSlop = 1.25;
        const fragment = 'out vec4 color;void main(){color=vec4(1,0,0,1);}';
        draw(keep, mark, { target: keep(texture(g.Format.RGBA8)), rasterizer: rs, fragment });
        draw(keep, mark, { target: keep(texture(g.Format.RGBA8)), fragment });
        return [
            gl.isEnabled(gl.POLYGON_OFFSET_FILL),
            gl.getParameter(gl.POLYGON_OFFSET_UNITS),
            gl.getParameter(gl.POLYGON_OFFSET_FACTOR),
        ];
    });
    for (const format of ['R8UI', 'RG16UI', 'RGBA32UI', 'RGBA8I', 'RG16I', 'RGBA32I', 'RGB10A2UI'])
        await run(
            'WGL-05',
            `${format}-no-linear-capability`,
            false,
            () => !!(d.getFormatFeatures(g.Format[format]) & g.FormatFeatureBit.LINEAR_FILTER),
        );
    for (const [name, format, values, Data, integer] of [
        ['u8', g.Format.RGBA8UI, [0, 1, 255, 127], Uint8Array, 'u'],
        ['i8', g.Format.RGBA8I, [-128, -1, 0, 127], Int8Array, 'i'],
        ['u16', g.Format.RGBA16UI, [0, 1, 65535, 32767], Uint16Array, 'u'],
        ['i16', g.Format.RGBA16I, [-32768, -1, 0, 32767], Int16Array, 'i'],
        ['i32', g.Format.RGBA32I, [-16777217, -1, 0, 2147483647], Int32Array, 'i'],
    ])
        await run('WGL-05', `integer-upload-${name}`, values, (keep, mark) => {
            const source = keep(texture(format));
            upload([new Data(values)], source, [region()]);
            mark('upload');
            draw(keep, mark, {
                target: keep(texture(integer === 'u' ? g.Format.RGBA32UI : g.Format.RGBA32I)),
                sampled: source,
                fragment: `uniform highp ${integer}sampler2D source;out ${integer === 'u' ? 'uvec4' : 'ivec4'} color;void main(){color=texelFetch(source,ivec2(0),0);}`,
            });
            const out = integer === 'u' ? new Uint32Array(4) : new Int32Array(4);
            readCurrent(out);
            mark('public-native-readback');
            return [...out];
        });
    await run('WGL-06', 'signed-integer-clear-only', [-16777217, -2147483648, 0, 2147483647], (keep, mark) => {
        draw(keep, mark, {
            target: keep(texture(g.Format.RGBA32I)),
            clear: [-16777217, -2147483648, 0, 2147483647],
            drawEnabled: false,
            fragment: 'out ivec4 color;void main(){color=ivec4(0);}',
        });
        const out = new Int32Array(4);
        readCurrent(out);
        mark('public-native-readback');
        return [...out];
    });
    await run('WGL-08', 'array-attachment-layer1-render-sample-layer1', [255, 0, 0, 255], (keep, mark) => {
        const target = keep(texture(g.Format.RGBA8, g.TextureType.TEX2D_ARRAY, 1, 2));
        upload([new Uint8Array([0, 255, 0, 255]), new Uint8Array([0, 0, 255, 255])], target, [region(1, 0, 2)]);
        mark('sentinel-upload');
        const view = keep(d.createTexture(new g.TextureViewInfo(target, target.type, target.format, 0, 1, 1, 1)));
        draw(keep, mark, { target: view, fragment: 'out vec4 color;void main(){color=vec4(1,0,0,1);}' });
        draw(keep, mark, {
            target: keep(texture(g.Format.RGBA8)),
            sampled: target,
            input: g.Type.SAMPLER2D_ARRAY,
            fragment:
                'uniform highp sampler2DArray source;out vec4 color;void main(){color=texelFetch(source,ivec3(0,0,1),0);}',
        });
        const value = rgba();
        mark('public-native-readback');
        return value;
    });
    await run(
        'WGL-09',
        'capacity-prevalidation-preserves-sentinel',
        { rejected: true, output: [99, 99, 99] },
        (keep, mark) => {
            const target = keep(texture(g.Format.RGBA8)),
                out = new Uint8Array(3).fill(99);
            let rejected = false;
            try {
                d.copyTextureToBuffers(target, [out], [region()]);
            } catch {
                rejected = true;
            }
            mark('public-readback');
            return { rejected, output: [...out] };
        },
    );
    await run(
        'WGL-09',
        'readback-restores-active-public-fbo',
        { framebuffer: true, read: true, draw: true },
        (keep, mark) => {
            const target = keep(texture(g.Format.RGBA8));
            draw(keep, mark, {
                target: keep(texture(g.Format.RGBA8)),
                fragment: 'out vec4 color;void main(){color=vec4(1,0,0,1);}',
            });
            const before = [
                gl.getParameter(gl.FRAMEBUFFER_BINDING),
                gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
                gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
            ];
            d.copyTextureToBuffers(target, [new Uint8Array(4)], [region()]);
            mark('public-readback');
            return {
                framebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING) === before[0],
                read: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) === before[1],
                draw: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) === before[2],
            };
        },
    );
    await run(
        'WGL-06',
        'mixed-mrt-clear-native-readback',
        [
            [-16777217, -1, 0, 2147483647],
            [16777217, 2147483649, 0, 4294967295],
            {
                channelRanges: [
                    [255, 255],
                    [0, 0],
                    [127, 128],
                    [255, 255],
                ],
            },
        ],
        (keep, mark) => {
            const targets = [
                keep(texture(g.Format.RGBA32I)),
                keep(texture(g.Format.RGBA32UI)),
                keep(texture(g.Format.RGBA8)),
            ];
            draw(keep, mark, {
                targets,
                drawEnabled: false,
                clear: [
                    [-16777217, -1, 0, 2147483647],
                    [16777217, 2147483649, 0, 4294967295],
                    [1, 0, 0.5, 1],
                ],
                fragment: 'out ivec4 color;void main(){color=ivec4(0);}',
            });
            const outputs = [new Int32Array(4), new Uint32Array(4), new Uint8Array(4)];
            targets.forEach((t, i) => d.copyTextureToBuffers(t, [outputs[i]], [region()]));
            mark('public-readback');
            return outputs.map((v) => [...v]);
        },
    );
    for (const [name, constant, slope, enabled, geometry, blue] of [
        ['constant-plane', -4, 0, true, 'plane', true],
        ['slope-plane', 0, -1, true, 'plane', false],
        ['slope-tilted', 0, -1, true, 'tilted', true],
        ['disabled-plane', -4, 0, false, 'plane', false],
        ['geometry-positive-control', 0, 0, false, 'nearer', true],
    ])
        for (const dynamic of [false, true])
            await run(
                'WGL-04',
                `${name}-${dynamic ? 'dynamic' : 'static'}`,
                blue ? [0, 0, 255, 255] : [255, 0, 0, 255],
                (keep, mark) => {
                    const target = keep(texture(g.Format.RGBA8, g.TextureType.TEX2D, 16));
                    const depth = keep(
                        d.createTexture(
                            new g.TextureInfo(
                                g.TextureType.TEX2D,
                                g.TextureUsageBit.DEPTH_STENCIL_ATTACHMENT,
                                g.Format.DEPTH_STENCIL,
                                16,
                                1,
                            ),
                        ),
                    );
                    const ds = new g.DepthStencilState(true, true, g.ComparisonFunc.LESS);
                    const vertex = (nearer = false) =>
                        `precision highp float;precision highp int;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,${geometry === 'tilted' ? '(p.x-.5)*.25' : '0.'}${nearer ? '-.001' : ''},1.);}`;
                    draw(keep, mark, {
                        target,
                        depthTarget: depth,
                        depthState: ds,
                        vs: vertex(),
                        fragment: 'out vec4 color;void main(){color=vec4(1,0,0,1);}',
                    });
                    const rs = new g.RasterizerState();
                    rs.depthBiasEnabled = enabled;
                    rs.depthBias = constant;
                    rs.depthBiasSlop = slope;
                    draw(keep, mark, {
                        target,
                        depthTarget: depth,
                        depthState: ds,
                        load: true,
                        rasterizer: rs,
                        dynamicBias: dynamic ? [constant, 0, slope] : null,
                        vs: vertex(geometry === 'nearer'),
                        fragment: 'out vec4 color;void main(){color=vec4(0,0,1,1);}',
                    });
                    const value = new Uint8Array(4);
                    readCurrent(value, 8);
                    mark('public-native-readback');
                    return [...value];
                },
            );
    for (const layer of [0, 1])
        await run(
            'WGL-09',
            `array-native-readback-layer${layer}`,
            layer === 0 ? [7, 11, 13, 17] : [19, 23, 29, 31],
            (keep, mark) => {
                const target = keep(texture(g.Format.RGBA32UI, g.TextureType.TEX2D_ARRAY, 1, 2));
                upload([new Uint32Array([7, 11, 13, 17]), new Uint32Array([19, 23, 29, 31])], target, [
                    region(1, 0, 2),
                ]);
                mark('upload');
                const output = new Uint32Array(4);
                d.copyTextureToBuffers(target, [output], [region(1, layer)]);
                mark('public-readback');
                return [...output];
            },
        );
    await run('WGL-09', 'array-two-layer-readback', [7, 11, 13, 17, 19, 23, 29, 31], (keep, mark) => {
        const target = keep(texture(g.Format.RGBA32UI, g.TextureType.TEX2D_ARRAY, 1, 2));
        upload([new Uint32Array([7, 11, 13, 17]), new Uint32Array([19, 23, 29, 31])], target, [region(1, 0, 2)]);
        mark('upload');
        const output = new Uint32Array(8);
        d.copyTextureToBuffers(target, [output], [region(1, 0, 2)]);
        mark('public-readback');
        return [...output];
    });
    await run(
        'WGL-09',
        'typed-array-byteOffset-plus-buffOffset',
        [99, 99, 99, 99, 255, 0, 0, 255, 99, 99],
        (keep, mark) => {
            const target = keep(texture(g.Format.RGBA8));
            draw(keep, mark, { target, fragment: 'out vec4 color;void main(){color=vec4(1,0,0,1);}' });
            const backing = new Uint8Array(10).fill(99),
                view = new Uint8Array(backing.buffer, 2, 8),
                r = region();
            r.buffOffset = 2;
            d.copyTextureToBuffers(target, [view], [r]);
            mark('public-readback');
            return [...backing];
        },
    );
    for (const name of ['R8UI', 'RG16I', 'RGBA16F'])
        await run(
            'WGL-09',
            `${name}-native-output-layout`,
            name === 'R8UI' ? [255] : name === 'RG16I' ? [-32768, 32767] : [0x3c00, 0, 0x3800, 0x3c00],
            (keep, mark) => {
                const values =
                    name === 'R8UI'
                        ? new Uint8Array([255])
                        : name === 'RG16I'
                          ? new Int16Array([-32768, 32767])
                          : new Uint16Array([0x3c00, 0, 0x3800, 0x3c00]);
                const target = keep(texture(g.Format[name]));
                upload([values], target, [region()]);
                mark('upload');
                const output = new values.constructor(values.length);
                d.copyTextureToBuffers(target, [output], [region()]);
                mark('public-readback');
                return [...output];
            },
        );
    await run(
        'WGL-09',
        'batch-prevalidate-before-any-write',
        {
            rejected: true,
            outputs: [
                [99, 99, 99, 99],
                [99, 99, 99],
            ],
        },
        (keep, mark) => {
            const target = keep(texture(g.Format.RGBA8));
            draw(keep, mark, { target, fragment: 'out vec4 color;void main(){color=vec4(1,0,0,1);}' });
            const outputs = [new Uint8Array(4).fill(99), new Uint8Array(3).fill(99)];
            let rejected = false;
            try {
                d.copyTextureToBuffers(target, outputs, [region(), region()]);
            } catch {
                rejected = true;
            }
            mark('public-readback');
            return { rejected, outputs: outputs.map((o) => [...o]) };
        },
    );
    for (const width of [8, 16, 32])
        for (const signed of [false, true])
            for (const channels of [1, 2, 3, 4]) {
                const prefix = ['R', 'RG', 'RGB', 'RGBA'][channels - 1],
                    name = `${prefix}${width}${signed ? 'I' : 'UI'}`;
                const Data = signed
                    ? { 8: Int8Array, 16: Int16Array, 32: Int32Array }[width]
                    : { 8: Uint8Array, 16: Uint16Array, 32: Uint32Array }[width];
                const values = (
                    signed
                        ? {
                              8: [-128, -1, 0, 127],
                              16: [-32768, -1, 0, 32767],
                              32: [-16777217, -2147483648, 0, 2147483647],
                          }[width]
                        : { 8: [255, 1, 0, 127], 16: [65535, 1, 0, 32767], 32: [16777217, 2147483649, 0, 4294967295] }[
                              width
                          ]
                ).slice(0, channels);
                const expected = values.concat([0, 0, 0, 1].slice(channels));
                await run('WGL-05', `${name}-channel-width-sample`, expected, (keep, mark) => {
                    const source = keep(texture(g.Format[name]));
                    upload([new Data(values)], source, [region()]);
                    mark('upload');
                    draw(keep, mark, {
                        target: keep(texture(signed ? g.Format.RGBA32I : g.Format.RGBA32UI)),
                        sampled: source,
                        fragment: `uniform highp ${signed ? 'i' : 'u'}sampler2D source;out ${signed ? 'ivec4' : 'uvec4'} color;void main(){color=texelFetch(source,ivec2(0),0);}`,
                    });
                    const output = signed ? new Int32Array(4) : new Uint32Array(4);
                    readCurrent(output);
                    mark('public-native-readback');
                    return [...output];
                });
            }
    await run('WGL-05', 'RGB10A2UI-packed-upload-native-sample', [1023, 511, 17, 3], (keep, mark) => {
        const source = keep(texture(g.Format.RGB10A2UI));
        const packed = (1023 | (511 << 10) | (17 << 20) | (3 << 30)) >>> 0;
        upload([new Uint32Array([packed])], source, [region()]);
        mark('upload');
        draw(keep, mark, {
            target: keep(texture(g.Format.RGBA32UI)),
            sampled: source,
            fragment:
                'uniform highp usampler2D source;out uvec4 color;void main(){color=texelFetch(source,ivec2(0),0);}',
        });
        const value = uint();
        mark('public-native-readback');
        return value;
    });
    // Explicit backend-path selection only; all vertex binding still occurs in public gfx.
    // This does not alter WebGL state or make a failing draw succeed.
    for (const useVAO of [true, false])
        for (const variant of ['u32', 'i32', 'u8', 'i16', 'interleaved', 'instanced', 'normalized-u8']) {
            const signed = variant.startsWith('i'),
                normalized = variant === 'normalized-u8';
            const value = variant === 'u8' ? 255 : variant === 'i16' ? -32768 : signed ? -16777217 : 16777217;
            const format =
                variant === 'u8'
                    ? g.Format.R8UI
                    : variant === 'i16'
                      ? g.Format.R16I
                      : signed
                        ? g.Format.R32I
                        : g.Format.R32UI;
            const Data =
                variant === 'u8' || normalized
                    ? Uint8Array
                    : variant === 'i16'
                      ? Int16Array
                      : signed
                        ? Int32Array
                        : Uint32Array;
            const expected = normalized ? [255, 0, 128, 255] : [variant === 'instanced' ? value + 2 : value, 0, 0, 1];
            await run('WGL-07', `${useVAO ? 'vao' : 'non-vao'}-${variant}`, expected, (keep, mark) => {
                const previous = d.extensions.useVAO;
                d.extensions.useVAO = useVAO;
                try {
                    const instanced = variant === 'instanced',
                        interleaved = variant === 'interleaved';
                    const attrs = normalized
                        ? [new g.Attribute('value', g.Format.RGBA8, true)]
                        : [
                              ...(interleaved ? [new g.Attribute('unusedPad', g.Format.R32UI)] : []),
                              new g.Attribute('value', format, false, 0, instanced),
                          ];
                    const data = normalized
                        ? new Data([255, 0, 128, 255, 255, 0, 128, 255, 255, 0, 128, 255])
                        : interleaved
                          ? new Data([99, value, 99, value, 99, value])
                          : instanced
                            ? new Data([value, value + 2])
                            : new Data([value, value, value]);
                    const outputType = normalized ? 'vec4' : signed ? 'ivec4' : 'uvec4';
                    const attributeType = normalized ? 'vec4' : signed ? 'int' : 'uint';
                    draw(keep, mark, {
                        target: keep(
                            texture(normalized ? g.Format.RGBA8 : signed ? g.Format.RGBA32I : g.Format.RGBA32UI),
                        ),
                        attrs,
                        vertexData: data,
                        vertexStride: normalized ? 4 : interleaved ? 8 : Data.BYTES_PER_ELEMENT,
                        instances: instanced ? 2 : 0,
                        vs: `precision highp float;precision highp int;in ${attributeType} value;flat out ${attributeType} v;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);v=value;}`,
                        fragment: `flat in ${attributeType} v;out ${outputType} color;void main(){color=${normalized ? 'v' : `${outputType}(v,0,0,1)`};}`,
                    });
                    const output = normalized ? new Uint8Array(4) : signed ? new Int32Array(4) : new Uint32Array(4);
                    readCurrent(output);
                    mark('public-native-readback');
                    return [...output];
                } finally {
                    d.extensions.useVAO = previous;
                }
            });
        }
    for (const face of [0, 1, 2, 3, 4, 5])
        await run('WGL-08', `cube-face${face}-render-and-sample`, [255, 0, 0, 255], (keep, mark) => {
            const target = keep(texture(g.Format.RGBA8, g.TextureType.CUBE, 1, 6));
            const view = keep(
                d.createTexture(new g.TextureViewInfo(target, target.type, target.format, 0, 1, face, 1)),
            );
            draw(keep, mark, { target: view, fragment: 'out vec4 color;void main(){color=vec4(1,0,0,1);}' });
            const direction = ['1,0,0', '-1,0,0', '0,1,0', '0,-1,0', '0,0,1', '0,0,-1'][face];
            draw(keep, mark, {
                target: keep(texture(g.Format.RGBA8)),
                sampled: target,
                input: g.Type.SAMPLER_CUBE,
                fragment: `uniform samplerCube source;out vec4 color;void main(){color=texture(source,vec3(${direction}));}`,
            });
            const value = rgba();
            mark('public-native-readback');
            return value;
        });
    for (const layer of [0, 1])
        await run('WGL-08', `3d-slice${layer}-render-and-sample`, [255, 0, 0, 255], (keep, mark) => {
            const target = keep(texture(g.Format.RGBA8, g.TextureType.TEX3D, 1, 1, { depth: 2 }));
            const view = keep(
                d.createTexture(new g.TextureViewInfo(target, target.type, target.format, 0, 1, layer, 1)),
            );
            draw(keep, mark, { target: view, fragment: 'out vec4 color;void main(){color=vec4(1,0,0,1);}' });
            draw(keep, mark, {
                target: keep(texture(g.Format.RGBA8)),
                sampled: target,
                input: g.Type.SAMPLER3D,
                fragment: `uniform highp sampler3D source;out vec4 color;void main(){color=texelFetch(source,ivec3(0,0,${layer}),0);}`,
            });
            const value = rgba();
            mark('public-native-readback');
            return value;
        });
    await run('WGL-08', 'array-mip1-layer1-render-and-sample', [255, 0, 0, 255], (keep, mark) => {
        const target = keep(texture(g.Format.RGBA8, g.TextureType.TEX2D_ARRAY, 2, 2, { height: 2, levels: 2 }));
        const view = keep(d.createTexture(new g.TextureViewInfo(target, target.type, target.format, 1, 1, 1, 1)));
        draw(keep, mark, { target: view, fragment: 'out vec4 color;void main(){color=vec4(1,0,0,1);}' });
        const probe = new Uint8Array(4);
        d.copyTextureToBuffers(view, [probe], [region()]);
        caseInputs.push({ operation: 'diagnostic-view-relative-native-readback', actual: [...probe] });
        draw(keep, mark, {
            target: keep(texture(g.Format.RGBA8)),
            sampled: target,
            input: g.Type.SAMPLER2D_ARRAY,
            samplerObject: d.getSampler(
                new g.SamplerInfo(
                    g.Filter.POINT,
                    g.Filter.POINT,
                    g.Filter.POINT,
                    g.Address.CLAMP,
                    g.Address.CLAMP,
                    g.Address.CLAMP,
                ),
            ),
            fragment:
                'uniform highp sampler2DArray source;out vec4 color;void main(){color=texelFetch(source,ivec3(0,0,1),1);}',
        });
        const value = rgba();
        mark('public-native-readback');
        return value;
    });
    await run('WGL-08', 'depth-array-layer1-clear-and-ordinary-sample', [191, 191, 191, 255], (keep, mark) => {
        const depth = keep(
            d.createTexture(
                new g.TextureInfo(
                    g.TextureType.TEX2D_ARRAY,
                    g.TextureUsageBit.SAMPLED | g.TextureUsageBit.DEPTH_STENCIL_ATTACHMENT,
                    g.Format.DEPTH_STENCIL,
                    1,
                    1,
                    g.TextureFlagBit.NONE,
                    2,
                ),
            ),
        );
        const view = keep(d.createTexture(new g.TextureViewInfo(depth, depth.type, depth.format, 0, 1, 1, 1)));
        draw(keep, mark, {
            target: keep(texture(g.Format.RGBA8)),
            depthTarget: view,
            depthClear: 0.75,
            fragment: 'out vec4 color;void main(){color=vec4(1,0,0,1);}',
        });
        draw(keep, mark, {
            target: keep(texture(g.Format.RGBA8)),
            sampled: depth,
            input: g.Type.SAMPLER2D_ARRAY,
            fragment:
                'uniform highp sampler2DArray source;out vec4 color;void main(){float v=texelFetch(source,ivec3(0,0,1),0).r;color=vec4(v,v,v,1);}',
        });
        const value = rgba();
        mark('public-native-readback');
        return value;
    });
    for (const invalid of ['layer', 'mip', '3d-mip-slice'])
        await run('WGL-08', `reject-invalid-${invalid}`, true, (keep) => {
            const target = keep(
                texture(
                    g.Format.RGBA8,
                    invalid === '3d-mip-slice' ? g.TextureType.TEX3D : g.TextureType.TEX2D_ARRAY,
                    2,
                    2,
                    { height: 2, levels: 2, depth: 2 },
                ),
            );
            try {
                keep(
                    d.createTexture(
                        new g.TextureViewInfo(
                            target,
                            target.type,
                            target.format,
                            invalid === 'mip' ? 2 : invalid === '3d-mip-slice' ? 1 : 0,
                            1,
                            invalid === 'layer' ? 2 : invalid === '3d-mip-slice' ? 1 : 0,
                            1,
                        ),
                    ),
                );
                return false;
            } catch {
                return true;
            }
        });
    await run(
        'WGL-09',
        'two-regions-independent-buffers',
        [
            [1, 2, 3, 4],
            [5, 6, 7, 8],
        ],
        (keep, mark) => {
            const target = keep(texture(g.Format.RGBA8, g.TextureType.TEX2D, 2));
            upload([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], target, [region(2)]);
            mark('upload');
            const first = region(),
                second = region();
            second.texOffset.x = 1;
            const outputs = [new Uint8Array(4), new Uint8Array(4)];
            d.copyTextureToBuffers(target, outputs, [first, second]);
            mark('public-readback');
            return outputs.map((v) => [...v]);
        },
    );
    await run(
        'WGL-09',
        'two-layer-two-row-stride-and-layer-pitch',
        (() => {
            const expected = new Array(58).fill(99);
            for (let layer = 0; layer < 2; layer++)
                for (let row = 0; row < 2; row++)
                    for (let i = 0; i < 8; i++) expected[2 + layer * 36 + row * 12 + i] = layer * 16 + row * 8 + i + 1;
            return expected;
        })(),
        (keep, mark) => {
            const target = keep(texture(g.Format.RGBA8, g.TextureType.TEX2D_ARRAY, 2, 2, { height: 2 }));
            const r = region(2, 0, 2);
            r.texExtent.height = 2;
            upload(
                [
                    new Uint8Array(Array.from({ length: 16 }, (_, i) => i + 1)),
                    new Uint8Array(Array.from({ length: 16 }, (_, i) => i + 17)),
                ],
                target,
                [r],
            );
            mark('upload');
            r.buffOffset = 2;
            r.buffStride = 3;
            r.buffTexHeight = 3;
            const output = new Uint8Array(58).fill(99);
            d.copyTextureToBuffers(target, [output], [r]);
            mark('public-readback');
            return [...output];
        },
    );
    await run('WGL-09', '3d-two-slice-native-readback', [7, 11, 13, 17, 19, 23, 29, 31], (keep, mark) => {
        const target = keep(texture(g.Format.RGBA32UI, g.TextureType.TEX3D, 1, 1, { depth: 2 }));
        const r = region();
        r.texExtent.depth = 2;
        upload([new Uint32Array([7, 11, 13, 17, 19, 23, 29, 31])], target, [r]);
        mark('upload');
        const output = new Uint32Array(8);
        d.copyTextureToBuffers(target, [output], [r]);
        mark('public-readback');
        return [...output];
    });
    for (const face of [0, 5])
        await run('WGL-09', `cube-face${face}-native-readback`, [face + 1, 11, 13, 255], (keep, mark) => {
            const target = keep(texture(g.Format.RGBA8, g.TextureType.CUBE, 1, 6));
            upload(
                Array.from({ length: 6 }, (_, i) => new Uint8Array([i + 1, 11, 13, 255])),
                target,
                [region(1, 0, 6)],
            );
            mark('upload');
            const output = new Uint8Array(4);
            d.copyTextureToBuffers(target, [output], [region(1, face)]);
            mark('public-readback');
            return [...output];
        });
    await run('WGL-09', 'view-relative-mip-and-layer-readback', [7, 11, 13, 17], (keep, mark) => {
        const target = keep(texture(g.Format.RGBA8, g.TextureType.TEX2D_ARRAY, 2, 2, { height: 2, levels: 2 }));
        const source = region(1, 1);
        source.texSubres.mipLevel = 1;
        upload([new Uint8Array([7, 11, 13, 17])], target, [source]);
        mark('upload');
        const view = keep(d.createTexture(new g.TextureViewInfo(target, target.type, target.format, 1, 1, 1, 1)));
        const output = new Uint8Array(4);
        d.copyTextureToBuffers(view, [output], [region()]);
        mark('public-readback');
        return [...output];
    });
    for (const invalid of ['x', 'layer', 'mip', 'z', 'destroyed', 'packed', 'depth'])
        await run(
            'WGL-09',
            `prevalidate-${invalid}-preserves-output-and-state`,
            {
                rejected: true,
                output: [99, 99, 99, 99],
                framebuffer: true,
                read: true,
                draw: true,
                pack: true,
                pbo: true,
            },
            (keep, mark) => {
                const target = keep(
                    texture(
                        invalid === 'packed'
                            ? g.Format.RGB10A2UI
                            : invalid === 'depth'
                              ? g.Format.DEPTH_STENCIL
                              : g.Format.RGBA8,
                    ),
                );
                draw(keep, mark, {
                    target: keep(texture(g.Format.RGBA8)),
                    fragment: 'out vec4 color;void main(){color=vec4(1,0,0,1);}',
                });
                const names = [
                    gl.FRAMEBUFFER_BINDING,
                    gl.READ_FRAMEBUFFER_BINDING,
                    gl.DRAW_FRAMEBUFFER_BINDING,
                    gl.PACK_ALIGNMENT,
                    gl.PIXEL_PACK_BUFFER_BINDING,
                ];
                const before = names.map((n) => gl.getParameter(n));
                const r = region(),
                    output = new Uint8Array(4).fill(99);
                if (invalid === 'x') r.texOffset.x = 1;
                if (invalid === 'layer') r.texSubres.baseArrayLayer = 1;
                if (invalid === 'mip') r.texSubres.mipLevel = 1;
                if (invalid === 'z') r.texOffset.z = 1;
                if (invalid === 'destroyed') target.destroy();
                let rejected = false;
                try {
                    d.copyTextureToBuffers(target, [output], [r]);
                } catch {
                    rejected = true;
                }
                mark('public-readback');
                const same = names.map((n, i) => gl.getParameter(n) === before[i]);
                return {
                    rejected,
                    output: [...output],
                    framebuffer: same[0],
                    read: same[1],
                    draw: same[2],
                    pack: same[3],
                    pbo: same[4],
                };
            },
        );
    await run('WGL-09', 'successful-readback-then-load-draw', [0, 0, 255, 255], (keep, mark) => {
        const target = keep(texture(g.Format.RGBA8));
        draw(keep, mark, { target, fragment: 'out vec4 color;void main(){color=vec4(1,0,0,1);}' });
        d.copyTextureToBuffers(target, [new Uint8Array(4)], [region()]);
        mark('public-readback');
        draw(keep, mark, { target, load: true, fragment: 'out vec4 color;void main(){color=vec4(0,0,1,1);}' });
        const value = rgba();
        mark('public-native-readback');
        return value;
    });
    await run(
        'WGL-01',
        'AirRenderTarget-explicit-hdr-linear',
        { format: 'rgba16f', filter: 'linear', complete: true },
        (keep) => {
            const target = cc.createAirRenderTarget({
                width: 2,
                height: 1,
                colorFormat: 'rgba16f',
                filter: 'linear',
                depthFormat: 'none',
            });
            keep({ destroy: () => target.dispose() });
            return {
                format: target.info.effective.colorFormat,
                filter: target.info.effective.filter,
                complete: target.info.framebufferComplete,
            };
        },
    );
    for (const value of [-1, 0.5, NaN, Infinity])
        await run('WGL-03', `reject-anisotropy-${String(value)}`, true, () => {
            try {
                sampler(g.Filter.LINEAR, g.ComparisonFunc.ALWAYS, value);
                return false;
            } catch {
                return true;
            }
        });
    await run(
        'WGL-02',
        'comparison-sampler-destroy-and-cache-recreate',
        { recreated: true, mode: gl.COMPARE_REF_TO_TEXTURE, func: gl.EQUAL },
        (keep, mark) => {
            const source = depthSource(keep, mark),
                target = keep(texture(g.Format.RGBA8));
            const make = () => sampler(g.Filter.POINT, g.ComparisonFunc.EQUAL, 2);
            const first = make();
            const drawSampler = (samplerObject) =>
                draw(keep, mark, {
                    target,
                    sampled: source,
                    samplerObject,
                    fragment:
                        'uniform highp sampler2DShadow source;out vec4 color;void main(){color=vec4(texture(source,vec3(.5,.5,.75)));}',
                });
            drawSampler(first);
            const old = gl.getParameter(gl.SAMPLER_BINDING);
            first.destroy();
            mark('sampler-destroy');
            drawSampler(make());
            const recreated = gl.getParameter(gl.SAMPLER_BINDING);
            return {
                recreated: old !== recreated,
                mode: gl.getSamplerParameter(recreated, gl.TEXTURE_COMPARE_MODE),
                func: gl.getSamplerParameter(recreated, gl.TEXTURE_COMPARE_FUNC),
            };
        },
    );
    await run('WGL-05', 'integer-linear-filter-rejected-without-gl-error', true, (keep, mark) => {
        const source = keep(texture(g.Format.RGBA32UI));
        upload([new Uint32Array([7, 11, 13, 17])], source, [region()]);
        mark('upload');
        try {
            draw(keep, mark, {
                target: keep(texture(g.Format.RGBA32UI)),
                sampled: source,
                samplerObject: sampler(g.Filter.LINEAR),
                fragment:
                    'uniform highp usampler2D source;out uvec4 color;void main(){color=texelFetch(source,ivec2(0),0);}',
            });
            return false;
        } catch (error) {
            return String(error).includes('WEBGL2_INTEGER_TEXTURE_FILTER');
        }
    });
    for (const value of [0.5, -1, 4294967296, NaN, Infinity])
        await run('WGL-06', `integer-clear-reject-${String(value)}`, true, (keep, mark) => {
            try {
                draw(keep, mark, {
                    target: keep(texture(g.Format.RGBA32UI)),
                    clear: [value, 0, 0, 1],
                    drawEnabled: false,
                    fragment: 'out uvec4 color;void main(){color=uvec4(0);}',
                });
                return false;
            } catch (error) {
                return String(error).includes('WEBGL2_INTEGER_CLEAR');
            }
        });
    await run(
        'WGL-08',
        'multi-layer-attachment-selects-base-only',
        [
            [255, 0, 0, 255],
            [0, 0, 255, 255],
        ],
        (keep, mark) => {
            const target = keep(texture(g.Format.RGBA8, g.TextureType.TEX2D_ARRAY, 1, 2));
            upload([new Uint8Array([0, 255, 0, 255]), new Uint8Array([0, 0, 255, 255])], target, [region(1, 0, 2)]);
            mark('sentinel-upload');
            const view = keep(d.createTexture(new g.TextureViewInfo(target, target.type, target.format, 0, 1, 0, 2)));
            draw(keep, mark, { target: view, fragment: 'out vec4 color;void main(){color=vec4(1,0,0,1);}' });
            const outputs = [new Uint8Array(4), new Uint8Array(4)];
            d.copyTextureToBuffers(target, outputs, [region(1, 0), region(1, 1)]);
            mark('public-native-readback');
            return outputs.map((v) => [...v]);
        },
    );
    await run('WGL-08', 'owned-texture-resize-framebuffer-rebuild', [0, 0, 255, 255], (keep, mark) => {
        const target = keep(texture(g.Format.RGBA8));
        const first = draw(keep, mark, { target, fragment: 'out vec4 color;void main(){color=vec4(1,0,0,1);}' });
        target.resize(2, 2);
        mark('texture-resize');
        const cmd = keep(d.createCommandBuffer(new g.CommandBufferInfo(d.queue, g.CommandBufferType.PRIMARY)));
        cmd.begin();
        cmd.beginRenderPass(first.fb.renderPass, first.fb, new g.Rect(0, 0, 2, 2), [new g.Color(0, 0, 1, 1)], 1, 0);
        cmd.endRenderPass();
        cmd.end();
        d.queue.submit([cmd]);
        mark('framebuffer-rebuild-clear');
        const output = new Uint8Array(4);
        const r = region();
        r.texOffset.x = r.texOffset.y = 1;
        d.copyTextureToBuffers(target, [output], [r]);
        mark('public-native-readback');
        return [...output];
    });
    await run('WGL-09', 'successful-readback-then-blit', [255, 0, 0, 255], (keep, mark) => {
        const source = keep(texture(g.Format.RGBA8)),
            target = keep(texture(g.Format.RGBA8));
        draw(keep, mark, { target: source, fragment: 'out vec4 color;void main(){color=vec4(1,0,0,1);}' });
        d.copyTextureToBuffers(source, [new Uint8Array(4)], [region()]);
        mark('public-readback');
        const blit = new g.TextureBlit();
        blit.srcExtent = blit.dstExtent = new g.Extent(1, 1, 1);
        const cmd = keep(d.createCommandBuffer(new g.CommandBufferInfo(d.queue, g.CommandBufferType.PRIMARY)));
        cmd.begin();
        cmd.blitTexture(source, target, [blit], g.Filter.POINT);
        cmd.end();
        d.queue.submit([cmd]);
        mark('public-blit');
        const output = new Uint8Array(4);
        d.copyTextureToBuffers(target, [output], [region()]);
        mark('public-native-readback');
        return [...output];
    });
    await run('REGRESSION', 'rgba8-clear-draw-native-pixel', [255, 0, 0, 255], (keep, mark) => {
        draw(keep, mark, {
            target: keep(texture(g.Format.RGBA8)),
            fragment: 'out vec4 color;void main(){color=vec4(1,0,0,1);}',
        });
        const value = rgba();
        mark('public-native-readback');
        return value;
    });
    window.__wglContracts = {
        ready: true,
        results,
        startupErrors,
        device: d.constructor.name,
        renderer: gl.getParameter(gl.RENDERER),
        vendor: gl.getParameter(gl.VENDOR),
        version: gl.getParameter(gl.VERSION),
        contextAttributes: gl.getContextAttributes(),
        supportedExtensions: gl.getSupportedExtensions(),
        formatCapabilities: Object.fromEntries(
            ['R16F', 'RG16F', 'RGB16F', 'RGBA16F', 'RGBA32F', 'RGBA32UI', 'RGB10A2UI'].map((name) => [
                name,
                d.getFormatFeatures(g.Format[name]),
            ]),
        ),
        pausedForAssertions: true,
        diagnostics: 'Raw GL state queries only; public gfx applies all writes and native readback',
    };
} catch (error) {
    window.__wglContracts = { ready: true, results, startupException: String(error.stack || error) };
}
