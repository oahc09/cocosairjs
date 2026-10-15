import * as cc from 'cocosair';

const status = document.querySelector<HTMLElement>('#status')!;
try {
    const { CocosSparkLayer, sparkRuntime: S, sparkMath: M } = await import('cocosair-spark');
    const app = await cc.createAirApp({ canvas: '#GameCanvas' });
    const scene = new cc.Scene('Independent Spark');
    const cameraNode = new cc.Node('Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(0, 0, 5);
    const camera = cameraNode.addComponent(cc.Camera);
    camera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new cc.Color(16, 24, 37, 255);
    camera.near = 0.01;
    camera.far = 100;
    app.run(scene);
    // A static dataset updates once; rendering continues through the native frame loop.
    const layer = new CocosSparkLayer({ cc, app, camera, sparkOptions: { enableLod: false, autoUpdate: false } });
    const node = new cc.Node('Splats');
    scene.addChild(node);
    const packed = new S.PackedSplats();
    for (let i = 0; i < 360; i++) {
        const angle = i * 0.61803398875 * Math.PI * 2;
        const y = 1 - (2 * i) / 359;
        const radius = Math.sqrt(1 - y * y);
        packed.pushSplat(
            new M.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius),
            new M.Vector3(0.065, 0.065, 0.065),
            new M.Quaternion(),
            0.9,
            new M.Color((y + 1) / 2, 0.65, (Math.cos(angle) + 1) / 2),
        );
    }
    const mesh = layer.add({ node, packedSplats: packed });
    await mesh.initialized;
    layer.sync();
    await layer.spark.update({ scene: layer.scene, camera: layer.camera });
    for (let frame = 0; frame < 900 && (layer.spark.sorting || layer.spark.sortDirty); frame++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    if (layer.spark.sorting || layer.spark.sortDirty) throw new Error('Spark sorting did not settle');
    app.session!.own(() => layer.dispose(), 'spark-layer');
    status.textContent = '360 个 Gaussian Splats · 独立 Spark 模块 · 复用主引擎设备';
    (window as unknown as { __sparkExample: unknown }).__sparkExample = {
        layer,
        app,
        sharedDevice: layer.renderer.device === cc.director.root!.device,
        count: 360,
    };
} catch (error) {
    status.textContent = `加载失败：${String(error)}。请先运行 npm run build:spark。`;
    throw error;
}
