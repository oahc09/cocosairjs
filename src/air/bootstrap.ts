/**
 * Cocos AIR — Agent-first Interactive Runtime.
 *
 * bootstrap: Code First 引擎启动。脱离 Creator / Editor / .scene / Prefab，
 * 仅依赖一个 <canvas>。启动链路复用引擎标准 game.init 流程：
 *   Base(pal/sys/settings) → Infrastructure(gfx/screen/assetManager) → Subsystem → Game init。
 *
 * builtin 材质/效果来自 Air 附带的预编译资产包（builtin-assets/internal/），
 * 经引擎原生 loadBuiltinAssets 流程注册。
 */

import { game, Game } from '../cocos/game';
import { DebugMode } from '../cocos/core/platform/debug';
import { AirAppImpl } from './app';
import type { AirApp, AirAppOptions } from './app';
import { registerBuiltinAirAssets } from './builtin/register';

export type { AirApp, AirAppOptions } from './app';

/**
 * DOM 结构与官方 Web 模板保持一致，pal/screen-adapter 与 findCanvas 依赖这些 id。
 * 若用户的 canvas 已按模板挂载，则不做任何改动。
 */
function ensureCanvasDOM (canvas: HTMLCanvasElement): void {
    if (document.body && !canvas.parentElement) {
        const frame = document.createElement('div');
        frame.id = 'GameDiv';
        const container = document.createElement('div');
        container.id = 'Cocos3dGameContainer';
        frame.appendChild(container);
        container.appendChild(canvas);
        document.body.appendChild(frame);

        const style = document.createElement('style');
        style.textContent = [
            'html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }',
            '#GameDiv { width: 100%; height: 100%; position: relative; }',
            '#Cocos3dGameContainer { width: 100%; height: 100%; }',
            '#GameCanvas { width: 100%; height: 100%; display: block; outline: none; }',
        ].join('\n');
        document.head.appendChild(style);
    }
    if (!canvas.id) {
        canvas.id = 'GameCanvas';
    }
    // 画布绘图缓冲必须匹配窗口尺寸（屏幕适配器只在窗口变化时触发，初始尺寸需在此设定）
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
}

/**
 * @en Create a Cocos AIR application on the given canvas.
 * @zh 在指定 canvas 上创建 Cocos AIR 应用。
 *
 * @example
 * ```ts
 * import { createAirApp, Scene } from 'cocosair';
 *
 * const app = await createAirApp({ canvas: document.querySelector('#GameCanvas')! });
 * app.run(new Scene('Main'));
 * ```
 */
export async function createAirApp (options: AirAppOptions): Promise<AirApp> {
    const canvas = options.canvas;
    if (!canvas) {
        throw new Error('[cocosair] createAirApp requires a canvas.');
    }
    ensureCanvasDOM(canvas);

    // 注册引擎同源 builtin effects/materials（含 glsl1 降写，见 builtin/register.ts）
    game.on(Game.EVENT_POST_SUBSYSTEM_INIT, registerBuiltinAirAssets);

    // V0.1: 无远程 settings.json；默认走 legacy 渲染管线
    await game.init({
        debugMode: DebugMode.ERROR,
        settingsPath: '',
        overrideSettings: { rendering: { renderMode: options.renderMode } },
    });

    return new AirAppImpl(canvas);
}
