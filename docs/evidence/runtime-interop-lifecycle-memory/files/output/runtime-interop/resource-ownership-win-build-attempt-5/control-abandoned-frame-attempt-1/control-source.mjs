// Acquire a real presentation frame, abandon it without submit, then use the next real frame.
const result = { schema: 'air-native-abandoned-frame-control-v1', completed: false, pass: false, steps: [], gpuErrors: [] };
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const step = (stage, details = {}) => {
    result.stage = stage;
    result.steps.push({ stage, at: performance.now(), ...details });
    console.log('AIR_ABANDONED_FRAME_STEP ' + JSON.stringify(result.steps.at(-1)));
};
async function run() {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();
    device.addEventListener('uncapturederror', (event) => {
        const value = String(event.error?.message || event.error);
        result.gpuErrors.push({ stage: result.stage, error: value });
        console.log('AIR_ABANDONED_FRAME_GPU_ERROR ' + value);
    });
    const canvas = globalThis.canvas;
    canvas.width = 320; canvas.height = 240;
    const context = canvas.getContext('webgpu');
    context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat() });
    await frame();
    const abandonedTexture = context.getCurrentTexture();
    const abandonedView = abandonedTexture.createView();
    step('acquired-without-submit', { textureId: abandonedTexture._nativeResourceId, viewId: abandonedView._nativeResourceId });
    await frame();
    step('next-real-frame');
    const texture = context.getCurrentTexture();
    const view = texture.createView();
    step('next-frame-acquired', { textureId: texture._nativeResourceId, viewId: view._nativeResourceId });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [
        { view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0.8, g: 0.1, b: 0.2, a: 1 } },
    ] });
    if (!pass) throw Error('Next-frame render pass returned undefined');
    pass.end();
    step('next-frame-encoded');
    device.queue.submit([encoder.finish()]);
    step('next-frame-submitted');
    await device.queue.onSubmittedWorkDone();
    step('next-frame-queue-complete');
    await frame();
    result.completed = true;
    result.pass = result.gpuErrors.length === 0;
    step('completed', { retainedOriginalObjects: !!abandonedTexture && !!abandonedView });
}
void run().catch((error) => { result.error = String(error.stack || error); }).finally(() => {
    console.log('AIR_ABANDONED_FRAME_RESULT ' + JSON.stringify(result));
    process.exit(result.pass ? 0 : 1);
});
