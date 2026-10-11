// Supplemental fixture: raw GL writes only establish/release external state and inject INVALID_ENUM.
// Texture uploads, tested readback and subsequent draws use public gfx, never raw GL implementations.
const sdk = new URLSearchParams(location.search).get('sdk') || '/build/cocosair.module.js';
const cc = await import(sdk);
const report = (window.__wglStateRestoration = { ready: false, results: [] });
try {
    cc.macro.ENABLE_WEBGL_ANTIALIAS = false;
    const app = await cc.createAirApp({ canvas: '#GameCanvas' });
    app.run(new cc.Scene('external-state-restoration'));
    cc.game.pause();
    const d = cc.director.root.device;
    const g = cc.gfx;
    const gl = d.gl;
    const errors = () => {
        const out = [];
        for (let i = 0; i < 32; i++) {
            const e = gl.getError();
            if (!e) break;
            out.push(e);
        }
        return out;
    };
    report.startupErrors = errors();
    report.renderer = {
        version: gl.getParameter(gl.VERSION),
        renderer: gl.getParameter(gl.RENDERER),
        vendor: gl.getParameter(gl.VENDOR),
    };
    report.rawGLWriteScope =
        'External state setup/cleanup: pixelStorei, create/bind/delete buffer/framebuffer, bufferData. Fault injection: pixelStorei invalid enum. No raw upload/draw/readPixels.';
    for (const mode of ['success', 'preflight-capacity-failure', 'execution-gl-before-failure']) {
        const result = { id: mode, stages: {}, cleanup: [], actual: {}, expected: {} };
        const owned = [];
        const keep = (resource) => {
            owned.push(resource);
            return resource;
        };
        const mark = (stage) => (result.stages[stage] = errors());
        let externalRead, externalDraw, pbo;
        const packNames = [gl.PACK_ALIGNMENT, gl.PACK_ROW_LENGTH, gl.PACK_SKIP_ROWS, gl.PACK_SKIP_PIXELS];
        const defaults = packNames.map((name) => gl.getParameter(name));
        const oldRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
            oldDraw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
            oldPBO = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
        try {
            const texture = keep(
                d.createTexture(
                    new g.TextureInfo(
                        g.TextureType.TEX2D,
                        g.TextureUsageBit.COLOR_ATTACHMENT |
                            g.TextureUsageBit.TRANSFER_SRC |
                            g.TextureUsageBit.TRANSFER_DST,
                        g.Format.RGBA8,
                        2,
                        2,
                    ),
                ),
            );
            const region = new g.BufferTextureCopy();
            region.texExtent = new g.Extent(2, 2, 1);
            const source = new Uint8Array([17, 33, 65, 255, 18, 34, 66, 255, 19, 35, 67, 255, 20, 36, 68, 255]);
            d.copyBuffersToTexture([source], texture, [region]);
            const pass = keep(d.createRenderPass(new g.RenderPassInfo([new g.ColorAttachment(g.Format.RGBA8)])));
            const framebuffer = keep(d.createFramebuffer(new g.FramebufferInfo(pass, [texture])));
            const shaderInfo = new g.ShaderInfo();
            shaderInfo.name = 'ExternalStateContinuation';
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

            const commands = keep(d.createCommandBuffer(new g.CommandBufferInfo(d.queue, g.CommandBufferType.PRIMARY)));
            mark('public-resource-and-upload');
            // Allowed raw setup: independently bound external READ/DRAW FBOs, populated PBO and non-default PACK.
            externalRead = gl.createFramebuffer();
            externalDraw = gl.createFramebuffer();
            pbo = gl.createBuffer();
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, externalRead);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, externalDraw);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
            const pboSentinel = new Uint8Array(256).fill(93);
            gl.bufferData(gl.PIXEL_PACK_BUFFER, pboSentinel, gl.STATIC_READ);
            const packValues = [8, 7, 2, 3];
            packNames.forEach((name, index) => gl.pixelStorei(name, packValues[index]));
            mark('external-state-setup');
            const cache = d.getStateCache();
            const cacheBefore = [cache.glReadFramebuffer, cache.glFramebuffer];
            const storage = new Uint8Array(64).fill(171);
            const output = new Uint8Array(storage.buffer, 8, 32);
            region.buffOffset = 4;
            let caught = null;
            if (mode === 'execution-gl-before-failure') {
                gl.pixelStorei(0xdead, 1);
                result.faultInjection = {
                    operation: 'pixelStorei(INVALID_ENUM, 1)',
                    expectedError: gl.INVALID_ENUM,
                    faultStage:
                        'external setup immediately before public copyTextureToBuffers; consumed by GL_BEFORE after temporary FBO setup',
                };
            }
            // Native delegates observe temporary FBO ownership without changing allocation/deletion behavior.
            const temporaryFBOs = [];
            const originalCreate = gl.createFramebuffer;
            const originalDelete = gl.deleteFramebuffer;
            gl.createFramebuffer = function (...args) {
                const handle = originalCreate.apply(this, args);
                temporaryFBOs.push({ handle, deleted: false });
                return handle;
            };
            gl.deleteFramebuffer = function (handle) {
                for (const entry of temporaryFBOs) if (entry.handle === handle) entry.deleted = true;
                return originalDelete.call(this, handle);
            };
            try {
                d.copyTextureToBuffers(
                    texture,
                    [mode === 'preflight-capacity-failure' ? output.subarray(0, 4) : output],
                    [region],
                );
            } catch (error) {
                caught = String(error.message);
            } finally {
                gl.createFramebuffer = originalCreate;
                gl.deleteFramebuffer = originalDelete;
            }
            result.actual.temporaryFBOs = temporaryFBOs.map((entry) => ({
                deleted: entry.deleted,
                live: gl.isFramebuffer(entry.handle),
            }));
            result.actual.caught = caught;
            result.actual.bytes = [...storage];
            result.actual.pack = packNames.map((name) => gl.getParameter(name));
            result.actual.bindings = {
                read: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) === externalRead,
                draw: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) === externalDraw,
                pbo: gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) === pbo,
            };
            result.actual.cache =
                mode === 'preflight-capacity-failure'
                    ? { read: cache.glReadFramebuffer === cacheBefore[0], draw: cache.glFramebuffer === cacheBefore[1] }
                    : { read: cache.glReadFramebuffer === externalRead, draw: cache.glFramebuffer === externalDraw };
            const pboAfter = new Uint8Array(256);
            const observedPBO = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
            // Allowed external-state diagnostic: inspect the fixture PBO even if a negative control lost its binding.
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
            gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pboAfter);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, observedPBO);
            result.actual.pboBytes = [...pboAfter];
            mark('tested-public-readback-and-state-queries');
            const expectedStorage = new Uint8Array(64).fill(171);
            if (mode === 'success') expectedStorage.set(source, 12);
            const failureMatches =
                mode === 'success'
                    ? caught === null
                    : mode === 'preflight-capacity-failure'
                      ? caught?.includes('WEBGL2_READBACK_BUFFER_CAPACITY')
                      : caught?.includes('WEBGL2_READBACK_GL_BEFORE: 1280');
            result.expected = {
                pack: packValues,
                bindings: { read: true, draw: true, pbo: true },
                cache: { read: true, draw: true },
                bytes: [...expectedStorage],
                pboBytes: [...pboSentinel],
                continuationPixel: [0, 255, 0, 255],
            };
            // Public draw must continue correctly while the restored external bindings/PACK/PBO remain active.
            commands.begin();
            commands.beginRenderPass(pass, framebuffer, new g.Rect(0, 0, 2, 2), [new g.Color(1, 0, 0, 1)], 1, 0);
            commands.bindPipelineState(pipeline);
            commands.bindDescriptorSet(0, set);
            commands.bindInputAssembler(input);
            commands.draw(new g.DrawInfo(3));
            commands.endRenderPass();
            commands.end();
            d.queue.submit([commands]);
            mark('public-draw-continuation');
            const next = new Uint8Array(16);
            const nextRegion = new g.BufferTextureCopy();
            nextRegion.texExtent = new g.Extent(2, 2, 1);
            d.copyTextureToBuffers(texture, [next], [nextRegion]);
            result.actual.continuationPixel = [...next.subarray(0, 4)];
            result.actual.continuationPack = packNames.map((name) => gl.getParameter(name));
            result.actual.continuationPBO = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) === pbo;
            mark('public-readback-continuation');
            const canvas = document.createElement('canvas');
            canvas.width = 2;
            canvas.height = 2;
            canvas.style.width = '128px';
            canvas.style.height = '128px';
            canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(next), 2, 2), 0, 0);
            const label = document.createElement('p');
            label.textContent = mode + ' — public readback preview, not compositor proof';
            document.body.append(label, canvas);
            const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
            result.primaryMatched =
                failureMatches &&
                temporaryFBOs.length === (mode === 'preflight-capacity-failure' ? 0 : 1) &&
                result.actual.temporaryFBOs.every((entry) => entry.deleted && !entry.live) &&
                ['pack', 'bindings', 'cache', 'bytes', 'pboBytes'].every((key) =>
                    equal(result.actual[key], result.expected[key]),
                );
            result.primaryStatus = result.primaryMatched ? 'PASS' : 'FAIL';
            result.continuationMatched =
                equal(result.actual.continuationPixel, result.expected.continuationPixel) &&
                equal(result.actual.continuationPack, packValues) &&
                result.actual.continuationPBO;
            result.continuationStatus = result.continuationMatched ? 'PASS' : 'FAIL';
            result.matched = result.primaryMatched && result.continuationMatched;
        } catch (error) {
            result.exception = String(error.stack || error);
        } finally {
            // Allowed raw cleanup restores the fixture-entry external state and releases only fixture-owned objects.
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, oldRead);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, oldDraw);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, oldPBO);
            packNames.forEach((name, index) => gl.pixelStorei(name, defaults[index]));
            d.getStateCache().glReadFramebuffer = oldRead;
            d.getStateCache().glFramebuffer = oldDraw;
            for (const [handle, release, type] of [
                [externalRead, 'deleteFramebuffer', 'externalRead'],
                [externalDraw, 'deleteFramebuffer', 'externalDraw'],
                [pbo, 'deleteBuffer', 'externalPBO'],
            ]) {
                if (handle) {
                    gl[release](handle);
                    result.cleanup.push({
                        type,
                        released: release === 'deleteBuffer' ? !gl.isBuffer(handle) : !gl.isFramebuffer(handle),
                    });
                }
            }
            for (const resource of owned.reverse()) {
                try {
                    resource.destroy();
                    result.cleanup.push({ type: resource.constructor.name, released: true });
                } catch (error) {
                    result.cleanup.push({ type: resource.constructor.name, released: false, error: String(error) });
                }
            }
            mark('cleanup');
            result.resources = {
                created: owned.length + (externalRead ? 1 : 0) + (externalDraw ? 1 : 0) + (pbo ? 1 : 0),
                released: result.cleanup.filter((item) => item.released).length,
            };
        }
        result.status =
            !result.exception &&
            result.matched &&
            Object.values(result.stages).every((values) => values.length === 0) &&
            result.resources.created === result.resources.released
                ? 'PASS'
                : 'FAIL';
        report.results.push(result);
    }
    report.appRelease = await app.close();
    report.finalErrors = errors();
} catch (error) {
    report.startupException = String(error.stack || error);
}
report.ready = true;
document.body.dataset.status =
    report.results.length === 3 && report.results.every((result) => result.status === 'PASS') ? 'PASS' : 'FAIL';
