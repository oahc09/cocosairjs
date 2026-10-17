/* Browser-only native custom pipeline fixture. Uses frozen compiled assets, without shader/runtime wrappers. */
module.exports = async function customPipeline(renderer) {
    const m = await import('/build/cocosair.module.js');
    const effects = await (await fetch('/vendor/builtin-source/generated/custom-effects.json')).json();
    m.settings.overrideSettings('rendering', 'customPipeline', true);
    m.settings.overrideSettings(
        'rendering',
        'effectSettingsPath',
        '/vendor/builtin-source/generated/custom-layout.bin',
    );
    m.macro.CUSTOM_PIPELINE_NAME = 'Custom';
    const register = () => {
        for (const data of effects) {
            const effect = Object.assign(new m.EffectAsset(), data);
            effect.onLoaded();
        }
    };
    m.game.onPreProjectInitDelegate.add(register);
    let app;
    try {
        app = await m.createAirApp({ canvas: '#GameCanvas', renderer });
    } finally {
        m.game.onPreProjectInitDelegate.remove(register);
    }
    window.__airApp = app;
    const scene = new m.Scene('Native custom pipeline');
    const cameraNode = new m.Node('Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(0, 1.7, 5);
    cameraNode.lookAt(m.Vec3.ZERO);
    const camera = cameraNode.addComponent(m.Camera);
    camera.clearColor = new m.Color(0, 0, 0, 255);
    camera.usePostProcess = true;
    const cube = new m.Node('Bright cube');
    scene.addChild(cube);
    cube.setRotationFromEuler(20, 30, 15);
    const mesh = m.utils.createMesh(m.primitives.box());
    const material = new m.Material();
    material.initialize({ effectName: 'builtin-unlit' });
    material.setProperty('mainColor', new m.Color(255, 255, 255, 255));
    const model = cube.addComponent(m.MeshRenderer);
    model.mesh = mesh;
    model.setMaterial(material, 0);
    const ground = new m.Node('AO contact receiver');
    scene.addChild(ground);
    ground.setPosition(0, -0.7, 0);
    const groundMaterial = new m.Material();
    groundMaterial.initialize({ effectName: 'builtin-unlit' });
    groundMaterial.setProperty('mainColor', new m.Color(170, 170, 170, 255));
    const groundModel = ground.addComponent(m.MeshRenderer);
    groundModel.mesh = m.utils.createMesh(m.primitives.box({ width: 4.5, height: 0.1, length: 3 }));
    groundModel.setMaterial(groundMaterial, 0);
    const patch = new m.Node('Color oracle');
    patch.setPosition(-1.4, 0, 0);
    patch.setScale(0.6, 0.6, 0.6);
    scene.addChild(patch);
    const patchMaterial = new m.Material();
    patchMaterial.initialize({ effectName: 'builtin-unlit' });
    patchMaterial.setProperty('mainColor', new m.Color(210, 80, 35, 255));
    const patchModel = patch.addComponent(m.MeshRenderer);
    patchModel.mesh = mesh;
    patchModel.setMaterial(patchMaterial, 0);
    const volume = new m.Node('Post-process');
    scene.addChild(volume);
    volume.addComponent(m.postProcess.PostProcess);
    const bloom = volume.addComponent(m.postProcess.Bloom);
    bloom.threshold = 0.3;
    bloom.intensity = 2;
    bloom.enabled = false;
    // Frozen upstream registers cc.FXAA but does not re-export it from components/index.ts.
    const fxaa = volume.addComponent(m.js.getClassByName('cc.FXAA'));
    fxaa.enabled = false;
    const grading = volume.addComponent(m.postProcess.ColorGrading);
    const lut = new m.Texture2D();
    lut.reset({ width: 512, height: 512, format: m.Texture2D.PixelFormat.RGBA8888 });
    lut.setFilters(m.Texture2D.Filter.LINEAR, m.Texture2D.Filter.LINEAR);
    const pixels = new Uint8Array(512 * 512 * 4);
    for (let y = 0; y < 512; y++)
        for (let x = 0; x < 512; x++) {
            const blue = Math.floor(y / 64) * 8 + Math.floor(x / 64);
            const index = (y * 512 + x) * 4;
            pixels.set(
                [
                    Math.round(((y % 64) * 255) / 63),
                    Math.round((blue * 255) / 63),
                    Math.round(((x % 64) * 255) / 63),
                    255,
                ],
                index,
            );
        }
    lut.uploadData(pixels);
    grading.colorGradingMap = lut;
    grading.contribute = 1;
    grading.enabled = false;
    const taa = volume.addComponent(m.postProcess.TAA);
    taa.enabled = false;
    const hbao = volume.addComponent(m.postProcess.HBAO);
    hbao.radiusScale = 2;
    hbao.aoSaturation = 2;
    hbao.enabled = false;
    const dof = volume.addComponent(m.postProcess.DOF);
    dof.focusDistance = 1;
    dof.focusRange = 1;
    dof.bokehRadius = 4;
    dof.enabled = false;
    const fsr = volume.addComponent(m.postProcess.FSR);
    fsr.enabled = false;
    window.__nativePost = { bloom, fxaa, grading, taa, hbao, dof, fsr, camera, patch, lut };
    app.run(scene);
    return { custom: m.director.root.usesCustomPipeline, effects: effects.map((effect) => effect.name) };
};
