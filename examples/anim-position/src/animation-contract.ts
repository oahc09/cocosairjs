import { Animation, AnimationClip, Node, Scene, SpriteFrame, animation } from 'cocosair';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until(test: () => boolean): Promise<void> {
    const end = performance.now() + 5000;
    while (!test()) {
        if (performance.now() > end) throw new Error('Animation did not reach the expected state');
        await sleep(20);
    }
}

const animationLifecycle = { onLoad: 0, start: 0, onEnable: 0, onDisable: 0, onDestroy: 0 };
class ProbeAnimation extends Animation {
    override onLoad(): void {
        super.onLoad();
        animationLifecycle.onLoad++;
    }
    override start(): void {
        super.start();
        animationLifecycle.start++;
    }
    override onEnable(): void {
        super.onEnable();
        animationLifecycle.onEnable++;
    }
    override onDisable(): void {
        super.onDisable();
        animationLifecycle.onDisable++;
    }
    override onDestroy(): void {
        super.onDestroy();
        animationLifecycle.onDestroy++;
    }
}

export async function verifyAnimationContract(scene: Scene): Promise<{
    label: string;
    hold: () => Array<{ name: string; ref: object }>;
    release: () => void;
    reacquire: () => Promise<Array<{ name: string; ref: object }>>;
}> {
    const probe = { ready: false, ok: false, checks: [] as { name: string; ok: boolean; detail: string }[] };
    (window as any).__trialProbe = probe;
    const check = (name: string, ok: boolean, detail = '') => {
        probe.checks.push({ name, ok, detail });
        if (!ok) throw new Error(`${name}: ${detail}`);
    };
    const makeClip = () => {
        const ownedClip = new AnimationClip();
        ownedClip.name = 'air-motion';
        ownedClip.duration = 1.2;
        ownedClip.wrapMode = AnimationClip.WrapMode.Loop;
        const ownedTrack = new animation.VectorTrack();
        ownedTrack.componentsCount = 3;
        ownedTrack.path = new animation.TrackPath().toProperty('position');
        ownedTrack.channels()[0].curve.assignSorted([
            [0, 0],
            [0.6, 2],
            [1.2, 0],
        ]);
        ownedTrack.channels()[1].curve.assignSorted([
            [0, 0],
            [1.2, 0],
        ]);
        ownedTrack.channels()[2].curve.assignSorted([
            [0, 0],
            [1.2, 0],
        ]);
        // VectorTrack.range() currently inspects all four channel curves even
        // when only three components are evaluated.
        ownedTrack.channels()[3].curve.assignSorted([
            [0, 0],
            [1.2, 0],
        ]);
        ownedClip.addTrack(ownedTrack);
        return { clip: ownedClip, track: ownedTrack };
    };
    let clip: AnimationClip;
    let node: Node;
    let anim: Animation;
    let state: ReturnType<Animation['addClip']>;
    try {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        check('clip-constructor-shape', typeof AnimationClip.prototype.constructor === 'function');
        const owned = makeClip();
        clip = owned.clip;
        const track = owned.track;
        clip.sample = 30;
        clip.speed = 1;
        clip.onLoaded();
        check('clip-metadata', clip.sample === 30 && clip.speed === 1 && clip.wrapMode === AnimationClip.WrapMode.Loop);
        check('clip-additive-default', clip.isAdditive_experimental === false);

        const frameA = new SpriteFrame();
        const frameB = new SpriteFrame();
        const spriteClip = AnimationClip.createWithSpriteFrames([frameA, frameB], 10);
        check(
            'clip-sprite-frames',
            spriteClip.sample === 10 && spriteClip.duration === 0.2 && spriteClip.tracksCount === 1,
        );
        spriteClip.destroy();
        frameA.destroy();
        frameB.destroy();

        const auxiliary = clip.addAuxiliaryCurve_experimental('blend-weight');
        auxiliary.assignSorted([
            [0, 0],
            [1.2, 1],
        ]);
        check(
            'clip-auxiliary-curve-readback',
            clip.auxiliaryCurveCount_experimental === 1 &&
                clip.getAuxiliaryCurveNames_experimental()[0] === 'blend-weight' &&
                clip.hasAuxiliaryCurve_experimental('blend-weight') &&
                clip.getAuxiliaryCurve_experimental('blend-weight').evaluate(0.6) > 0,
        );
        clip.renameAuxiliaryCurve_experimental('blend-weight', 'weight');
        check('clip-auxiliary-curve-rename', clip.hasAuxiliaryCurve_experimental('weight'));
        clip.removeAuxiliaryCurve_experimental('weight');
        check('clip-auxiliary-curve-remove', clip.auxiliaryCurveCount_experimental === 0);
        check('clip-add-get-track', clip.tracksCount === 1 && clip.getTrack(0) === track);
        check('clip-tracks', [...clip.tracks].length === 1);
        const range = clip.range();
        check(
            'clip-range',
            Math.abs(range.min) < 1e-5 && Math.abs(range.max - 1.2) < 1e-5,
            `${range.min},${range.max}`,
        );
        check('clip-hash', Number.isFinite(clip.hash));
        check('clip-events', clip.events.length === 0);
        check('clip-no-events', !clip.hasEvents());

        const scratchClip = new AnimationClip();
        scratchClip.addTrack(new animation.VectorTrack());
        scratchClip.removeTrack(0);
        check('clip-remove-track', scratchClip.tracksCount === 0);
        scratchClip.addTrack(new animation.VectorTrack());
        scratchClip.clearTracks();
        check('clip-clear-tracks', scratchClip.tracksCount === 0);
        check('clip-destroy', scratchClip.destroy() === true);

        node = new Node('AnimationApiProbe');
        scene.addChild(node);
        anim = node.addComponent(ProbeAnimation);
        anim.defaultClip = clip;
        anim.playOnLoad = false;
        check('animation-play-on-load', anim.playOnLoad === false);
        anim.enabled = false;
        check('animation-on-disable', animationLifecycle.onDisable > 0);
        anim.enabled = true;
        check('animation-on-enable', animationLifecycle.onEnable > 1);
        state = anim.addClip(clip, 'probe');
        check('add-get-state', state === anim.getState('probe') && anim.clips.includes(clip));
        const temporary = anim.createState(clip, 'temporary');
        check('create-state', !!temporary && anim.getState('temporary') === temporary);
        anim.removeState('temporary');
        check('remove-state', !anim.getState('temporary'));

        let playEvents = 0;
        let onceEvents = 0;
        const onPlay = () => {
            playEvents++;
        };
        anim.on(Animation.EventType.PLAY, onPlay);
        anim.once(Animation.EventType.PLAY, () => {
            onceEvents++;
        });
        anim.play('probe');
        await until(() => node.position.x > 0.1);
        check(
            'animation-load-start-hooks',
            animationLifecycle.onLoad === 1 && animationLifecycle.start === 1,
            JSON.stringify(animationLifecycle),
        );
        check(
            'play-and-events',
            state.isPlaying && playEvents >= 1 && onceEvents === 1,
            `x=${node.position.x} events=${playEvents}/${onceEvents}`,
        );
        anim.pause();
        const pausedX = node.position.x;
        await sleep(120);
        check('pause', state.isPaused && Math.abs(node.position.x - pausedX) < 1e-5);
        anim.resume();
        await until(() => Math.abs(node.position.x - pausedX) > 0.02);
        check('resume', !state.isPaused);
        anim.crossFade('probe', 0.1);
        check('cross-fade', state.isPlaying);
        anim.off(Animation.EventType.PLAY, onPlay);
        anim.stop();
        check('stop', !state.isPlaying && onceEvents === 1);
        anim.removeClip(clip, true);
        check('remove-clip', !anim.clips.includes(clip));
        probe.ok = true;
    } catch (error) {
        probe.checks.push({ name: 'unexpected-error', ok: false, detail: String(error) });
    } finally {
        probe.ready = true;
    }
    if (!probe.ok) throw new Error('Animation behavior assertions failed');
    return {
        label: 'anim-position-runtime-clip',
        hold: () => [
            { name: 'animation-node', ref: node },
            { name: 'animation-clip', ref: clip },
        ],
        release: async () => {
            anim.stop();
            anim.removeClip(clip, true);
            node.destroy();
            await until(() => animationLifecycle.onDestroy > 0);
            check('animation-on-destroy', animationLifecycle.onDestroy > 0, JSON.stringify(animationLifecycle));
            clip.destroy();
        },
        reacquire: async () => {
            const rebuilt = makeClip();
            clip = rebuilt.clip;
            node = new Node('AnimationApiProbe');
            scene.addChild(node);
            anim = node.addComponent(ProbeAnimation);
            anim.defaultClip = clip;
            state = anim.addClip(clip, 'probe');
            anim.play('probe');
            return [
                { name: 'animation-node', ref: node },
                { name: 'animation-clip', ref: clip },
            ];
        },
    };
}
