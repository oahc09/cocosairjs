import { MeshRenderer, Node, Tween, TweenSystem, tween, isValid } from 'cocosair';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until(test: () => boolean, describe: () => string = () => ''): Promise<void> {
    const end = performance.now() + 5000;
    while (!test()) {
        if (performance.now() > end) throw new Error(`Tween did not reach the expected state: ${describe()}`);
        await sleep(20);
    }
}

export async function verifyTweenControl(parentNode: Node): Promise<void> {
    // Let the first game tick settle before timing short tween segments; the
    // startup frame may carry a large delta and finish a tween in one step.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const probe = { ready: false, ok: false, checks: [] as { name: string; ok: boolean; detail: string }[] };
    (window as any).__trialProbe = probe;
    const check = (name: string, ok: boolean, detail = '') => {
        probe.checks.push({ name, ok, detail });
        if (!ok) throw new Error(`${name}: ${detail}`);
    };
    const near = (a: number, b: number) => Math.abs(a - b) < 0.0001;
    const constructorTarget = { x: 0 };
    const directTween = new Tween(constructorTarget);
    check('Tween-direct-constructor', directTween.getTarget() === constructorTarget);
    directTween.stop();
    const tweenSystem = new TweenSystem();
    tweenSystem.update(0);
    check(
        'TweenSystem-surface',
        TweenSystem.ID === 'TWEEN' && TweenSystem.instance instanceof TweenSystem && !!tweenSystem.ActionManager,
    );
    const model = { x: 0, y: 0 };
    let finished = false;
    const control = tween(model)
        .bindNodeState(false)
        .tag(7401)
        .to(4, { x: 6 })
        .call(() => {
            finished = true;
        });
    check('target-identity', control.getTarget() === model);
    control.timeScale(2);
    check('time-scale-readback', control.getTimeScale() === 2);
    control.start();
    await until(
        () => model.x > 0 && model.x < 6,
        () => `initial x=${model.x} finished=${finished}`,
    );
    control.pause();
    const frozen = model.x;
    await sleep(160);
    check('pause-freezes', model.x === frozen && !finished, String(model.x));
    control.resume();
    await until(() => finished);
    check('resume-reaches-end', near(model.x, 6));
    const stopped = tween(model).by(2, { x: 20 }).start();
    await until(() => model.x > 6);
    stopped.stop();
    const stopValue = model.x;
    await sleep(120);
    check('stop-freezes', model.x === stopValue);

    let done = false;
    const sequence = tween(model)
        .set({ x: 0, y: 0 })
        .sequence(tween(model).by(0.2, { x: 2 }), tween(model).by(0.2, { x: 3 }))
        .parallel(tween(model).to(0.2, { x: 9 }), tween(model).to(0.2, { y: 4 }))
        .call(() => {
            done = true;
        })
        .start();
    await until(() => done);
    check('sequence-and-parallel-endpoints', near(model.x, 9) && near(model.y, 4));
    sequence.stop();

    const other = { x: 0, y: 0 };
    const template = tween(model).by(0.2, { x: 1 }).by(0.2, { y: 2 }).union().repeat(3);
    done = false;
    template
        .clone(other)
        .call(() => {
            done = true;
        })
        .start();
    await until(() => done);
    check('clone-union-repeat', near(other.x, 3) && near(other.y, 6), JSON.stringify(other));
    check('clone-does-not-change-original', near(model.x, 9) && near(model.y, 4));

    done = false;
    tween(other)
        .by(0.2, { x: 2 })
        .id(71)
        .reverse(71)
        .call(() => {
            done = true;
        })
        .start();
    await until(() => done);
    check('reverse-by-id-restores', near(other.x, 3));
    done = false;
    tween(other)
        .by(0.2, { x: 2 })
        .reverseTime()
        .call(() => {
            done = true;
        })
        .start();
    await until(() => done);
    check('reverse-time-restores-start', near(other.x, 3), 'x=' + other.x);

    const tagged = { x: 0 };
    const independent = { x: 0 };
    const taggedTween = tween(tagged).tag(7402).to(1, { x: 10 }).start();
    const independentTween = tween(independent).tag(7403).to(1, { x: 10 }).start();
    await until(() => tagged.x > 0 && independent.x > 0);
    Tween.stopAllByTag(7402);
    const taggedBefore = tagged.x;
    const independentBefore = independent.x;
    await sleep(150);
    check('tag-selective-stop', tagged.x === taggedBefore && independent.x > independentBefore);
    taggedTween.stop();
    independentTween.stop();

    const looping = tween(other).by(0.2, { y: 1 }).repeatForever().start();
    await until(() => other.y >= 9);
    Tween.stopAll();
    const stoppedLoop = other.y;
    await sleep(120);
    check('stop-all-stops-repeat-forever', other.y === stoppedLoop);
    looping.stop();

    const parent = new Node('TweenScratch');
    const detached = new Node('Detached');
    parent.addChild(detached);
    done = false;
    tween(detached)
        .bindNodeState(false)
        .removeSelf()
        .call(() => {
            done = true;
        })
        .start();
    await until(() => done);
    check('remove-self-detaches', detached.parent === null && isValid(detached));
    tween(detached).bindNodeState(false).destroySelf().start();
    await until(() => !isValid(detached));
    check('destroy-self-invalidates', !isValid(detached));
    parent.destroy();

    const chainedTarget = { x: 0 };
    let chainedDone = false;
    const chained = tween(chainedTarget)
        .by(0.2, { x: 2 })
        .then(tween(chainedTarget).by(0.2, { x: 3 }))
        .call(() => {
            chainedDone = true;
        })
        .start();
    check('running-readback', chained.running);
    check('duration-readback', chained.duration >= 0.4, String(chained.duration));
    check('running-count', Tween.getRunningCount(chainedTarget) >= 1);
    await until(() => chainedDone);
    check('then-and-call', near(chainedTarget.x, 5));

    const managed = { x: 0 };
    tween(managed).to(4, { x: 10 }).start();
    await until(() => managed.x > 0 && managed.x < 10);
    Tween.pauseAllByTarget(managed);
    const held = managed.x;
    await sleep(120);
    check('pause-all-by-target', managed.x === held);
    Tween.resumeAllByTarget(managed);
    await until(() => managed.x > held);
    Tween.stopAllByTarget(managed);
    const stoppedManaged = managed.x;
    await sleep(120);
    check('stop-all-by-target', managed.x === stoppedManaged);

    const rebound = { x: 0 };
    check('target-rebind', tween({ x: -1 }).target(rebound).getTarget() === rebound);

    const custom = { x: 0 };
    let customDone = false;
    let updates = 0;
    tween(custom)
        .update(0.2, (target, ratio) => {
            updates++;
            target.x = ratio;
        })
        .call(() => {
            customDone = true;
        })
        .start();
    await until(() => customDone);
    check('custom-update', updates > 0 && near(custom.x, 1), `${updates} updates x=${custom.x}`);

    let untilCalls = 0;
    let untilDone = false;
    tween(custom)
        .updateUntil(() => ++untilCalls >= 3)
        .call(() => {
            untilDone = true;
        })
        .start();
    await until(() => untilDone);
    check('custom-update-until', untilCalls >= 3, String(untilCalls));

    const visibilityRenderer = parentNode.getComponent(MeshRenderer);
    check('renderer-available', !!visibilityRenderer);
    tween(parentNode).bindNodeState(false).hide().start();
    await until(() => visibilityRenderer!.enabled === false);
    check('hide', visibilityRenderer!.enabled === false);
    tween(parentNode).bindNodeState(false).show().start();
    await until(() => visibilityRenderer!.enabled === true);
    check('show', visibilityRenderer!.enabled === true);

    probe.ok = true;
    probe.ready = true;
}
