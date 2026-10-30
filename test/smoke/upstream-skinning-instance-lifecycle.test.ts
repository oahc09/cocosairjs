import { readFileSync } from 'fs';
import { join } from 'path';
import { TextDecoder, TextEncoder } from 'util';
import {
    Animation,
    AnimationClip,
    animation,
    createAirApp,
    director,
    game,
    gfx,
    GLTFAsset,
    GLTFLoader,
    instantiate,
    Mat4,
    Material,
    Mesh,
    MeshRenderer,
    Node,
    Scene,
    Skeleton,
    SkinnedMeshRenderer,
    utils,
} from '../../src';
import { engineCycles } from '../fixtures/upstream-lifecycle/engine-cycles';
import { containment, JOINTS, Point, POSITIONS, skinnedVertices, WEIGHTS } from '../fixtures/upstream-skinning/oracle';
import { MaterialInstance } from '../../src/cocos/render-scene/core/material-instance';

Object.assign(globalThis, { TextDecoder, TextEncoder });
const fixtureText = readFileSync(join(__dirname, '../fixtures/upstream-skinning/rig.gltf'), 'utf8');
const skinOf = (root: Node) => root.getComponentsInChildren(SkinnedMeshRenderer)[0];
const gltfJoints = (root: Node) => [
    root.getChildByPath('Ancestor__0/RootBone__1')!,
    root.getChildByPath('Ancestor__0/RootBone__1/TipBone__2')!,
];
const tuple = (value: { x: number; y: number; z: number }): Point => [value.x, value.y, value.z];
function boundCheck(renderer: SkinnedMeshRenderer, joints: Node[], weight = 0) {
    renderer.model!.updateTransform(director.getTotalFrames());
    const bounds = renderer.model!.worldBounds!;
    return containment(
        { center: tuple(bounds.center), halfExtents: tuple(bounds.halfExtents) },
        skinnedVertices(joints, weight),
    );
}

