/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * DRAFT / NOT_RUN. Original Component/Node/scheduler source controls, no native physics.
 * No mocked constructor brands. Synthetic activation state is not a NodeActivator/lifecycle qualification.
 */
import '../../../src/exports/base';
import '../../../src/cocos/game';
import { Component } from '../../../src/cocos/scene-graph/component';
import { Node } from '../../../src/cocos/scene-graph/node';
import {
    ComponentScheduler,
    isOriginalComponentActivityScheduler,
} from '../../../src/cocos/scene-graph/component-scheduler';
import { Scheduler, isOriginalComponentActivityTimerScheduler } from '../../../src/cocos/core/scheduler';
import type { ISchedulable } from '../../../src/cocos/core/scheduler';
import { CCObjectFlags } from '../../../src/cocos/core/data/object';
import { legacyCC } from '../../../src/cocos/core/global-exports';
import {
    installComponentActivitySchedulerSource,
    installComponentActivityTimerSource,
    installComponentActivityDelegateSource,
    registerComponentActivityObserver,
    tryDelegateComponentActivity,
} from '../../../src/cocos/scene-graph/component-activity-control';

const cleanup: Array<() => void> = [];
afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
});
function actualSource() {
    let hook: (() => void) | undefined;
    class SourceComponent extends Component {
        protected onEnable(): void {
            hook?.();
            adapter.run(true);
        }
        protected onDisable(): void {
            hook?.();
            adapter.run(false);
        }
    }
    const component = new SourceComponent(),
        node = new Node('source-control');
    // Fixture-local type view of the same target object. No update method or
    // scheduler behavior is added; only timer queries and cleanup use this view.
    const scheduledTarget = component as unknown as ISchedulable;
    component.node = node;
    (node as unknown as { _activeInHierarchy: boolean })._activeInHierarchy = true;
    class SourceAdapter {
        readonly #secret = Object.freeze({});
        constructor() {
            installComponentActivityDelegateSource(this, this.#secret);
        }
        run(enabled: boolean): void {
            tryDelegateComponentActivity(component, this, this.#secret, enabled);
        }
    }
    const adapter = new SourceAdapter();
    const scheduler = legacyCC.director._compScheduler as ComponentScheduler;
    const timer = legacyCC.director.getScheduler() as Scheduler;
    const previousView = legacyCC.GAME_VIEW;
    legacyCC.GAME_VIEW = true;
    scheduler._onEnabled(component);
    const lease = registerComponentActivityObserver(
        component,
        {},
        {
            delegateIdentity: adapter,
            admit: () => {},
            open: () => ({
                prepare: () => {},
                apply: () => {},
                delegate: () => {},
                complete: () => {},
                fail: () => {},
                dispose: () => {},
            }),
        },
    );
    cleanup.push(() => {
        lease.dispose();
        timer.unscheduleAllForTarget(scheduledTarget);
        scheduler._onDisabled(component);
        legacyCC.GAME_VIEW = previousView;
    });
    return {
        component,
        scheduledTarget,
        scheduler,
        timer,
        hook: (value: () => void) => {
            hook = value;
        },
    };
}
test('unbranded scheduler and timer cannot register caller-provided controls', () => {
    let read = 0;
    const fake = {
        get capture() {
            ++read;
            return () => ({});
        },
        run: () => {},
        verify: () => {},
        readTimerScheduler: () => ({}),
    };
    expect(() => installComponentActivitySchedulerSource({}, fake)).toThrow();
    expect(read).toBe(0);
    expect(() =>
        installComponentActivityTimerSource({}, () => {
            throw new Error('not reached');
        }),
    ).toThrow();
});
test('original instances are branded and their installed source cannot be replaced', () => {
    const scheduler = new ComponentScheduler(),
        timer = new Scheduler();
    expect(isOriginalComponentActivityScheduler(scheduler)).toBe(true);
    expect(isOriginalComponentActivityTimerScheduler(timer)).toBe(true);
    expect(() =>
        installComponentActivitySchedulerSource(scheduler, {
            capture: () => ({}),
            run: () => {},
            verify: () => {},
            readTimerScheduler: () => ({}),
        }),
    ).toThrow();
    expect(() =>
        installComponentActivityTimerSource(timer, () => {
            throw new Error('not reached');
        }),
    ).toThrow();
});
test('fake instance disableComp cannot substitute for original completion', () => {
    const f = actualSource(),
        old = f.scheduler.disableComp;
    f.component.schedule(() => {}, 1);
    let fakeCount = 0;
    f.scheduler.disableComp = (comp) => {
        ++fakeCount;
        comp._objFlags &= ~CCObjectFlags.IsOnEnableCalled;
    };
    cleanup.push(() => {
        f.scheduler.disableComp = old;
    });
    f.component.enabled = false;
    expect(fakeCount).toBe(0);
    expect(f.timer.isTargetPaused(f.scheduledTarget)).toBe(true);
    expect(f.component.enabledInHierarchy).toBe(false);
});
test('onDisable may replace a timer; original completion pauses the new actual entry', () => {
    const f = actualSource(),
        old = () => {},
        replacement = () => {};
    f.component.schedule(old, 1);
    f.hook(() => {
        f.component.unschedule(old);
        f.component.schedule(replacement, 1);
    });
    f.component.enabled = false;
    expect(f.timer.isScheduled(replacement, f.scheduledTarget)).toBe(true);
    expect(f.timer.isTargetPaused(f.scheduledTarget)).toBe(true);
});
test('onEnable may add a timer; original completion resumes all current actual entries', () => {
    const f = actualSource(),
        callback = () => {};
    f.component.enabled = false;
    f.hook(() => f.component.schedule(callback, 1));
    f.component.enabled = true;
    expect(f.timer.isScheduled(callback, f.scheduledTarget)).toBe(true);
    expect(f.timer.isTargetPaused(f.scheduledTarget)).toBe(false);
});
test('initialized but not yet onEnabled component permits cache-only disable', () => {
    const f = actualSource();
    f.scheduler._onDisabled(f.component);
    let called = 0;
    f.hook(() => {
        ++called;
    });
    expect(f.component.enabled).toBe(true);
    f.component.enabled = false;
    expect(called).toBe(0);
    expect(f.component.enabled).toBe(false);
    expect(f.component._objFlags & CCObjectFlags.IsOnEnableCalled).toBe(0);
});
test('a constructor leaked before refused installation cannot retain a usable brand', () => {
    const f = actualSource();
    let leaked: ComponentScheduler | undefined;
    class LeakedScheduler extends ComponentScheduler {
        public unscheduleAll(): void {
            leaked = this;
            super.unscheduleAll();
        }
    }
    f.hook(() => {
        try {
            new LeakedScheduler();
        } catch {}
    });
    expect(() => {
        f.component.enabled = false;
    }).toThrow();
    expect(leaked).toBeDefined();
    expect(isOriginalComponentActivityScheduler(leaked!)).toBe(false);
    expect(() =>
        installComponentActivitySchedulerSource(leaked!, {
            capture: () => ({}),
            run: () => {},
            verify: () => {},
            readTimerScheduler: () => ({}),
        }),
    ).toThrow();
});

test.each(['component', 'timer'])('a genuine new %s scheduler cannot silently rebind an existing owner', (kind) => {
    const f = actualSource();
    f.component.schedule(() => {}, 1);
    const field = kind === 'component' ? '_compScheduler' : '_scheduler';
    const original = legacyCC.director[field];
    legacyCC.director[field] = kind === 'component' ? new ComponentScheduler() : new Scheduler();
    cleanup.push(() => {
        legacyCC.director[field] = original;
    });
    expect(() => {
        f.component.enabled = false;
    }).toThrow();
    expect(f.component.enabled).toBe(true);
    expect(f.timer.isTargetPaused(f.scheduledTarget)).toBe(false);
});
