/*
 Copyright (c) 2017-2023 Xiamen Yaji Software Co., Ltd.

 http://www.cocos.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 of the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/

import { EDITOR, SUPPORT_JIT, DEV, TEST, NODEJS } from 'internal:constants';
import { CCObjectFlags } from '../core/data/object';
import * as js from '../core/utils/js';
import { tryCatchFunctor_EDITOR } from '../core/utils/misc';
import { legacyCC } from '../core/global-exports';
import { warn, assert } from '../core/platform/debug';
import type { Component } from './component';
import { installComponentActivitySchedulerSource, readComponentActivityNodeActive, readComponentActivityTimerState } from './component-activity-control';

const activitySchedulerInstances = new WeakSet<object>();
/** Read-only original-constructor brand; no registration authority is exported. */
export function isOriginalComponentActivityScheduler (value: object): boolean {
    return activitySchedulerInstances.has(value);
}

const fastRemoveAt = js.array.fastRemoveAt;

const IsStartCalled = CCObjectFlags.IsStartCalled;
const IsOnEnableCalled = CCObjectFlags.IsOnEnableCalled;
const IsEditorOnEnableCalled = CCObjectFlags.IsEditorOnEnableCalled;

const callerFunctor: any = (EDITOR || NODEJS) && tryCatchFunctor_EDITOR;
const callOnEnableInTryCatch: any = (EDITOR || NODEJS) && callerFunctor('onEnable');
const callOnDisableInTryCatch: any = (EDITOR || NODEJS) && callerFunctor('onDisable');

function sortedIndex (array, comp): number {
    const order = comp.constructor._executionOrder;
    const id = comp._id;
    let l = 0;
    for (let h = array.length - 1, m = h >>> 1;
        l <= h;
        m = (l + h) >>> 1
    ) {
        const test = array[m];
        const testOrder = test.constructor._executionOrder;
        if (testOrder > order) {
            h = m - 1;
        } else if (testOrder < order) {
            l = m + 1;
        } else {
            const testId = test._id;
            if (testId > id) {
                h = m - 1;
            } else if (testId < id) {
                l = m + 1;
            } else {
                return m;
            }
        }
    }
    return ~l;
}

// remove disabled and not invoked component from array
function stableRemoveInactive (iterator, flagToClear): void {
    const array = iterator.array;
    let next = iterator.i + 1;
    while (next < array.length) {
        const comp = array[next];
        if (comp.node._activeInHierarchy) {
            ++next;
        } else {
            iterator.removeAt(next);
            if (flagToClear) {
                comp._objFlags &= ~flagToClear;
            }
        }
    }
}

export type InvokeFunc = (...args: unknown[]) => void;

// This class contains some queues used to invoke life-cycle methods by script execution order
const activityInvokerSources = new WeakMap<object, (component: object) => boolean>();

export class LifeCycleInvoker {
    public static stableRemoveInactive = stableRemoveInactive;

    /**
     * @engineInternal `_zero` is a protected property, we provide this public property for engine internal usage.
     */
    public get zero (): js.array.MutableForwardIterator<any> {
        return this._zero;
    }
    /**
     * @engineInternal `_neg` is a protected property, we provide this public property for engine internal usage.
     */
    public get neg (): js.array.MutableForwardIterator<any> {
        return this._neg;
    }
    /**
     * @engineInternal `_pos` is a protected property, we provide this public property for engine internal usage.
     */
    public get pos (): js.array.MutableForwardIterator<any> {
        return this._pos;
    }
    // components which priority === 0 (default)
    protected declare _zero: js.array.MutableForwardIterator<any>;
    // components which priority < 0
    protected declare _neg: js.array.MutableForwardIterator<any>;
    // components which priority > 0
    protected declare _pos: js.array.MutableForwardIterator<any>;
    protected declare _invoke: InvokeFunc;
    constructor (invokeFunc: InvokeFunc) {
        const Iterator = js.array.MutableForwardIterator;
        this._zero = new Iterator([]);
        this._neg = new Iterator([]);
        this._pos = new Iterator([]);

        if (TEST) {
            assert(typeof invokeFunc === 'function', 'invokeFunc must be type function');
        }
        this._invoke = invokeFunc;
        activityInvokerSources.set(this, (component) => this._zero.array.includes(component)
            || this._neg.array.includes(component) || this._pos.array.includes(component));
    }
}

