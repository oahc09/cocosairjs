// Small real-native ownership regression. Run with a real SDL Surface, not --no-sdl; no AIR SDK is loaded.
const result = {
    schema: 'air-native-resource-ownership-probe-v1',
    completed: false,
    pass: false,
    subset: true,
    releaseReady: false,
    checks: [],
    uncapturedErrors: [],
};
const record = (id, pass, observations = {}) => result.checks.push({ id, pass: !!pass, observations });
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const message = (error) => String(error?.message || error);

async function run() {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw Error('A real native GPU adapter is required');
    const device = await adapter.requestDevice();
    device.addEventListener('uncapturederror', (event) => result.uncapturedErrors.push(message(event.error)));
    const canvas = globalThis.canvas;
    canvas.width = 320;
    canvas.height = 240;
    const context = canvas.getContext('webgpu');
    context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat() });
    const render = (encoder, view) =>
        encoder.beginRenderPass({
            colorAttachments: [
                { view, clearValue: { r: 0.1, g: 0.2, b: 0.4, a: 1 }, loadOp: 'clear', storeOp: 'store' },
            ],
        });
    // The error must come from this specific invalid call; ordinary success and queue completion are checked separately.
    const rejects = async (id, operation) => {
        device.pushErrorScope('validation');
        let thrown = null;
        try {
            operation();
        } catch (error) {
            thrown = message(error);
        }
        const validation = await device.popErrorScope();
        record(id, (thrown !== null && /expired|destroyed|consumed|invalid/i.test(thrown)) || validation !== null, {
            thrown,
            validation: validation === null ? null : message(validation),
        });
    };

    await frame();
    const firstTexture = context.getCurrentTexture();
    record('same-frame-current-texture-identity', firstTexture === context.getCurrentTexture());
    const firstView = firstTexture.createView();
    const secondView = firstTexture.createView();
    const encoder = device.createCommandEncoder();
    const firstPass = render(encoder, firstView);
    firstPass.end();
    const secondPass = render(encoder, secondView);
    secondPass.end();
    const commands = encoder.finish();
    device.queue.submit([commands]);
    await device.queue.onSubmittedWorkDone();
    record(
        'multiple-views-real-submit-and-completion',
        firstView !== secondView && result.uncapturedErrors.length === 0,
    );
    await frame();

    await rejects('expired-canvas-texture-create-view', () => firstTexture.createView());
    await rejects('expired-canvas-view-render-pass', () => {
        const invalidEncoder = device.createCommandEncoder();
        const pass = render(invalidEncoder, firstView);
        if (!pass) return; // A silent undefined result is not a rejection and must leave this check false.
        pass.end();
        device.queue.submit([invalidEncoder.finish()]);
    });
    await rejects('render-pass-end-once', () => firstPass.end());
    await rejects('command-encoder-finish-once', () => encoder.finish());
    await rejects('command-buffer-submit-once', () => device.queue.submit([commands]));

    device.pushErrorScope('validation');
    const regular = device.createTexture({
        size: [2, 2, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
    });
    let destroyError = null;
    try {
        regular.destroy();
        regular.destroy();
    } catch (error) {
        destroyError = message(error);
    }
    const destroyValidation = await device.popErrorScope();
    record('regular-texture-destroy-idempotent', destroyError === null && destroyValidation === null, {
        thrown: destroyError,
        validation: destroyValidation === null ? null : message(destroyValidation),
    });

    // The rejected calls must leave the same device usable for an ordinary subsequent frame.
    await frame();
    const liveEncoder = device.createCommandEncoder();
    const liveTexture = context.getCurrentTexture();
    const liveView = liveTexture.createView();
    const livePass = render(liveEncoder, liveView);
    if (!livePass) throw Error('Ordinary render pass failed after the rejected resource calls');
    livePass.end();
    device.queue.submit([liveEncoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    result.subsequentOrdinaryFrameCompleted = true;
    await frame();
    result.completed = true;
    result.pass =
        result.checks.length === 8 &&
        result.checks.every((check) => check.pass) &&
        result.uncapturedErrors.length === 0;
}

void run()
    .catch((error) => {
        result.error = message(error);
    })
    .finally(() => {
        console.log('AIR_RESOURCE_OWNERSHIP_RESULT ' + JSON.stringify(result));
        process.exit(result.pass ? 0 : 1);
    });
