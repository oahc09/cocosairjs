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
import { attachContextHealth } from './context-health';

export type { AirApp, AirAppOptions } from './app';

/**
 * DOM 结构与官方 Web 模板保持一致。自定义 canvas 必须在 import 前经
 * globalThis.__CC_CANVAS__ 绑定；不会改写调用方的 canvas ID。
 * 若用户的 canvas 已按模板挂载，则不做任何改动。
 *
 * W04 画布绑定合同（Code First 与 Web 可靠性任务清单）：
 * - PAL 输入源（keyboard/mouse/touch）与 screen-adapter 在**引擎 import 时**按
 *   `#GameCanvas` 或 `globalThis.__CC_CANVAS__`（元素引用，优先）解析画布——自定义 id
 *   画布必须在 import 前设置 `__CC_CANVAS__`（静态页用内联脚本，或动态 import 前赋值）。
 * - 页面已有**另一个** `#GameCanvas` 元素时（会静默错绑输入），显式抛错而非绑定错误元素。
 * - 画布默认 `tabIndex=0`（可聚焦；PAL 在 mousedown/touchstart 时自动 focus），
 *   键盘事件仅在画布聚焦时到达——焦点合同见 docs/manual/script-component-workflow.md。
 */
function ensureCanvasDOM (canvas: HTMLCanvasElement): void {
    if (canvas.id !== 'GameCanvas') {
        const decoy = document.getElementById('GameCanvas');
        if (decoy && decoy !== canvas) {
            throw new Error(
                '[cocosair] createAirApp: page already contains another element with id "GameCanvas"'
                + ` (found <${decoy.tagName.toLowerCase()}>), and the passed canvas has id "${canvas.id}".`
                + ' Engine input binds by that id — rename/remove the other element, or pass it as the canvas.');
        }
        // Input and screen-adapter bind during engine import. Renaming here would
        // silently leave input attached to a different element (or to nothing).
        if ((globalThis as { __CC_CANVAS__?: unknown }).__CC_CANVAS__ !== canvas) {
            throw new Error('[cocosair] custom canvas must be assigned to globalThis.__CC_CANVAS__ before importing the engine');
        }
    }
    // 焦点合同：可聚焦（PAL 的 mousedown/touchstart 回调会 canvas.focus()）；用户显式设置的 tabIndex 不改写。
    if (canvas.tabIndex < 0) { canvas.tabIndex = 0; }
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
            '#Cocos3dGameContainer canvas { width: 100%; height: 100%; display: block; outline: none; }',
            '#Cocos3dGameContainer canvas:focus-visible { outline: 2px solid rgba(64,148,235,0.8); }',
        ].join('\n');
        document.head.appendChild(style);
    }
    // 画布绘图缓冲必须匹配窗口尺寸（屏幕适配器只在窗口变化时触发，初始尺寸需在此设定）。
    // W06（GAP-W6-1 修复，2026-09-28）：与 resize 链对齐——上游 screen-adapter 的 windowSize
    // 为 CSS×有效 DPR，而此处此前只写 CSS 像素，导致高 DPR 设备首帧半分辨率（直到首次窗口
    // 变化）。公式与 src/pal/screen-adapter/web/screen-adapter.js 的 devicePixelRatio getter
    // 同源（__CCDPR_CAP__ 上限，默认 2）；DPR=1 时数值与旧行为逐位一致（dpr=1 证据链不受影响）。
    const dprCapRaw = Number((globalThis as { __CCDPR_CAP__?: unknown }).__CCDPR_CAP__);
    const dprCap = Number.isFinite(dprCapRaw) && dprCapRaw > 0 ? dprCapRaw : 2;
    const effDpr = Math.min(window.devicePixelRatio ?? 1, dprCap);
    const bufW = Math.round(window.innerWidth * effDpr);
    const bufH = Math.round(window.innerHeight * effDpr);
    if (canvas.width !== bufW || canvas.height !== bufH) {
        canvas.width = bufW;
        canvas.height = bufH;
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

    // W01：上下文健康状态机（在引擎 init 前挂接，早于 swapchain 自身的 lost 告警监听）。
    const contextHealth = attachContextHealth(canvas, options.contextLoss);

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

    return new AirAppImpl(canvas, contextHealth);
}
