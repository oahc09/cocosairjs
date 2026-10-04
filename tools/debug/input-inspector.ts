/*
 * Cocos Air — 输入动作检查器（PG-28 可选诊断，tools/debug 侧专用，默认不进 runtime 包）。
 *
 * 合同（docs/reference/port-gap-contracts.md「输入动作」最后一条 + 计划 §11.1）：
 *  - 仅工具侧 opt-in：默认 disabled，调用 setEnabled(true) 才开始记录；
 *  - 最多 80 条环形缓冲，超出即丢弃并计数，不扩容；
 *  - 快照至多 2Hz（节流），只读拉取（pull），不订阅、不注入、不改变任何动作计数、时钟或所有权；
 *  - 只记录显式传入状态钩子的枚举动作（action 名、held/pressed/released/axis、活跃 source 身份），
 *    不接触 DOM 事件、不记录文本/密码/全页面按键，不持久化、不发送网络；
 *  - 接受任何结构兼容的 reducer 投影（AirActionState 的只读子集），与 runtime 解耦。
 */

/** @en Read-only projection the inspector may poll; satisfied by AirActionState. @zh 检查器可轮询的只读投影；AirActionState 天然满足。 */
export interface InputInspectorHooks {
    readonly actions: readonly string[];
    mode(action: string): 'button' | 'axis' | undefined;
    held(action: string): boolean;
    pressed(action: string): boolean;
    released(action: string): boolean;
    axis(action: string): number;
    heldSources(action: string): ReadonlyArray<{ backend: string; physicalCode?: string; keyCode?: unknown; pointerId?: number }>;
    lastReset(): { readonly reason: string; readonly at: number; readonly count: number } | null;
}

/** @en One action's read-only view inside a snapshot. @zh 快照内单个动作的只读视图。 */
export interface InputInspectorActionSnapshot {
    readonly action: string;
    readonly mode: 'button' | 'axis' | undefined;
    readonly held: boolean;
    readonly pressed: boolean;
    readonly released: boolean;
    /** @en Axis value (axis actions only; undefined otherwise). @zh 轴值（仅轴动作；按钮为 undefined）。 */
    readonly axis?: number;
    readonly heldSources: ReadonlyArray<{ backend: string; physicalCode?: string; keyCode?: unknown; pointerId?: number }>;
}

/** @en One throttled snapshot entry. @zh 一条节流快照。 */
export interface InputInspectorEntry {
    readonly at: number;
    readonly actions: readonly InputInspectorActionSnapshot[];
    readonly lastReset: { readonly reason: string; readonly at: number; readonly count: number } | null;
}

export interface InputInspectorOptions {
    /** @en Ring capacity; hard-capped at 80 by contract. @zh 环形容量；合同硬上限 80。 */
    readonly limit?: number;
    /** @en Max snapshots per second; hard-capped at 2 by contract. @zh 每秒快照上限；合同硬上限 2。 */
    readonly snapshotHz?: number;
}

export interface InputInspector {
    /** @en false until setEnabled(true). @zh 默认 false。 */
    readonly enabled: boolean;
    setEnabled(value: boolean): void;
    /**
     * @en Take one read-only snapshot, always throttled to snapshotHz. Legacy force is ignored.
     * Returns null when disabled or throttled. Never mutates reducer state.
     * @zh 取一份只读快照（始终受 snapshotHz 节流；旧 force 参数忽略）。禁用或节流期返回 null。
     * 绝不改变 reducer 状态。
     */
    snapshot(force?: boolean): InputInspectorEntry | null;
    /** @en Stored entries (oldest first, ≤ limit). @zh 已存条目（旧→新，≤ limit）。 */
    entries(): readonly InputInspectorEntry[];
    /** @en Entries dropped due to the ring cap. @zh 因环形上限被丢弃的条目数。 */
    dropped(): number;
    clear(): void;
}

const CONTRACT_LIMIT = 80;
const CONTRACT_SNAPSHOT_HZ = 2;

export function createInputInspector (hooks: InputInspectorHooks, options: InputInspectorOptions = {}): InputInspector {
    if ((options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1))
        || (options.snapshotHz !== undefined && (!Number.isFinite(options.snapshotHz) || options.snapshotHz <= 0))) {
        throw Object.assign(new RangeError('Input inspector limit must be a positive integer and snapshotHz finite and positive'), {
            code: 'AIR_E_INSPECTOR_OPTIONS',
        });
    }
    const limit = Math.min(Math.max(1, options.limit ?? CONTRACT_LIMIT), CONTRACT_LIMIT);
    const snapshotHz = Math.min(Math.max(0.001, options.snapshotHz ?? CONTRACT_SNAPSHOT_HZ), CONTRACT_SNAPSHOT_HZ);
    const minIntervalMs = 1000 / snapshotHz;

    let enabled = false;
    let ring: InputInspectorEntry[] = [];
    let droppedCount = 0;
    let lastSnapshotAt = -Infinity;

    const take = (): InputInspectorEntry => Object.freeze({
        at: Date.now(),
        actions: Object.freeze(hooks.actions.map((action) => {
            const mode = hooks.mode(action);
            return Object.freeze({
                action,
                mode,
                held: hooks.held(action),
                pressed: hooks.pressed(action),
                released: hooks.released(action),
                ...(mode === 'axis' ? { axis: hooks.axis(action) } : {}),
                heldSources: Object.freeze(hooks.heldSources(action).map((s) => Object.freeze({ ...s }))),
            });
        })),
        lastReset: hooks.lastReset() ? Object.freeze({ ...hooks.lastReset()! }) : null,
    });

    return {
        get enabled () { return enabled; },

        setEnabled (value) {
            enabled = value === true;
            if (!enabled) return; // 关闭只停记录，不清已有条目（复核需要现场）
        },

        snapshot (_force) {
            if (!enabled) return null;
            const now = Date.now();
            if (now - lastSnapshotAt < minIntervalMs) return null;
            lastSnapshotAt = now;
            const entry = take();
            if (ring.length >= limit) {
                ring.shift();
                droppedCount += 1;
            }
            ring.push(entry);
            return entry;
        },

        entries () {
            return Object.freeze([...ring]);
        },

        dropped () {
            return droppedCount;
        },

        clear () {
            ring = [];
            droppedCount = 0;
            // Clearing stored data does not reset the hard sampling rate limit.
        },
    };
}
