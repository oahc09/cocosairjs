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
 * AirApp: 轻量运行时句柄。保持极薄：只负责启动引擎主循环与运行场景。
 * V0.2 正式化（计划书 §6）：canvas 支持 selector 字符串；新增 getScene()。
 * 不承担：资源系统抽象 / Scene DSL / Renderer 配置框架 / Plugin 管理。
 */

import { game, director } from '../cocos/game';
import { screenAdapter } from 'pal/screen-adapter';
import { Scene } from '../cocos/scene-graph/scene';
import type { AirContextHealth, AirContextLossOptions } from './context-health';
import type { AirDiagnostics, AirDiagnosticMode } from './diagnostics';
import { createSessionScope } from './session-scope';
import type { AirSessionScope, AirCleanupReceipt } from './session-scope';
import { airError, airBootstrapRegistry } from './app-config';
import { CCObject } from '../cocos/core/data/object';
import { releaseManager } from '../cocos/asset/asset-manager/release-manager';

export interface AirSceneReleaseReceipt extends AirCleanupReceipt {
    readonly scene: string | null;
    readonly retained: readonly string[];
    readonly measurements: Readonly<{ gpuMemory: 'unavailable'; reason: string }>;
}

/**
 * @en Cocos AIR runtime version. The single source of truth is the `version` field of
 * package.json; this literal must stay identical to it (locked by
 * `test/smoke/smoke-01-bootstrap.test.ts`, which fails on drift).
 * Note: `VERSION` is already taken by the upstream engine (`src/cocos/core/global-exports.ts`
 * exports the Cocos engine version as `VERSION`), and same-named `export *` members are
 * dropped silently by ESM — hence the `AIR_` prefix.
 * @zh Cocos AIR 运行时版本号。唯一来源是 package.json 的 `version` 字段，此字面量必须与之
 * 保持一致（由 `test/smoke/smoke-01-bootstrap.test.ts` 锁定，漂移即 RED）。
 * 注意：`VERSION` 已被上游引擎占用（`src/cocos/core/global-exports.ts` 以 `VERSION` 导出
 * Cocos 引擎版本），而 `export *` 的同名成员会被 ESM 静默丢弃，因此这里用 `AIR_` 前缀。
 * 里程碑身份（V0.1/V0.2/…）由 git tag 与提交历史承载，不写入此常量。
 */
export const AIR_VERSION = '1.0.0';

/**
 * @en Numeric AIR version with dots removed: 1.0.0 → 100, 1.0.1 → 101.
 * Keep this literal in sync with AIR_VERSION.
 * @zh AIR_VERSION 去掉点号后的数字版本：1.0.0 → 100，1.0.1 → 101。
 */
export const AIR_REVISION = 100;

/**
 * @en Build time in yyyyMMddHHmm, Asia/Shanghai, injected by the AIR build.
 * Direct source imports return 'unbuilt'. SOURCE_DATE_EPOCH can pin the time.
 * @zh 编译时间（北京时间 yyyyMMddHHmm），由 AIR 构建自动注入。源码为 'unbuilt'；
 * 可用 SOURCE_DATE_EPOCH（Unix 秒）固定时间。
 */
export const AIR_BUILD_DATE: string = 'unbuilt';

/**
 * @en Successful runtime compilation number, starting at 1. Source default is 1.
 * @zh 运行时编译序号，从 1 开始；每次成功输出 JS 后递增。源码默认值为 1。
 */
export const AIR_BUILD_NUMBER: number = 1;

export interface AirAppOptions {
    /** canvas 元素，或 CSS selector 字符串（如 '#game'）。 */
    canvas: HTMLCanvasElement | string;
    /** 可选：强制渲染模式（3 = HEADLESS，供测试/无头环境使用）。 */
    renderMode?: number;
    /**
     * 可选：交付期 3D 物理后端（V1.2 owner 批复 #8(a)，additive；默认 `'builtin'`）。
     * `'cannon'` 使用 cannon.js 全量刚体模拟（纯 JS，默认 bundle 已编入）；
     * `'builtin'` 为官方内置离散碰撞检测器（不模拟）。须在 createAirApp 内 game.init 前生效。
     */
    physics?: 'builtin' | 'cannon';
    /**
     * 可选：WebGL 上下文丢失状态机（W01）。lost 时默认自动 game.pause() 停止绘制与
     * 业务时钟；恢复路径如实现不能安全重建 GPU 资源，进入 failed 并提供受控重载。
     */
    contextLoss?: AirContextLossOptions;
    /** 原生日志与有界观察通道；默认 errors，warnings 显示并收集引擎警告。 */
    diagnostics?: AirDiagnosticMode;
    /** Effective browser DPR is min(devicePixelRatio, cap); configure before importing the engine. Default 2. */
    pixelRatioCap?: number;
    /** Explicit window fill or host-container layout; omitted preserves native screen settings. */
    screenMode?: 'window' | 'container';
    /** Existing canvas ancestor for container mode. Safe bootstrap creates native wrappers inside it. */
    container?: HTMLElement | string;
    /** Native ResolutionPolicy integer: 0 EXACT_FIT, 1 NO_BORDER, 2 SHOW_ALL, 3 FIXED_HEIGHT, 4 FIXED_WIDTH. */
    designResolution?: { width: number; height: number; policy: number };
}

