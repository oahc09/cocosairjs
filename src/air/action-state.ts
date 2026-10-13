/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

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
/**
 * Cocos Air — 输入动作纯 reducer（PG-28，port-gap-remediation §11/§12 S3）。
 *
 * `createActionState` 是与任何事件源解耦的纯状态机：适配器（src/air/action-input.ts）
 * 或 HUD 显式调用把"某个 source 上/下"喂进来，业务侧以 held/pressed/released/axis 查询，
 * 或按业务 tick 调 consumeTick() 有序消费 transition。本文件对引擎只有类型依赖
 * （`import type { KeyCode }`），可在无引擎运行时的环境直接加载。
 *
 * 合同要点（docs/reference/port-gap-contracts.md「输入动作」）：
 *  - source 至少标识 backend、physical code/KeyCode、pointerId；同一动作的多个 source
 *    是"或"关系：任一 source 释放只移除该 source，绝不误置 held=false；
 *  - inactive→active 才产生一次 press，repeat（已活跃 source 的重复 press）不重新武装；
 *  - consumeTick() 返回有序、不去重的 transitions[]（同一 tick 内 press/release/press
 *    依序保留），并附去重的 pressed[]/released[] 便利 flag；无新事件时重复调用返回空，
 *    绝不重放；0 tick 的快按/快放保留到下一个业务 tick，不丢失；
 *  - reset(reason) 按原因清空活跃集合与待处理队列（blur/hidden/pause/restart/deactivate/
 *    dispose/manual 各自记录），不发出伪造边沿，也不清除绑定关系；
 *  - 业务 accumulator 与测试用 createStepClock 无关：本模块不含时钟；
 *  - 运行期校验：source 身份、数值有限性（NaN/Infinity 拒绝）、未知动作名一律抛稳定
 *    AIR_E_* 错误；对外只读数据均冻结拷贝，不能借快照改写内部身份。
 */

import type { KeyCode } from '../cocos/input/types';

/** @en Stable error codes thrown by the action-state runtime surface. @zh 动作状态运行面的稳定错误码。 */
export type AirActionErrorCode =
    | 'AIR_E_INVALID_SOURCE' // source 身份不合法（缺 backend/身份字段，或把声明期模式当 source）
    | 'AIR_E_INVALID_VALUE' // 数值不合法（非有限数，NaN/Infinity 不得污染查询）
    | 'AIR_E_UNKNOWN_ACTION' // 查询/派发了未声明动作名（拼错早暴露）
    | 'AIR_E_DISPOSED'; // 适配器已 dispose（终态），拒绝再 attach

/** @en Error with a stable machine-readable code. @zh 带稳定错误码的动作模块错误。 */
export class AirActionError extends Error {
    constructor (public readonly code: AirActionErrorCode, message: string) {
        super(message);
        this.name = 'AirActionError';
    }
}

/** @en Input channel that produced a source. @zh 产生该 source 的输入通道。 */
export type AirActionBackend = 'native' | 'dom' | 'manual';

/**
 * @en Identity of one physical input source (one held key or one touch point).
 * @zh 单一物理输入源的身份（一个按住的键或一个触点）。
 *
 * `native` 后端以引擎 `KeyCode` 标识键盘；`dom` 后端以 `KeyboardEvent.code` 标识物理键。
 * 两条通道的同名键是不同 source（alias 不合并）；指针源用 `pointerId`。
 * `manual` 供 HUD 按钮等显式 press/release 场景，任意可区分字段组合皆可。
 */
export interface AirActionSource {
    readonly backend: AirActionBackend;
    /** @en DOM `KeyboardEvent.code`（dom 后端的物理键身份）。 @zh dom 后端物理键（如 'KeyA'）。 */
    readonly physicalCode?: string;
    /** @en Engine KeyCode（native 后端的物理键身份）。 @zh native 后端引擎键码。 */
    readonly keyCode?: KeyCode;
    /** @en Pointer / touch identifier. @zh 指针/触点 ID。 */
    readonly pointerId?: number;
}

/** @en Action behavior: button = press-style discrete action, axis = continuous analog value. @zh 动作形态：button 为按键型离散动作，axis 为连续模拟量。 */
export type AirActionMode = 'button' | 'axis';

/** @en One binding entry: a source plus its axis contribution. @zh 绑定项：source 及其轴贡献值。 */
export interface AirActionBinding {
    readonly source: AirActionSource;
    /** @en Axis contribution while this source is active (default 1; buttons ignore it). @zh 活跃时的轴贡献（默认 1；按钮动作忽略）。 */
    readonly value?: number;
}