describe('U05: independent native and glTF instance / ownership CPU contracts', () => {
    let app: Awaited<ReturnType<typeof createAirApp>>;
    let scene: Scene;
    const owned = new Set<{ destroy(): unknown }>();
    let restoreImage: () => void;
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
        game.pause();
        // Only PNG decoding is stubbed: loader, ImageAsset, Texture2D, references and destruction are real.
        // This is CPU ownership evidence, never browser decode / shader / pixel evidence.
        const originalImage = globalThis.Image;
        const originalCreate = URL.createObjectURL;
        const originalRevoke = URL.revokeObjectURL;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (url: string) => {
            if (!/^data:[^,]+;base64,/.test(url)) throw new Error(`Nonlocal fixture request: ${url}`);
            const data = Uint8Array.from(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
            return { ok: true, arrayBuffer: async () => data.buffer } as Response;
        }) as typeof fetch;
        globalThis.Image = function () {
            const image = document.createElement('img');
            image.width = image.height = 1;
            Object.defineProperty(image, 'src', {
                set: () => queueMicrotask(() => image.onload?.(new Event('load'))),
            });
            return image;
        } as any;
        URL.createObjectURL = () => 'blob:upstream-skinning-cpu-image';
        URL.revokeObjectURL = () => {};
        restoreImage = () => {
            globalThis.Image = originalImage;
            URL.createObjectURL = originalCreate;
            URL.revokeObjectURL = originalRevoke;
            globalThis.fetch = originalFetch;
        };
    });
    beforeEach(() => {
        scene = new Scene('U05 CPU fixture');
        app.run(scene);
        game.pause();
    });
    afterEach(async () => {
        for (const resource of owned) resource.destroy();
        owned.clear();
        await app.releaseScene!();
        await engineCycles();
    });
    afterAll(() => {
        restoreImage();
        game.pause();
        app.diagnostics?.destroy();
    });
    async function load(): Promise<GLTFAsset> {
        const asset = await new GLTFLoader().parseAsync(fixtureText);
        owned.add(asset);
        return asset;
    }

    test('three glTF instances share mesh / texture / clip but isolate transforms, state times and morph weights', async () => {
        const asset = await load();
        const beforeBytes = asset.meshes[0].data.slice();
        const sourceDocument = JSON.stringify(asset.document);
        const instances = [asset.instantiate(), asset.instantiate(), asset.instantiate()];
        const parents = instances.map((instance, index) => {
            const parent = new Node(`Parent ${index}`);
            parent.setScale(
                ...([
                    [1, 1, 1],
                    [2, 0.5, 1.5],
                    [-1.5, 2, 0.75],
                ][index] as Point),
            );
            parent.setRotationFromEuler(0, 0, index * 17);
            parent.setPosition(index * 4, index, 0);
            parent.addChild(instance.root);
            scene.addChild(parent);
            return parent;
        });
        await engineCycles();
        const skins = instances.map((instance) => skinOf(instance.root));
        const states = instances.map((instance, index) => {
            const controller = instance.root.getComponent(Animation)!;
            controller.play('move');
            const state = controller.getState('move')!;
            state.time = [0.25, 0.75, 1.5][index];
            state.sample();
            controller.pause();
            return state;
        });
        await engineCycles();
        expect(new Set(instances.map((instance) => instance.root)).size).toBe(3);
        expect(new Set(states).size).toBe(3);
        for (let index = 0; index < 3; index++) {
            expect(skins[index].mesh).toBe(asset.meshes[0]);
            expect(skins[index].skeleton).toBe(asset.skeletons[0]);
            expect(instances[index].animations[0]).toBe(instances[0].animations[0]);
            expect(skins[index].getSharedMaterial(0)!.getProperty('mainTexture')).toBe(asset.textures[0]);
            expect(gltfJoints(instances[index].root)[0].position.x).toBeCloseTo([0.25, 0.75, 1.5][index]);
            expect(skins[index].getWeight(0, 0)).toBeCloseTo([0.125, 0.375, 0.75][index]);
            expect(
                boundCheck(skins[index], gltfJoints(instances[index].root), [0.125, 0.375, 0.75][index]).violations,
            ).toEqual([]);
        }
        const otherSnapshots = instances.slice(1).map((instance, i) => ({
            bone: tuple(gltfJoints(instance.root)[0].position),
            time: states[i + 1].time,
            weight: skins[i + 1].getWeight(0, 0),
            scale: tuple(parents[i + 1].scale),
        }));
        gltfJoints(instances[0].root)[0].setPosition(7, -2, 1);
        parents[0].setScale(-3, 0.25, 2);
        skins[0].setWeight(0.9, 0, 0);
        instances[0].setAnimationLoop(true, 'move');
        await engineCycles();
        instances.slice(1).forEach((instance, i) => {
            expect(tuple(gltfJoints(instance.root)[0].position)).toEqual(otherSnapshots[i].bone);
            expect(states[i + 1].time).toBe(otherSnapshots[i].time);
            expect(skins[i + 1].getWeight(0, 0)).toBe(otherSnapshots[i].weight);
            expect(tuple(parents[i + 1].scale)).toEqual(otherSnapshots[i].scale);
        });
        expect(asset.meshes[0].data).toEqual(beforeBytes);
        expect(JSON.stringify(asset.document)).toBe(sourceDocument);
        expect(asset.animations[0].wrapMode).toBe(AnimationClip.WrapMode.Normal);
        instances.forEach((instance) => instance.dispose());
    });

    test('native instantiate remaps the programmatic skeleton root while retaining shared assets', async () => {
        const source = new Node('NativeSource');
        const bone = new Node('RootBone');
        const tip = new Node('TipBone');
        tip.setPosition(0, 0.5, 0);
        bone.addChild(tip);
        source.addChild(bone);
        const node = new Node('Skin');
        source.addChild(node);
        const skeleton = new Skeleton();
        skeleton.joints = ['RootBone', 'RootBone/TipBone'];
        skeleton.bindposes = [new Mat4(), new Mat4()];
        const mesh = utils.createMesh({
            positions: POSITIONS,
            indices: [0, 1, 2],
            minPos: { x: -1, y: -1, z: 0 },
            maxPos: { x: 1, y: 1, z: 0 },
            customAttributes: [
                { attr: new gfx.Attribute(gfx.AttributeName.ATTR_JOINTS, gfx.Format.RGBA32F), values: JOINTS },
                { attr: new gfx.Attribute(gfx.AttributeName.ATTR_WEIGHTS, gfx.Format.RGBA32F), values: WEIGHTS },
            ],
        });
        const material = new Material();
        material.initialize({ effectName: 'builtin-unlit' });
        const renderer = node.addComponent(SkinnedMeshRenderer);
        renderer.setUseBakedAnimation(false);
        renderer.skinningRoot = source;
        renderer.skeleton = skeleton;
        renderer.mesh = mesh;
        renderer.setSharedMaterial(material, 0);
        const track = new animation.VectorTrack();
        track.componentsCount = 3;
        track.path.toHierarchy('RootBone').toProperty('position');
        for (let axis = 0; axis < 3; axis++) {
            track.channels()[axis].curve.assignSorted([
                [0, { value: 0 }],
                [2, { value: axis === 0 ? 2 : 0 }],
            ]);
        }
        const clip = new AnimationClip();
        clip.name = 'native-move';
        clip.duration = 2;
        clip.addTrack(track);
        source.addComponent(Animation).clips = [clip];
        [source, mesh, skeleton, material, clip].forEach((resource) => owned.add(resource));
        const copies = [instantiate(source), instantiate(source), instantiate(source)];
        copies.forEach((copy, index) => {
            const parent = new Node(`NativeParent ${index}`);
            parent.setScale(
                ...([
                    [1, 1, 1],
                    [2, 0.4, 1],
                    [-2, 1.5, 0.5],
                ][index] as Point),
            );
            parent.setRotationFromEuler(12, -9, index * 23);
            parent.addChild(copy);
            scene.addChild(parent);
        });
        await engineCycles();
        copies.forEach((copy, index) => {
            const controller = copy.getComponent(Animation)!;
            controller.play(clip.name);
            controller.getState(clip.name)!.time = 0.25 + index * 0.5;
            controller.getState(clip.name)!.sample();
            controller.pause();
        });
        await engineCycles();
        copies.forEach((copy, index) => {
            const skin = skinOf(copy);
            expect(skin.skinningRoot).toBe(copy);
            expect(skin.mesh).toBe(mesh);
            expect(skin.skeleton).toBe(skeleton);
            expect(copy.getComponent(Animation)!.clips[0]).toBe(clip);
            expect(copy.getChildByName('RootBone')!.position.x).toBeCloseTo(0.25 + index * 0.5);
            expect(
                boundCheck(skin, [copy.getChildByPath('RootBone')!, copy.getChildByPath('RootBone/TipBone')!])
                    .violations,
            ).toEqual([]);
        });
        copies[0].destroy();
        await engineCycles();
        expect(copies[0].isValid).toBe(false);
        expect(copies.slice(1).every((copy) => copy.isValid && skinOf(copy).model !== null)).toBe(true);
        expect([mesh, skeleton, material, clip].every((resource) => resource.isValid)).toBe(true);
    });

    test.each([0, 1, -1, 2, -3])(
        'glTF CPU skinning bounds contain independent vertices, position morph weight=%s',
        async (weight) => {
            const asset = await load();
            const instances = [asset.instantiate(), asset.instantiate(), asset.instantiate()];
            instances.forEach((instance, index) => {
                const parent = new Node(`Bounds parent ${index}`);
                parent.setScale(
                    ...([
                        [1, 1, 1],
                        [2, 0.5, 1.5],
                        [-1.5, 2, 0.75],
                    ][index] as Point),
                );
                parent.setRotationFromEuler(0, 0, index * 17);
                parent.addChild(instance.root);
                scene.addChild(parent);
                gltfJoints(instance.root)[0].setPosition(index + 0.25, -0.25, 0);
                skinOf(instance.root).setWeight(weight, 0, 0);
            });
            await engineCycles();
            const checks = instances.map((instance) =>
                boundCheck(skinOf(instance.root), gltfJoints(instance.root), weight),
            );
            instances.forEach((instance) => instance.dispose());
            expect(checks.map((check) => check.violations)).toEqual([[], [], []]);
        },
    );

    test('multiple targets / submesh weights and updates never contaminate the shared base bounds cache', async () => {
        const document = JSON.parse(fixtureText);
        document.animations = [];
        document.meshes[0].weights = [0, 0];
        document.meshes[0].primitives.forEach((primitive) => primitive.targets.push({ ...primitive.targets[0] }));
        const asset = await new GLTFLoader().parseAsync(JSON.stringify(document));
        owned.add(asset);
        const instance = asset.instantiate();
        scene.addChild(instance.root);
        const renderer = skinOf(instance.root);
        const mesh = asset.meshes[0];
        const base = mesh.getBoneSpaceBounds(asset.skeletons[0]);
        const before = JSON.stringify(base);
        renderer.setWeights([-3, 1], 0);
        renderer.setWeights([2, -0.5], 1);
        await engineCycles();
        for (const weight of [-2, 1.5])
            expect(boundCheck(renderer, gltfJoints(instance.root), weight).violations).toEqual([]);
        renderer.setWeights([4, -1], 0);
        await engineCycles();
        expect(boundCheck(renderer, gltfJoints(instance.root), 3).violations).toEqual([]);
        expect(mesh.getBoneSpaceBounds(asset.skeletons[0])).toBe(base);
        expect(JSON.stringify(base)).toBe(before);
        for (const weight of [NaN, Infinity, -Infinity]) {
            expect(() =>
                mesh.getBoneSpaceBounds(asset.skeletons[0], [
                    [weight, 0],
                    [0, 0],
                ]),
            ).toThrow('AIR_E_SKINNING_MORPH_WEIGHT');
        }
        expect(mesh.getBoneSpaceBounds(asset.skeletons[0])).toBe(base);
    });

    test('destroying a MeshRenderer releases its owned variant but not an externally owned instance', async () => {
        const material = new Material();
        material.initialize({ effectName: 'builtin-unlit' });
        const external = new MaterialInstance({ parent: material });
        [material, external].forEach((resource) => owned.add(resource));
        const make = () => {
            const node = new Node('Material owner');
            scene.addChild(node);
            const renderer = node.addComponent(MeshRenderer);
            renderer.setSharedMaterial(material, 0);
            return { node, renderer };
        };
        const a = make();
        const b = make();
        const internal = a.renderer.getMaterialInstance(0)!;
        b.renderer.setMaterialInstance(external, 0);
        a.node.destroy();
        b.node.destroy();
        await engineCycles();
        expect(internal.passes).toHaveLength(0);
        expect(internal.isValid).toBe(true); // MaterialInstance intentionally keeps its CCObject flag.
        expect(external.passes.length).toBeGreaterThan(0);
        expect(material.passes.length).toBeGreaterThan(0);
    });

    test.each(['detached', 'inactive', 'loaded'] as const)(
        'destroying a %s MeshRenderer releases duplicated owned passes once and preserves another owner',
        async (mode) => {
            const material = new Material();
            material.initialize({ effectName: 'builtin-unlit' });
            const lenderNode = new Node('Borrowed variant owner');
            scene.addChild(lenderNode);
            const lender = lenderNode.addComponent(MeshRenderer);
            lender.setSharedMaterial(material, 0);
            const external = lender.getMaterialInstance(0)!;
            [material, lenderNode, external].forEach((resource) => owned.add(resource));
            const node = new Node('Material owner under test');
            owned.add(node);
            if (mode !== 'detached') {
                node.active = mode === 'loaded';
                scene.addChild(node);
            }
            const renderer = node.addComponent(MeshRenderer);
            renderer.setSharedMaterial(material, 0);
            const internal = renderer.getMaterialInstance(0)!;
            owned.add(internal); // Cleanup also runs after a failing regression assertion.
            renderer.setMaterialInstance(external, 1);
            renderer.setMaterialInstance(internal, 2);
            expect(node.activeInHierarchy).toBe(mode === 'loaded');
            expect(internal.owner).toBe(renderer);
            expect(external.owner).toBe(lender);
            expect(renderer.getMaterialInstance(0)).toBe(internal);
            expect(renderer.getRenderMaterial(2)).toBe(internal);
            expect(renderer.getRenderMaterial(1)).toBe(external);
            expect(internal.passes.length).toBeGreaterThan(0);
            const destroyPasses = internal.passes.map((pass) => jest.spyOn(pass, 'destroy'));
            const borrowedPasses = external.passes.map((pass) => jest.spyOn(pass, 'destroy'));
            const onDestroy = jest.spyOn(renderer, 'onDestroy');
            node.destroy();
            await engineCycles();
            expect(node.isValid).toBe(false);
            expect(onDestroy).toHaveBeenCalledTimes(mode === 'loaded' ? 1 : 0);
            onDestroy.mockRestore();
            expect(internal.passes).toHaveLength(0);
            for (const destroy of destroyPasses) {
                expect(destroy).toHaveBeenCalledTimes(1);
                destroy.mockRestore();
            }
            for (const destroy of borrowedPasses) {
                expect(destroy).not.toHaveBeenCalled();
                destroy.mockRestore();
            }
            expect(lenderNode.isValid).toBe(true);
            expect(lender.getMaterialInstance(0)).toBe(external);
            expect(external.owner).toBe(lender);
            expect(external.passes.length).toBeGreaterThan(0);
            expect(material.passes.length).toBeGreaterThan(0);
        },
    );

    test('unaligned Uint8Array storage fails with the morph-layout diagnostic before constructing Float32Array', async () => {
        const asset = await load();
        const data = new Uint8Array(asset.meshes[0].data.length + 1);
        data.set(asset.meshes[0].data, 1);
        const mesh = new Mesh();
        owned.add(mesh);
        mesh.reset({ struct: asset.meshes[0].struct, data: data.subarray(1) });
        expect(() => mesh.getBoneSpaceBounds(asset.skeletons[0], [[1], [1]])).toThrow('AIR_E_SKINNING_MORPH_LAYOUT');
    });

    test('records five bounded CPU updateTransform samples without asserting a performance gate', async () => {
        const asset = await load();
        const instance = asset.instantiate();
        scene.addChild(instance.root);
        await engineCycles();
        const renderer = skinOf(instance.root);
        const samples = [0.1, 0.3, 0.5, 0.7, 0.9].map((weight) => {
            renderer.setWeight(weight, 0, 0);
            const start = performance.now();
            renderer.model!.updateTransform(director.getTotalFrames());
            return { weight, milliseconds: performance.now() - start };
        });
        expect(samples.every((sample) => Number.isFinite(sample.milliseconds) && sample.milliseconds >= 0)).toBe(true);
        console.info(
            'U05_CPU_UPDATE_TRANSFORM_SAMPLES',
            JSON.stringify({
                scope: 'CPU observation only; tiny fixture, no threshold, no GPU or complete performance gate',
                verticesPerPrimitive: 3,
                primitives: 2,
                joints: 2,
                targets: 1,
                samples,
            }),
        );
    });

    test('RGB/RGBA packing and position morph are separate from explicitly unsupported COLOR_0 morph', async () => {
        const asset = await load();
        expect(Array.from(asset.meshes[0].readAttribute(0, gfx.AttributeName.ATTR_COLOR)!)).toEqual([
            1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1,
        ]);
        expect(Array.from(asset.meshes[0].readAttribute(1, gfx.AttributeName.ATTR_COLOR)!)).toEqual([
            1, 0, 0, 1, 0, 1, 0, 0.75, 0, 0, 1, 0.5,
        ]);
        expect(asset.meshes[0].struct.morph!.subMeshMorphs.every((sub) => sub!.targets.length === 1)).toBe(true);
        const unsupported = JSON.parse(fixtureText);
        unsupported.meshes[0].primitives[0].targets[0] = { COLOR_0: 6 };
        await expect(new GLTFLoader().parseAsync(JSON.stringify(unsupported))).rejects.toThrow(
            'unsupported morph attribute COLOR_0',
        );
    });

    test('30 complete create/dispose cycles retain two sentinels and return reference/model counts to baseline', async () => {
        const asset = await load();
        const sentinels = [asset.instantiate(), asset.instantiate()];
        sentinels.forEach((instance) => scene.addChild(instance.root));
        await engineCycles();
        const baseline = scene.renderScene!.models.length;
        const resources = [
            ...asset.meshes,
            ...asset.textures,
            ...asset.skeletons,
            ...asset.animations,
            ...asset.materials,
        ];
        const refBaseline = resources.map((resource) => resource.refCount);
        const retainedPassCounts: number[] = [];
        const sentinelStates = sentinels.map((sentinel) => {
            const controller = sentinel.root.getComponent(Animation)!;
            controller.play('move');
            controller.pause();
            return controller.getState('move')!;
        });
        for (let cycle = 0; cycle < 30; cycle++) {
            sentinelStates.forEach((state, index) => {
                state.time = 0.1 * (cycle % 10) + index * 0.2;
                state.sample();
            });
            const instance = asset.instantiate();
            scene.addChild(instance.root);
            await engineCycles();
            expect(asset.refCount).toBe(3);
            expect(scene.renderScene!.models.length).toBe(baseline + 1);
            const skin = skinOf(instance.root);
            const model = skin.model!;
            const variant = skin.getMaterialInstance(0)!;
            expect(variant.passes.length).toBeGreaterThan(0);
            instance.dispose();
            instance.dispose();
            expect(instance.root.isValid).toBe(true); // Deferred, not a synchronous flag mutation.
            await engineCycles();
            expect(instance.root.isValid).toBe(false);
            expect(model.subModels).toHaveLength(0);
            retainedPassCounts.push(variant.passes.length);
            expect(asset.refCount).toBe(2);
            expect(scene.renderScene!.models.length).toBe(baseline);
            expect(resources.map((resource) => resource.refCount)).toEqual(refBaseline);
            expect(resources.every((resource) => resource.isValid)).toBe(true);
            expect(sentinels.every((sentinel) => sentinel.root.isValid && skinOf(sentinel.root).model !== null)).toBe(
                true,
            );
            sentinels.forEach((sentinel, index) => {
                expect(gltfJoints(sentinel.root)[0].position.x).toBeCloseTo(0.1 * (cycle % 10) + index * 0.2);
            });
        }
        expect(asset.destroy()).toBe(true);
        expect(asset.destroy()).toBe(false);
        expect(() => asset.instantiate()).toThrow('asset is destroyed');
        expect(resources.every((resource) => resource.isValid)).toBe(true);
        sentinels[0].dispose();
        await engineCycles();
        expect(asset.refCount).toBe(1);
        expect(resources.every((resource) => resource.isValid)).toBe(true);
        sentinelStates[1].time = 1.25;
        sentinelStates[1].sample();
        await engineCycles();
        expect(gltfJoints(sentinels[1].root)[0].position.x).toBeCloseTo(1.25);
        expect(skinOf(sentinels[1].root).getWeight(0, 0)).toBeCloseTo(0.625);
        // Destroying a scene-owned root also satisfies GLTF ownership, without calling dispose().
        sentinels[1].root.destroy();
        await engineCycles();
        expect(asset.refCount).toBe(0);
        expect(asset.isValid).toBe(false);
        expect(resources.every((resource) => !resource.isValid)).toBe(true);
        expect(scene.renderScene!.models).toHaveLength(0);
        expect(retainedPassCounts).toEqual(Array(30).fill(0));
    });
});