function compareOrder (a, b): number {
    return a.constructor._executionOrder - b.constructor._executionOrder;
}

// for onLoad: sort once all components registered, invoke once
export class OneOffInvoker extends LifeCycleInvoker {
    public add (comp: Component): void {
        const order = (comp.constructor as typeof Component)._executionOrder;
        (order === 0 ? this._zero : (order < 0 ? this._neg : this._pos)).array.push(comp);
    }

    public remove (comp: Component): void {
        const order = (comp.constructor as typeof Component)._executionOrder;
        (order === 0 ? this._zero : (order < 0 ? this._neg : this._pos)).fastRemove(comp);
    }

    public cancelInactive (flagToClear: number): void {
        stableRemoveInactive(this._zero, flagToClear);
        stableRemoveInactive(this._neg, flagToClear);
        stableRemoveInactive(this._pos, flagToClear);
    }

    public invoke (): void {
        const compsNeg = this._neg;
        if (compsNeg.array.length > 0) {
            compsNeg.array.sort(compareOrder);
            this._invoke(compsNeg);
            compsNeg.array.length = 0;
        }

        this._invoke(this._zero);
        this._zero.array.length = 0;

        const compsPos = this._pos;
        if (compsPos.array.length > 0) {
            compsPos.array.sort(compareOrder);
            this._invoke(compsPos);
            compsPos.array.length = 0;
        }
    }
}

// for update: sort every time new component registered, invoke many times
class ReusableInvoker extends LifeCycleInvoker {
    constructor (invokeFunc: InvokeFunc) {
        super(invokeFunc);
    }

    public add (comp: Component): void {
        const order = (comp.constructor as typeof Component)._executionOrder;
        if (order === 0) {
            this._zero.array.push(comp);
        } else {
            const array = order < 0 ? this._neg.array : this._pos.array;
            const i = sortedIndex(array, comp);
            if (i < 0) {
                array.splice(~i, 0, comp);
            } else if (DEV) {
                warn('component already added:', comp.name);
            }
        }
    }

    public remove (comp: Component): void {
        const order = (comp.constructor as typeof Component)._executionOrder;
        if (order === 0) {
            this._zero.fastRemove(comp);
        } else {
            const iterator = order < 0 ? this._neg : this._pos;
            const i = sortedIndex(iterator.array, comp);
            if (i >= 0) {
                iterator.removeAt(i);
            }
        }
    }

    public invoke (dt: number): void {
        if (this._neg.array.length > 0) {
            this._invoke(this._neg, dt);
        }

        this._invoke(this._zero, dt);

        if (this._pos.array.length > 0) {
            this._invoke(this._pos, dt);
        }
    }
}

function enableInEditor (comp): void {
    if (!(comp._objFlags & IsEditorOnEnableCalled)) {
        legacyCC.engine.emit('component-enabled', comp.uuid);
        if (!legacyCC.GAME_VIEW) {
            comp._objFlags |= IsEditorOnEnableCalled;
        }
    }
}

// return function to simply call each component with try catch protection
export function createInvokeImplJit (code: string, useDt?, ensureFlag?): (iterator: any, dt: any) => void {
    // function (it) {
    //     let a = it.array;
    //     for (it.i = 0; it.i < a.length; ++it.i) {
    //         let c = a[it.i];
    //         // ...
    //     }
    // }
    const body = `${'var a=it.array;'
                + 'for(it.i=0;it.i<a.length;++it.i){'
                + 'var c=a[it.i];'}${
        code
    }}`;
    const fastPath = useDt ? Function('it', 'dt', body) : Function('it', body);
    const singleInvoke = Function('c', 'dt', code);
    return createInvokeImpl(singleInvoke, fastPath, ensureFlag);
}
export function createInvokeImpl (singleInvoke, fastPath, ensureFlag?): (iterator: any, dt: any) => void {
    return (iterator, dt: number): void => {
        try {
            fastPath(iterator, dt);
        } catch (e) {
            // slow path
            legacyCC._throw(e);
            const array = iterator.array;
            if (ensureFlag) {
                array[iterator.i]._objFlags |= ensureFlag;
            }
            ++iterator.i;   // invoke next callback
            for (; iterator.i < array.length; ++iterator.i) {
                try {
                    singleInvoke(array[iterator.i], dt);
                } catch (e) {
                    legacyCC._throw(e);
                    if (ensureFlag) {
                        array[iterator.i]._objFlags |= ensureFlag;
                    }
                }
            }
        }
    };
}

