const fs = require('node:fs'),
    path = require('node:path'),
    ts = require('typescript'),
    playwright = require('playwright'),
    crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const output = path.resolve(process.env.WEBGL2_STATE_OUT || path.join(root, 'output/webgl2-audit'));
fs.mkdirSync(output, { recursive: true });
const file = process.env.WEBGL2_COMMAND_SOURCE || path.join(root, 'src/cocos/gfx/webgl2/webgl2-commands.ts');
const source = fs.readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
const names = [
    'WebGL2CmdFuncBindStates',
    'WebGL2CmdFuncBeginRenderPass',
    'WebGL2CmdFuncCreateInputAssember',
    'WebGL2CmdFuncBlitTexture',
];
const code = ts.transpileModule(
    ast.statements
        .filter((n) => names.includes(n.name?.text))
        .map((n) => n.getText(ast).replace(/^export /, ''))
        .join('\n'),
    { compilerOptions: { target: ts.ScriptTarget.ES2020 } },
).outputText;
(async () => {
    const b = await playwright[process.env.WEBGL2_BROWSER || 'chromium'].launch({
        headless: true,
        ...(process.env.WEBGL2_EXECUTABLE ? { executablePath: process.env.WEBGL2_EXECUTABLE } : {}),
    });
    try {
        const p = await b.newPage();
        await p.setContent('<canvas width="64" height="64" style="width:256px;height:256px"></canvas>');
        const result = await p.evaluate((code) => {
            const gl = document
                .querySelector('canvas')
                .getContext('webgl2', { stencil: true, preserveDrawingBuffer: true });
            if (!gl) throw Error('No WebGL2');
            const WebGLConstants = gl,
                gfxStateCache = { gpuPipelineState: null, gpuInputAssembler: null, invalidateAttachments: [] },
                Format = { UNKNOWN: 0 },
                FormatType = { INT: 3, UINT: 4 },
                FormatInfos = {
                    1: { hasStencil: true, hasDepth: true, size: 4, count: 1 },
                    2: { hasStencil: false, hasDepth: false, size: 4, count: 1 },
                    3: { hasStencil: false, hasDepth: true, size: 4, count: 1 },
                    4: { hasStencil: true, hasDepth: false, size: 1, count: 1 },
                },
                LoadOp = { LOAD: 0, CLEAR: 1, DISCARD: 2 },
                Filter = { LINEAR: 1, ANISOTROPIC: 2 },
                ColorMask = { ALL: 15 },
                GFXFormatToWebGLType = () => gl.FLOAT,
                WebGLGetComponentCount = () => 1,
                warnID = () => {};
            const bindDrawFramebuffer = (g, f, c) => {
                g.bindFramebuffer(g.DRAW_FRAMEBUFFER, f);
                c.glFramebuffer = f;
            };
            const api = eval(
                code +
                    ';({WebGL2CmdFuncBindStates,WebGL2CmdFuncBeginRenderPass,WebGL2CmdFuncCreateInputAssember,WebGL2CmdFuncBlitTexture})',
            );
            const cache = {
                    glProgram: null,
                    rs: {},
                    dss: { stencilWriteMaskFront: 65535, stencilWriteMaskBack: 65535 },
                    bs: { blendColor: {}, targets: [{ blendColorMask: 15 }] },
                    viewport: {},
                    scissorRect: {},
                    glReadFramebuffer: null,
                    glFramebuffer: null,
                },
                device = {
                    gl,
                    getStateCache: () => cache,
                    capabilities: { maxVertexAttributes: gl.getParameter(gl.MAX_VERTEX_ATTRIBS) },
                    blitManager: { srcFramebuffer: gl.createFramebuffer(), dstFramebuffer: gl.createFramebuffer() },
                };
            function program(color, attrib = false) {
                const v = gl.createShader(gl.VERTEX_SHADER),
                    f = gl.createShader(gl.FRAGMENT_SHADER);
                gl.shaderSource(
                    v,
                    attrib
                        ? '#version 300 es\nlayout(location=0) in float x;layout(location=1) in float y;void main(){gl_Position=vec4(x,y,0.,1.);}'
                        : '#version 300 es\nvoid main(){vec2 v=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(v*2.-1.,0.,1.);}',
                );
                gl.compileShader(v);
                gl.shaderSource(
                    f,
                    '#version 300 es\nprecision highp float;out vec4 c;void main(){c=vec4(' + color + ',1.);}',
                );
                gl.compileShader(f);
                const p = gl.createProgram();
                gl.attachShader(p, v);
                gl.attachShader(p, f);
                gl.linkProgram(p);
                if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
                gl.deleteShader(v);
                gl.deleteShader(f);
                return p;
            }
            const green = program('0.,1.,0.'),
                red = program('1.,0.,0.'),
                results = [];
            const draw = () => gl.drawArrays(gl.TRIANGLES, 0, 3);
            const pixel = () => {
                const a = new Uint8Array(4);
                gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, a);
                return Array.from(a);
            };
            const pso = { gpuShader: { glProgram: green, glBlocks: [], glSamplerTextures: [] }, dynamicStates: [] };
            const bind = () => api.WebGL2CmdFuncBindStates(device, pso, null, [], [], {});
            bind();
            gl.useProgram(red);
            cache.glProgram = red;
            bind();
            draw();
            let px = pixel();
            results.push({ id: 'ENGINE-001', passed: px[1] === 255, pixel: px });
            for (const front of [0, 15, 240, 65535]) {
                gl.disable(gl.STENCIL_TEST);
                gl.stencilMask(255);
                gl.clearStencil(0);
                gl.clear(gl.STENCIL_BUFFER_BIT);
                const back = front ^ 255;
                gl.stencilMaskSeparate(gl.FRONT, front);
                gl.stencilMaskSeparate(gl.BACK, back);
                cache.dss.stencilWriteMaskFront = front;
                cache.dss.stencilWriteMaskBack = back;
                gl.clearColor(0, 0, 0, 1);
                gl.clear(gl.COLOR_BUFFER_BIT);
                api.WebGL2CmdFuncBeginRenderPass(
                    device,
                    { colorAttachments: [], depthStencilAttachment: { format: 1, depthLoadOp: 0, stencilLoadOp: 1 } },
                    { glFramebuffer: null, gpuColorViews: [], gpuDepthStencilView: null },
                    { x: 0, y: 0, width: 64, height: 64 },
                    [],
                    1,
                    170,
                );
                const masks = [gl.getParameter(gl.STENCIL_WRITEMASK), gl.getParameter(gl.STENCIL_BACK_WRITEMASK)];
                gl.stencilMask(255);
                gl.enable(gl.STENCIL_TEST);
                gl.stencilFunc(gl.EQUAL, 170, 255);
                gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
                gl.useProgram(green);
                draw();
                px = pixel();
                results.push({
                    id: 'ENGINE-002',
                    front,
                    passed: px[1] === 255 && masks[0] === front && masks[1] === back,
                    pixel: px,
                    masks,
                });
            }
            gl.disable(gl.STENCIL_TEST);
            gl.disable(gl.SCISSOR_TEST);
            const buffers = Array.from({ length: 9 }, () => ({ glBuffer: gl.createBuffer(), stride: 8 })),
                ia = {
                    attributes: [
                        { stream: 8, format: 2, name: 'x' },
                        { stream: 8, format: 2, name: 'y' },
                    ],
                    gpuVertexBuffers: buffers,
                };
            api.WebGL2CmdFuncCreateInputAssember(device, ia);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffers[8].glBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            for (let i = 0; i < 2; i++) {
                if (Number.isFinite(ia.glAttribs[i].offset))
                    gl.vertexAttribPointer(i, 1, gl.FLOAT, false, 8, ia.glAttribs[i].offset);
                gl.enableVertexAttribArray(i);
            }
            const ap = program('0.,1.,0.', true);
            gl.useProgram(ap);
            gl.clear(gl.COLOR_BUFFER_BIT);
            draw();
            px = pixel();
            results.push({
                id: 'ENGINE-004',
                passed: px[1] === 255 && ia.glAttribs[0].offset === 0 && ia.glAttribs[1].offset === 4,
                pixel: px,
                offsets: ia.glAttribs.map((a) => a.offset),
            });
            gl.disableVertexAttribArray(0);
            gl.disableVertexAttribArray(1);
            while (gl.getError() !== 0) {}
            const owned = [];
            function tex(format, size, rb) {
                const fmt =
                        format === 1
                            ? gl.DEPTH24_STENCIL8
                            : format === 3
                              ? gl.DEPTH_COMPONENT24
                              : format === 4
                                ? gl.STENCIL_INDEX8
                                : gl.RGBA8,
                    o = { format, glTarget: gl.TEXTURE_2D };
                if (rb) {
                    o.glRenderbuffer = gl.createRenderbuffer();
                    gl.bindRenderbuffer(gl.RENDERBUFFER, o.glRenderbuffer);
                    gl.renderbufferStorage(gl.RENDERBUFFER, fmt, size, size);
                } else {
                    o.glTexture = gl.createTexture();
                    gl.bindTexture(gl.TEXTURE_2D, o.glTexture);
                    gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, size, size);
                }
                owned.push(o);
                return o;
            }
            function attach(o) {
                const a =
                    o.format === 2
                        ? gl.COLOR_ATTACHMENT0
                        : o.format === 3
                          ? gl.DEPTH_ATTACHMENT
                          : o.format === 4
                            ? gl.STENCIL_ATTACHMENT
                            : gl.DEPTH_STENCIL_ATTACHMENT;
                if (o.glTexture) gl.framebufferTexture2D(gl.FRAMEBUFFER, a, gl.TEXTURE_2D, o.glTexture, 0);
                else gl.framebufferRenderbuffer(gl.FRAMEBUFFER, a, gl.RENDERBUFFER, o.glRenderbuffer);
            }
            const outerRead = gl.createFramebuffer(),
                outerDraw = gl.createFramebuffer();
            cache.glReadFramebuffer = outerRead;
            cache.glFramebuffer = outerDraw;
            function outer() {
                gl.bindFramebuffer(gl.READ_FRAMEBUFFER, outerRead);
                gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, outerDraw);
            }
            outer();
            for (const [format, size, rb] of [
                [2, 4, false],
                [3, 8, true],
                [4, 4, true],
                [1, 8, false],
                [2, 8, true],
            ]) {
                const src = tex(format, size, rb),
                    dst = tex(format, size, format === 4 || !rb),
                    init = gl.createFramebuffer();
                gl.bindFramebuffer(gl.FRAMEBUFFER, init);
                attach(src);
                if (format !== 2) {
                    gl.readBuffer(gl.NONE);
                    gl.drawBuffers([gl.NONE]);
                }
                gl.viewport(0, 0, size, size);
                gl.stencilMask(255);
                gl.depthMask(true);
                gl.clearColor(0.25, 0.5, 0.75, 1);
                gl.clearDepth(0.25);
                gl.clearStencil(91);
                gl.clear(
                    format === 2
                        ? gl.COLOR_BUFFER_BIT
                        : format === 3
                          ? gl.DEPTH_BUFFER_BIT
                          : format === 4
                            ? gl.STENCIL_BUFFER_BIT
                            : gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT,
                );
                outer();
                const region = {
                    srcSubres: { mipLevel: 0 },
                    dstSubres: { mipLevel: 0 },
                    srcOffset: { x: 0, y: 0 },
                    dstOffset: { x: 0, y: 0 },
                    srcExtent: { width: size, height: size },
                    dstExtent: { width: size, height: size },
                };
                api.WebGL2CmdFuncBlitTexture(device, src, dst, [region], 0);
                const err = gl.getError(),
                    restored =
                        gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) === outerRead &&
                        gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) === outerDraw;
                const verify = gl.createFramebuffer();
                gl.bindFramebuffer(gl.FRAMEBUFFER, verify);
                attach(dst);
                if (format !== 2) {
                    attach(tex(2, size, false));
                    gl.clearColor(0, 0, 0, 1);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                    gl.useProgram(green);
                    if (format === 3) {
                        gl.enable(gl.DEPTH_TEST);
                        gl.depthFunc(gl.GREATER);
                    } else {
                        gl.enable(gl.STENCIL_TEST);
                        gl.stencilFunc(gl.EQUAL, 91, 255);
                        gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
                    }
                    draw();
                }
                px = pixel();
                const expected = format === 2 ? [64, 128, 191, 255] : [0, 255, 0, 255];
                results.push({
                    id: 'ENGINE-005',
                    format,
                    size,
                    rb,
                    passed: err === 0 && restored && px.every((v, i) => Math.abs(v - expected[i]) <= 1),
                    error: err,
                    pixel: px,
                    expected,
                });
                gl.disable(gl.DEPTH_TEST);
                gl.disable(gl.STENCIL_TEST);
                outer();
                gl.deleteFramebuffer(init);
                gl.deleteFramebuffer(verify);
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, 64, 64);
            gl.useProgram(green);
            draw();
            for (const o of owned) {
                if (o.glTexture) gl.deleteTexture(o.glTexture);
                if (o.glRenderbuffer) gl.deleteRenderbuffer(o.glRenderbuffer);
            }
            buffers.forEach((o) => gl.deleteBuffer(o.glBuffer));
            [outerRead, outerDraw, device.blitManager.srcFramebuffer, device.blitManager.dstFramebuffer].forEach((f) =>
                gl.deleteFramebuffer(f),
            );
            [red, green, ap].forEach((p) => gl.deleteProgram(p));
            return { renderer: gl.getParameter(gl.RENDERER), results };
        }, code);
        result.sourceSHA256 = crypto.createHash('sha256').update(source).digest('hex');
        result.browserVersion = b.version();
        result.method =
            'Exact source command functions with device/dependency fixture; real WebGL2 pixels, not full SDK/app acceptance';
        result.timestamp = new Date().toISOString();
        const out = path.join(output, process.env.WEBGL2_LABEL || 'candidate');
        fs.writeFileSync(out + '.json', JSON.stringify(result, null, 2));
        await p.screenshot({ path: out + '.png' });
        console.log(JSON.stringify(result));
        if (result.results.some((x) => !x.passed)) process.exitCode = 1;
    } finally {
        await b.close();
    }
})().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
