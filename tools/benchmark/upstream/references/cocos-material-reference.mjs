/** Protected Cocos public-API material reference. Shares assets, not another engine's output.
 * Independently reconstructed glTF final state is the mutation control, never a generated trial.
 */
export const cocosMaterialCoverage = { AU05: 'prepared-not-executed', AU06: 'prepared-not-executed' };
export async function runCocosMaterialReference(taskId, { cc, canvas, resourceURLs }) {
    if (!['AU05', 'AU06'].includes(taskId)) throw new Error(`Unsupported Cocos material reference: ${taskId}`);
    const required =
        taskId === 'AU06' ? ['inspection-rig', 'checker', 'linear-film-rg'] : ['inspection-rig', 'checker'];
    for (const name of required) if (!resourceURLs[name]) throw new Error(`Missing frozen resource URL: ${name}`);
    const app = await cc.createAirApp({ canvas, pixelRatioCap: 1 });
    const scene = new cc.Scene('protected-paired-material-reference');
    scene.globals.ambient.skyIllum = 9000;
    scene.globals.ambient.skyColor = new cc.Vec4(0.45, 0.5, 0.65, 1);
    const cameraNode = new cc.Node('paired-reference-camera');
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
    const lightNode = new cc.Node('paired-reference-light');
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
    const object = new cc.Node('paired-material');
    scene.addChild(object);
    const renderer = object.addComponent(cc.MeshRenderer);
    renderer.mesh = sphere;
    const assets = [],
        ids = new WeakMap();
    let nextId = 0;
    const identity = (value) => {
        if (!ids.has(value)) ids.set(value, `cocos-material-${++nextId}`);
        return ids.get(value);
    };
    app.run(scene);
    const clock = cc.createStepClock({ stepTimeoutMs: 10000 });
    clock.begin();
    const frame = async () => {
        await clock.step(0);
        await clock.step(0);
    };
    const read = () => Array.from(target.readColor());
    const vec = (v) => v && [v.x, v.y, v.z, v.w];
    const state = (m) => ({
        uv0: vec(m.getProperty('airAlbedoUV0')),
        uv1: vec(m.getProperty('airAlbedoUV1')),
        iridescence: vec(m.getProperty('airIridescence')),
    });
    const response = await fetch(resourceURLs['inspection-rig']);
    if (!response.ok) throw new Error(`Reference glTF HTTP ${response.status}`);
    const template = await response.json();
    // Fixed declared dependency, no relative-path ambiguity or alternate generated checker.
    for (const image of template.images || [])
        if (image.uri && !image.uri.startsWith('data:')) image.uri = resourceURLs.checker;
    const parse = async (document) => {
        const asset = await new cc.GLTFLoader().parseAsync(
            JSON.stringify(document),
            new URL('.', resourceURLs['inspection-rig']).href,
        );
        assets.push(asset);
        return asset;
    };
    const renderDocument = async (document) => {
        const asset = await parse(document);
        renderer.setSharedMaterial(asset.materials[0], 0);
        const material = renderer.getMaterialInstance(0);
        await frame();
        return { asset, material, pixels: read(), state: state(material) };
    };
    const setFilm = (material, values) => {
        const [intensity, ior, minimum, maximum] = values;
        if (
            !values.every(Number.isFinite) ||
            intensity < 0 ||
            intensity > 1 ||
            ior < 1 ||
            minimum < 0 ||
            maximum < minimum
        )
            throw new RangeError('Invalid film factor, IOR or nanometer range');
        material.setProperty('airIridescence', new cc.Vec4(...values));
    };
    const filmDocument = (factor, ior, minimum, maximum, textured = false) => {
        const document = structuredClone(template);
        const extension = document.materials[0].extensions.KHR_materials_iridescence;
        Object.assign(extension, {
            iridescenceFactor: factor,
            iridescenceIor: ior,
            iridescenceThicknessMinimum: minimum,
            iridescenceThicknessMaximum: maximum,
        });
        delete extension.iridescenceTexture;
        delete extension.iridescenceThicknessTexture;
        if (textured) {
            document.images.push({ uri: resourceURLs['linear-film-rg'] });
            document.textures.push({ source: document.images.length - 1 });
            const index = document.textures.length - 1;
            extension.iridescenceTexture = { index };
            extension.iridescenceThicknessTexture = { index };
        }
        return document;
    };
    let cases;
    try {
        if (taskId === 'AU05') {
            const original = await parse(structuredClone(template));
            const shared = original.materials[0],
                unmodifiedBefore = state(shared);
            renderer.setSharedMaterial(shared, 0);
            const material = renderer.getMaterialInstance(0);
            await frame();
            const initialPixels = read();
            const transform = { offset: [0.2, -0.1], scale: [2, 0.5], rotation: 0.7 };
            const c = Math.cos(0.7),
                s = Math.sin(0.7);
            material.setProperty('airAlbedoUV0', new cc.Vec4(2 * c, -0.5 * s, 0.2, 0));
            material.setProperty('airAlbedoUV1', new cc.Vec4(2 * s, 0.5 * c, -0.1, 0));
            await frame();
            const mutatedPixels = read(),
                actual = state(material);
            const points = [
                [0, 0],
                [1, 0],
                [0, 1],
                [0.25, 0.75],
            ].map(([x, y]) => [
                actual.uv0[0] * x + actual.uv0[1] * y + actual.uv0[2],
                actual.uv1[0] * x + actual.uv1[1] * y + actual.uv1[2],
            ]);
            const final = structuredClone(template);
            // Native glTF UV storage convention is opposite the explicitly public mathematical convention.
            final.materials[0].pbrMetallicRoughness.baseColorTexture.extensions.KHR_texture_transform = {
                offset: transform.offset,
                scale: transform.scale,
                rotation: -transform.rotation,
            };
            const fresh = await renderDocument(final);
            cases = [
                {
                    id: 'owned-uv-transform',
                    transform,
                    points,
                    ownedMaterialId: identity(material),
                    sharedMaterialId: identity(shared),
                    unmodifiedBefore,
                    unmodifiedAfter: state(shared),
                    initialPixels,
                    mutatedPixels,
                    freshPixels: fresh.pixels,
                },
            ];
        } else {
            const samples = [];
            for (const textured of [false, true])
                for (const ior of [1, 1.2, 1.3, 2.33334, 2.5]) {
                    const initial = await renderDocument(filmDocument(0.2, 1.3, 100, 400, textured));
                    setFilm(initial.material, [0.95, ior, 80, 670]);
                    await frame();
                    const mutatedPixels = read(),
                        actual = state(initial.material).iridescence;
                    const fresh = await renderDocument(filmDocument(0.95, ior, 80, 670, textured));
                    samples.push({ id: `${textured}/${ior}`, state: actual, mutatedPixels, freshPixels: fresh.pixels });
                }
            const textured = await renderDocument(filmDocument(0.8, 1.3, 80, 670, true));
            const constant = await renderDocument(filmDocument((0.8 * 64) / 255, 1.3, 0, 80 + (590 * 192) / 255));
            const noThickness = await renderDocument(filmDocument(0.8, 1.3, 80, 670));
            const differentMinimum = await renderDocument(filmDocument(0.8, 1.3, 200, 670));
            differentMinimum.material.setProperty('airTransmission', new cc.Vec4(0, 1.5, 0, 0));
            await frame();
            const volumeBefore = state(differentMinimum.material).iridescence,
                volumeBeforePixels = read();
            differentMinimum.material.setProperty('airTransmission', new cc.Vec4(0, 1.5, 100, 0));
            await frame();
            const volumeAfter = state(differentMinimum.material).iridescence,
                volumeAfterPixels = read();
            const attempts = [];
            for (const [id, values] of [
                ['negative-factor', [-1, 1.3, 80, 670]],
                ['factor-over-one', [2, 1.3, 80, 670]],
                ['ior-below-one', [0.95, 0.9, 80, 670]],
                ['negative-thickness', [0.95, 1.3, -1, 670]],
                ['reversed-thickness', [0.95, 1.3, 800, 670]],
                ['nonfinite', [NaN, 1.3, 80, 670]],
            ]) {
                const before = state(differentMinimum.material).iridescence;
                let rejected = false;
                try {
                    setFilm(differentMinimum.material, values);
                } catch (error) {
                    rejected = error instanceof RangeError;
                }
                attempts.push({ id, before, after: state(differentMinimum.material).iridescence, rejected });
            }
            cases = [
                { id: 'film-matrix', samples },
                {
                    id: 'linear-rg',
                    factor: (textured.state.iridescence[0] * 64) / 255,
                    thickness:
                        textured.state.iridescence[2] +
                        ((textured.state.iridescence[3] - textured.state.iridescence[2]) * 192) / 255,
                    derivationScope:
                        'native-material-state-and-frozen-linear-data-texel; semantic evidence is independent physical-image pair',
                    textureColorSpace: 'linear-data',
                    noThicknessTexture: noThickness.state.iridescence[3],
                    texturedPixels: textured.pixels,
                    constantPixels: constant.pixels,
                    noThicknessPixels: noThickness.pixels,
                    noThicknessMinChangedPixels: differentMinimum.pixels,
                    volumeBefore,
                    volumeAfter,
                    volumeBeforePixels,
                    volumeAfterPixels,
                },
                { id: 'invalid-values', attempts },
            ];
        }
        // The collector captures the actual compositor before invoking close, separately from offscreen readback.
        camera.targetTexture = null;
        await frame();
        return {
            schema: 'upstream-agent-observation/1',
            contractId: `upstream-agent-observation/1:${taskId}`,
            taskId,
            engine: 'cocosair',
            status: 'OBSERVED_NOT_VALIDATED',
            cases,
            async close() {
                clock.end();
                for (const asset of assets) asset.destroy();
                target.dispose();
                sphere.destroy();
                return { released: await app.releaseScene(), closed: await app.close() };
            },
        };
    } catch (error) {
        clock.end();
        for (const asset of assets) asset.destroy();
        target.dispose();
        sphere.destroy();
        await app.close();
        throw error;
    }
}
