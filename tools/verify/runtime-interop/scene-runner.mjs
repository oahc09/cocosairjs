import { buildModelScenario } from './scene-models.mjs';
import { buildUiScenario } from './scene-ui.mjs';
import { buildComputeScenario } from './scene-compute.mjs';

export const SCENE_IDS = Object.freeze(['pbr', 'skin', 'ui', 'compute']);

export async function runSceneScenario({ id, canvas, bundleUrl, assetRootUrl, capturePresentation }) {
    const result = { id: `scene-${id}`, status: 'FAIL', observations: { gpuErrors: [], presentation: {} } };
    const o = result.observations;
    const assert = (condition, message) => {
        if (!condition) throw Error(message);
    };
    const noGpuErrors = () =>
        assert(!o.gpuErrors.length, 'Uncaptured GPU errors: ' + o.gpuErrors.map((e) => e.message).join('\n'));
    const onGpuError = (event) =>
        o.gpuErrors.push({ message: String(event.error?.message || event.error), name: event.error?.name || null });
    let air, app, clock, builder, nativeDevice;
    try {
        assert(SCENE_IDS.includes(id), 'Unknown matrix scene');
        o.stage = 'import-bundle';
        air = await import(bundleUrl);
        o.stage = 'create-app';
        app = await air.createAirApp({ canvas, renderer: 'webgpu' });
        nativeDevice = air.director.root.device.nativeDevice;
        nativeDevice.addEventListener('uncapturederror', onGpuError);
        const scene = new air.Scene(`runtime-interop-${id}`);
        const cameraNode = new air.Node('Camera');
        scene.addChild(cameraNode);
        cameraNode.setPosition(0, 0, 4);
        cameraNode.lookAt(new air.Vec3());
        const camera = cameraNode.addComponent(air.Camera);
        camera.projection = air.Camera.ProjectionType.PERSPECTIVE;
        camera.fov = 45;
        camera.near = 0.1;
        camera.far = 100;
        camera.clearFlags = air.Camera.ClearFlag.SOLID_COLOR;
        camera.clearColor = new air.Color(20, 40, 80, 255);
        camera.visibility = air.Layers.Enum.DEFAULT;
        camera.priority = 0;
        o.stage = 'build-scene';
        const build = id === 'ui' ? buildUiScenario : id === 'compute' ? buildComputeScenario : buildModelScenario;
        builder = await build(air, { id, scene, camera, cameraNode, assetRootUrl });
        app.run(scene);
        clock = air.createStepClock();
        clock.begin();
        o.phases = {};
        for (const phase of ['before', 'after']) {
            o.stage = phase;
            if (phase === 'after') await builder.advance?.();
            const count = (phase === 'before' ? builder.initialSteps : builder.advanceSteps) ?? 3;
            assert(Number.isInteger(count) && count > 0 && count <= 120, 'Invalid bounded scene steps');
            const steps = [];
            for (let i = 0; i < count; i++) steps.push(await clock.step());
            await nativeDevice.queue.onSubmittedWorkDone();
            noGpuErrors();
            const device = air.director.root.device;
            assert(
                device.gfxAPI === air.gfx.API.WEBGPU && device.numDrawCalls > 0,
                'Scene did not draw through AIR WebGPU',
            );
            assert(app.contextHealth.snapshot().state === 'healthy', 'Scene context is unhealthy');
            const before = air.director.getTotalFrames();
            await new Promise((resolve, reject) => {
                let animation;
                const timer = setTimeout(() => {
                    cancelAnimationFrame(animation);
                    reject(Error('Scene presentation boundary timed out'));
                }, 2000);
                animation = requestAnimationFrame(() => {
                    animation = requestAnimationFrame(() => {
                        clearTimeout(timer);
                        resolve();
                    });
                });
            });
            assert(
                air.game.isPaused() && air.director.getTotalFrames() === before,
                'Scene native clock advanced while paused',
            );
            o.phases[phase] = { steps, frame: before, draws: device.numDrawCalls, state: await builder.inspect() };
            if (typeof capturePresentation !== 'function') {
                o.presentation[phase] = {
                    pass: false,
                    status: 'NOT_RUN',
                    reason: 'Independent scene capture unavailable',
                };
            } else {
                const capture = await capturePresentation({ canvas, phase, kind: `scene-${id}` });
                o.presentation[phase] = capture;
                assert(capture?.pass === true && capture.status === 'PASS', `Independent ${id} ${phase} PNG failed`);
            }
            assert(
                air.game.isPaused() && air.director.getTotalFrames() === before,
                'Scene clock advanced during capture',
            );
            await nativeDevice.queue.onSubmittedWorkDone();
            noGpuErrors();
        }
        await builder.verify(o.phases.before.state, o.phases.after.state);
        result.status = typeof capturePresentation === 'function' ? 'PASS' : 'NOT_RUN';
    } catch (error) {
        result.error = String(error.stack || error);
    } finally {
        const cleanup = (o.cleanup = { attempted: !!app });
        const failures = [];
        const attempt = async (label, operation) => {
            try {
                await operation();
            } catch (error) {
                failures.push({ label, error: String(error.stack || error) });
            }
        };
        if (clock)
            await attempt('pacing', () => {
                clock.end();
                cleanup.nativePacingRestored = !air.game.isPaused();
                assert(cleanup.nativePacingRestored, 'Native pacing not restored');
            });
        if (builder)
            await attempt('owned-assets', async () => {
                cleanup.disposed = await builder.dispose();
            });
        if (app)
            await attempt('app', async () => {
                cleanup.release = await app.close();
                cleanup.sceneReleased = !app.getScene();
                assert(cleanup.release.status === 'released' && cleanup.sceneReleased, 'Scene release failed');
            });
        if (builder?.resources)
            await attempt('resource-state', () => {
                cleanup.resources = builder.resources();
                assert(
                    cleanup.resources.every((r) =>
                        r.contract === 'material-instance-passes'
                            ? r.destroyRequested === true &&
                              r.passes === 0 &&
                              r.bound === false &&
                              typeof r.valid === 'boolean'
                            : r.valid === false,
                    ),
                    'Owned scene resource was not released under its actual type contract',
                );
            });
        if (nativeDevice) {
            await attempt('gpu-errors', async () => {
                await nativeDevice.queue.onSubmittedWorkDone();
                await new Promise((r) => setTimeout(r, 0));
                noGpuErrors();
            });
            await attempt('listener', () => nativeDevice.removeEventListener('uncapturederror', onGpuError));
        }
        if (failures.length) {
            cleanup.failures = failures;
            result.status = 'FAIL';
            result.error ||= failures.map((f) => `${f.label}: ${f.error}`).join('\n');
        }
    }
    return result;
}
