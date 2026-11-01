// Existing Khronos fixtures loaded through AIR's JavaScript glTF API in either host.
const requireCondition = (condition, message) => {
    if (!condition) throw new Error(message);
};
const values = (value, fields) => fields.map((field) => value[field]);
const vector = (value) => values(value, ['x', 'y', 'z']);
const quaternion = (value) => values(value, ['x', 'y', 'z', 'w']);
const matrix = (value) => Array.from({ length: 16 }, (_, index) => value[`m${String(index).padStart(2, '0')}`]);
const transform = (node) => ({
    position: vector(node.position),
    rotation: quaternion(node.rotation),
    scale: vector(node.scale),
    worldMatrix: matrix(node.worldMatrix),
});
const maximumDifference = (before, after) => Math.max(...before.map((value, index) => Math.abs(value - after[index])));

export async function buildModelScenario(air, { id, scene, camera, cameraNode, assetRootUrl }) {
    requireCondition(id === 'pbr' || id === 'skin', `Unknown model scenario: ${id}`);
    const assetPath = id === 'pbr' ? 'gltf-basic/BoxTextured.glb' : 'gltf-skin/SimpleSkin.gltf';
    const assetUrl = new URL(assetPath, assetRootUrl).href;
    const held = new Map();
    const privateMaterials = new Map();
    const destroyRequested = new Map();
    const unboundObserved = new Set();
    const retain = (resource, name) => {
        if (resource && !held.has(resource)) held.set(resource, name);
    };
    const lightNode = new air.Node('Model directional light');
    scene.addChild(lightNode);
    lightNode.setRotationFromEuler(-35, -30, 0);
    const light = lightNode.addComponent(air.DirectionalLight);
    light.illuminance = 50000;
    retain(lightNode, 'directional-light.node');
    let asset;
    let instance;
    let disposed = false;
    let phase = 'before';
    try {
        asset = await new air.GLTFLoader().loadAsync(assetUrl);
        retain(asset, 'GLTFAsset');
        instance = asset.instantiate();
        scene.addChild(instance.root);
        retain(instance.root, 'GLTFInstance.root');
        for (const key of ['meshes', 'materials', 'textures', 'skeletons', 'animations']) {
            asset[key].forEach((resource, index) => retain(resource, `${key}[${index}]`));
        }
        instance.animations.forEach((clip, index) => retain(clip, `instance.animations[${index}]`));
        const renderers = instance.root.getComponentsInChildren(air.MeshRenderer);
        requireCondition(renderers.length > 0 && asset.meshes.length > 0, 'glTF did not instantiate a mesh renderer');
        const rememberRenderMaterials = () => {
            renderers.forEach((renderer, index) => {
                renderer.sharedMaterials.forEach((shared, slot) => {
                    const material = renderer.getRenderMaterial(slot);
                    retain(material, `renderer[${index}].material[${slot}]`);
                    if (material && material !== shared) {
                        requireCondition(
                            material.parent === shared && material.owner === renderer,
                            'Renderer private material does not expose the MaterialInstance ownership contract',
                        );
                        privateMaterials.set(material, { renderer, slot });
                    }
                });
            });
        };
        rememberRenderMaterials();
        cameraNode.setPosition(id === 'pbr' ? new air.Vec3(3, 2, 4) : new air.Vec3(0, 1, 5));
        air.frameObject(camera, instance.root);
        const material = asset.materials[0];
        let animation;
        let clip;
        let skinned;
        if (id === 'pbr') {
            requireCondition(
                material?.effectName === 'air-gltf-standard',
                'Texture fixture must use the glTF PBR effect',
            );
            requireCondition(asset.textures.length > 0, 'Texture fixture did not create a texture');
            const texture = material.getProperty('mainTexture');
            requireCondition(
                asset.textures.includes(texture) && texture.width > 1 && texture.height > 1,
                'PBR material is not bound to its decoded glTF texture',
            );
        } else {
            skinned = instance.root.getComponentInChildren(air.SkinnedMeshRenderer);
            requireCondition(
                skinned?.skeleton && asset.skeletons.length > 0,
                'SimpleSkin did not create a skinned renderer',
            );
            requireCondition(
                skinned.skinningRoot === instance.root,
                'Skinning must use the real glTF instance hierarchy',
            );
            animation = instance.root.getComponent(air.Animation);
            clip = instance.animations[0];
            requireCondition(animation && clip?.duration > 0, 'SimpleSkin did not create a native Animation clip');
            instance.setAnimationLoop(true, clip.name);
            // Animation.onLoad rebuilds states. Start via the public component lifecycle after app.run().
            animation.defaultClip = clip;
            animation.playOnLoad = true;
        }
        const inspect = () => {
            rememberRenderMaterials();
            const observation = {
                id,
                phase,
                asset: {
                    url: assetUrl,
                    meshes: asset.meshes.length,
                    materials: asset.materials.length,
                    textures: asset.textures.length,
                    skeletons: asset.skeletons.length,
                    animations: instance.animations.length,
                    warnings: [...asset.warnings],
                    license: id === 'pbr' ? 'CC-BY-4.0; Cesium logo legal-mark notice' : 'CC0-1.0; Marco Hutter',
                    licensePath: assetPath.replace(/\.(?:glb|gltf)$/, '.LICENSE.md'),
                },
                model: transform(instance.root),
                camera: transform(cameraNode),
                light: { illuminance: light.illuminance, transform: transform(lightNode) },
                meshes: renderers.map((renderer) => ({ name: renderer.mesh.name, uuid: renderer.mesh.uuid })),
            };
            if (id === 'pbr') {
                const texture = material.getProperty('mainTexture');
                observation.pbr = {
                    effect: material.effectName,
                    params: quaternion(material.getProperty('pbrParams')),
                    textureBound: asset.textures.includes(texture),
                    texture: { width: texture.width, height: texture.height, uuid: texture.uuid },
                    source: asset.document.materials[0].pbrMetallicRoughness,
                };
            } else {
                const state = animation.getState(clip.name);
                observation.animation = {
                    clip: clip.name,
                    duration: clip.duration,
                    time: state?.time,
                    playing: state?.isPlaying === true && state?.isPaused === false,
                };
                observation.joints = skinned.skeleton.joints.map((jointPath) => {
                    const joint = skinned.skinningRoot.getChildByPath(jointPath);
                    requireCondition(joint, `Missing real skin joint: ${jointPath}`);
                    return { path: jointPath, ...transform(joint) };
                });
            }
            return observation;
        };
        return {
            initialSteps: 3,
            advanceSteps: 30,
            inspect,
            advance() {
                phase = 'after';
                if (id === 'pbr') {
                    const previous = material.getProperty('pbrParams');
                    material.setProperty('pbrParams', new air.Vec4(previous.x, 0.15, 0.9, previous.w));
                }
            },
            verify(before, after) {
                requireCondition(
                    before.id === id && after.id === id,
                    'Model observations have mismatched scenario IDs',
                );
                requireCondition(before.phase === 'before' && after.phase === 'after', 'Model phase was not advanced');
                for (const key of ['model', 'camera', 'light', 'meshes']) {
                    requireCondition(
                        JSON.stringify(before[key]) === JSON.stringify(after[key]),
                        `${key} changed; model proof must preserve geometry, framing and lighting`,
                    );
                }
                if (id === 'pbr') {
                    requireCondition(
                        before.pbr.effect === 'air-gltf-standard' && after.pbr.effect === before.pbr.effect,
                        'PBR proof changed its real material effect',
                    );
                    requireCondition(
                        before.pbr.textureBound &&
                            after.pbr.textureBound &&
                            before.pbr.texture.uuid === after.pbr.texture.uuid,
                        'PBR proof must keep the same real texture bound',
                    );
                    for (const [actual, expected] of [
                        [before.pbr.params[1], 1],
                        [before.pbr.params[2], 0],
                        [after.pbr.params[1], 0.15],
                        [after.pbr.params[2], 0.9],
                    ]) {
                        requireCondition(
                            Math.abs(actual - expected) < 1e-6,
                            'PBR roughness/metallic did not change as requested',
                        );
                    }
                    requireCondition(
                        before.pbr.params[0] === after.pbr.params[0] && before.pbr.params[3] === after.pbr.params[3],
                        'PBR proof changed a different material parameter',
                    );
                } else {
                    requireCondition(
                        before.animation.playing && after.animation.playing,
                        'Native skeletal Animation was not playing',
                    );
                    const elapsed = after.animation.time - before.animation.time;
                    requireCondition(
                        elapsed > 0.4 && elapsed < 0.7,
                        'Skeletal Animation did not advance through the step clock',
                    );
                    requireCondition(
                        before.joints.length === 2 && after.joints.length === 2,
                        'SimpleSkin joint hierarchy changed',
                    );
                    requireCondition(
                        before.joints.some((joint, index) => {
                            const next = after.joints[index];
                            return (
                                joint.path === next.path &&
                                maximumDifference(joint.rotation, next.rotation) > 0.1 &&
                                maximumDifference(joint.worldMatrix, next.worldMatrix) > 0.1
                            );
                        }),
                        'Real skin joint rotation and world matrix did not change',
                    );
                }
            },
            async dispose() {
                if (disposed) return;
                disposed = true;
                try {
                    rememberRenderMaterials();
                    // The fixture explicitly owns the renderer-created private variants. The public
                    // sharedMaterials setter destroys existing instances before unbinding the slots.
                    for (const renderer of renderers) {
                        const bound = [...privateMaterials].filter(
                            ([material, binding]) =>
                                binding.renderer === renderer && renderer.getRenderMaterial(binding.slot) === material,
                        );
                        renderer.sharedMaterials = [];
                        for (const [material] of bound) destroyRequested.set(material, 'renderer.sharedMaterials=[]');
                        for (const [material, binding] of privateMaterials) {
                            if (
                                binding.renderer === renderer &&
                                renderer.getRenderMaterial(binding.slot) !== material &&
                                !renderer.sharedMaterials.includes(material)
                            ) {
                                unboundObserved.add(material);
                            }
                        }
                    }
                    for (const material of privateMaterials.keys()) {
                        if (!destroyRequested.has(material) || material.passes.length > 0) {
                            requireCondition(material.destroy() === true, 'Private material destroy request failed');
                            destroyRequested.set(material, 'MaterialInstance.destroy()');
                        }
                    }
                } finally {
                    instance.dispose();
                    asset.destroy();
                    lightNode.destroy();
                    await Promise.resolve();
                }
            },
            resources: () =>
                [...held].map(([resource, name]) => {
                    const state = { name, valid: resource.isValid };
                    const binding = privateMaterials.get(resource);
                    if (binding) {
                        Object.assign(state, {
                            contract: 'material-instance-passes',
                            destroyRequested: destroyRequested.has(resource),
                            destroyMethod: destroyRequested.get(resource) || null,
                            passes: resource.passes.length,
                            ownerValid: binding.renderer.isValid,
                            unboundBeforeDispose: unboundObserved.has(resource),
                            bound: binding.renderer.isValid
                                ? binding.renderer.getRenderMaterial(binding.slot) === resource ||
                                  binding.renderer.sharedMaterials.includes(resource)
                                : unboundObserved.has(resource)
                                  ? false
                                  : null,
                        });
                    }
                    return state;
                }),
        };
    } catch (error) {
        instance?.dispose();
        asset?.destroy();
        lightNode.destroy();
        throw error;
    }
}