const invokeStart = SUPPORT_JIT ? createInvokeImplJit(`c.start();c._objFlags|=${IsStartCalled}`, false, IsStartCalled)
    : createInvokeImpl(
        (c): void => {
            c.start();
            c._objFlags |= IsStartCalled;
        },
        (iterator): void => {
            const array = iterator.array;
            for (iterator.i = 0; iterator.i < array.length; ++iterator.i) {
                const comp = array[iterator.i];
                comp.start();
                comp._objFlags |= IsStartCalled;
            }
        },
        IsStartCalled,
    );

const invokeUpdate = SUPPORT_JIT ? createInvokeImplJit('c.update(dt)', true)
    : createInvokeImpl(
        (c, dt: number): void => {
            c.update(dt);
        },
        (iterator, dt: number): void => {
            const array = iterator.array;
            for (iterator.i = 0; iterator.i < array.length; ++iterator.i) {
                array[iterator.i].update(dt);
            }
        },
    );

const invokeLateUpdate = SUPPORT_JIT ? createInvokeImplJit('c.lateUpdate(dt)', true)
    : createInvokeImpl(
        (c, dt: number): void => {
            c.lateUpdate(dt);
        },
        (iterator, dt: number): void => {
            const array = iterator.array;
            for (iterator.i = 0; iterator.i < array.length; ++iterator.i) {
                array[iterator.i].lateUpdate(dt);
            }
        },
    );

export const invokeOnEnable = EDITOR ? (iterator): void => {
    const compScheduler = legacyCC.director._compScheduler;
    const array = iterator.array;
    for (iterator.i = 0; iterator.i < array.length; ++iterator.i) {
        const comp = array[iterator.i];
        if (comp._enabled) {
            callOnEnableInTryCatch(comp);
            const deactivatedDuringOnEnable = !comp.node._activeInHierarchy;
            if (!deactivatedDuringOnEnable) {
                compScheduler._onEnabled(comp);
            }
        }
    }
} : (iterator): void => {
    const compScheduler = legacyCC.director._compScheduler;
    const array = iterator.array;
    for (iterator.i = 0; iterator.i < array.length; ++iterator.i) {
        const comp = array[iterator.i];
        if (comp._enabled) {
            comp.onEnable();
            const deactivatedDuringOnEnable = !comp.node._activeInHierarchy;
            if (!deactivatedDuringOnEnable) {
                compScheduler._onEnabled(comp);
            }
        }
    }
};

/**
 * @en The Manager for Component's life-cycle methods.
 * It collaborates with [[NodeActivator]] to schedule and invoke life cycle methods for components
 * @zh 组件生命周期函数的调度器。
 * 它和 [[NodeActivator]] 一起调度并执行组件的生命周期函数。
 */
export class ComponentScheduler {
    /**
     * @en The invoker of `start` callback
     * @zh `start` 回调的调度器
     */
    public declare startInvoker: OneOffInvoker;
    /**
     * @en The invoker of `update` callback
     * @zh `update` 回调的调度器
     */
    public declare updateInvoker: ReusableInvoker;
    /**
     * @en The invoker of `lateUpdate` callback
     * @zh `lateUpdate` 回调的调度器
     */
    public declare lateUpdateInvoker: ReusableInvoker;
    // components deferred to schedule
    private _deferredComps: any[] = [];
    private declare _updating: boolean;