/**
 * @en Pointer pattern: binds every pointer/touch of the given backend regardless of id.
 * Keyboard sources are enumerable, so patterns are pointer-only by design. A pattern is a
 * declaration-time matcher — it is not itself a valid runtime source.
 * @zh 指针模式绑定：匹配该后端的任意触点/指针。键盘 source 可枚举，模式绑定只面向指针。
 * 模式只是声明期匹配器，不是合法的运行期 source。
 */
export interface AirActionPointerPattern {
    readonly backend: AirActionBackend;
    readonly pointerId: '*';
}

/** @en Action declaration. @zh 动作声明。 */
export interface AirActionDefinition {
    /** @en Defaults to 'button'. @zh 默认 'button'。 */
    readonly mode?: AirActionMode;
    /** @en Initial source set (OR semantics; `pointerId:'*'` patterns bind dynamic pointers). @zh 初始 source 集合（或语义；`pointerId:'*'` 模式绑定动态指针）。 */
    readonly sources?: ReadonlyArray<AirActionSource | AirActionBinding | AirActionPointerPattern | (AirActionBinding & { source: AirActionPointerPattern })>;
}

/** @en Reasons for a state reset; callers must distinguish them. @zh 重置原因；调用方必须区分。 */
export type AirActionResetReason = 'blur' | 'hidden' | 'pause' | 'restart' | 'deactivate' | 'dispose' | 'manual';

/** @en Record of the most recent reset. @zh 最近一次重置的记录。 */
export interface AirActionResetRecord {
    readonly reason: AirActionResetReason;
    readonly at: number;
    /** @en Monotonic reset counter across the state lifetime. @zh 整个生命周期内的单调重置计数。 */
    readonly count: number;
}

/** @en One ordered transition consumed from the queue (not deduped). @zh 队列消费出的一条有序 transition（不去重）。 */
export interface AirActionTransition {
    readonly action: string;
    readonly kind: 'press' | 'release';
    readonly source: AirActionSource;
}

/** @en Ordered changes consumed by one [[AirActionState.consumeTick]] call. @zh 一次 consumeTick 消费到的有序变化。 */
export interface AirActionTick {
    /**
     * @en Every edge this tick in queue order — press→release→press of the same action is
     * preserved as three entries. Frozen.
     * @zh 本 tick 全部边沿，按队列顺序——同一动作的 press→release→press 保留为三项。已冻结。
     */
    readonly transitions: readonly AirActionTransition[];
    /** @en Convenience flags: actions with a press edge, first-occurrence order, deduped. @zh 便利 flag：出现 press 边沿的动作（首现序、去重）。已冻结。 */
    readonly pressed: readonly string[];
    /** @en Convenience flags: actions with a release edge, first-occurrence order, deduped. @zh 便利 flag：出现 release 边沿的动作（首现序、去重）。已冻结。 */
    readonly released: readonly string[];
}

