import {
    createAirApp,
    createAirParticleSystem,
    Scene,
    Node,
    Camera,
    Color,
    Vec3,
    Layers,
    ParticleShapeType,
    ParticleSpace,
    ParticleCurveMode,
    ParticleRenderMode,
    director,
    Director,
} from 'cocosair';

async function main(): Promise<void> {
    const app = await createAirApp({ canvas: '#GameCanvas', pixelRatioCap: 1.5 });
    const scene = new Scene('Native particles');
    const cameraNode = new Node('Main Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(0, 2, 10);
    cameraNode.lookAt(new Vec3(0, 0.5, 0));
    const camera = cameraNode.addComponent(Camera);
    camera.visibility = Layers.Enum.DEFAULT;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(7, 13, 23, 255);
    const make = (gpu: boolean, x: number) =>
        createAirParticleSystem({
            parent: scene,
            name: gpu ? 'GPU fountain' : 'CPU trails',
            useGPU: gpu,
            configure(p) {
                p.node.setPosition(x, -1, 0);
                p.capacity = 256;
                p.rateOverTime.constant = 48;
                p.startLifetime.constant = 2;
                p.startSpeed.constant = 1.8;
                p.startSizeX.constant = 0.12;
                p.startColor.color = gpu ? new Color(30, 160, 255, 255) : new Color(255, 100, 30, 255);
                p.simulationSpace = ParticleSpace.World;
                p.shapeModule!.enable = true;
                p.shapeModule!.shapeType = ParticleShapeType.Cone;
                p.shapeModule!.angle = 20;
                p.shapeModule!.radius = 0.35;
                p.node.setRotationFromEuler(-90, 0, 0);
                const size = p.sizeOvertimeModule!;
                size.enable = true;
                size.size.mode = ParticleCurveMode.Curve;
                size.size.spline.assignSorted([
                    [0, { value: 1 }],
                    [1, { value: 0.05 }],
                ]);
                p.trailModule!.enable = !gpu;
                p.trailModule!.colorFromParticle = true;
                p.trailModule!.widthRatio.constant = 0.2;
            },
        });
    const cpu = make(false, -1.8),
        gpu = make(true, 1.8);
    const all = [cpu, gpu];
    const preset = document.querySelector<HTMLSelectElement>('#preset')!;
    const changePreset = () => {
        const kind = preset.value,
            falling = kind === 'rain' || kind === 'snow';
        all.forEach((p, i) => {
            p.stop();
            p.node.setPosition(i === 0 ? -1.8 : 1.8, falling ? 2.3 : -1, 0);
            p.node.setRotationFromEuler(falling ? 90 : -90, 0, 0);
            p.shapeModule!.shapeType = falling
                ? ParticleShapeType.Box
                : kind === 'embers'
                  ? ParticleShapeType.Sphere
                  : ParticleShapeType.Cone;
            p.shapeModule!.scale = falling ? new Vec3(2.5, 0.2, 0.4) : new Vec3(1, 1, 1);
            p.startLifetime.constant = kind === 'smoke' ? 3 : 2;
            p.startSpeed.constant = kind === 'rain' ? 4 : kind === 'snow' ? 0.6 : kind === 'smoke' ? 0.7 : 1.8;
            p.startSizeX.constant = kind === 'smoke' ? 0.4 : kind === 'snow' ? 0.08 : 0.12;
            p.startColor.color =
                kind === 'smoke'
                    ? new Color(160, 170, 185, 60)
                    : falling
                      ? new Color(130, 190, 255, 180)
                      : kind === 'embers'
                        ? new Color(255, 100, 25, 255)
                        : i === 0
                          ? new Color(255, 100, 30, 255)
                          : new Color(30, 160, 255, 255);
            p.renderer.renderMode =
                kind === 'rain' ? ParticleRenderMode.StrecthedBillboard : ParticleRenderMode.Billboard;
            p.renderer.velocityScale = 0.12;
            p.sizeOvertimeModule!.size.spline.assignSorted([
                [0, { value: 1 }],
                [1, { value: kind === 'smoke' ? 3 : falling ? 0.8 : 0.05 }],
            ]);
            p.trailModule!.enable = i === 0 && kind === 'spray';
            p.processor.updateMaterialParams();
            p.play();
        });
    };
    preset.addEventListener('change', changePreset);
    const output = document.querySelector<HTMLOutputElement>('#status')!;
    const buttons = ['pause', 'resume', 'drain', 'replay'].map((id) => document.getElementById(id)!);
    const callbacks = [
        () => all.forEach((p) => p.pause()),
        () => all.forEach((p) => p.play()),
        () => all.forEach((p) => p.stopEmitting()),
        () =>
            all.forEach((p) => {
                p.stop();
                p.play();
            }),
    ];
    buttons.forEach((b, i) => b.addEventListener('click', callbacks[i]));
    const update = () => {
        output.value = `CPU ${cpu.getParticleCount()} / GPU ${gpu.getParticleCount()}\n${cpu.isPaused ? 'PAUSED' : cpu.isEmitting ? 'EMITTING' : 'DRAINING'} · 原生时间 ${cpu.time.toFixed(2)}s`;
    };
    director.on(Director.EVENT_AFTER_DRAW, update);
    app.run(scene);
    director.once(Director.EVENT_AFTER_DRAW, () => {
        (window as any).__appReady = true;
    });
    let disposed = false;
    const dispose = async () => {
        if (disposed) return;
        disposed = true;
        director.off(Director.EVENT_AFTER_DRAW, update);
        buttons.forEach((b, i) => b.removeEventListener('click', callbacks[i]));
        preset.removeEventListener('change', changePreset);
        all.forEach((p) => p.node.destroy());
        await app.releaseScene!();
    };
    (window as any).__particles3d = { app, cpu, gpu, dispose };
    window.addEventListener('pagehide', dispose, { once: true });
}
main().catch((error) => {
    document.querySelector<HTMLOutputElement>('#status')!.value = String(error);
    console.error(error);
});
