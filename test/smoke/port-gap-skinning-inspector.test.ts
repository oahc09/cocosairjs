import { createAirApp, Scene, Node, Material, SkinnedMeshRenderer, SkeletalAnimation, game, director } from '../../src';
import { CCObject } from '../../src/cocos/core/data/object';
import { skinnedTriangle, triangleSkeleton } from '../fixtures/skinning/geometry';
import { inspectSkinning } from '../../tools/debug/skinning-inspector';

describe('optional native skinning inspection', () => {
    let app: Awaited<ReturnType<typeof createAirApp>>;
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
        game.pause();
    });
    test('not-ready state does not create a model or claim transport', () => {
        const node = new Node(),
            skin = node.addComponent(SkinnedMeshRenderer);
        const result = inspectSkinning(skin);
        expect(result.transport).toBe('NOT_READY');
        expect(result.paletteSlots).toBeNull();
        expect(skin.model).toBeNull();
        node.destroy();
        CCObject._deferredDestroy();
    });
    test('real native binding exposes effective transport, weighted count and reflection without writes', () => {
        const scene = new Scene(),
            root = new Node('Armature'),
            bone = new Node('Bone'),
            node = new Node('Skin');
        root.addChild(bone);
        root.addChild(node);
        scene.addChild(root);
        root.setScale(-2, 1, 1);
        const skin = node.addComponent(SkinnedMeshRenderer),
            mesh = skinnedTriangle(),
            skeleton = triangleSkeleton(),
            material = new Material();
        material.initialize({ effectName: 'builtin-unlit' });
        skin.mesh = mesh;
        skin.skeleton = skeleton;
        skin.skinningRoot = root;
        skin.setSharedMaterial(material, 0);
        app.run(scene);
        game.pause();
        director.tick(0);
        const model = skin.model,
            refs = [mesh.refCount, skeleton.refCount, material.refCount],
            instance = jest.spyOn(skin, 'getMaterialInstance');
        const first = inspectSkinning(skin),
            second = inspectSkinning(skin);
        expect(first).toEqual(second);
        expect(first).toMatchObject({
            requestedMode: 'AUTO_REALTIME',
            effectiveModel: 'SkinningModel',
            skeletonJoints: 2,
            boundWeightedJoints: 1,
            root: 'Armature',
            reflected: true,
            rootWorldDeterminant: -2,
        });
        expect(first.transport).toMatch(/^REALTIME_/);
        expect(first.paletteSlots?.[0]).toBeGreaterThan(0);
        expect(instance).not.toHaveBeenCalled();
        expect([mesh.refCount, skeleton.refCount, material.refCount]).toEqual(refs);
        expect(skin.model).toBe(model);
        expect(Object.isFrozen(first.worldBounds?.center)).toBe(true);
        instance.mockRestore();
        scene.destroy();
        mesh.destroy();
        skeleton.destroy();
        material.destroy();
        CCObject._deferredDestroy();
    });
    test('public animation preference and effective model stay separate observations', () => {
        const scene = new Scene(),
            root = new Node('Armature'),
            node = new Node('Skin');
        root.addChild(new Node('Bone'));
        root.addChild(node);
        scene.addChild(root);
        const animation = root.addComponent(SkeletalAnimation);
        animation.useBakedAnimation = true;
        const skin = node.addComponent(SkinnedMeshRenderer),
            mesh = skinnedTriangle(),
            skeleton = triangleSkeleton(),
            material = new Material();
        material.initialize({ effectName: 'builtin-unlit' });
        skin.mesh = mesh;
        skin.skeleton = skeleton;
        skin.skinningRoot = root;
        skin.setSharedMaterial(material, 0);
        app.run(scene);
        game.pause();
        director.tick(0);
        expect(inspectSkinning(skin)).toMatchObject({
            requestedMode: 'BAKED',
            transport: 'BAKED_TEXTURE',
            boundWeightedJoints: null,
        });
        animation.useBakedAnimation = false;
        director.tick(0);
        expect(inspectSkinning(skin)).toMatchObject({ requestedMode: 'REALTIME', effectiveModel: 'SkinningModel' });
        scene.destroy();
        mesh.destroy();
        skeleton.destroy();
        material.destroy();
        CCObject._deferredDestroy();
    });
});
