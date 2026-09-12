/**
 * Cocos AIR — Agent-first Interactive Runtime.
 *
 * AirApp: 轻量运行时句柄。V0.1 保持极薄：只负责启动引擎主循环与运行场景。
 */

import { game, director } from '../cocos/game';
import { Scene } from '../cocos/scene-graph/scene';

export interface AirAppOptions {
    canvas: HTMLCanvasElement;
    /** 可选：强制渲染模式（3 = HEADLESS，供测试/无头环境使用）。 */
    renderMode?: number;
}

export interface AirApp {
    run(scene: Scene): void;
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
}
