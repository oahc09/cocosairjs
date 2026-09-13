/* playwright-cli run-code --filename=tools/verify/gltf-ubo-diag.js (requires viewer server on 7462) */
async (page) => {
    await page.goto('http://127.0.0.1:7462/gltf-viewer/');
    await page.getByRole('combobox', { name: '模型', exact: true }).selectOption('scene.glb');
    await page.waitForFunction(() => window.gltfViewer?.name === 'scene.glb', undefined, { timeout: 30000 });
    const report = await page.evaluate(async () => {
        const { director, game } = await import('/build/cocosair.module.js');
        game.pause();
        director.tick(0);
        const canvas = document.querySelector('canvas');
        const gl = canvas.getContext('webgl2');
        if (gl.__diag) { return gl.__diag; }
        gl.__diag = [];
        const bufferSizes = new WeakMap();
        const captureSize = (bytes) => { try { return typeof bytes === 'number' ? bytes : (bytes.byteLength || (bytes.buffer && bytes.buffer.byteLength)); } catch (e) { return -1; } };
        const wrapData = (name) => {
            const orig = gl[name].bind(gl);
            gl[name] = function (target, src, usage) {
                if (target === gl.UNIFORM_BUFFER) {
                    const current = gl.getParameter(gl.UNIFORM_BUFFER_BINDING);
                    if (current) {
                        const size = name === 'bufferData' ? captureSize(src) : (captureSize(src) >= 0 ? captureSize(src) : captureSize(arguments[2]));
                        if (name === 'bufferData') { bufferSizes.set(current, size); }
                        else if (bufferSizes.has(current)) { /* bufferSubData keeps size */ }
                    }
                }
                return orig.apply(gl, arguments);
            };
        };
        wrapData('bufferData');
        const bbb = gl.bindBufferBase.bind(gl);
        gl.bindBufferBase = function (target, index, buffer) {
            if (target === gl.UNIFORM_BUFFER && buffer && !bufferSizes.has(buffer) && gl.getParameter(gl.UNIFORM_BUFFER_BINDING) !== buffer) {
                // size unknown; mark with -2 sentinel (engine pre-creates buffers bound while UNIFORM_BUFFER binding == buffer)
            }
            return bbb(target, index, buffer);
        };
        const bbr = gl.bindBufferRange.bind(gl);
        gl.bindBufferRange = function (target, index, buffer, offset, size) {
            if (target === gl.UNIFORM_BUFFER) { bufferSizes.set(buffer, size); }
            return bbr.apply(gl, arguments);
        };
        const de = gl.drawElements.bind(gl);
        gl.drawElements = function () {
            const r = de.apply(gl, arguments);
            const err = gl.getError();
            if (err !== 0 && gl.__diag.length < 6) {
                const program = gl.getParameter(gl.CURRENT_PROGRAM);
                const blocks = [];
                const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORM_BLOCKS);
                for (let b = 0; b < n; ++b) {
                    const name = gl.getActiveUniformBlockName(program, b);
                    const size = gl.getActiveUniformBlockParameter(program, b, gl.UNIFORM_BLOCK_DATA_SIZE);
                    const binding = gl.getActiveUniformBlockParameter(program, b, gl.UNIFORM_BLOCK_BINDING);
                    const bound = gl.getIndexedParameter(gl.UNIFORM_BUFFER_BINDING, binding);
                    blocks.push({ name, need: size, binding, have: bound ? bufferSizes.get(bound) : null });
                }
                gl.__diag.push({ err, blocks });
            }
            return r;
        };
        director.tick(0);
        return gl.__diag;
    });
    return JSON.stringify(report, null, 1);
}