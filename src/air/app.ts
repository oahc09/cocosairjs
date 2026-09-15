/**
 * Cocos AIR — Agent-first Interactive Runtime.
 *
 * AirApp: 轻量运行时句柄。保持极薄：只负责启动引擎主循环与运行场景。
 * V0.2 正式化（计划书 §6）：canvas 支持 selector 字符串；新增 getScene()。
 * 不承担：资源系统抽象 / Scene DSL / Renderer 配置框架 / Plugin 管理。
 */

import { game, director } from '../cocos/game';
import { Scene } from '../cocos/scene-graph/scene';

export interface AirAppOptions {
    /** canvas 元素，或 CSS selector 字符串（如 '#game'）。 */
    canvas: HTMLCanvasElement | string;
    /** 可选：强制渲染模式（3 = HEADLESS，供测试/无头环境使用）。 */
    renderMode?: number;
}

export interface AirApp {
    /** @en The canvas this app renders into. @zh 本应用渲染目标画布（构造时传入）。 */
    readonly canvas: HTMLCanvasElement;
    /** @en Run the given scene and start the main loop. @zh 运行场景并启动主循环（幂等）。 */
    run(scene: Scene): void;
    /** @en Current running scene, or null before run(). @zh 当前运行中的场景；run() 之前为 null。 */
    getScene(): Scene | null;
}

/**
 * @en Internal implementation of [[AirApp]].
 * @zh [[AirApp]] 的内部实现；对外不暴露。
 */
export class AirAppImpl implements AirApp {
    private _started = false;

    constructor (readonly canvas: HTMLCanvasElement) {
    }

    /**
     * @en Run the given scene and start the main loop (idempotent for the loop).
     * @zh 运行传入的场景并启动主循环（主循环只启动一次）。
     */
    run (scene: Scene): void {
        director.runSceneImmediate(scene);
        if (!this._started) {
            this._started = true;
            game.run();
        }
    }

    /**
     * @en Current running scene, or null before run().
     * @zh 当前运行中的场景；run() 之前为 null。
     */
    getScene (): Scene | null {
        return director.getScene();
    }
}
