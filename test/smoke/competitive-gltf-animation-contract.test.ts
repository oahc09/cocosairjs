import { TextDecoder, TextEncoder } from 'util';
import { createAirApp, GLTFLoader, Animation, AnimationClip, SkinnedMeshRenderer, Vec4, Scene, game } from '../../src';
import { CCObject } from '../../src/cocos/core/data/object';
import { getGlobalAnimationManager } from '../../src/cocos/animation/global-animation-manager';
import { fixture } from '../fixtures/gltf/fixture';

Object.assign(globalThis, { TextDecoder, TextEncoder });

describe('competitive glTF animation contract', () => {
    let runScene: (scene: Scene) => void;
    beforeAll(async () => {
        document.body.innerHTML = '<canvas id="GameCanvas"></canvas>';
        const app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3 });
        runScene = (scene) => {
            app.run(scene);
            game.pause();
        };
    });
    afterEach(async () => {
        CCObject._deferredDestroy();
        await Promise.resolve();
        CCObject._deferredDestroy();
    });

    test('default Normal completes once, loop override is per state and per instance', async () => {
        const asset = await new GLTFLoader().parseAsync(fixture().glb);
        const a = asset.instantiate();
        const b = asset.instantiate();
        const aa = a.root.getComponent(Animation)!;
        const ba = b.root.getComponent(Animation)!;
        expect(asset.animations.every((clip) => clip.wrapMode === AnimationClip.WrapMode.Normal)).toBe(true);
        expect(a.animations[0]).toBe(b.animations[0]);
        a.setAnimationLoop(true, 'move');
        // Activate through the actual native scene lifecycle, which rebuilds Animation's states.
        const scene = new Scene('loop-policy-activation');
        scene.addChild(a.root);
        scene.addChild(b.root);
        runScene(scene);
        const loop = aa.getState('move');
        const normal = ba.getState('move');
        expect(loop.wrapMode).toBe(AnimationClip.WrapMode.Loop);
        expect(aa.getState('cubic').wrapMode).toBe(AnimationClip.WrapMode.Normal);
        expect(normal.wrapMode).toBe(AnimationClip.WrapMode.Normal);
        aa.play('move');
        ba.play('move');
        loop.time = 2.5;
        loop.sample();
        normal.time = 2.5;
        normal.sample();
        getGlobalAnimationManager().update(0);
        expect(a.root.getChildByPath('root__0/bone_name__1')!.position.x).toBeCloseTo(0.5);
        expect(b.root.getChildByPath('root__0/bone_name__1')!.position.x).toBeCloseTo(2);
        expect(a.root.getComponentsInChildren(SkinnedMeshRenderer)[0].getWeight(0, 0)).toBeCloseTo(0.25);
        expect(b.root.getComponentsInChildren(SkinnedMeshRenderer)[0].getWeight(0, 0)).toBeCloseTo(1);
        const finished = jest.fn();
        ba.on(Animation.EventType.FINISHED, finished);
        normal.update(0.01);
        getGlobalAnimationManager().update(0);
        expect(finished).toHaveBeenCalledTimes(1);
        expect(normal.isPlaying).toBe(false);
        expect(loop.isPlaying).toBe(true);
        expect(asset.animations[0].wrapMode).toBe(AnimationClip.WrapMode.Normal);
        a.dispose();
        b.dispose();
        asset.destroy();
    });

    test('native pause/resume/clip switching and private material variants preserve the second instance', async () => {
        const asset = await new GLTFLoader().parseAsync(fixture().glb);
        const a = asset.instantiate();
        const b = asset.instantiate();
        const aa = a.root.getComponent(Animation)!;
        const ba = b.root.getComponent(Animation)!;
        a.setAnimationLoop(true);
        aa.play('move');
        ba.play('move');
        aa.pause();
        expect(aa.getState('move').isPaused).toBe(true);
        expect(ba.getState('move').isPaused).toBe(false);
        aa.resume();
        expect(aa.getState('move').isPaused).toBe(false);
        aa.play('cubic');
        expect(aa.getState('cubic').isPlaying).toBe(true);
        expect(aa.getState('move').isPlaying).toBe(false);
        expect(ba.getState('move').isPlaying).toBe(true);
        const ar = a.root.getComponentsInChildren(SkinnedMeshRenderer)[0];
        const br = b.root.getComponentsInChildren(SkinnedMeshRenderer)[0];
        expect(ar.mesh).toBe(br.mesh);
        const shared = br.getSharedMaterial(0)!;
        const original = shared.getProperty('albedo');
        const variant = ar.getMaterialInstance(0)!;
        variant.setProperty('albedo', new Vec4(0.2, 0.3, 0.4, 1));
        expect(variant).not.toBe(shared);
        expect(br.getSharedMaterial(0)).toBe(shared);
        expect(shared.getProperty('albedo')).toEqual(original);
        a.dispose();
        b.dispose();
        asset.destroy();
    });

    test('invalid names/options and disposed instances are diagnosed without changing shared clips', async () => {
        const asset = await new GLTFLoader().parseAsync(fixture().glb);
        const a = asset.instantiate();
        for (const invoke of [() => a.setAnimationLoop(true, 'missing'), () => a.setAnimationLoop('true' as any)]) {
            expect(invoke).toThrow('AIR_E_GLTF_ANIMATION_OPTIONS');
        }
        expect(a.root.getComponent(Animation)!.getState('move').wrapMode).toBe(AnimationClip.WrapMode.Normal);
        a.setAnimationLoop(true, 'move');
        const state = a.root.getComponent(Animation)!.getState('move');
        state.time = 0.75;
        a.setAnimationLoop(false, 'move');
        expect(state.wrapMode).toBe(AnimationClip.WrapMode.Normal);
        expect(state.time).toBe(0);
        expect(asset.animations[0].wrapMode).toBe(AnimationClip.WrapMode.Normal);
        a.dispose();
        expect(() => a.setAnimationLoop(true)).toThrow('disposed');
        asset.destroy();
    });
});
