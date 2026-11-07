import { createAirApp, createAirPostProcess, createStepClock, Scene, Node, Camera, Color } from '/engine.js';
const result = (window.proof = { state: 'starting', draws: [], errors: [], checks: [] });
try {
    const app = await createAirApp({ canvas: '#GameCanvas', pixelRatioCap: 1, diagnostics: 'warnings' });
    const gl = document.querySelector('canvas').getContext('webgl2');
    let frame = 0;
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const orig = gl[name];
        gl[name] = function (...args) {
            const p = gl.getParameter(gl.CURRENT_PROGRAM);
            const blocks = [];
            for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORM_BLOCKS); i++) {
                const binding = gl.getActiveUniformBlockParameter(p, i, gl.UNIFORM_BLOCK_BINDING);
                blocks.push({
                    name: gl.getActiveUniformBlockName(p, i),
                    binding,
                    bound: !!gl.getIndexedParameter(gl.UNIFORM_BUFFER_BINDING, binding),
                    vertex: gl.getActiveUniformBlockParameter(p, i, gl.UNIFORM_BLOCK_REFERENCED_BY_VERTEX_SHADER),
                    fragment: gl.getActiveUniformBlockParameter(p, i, gl.UNIFORM_BLOCK_REFERENCED_BY_FRAGMENT_SHADER),
                });
            }
            const row = { frame, name, args, blocks };
            orig.apply(this, args);
            row.error = gl.getError();
            result.draws.push(row);
        };
    }
    const scene = new Scene('Empty HDR proof');
    scene.globals.skybox.enabled = false;
    const node = new Node('Only solid color camera');
    scene.addChild(node);
    const camera = node.addComponent(Camera);
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(128, 64, 32, 255);
    const clock = createStepClock({ stepTimeoutMs: 10000 });
    app.run(scene);
    clock.begin();
    result.drawsBeforePost = result.draws.length;
    const post = createAirPostProcess(camera, {
        levels: 1,
        resolutionScale: 1,
        exposure: 1,
        toneMapping: 'aces',
        bloom: { enabled: false },
    });
    result.samples = [];
    for (frame = 1; frame <= 3; frame++) {
        await clock.step();
        const source = Array.from(post.source.readColor({ x: 32, y: 32, width: 1, height: 1 }));
        const output = new Uint8Array(4);
        gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, output);
        result.samples.push({ frame, source, output: Array.from(output), error: gl.getError() });
    }
    result.finalError = gl.getError();
    const check = (name, pass, actual) => result.checks.push({ name, pass, actual });
    const close = (actual, expected, tolerance) =>
        actual.length === expected.length &&
        actual.every((value, i) => Number.isFinite(value) && Math.abs(value - expected[i]) <= tolerance);
    result.expectedSource = [128 / 255, 64 / 255, 32 / 255, 1];
    result.expectedOutput = result.expectedSource
        .slice(0, 3)
        .map((v) => {
            const aces = Math.min(1, Math.max(0, (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14)));
            return Math.round(255 * (aces <= 0.0031308 ? aces * 12.92 : 1.055 * aces ** (1 / 2.4) - 0.055));
        })
        .concat(255);
    check('No model or skybox draw before post', result.drawsBeforePost === 0, result.drawsBeforePost);
    check('Exactly three first-frame output draws', result.draws.length === 3, result.draws.length);
    for (const draw of result.draws) {
        check(`Frame ${draw.frame}: draw GL error`, draw.error === 0, draw.error);
        check(
            `Frame ${draw.frame}: all active blocks bound`,
            draw.blocks.every((block) => block.bound),
            draw.blocks,
        );
    }
    for (const sample of result.samples) {
        check(`Frame ${sample.frame}: float source`, close(sample.source, result.expectedSource, 0.001), sample.source);
        check(`Frame ${sample.frame}: ACES sRGB output`, close(sample.output, result.expectedOutput, 2), sample.output);
        check(`Frame ${sample.frame}: readback GL error`, sample.error === 0, sample.error);
    }
    check('Final GL error', result.finalError === 0, result.finalError);
    result.passed = result.checks.every((item) => item.pass);
    result.state = 'done';
} catch (e) {
    result.state = 'failed';
    result.failure = String(e.stack || e);
}
