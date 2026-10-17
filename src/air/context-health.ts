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
 * Cocos AIR — WebGL 上下文健康状态机（W01，Code First 与 Web 可靠性任务清单）。
 *
 * 上游 webgl/webgl2 swapchain 对 webglcontextlost 仅告警（warnID 11000），没有恢复闭环。
 * AIR 在不触碰上游 gfx 文件的前提下，于画布层挂接同一标准事件，提供显式状态机：
 *
 *   healthy → lost（webglcontextlost）
 *           → restoring（webglcontextrestored）
 *           → failed（如实判定：本期不重建 GPU 资源）
 *
 * - lost：preventDefault()（为受控恢复路径留门）+ game.pause()（引擎级停摆：rAF、渲染、
 *   业务时钟与音频一并暂停，不再向已失效的上下文提交 GL 调用）。
 * - restoring→failed：AIR 本期不重建 GPU 资源（纹理/buffer/program/FBO 全量重建属引擎级
 *   能力，上游 Web 端同样缺失），恢复事件到达即显式判定失败并给出受控重载建议；
 *   不宣称「自愈」，restoring 作为瞬时态保留在 timeline 中供观测。
 * - failed：requestReload() 受控重载入口（默认 window.location.reload()，可注入替换
 *   以便测试）；healthy 态调用为无操作并返回 false（门掣）。
 *
 * 本文件为 Air 原创（上游 cocos4 无同名文件）。
 */

import { game } from '../cocos/game';

/** @en Context health state. @zh 上下文健康状态（W01 状态机）。 */
export type AirContextHealthState = 'healthy' | 'lost' | 'restoring' | 'failed';

/** @en Detected WebGL backend of the attached canvas. @zh 画布实际使用的 WebGL 后端。 */
export type AirContextBackend = 'webgl2' | 'webgpu' | 'none' | 'unknown';

/** @en Readable point-in-time health report. @zh 可轮询的健康快照。 */
export interface AirContextHealthSnapshot {
    state: AirContextHealthState;
    backend: AirContextBackend;
    /** 累计 webglcontextlost 次数（多次丢失观测）。 */
    lostCount: number;
    /** 累计 webglcontextrestored 次数。 */
    restoredCount: number;
    /** 实时 gl.isContextLost()；不可得时为 null。 */
    isContextLost: boolean | null;
    /** 引擎主循环暂停态（读私有字段，不可得时为 null）。 */
    gamePaused: boolean | null;
    /** 进入 failed 的原因；非 failed 态为 null。 */
    reason: string | null;
    /** 建议动作：failed 态为 'reload'，其余 'none'。 */
    suggestion: 'reload' | 'none';
    /** 最近一次状态事件类型与时间戳（epoch ms）。 */
    lastEvent: 'lost' | 'restoring' | 'failed' | null;
    lastEventAt: number | null;
    /** 状态迁移时间线（含瞬时态，最多保留 32 条）。 */
    timeline: { at: number; type: AirContextHealthState; detail?: string }[];
}

/** @en Options for the context-loss state machine. @zh 上下文丢失状态机选项。 */
export interface AirContextLossOptions {
    /** lost 时自动 game.pause()（默认 true）。 */
    autoPause?: boolean;
    /**
     * 受控重载动作（默认 window.location.reload()）。测试可注入记录函数替代真实导航。
     */
    reload?: () => void;
    /** 每次状态迁移回调（观察者）。 */
    onEvent?: (snapshot: AirContextHealthSnapshot) => void;
}

/** @en Health handle exposed on [[AirApp]]. @zh 挂在 AirApp 上的健康句柄。 */
export interface AirContextHealth {
    snapshot(): AirContextHealthSnapshot;
    /** Observe the actual initialized WebGPU device without acquiring another canvas context. */
    watchWebGPUDevice(device: { readonly lost: Promise<{ readonly reason: string; readonly message: string }> }): void;
    /** 订阅状态迁移，返回退订函数。 */
    onChange(cb: (snapshot: AirContextHealthSnapshot) => void): () => void;
    /**
     * @en Trigger the controlled reload. Only acts in `failed` state; returns whether
     * the reload action was invoked.
     * @zh 触发受控重载。仅 failed 态生效；返回是否真正调用了重载动作。
     */
    requestReload(): boolean;
    /** 摘除事件监听（页面卸载/测试清理用）。 */
    destroy(): void;
}

const TIMELINE_LIMIT = 32;

/**
 * @en Attach the W01 context-health state machine to a canvas.
 * @zh 在画布上挂接 W01 上下文健康状态机。createAirApp 内部调用；HEADLESS 等无 GL
 * 后端时安全空转（backend='none'，事件不来则状态恒 healthy）。
 */