export interface AirApp {
    /** @en The canvas this app renders into. @zh 本应用渲染目标画布（构造时传入）。 */
    readonly canvas: HTMLCanvasElement;
    /**
     * @en Context-health state machine handle (W01). @zh 上下文健康状态机句柄：
     * snapshot() 轮询状态、onChange 订阅迁移、requestReload() 受控重载（仅 failed 态）。
     */
    readonly contextHealth: AirContextHealth;
    /** Native diagnostic history (80 entries); optional for compatibility with older custom handles. */
    readonly diagnostics?: AirDiagnostics;
    /** @en Run the given scene and start the main loop. @zh 运行场景并启动主循环（幂等）。 */
    run(scene: Scene): void;
    /** @en Current running scene, or null before run(). @zh 当前运行中的场景；run() 之前为 null。 */
    getScene(): Scene | null;
    /** Active scene ownership scope. Optional for older custom AirApp handles. */
    readonly session?: AirSessionScope;
    releaseScene?(): Promise<AirSceneReleaseReceipt>;
    /** Terminates this handle. Same-document runtime reconstruction requires reload. */
    close?(): Promise<AirSceneReleaseReceipt>;
}

/**
 * @en Internal implementation of [[AirApp]].
 * @zh [[AirApp]] 的实现；此名字已发布，保留构造兼容，通常使用 createAirApp。
 */
export class AirAppImpl implements AirApp {
    private _started = false;
    private _scope = createSessionScope();
    private _release: Promise<AirSceneReleaseReceipt> | undefined;
    private _close: Promise<AirSceneReleaseReceipt> | undefined;
    private _releaseFailed = false;
    private _needsResume = false;
    get session (): AirSessionScope { return this._scope; }

    constructor (
        readonly canvas: HTMLCanvasElement,
        readonly contextHealth: AirContextHealth,
        readonly diagnostics?: AirDiagnostics,
    ) {
    }

    /**
     * @en Run the given scene and start the main loop (idempotent for the loop).
     * @zh 运行传入的场景并启动主循环（主循环只启动一次）。
     */
    run (scene: Scene): void {
        if (this._close) throw airError('AIR_E_APP_CLOSED', 'This app is closing or closed; reload before creating another app.');
        if (this._release) throw airError('AIR_E_SCENE_RELEASING', 'Await releaseScene before running another scene.');
        if (this._releaseFailed) throw airError('AIR_E_SCENE_RELEASE_FAILED', 'Cleanup failed; resolve ownership failures and reload.');
        if (!(scene instanceof Scene) || !scene.isValid) throw airError('AIR_E_SCENE', 'run requires a valid native Scene.');
        if (scene === this.getScene()) return;
        if (this.getScene() && this._scope.ownedCount) {
            throw airError('AIR_E_SCENE_RELEASE_REQUIRED', 'The current session owns cleanup callbacks; await releaseScene before replacement.');
        }
        // The first scene adopts resources prepared in the initial scope. Later
        // runs retire the preceding scene/released scope and start a generation.
        if (this._started || this._needsResume || this.getScene()) {
            this._scope.deactivate('replaced'); void this._scope.dispose();
            this._scope = createSessionScope();
        }
        this._scope.activate();
        director.runSceneImmediate(scene);
        if (!this._started) {
            this._started = true;
            game.run();
        } else if (this._needsResume) {
            game.resume();
        }
        this._needsResume = false;
    }

    /**
     * @en Current running scene, or null before run().
     * @zh 当前运行中的场景；run() 之前为 null。
     */
    getScene (): Scene | null {
        return director.getScene();
    }

    releaseScene (): Promise<AirSceneReleaseReceipt> {
        if (this._release) return this._release;
        const scene = this.getScene(), scope = this._scope;
        // Install the shared Promise before callbacks or destruction can reenter.
        this._release = Promise.resolve().then(async () => {
            const cleanup = scope.dispose();
            let retained: string[] = [], destructionFailure: string | undefined;
            try { retained = director._releaseSceneImmediate(); }
            catch (error) { destructionFailure = String(error); }
            const result = await cleanup;
            const pending = [...result.pending], failures = [...result.failures];
            try { releaseManager._flushAirReleaseQueue(); CCObject._deferredDestroy(); }
            catch (error) { failures.push({ label: 'native-asset-destruction', message: String(error) }); }
            if (destructionFailure) failures.push({ label: 'native-scene-destruction', message: destructionFailure });
            if (scene?.isValid) pending.push('native-scene-destruction');
            const status = pending.length || failures.length ? 'failed' as const : 'released' as const;
            this._releaseFailed = status === 'failed';
            return Object.freeze({ status, scene: scene?.uuid ?? null, completed: result.completed,
                pending: Object.freeze(pending), failures: Object.freeze(failures),
                retained: Object.freeze(['runtime', 'scheduler', 'builtin-resources', 'shared-asset-caches',
                    ...retained.map((id) => `persist-node:${id}`)]),
                measurements: Object.freeze({ gpuMemory: 'unavailable' as const,
                    reason: 'WebGL provides no portable complete GPU allocation measurement; scene destruction is not proof of zero leaks.' }) });
        }).then((receipt) => { this._release = undefined; return receipt; }, (error) => {
            this._release = undefined; this._releaseFailed = true; throw error;
        });
        scope.deactivate('release'); game.pause(); this._needsResume = true;
        return this._release!;
    }

    close (): Promise<AirSceneReleaseReceipt> {
        if (this._close) return this._close;
        (screenAdapter as unknown as { destroyLayoutObserver?: () => void }).destroyLayoutObserver?.();
        const registry = airBootstrapRegistry();
        if (registry.app === this) registry.status = 'closed';
        this._close = Promise.resolve().then(() => this.releaseScene()).then((receipt) => {
            this.contextHealth.destroy(); this.diagnostics?.destroy();
            return receipt;
        });
        this._scope.deactivate('close'); game.pause();
        return this._close;
    }
}
