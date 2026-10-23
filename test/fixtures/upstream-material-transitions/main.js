import * as cc from 'cocosair';

// Reference pairs are authored before execution. No production numeric helper is the oracle.
const app = await cc.createAirApp({ canvas: '#GameCanvas', pixelRatioCap: 2 });
const scene = new cc.Scene('upstream-material-transitions');
scene.globals.ambient.skyIllum = 9000;
scene.globals.ambient.skyColor = new cc.Vec4(0.45, 0.5, 0.65, 1);
const cameraNode = new cc.Node('reference-camera');
scene.addChild(cameraNode);
cameraNode.setPosition(0, 0, 5);
cameraNode.lookAt(new cc.Vec3());
const camera = cameraNode.addComponent(cc.Camera);
camera.projection = cc.Camera.ProjectionType.ORTHO;
camera.orthoHeight = 1.6;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new cc.Color(11, 17, 29, 255);
const lightNode = new cc.Node('reference-light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-35, -28, 0);
lightNode.addComponent(cc.DirectionalLight).illuminance = 65000;
const target = cc.createAirRenderTarget({
    width: 96,
    height: 96,
    colorFormat: 'rgba8',
    depthFormat: 'depth24-stencil8',
    samples: 1,
});
target.attachCamera(camera);
const sphere = cc.utils.createMesh(cc.primitives.sphere(1, { segments: 32 }));
const object = new cc.Node('material-reference');
scene.addChild(object);
const renderer = object.addComponent(cc.MeshRenderer);
renderer.mesh = sphere;
const assets = [],
    owned = [sphere],
    extraNodes = [];
let capture = null,
    crystal = null;
app.session.own(() => {
    if (capture?.isValid) capture.enabled = false;
    crystal?.destroy();
    for (const asset of assets) asset.destroy();
    target.dispose();
    for (const asset of owned) asset.destroy();
}, 'material-transition-assets');
app.run(scene);
const clock = cc.createStepClock({ stepTimeoutMs: 10000 });
clock.begin();
const gl = app.canvas.getContext('webgl2');
if (!gl) throw Error('WEBGL2_REQUIRED');
const baseURL = new URL('/examples/material-inspection-showroom/assets/', location.href).href;
const documentTemplate = await fetch(new URL('inspection-rig.gltf', baseURL)).then((r) => {
    if (!r.ok) throw Error('asset HTTP ' + r.status);
    return r.json();
});
const referenceIds = new WeakMap();
let referenceSequence = 0;
const referenceId = (value) => {
    if (!referenceIds.has(value)) referenceIds.set(value, `cocos-reference-${++referenceSequence}`);
    return referenceIds.get(value);
};
const rows = [],
    checks = [];
const frame = async () => {
    await clock.step(0);
    await clock.step(0);
};
const pixels = () => Array.from(target.readColor());
const vector = (value) => value && [value.x, value.y, value.z, value.w];
const note = (name, pass, details) => checks.push({ name, pass: !!pass, details });
async function materialDocument(document) {
    const asset = await new cc.GLTFLoader().parseAsync(JSON.stringify(document), baseURL);
    assets.push(asset);
    return asset;
}
function state(material) {
    return {
        albedo: vector(material.getProperty('albedo')),
        uv0: vector(material.getProperty('airAlbedoUV0')),
        uv1: vector(material.getProperty('airAlbedoUV1')),
        iridescence: vector(material.getProperty('airIridescence')),
    };
}
async function mutations() {
    // The native texture-transform decoder constructs the fresh state; these hand-derived
    // affine rows construct the mutation independently, so shared renderer state is not the oracle.
    for (const textured of [false, true])
        for (const ior of [1, 1.2, 1.3, 2.33334, 2.5]) {
            const original = structuredClone(documentTemplate);
            if (textured)
                Object.assign(original.materials[0].extensions.KHR_materials_iridescence, {
                    iridescenceTexture: { index: 0 },
                    iridescenceThicknessTexture: { index: 0 },
                });
            const before = await materialDocument(original);
            renderer.setSharedMaterial(before.materials[0], 0);
            const instance = renderer.getMaterialInstance(0);
            const sharedStateBefore = state(before.materials[0]);
            await frame();
            const initialPixels = pixels();
            const final = structuredClone(original),
                description = final.materials[0];
            description.pbrMetallicRoughness.baseColorFactor = [0.22, 0.68, 0.38, 1];
            const angle = 0.37,
                sx = 1.7,
                sy = 0.8,
                u = 0.13,
                v = -0.21;
            description.pbrMetallicRoughness.baseColorTexture.extensions.KHR_texture_transform = {
                offset: [u, v],
                scale: [sx, sy],
                rotation: angle,
            };
            Object.assign(description.extensions.KHR_materials_iridescence, {
                iridescenceFactor: 0.95,
                iridescenceIor: ior,
                iridescenceThicknessMinimum: 80,
                iridescenceThicknessMaximum: 670,
            });
            instance.setProperty('albedo', new cc.Vec4(0.22, 0.68, 0.38, 1));
            instance.setProperty('airAlbedoUV0', new cc.Vec4(Math.cos(angle) * sx, Math.sin(angle) * sy, u, 0));
            instance.setProperty('airAlbedoUV1', new cc.Vec4(-Math.sin(angle) * sx, Math.cos(angle) * sy, v, 0));
            instance.setProperty('airIridescence', new cc.Vec4(0.95, ior, 80, 670));
            await frame();
            const mutatedPixels = pixels(),
                mutatedState = state(instance);
            const rebuilt = await materialDocument(final);
            renderer.setSharedMaterial(rebuilt.materials[0], 0);
            const freshInstance = renderer.getMaterialInstance(0);
            await frame();
            rows.push({
                id: `${textured ? 'RG-textured' : 'constant'}/${ior}`,
                ior,
                textured,
                initialPixels,
                mutatedPixels,
                freshPixels: pixels(),
                mutatedState,
                freshState: state(freshInstance),
                finalDocumentMaterial: description,
                pairedRaw: {
                    ownedMaterialId: referenceId(instance),
                    sharedMaterialId: referenceId(before.materials[0]),
                    sharedStateBefore,
                    sharedStateAfter: state(before.materials[0]),
                    uvPoints: [
                        [0, 0],
                        [1, 0],
                        [0, 1],
                        [0.25, 0.75],
                    ].map(([x, y]) => [
                        mutatedState.uv0[0] * x + mutatedState.uv0[1] * y + mutatedState.uv0[2],
                        mutatedState.uv1[0] * x + mutatedState.uv1[1] * y + mutatedState.uv1[2],
                    ]),
                    transformConvention: 'positive mathematical T*R*S',
                    transform: { offset: [u, v], scale: [sx, sy], rotation: -angle },
                },
            });
        }
}
async function textureSemantics() {
    const pairs = [];
    const texture = structuredClone(documentTemplate);
    texture.images.push({
        uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNwONDwHwAFRAKAbmPx4gAAAABJRU5ErkJggg==',
    });
    texture.textures.push({ source: texture.images.length - 1 });
    const index = texture.textures.length - 1;
    Object.assign(texture.materials[0].extensions.KHR_materials_iridescence, {
        iridescenceFactor: 0.8,
        iridescenceIor: 1.3,
        iridescenceThicknessMinimum: 80,
        iridescenceThicknessMaximum: 670,
        iridescenceTexture: { index },
        iridescenceThicknessTexture: { index },
    });
    const constant = structuredClone(documentTemplate);
    Object.assign(constant.materials[0].extensions.KHR_materials_iridescence, {
        iridescenceFactor: (0.8 * 64) / 255,
        iridescenceIor: 1.3,
        iridescenceThicknessMinimum: 0,
        iridescenceThicknessMaximum: 80 + ((670 - 80) * 192) / 255,
    });
    async function render(document) {
        const asset = await materialDocument(document);
        renderer.setSharedMaterial(asset.materials[0], 0);
        await frame();
        return pixels();
    }
    pairs.push({
        id: 'linear-red-factor-green-thickness',
        leftPixels: await render(texture),
        rightPixels: await render(constant),
        oracle: { rgba: [64, 192, 128, 255], factor: (0.8 * 64) / 255, thickness: 80 + (590 * 192) / 255 },
    });
    const minimum = structuredClone(constant);
    minimum.materials[0].extensions.KHR_materials_iridescence.iridescenceThicknessMinimum = 200;
    pairs.push({
        id: 'missing-texture-uses-maximum',
        leftPixels: await render(constant),
        rightPixels: await render(minimum),
    });
    const material = renderer.getMaterialInstance(0);
    material.setProperty('airTransmission', new cc.Vec4(0, 1.5, 0, 0));
    await frame();
    const noVolume = pixels();
    material.setProperty('airTransmission', new cc.Vec4(0, 1.5, 100, 0));
    await frame();
    pairs.push({ id: 'film-independent-of-volume-thickness', leftPixels: noVolume, rightPixels: pixels() });
    return pairs;
}
function makeCapture(name) {
    const node = new cc.Node(name);
    scene.addChild(node);
    extraNodes.push(node);
    const result = node.addComponent(cc.AirTransmissionCapture);
    result.mainCamera = camera;
    return result;
}
async function transmission() {
    object.active = false;
    // Stripe backdrop makes scene-color sampling and accidental blank output observable.
    for (let i = 0; i < 8; i++) {
        const node = new cc.Node('stripe-' + i);
        scene.addChild(node);
        extraNodes.push(node);
        node.setPosition(-1.4 + i * 0.4, 0, -1.5);
        node.setScale(0.38, 3.2, 0.05);
        const r = node.addComponent(cc.MeshRenderer),
            mesh = cc.utils.createMesh(cc.primitives.box());
        owned.push(mesh);
        r.mesh = mesh;
        const material = new cc.Material();
        material.initialize({ effectName: 'builtin-unlit' });
        material.setProperty('mainColor', i % 2 ? new cc.Color(230, 75, 30, 255) : new cc.Color(25, 150, 220, 255));
        owned.push(material);
        r.setSharedMaterial(material, 0);
    }
    capture = makeCapture('first-capture');
    const glassAsset = await new cc.GLTFLoader().loadAsync(new URL('crystal.gltf', baseURL).href);
    assets.push(glassAsset);
    // Establish the genuine disabled state before a renderer is ever adopted.
    capture.enabled = false;
    crystal = glassAsset.instantiate();
    crystal.root.setScale(0.7, 0.7, 0.7);
    scene.addChild(crystal.root);
    const renderers = crystal.root.getComponentsInChildren(cc.MeshRenderer);
    if (!renderers.length) throw Error('missing crystal renderer');
    for (const r of renderers) {
        r.getMaterialInstance(0).setProperty('cc_sceneColorTex', assets[0].textures[0]);
        r.getMaterialInstance(0).setProperty('airSceneColorInfo', new cc.Vec4(16, 16, 1 / 16, 1 / 16));
    }
    const originalVisibility = camera.visibility;
    const original = renderers.map((r) => ({
        r,
        layer: r.node.layer,
        material: r.getMaterialInstance(0),
        texture: r.getMaterialInstance(0).getProperty('cc_sceneColorTex'),
        info: vector(r.getMaterialInstance(0).getProperty('airSceneColorInfo')),
    }));
    await frame();
    const baselinePixels = pixels();
    const bindingState = () =>
        original.map((row) => ({
            layerRestored: row.r.node.layer === row.layer,
            textureRestored: row.material.getProperty('cc_sceneColorTex') === row.texture,
            infoRestored:
                JSON.stringify(vector(row.material.getProperty('airSceneColorInfo'))) === JSON.stringify(row.info),
        }));
    capture.enabled = true;
    await frame();
    const activePixels = pixels();
    note(
        'capture-live-texture',
        original.every((row) => row.material.getProperty('cc_sceneColorTex') === capture.sceneColor),
        { renderers: original.length },
    );
    // Exercise the exact native rejection boundary without allowing a component's
    // lifecycle dispatcher to swallow an expected exception as an unrelated page error.
    const rejectedNode = new cc.Node('rejected-capture');
    rejectedNode.active = false;
    scene.addChild(rejectedNode);
    extraNodes.push(rejectedNode);
    const rejected = rejectedNode.addComponent(cc.AirTransmissionCapture);
    rejected.mainCamera = camera;
    let rejection = null;
    try {
        rejected.onEnable();
    } catch (error) {
        rejection = String(error.message);
    }
    note('second-capture-rejected', /only one capture/.test(rejection || ''), { rejection });
    rejectedNode.destroy();
    capture.enabled = false;
    await frame();
    const disabledPixels = pixels(),
        disabledBindings = bindingState();
    note(
        'disable-restores-bindings',
        camera.visibility === originalVisibility && disabledBindings.every((row) => Object.values(row).every(Boolean)),
        disabledBindings,
    );
    capture.enabled = true;
    await frame();
    const reenabledPixels = pixels(),
        oldTexture = capture.sceneColor;
    capture.node.destroy();
    await frame();
    const destroyedPixels = pixels(),
        destroyedBindings = bindingState();
    note(
        'destroy-restores-bindings',
        camera.visibility === originalVisibility &&
            destroyedBindings.every((row) => Object.values(row).every(Boolean)) &&
            !oldTexture.isValid,
        destroyedBindings,
    );
    capture = makeCapture('replacement-capture');
    await frame();
    const recreatedPixels = pixels();
    return {
        baselinePixels,
        activePixels,
        disabledPixels,
        reenabledPixels,
        destroyedPixels,
        recreatedPixels,
        disabledBindings,
        destroyedBindings,
        rejection,
    };
}
window.__upstreamMaterialTransitions = {
    ready: true,
    async run() {
        await mutations();
        const semantics = await textureSemantics();
        const restoration = await transmission();
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        return {
            schema: 'upstream-material-transitions/1',
            status: 'OBSERVED_NOT_VALIDATED',
            width: 96,
            height: 96,
            samples: 1,
            roi: 'full RGBA8 target; no post-hoc edge exclusion',
            toleranceBytes: 2,
            renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
            version: gl.getParameter(gl.VERSION),
            rows,
            semantics,
            checks,
            restoration,
            glError: gl.getError(),
        };
    },
    async present() {
        camera.targetTexture = null;
        await frame();
    },
    async close() {
        clock.end();
        const released = await app.releaseScene();
        const closed = await app.close();
        return { released, closed };
    },
};
