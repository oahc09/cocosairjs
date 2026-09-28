/**
 * Cocos Air — 确定性单时钟测试驱动（W08，Code First 与 Web 可靠性任务清单）。
 *
 * `game.step()` 只做 `director.tick(fixedDT)`，不会先暂停主循环——运行中直接调用等于
 * 真实 rAF 与手动步进双时钟并发（任务书明令禁止）。本封装把三步合同固化：
 *
 *   begin()  — game.pause()（停真实 pacer：rAF/渲染/业务时钟/音频）
 *   step(dt) — director.tick(dt ?? 1/frameRate)，等待本帧 AFTER_DRAW 后返回；
 *              未处于暂停态调用直接抛错（反双时钟门卫）
 *   end()    — game.resume()（恢复真实时钟）
 *
 * 用法（测试/验收页）：
 *   const clock = createStepClock();
 *   clock.begin();
 *   for (let i = 0; i < 60; i++) { await clock.step(); readMidValues(); }
 *   clock.end();
 *
 * 本文件为 Air 原创（上游 cocos4 无同名文件）。
 */

import { game, director, Director } from '../cocos/game';

/** @en Single stepped frame receipt. @zh 一次手动步进的回执。 */
export interface AirStepFrame {
    /** 步进序号（本次 begin() 起）。 */
    step: number;
    /** 本帧 dt（秒）。 */
    dt: number;
    /** AFTER_DRAW 已触发（画面已提交）。 */
    afterDraw: true;
}

/** @en Deterministic single-clock test driver. @zh 确定性单时钟测试驱动句柄。 */
export interface AirStepClock {
    /** 进入手动步进（暂停真实时钟；幂等）。 */
    begin(): void;
    /**
     * @en Advance exactly one frame with the given dt (default 1/frameRate) and wait for
     * its AFTER_DRAW. Throws if the real clock is running (dual-clock guard).
     * @zh 以给定 dt（默认 1/frameRate）精确步进一帧并等待其 AFTER_DRAW。
     * 真实时钟未暂停时抛错（禁止双时钟并发）。
     */
    step(dt?: number): Promise<AirStepFrame>;
    /** 退出手动步进，恢复真实时钟（幂等）。 */
    end(): void;
    readonly stepping: boolean;
    readonly stepped: number;
}

/** @en Options for [[createStepClock]]. @zh 步进时钟选项。 */
export interface AirStepClockOptions {
    /** 默认帧率（默认 60，步进 dt 缺省值 = 1/frameRate）。 */
    frameRate?: number;
    /** 单步 AFTER_DRAW 等待超时毫秒（默认 2000；超时抛错而非静默成功）。 */
    stepTimeoutMs?: number;
}

/**
 * @en Create a deterministic single-clock test driver bound to the running game.
 * @zh 创建绑定当前 game 的确定性单时钟测试驱动。
 */
export function createStepClock (options: AirStepClockOptions = {}): AirStepClock {
    const frameRate = options.frameRate ?? 60;
    const stepTimeoutMs = options.stepTimeoutMs ?? 2000;
    let stepping = false;
    let stepped = 0;

    function assertPaused (): void {
        const paused = (game as unknown as { _paused?: boolean })._paused;
        if (paused !== true) {
            throw new Error(
                '[cocosair] step(): real clock is running — call begin() (game.pause()) first.'
                + ' Running rAF and manual stepping at the same time is forbidden (dual clock).');
        }
    }

    return {
        get stepping () { return stepping; },
        get stepped () { return stepped; },
        begin (): void {
            if (stepping) { return; }
            game.pause();
            stepping = true;
        },
        step (dt: number = 1 / frameRate): Promise<AirStepFrame> {
            assertPaused();
            const index = stepped + 1;
            return new Promise<AirStepFrame>((resolve, reject) => {
                const timer = setTimeout(() => {
                    director.off(Director.EVENT_AFTER_DRAW, onDraw);
                    reject(new Error(`[cocosair] step(): no AFTER_DRAW within ${stepTimeoutMs}ms`));
                }, stepTimeoutMs);
                function onDraw (): void {
                    director.off(Director.EVENT_AFTER_DRAW, onDraw);
                    clearTimeout(timer);
                    stepped = index;
                    resolve({ step: index, dt, afterDraw: true });
                }
                director.on(Director.EVENT_AFTER_DRAW, onDraw);
                director.tick(dt);
            });
        },
        end (): void {
            if (!stepping) { return; }
            stepping = false;
            game.resume();
        },
    };
}
