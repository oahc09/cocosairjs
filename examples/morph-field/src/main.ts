import {
    createAirApp,
    createAirMorphField,
    createAirPostProcess,
    sampleAirTextShape,
    sampleAirImageShape,
    sampleAirTriangleShape,
    Scene,
    Node,
    Camera,
    Color,
    Layers,
    primitives,
    director,
    Director,
    game,
} from 'cocosair';
import type { AirMorphField, AirPointShape, AirMorphSurface } from 'cocosair';

const COUNT = 16384;
async function main(): Promise<void> {
    const app = await createAirApp({ canvas: '#GameCanvas', pixelRatioCap: 1.5 });
    const scene = new Scene('Form Matter');
    const cameraNode = new Node('Main Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(0, 0, 12);
    const camera = cameraNode.addComponent(Camera);
    Object.assign(camera, {
        projection: Camera.ProjectionType.ORTHO,
        orthoHeight: 3.2,
        near: 0.1,
        far: 100,
        visibility: Layers.Enum.DEFAULT,
        clearFlags: Camera.ClearFlag.SOLID_COLOR,
        clearColor: new Color(1, 2, 4, 255),
    });
    const text = await sampleAirTextShape({
        text: 'AIR',
        font: 'bold 200px sans-serif',
        count: COUNT,
        size: 6,
        seed: 42,
    });
    const sampleMesh = (geometry: { positions: number[]; indices?: number[]; normals?: number[] }) =>
        sampleAirTriangleShape({
            positions: new Float32Array(geometry.positions),
            normals: geometry.normals ? new Float32Array(geometry.normals) : undefined,
            indices: geometry.indices ? new Uint32Array(geometry.indices) : undefined,
            count: COUNT,
            seed: 42,
        });
    const sphere = sampleMesh(primitives.sphere(2)),
        torus = sampleMesh(primitives.torus(1.75, 0.55));
    // Present the torus at an angle instead of looking edge-on at its native XZ plane.
    for (const values of [torus.positions, torus.normals!])
        for (let i = 0; i < COUNT; i++) {
            const y = values[i * 3 + 1],
                z = values[i * 3 + 2];
            values[i * 3 + 1] = y * Math.cos(0.9) - z * Math.sin(0.9);
            values[i * 3 + 2] = y * Math.sin(0.9) + z * Math.cos(0.9);
        }
    // Local original raster: an orbital ring and a core, no online images or asset pipeline.
    const rgba = new Uint8Array(128 * 128 * 4);
    for (let y = 0; y < 128; y++)
        for (let x = 0; x < 128; x++) {
            const dx = (x - 63.5) / 64,
                dy = (y - 63.5) / 64,
                r = Math.hypot(dx, dy),
                i = (y * 128 + x) * 4;
            rgba[i] = 255;
            rgba[i + 1] = 150;
            rgba[i + 2] = 60;
            rgba[i + 3] =
                r < 0.16 || Math.abs(r - 0.7) < 0.04 || (Math.abs(dx + dy * 0.55) < 0.035 && r < 0.9) ? 255 : 0;
        }
    const image = sampleAirImageShape({ rgba, width: 128, height: 128, count: COUNT, size: 5, seed: 42 });
    const targets: AirPointShape[] = [text, sphere, torus, image];
    targets.forEach((shape, target) => {
        for (let i = 0; i < COUNT; i++) {
            const blend = Math.max(0, Math.min(1, (shape.positions[i * 3 + 1] + 2) / 4));
            const warm = target === 0 || target === 3;
            shape.colors[i * 3] = warm ? 0.72 + blend * 0.2 : 0.22 + blend * 0.12;
            shape.colors[i * 3 + 1] = warm ? 0.3 + blend * 0.16 : 0.4 + blend * 0.18;
            shape.colors[i * 3 + 2] = warm ? 0.055 + blend * 0.04 : 0.5 + blend * 0.2;
        }
    });
    // A gently crowned normal field gives flat glyph/image samples a broad studio reflection.
    for (const shape of [text, image]) {
        const normals = new Float32Array(COUNT * 3);
        for (let i = 0; i < COUNT; i++) {
            const x = shape.positions[i * 3] * 0.16,
                y = shape.positions[i * 3 + 1] * 0.32,
                length = Math.hypot(x, y, 1);
            normals[i * 3] = x / length;
            normals[i * 3 + 1] = y / length;
            normals[i * 3 + 2] = 1 / length;
        }
        targets[targets.indexOf(shape)] = { ...shape, normals };
    }
    const from = document.querySelector<HTMLSelectElement>('#from')!,
        to = document.querySelector<HTMLSelectElement>('#to')!;
    const mode = document.querySelector<HTMLSelectElement>('#mode')!,
        progress = document.querySelector<HTMLInputElement>('#progress')!;
    const surface = document.querySelector<HTMLSelectElement>('#surface')!,
        roughness = document.querySelector<HTMLInputElement>('#roughness')!;
    const auto = document.querySelector<HTMLInputElement>('#auto')!,
        pause = document.querySelector<HTMLButtonElement>('#pause')!;
    const status = document.querySelector<HTMLOutputElement>('#status')!,
        canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;
    let field: AirMorphField = createAirMorphField({
        parent: scene,
        targets,
        size: 0.07,
        surface: 'polished',
        roughness: 0.18,
        name: 'Morph field',
    });
    const post = createAirPostProcess(camera, {
        levels: 4,
        toneMapping: 'aces',
        exposure: 1.05,
        bloom: { intensity: 0.24, threshold: 1.2, softKnee: 0.5, scatter: 0.65 },
    });
    let paused = false,
        elapsed = 0,
        yaw = 0,
        pitch = 0,
        drag: { x: number; y: number } | null = null;
    const apply = () => {
        field.setTransition(Number(from.value), Number(to.value), Number(progress.value));
    };
    const scrub = () => {
        auto.checked = false;
        apply();
    };
    const replace = () => {
        const old = field;
        field = createAirMorphField({
            parent: scene,
            targets,
            size: 0.07,
            surface: surface.value as AirMorphSurface,
            roughness: Number(roughness.value),
            mode: mode.value as 'points' | 'voxels',
            name: 'Morph field',
        });
        field.node.setRotationFromEuler(pitch, yaw, 0);
        apply();
        old.dispose();
    };
    const toggle = () => {
        paused = !paused;
        pause.textContent = paused ? '继续' : '暂停';
    };
    const polish = () => field.setSurface(surface.value as AirMorphSurface, Number(roughness.value));
    const begin = (event: PointerEvent) => {
        drag = { x: event.clientX, y: event.clientY };
        canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
        if (!drag) return;
        yaw += (event.clientX - drag.x) * 0.25;
        pitch = Math.max(-70, Math.min(70, pitch + (event.clientY - drag.y) * 0.25));
        drag = { x: event.clientX, y: event.clientY };
        field.node.setRotationFromEuler(pitch, yaw, 0);
    };
    const end = () => {
        drag = null;
    };
    from.addEventListener('change', apply);
    to.addEventListener('change', apply);
    progress.addEventListener('input', scrub);
    mode.addEventListener('change', replace);
    pause.addEventListener('click', toggle);
    surface.addEventListener('change', polish);
    roughness.addEventListener('input', polish);
    canvas.addEventListener('pointerdown', begin);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    let fittedWidth = 0,
        fittedHeight = 0;
    const update = () => {
        if (canvas.width !== fittedWidth || canvas.height !== fittedHeight) {
            const rect = canvas.getBoundingClientRect();
            const top = document.querySelector('header')!.getBoundingClientRect().bottom + 12;
            const bottom = document.querySelector('aside')!.getBoundingClientRect().top - 12;
            const available = Math.max(48, bottom - top),
                visibleHeight = Math.max(6.4, 7 / (rect.width / available));
            camera.orthoHeight = (visibleHeight * rect.height) / available / 2;
            cameraNode.setPosition(0, (((top + bottom) / 2 - rect.height / 2) * visibleHeight) / available, 12);
            fittedWidth = canvas.width;
            fittedHeight = canvas.height;
        }
        if (!paused && auto.checked) {
            elapsed += game.deltaTime;
            progress.value = String((1 - Math.cos(elapsed * 0.7)) / 2);
            apply();
        }
        const info = field.info;
        status.value = `${info.count.toLocaleString()} ${info.mode} · ${info.surface} / roughness ${info.roughness.toFixed(2)} · ${(info.gpuBytes / 1048576).toFixed(2)} MiB GPU · 进度更新 0 B 形态/实例上传`;
    };
    director.on(Director.EVENT_BEFORE_UPDATE, update);
    apply();
    app.run(scene);
    director.once(Director.EVENT_AFTER_DRAW, () => {
        (window as any).__appReady = true;
    });
    let release: Promise<void> | null = null;
    const dispose = () =>
        release ??
        (release = (async () => {
            director.off(Director.EVENT_BEFORE_UPDATE, update);
            from.removeEventListener('change', apply);
            to.removeEventListener('change', apply);
            progress.removeEventListener('input', scrub);
            mode.removeEventListener('change', replace);
            pause.removeEventListener('click', toggle);
            surface.removeEventListener('change', polish);
            roughness.removeEventListener('input', polish);
            canvas.removeEventListener('pointerdown', begin);
            canvas.removeEventListener('pointermove', move);
            canvas.removeEventListener('pointerup', end);
            canvas.removeEventListener('pointercancel', end);
            field.dispose();
            post.dispose();
            targets.length = 0;
            await app.releaseScene!();
        })());
    (window as any).__morphField = {
        app,
        get field() {
            return field;
        },
        post,
        targets,
        dispose,
    };
    window.addEventListener(
        'pagehide',
        () => {
            void dispose();
        },
        { once: true },
    );
}
main().catch((error) => {
    console.error(error);
    document.querySelector<HTMLOutputElement>('#status')!.value = String(error);
});