/** @en Pure input-action state machine. @zh 输入动作纯状态机。 */
export interface AirActionState {
    /** @en Declared action names (frozen). @zh 已声明的动作名（冻结）。 */
    readonly actions: readonly string[];
    /** @en Mode of an action; unknown names throw AIR_E_UNKNOWN_ACTION. @zh 动作形态；未知动作名抛 AIR_E_UNKNOWN_ACTION。 */
    mode(action: string): AirActionMode | undefined;
    /** @en Whether any source of the action is currently active. @zh 动作是否有任一 source 活跃。 */
    held(action: string): boolean;
    /** @en Whether the action had a press edge in the last consumed tick. @zh 最近一次消费的 tick 内是否有 press 边沿。 */
    pressed(action: string): boolean;
    /** @en Whether the action had a release edge in the last consumed tick. @zh 最近一次消费的 tick 内是否有 release 边沿。 */
    released(action: string): boolean;
    /** @en Axis value = clamped sum of active source values (buttons report 0). @zh 轴值 = 活跃 source 贡献之和（截断到 [-1,1]；按钮恒 0）。 */
    axis(action: string): number;
    /** @en Frozen copies of the action's active sources. @zh 动作当前活跃 source 的冻结拷贝。 */
    heldSources(action: string): readonly AirActionSource[];
    /** @en Most recent reset record, or null. @zh 最近一次重置记录，未重置过为 null。 */
    lastReset(): AirActionResetRecord | null;
    /** @en Actions the source is bound to (adapter event routing; patterns included). @zh 该 source 绑定到的动作（适配器事件入口用，含模式绑定）。 */
    actionsFor(source: AirActionSource): readonly string[];
    /**
     * @en Mark a source active on an action. Idempotent per (action, source): re-press of an
     * active source (key repeat) is a no-op and does not re-arm the press edge.
     * @zh 将 source 标记为动作活跃。对 (动作, source) 幂等：已活跃 source 的重复 press
     * （按键 repeat）是 no-op，不重新武装 press 边沿。
     * @returns true when this call activated the source.
     */
    press(action: string, source: AirActionSource, value?: number): boolean;
    /** @en Mark a source inactive; other sources of the action stay held. @zh 释放单个 source；动作的其他 source 保持。 */
    release(action: string, source: AirActionSource): boolean;
    /** @en Direct analog write; value 0 releases the source, out-of-range values are clamped. @zh 模拟量直写；0 视为释放，超范围值截断。 */
    setAxis(action: string, source: AirActionSource, value: number): void;
    /**
     * @en Consume edges queued since the previous call: `transitions` keeps every edge in
     * order (press→release→press survives), `pressed`/`released` are deduped flags. Quick
     * press+release with no tick in between survives to this call; repeated calls without
     * new events return empty (no replay). Also refreshes the pressed()/released() state.
     * @zh 有序消费自上次调用以来积压的边沿：transitions 完整保序（同动作 press→release→press
     * 保留三项），pressed/released 为去重 flag。0 tick 的快按快放保留至此；无新事件时重复
     * 调用返回空（不重放）。同时刷新 pressed()/released() 查询状态。
     */
    consumeTick(): AirActionTick;
    /**
     * @en Reset by reason: clears active sources and the pending queue (no synthetic edges),
     * keeps bindings. `reset` never removes listeners — adapter detach is a separate concern.
     * @zh 按原因重置：清空活跃集合与待处理队列（不产生伪造边沿），保留绑定。
     * reset 不负责监听器——解绑是适配器的职责。
     */
    reset(reason: AirActionResetReason): void;
}

/** @en Options for [[createActionState]]. @zh createActionState 选项。 */
export interface AirActionStateOptions {
    /** @en Action declarations; at least one action. @zh 动作声明；至少一个动作。 */
    readonly actions: Readonly<Record<string, AirActionDefinition>>;
}

interface ActiveEntry {
    readonly source: AirActionSource;
    value: number;
}

interface PendingEdge {
    readonly action: string;
    readonly kind: 'press' | 'release';
    readonly source: AirActionSource;
}

const BACKENDS: ReadonlySet<string> = new Set(['native', 'dom', 'manual']);
const AXIS_CLAMP = 1;

/** @en Canonical identity of a source; distinct channels/alias keys never share a key. @zh source 的规范身份；不同通道/别名键永不共享同一 key。 */
export function airActionSourceKey (source: AirActionSource): string {
    const code = source.physicalCode !== undefined ? String(source.physicalCode) : '';
    const kc = source.keyCode !== undefined ? String(source.keyCode) : '';
    const pid = source.pointerId !== undefined ? String(source.pointerId) : '';
    return `${source.backend}|${code}|${kc}|${pid}`;
}

/** @en Runtime source validation with stable AIR_E_* failures. @zh 运行期 source 校验，失败抛稳定 AIR_E_* 错误。 */
export function assertValidSource (source: AirActionSource): void {
    if (!source || typeof source !== 'object') {
        throw new AirActionError('AIR_E_INVALID_SOURCE', `source must be an object, got ${String(source)}`);
    }
    if (!BACKENDS.has(source.backend)) {
        throw new AirActionError('AIR_E_INVALID_SOURCE', `unknown source backend: ${String(source.backend)}`);
    }
    const codeOk = typeof source.physicalCode === 'string' && source.physicalCode.length > 0;
    const keyOk = typeof source.keyCode === 'number' && Number.isFinite(source.keyCode);
    const pidOk = typeof source.pointerId === 'number' && Number.isFinite(source.pointerId);
    if (source.pointerId === ('*' as unknown)) {
        // 声明期模式不能冒充运行期 source（身份必须可枚举）。
        throw new AirActionError('AIR_E_INVALID_SOURCE', 'pointerId:"*" is a declaration-time pattern, not a runtime source');
    }
    if (!codeOk && !keyOk && !pidOk) {
        throw new AirActionError('AIR_E_INVALID_SOURCE', 'source needs at least one identity field: physicalCode | keyCode | pointerId');
    }
    if (source.physicalCode !== undefined && !codeOk) {
        throw new AirActionError('AIR_E_INVALID_SOURCE', 'physicalCode must be a non-empty string');
    }
    if (source.keyCode !== undefined && !keyOk) {
        throw new AirActionError('AIR_E_INVALID_SOURCE', 'keyCode must be a finite number');
    }
    if (source.pointerId !== undefined && !pidOk) {
        throw new AirActionError('AIR_E_INVALID_SOURCE', 'pointerId must be a finite number');
    }
}