    constructor () {
        this.unscheduleAll();
        const contains = (invoker: object, comp: Component): boolean => {
            const read = activityInvokerSources.get(invoker);
            if (!read) throw new Error('Observed lifecycle invoker is not an original instance.');
            return read(comp);
        };
        const read = (identity: object) => {
            const comp = identity as Component;
            // Original Director storage, not a replaceable getScheduler() readback.
            // It is still a mutable TS field; before/after exact identity must agree.
            const timerScheduler = legacyCC.director._scheduler;
            return Object.freeze({
                timerScheduler, timer: readComponentActivityTimerState(timerScheduler, comp),
                start: this.startInvoker, update: this.updateInvoker, late: this.lateUpdateInvoker,
                updating: this._updating, deferred: this._deferredComps.includes(comp),
                hasStart: contains(this.startInvoker, comp), hasUpdate: contains(this.updateInvoker, comp),
                hasLate: contains(this.lateUpdateInvoker, comp),
            });
        };
        type Facts = ReturnType<typeof read>;
        const capture = (identity: object) => Object.freeze({
            initial: read(identity), completion: { current: null as Facts | null },
        });
        type Snapshot = ReturnType<typeof capture>;
        const sameOwner = (before: Facts, after: Facts): void => {
            if (after.timerScheduler !== before.timerScheduler || after.start !== before.start ||
                after.update !== before.update || after.late !== before.late || after.updating !== before.updating ||
                after.timer.containerIdentities.some((entry, index) => entry !== before.timer.containerIdentities[index]))
                throw new Error('Observed scheduler/container ownership changed during callback.');
        };
        const verify = (identity: object, enabled: boolean | null, value: unknown): void => {
            const comp = identity as Component, snapshot = value as Snapshot;
            const before = enabled === null ? snapshot.initial : snapshot.completion.current;
            if (!before) throw new Error('Observed scheduler has no actual callback-completion baseline.');
            const after = read(comp), a = after.timer, b = before.timer;
            sameOwner(snapshot.initial, after);
            if (a.timerIdentity !== b.timerIdentity || a.updateIdentity !== b.updateIdentity ||
                a.updateEntryIdentity !== b.updateEntryIdentity ||
                a.timerPaused !== (enabled === null || b.timerIdentity === null ? b.timerPaused : !enabled) ||
                a.updatePaused !== (enabled === null || b.updateIdentity === null ? b.updatePaused : !enabled))
                throw new Error('Observed scheduler ownership or timer pause state did not match.');
            if (enabled === null) {
                if (after.deferred !== before.deferred || after.hasStart !== before.hasStart ||
                    after.hasUpdate !== before.hasUpdate || after.hasLate !== before.hasLate)
                    throw new Error('Observed invoker membership changed before original completion.');
            } else if (!enabled) {
                if (after.deferred || after.hasStart || after.hasUpdate || after.hasLate)
                    throw new Error('Observed disable did not remove actual invoker membership.');
            } else if (after.updating) {
                if (!after.deferred || after.hasStart !== before.hasStart || after.hasUpdate !== before.hasUpdate ||
                    after.hasLate !== before.hasLate)
                    throw new Error('Observed enable did not defer actual invoker scheduling.');
            } else if (after.deferred || after.hasStart !== (!!comp.internalStart && !(comp._objFlags & IsStartCalled)) ||
                after.hasUpdate !== (typeof comp.internalUpdate === 'function') ||
                after.hasLate !== (typeof comp.internalLateUpdate === 'function')) {
                throw new Error('Observed enable did not establish actual invoker membership.');
            }
        };
        activitySchedulerInstances.add(this);
        try {
            installComponentActivitySchedulerSource(this, Object.freeze({
                readTimerScheduler: (): object => legacyCC.director._scheduler,
                capture,
                verify,
                run: (identity: object, enabled: boolean, before: unknown, invoke: (callback: () => void, complete: () => void) => void): void => {
                    const comp = identity as Component;
                    verify(comp, null, before);
                    if ((EDITOR || NODEJS) && !(legacyCC.GAME_VIEW || (comp.constructor as any)._executeInEditMode))
                        throw new Error('Observed component is outside the active scheduler context.');
                    // Original enableComp/disableComp may legitimately have no callback work.
                    // The ticket's independent expected-callback check still rejects changed flags.
                    if (!!(comp._objFlags & IsOnEnableCalled) === enabled) return;
                    invoke(() => {
                        if (enabled) {
                            if (comp.internalOnEnable) comp.internalOnEnable();
                            if (!readComponentActivityNodeActive(comp.node))
                                throw new Error('Observed component was deactivated during onEnable.');
                        } else if (comp.internalOnDisable) {
                            comp.internalOnDisable();
                        }
                    }, () => {
                        // A real callback may legitimately schedule/unschedule its own timers.
                        // After its secret-bearing delegate, capture all current entries and verify
                        // original completion against those, while retaining original owner/containers.
                        const snapshot = before as Snapshot, current = read(comp);
                        sameOwner(snapshot.initial, current);
                        snapshot.completion.current = current;
                        if (enabled) {
                            activityOnEnabled.call(this, comp);
                            if (EDITOR || NODEJS) enableInEditor(comp);
                        } else {
                            activityOnDisabled.call(this, comp);
                            if ((EDITOR || NODEJS) && (comp._objFlags & IsEditorOnEnableCalled)) {
                                legacyCC.engine.emit('component-disabled', comp.uuid);
                                comp._objFlags &= ~IsEditorOnEnableCalled;
                            }
                        }
                        verify(comp, enabled, before);
                    });
                },
            }));
        } catch (error) {
            activitySchedulerInstances.delete(this);
            throw error;
        }
    }

