// Cocos AIR dev-server prelude：先于页面 module script 执行。
// 职责：错误捕获（window/rejection/资源）+ WebGL 诊断 hook（draw 计数、shader/link 错误、
// 首次 draw 时的 uniform/attribute/viewport/fbo 状态）。仅用于开发期诊断。
window.__airErrors = [];
window.__glStats = { draws: 0, shaderErrs: [], linkErrs: [], counts: {}, seq: [] };

window.addEventListener('error', function (e) {
    if (e && e.target && e.target.tagName) {
        window.__airErrors.push('ELERR: ' + e.target.tagName + ' ' + (e.target.src || e.target.href || ''));
        return;
    }
    window.__airErrors.push(String(e.message) + ' STACK:' + (e.error && e.error.stack ? String(e.error.stack).slice(0, 600) : 'no-stack'));
});
window.addEventListener('unhandledrejection', function (e) {
    window.__airErrors.push('PROMISE: ' + String(e.reason && (e.reason.stack || e.reason) || e.reason).slice(0, 600));
});



(function () {
    var orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type) {
        var ctx = orig.apply(this, arguments);
        if (ctx && typeof type === 'string' && type.indexOf('webgl') === 0 && !ctx.__hooked) {
            ctx.__hooked = 1;

            ['uniform1i','uniform1f','uniform4fv','uniformMatrix4fv','bindTexture','activeTexture','bindBuffer','vertexAttribPointer','bindFramebuffer','framebufferTexture2D','texImage2D','useProgram','bindVertexArray','enable','disable','blendFunc','depthMask','viewport'].forEach(function (fn) { var orig = ctx[fn]; if (!orig) return; ctx[fn] = function () { var r = orig.apply(this, arguments); var e = ctx.getError(); if (e) { var G2 = window.__glStats; G2.errCalls = G2.errCalls || {}; G2.errCalls[fn] = (G2.errCalls[fn] || 0) + 1; } return r; }; });var clrfn = ctx.clear.bind(ctx);
            ctx.clear = function (m) {
                var G = window.__glStats;
                G.seq.push('CLEAR:' + (ctx.getParameter(ctx.FRAMEBUFFER) === null ? 'def' : 'fbo'));
                if (G.seq.length > 16) G.seq.shift();
                return clrfn(m);
            };

            var bd = ctx.bufferData.bind(ctx);ctx.bufferData = function (t, data, usage) { var G = window.__glStats; try { var len = data && data.byteLength || 0; if (len >= 1000) { var f = (data instanceof ArrayBuffer) ? new Float32Array(data) : new Float32Array(data.buffer || data, data.byteOffset || 0, 8); G.vtxSample = { len: len, f: Array.prototype.slice.call(f, 0, 8).map(function (n) { return +n.toFixed(3); }) }; } } catch (e) { G.vtxSample = { err: String(e).slice(0, 60) }; } return bd(t, data, usage); };var bsd = ctx.bufferSubData.bind(ctx);ctx.bufferSubData = function (t, off, data) { var G = window.__glStats; try { var len = data && data.byteLength || 0; if (len >= 1000 && !G.subSample) { var f = (data instanceof ArrayBuffer) ? new Float32Array(data) : new Float32Array(data.buffer || data, data.byteOffset || 0, 8); G.subSample = { len: len, f: Array.prototype.slice.call(f, 0, 8).map(function (n) { return +n.toFixed(3); }) }; } } catch (e) { G.subSample = { err: String(e).slice(0, 60) }; } return bsd(t, off, data); };var de = ctx.drawElements.bind(ctx);
            ctx.drawElements = function () {
                var G = window.__glStats;
                G.draws++;
                G.counts[arguments[1]] = (G.counts[arguments[1]] || 0) + 1;
                var ge0 = ctx.getError(); if (ge0) { G.preErr = ge0; }
                G.seq.push('DRAW' + arguments[1] + ':' + (ctx.getParameter(ctx.FRAMEBUFFER) === null ? 'def' : 'fbo'));
                if (G.seq.length > 16) G.seq.shift();
                if (G.draws === 300) {
                    try {
                        var vp3 = ctx.getParameter(ctx.VIEWPORT);
                        var full = new Uint8Array(vp3[2] * vp3[3] * 4);
                        ctx.readPixels(0, 0, vp3[2], vp3[3], ctx.RGBA, ctx.UNSIGNED_BYTE, full);
                        var cmap = {};
                        for (var fi = 0; fi < full.length; fi += 40) { var k = full[fi] + "," + full[fi+1] + "," + full[fi+2]; cmap[k] = (cmap[k] || 0) + 1; }
                        G.frameColors = cmap;
                    } catch (e2) { G.frameColors = { err: String(e2).slice(0, 60) }; }
                    try {
                        var prog = ctx.getParameter(ctx.CURRENT_PROGRAM);
                        var nb = ctx.getProgramParameter(prog, ctx.ACTIVE_UNIFORM_BLOCKS);
                        var blocks = {};
                        for (var bi = 0; bi < nb; bi++) {
                            var bn = ctx.getActiveUniformBlockName(prog, bi);
                            blocks[bn] = ctx.getActiveUniformBlockParameter(prog, bi, ctx.UNIFORM_BLOCK_DATA_SIZE);
                        }
                        G.blocksAtDraw = blocks;
                        G.drawState = {
                            fbo: ctx.getParameter(ctx.FRAMEBUFFER) === null ? 'default' : 'fbo',
                            viewport: Array.prototype.slice.call(ctx.getParameter(ctx.VIEWPORT)),
                        };
                    } catch (err) {
                        G.blocksAtDraw = { err: String(err).slice(0, 80) };
                    }
                }
                if (G.draws === 3) { try { var vp2 = ctx.getParameter(ctx.VIEWPORT); var px = new Uint8Array(4 * 5); var pts2 = [[vp2[2]>>1, vp2[3]>>1],[vp2[2]>>2, vp2[3]>>1],[vp2[2]*3>>2, vp2[3]>>1]]; for (var pi = 0; pi < 3; pi++) { ctx.readPixels(pts2[pi][0], pts2[pi][1], 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px.subarray(pi*4, pi*4+4)); } G.pixels = Array.prototype.slice.call(px); } catch (e) { G.pixels = [String(e).slice(0,60)]; } }
                ctx.getError(); var ge = ctx.getError();
                if (ge) {
                    G.glErrs = G.glErrs || {};
                    G.glErrs[ge] = (G.glErrs[ge] || 0) + 1;
                }
                return de.apply(null, arguments);
            };

            var ss = ctx.createShader.bind(ctx);
            ctx.createShader = function (t) {
                var sh = ss(t);
                var gs = ctx.getShaderParameter.bind(ctx);
                ctx.getShaderParameter = function (sh2, p) {
                    var r = gs(sh2, p);
                    if (!r && p === ctx.COMPILE_STATUS) {
                        window.__glStats.shaderErrs.push(String(ctx.getShaderInfoLog(sh2)).slice(0, 300));
                    }
                    return r;
                };
                return sh;
            };
        }
        return ctx;
    };
})();
