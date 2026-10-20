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
import { AirAppImpl, AIR_VERSION, AIR_REVISION, AIR_BUILD_DATE, AIR_BUILD_NUMBER } from './app';
import type { AirApp, AirAppOptions } from './app';
import { registerBuiltinAirAssets } from './builtin/register';
import { selectPhysicsBackend } from './physics-backend';
import { loadBox2D3, selectPhysics2DBackend, disposeBox2D3 } from './physics-2d/box2d3';
import { attachContextHealth } from './context-health';
import { createAirDiagnostics } from './diagnostics';
import {
    requestAirApp,
    registerAirInitializer,
    AirNormalizedOptions,
    prepareAirContainer,
    validateAirScreenMode,
} from './app-config';
import { view } from '../cocos/ui/view';
import { screenAdapter } from 'pal/screen-adapter';
import { settings, SettingsCategory } from '../cocos/core/settings';
import '../exports/gfx-webgpu';
import { configureWebGPUAssets } from '../cocos/gfx/webgpu/instantiated';
import { deviceManager } from '../cocos/gfx/device-manager';
import { VERSION } from '../cocos/core/global-exports';

export type { AirApp, AirAppOptions } from './app';

/** Prepare native wrappers and first-frame dimensions before the explicit PAL bind. */
function ensureCanvasDOM(canvas: HTMLCanvasElement, options: AirNormalizedOptions): void {
    const hostFrame = prepareAirContainer(options);
    // 焦点合同：可聚焦（PAL 的 mousedown/touchstart 回调会 canvas.focus()）；用户显式设置的 tabIndex 不改写。
    if (canvas.tabIndex < 0) {
        canvas.tabIndex = 0;
    }
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
    const bufW = Math.round((hostFrame?.clientWidth ?? window.innerWidth) * effDpr);
    const bufH = Math.round((hostFrame?.clientHeight ?? window.innerHeight) * effDpr);
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
export function createAirApp(options: AirAppOptions): Promise<AirApp> {
    return requestAirApp(options, () => initializeAirApp);
}

async function initializeAirApp(options: AirNormalizedOptions): Promise<AirApp> {
    const canvas = options.canvas;
    if (options.physics2D === 'box2d-v3-wasm')
        await loadBox2D3({ assetBaseUrl: options.box2d3AssetBaseUrl, subStepCount: options.box2d3SubStepCount });
    if (options.renderer === 'webgpu') configureWebGPUAssets(options.webgpuAssetBaseUrl);
    const exactFit = settings.querySettings(SettingsCategory.SCREEN, 'exactFitScreen');
    validateAirScreenMode(options.screenMode, exactFit);
    ensureCanvasDOM(canvas, options);
    (screenAdapter as unknown as { bindCanvas: () => void }).bindCanvas();

    // W01：上下文健康状态机（在引擎 init 前挂接，早于 swapchain 自身的 lost 告警监听）。
    const contextHealth = attachContextHealth(canvas, options.contextLoss);
    const diagnostics = createAirDiagnostics(options.diagnostics ?? 'errors');

    // 3D 物理后端选择（r46，#8(a)）：官方两个 instantiate 在模块求值期向
    // Game.EVENT_PRE_SUBSYSTEM_INIT 各挂一个 register 监听器（builtin 先、cannon 后，
    // 故模块序默认会让 cannon 胜出）。本监听器在两个之后注册 ⇒ 同事件内最后执行，
    // 用户后端确定性胜出；世界在该事件之后的子系统初始化期才创建，时序安全。
    const selectBackend = (): void => {
        selectPhysicsBackend(options.physics);
        if (options.physics2D === 'box2d-v3-wasm') selectPhysics2DBackend(options.physics2D);
    };
    game.once(Game.EVENT_PRE_SUBSYSTEM_INIT, selectBackend);

    // 注册引擎同源 builtin effects/materials（glsl3 适配，见 builtin/register.ts）
    game.once(Game.EVENT_POST_SUBSYSTEM_INIT, registerBuiltinAirAssets);

    // V0.1: 无远程 settings.json；默认走 legacy 渲染管线
    try {
        await game.init({
            debugMode: options.diagnostics === 'warnings' ? DebugMode.WARN : DebugMode.ERROR,
            settingsPath: '',
            overrideSettings: {
                rendering: { renderMode: options.renderMode },
                ...(options.screenMode !== undefined
                    ? { screen: { exactFitScreen: options.screenMode === 'window' } }
                    : {}),
            },
        });
        if (options.renderer === 'webgpu') {
            const device = deviceManager.gfxDevice as typeof deviceManager.gfxDevice & { nativeDevice: GPUDevice };
            contextHealth.watchWebGPUDevice(device.nativeDevice);
        }
        if (options.designResolution) {
            const { width, height, policy } = options.designResolution;
            view.setDesignResolutionSize(width, height, policy);
        }
    } catch (error) {
        disposeBox2D3();
        (screenAdapter as unknown as { destroyLayoutObserver?: () => void }).destroyLayoutObserver?.();
        contextHealth.destroy();
        diagnostics.destroy();
        throw error;
    } finally {
        game.off(Game.EVENT_PRE_SUBSYSTEM_INIT, selectBackend);
        game.off(Game.EVENT_POST_SUBSYSTEM_INIT, registerBuiltinAirAssets);
    }

    // Startup identity stays visible even when engine diagnostics only report errors.
    console.info(
        `[Cocos AIR] v${AIR_VERSION} (r${AIR_REVISION}) | Cocos Engine v${VERSION}` +
            ` | Build ${AIR_BUILD_DATE} #${AIR_BUILD_NUMBER}`,
    );
    return new AirAppImpl(canvas, contextHealth, diagnostics);
}

// Registration is engine-local; no canvas, wrapper or input listener is bound here.
registerAirInitializer(initializeAirApp);