export function attachContextHealth(canvas: HTMLCanvasElement, options: AirContextLossOptions = {}): AirContextHealth {
    const autoPause = options.autoPause !== false;
    let state: AirContextHealthState = 'healthy';
    let backend: AirContextBackend = 'unknown';
    let lostCount = 0;
    let restoredCount = 0;
    let reason: string | null = null;
    let lastEvent: AirContextHealthSnapshot['lastEvent'] = null;
    let lastEventAt: number | null = null;
    let gl: WebGL2RenderingContext | null = null;
    let destroyed = false;
    const timeline: AirContextHealthSnapshot['timeline'] = [];
    const listeners = new Set<(snapshot: AirContextHealthSnapshot) => void>();
    if (typeof options.onEvent === 'function') {
        listeners.add(options.onEvent);
    }

    function acquireGl(): typeof gl {
        if (backend === 'webgpu') return null;
        if (gl) {
            return gl;
        }
        try {
            // 同类型 getContext 返回既有上下文（引擎创建后）；跨类型返回 null。
            const g2 = canvas.getContext('webgl2');
            if (g2) {
                gl = g2;
                backend = 'webgl2';
                return gl;
            }
            backend = 'none';
        } catch {
            backend = 'none';
        }
        return null;
    }

    function readGamePaused(): boolean | null {
        try {
            return (game as unknown as { _paused?: boolean })._paused ?? null;
        } catch {
            return null;
        }
    }

    function snapshot(): AirContextHealthSnapshot {
        let isLost: boolean | null = null;
        const g = acquireGl();
        if (g) {
            try {
                isLost = g.isContextLost();
            } catch {
                isLost = null;
            }
        }
        return {
            state,
            backend,
            lostCount,
            restoredCount,
            isContextLost: isLost,
            gamePaused: readGamePaused(),
            reason,
            suggestion: state === 'failed' ? 'reload' : 'none',
            lastEvent,
            lastEventAt,
            timeline: timeline.slice(),
        };
    }

    function transition(next: AirContextHealthState, detail?: string): void {
        state = next;
        if (next === 'failed') {
            reason = detail ?? 'unknown';
        } else {
            reason = null;
        }
        timeline.push({ at: Date.now(), type: next, detail });
        if (timeline.length > TIMELINE_LIMIT) {
            timeline.splice(0, timeline.length - TIMELINE_LIMIT);
        }
        lastEvent = next === 'healthy' ? null : next;
        lastEventAt = Date.now();
        const snap = snapshot();
        for (const cb of listeners) {
            try {
                cb(snap);
            } catch {
                /* 观察者异常不阻断状态机 */
            }
        }
    }

    function onLost(event: Event): void {
        // spec：preventDefault 后浏览器才可能走恢复路径（真实 GPU reset 的自动恢复与
        // WEBGL_lose_context.restoreContext() 模拟均以此为前提）。
        try {
            event.preventDefault();
        } catch {
            /* 某些平台无此方法（上游注记同源） */
        }
        acquireGl();
        lostCount += 1;
        if (autoPause) {
            try {
                game.pause();
            } catch {
                /* 未 run() 时 pause 幂等安全 */
            }
        }
        transition('lost', 'webglcontextlost');
    }

    function onRestored(): void {
        restoredCount += 1;
        transition('restoring', 'webglcontextrestored');
        // 如实判定：AIR 本期不重建 GPU 资源（所有既有纹理/buffer/program/FBO 句柄已失效），
        // 恢复到的空上下文不能继续正确渲染 → 显式失败 + 受控重载建议。不自愈、不静默。
        transition('failed', 'context-restored-but-gpu-resources-not-rebuilt');
    }

    canvas.addEventListener('webglcontextlost', onLost as EventListener, false);
    canvas.addEventListener('webglcontextrestored', onRestored as EventListener, false);

    return {
        snapshot,
        watchWebGPUDevice(device: {
            readonly lost: Promise<{ readonly reason: string; readonly message: string }>;
        }): void {
            backend = 'webgpu';
            device.lost.then((info) => {
                if (destroyed) return;
                lostCount += 1;
                // A dead device must never continue drawing, including autoPause:false.
                game.pause();
                transition('lost', `webgpu-device-lost: ${info.reason}: ${info.message}`);
                transition('failed', 'webgpu-resources-require-reload');
            });
        },
        onChange(cb: (snapshot: AirContextHealthSnapshot) => void): () => void {
            listeners.add(cb);
            return () => {
                listeners.delete(cb);
            };
        },
        requestReload(): boolean {
            if (state !== 'failed') {
                return false;
            }
            const reload =
                options.reload ??
                ((): void => {
                    if (typeof window !== 'undefined' && window.location) {
                        window.location.reload();
                    }
                });
            reload();
            return true;
        },
        destroy(): void {
            destroyed = true;
            canvas.removeEventListener('webglcontextlost', onLost as EventListener, false);
            canvas.removeEventListener('webglcontextrestored', onRestored as EventListener, false);
            listeners.clear();
        },
    };
}
