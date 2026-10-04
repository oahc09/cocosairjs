/**
 * PG-12 平台跳跃配方契约——单一事实源（fixture 页面、浏览器 runner、Jest 回归共用）。
 *
 * 数值即配方本身（不是通用物理建议）：
 *  - FIXED_DT = 1/60：显式 PhysicsSystem2D.step(FIXED_DT) 的固定步长；
 *    渲染帧由 createStepClock 驱动（autoSimulation=false，director.tick 不推进 2D 物理）；
 *  - GRAVITY_Y = -640：Recipe 显式设置的重力（px/s²）；
 *  - MOVE_SPEED = 90 px/s：地面/空中水平目标速度；
 *  - JUMP_VELOCITY = 260 px/s：grounded 时的起跳速度（跳高 ≈ 260²/(2×640) ≈ 52.8px）；
 *  - 摩擦 µ=0.2（ground collider.friction），无 linearDamping：松键靠接地摩擦减速
 *    （空中无衰减）；这些是配方范围声明，非 1:1 原作复刻（原作材料缺失）。
 *
 * 单向平台规则：PRE_SOLVE 回调里玩家上升（linearVelocity.y > 0）时 contact.disabledOnce = true；
 * 下降（vy ≤ 0）时不禁用 → 从上可落、从下可穿。
 */

export const FIXED_DT = 1 / 60;
export const GRAVITY_Y = -640;
export const MOVE_SPEED = 90;
export const JUMP_VELOCITY = 260;
export const GROUND_FRICTION = 0.2;

/** @en Tile ids in platformer.tsx (GID = firstgid + local id = 1 + id). @zh platformer.tsx 的本地 id（GID = 1 + id）。 */
export const TILE_GID_STONE = 1;   // solid, friction 0.2
export const TILE_GID_PLANK = 2;   // one-way platform

/** @en TMX structural expectations the fixture and tests rely on. @zh 夹具与测试依赖的 TMX 结构断言。 */
export const TMX_CONTRACT = {
    layerName: 'level',
    width: 20,
    height: 12,
    tileWidth: 16,
    tileHeight: 16,
    /** 底部一行全为 stone（GID 1）。 */
    groundRows: [11],
    /** 单向平台（GID 2）在 row 8、x 5..7。 */
    oneWayRow: 8,
    oneWayCols: [5, 6, 7],
    /** 左右墙列 col 0 / col 19（GID 1）。 */
    wallCols: [0, 19],
} as const;

/** @en Classify a horizontal-velocity series: ground friction decays, air keeps constant. @zh 判定水平速度序列：接地摩擦衰减 vs 空中恒定。 */
export function classifyVelocitySeries (series: readonly number[], moveSpeed: number): {
    startAbs: number; endAbs: number; decayedToHalf: boolean; maxDrift: number; verdict: 'decayed' | 'constant' | 'unknown';
} {
    if (series.length < 2) return { startAbs: NaN, endAbs: NaN, decayedToHalf: false, maxDrift: 0, verdict: 'unknown' };
    const abs = series.map((v) => Math.abs(v));
    const startAbs = abs[0]!;
    const endAbs = abs[abs.length - 1]!;
    let maxDrift = 0;
    for (let i = 1; i < abs.length; i += 1) {
        maxDrift = Math.max(maxDrift, Math.abs(abs[i]! - abs[i - 1]!));
    }
    const decayedToHalf = startAbs > moveSpeed / 4 && endAbs <= startAbs / 2;
    const constant = Math.abs(endAbs - startAbs) <= 1 && maxDrift <= 1;
    const verdict = decayedToHalf ? 'decayed' : constant ? 'constant' : 'unknown';
    return { startAbs, endAbs, decayedToHalf, maxDrift, verdict };
}

/** @en One-way platform PRE_SOLVE rule: disable the contact while the player moves upward. @zh 单向平台 PRE_SOLVE 规则：玩家上升时禁用该接触。 */
export function oneWayShouldDisable (playerVy: number): boolean {
    return playerVy > 1e-3; // Ignore solver round-off while standing; units are px/s.
}
