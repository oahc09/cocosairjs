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
import { selectPhysicsBackend } from './physics-backend';

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
    // ScreenAdapter 硬编码按 id 'GameCanvas' 查找画布：用户自定义 id（如 '#game'）需归一化，
    // 仅当文档中不存在真正的 #GameCanvas 时改写，避免与模板 DOM 冲突。
    if (canvas.id !== 'GameCanvas' && !document.getElementById('GameCanvas')) {
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
 * @zh 在指定 canvas 上创建 Cocos AIR 应用。canvas 支持元素或 CSS selector 字符串。
 *
 * @example
 * ```ts
 * import { createAirApp, Scene } from 'cocosair';
 *
 * const app = await createAirApp({ canvas: '#GameCanvas' }); // 或 canvas 元素
 * app.run(new Scene('Main'));
 * app.getScene(); // → Scene | null
 * ```
 */
export async function createAirApp (options: AirAppOptions): Promise<AirApp> {
    let canvas = options.canvas;
    if (typeof canvas === 'string') {
        const el = document.querySelector(canvas);
        if (!(el instanceof HTMLCanvasElement)) {
            throw new Error(`[cocosair] createAirApp: selector '${canvas}' did not match a <canvas> element.`);
        }
        canvas = el;
    }
    if (!canvas) {
        throw new Error('[cocosair] createAirApp requires a canvas.');
    }
    ensureCanvasDOM(canvas);

    // 3D 物理后端选择（r46，#8(a)）：官方两个 instantiate 在模块求值期向
    // Game.EVENT_PRE_SUBSYSTEM_INIT 各挂一个 register 监听器（builtin 先、cannon 后，
    // 故模块序默认会让 cannon 胜出）。本监听器在两个之后注册 ⇒ 同事件内最后执行，
    // 用户后端确定性胜出；世界在该事件之后的子系统初始化期才创建，时序安全。
    game.once(Game.EVENT_PRE_SUBSYSTEM_INIT, () => selectPhysicsBackend(options.physics ?? 'builtin'));

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
