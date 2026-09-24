/**
 * Cocos AIR — 交付期 3D 物理后端选择（V1.2 owner 批复 #8(a) = D12，additive API）。
 *
 * 官方 physics-selector 的语义是「初始化前最后注册的后端胜出」。Air 把 builtin 与 cannon
 * 两个后端同时编入默认 bundle（AIR_FEATURES，r46 起），模块求值顺序决定谁的 register 最后执行，
 * 因此 createAirApp 必须在 game.init（PhysicsSystem 于 DirectorEvent.INIIT 构造）之前
 * 显式重注册用户选择的后端，使默认行为不受模块顺序影响。
 *
 * 本文件为 Air 原创（上游 cocos4 无同名文件），登记于 docs/upstream-file-map.json（Air 新增行）。
 */

import { builtinResMgr } from '../cocos/asset/asset-manager';
import { selector } from '../cocos/physics/framework/physics-selector';
import { PhysicsMaterial } from '../cocos/physics/framework/assets/physics-material';

/**
 * @en Air-level physics backend id. @zh Air 层物理后端标识（交付期可选项）。
 * - `'builtin'`：官方内置离散碰撞检测器（非完整模拟器，零外部依赖）。
 * - `'cannon'`：cannon.js 全量刚体模拟（纯 JS，来自 vendored `@cocos/cannon`）。
 */
export type AirPhysicsBackend = 'builtin' | 'cannon';

const ENGINE_ID: Record<AirPhysicsBackend, string> = {
    builtin: 'builtin',
    cannon: 'cannon.js',
};

function backendRegistry (): Record<string, unknown> {
    return selector.backend as unknown as Record<string, unknown>;
}

/**
 * @en Select the 3D physics backend before engine initialization. Must be called before
 * `game.init()` (Air does this inside [[createAirApp]]); after the physics world exists
 * the official `switchTo` is editor-only, so late selection is rejected instead of ignored.
 * @zh 在引擎初始化前选择 3D 物理后端。必须在 `game.init()` 之前调用（createAirApp 内部已保证）；
 * 物理世界创建后官方 `switchTo` 仅编辑器面放行，此处显式报错而非静默忽略。
 *
 * @throws 当请求的后端不在当前 bundle（未编入对应 feature）时；当选得过晚（物理世界已创建）时。
 */
export function selectPhysicsBackend (backend: AirPhysicsBackend): void {
    const engineId = ENGINE_ID[backend];
    const registry = backendRegistry();
    const wrapper = registry[engineId];
    if (!wrapper) {
        if (Object.keys(registry).length === 0) {
            // 源码消费图（src/index.ts）/ 测试环境不引任何物理 feature：保持既有
            // PHYSICS_NONE 行为（引擎对该空态本就容忍），仅提示，不抛错。
            console.warn('[cocosair] no physics backend registered in this module graph;'
                + ' running with physics disabled (PHYSICS_NONE).');
            return;
        }
        const registered = Object.keys(registry);
        throw new Error(
            `[cocosair] physics backend '${backend}' is not in this bundle.`
            + ` Registered backends: ${registered.length ? registered.join(', ') : '(none)'}.`);
    }
    if (selector.physicsWorld) {
        throw new Error(
            '[cocosair] physics backend must be selected via createAirApp({ physics }) '
            + 'before the physics world is created; late selection is not supported.');
    }
    // 官方语义：初始化前最后一次 register 胜出（同时同步 CC_PHYSICS_* legacy 宏）。
    selector.register(engineId, wrapper as never);
    seedDefaultPhysicsMaterial();
}

/**
 * Code First 无 Creator 资产包，`PhysicsSystem.initDefaultMaterial` 取不到
 * 'default-physics-material' 时只打 errorID(9642) 并把 _material 留空 —— 对 builtin 是良性日志，
 * 对 cannon 是致命的（cannon-shape.setMaterial 读取材质字段崩溃）。这里在引擎初始化前
 * 预置一个官方同名的默认材质，走引擎原生 setDefaultPhysicsMaterial 链路，零引擎改动。
 */
function seedDefaultPhysicsMaterial (): void {
    if (builtinResMgr.get<PhysicsMaterial>('default-physics-material')) return;
    const material = new PhysicsMaterial();
    material.name = 'default-physics-material';
    builtinResMgr.addAsset('default-physics-material', material);
}
