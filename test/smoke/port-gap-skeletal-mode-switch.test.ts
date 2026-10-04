import {
    createAirApp,
    Scene,
    Node,
    Material,
    SkinnedMeshRenderer,
    SkeletalAnimation,
    AnimationClip,
    animation,
    game,
    director,
} from '../../src';
import { CCObject } from '../../src/cocos/core/data/object';
import { skinnedTriangle, triangleSkeleton } from '../fixtures/skinning/geometry';

describe('native public skeletal mode preference', () => {
    let app: Awaited<ReturnType<typeof createAirApp>>;
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
        game.pause();
    });
    test.each([true, false])(
        'clip started baked=%s keeps real evaluation after public mode changes',
        async (initialBaked) => {
            const scene = new Scene(),
                root = new Node('Armature'),
                bone = new Node('Bone'),
                node = new Node('Skin');
            root.addChild(bone);
            root.addChild(node);
            scene.addChild(root);
            const anim = root.addComponent(SkeletalAnimation);
            anim.useBakedAnimation = initialBaked;
            const clip = new AnimationClip();
            clip.name = 'Move';
            clip.duration = 1;
            clip.sample = 30;
            const track = new animation.VectorTrack();
            track.componentsCount = 3;
            track.path.toHierarchy('Bone').toProperty('position');
            track.channels()[0].curve.assignSorted([
                [0, { value: 0.5, interpolationMode: 0 }],
                [1, { value: 1.5, interpolationMode: 0 }],
            ]);
            clip.addTrack(track);
            anim.clips = [clip];
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
            try {
                anim.play('Move');
                director.tick(0);
                anim.pause();
                anim.useBakedAnimation = false;
                anim.play('Move');
                director.tick(0);
                const state = anim.getState('Move')!;
                state.time = 0.5;
                state.sample();
                director.tick(0);
                expect(bone.position.x).toBeCloseTo(1, 5);
                expect(skin.model!.constructor.name).toBe('SkinningModel');
                anim.pause();
                anim.useBakedAnimation = true;
                anim.play('Move');
                director.tick(0);
                anim.pause();
                anim.useBakedAnimation = false;
                anim.play('Move');
                director.tick(0);
                state.time = 0.75;
                state.sample();
                director.tick(0);
                expect(bone.position.x).toBeCloseTo(1.25, 5);
            } finally {
                await app.releaseScene();
                mesh.destroy();
                skeleton.destroy();
                material.destroy();
                clip.destroy();
                CCObject._deferredDestroy();
            }
        },
    );
});
