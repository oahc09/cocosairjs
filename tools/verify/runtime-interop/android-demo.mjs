// Interactive launcher content. Formal acceptance uses the separate, fixed six-case protocol.
export async function runAndroidDemo({ canvas, bundleUrl, publish }) {
    const air = await import(bundleUrl);
    const app = await air.createAirApp({ canvas, renderer: 'webgpu' });
    const { Scene, Node, Camera, Layers, Color, Material, MeshRenderer, Vec3, utils, primitives } = air;
    const scene = new Scene('android-native-demo');
    const cameraNode = new Node('Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(0, 0, 4);
    cameraNode.lookAt(new Vec3());
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.PERSPECTIVE;
    camera.fov = 45;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(20, 40, 80, 255);
    camera.visibility = Layers.Enum.DEFAULT;
    const cube = new Node('Tap to change color');
    cube.layer = Layers.Enum.DEFAULT;
    scene.addChild(cube);
    const material = new Material();
    material.initialize({ effectName: 'builtin-unlit' });
    material.setProperty('mainColor', new Color(255, 64, 32, 255));
    const mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
    const renderer = cube.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.material = material;
    app.run(scene);
    const state = { frames: 0, taps: 0, color: 'orange', gpuErrors: [] };
    globalThis.__ANDROID_AIR_DEMO__ = state;
    const device = air.director.root.device.nativeDevice;
    device.addEventListener('uncapturederror', (event) => {
        const error = String(event.error?.message || event.error || event);
        state.gpuErrors.push(error);
        console.error('ANDROID_DEMO_GPU_ERROR', error);
    });
    canvas.addEventListener('mousedown', (event) => {
        state.taps++;
        state.color = state.taps % 2 ? 'green' : 'orange';
        material.setProperty(
            'mainColor',
            state.color === 'green' ? new Color(64, 224, 96, 255) : new Color(255, 64, 32, 255),
        );
        void publish({
            stage: 'demo-input',
            ...state,
            type: event.type,
            isTrusted: event.isTrusted,
            clientX: event.clientX,
            clientY: event.clientY,
        }).catch((error) => console.error(String(error)));
    });
    let ready, timer;
    const rendered = new Promise((resolve, reject) => {
        ready = resolve;
        timer = setTimeout(() => reject(Error('Demo real draw boundary exceeded 2000ms')), 2000);
    });
    const frame = () => {
        state.frames = air.director.getTotalFrames();
        // A tap freezes the angle so its real material response can be inspected clearly.
        if (!state.taps) cube.setRotationFromEuler(15, (state.frames * 0.6) % 360, 0);
        if (air.director.getTotalFrames() >= 3 && air.director.root.device.numDrawCalls > 0) ready();
    };
    // Drive rotation and observations from actual AIR draws, independent of the host rAF polling rate.
    air.director.on(air.Director.EVENT_AFTER_DRAW, frame);
    await rendered;
    clearTimeout(timer);
    await device.queue.onSubmittedWorkDone();
    if (air.director.root.device.numDrawCalls < 1 || state.gpuErrors.length) throw Error('Demo did not render');
    await publish({ stage: 'demo-ready', ...state, health: app.contextHealth.snapshot() });
    return { schema: 'air-android-demo-v1', ready: true, scope: 'interactive-startup-only', ...state };
}