function assertFiniteValue (value: number, where: string): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new AirActionError('AIR_E_INVALID_VALUE', `${where} must be a finite number, got ${String(value)}`);
    }
}

/**
 * @en Create the pure action-state reducer. No engine input subscription happens here;
 * pair with [[createActionInput]] (action-input.ts) for event plumbing.
 * @zh 创建输入动作纯 reducer。此处不订阅任何引擎输入；事件接线请配合
 * action-input.ts 的 [[createActionInput]]。
 */
export function createActionState (options: AirActionStateOptions): AirActionState {
    const names = Object.keys(options.actions);
    if (names.length === 0) {
        throw new AirActionError('AIR_E_UNKNOWN_ACTION', 'actions must declare at least one action');
    }
    const modes = new Map<string, AirActionMode>();
    const bindings = new Map<string, Map<string, AirActionBinding>>(); // action -> sourceKey -> binding
    const reverse = new Map<string, string[]>(); // sourceKey -> actions
    const patterns = new Map<string, Array<{ pattern: AirActionPointerPattern; value: number }>>(); // action -> pointer patterns
    for (const name of names) {
        const def = options.actions[name] ?? {};
        const mode = def.mode ?? 'button';
        if (mode !== 'button' && mode !== 'axis') {
            throw new AirActionError('AIR_E_UNKNOWN_ACTION', `unknown mode for action "${name}": ${String(mode)}`);
        }
        modes.set(name, mode);
        const perAction = new Map<string, AirActionBinding>();
        const perActionPatterns: Array<{ pattern: AirActionPointerPattern; value: number }> = [];
        for (const entry of def.sources ?? []) {
            const isBindingWrapper = (entry as AirActionBinding).source !== undefined;
            const inner = isBindingWrapper ? (entry as AirActionBinding).source : entry as AirActionSource;
            const value = isBindingWrapper ? (entry as AirActionBinding).value : undefined;
            if (value !== undefined) assertFiniteValue(value, `binding value of action "${name}"`);
            if ((inner as { pointerId?: unknown }).pointerId === '*') {
                // 指针模式绑定：动态 pointerId 不能预先枚举，事件入口按模式匹配。
                const pattern = inner as unknown as AirActionPointerPattern;
                if (!BACKENDS.has(pattern.backend)) {
                    throw new AirActionError('AIR_E_INVALID_SOURCE', `unknown pattern backend for action "${name}": ${String(pattern.backend)}`);
                }
                perActionPatterns.push({ pattern: Object.freeze({ ...pattern }), value: value ?? 1 });
                continue;
            }
            assertValidSource(inner as AirActionSource);
            const binding: AirActionBinding = { source: Object.freeze({ ...inner }), value };
            const key = airActionSourceKey(binding.source);
            if (perAction.has(key)) {
                throw new AirActionError('AIR_E_INVALID_SOURCE', `duplicate source bound to action "${name}": ${key}`);
            }
            perAction.set(key, binding);
            const actions = reverse.get(key) ?? [];
            if (!actions.includes(name)) actions.push(name);
            reverse.set(key, actions);
        }
        if (perActionPatterns.length > 0) patterns.set(name, perActionPatterns);
        bindings.set(name, perAction);
    }

    const active = new Map<string, Map<string, ActiveEntry>>(); // action -> sourceKey -> entry
    for (const name of names) active.set(name, new Map());

    let pending: PendingEdge[] = [];
    let tickPressed: ReadonlySet<string> = new Set<string>();
    let tickReleased: ReadonlySet<string> = new Set<string>();
    let resetRecord: AirActionResetRecord | null = null;
    let resetCount = 0;

    const clampAxis = (value: number): number => Math.max(-AXIS_CLAMP, Math.min(AXIS_CLAMP, value));
    const axisSum = (name: string): number => {
        let sum = 0;
        for (const entry of active.get(name)!.values()) sum += entry.value;
        return clampAxis(sum);
    };
    const assertKnownAction = (action: string): void => {
        if (!modes.has(action)) {
            throw new AirActionError('AIR_E_UNKNOWN_ACTION', `unknown action: "${action}" (declared: ${names.join(', ')})`);
        }
    };
    const freezeSources = (name: string): readonly AirActionSource[] =>
        Object.freeze([...active.get(name)!.values()].map((entry) => Object.freeze({ ...entry.source })));

    return Object.freeze({
        actions: Object.freeze(names),

        mode (action) {
            assertKnownAction(action);
            return modes.get(action);
        },

        held (action) {
            assertKnownAction(action);
            return active.get(action)!.size > 0;
        },

        pressed (action) {
            assertKnownAction(action);
            return tickPressed.has(action);
        },

        released (action) {
            assertKnownAction(action);
            return tickReleased.has(action);
        },

        axis (action) {
            assertKnownAction(action);
            if (modes.get(action) !== 'axis') return 0;
            return axisSum(action);
        },

        heldSources (action) {
            assertKnownAction(action);
            return freezeSources(action);
        },

        lastReset () {
            return resetRecord;
        },

        actionsFor (source) {
            assertValidSource(source);
            const key = airActionSourceKey(source);
            const result = [...(reverse.get(key) ?? [])];
            if (source.pointerId !== undefined) {
                for (const [name, list] of patterns) {
                    if (result.includes(name)) continue;
                    for (const { pattern } of list) {
                        if (pattern.backend === source.backend) {
                            result.push(name);
                            break;
                        }
                    }
                }
            }
            return Object.freeze(result);
        },

        press (action, source, value) {
            assertKnownAction(action);
            assertValidSource(source);
            if (value !== undefined) assertFiniteValue(value, `press value of action "${action}"`);
            const perAction = active.get(action)!;
            const key = airActionSourceKey(source);
            if (perAction.has(key)) return false; // repeat：不重新武装
            const binding = bindings.get(action)!.get(key);
            const patternHit = binding ? undefined : (patterns.get(action) ?? []).find(({ pattern }) => pattern.backend === source.backend);
            const entry: ActiveEntry = {
                source: Object.freeze({ ...source }),
                value: modes.get(action) === 'axis' ? clampAxis(value ?? binding?.value ?? patternHit?.value ?? 1) : 0,
            };
            perAction.set(key, entry);
            if (modes.get(action) === 'button') pending.push({ action, kind: 'press', source: entry.source });
            return true;
        },

        release (action, source) {
            assertKnownAction(action);
            assertValidSource(source);
            const perAction = active.get(action)!;
            const key = airActionSourceKey(source);
            if (!perAction.has(key)) return false;
            perAction.delete(key);
            if (modes.get(action) === 'button') pending.push({ action, kind: 'release', source: Object.freeze({ ...source }) });
            return true;
        },

        setAxis (action, source, value) {
            assertKnownAction(action);
            assertValidSource(source);
            assertFiniteValue(value, `setAxis value of action "${action}"`);
            if (modes.get(action) !== 'axis') {
                throw new AirActionError('AIR_E_UNKNOWN_ACTION', `setAxis on non-axis action "${action}"`);
            }
            const perAction = active.get(action)!;
            const key = airActionSourceKey(source);
            const clamped = clampAxis(value);
            if (clamped === 0) {
                perAction.delete(key); // 0 = 该 source 释放
                return;
            }
            const existing = perAction.get(key);
            if (existing) {
                existing.value = clamped;
                return;
            }
            perAction.set(key, { source: Object.freeze({ ...source }), value: clamped });
        },

        consumeTick () {
            const transitions: AirActionTransition[] = [];
            const pressed: string[] = [];
            const released: string[] = [];
            const pressedSet = new Set<string>();
            const releasedSet = new Set<string>();
            const queue = pending;
            pending = [];
            for (const edge of queue) {
                transitions.push(Object.freeze({ action: edge.action, kind: edge.kind, source: Object.freeze({ ...edge.source }) }));
                const target = edge.kind === 'press' ? pressed : released;
                const set = edge.kind === 'press' ? pressedSet : releasedSet;
                if (!set.has(edge.action)) {
                    set.add(edge.action);
                    target.push(edge.action);
                }
            }
            tickPressed = pressedSet;
            tickReleased = releasedSet;
            return Object.freeze({
                transitions: Object.freeze(transitions),
                pressed: Object.freeze(pressed),
                released: Object.freeze(released),
            });
        },

        reset (reason) {
            for (const perAction of active.values()) perAction.clear();
            pending = [];
            tickPressed = new Set<string>();
            tickReleased = new Set<string>();
            resetCount += 1;
            resetRecord = Object.freeze({ reason, at: Date.now(), count: resetCount });
        },
    });
}