    /**
     * @en Cancel all future callbacks, including `start`, `update` and `lateUpdate`
     * @zh 取消所有未来的函数调度，包括 `start`，`update` 和 `lateUpdate`
     */
    public unscheduleAll (): void {
        // invokers
        this.startInvoker = new OneOffInvoker(invokeStart);
        this.updateInvoker = new ReusableInvoker(invokeUpdate);
        this.lateUpdateInvoker = new ReusableInvoker(invokeLateUpdate);

        // during a loop
        this._updating = false;
    }

    /**
     * @deprecated since v3.5.0, this is an engine private interface that will be removed in the future.
     */
    public _onEnabled (comp: Component): void {
        legacyCC.director.getScheduler().resumeTarget(comp);
        comp._objFlags |= IsOnEnableCalled;

        // schedule
        if (this._updating) {
            this._deferredComps.push(comp);
        } else {
            this._scheduleImmediate(comp);
        }
    }

    /**
     * @deprecated since v3.5.0, this is an engine private interface that will be removed in the future.
     */
    public _onDisabled (comp: Component): void {
        legacyCC.director.getScheduler().pauseTarget(comp);
        comp._objFlags &= ~IsOnEnableCalled;

        // cancel schedule task
        const index = this._deferredComps.indexOf(comp);
        if (index >= 0) {
            fastRemoveAt(this._deferredComps, index);
            return;
        }

        // unschedule
        if (comp.internalStart && !(comp._objFlags & IsStartCalled)) {
            this.startInvoker.remove(comp);
        }
        if (comp.internalUpdate) {
            this.updateInvoker.remove(comp);
        }
        if (comp.internalLateUpdate) {
            this.lateUpdateInvoker.remove(comp);
        }
    }

    /**
     * @en Enable a component
     * @zh 启用一个组件
     * @param comp The component to be enabled
     * @param invoker The invoker which is responsible to schedule the `onEnable` call
     */
    public enableComp (comp: Component, invoker?: OneOffInvoker): void {
        if (!(comp._objFlags & IsOnEnableCalled)) {
            if (comp.internalOnEnable) {
                if (invoker) {
                    invoker.add(comp);
                    return;
                } else {
                    comp.internalOnEnable();

                    const deactivatedDuringOnEnable = !comp.node.activeInHierarchy;
                    if (deactivatedDuringOnEnable) {
                        return;
                    }
                }
            }
            this._onEnabled(comp);
        }
    }

    /**
     * @en Disable a component
     * @zh 禁用一个组件
     * @param comp The component to be disabled
     */
    public disableComp (comp: Component): void {
        if (comp._objFlags & IsOnEnableCalled) {
            if (comp.internalOnDisable) {
                comp.internalOnDisable();
            }
            this._onDisabled(comp);
        }
    }

