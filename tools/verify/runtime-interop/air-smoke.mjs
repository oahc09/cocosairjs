// Run in a fresh host page/process, separately from the raw probes' GPU devices.
export async function runAirSmoke({ canvas, bundleUrl, capturePresentation }) {
    const result = { id: 'air-webgpu-smoke', status: 'FAIL', observations: {} };
    const observations = result.observations;
    observations.gpuErrors = [];
    const requireCondition = (condition, message) => {
        if (!condition) throw new Error(message);
    };
    const onGpuError = (event) => {
        observations.gpuErrors.push({
            message: String(event.error?.message ?? event.error ?? event.message ?? 'Unknown GPU error'),
            name: event.error?.name || event.error?.constructor?.name || null,
        });
    };
    const requireNoGpuErrors = () =>
        requireCondition(
            observations.gpuErrors.length === 0,
            'AIR reported uncaptured GPU errors: ' + observations.gpuErrors.map((error) => error.message).join('\n'),
        );
    let air, app, clock, mesh, material, nativeDevice;
    try {
        observations.stage = 'import-bundle';
        air = await import(bundleUrl);
        observations.stage = 'create-app';
        app = await air.createAirApp({ canvas, renderer: 'webgpu' });
        nativeDevice = air.director.root.device.nativeDevice;
        requireCondition(
            typeof nativeDevice?.addEventListener === 'function' &&
                typeof nativeDevice.removeEventListener === 'function',
            'Native GPU device does not implement the error event contract',
        );
        nativeDevice.addEventListener('uncapturederror', onGpuError);
        observations.stage = 'scene-render';
        const { Scene, Node, Camera, Layers, Color, Material, MeshRenderer, Vec3, utils, primitives } = air;
        const scene = new Scene('runtime-interop-cube');
        const cameraNode = new Node('Camera');
        scene.addChild(cameraNode);
        cameraNode.setPosition(0, 0, 4);
        cameraNode.lookAt(new Vec3(0, 0, 0));
        const camera = cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.PERSPECTIVE;
        camera.fov = 45;
        camera.near = 0.1;
        camera.far = 100;
        camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        camera.clearColor = new Color(20, 40, 80, 255);
        camera.visibility = Layers.Enum.DEFAULT;
        camera.priority = 0;
        const cube = new Node('Cube');
        cube.layer = Layers.Enum.DEFAULT;
        cube.setRotationFromEuler(15, 25, 0);
        scene.addChild(cube);
        material = new Material();
        material.initialize({ effectName: 'builtin-unlit' });
        material.setProperty('mainColor', new Color(255, 64, 32, 255));
        mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
        const renderer = cube.addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.material = material;
        app.run(scene);
        clock = air.createStepClock();
        clock.begin();
        const steps = [];
        for (let index = 0; index < 3; index++) steps.push(await clock.step());
        const device = air.director.root.device;
        await nativeDevice.queue.onSubmittedWorkDone();
        requireNoGpuErrors();
        observations.render = {
            gfxAPI: device.gfxAPI,
            expectedGfxAPI: air.gfx.API.WEBGPU,
            draws: device.numDrawCalls,
            steps,
            health: app.contextHealth.snapshot(),
        };
        requireCondition(device.gfxAPI === air.gfx.API.WEBGPU, 'AIR selected a different graphics backend');
        requireCondition(device.numDrawCalls > 0, 'AIR did not draw the cube');
        requireCondition(observations.render.health.state === 'healthy', 'AIR context is not healthy');
        const frame = { before: air.director.getTotalFrames(), paused: air.game.isPaused() };
        requireCondition(frame.paused, 'Presentation requires the paused step clock');
        await new Promise((resolve, reject) => {
            let animation;
            const timer = setTimeout(() => {
                cancelAnimationFrame(animation);
                reject(new Error('Presentation boundary exceeded 2000ms'));
            }, 2000);
            animation = requestAnimationFrame(() => {
                animation = requestAnimationFrame(() => {
                    clearTimeout(timer);
                    resolve();
                });
            });
        });
        frame.after = air.director.getTotalFrames();
        frame.presentationFrames = 2;
        requireCondition(air.game.isPaused() && frame.before === frame.after, 'Paused AIR clock advanced');
        observations.frame = frame;
        if (typeof capturePresentation !== 'function') {
            observations.presentation = { status: 'NOT_RUN', reason: 'Independent presentation capture unavailable' };
            result.status = 'NOT_RUN';
        } else {
            const expected = {
                background: { blueOverRed: 20, blueOverGreen: 10 },
                subject: { redOverGreen: 35, redOverBlue: 35 },
                minimumPixels: 64,
            };
            const capture = await capturePresentation({ canvas, kind: 'air', expected, frame });
            observations.presentation = capture;
            requireCondition(
                capture?.status === 'PASS' &&
                    capture.backgroundPixels >= expected.minimumPixels &&
                    capture.subjectPixels >= expected.minimumPixels,
                'Independent PNG did not show the blue background and orange cube',
            );
            requireCondition(
                air.game.isPaused() && air.director.getTotalFrames() === frame.after,
                'AIR clock advanced during presentation capture',
            );
            await nativeDevice.queue.onSubmittedWorkDone();
            requireNoGpuErrors();
            result.status = 'PASS';
        }
    } catch (error) {
        result.error = String(error?.stack || error);
    } finally {
        const cleanup = (observations.cleanup = { attempted: Boolean(app) });
        const failures = [];
        const attempt = async (label, operation) => {
            try {
                await operation();
            } catch (error) {
                failures.push({ label, error: String(error?.stack || error) });
            }
        };
        if (clock)
            await attempt('native-pacing', () => {
                clock.end();
                cleanup.nativePacingRestored = !air.game.isPaused();
                requireCondition(cleanup.nativePacingRestored, 'Native pacing was not restored before cleanup');
            });
        if (mesh)
            await attempt('mesh', () => {
                cleanup.meshDestroyRequested = mesh.destroy();
            });
        if (material)
            await attempt('material', () => {
                cleanup.materialDestroyRequested = material.destroy();
            });
        if (app)
            await attempt('app', async () => {
                cleanup.release = await app.close();
                cleanup.sceneReleased = !app.getScene();
                cleanup.meshValid = mesh?.isValid ?? false;
                cleanup.materialValid = material?.isValid ?? false;
                requireCondition(
                    cleanup.release.status === 'released' &&
                        cleanup.sceneReleased &&
                        !cleanup.meshValid &&
                        !cleanup.materialValid,
                    'AIR scene or owned resources did not release',
                );
            });
        if (nativeDevice) {
            await attempt('gpu-errors', async () => {
                await nativeDevice.queue.onSubmittedWorkDone();
                await new Promise((resolve) => setTimeout(resolve, 0));
                requireNoGpuErrors();
            });
            await attempt('gpu-error-listener', () => nativeDevice.removeEventListener('uncapturederror', onGpuError));
        }
        if (failures.length) {
            cleanup.failures = failures;
            cleanup.error = failures.map(({ label, error }) => `${label}: ${error}`).join('\n');
            result.status = 'FAIL';
            result.error = result.error || cleanup.error;
        }
    }
    return result;
}
