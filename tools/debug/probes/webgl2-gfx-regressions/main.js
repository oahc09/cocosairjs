const cc = await import('/build/cocosair.module.js');
const report = (window.__wglRegressions = { ready: false, results: [] });
try {
    cc.macro.ENABLE_WEBGL_ANTIALIAS = false;
    const app = await cc.createAirApp({ canvas: '#GameCanvas' });
    const scene = new cc.Scene('ordinary-path-regressions');
    const cameraNode = new cc.Node('Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(0, 1, 5);
    const camera = cameraNode.addComponent(cc.Camera);
    camera.projection = cc.Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 2;
    camera.near = 0.1;
    camera.far = 100;
    camera.clearColor = new cc.Color(0, 0, 255, 255);
    camera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
    app.run(scene);
    cc.game.pause();
    const d = cc.director.root.device;
    const g = cc.gfx;
    const gl = d.gl;
    const errors = () => {
        const values = [];
        for (let i = 0; i < 32; ++i) {
            const error = gl.getError();
            if (!error) break;
            values.push(error);
        }
        return values;
    };
    report.startupErrors = errors();
    report.renderer = {
        version: gl.getParameter(gl.VERSION),
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER),
    };
    const run = async (id, body) => {
        const owned = [];
        const result = { id, stages: { preExisting: errors() }, expected: {}, actual: {}, cleanup: [] };
        const keep = (resource, release = () => resource.destroy()) => {
            owned.push({ resource, release });
            return resource;
        };
        const mark = (name) => (result.stages[name] = errors());
        try {
            await body({ keep, mark, result });
        } catch (error) {
            result.exception = String(error.stack || error);
        } finally {
            for (const entry of owned.reverse()) {
                try {
                    await entry.release();
                    result.cleanup.push({ type: entry.resource.constructor.name, released: true });
                } catch (error) {
                    result.cleanup.push({
                        type: entry.resource.constructor.name,
                        released: false,
                        error: String(error),
                    });
                }
            }
            cc.director.tick(0);
            mark('cleanup');
        }
        result.resources = { created: owned.length, released: result.cleanup.filter((item) => item.released).length };
        result.status =
            !result.exception &&
            result.matched &&
            Object.values(result.stages).every((values) => !values.length) &&
            result.cleanup.every((item) => item.released)
                ? 'PASS'
                : 'FAIL';
        report.results.push(result);
    };
    const read = (texture, x = 0, y = 0) => {
        const region = new g.BufferTextureCopy();
        region.texOffset.x = x;
        region.texOffset.y = y;
        region.texExtent = new g.Extent(1, 1, 1);
        const output = new Uint8Array(4);
        d.copyTextureToBuffers(texture, [output], [region]);
        return [...output];
    };
    const preview = (texture, name) => {
        const region = new g.BufferTextureCopy();
        region.texExtent = new g.Extent(texture.width, texture.height, 1);
        const pixels = new Uint8Array(texture.width * texture.height * 4);
        d.copyTextureToBuffers(texture, [pixels], [region]);
        const label = document.createElement('div');
        label.textContent = name + ' (public GPU readback preview, not direct compositor evidence)';
        document.body.appendChild(label);
        const canvas = document.createElement('canvas');
        canvas.width = texture.width;
        canvas.height = texture.height;
        canvas.style.width = '256px';
        canvas.style.height = '256px';
        const flipped = new Uint8ClampedArray(pixels.length);
        const rowBytes = texture.width * 4;
        for (let row = 0; row < texture.height; ++row) {
            flipped.set(pixels.subarray(row * rowBytes, (row + 1) * rowBytes), (texture.height - row - 1) * rowBytes);
        }
        canvas.getContext('2d').putImageData(new ImageData(flipped, texture.width, texture.height), 0, 0);
        document.body.appendChild(canvas);
    };
    await run('real-time-native-skinning', async ({ keep, mark, result }) => {
        const assetURL = '/examples/gltf-skin/assets/';
        const document = await (await fetch(assetURL + 'SimpleSkin.gltf')).text();
        const asset = keep(await new cc.GLTFLoader().parseAsync(document, assetURL));
        const instance = keep(asset.instantiate(), () => instance.dispose());
        scene.addChild(instance.root);
        for (const animation of instance.root.getComponentsInChildren(cc.Animation)) animation.enabled = false;
        const renderers = instance.root.getComponentsInChildren(cc.SkinnedMeshRenderer);
        const material = keep(new cc.Material());
        material.initialize({ effectName: 'builtin-unlit' });
        material.setProperty('mainColor', new cc.Color(255, 0, 0, 255));
        for (const renderer of renderers) {
            renderer.setSharedMaterial(material, 0);
            renderer.uploadAnimation(null);
        }
        const joint = instance.root.getChildByPath('node__1/node__2');
        if (!joint || renderers.length !== 1) throw new Error('SimpleSkin fixture topology mismatch');
        const target = keep(new cc.RenderTexture(), () => {
            camera.targetTexture = null;
            target.destroy();
        });
        target.initialize({ width: 128, height: 128 });
        camera.targetTexture = target;
        mark('resource-and-material-creation');
        const texture = target.getGFXTexture();
        const sample = () => [read(texture, 64, 88), read(texture, 40, 64)];
        joint.setRotationFromEuler(0, 0, 0);
        cc.director.tick(1 / 60);
        cc.director.tick(1 / 60);
        result.actual.rest = sample();
        preview(texture, 'SimpleSkin rest');
        mark('rest-draw-and-read');
        joint.setRotationFromEuler(0, 0, 90);
        cc.director.tick(1 / 60);
        result.actual.bent = sample();
        preview(texture, 'SimpleSkin 90 degree native joint pose');
        mark('bent-draw-and-read');
        result.actual.modelType = renderers[0].model?.constructor.name;
        result.actual.jointRotation = [joint.rotation.x, joint.rotation.y, joint.rotation.z, joint.rotation.w];
        result.expected = {
            camera: { projection: 'orthographic', center: [0, 1], halfHeight: 2, target: [128, 128] },
            worldSamples: [
                [0, 1.75],
                [-0.75, 1],
            ],
            rest: ['red skin', 'blue background'],
            bent: ['blue background', 'red skin'],
            modelType: 'SkinningModel',
            pose: 'joint 2 rotates 90 degrees about Z; native JOINTS_0 and WEIGHTS_0 deform original mesh',
        };
        const red = (pixel) => pixel[0] >= 180 && pixel[1] <= 5 && pixel[2] <= 5 && pixel[3] === 255;
        const blue = (pixel) => pixel[0] <= 5 && pixel[1] <= 5 && pixel[2] >= 180 && pixel[3] === 255;
        result.matched =
            red(result.actual.rest[0]) &&
            blue(result.actual.rest[1]) &&
            blue(result.actual.bent[0]) &&
            red(result.actual.bent[1]) &&
            result.actual.modelType === 'SkinningModel';
    });
    camera.visibility = 0;
    await run('msaa-resolve-resize-readback-draw-blit', async ({ keep, mark, result }) => {
        const samples = [...gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA8, gl.SAMPLES)];
        result.actual.supportedSamples = samples;
        const count = samples.find((value) => value >= 2);
        if (!count) throw new Error('No multisampled RGBA8 renderbuffer available');
        const texture = (width, height, sampleCount = g.SampleCount.X1) =>
            keep(
                d.createTexture(
                    new g.TextureInfo(
                        g.TextureType.TEX2D,
                        g.TextureUsageBit.COLOR_ATTACHMENT |
                            g.TextureUsageBit.TRANSFER_SRC |
                            g.TextureUsageBit.TRANSFER_DST |
                            g.TextureUsageBit.SAMPLED,
                        g.Format.RGBA8,
                        width,
                        height,
                        g.TextureFlagBit.NONE,
                        1,
                        1,
                        sampleCount,
                    ),
                ),
            );
        const multisample = texture(4, 4, count);
        const resolved = texture(4, 4);
        const destination = texture(4, 4);
        const pass = keep(d.createRenderPass(new g.RenderPassInfo([new g.ColorAttachment(g.Format.RGBA8)])));
        const multisamplePass = keep(
            d.createRenderPass(new g.RenderPassInfo([new g.ColorAttachment(g.Format.RGBA8, count)])),
        );
        const framebuffer = keep(d.createFramebuffer(new g.FramebufferInfo(multisamplePass, [multisample])));
        const shaderInfo = new g.ShaderInfo();
        shaderInfo.name = 'OrdinaryMSAARegression';
        shaderInfo.stages = [
            new g.ShaderStage(
                g.ShaderStageFlagBit.VERTEX,
                'precision highp float; void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}',
            ),
            new g.ShaderStage(
                g.ShaderStageFlagBit.FRAGMENT,
                'precision highp float;out vec4 color;void main(){color=vec4(0.,1.,0.,1.);}',
            ),
        ];
        const shader = keep(d.createShader(shaderInfo));
        const layout = keep(d.createDescriptorSetLayout(new g.DescriptorSetLayoutInfo([])));
        const pipelineLayout = keep(d.createPipelineLayout(new g.PipelineLayoutInfo([layout])));
        const set = keep(d.createDescriptorSet(new g.DescriptorSetInfo(layout)));
        const vertices = keep(
            d.createBuffer(new g.BufferInfo(g.BufferUsageBit.VERTEX, g.MemoryUsageBit.DEVICE, 12, 4)),
        );
        vertices.update(new Float32Array([0, 0, 0]));
        const input = keep(d.createInputAssembler(new g.InputAssemblerInfo([], [vertices])));
        const rasterizer = new g.RasterizerState();
        rasterizer.cullMode = g.CullMode.NONE;
        const pipeline = keep(
            d.createPipelineState(
                new g.PipelineStateInfo(
                    shader,
                    pipelineLayout,
                    pass,
                    new g.InputState([]),
                    rasterizer,
                    new g.DepthStencilState(false, false),
                ),
            ),
        );
        const multisamplePipeline = keep(
            d.createPipelineState(
                new g.PipelineStateInfo(
                    shader,
                    pipelineLayout,
                    multisamplePass,
                    new g.InputState([]),
                    rasterizer,
                    new g.DepthStencilState(false, false),
                ),
            ),
        );
        const commands = keep(d.createCommandBuffer(new g.CommandBufferInfo(d.queue, g.CommandBufferType.PRIMARY)));
        const draw = (fb, width, height) => {
            commands.begin();
            commands.beginRenderPass(
                fb.renderPass,
                fb,
                new g.Rect(0, 0, width, height),
                [new g.Color(1, 0, 0, 1)],
                1,
                0,
            );
            commands.bindPipelineState(fb === framebuffer ? multisamplePipeline : pipeline);
            commands.bindDescriptorSet(0, set);
            commands.bindInputAssembler(input);
            commands.draw(new g.DrawInfo(3));
            commands.endRenderPass();
            commands.end();
            d.queue.submit([commands]);
        };
        const blit = (source, target, width, height) => {
            const region = new g.TextureBlit();
            region.srcExtent = new g.Extent(width, height, 1);
            region.dstExtent = new g.Extent(width, height, 1);
            commands.begin();
            commands.blitTexture(source, target, [region], g.Filter.POINT);
            commands.end();
            d.queue.submit([commands]);
        };
        mark('resource-and-shader-creation');
        draw(framebuffer, 4, 4);
        mark('multisample-draw');
        blit(multisample, resolved, 4, 4);
        result.actual.resolved = read(resolved, 2, 2);
        mark('resolve-and-read');
        const ordinaryFramebuffer = keep(d.createFramebuffer(new g.FramebufferInfo(pass, [resolved])));
        resolved.resize(8, 8);
        destination.resize(8, 8);
        draw(ordinaryFramebuffer, 8, 8);
        result.actual.resized = read(resolved, 4, 4);
        mark('resize-existing-framebuffer-draw-read');
        draw(ordinaryFramebuffer, 8, 8);
        blit(resolved, destination, 8, 8);
        result.actual.afterReadDrawBlit = read(destination, 4, 4);
        mark('read-followed-by-draw-blit-read');
        const program = gl.getParameter(gl.CURRENT_PROGRAM);
        result.actual.shader = {
            link: gl.getProgramParameter(program, gl.LINK_STATUS),
            log: gl.getProgramInfoLog(program),
        };
        result.actual.framebufferDimensions = [ordinaryFramebuffer.width, ordinaryFramebuffer.height];
        result.expected = {
            resolved: [0, 255, 0, 255],
            resized: [0, 255, 0, 255],
            afterReadDrawBlit: [0, 255, 0, 255],
            framebufferDimensions: [8, 8],
        };
        result.matched =
            ['resolved', 'resized', 'afterReadDrawBlit'].every(
                (name) => JSON.stringify(result.actual[name]) === JSON.stringify(result.expected[name]),
            ) &&
            JSON.stringify(result.actual.framebufferDimensions) === '[8,8]' &&
            result.actual.shader.link;
    });
    report.appRelease = await app.close();
    report.finalErrors = errors();
} catch (error) {
    report.startupException = String(error.stack || error);
}
report.ready = true;
document.body.dataset.status = report.results.every((result) => result.status === 'PASS') ? 'PASS' : 'FAIL';