    /**
     * @en Process start phase for registered components
     * @zh 为当前注册的组件执行 start 阶段任务
     */
    public startPhase (): void {
        // Start of this frame
        this._updating = true;

        // call start
        this.startInvoker.invoke();
        // Start components of new activated nodes during start
        this._startForNewComps();
        // if (PREVIEW) {
        //     try {
        //         this.startInvoker.invoke();
        //     }
        //     catch (e) {
        //         // prevent start from getting into infinite loop
        //         this.startInvoker._neg.array.length = 0;
        //         this.startInvoker._zero.array.length = 0;
        //         this.startInvoker._pos.array.length = 0;
        //         throw e;
        //     }
        // }
        // else {
        //     this.startInvoker.invoke();
        // }
    }

    /**
     * @en Process update phase for registered components
     * @zh 为当前注册的组件执行 update 阶段任务
     * @param dt @en Time passed after the last frame in seconds @zh 距离上一帧的时间，以秒计算
     */
    public updatePhase (dt: number): void {
        this.updateInvoker.invoke(dt);
    }

    /**
     * @en Process late update phase for registered components
     * @zh 为当前注册的组件执行 late update 阶段任务
     * @param dt @en Time passed after the last frame in seconds @zh 距离上一帧的时间，以秒计算
     */
    public lateUpdatePhase (dt: number): void {
        this.lateUpdateInvoker.invoke(dt);

        // End of this frame
        this._updating = false;

        // Start components of new activated nodes during update and lateUpdate
        // They will be running in the next frame
        this._startForNewComps();
    }

    // Call new registered start schedule immediately since last time start phase calling in this frame
    // See cocos-creator/2d-tasks/issues/256
    private _startForNewComps (): void {
        if (this._deferredComps.length > 0) {
            this._deferredSchedule();
            this.startInvoker.invoke();
        }
    }

    private _scheduleImmediate (comp: Component): void {
        if (typeof comp.internalStart === 'function' && !(comp._objFlags & IsStartCalled)) {
            this.startInvoker.add(comp);
        }
        if (typeof comp.internalUpdate === 'function') {
            this.updateInvoker.add(comp);
        }
        if (typeof comp.internalLateUpdate === 'function') {
            this.lateUpdateInvoker.add(comp);
        }
    }

    private _deferredSchedule (): void {
        const comps = this._deferredComps;
        for (let i = 0, len = comps.length; i < len; i++) {
            this._scheduleImmediate(comps[i]);
        }
        comps.length = 0;
    }
}

// Original completion functions are captured before EDITOR/NODEJS overrides.
const activityOnEnabled = ComponentScheduler.prototype._onEnabled;
const activityOnDisabled = ComponentScheduler.prototype._onDisabled;

if (EDITOR || NODEJS) {
    ComponentScheduler.prototype.enableComp = function (comp, invoker): void {
        // NOTE: _executeInEditMode is dynamically injected on Editor environment
        if (legacyCC.GAME_VIEW || (comp.constructor as any)._executeInEditMode) {
            if (!(comp._objFlags & IsOnEnableCalled)) {
                if (comp.internalOnEnable) {
                    if (invoker) {
                        invoker.add(comp);
                        enableInEditor(comp);
                        return;
                    } else {
                        callOnEnableInTryCatch(comp);

                        const deactivatedDuringOnEnable = !comp.node.activeInHierarchy;
                        if (deactivatedDuringOnEnable) {
                            return;
                        }
                    }
                }
                this._onEnabled(comp);
            }
        }
        enableInEditor(comp);
    };

    ComponentScheduler.prototype.disableComp = function (comp): void {
        // NOTE: _executeInEditMode is dynamically injected on Editor environment
        if (legacyCC.GAME_VIEW || (comp.constructor as any)._executeInEditMode) {
            if (comp._objFlags & IsOnEnableCalled) {
                if (comp.internalOnDisable) {
                    callOnDisableInTryCatch(comp);
                }
                this._onDisabled(comp);
            }
        }
        if (comp._objFlags & IsEditorOnEnableCalled) {
            legacyCC.engine.emit('component-disabled', comp.uuid);
            comp._objFlags &= ~IsEditorOnEnableCalled;
        }
    };
}
