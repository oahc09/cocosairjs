/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * DRAFT / NOT_RUN. Pure neutral protocol controls, not physics or Web/NODEJS qualification.
 */
// Isolate the pure protocol from engine constructors. These mocked brands do NOT
// qualify real constructor provenance; component-activity-source.test.ts owns that check.
const mockSchedulerBrands = new WeakSet<object>();
const mockTimerBrands = new WeakSet<object>();
jest.mock('../../../src/cocos/scene-graph/component-scheduler', () => ({
    isOriginalComponentActivityScheduler: (value: object) => mockSchedulerBrands.has(value),
}));
jest.mock('../../../src/cocos/core/scheduler', () => ({
    isOriginalComponentActivityTimerScheduler: (value: object) => mockTimerBrands.has(value),
}));
// setup-engine has already imported the real neutral module. Require a fresh
// module registry here so these local brands affect only this bookkeeping suite.
let activityControl!: typeof import('../../../src/cocos/scene-graph/component-activity-control');
jest.isolateModules(() => {
    activityControl = jest.requireActual('../../../src/cocos/scene-graph/component-activity-control');
});
const {
    installComponentActivitySource,
    installComponentActivityNodeSource,
    readComponentActivityNodeActive,
    installComponentActivityDelegateSource,
    installComponentActivitySchedulerSource,
    installComponentActivityTimerSource,
    readComponentActivityTimerState,
    registerComponentActivityObserver,
    trySetComponentEnabled,
    tryDelegateComponentActivity,
    runComponentActivityScheduler,
} = activityControl;
import type {
    ActivityFailureReport,
    ActivityPlan,
    ActivityTimerState,
} from '../../../src/cocos/scene-graph/component-activity-control';

