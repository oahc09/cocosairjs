import {
    createAirApp,
    createAirInstanceBatch,
    Scene,
    Node,
    Camera,
    Color,
    Layers,
    Mat4,
    Vec3,
    Vec4,
    utils,
    primitives,
    Director,
    director,
    geometry,
} from 'cocosair';

async function main(): Promise<void> {
    const app = await createAirApp({ canvas: '#GameCanvas', pixelRatioCap: 1.5 });
    const scene = new Scene('Instance batches');
    const cameraNode = new Node('Main Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(0, 10, 16);
    cameraNode.lookAt(new Vec3());
    const camera = cameraNode.addComponent(Camera);
    camera.visibility = Layers.Enum.DEFAULT;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(9, 18, 26, 255);
    camera.fov = 48;
    camera.near = 0.1;
    camera.far = 100;
    const mesh = utils.createMesh(primitives.box({ width: 0.38, height: 0.38, length: 0.38 }));
    const batch = createAirInstanceBatch({ parent: scene, mesh, capacity: 256 });
    let generation = 0,
        selected = -1;
    const status = document.querySelector<HTMLOutputElement>('#status')!;
    const updateStatus = () => {
        const i = batch.info;
        status.textContent = `有效实例 ${i.count} / 容量 ${i.capacity}\n批次子节点 ${batch.node.children.length}\n本次上传 ${i.lastUploadBytes} 字节\n设备属性上限 ${i.maxVertexAttributes}\n选中实例 ${selected}`;
    };
    const populate = (count: number) => {
        const columns = Math.ceil(Math.sqrt(count)),
            spacing = Math.min(0.72, 12 / columns);
        for (let i = 0; i < count; i++) {
            const x = ((i % columns) - (columns - 1) / 2) * spacing,
                z = (Math.floor(i / columns) - (columns - 1) / 2) * spacing;
            const m = Mat4.fromTranslation(new Mat4(), new Vec3(x, Math.sin(i * 0.3) * 0.3, z));
            const scale = Math.min(1, spacing / 0.48);
            Mat4.scale(m, m, new Vec3(scale, scale, scale));
            batch.setMatrix(i, m);
            batch.setColor(
                i,
                new Vec4(
                    0.15 + (0.75 * (i % columns)) / columns,
                    0.2 + (0.7 * Math.floor(i / columns)) / columns,
                    0.65,
                    1,
                ),
            );
        }
        batch.commit();
        batch.setCount(count);
        selected = -1;
        updateStatus();
    };
    populate(144);
    document.querySelector('#grow')!.addEventListener('click', () => {
        batch.reserve(Math.max(batch.info.capacity, 2048));
        populate(2048);
    });
    document.querySelector('#range')!.addEventListener('click', () => {
        generation++;
        for (let i = 0; i < Math.min(16, batch.info.count); i++) batch.setColor(i, new Vec4(generation % 2, 1, 0, 1));
        batch.commit(0, Math.min(16, batch.info.count));
        updateStatus();
    });
    document.querySelector('#empty')!.addEventListener('click', () => {
        batch.setCount(0);
        updateStatus();
    });
    document.querySelector('#reset')!.addEventListener('click', () => populate(144));
    const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;
    canvas.addEventListener('pointerdown', (event) => {
        const rect = canvas.getBoundingClientRect();
        const ray = camera.screenPointToRay(
            ((event.clientX - rect.left) * canvas.width) / rect.width,
            ((rect.bottom - event.clientY) * canvas.height) / rect.height,
            new geometry.Ray(),
        );
        selected = batch.raycast(ray)?.instanceIndex ?? -1;
        if (selected >= 0) {
            batch.setColor(selected, new Vec4(1, 0.5, 0.05, 1));
            batch.commit(selected, 1);
        }
        updateStatus();
    });
    app.run(scene);
    director.once(Director.EVENT_AFTER_DRAW, () => {
        (window as any).__appReady = true;
        updateStatus();
    });
    (window as any).__instanceBatch = {
        batch,
        app,
        dispose: async () => {
            batch.dispose();
            await app.releaseScene!();
            mesh.destroy();
        },
    };
}
main().catch((error) => {
    console.error(error);
    document.querySelector('#status')!.textContent = String(error);
});
