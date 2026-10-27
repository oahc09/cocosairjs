// Explicit canvas destruction must expire the JS lease without poisoning the next Surface frame.
const result = { schema: 'air-native-explicit-canvas-destroy-control-v1', completed: false, pass: false, steps: [], gpuErrors: [] };
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const step = (stage, extra = {}) => {
    result.stage = stage;
    result.steps.push({ stage, at: performance.now(), ...extra });
    console.log('AIR_CANVAS_DESTROY_STEP ' + JSON.stringify(result.steps.at(-1)));
};
async function run() {
    const device = await (await navigator.gpu.requestAdapter()).requestDevice();
    device.addEventListener('uncapturederror', (event) => result.gpuErrors.push(String(event.error?.message || event.error)));
    const canvas = globalThis.canvas;
    canvas.width = 320; canvas.height = 240;
    const context = canvas.getContext('webgpu');
    context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat() });
    const descriptor = (view) => ({ colorAttachments: [
        { view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0.1, g: 0.7, b: 0.2, a: 1 } },
    ] });
    await frame();
    const destroyed = context.getCurrentTexture();
    const expiredView = destroyed.createView();
    step('canvas-acquired');
    destroyed.destroy(); destroyed.destroy();
    result.destroyIdempotent = true;
    result.sameFrameIdentity = context.getCurrentTexture() === destroyed;
    step('canvas-destroyed-twice', { sameFrameIdentity: result.sameFrameIdentity });
    device.pushErrorScope('validation');
    let thrown = null;
    try {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass(descriptor(expiredView));
        if (pass) { pass.end(); device.queue.submit([encoder.finish()]); }
    } catch (error) { thrown = String(error?.message || error); }
    const scopeError = await device.popErrorScope();
    result.oldViewRejected = (thrown !== null && /expired|destroyed|consumed|invalid/i.test(thrown)) || scopeError !== null;
    result.oldViewError = { thrown, validation: scopeError === null ? null : String(scopeError.message || scopeError) };
    step('old-view-rejection', { rejected: result.oldViewRejected, ...result.oldViewError });
    await frame();
    const nextTexture = context.getCurrentTexture();
    result.nextFrameIdentity = nextTexture !== destroyed;
    const nextView = nextTexture.createView();
    step('new-frame-acquired', { newObject: result.nextFrameIdentity });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass(descriptor(nextView));
    if (!pass) throw Error('New Surface frame render pass is undefined');
    pass.end();
    device.queue.submit([encoder.finish()]);
    step('new-frame-submitted');
    await device.queue.onSubmittedWorkDone();
    result.queueCompleted = true;
    await frame();
    result.completed = true;
    result.pass = result.destroyIdempotent && result.sameFrameIdentity && result.oldViewRejected &&
        result.nextFrameIdentity && result.queueCompleted && result.gpuErrors.length === 0;
    step('completed');
}
void run().catch((error) => { result.error = String(error.stack || error); }).finally(() => {
    console.log('AIR_CANVAS_DESTROY_RESULT ' + JSON.stringify(result));
    process.exit(result.pass ? 0 : 1);
});