function thrown(action: () => unknown): unknown {
    let didThrow = false,
        value: unknown;
    try {
        action();
    } catch (error) {
        didThrow = true;
        value = error;
    }
    expect(didThrow).toBe(true);
    return value;
}
function fixture() {
    const component = {},
        node = {},
        scheduler = {},
        timers = {},
        owner = {},
        log: string[] = [];
    mockSchedulerBrands.add(scheduler);
    mockTimerBrands.add(timers);
    const containers = Object.freeze(Array.from({ length: 6 }, () => Object.freeze({})));
    const timerIdentity = Object.freeze({});
    let cache = true,
        active = true,
        scheduled = true,
        timerPaused = false,
        fence = false;
    let callback: (() => void) | undefined, completion: (() => void) | undefined;
    let onRead: (() => void) | undefined,
        onAssert: (() => void) | undefined,
        actualScheduler: object = scheduler;
    const reports: ActivityFailureReport[] = [];
    class ActualAdapter {
        readonly #secret = Object.freeze({});
        constructor() {
            installComponentActivityDelegateSource(this, this.#secret);
        }
        disable(): void {
            tryDelegateComponentActivity(component, this, this.#secret, false);
        }
        enable(): void {
            tryDelegateComponentActivity(component, this, this.#secret, true);
        }
    }
    const adapter = new ActualAdapter();
    installComponentActivityNodeSource(node, () => active);
    installComponentActivityTimerSource(timers, (target): ActivityTimerState => {
        expect(target).toBe(component);
        return Object.freeze({
            containerIdentities: containers,
            timerIdentity,
            timerPaused,
            updateIdentity: null,
            updateEntryIdentity: null,
            updatePaused: null,
        });
    });
    const capture = () => Object.freeze({ paused: readComponentActivityTimerState(timers, component).timerPaused });
    installComponentActivitySchedulerSource(scheduler, {
        readTimerScheduler: () => timers,
        capture,
        verify: (_component, enabled, before) => {
            const previous = before as ReturnType<typeof capture>;
            expect(capture().paused).toBe(enabled === null ? previous.paused : !enabled);
        },
        run: (_component, enabled, _before, invoke) => {
            if (scheduled === enabled) return;
            invoke(
                () => {
                    log.push('callback');
                    expect(fence).toBe(true);
                    if (callback) callback();
                    else if (enabled) adapter.enable();
                    else adapter.disable();
                },
                () => {
                    log.push('scheduler');
                    expect(fence).toBe(true);
                    if (completion) completion();
                    else {
                        scheduled = enabled;
                        timerPaused = !enabled;
                    }
                },
            );
        },
    });
    installComponentActivitySource(
        component,
        () => {
            onRead?.();
            return { enabled: cache, active: readComponentActivityNodeActive(node), scheduled };
        },
        () => {
            log.push('guard');
            expect(fence).toBe(false);
            onAssert?.();
        },
        (next) => {
            log.push('perform');
            expect(fence).toBe(true);
            if (cache !== next) {
                cache = next;
                if (active) runComponentActivityScheduler(component, actualScheduler, next);
            }
        },
        () => actualScheduler,
    );
    const basePlan = (): ActivityPlan => ({
        prepare: () => {
            log.push('prepare');
        },
        apply: () => {
            log.push('apply');
        },
        delegate: () => {
            log.push('delegate');
        },
        complete: () => {
            log.push('complete');
            expect(fence).toBe(true);
        },
        fail: (report) => {
            reports.push(report);
        },
        dispose: () => {
            log.push('dispose');
            fence = false;
        },
    });
    const observe = (patch: Partial<ActivityPlan> = {}) =>
        registerComponentActivityObserver(component, owner, {
            delegateIdentity: adapter,
            admit: () => {
                log.push('admit');
                expect(fence).toBe(false);
            },
            open: () => {
                log.push('open');
                fence = true;
                return { ...basePlan(), ...patch };
            },
        });
    return {
        component,
        node,
        scheduler,
        timers,
        adapter,
        log,
        reports,
        observe,
        basePlan,
        state: () => ({ cache, active, scheduled, timerPaused, fence }),
        set: (value: unknown) => trySetComponentEnabled(component, value),
        callback: (value: () => void) => {
            callback = value;
        },
        completion: (value: () => void) => {
            completion = value;
        },
        source: (value: () => void) => {
            onRead = value;
        },
        guard: (value: () => void) => {
            onAssert = value;
        },
        inactive: () => {
            active = false;
            scheduled = false;
            timerPaused = true;
        },
        pendingEnable: () => {
            scheduled = false;
            timerPaused = true;
        },
        substituteScheduler: (value: object) => {
            actualScheduler = value;
        },
        spoofFlag: () => {
            scheduled = false;
        },
        spoofCache: () => {
            cache = false;
        },
        spoofTimer: () => {
            timerPaused = true;
        },
    };
}

test('unobserved source and supplied values remain unread and legacy path is returned', () => {
    const f = fixture();
    f.source(() => {
        throw new Error('must not read');
    });
    expect(
        f.set({
            get valueOf() {
                throw new Error('must not coerce');
            },
        }),
    ).toBe(false);
    expect(f.log).toEqual([]);
});
test('guard precedes fences; actual delegate and scheduler precede completion and disposal', () => {
    const f = fixture(),
        lease = f.observe();
    expect(f.set(false)).toBe(true);
    expect(f.log).toEqual([
        'admit',
        'guard',
        'open',
        'prepare',
        'apply',
        'perform',
        'callback',
        'delegate',
        'scheduler',
        'complete',
        'dispose',
    ]);
    expect(f.state()).toEqual({ cache: false, active: true, scheduled: false, timerPaused: true, fence: false });
    lease.dispose();
});
test('recoverable apply refusal is before original cache and scheduler, with actual unchanged snapshot', () => {
    const f = fixture(),
        refusal = new Error('known-not-mutated protocol refusal');
    const lease = f.observe({
        apply: () => {
            throw refusal;
        },
    });
    expect(thrown(() => f.set(false))).toBe(refusal);
    expect(f.state()).toEqual({ cache: true, active: true, scheduled: true, timerPaused: false, fence: false });
    expect(f.reports[0].cacheWriteEntered).toBe(false);
    expect(f.reports[0].actualReadStatus).toBe('read');
    expect(f.reports[0].schedulerUnchanged).toBe(true);
    lease.dispose();
});
test.each([undefined, null, false, 0, ''])('falsey original throw %p survives secondary cleanup error', (first) => {
    const f = fixture(),
        lease = f.observe({
            apply: () => {
                throw first;
            },
            dispose: () => {
                throw new Error('cleanup');
            },
        });
    expect(thrown(() => f.set(false))).toBe(first);
    expect(f.reports[0].error).toBe(first);
    lease.dispose();
});
test.each(['same', 'foreign', 'source'])('caught %s reentry poisons the original operation', (mode) => {
    const f = fixture(),
        lease = f.observe();
    const nested = () => {
        try {
            trySetComponentEnabled(mode === 'foreign' ? {} : f.component, true);
        } catch {}
    };
    if (mode === 'source') f.source(nested);
    else f.callback(nested);
    thrown(() => f.set(false));
    expect(f.log).not.toContain('complete');
    lease.dispose();
});
test('same-value admission has no callback or scheduler side effect', () => {
    const f = fixture(),
        lease = f.observe();
    f.set(true);
    expect(f.log).not.toContain('callback');
    expect(f.log).not.toContain('scheduler');
    expect(f.state().cache).toBe(true);
    lease.dispose();
});
test('inactive cache change has no fake delegation or scheduler completion', () => {
    const f = fixture();
    f.inactive();
    const lease = f.observe();
    f.set(false);
    expect(f.state().cache).toBe(false);
    expect(f.log).not.toContain('callback');
    lease.dispose();
});
test('real component plus public adapter cannot counterfeit the constructor secret', () => {
    const f = fixture(),
        lease = f.observe();
    f.callback(() => {
        tryDelegateComponentActivity(f.component, f.adapter, f.adapter, false);
    });
    thrown(() => f.set(false));
    expect(f.log).not.toContain('delegate');
    expect(f.log).not.toContain('complete');
    lease.dispose();
});
test('constructor delegate source cannot be replaced even when the rejection is caught', () => {
    const f = fixture(),
        lease = f.observe();
    f.callback(() => {
        try {
            installComponentActivityDelegateSource(f.adapter, {});
        } catch {}
        f.adapter.disable();
    });
    thrown(() => f.set(false));
    expect(f.log).not.toContain('complete');
    lease.dispose();
});
test.each(['missing', 'duplicate', 'throw-after'])('actual callback %s delegation fails closed', (mode) => {
    const f = fixture(),
        first = new Error('callback tail'),
        lease = f.observe();
    f.callback(() => {
        if (mode !== 'missing') f.adapter.disable();
        if (mode === 'duplicate') f.adapter.disable();
        if (mode === 'throw-after') throw first;
    });
    const result = thrown(() => f.set(false));
    if (mode === 'throw-after') expect(result).toBe(first);
    expect(f.log).not.toContain('complete');
    lease.dispose();
});
test('a flag-only completion cannot hide the still-running actual target timer', () => {
    const f = fixture(),
        lease = f.observe();
    f.completion(() => f.spoofFlag());
    thrown(() => f.set(false));
    expect(f.state().timerPaused).toBe(false);
    expect(f.log).not.toContain('complete');
    lease.dispose();
});
test('substituted scheduler cannot borrow a component ticket', () => {
    const f = fixture(),
        lease = f.observe({ apply: () => f.substituteScheduler({}) });
    thrown(() => f.set(false));
    expect(f.log).not.toContain('perform');
    lease.dispose();
});
test('caught scheduler entry from a callback cannot authorize a second completion', () => {
    const f = fixture(),
        lease = f.observe();
    f.callback(() => {
        try {
            runComponentActivityScheduler(f.component, f.scheduler, false);
        } catch {}
        f.adapter.disable();
    });
    thrown(() => f.set(false));
    expect(f.log).not.toContain('complete');
    lease.dispose();
});
test('foreign guard refusal happens before owner scope and before source getters', () => {
    const f = fixture(),
        first = new Error('other covering guard'),
        lease = f.observe();
    f.guard(() => {
        throw first;
    });
    f.source(() => {
        throw new Error('too late');
    });
    expect(thrown(() => f.set(false))).toBe(first);
    expect(f.log).toEqual(['admit', 'guard']);
    lease.dispose();
});
test('all observer prepare calls precede any apply; failed preparation cleans every opened plan', () => {
    const f = fixture(),
        first = new Error('second prepare'),
        one = f.observe();
    const two = registerComponentActivityObserver(
        f.component,
        {},
        {
            admit: () => {
                f.log.push('admit-2');
            },
            open: () => ({
                ...f.basePlan(),
                prepare: () => {
                    f.log.push('prepare-2');
                    throw first;
                },
                dispose: () => {
                    f.log.push('dispose-2');
                },
            }),
        },
    );
    expect(thrown(() => f.set(false))).toBe(first);
    expect(f.log).not.toContain('apply');
    expect(f.log).toContain('dispose');
    expect(f.log).toContain('dispose-2');
    one.dispose();
    two.dispose();
});
test('disposed generation cannot unregister its replacement; retained callback cannot outlive ticket', () => {
    const f = fixture(),
        old = f.observe();
    old.dispose();
    const current = f.observe();
    old.dispose();
    expect(f.set(false)).toBe(true);
    current.dispose();
    expect(f.set(true)).toBe(false);
    expect(tryDelegateComponentActivity(f.component, f.adapter, {}, false)).toBe(false);
    thrown(() => runComponentActivityScheduler(f.component, f.scheduler, false));
});
test('duplicate owner registration rejects before replacing existing observer', () => {
    const f = fixture(),
        lease = f.observe();
    thrown(() => f.observe());
    f.set(false);
    expect(f.log).toContain('complete');
    lease.dispose();
});
test('timer source does not permit reads without the exact active component ticket', () => {
    const f = fixture();
    thrown(() => readComponentActivityTimerState(f.timers, f.component));
});

test.each(['cache', 'flag', 'timer'])(
    'first refusal preserves error but detects validly-typed %s bypass facts',
    (kind) => {
        const f = fixture(),
            first = new Error('original not-mutated refusal');
        const lease = f.observe({
            apply: () => {
                if (kind === 'cache') f.spoofCache();
                else if (kind === 'flag') f.spoofFlag();
                else f.spoofTimer();
                throw first;
            },
        });
        expect(thrown(() => f.set(false))).toBe(first);
        expect(f.reports[0].actualReadStatus).toBe('read');
        if (kind === 'timer') expect(f.reports[0].schedulerUnchanged).toBe(false);
        else expect(f.reports[0].actual?.[kind === 'cache' ? 'enabled' : 'scheduled']).toBe(false);
        expect(f.reports[0].cacheWriteEntered).toBe(false);
        lease.dispose();
    },
);

test('active initialized pre-onEnable state permits cache-only disable', () => {
    const f = fixture();
    f.pendingEnable();
    const lease = f.observe();
    expect(f.set(false)).toBe(true);
    expect(f.log).not.toContain('callback');
    expect(f.state().cache).toBe(false);
    expect(f.state().scheduled).toBe(false);
    lease.dispose();
});
