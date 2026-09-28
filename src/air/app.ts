/**
 * Cocos AIR — Agent-first Interactive Runtime.
 *
 * AirApp: 轻量运行时句柄。保持极薄：只负责启动引擎主循环与运行场景。
 * V0.2 正式化（计划书 §6）：canvas 支持 selector 字符串；新增 getScene()。
 * 不承担：资源系统抽象 / Scene DSL / Renderer 配置框架 / Plugin 管理。
 */

import { game, director } from '../cocos/game';
import { Scene } from '../cocos/scene-graph/scene';
import type { AirContextHealth, AirContextLossOptions } from './context-health';

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
 * 里程碑身份（V0.1/V0.2/…）由 git tag 与 `docs/v11-baseline.md` 承载，不写入此常量。
 */
export const AIR_VERSION = '1.0.0';

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
}

export interface AirApp {
    /** @en The canvas this app renders into. @zh 本应用渲染目标画布（构造时传入）。 */
    readonly canvas: HTMLCanvasElement;
    /**
     * @en Context-health state machine handle (W01). @zh 上下文健康状态机句柄：
     * snapshot() 轮询状态、onChange 订阅迁移、requestReload() 受控重载（仅 failed 态）。
     */
    readonly contextHealth: AirContextHealth;
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

    constructor (
        readonly canvas: HTMLCanvasElement,
        readonly contextHealth: AirContextHealth,
    ) {
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
