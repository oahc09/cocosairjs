const cc = await import('/build/cocosair.module.js');
const report = (window.__wglPresentation = { ready: false, frames: 0, errors: [], cleanup: [] });
try {
    cc.macro.ENABLE_WEBGL_ANTIALIAS = false;
    const app = await cc.createAirApp({ canvas: '#GameCanvas' });
    const scene = new cc.Scene('native-presentation');
    app.run(scene);
    const root = cc.director.root;
    const d = root.device;
    const g = cc.gfx;
    const gl = d.gl;
    const canvas = document.getElementById('GameCanvas');
    const owned = [];
    const keep = (resource) => {
        owned.push(resource);
        return resource;
    };
    const errors = () => {
        for (let i = 0; i < 32; i++) {
            const value = gl.getError();
            if (!value) break;
            report.errors.push(value);
        }
    };
    const target = keep(
        d.createTexture(
            new g.TextureInfo(
                g.TextureType.TEX2D,
                g.TextureUsageBit.COLOR_ATTACHMENT | g.TextureUsageBit.TRANSFER_SRC,
                g.Format.RGBA8,
                32,
                32,
            ),
        ),
    );
    const pass = keep(d.createRenderPass(new g.RenderPassInfo([new g.ColorAttachment(g.Format.RGBA8)])));
    const framebuffer = keep(d.createFramebuffer(new g.FramebufferInfo(pass, [target])));
    const shaderInfo = new g.ShaderInfo();
    shaderInfo.name = 'NativePresentationQuadrants';
    shaderInfo.stages = [
        new g.ShaderStage(
            g.ShaderStageFlagBit.VERTEX,
            'precision highp float;out vec2 uv;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}',
        ),
        new g.ShaderStage(
            g.ShaderStageFlagBit.FRAGMENT,
            'precision highp float;in vec2 uv;out vec4 color;void main(){color=uv.y>.5?(uv.x<.5?vec4(1,0,0,1):vec4(0,1,0,1)):(uv.x<.5?vec4(0,0,1,1):vec4(1,1,0,1));}',
        ),
    ];
    const shader = keep(d.createShader(shaderInfo));
    const layout = keep(d.createDescriptorSetLayout(new g.DescriptorSetLayoutInfo([])));
    const pipelineLayout = keep(d.createPipelineLayout(new g.PipelineLayoutInfo([layout])));
    const set = keep(d.createDescriptorSet(new g.DescriptorSetInfo(layout)));
    const buffer = keep(d.createBuffer(new g.BufferInfo(g.BufferUsageBit.VERTEX, g.MemoryUsageBit.DEVICE, 12, 4)));
    buffer.update(new Float32Array([0, 0, 0]));
    const input = keep(d.createInputAssembler(new g.InputAssemblerInfo([], [buffer])));
    const rasterizer = new g.RasterizerState();
    rasterizer.cullMode = g.CullMode.NONE;
    const makePipeline = (renderPass) =>
        keep(
            d.createPipelineState(
                new g.PipelineStateInfo(
                    shader,
                    pipelineLayout,
                    renderPass,
                    new g.InputState([]),
                    rasterizer,
                    new g.DepthStencilState(false, false),
                ),
            ),
        );
    const screenPipeline = makePipeline(root.mainWindow.framebuffer.renderPass);
    const sourcePipeline = makePipeline(pass);
    const commands = keep(d.createCommandBuffer(new g.CommandBufferInfo(d.queue, g.CommandBufferType.PRIMARY)));
    const draw = (fb, pipeline, width, height) => {
        commands.begin();
        commands.beginRenderPass(fb.renderPass, fb, new g.Rect(0, 0, width, height), [new g.Color(0, 0, 0, 1)], 1, 0);
        commands.bindPipelineState(pipeline);
        commands.bindDescriptorSet(0, set);
        commands.bindInputAssembler(input);
        commands.draw(new g.DrawInfo(3));
        commands.endRenderPass();
        commands.end();
        d.queue.submit([commands]);
    };
    const render = () => {
        try {
            draw(framebuffer, sourcePipeline, 32, 32);
            draw(root.mainWindow.framebuffer, screenPipeline, canvas.width, canvas.height);
            report.frames++;
            errors();
        } catch (error) {
            report.drawException = String(error.stack || error);
        }
    };
    cc.director.on(cc.Director.EVENT_AFTER_DRAW, render);
    report.renderer = {
        version: gl.getParameter(gl.VERSION),
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER),
        contextAttributes: gl.getContextAttributes(),
    };
    report.exportCanvas = () =>
        new Promise((resolve) =>
            cc.director.once(cc.Director.EVENT_AFTER_DRAW, () => resolve(canvas.toDataURL('image/png'))),
        );
    report.snapshot = () => {
        const samples = [
            [8, 24],
            [24, 24],
            [8, 8],
            [24, 8],
        ].map(([x, y]) => {
            const region = new g.BufferTextureCopy();
            region.texOffset.x = x;
            region.texOffset.y = y;
            region.texExtent = new g.Extent(1, 1, 1);
            const bytes = new Uint8Array(4);
            d.copyTextureToBuffers(target, [bytes], [region]);
            return [...bytes];
        });
        errors();
        const rect = canvas.getBoundingClientRect();
        const style = getComputedStyle(canvas);
        return {
            frames: report.frames,
            samples,
            canvas: {
                width: canvas.width,
                height: canvas.height,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                style: {
                    display: style.display,
                    visibility: style.visibility,
                    opacity: style.opacity,
                    transform: style.transform,
                    bodyBackground: getComputedStyle(document.body).backgroundColor,
                },
            },
            drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
            window: [root.mainWindow.width, root.mainWindow.height],
            viewport: [...gl.getParameter(gl.VIEWPORT)],
            defaultDrawFramebuffer: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) === null,
            errors: [...report.errors],
            drawException: report.drawException,
        };
    };
    report.close = async () => {
        cc.director.off(cc.Director.EVENT_AFTER_DRAW, render);
        cc.game.pause();
        for (const resource of owned.reverse()) {
            try {
                resource.destroy();
                report.cleanup.push({ type: resource.constructor.name, released: true });
            } catch (error) {
                report.cleanup.push({ type: resource.constructor.name, released: false, error: String(error) });
            }
        }
        report.resources = { created: owned.length, released: report.cleanup.filter((x) => x.released).length };
        report.appRelease = await app.close();
        errors();
        return {
            resources: report.resources,
            cleanup: report.cleanup,
            appRelease: report.appRelease,
            errors: report.errors,
        };
    };
    report.ready = true;
} catch (error) {
    report.startupException = String(error.stack || error);
    report.ready = true;
}
