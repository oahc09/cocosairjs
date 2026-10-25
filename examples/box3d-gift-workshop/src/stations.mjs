import { finiteOrderedBounds } from './submission-chute-preflight.mjs';
/** Pure business predicates. Inputs are observations, never commands that mutate physics. */
export function rotate(v, q) {
    const [x, y, z] = v;
    const tx = 2 * (q.y * z - q.z * y),
        ty = 2 * (q.z * x - q.x * z),
        tz = 2 * (q.x * y - q.y * x);
    return [x + q.w * tx + q.y * tz - q.z * ty, y + q.w * ty + q.z * tx - q.x * tz, z + q.w * tz + q.x * ty - q.y * tx];
}
export function compoundBounds(shapes, motion) {
    const min = [Infinity, Infinity, Infinity],
        max = [-Infinity, -Infinity, -Infinity];
    for (const shape of shapes) {
        const center = rotate(shape.center, motion.rotation).map(
            (v, i) => v + [motion.position.x, motion.position.y, motion.position.z][i],
        );
        let extent;
        if (shape.type === 'box') {
            const axes = [
                [1, 0, 0],
                [0, 1, 0],
                [0, 0, 1],
            ].map((v) => rotate(v, motion.rotation));
            extent = [0, 1, 2].map((i) =>
                axes.reduce((sum, axis, j) => sum + (Math.abs(axis[i]) * shape.size[j]) / 2, 0),
            );
        } else if (shape.type === 'capsule' && shape.axis === 'Y') {
            const axis = rotate([0, 1, 0], motion.rotation);
            extent = axis.map((v) => (Math.abs(v) * shape.cylinderHeight) / 2 + shape.radius);
        } else throw new Error('Unsupported workshop geometry; do not approximate silently.');
        for (let i = 0; i < 3; i++) {
            min[i] = Math.min(min[i], center[i] - extent[i]);
            max[i] = Math.max(max[i], center[i] + extent[i]);
        }
    }
    return { min, max };
}
export function containsXZ(bounds, zone, tolerance = 0.005) {
    return [0, 2].every((i) => bounds.min[i] >= zone.min[i] - tolerance && bounds.max[i] <= zone.max[i] + tolerance);
}
export function intersects(bounds, zone) {
    return [0, 1, 2].every((i) => bounds.max[i] >= zone.min[i] && bounds.min[i] <= zone.max[i]);
}
export function speed(vector) {
    return Math.hypot(vector.x, vector.y, vector.z);
}
export function receiptMatches(receipt, item, configVersion, roundGeneration) {
    return (
        !!receipt &&
        receipt.roundGeneration === roundGeneration &&
        receipt.itemId === item.itemId &&
        receipt.itemGeneration === item.itemGeneration &&
        receipt.skuId === item.skuId &&
        receipt.configVersion === configVersion &&
        Math.abs(receipt.measuredMass - item.motion.mass) <= 1e-8
    );
}
export class ScaleStation {
    constructor(config, roundGeneration, scope = 'diagnostic') {
        this.config = config;
        this.roundGeneration = roundGeneration;
        this.scope = scope;
        this.stableTicks = 0;
        this.identity = null;
        this.lastTick = 0;
        this.receipts = new Map();
        this.reason = '等待商品';
    }
    observe(tick, candidates, zone) {
        if (!Number.isSafeInteger(tick) || tick <= this.lastTick)
            throw new Error('Scale observations must advance once per completed fixed tick.');
        if (tick !== this.lastTick + 1) this.stableTicks = 0;
        this.lastTick = tick;
        const item = candidates[0],
            j = this.config.judgement;
        const identity = item && `${item.itemId}:${item.itemGeneration}`;
        let reason = candidates.length !== 1 ? (candidates.length ? '秤台只能放一件商品' : '等待商品') : null;
        if (
            !reason &&
            ![
                item.motion.mass,
                speed(item.motion.linearVelocity),
                speed(item.motion.angularVelocity),
                ...item.bounds.min,
                ...item.bounds.max,
            ].every(Number.isFinite)
        )
            reason = '物理观测含非有限值';
        if (!reason && (item.held || !item.motion.enabled || item.motion.type !== 2 || item.motion.massPending))
            reason = '商品必须为未持有的有效动态刚体';
        if (!reason && !containsXZ(item.bounds, zone, j.fullGeometryContainmentToleranceM))
            reason = '完整商品外形尚未进入秤台';
        if (!reason && (!item.directSupport || Math.abs(item.bounds.min[1] - zone.min[1]) > 0.015))
            reason = '缺少秤面真实支承接触';
        if (
            !reason &&
            (speed(item.motion.linearVelocity) > j.linearSpeedMax ||
                speed(item.motion.angularVelocity) > j.angularSpeedMax)
        )
            reason = '等待商品停止滑动或转动';
        if (!reason && Math.abs(item.motion.mass - this.config.skus[item.skuId].massKg) > j.scaleMassToleranceKg)
            reason = '当前刚体质量与商品配置不符';
        if (reason) {
            this.stableTicks = 0;
            this.identity = null;
            this.reason = reason;
            return null;
        }
        if (identity !== this.identity) this.stableTicks = 0;
        this.identity = identity;
        this.stableTicks++;
        this.reason = `真实支承稳定 ${this.stableTicks}/${j.scaleStableTicks} tick`;
        if (this.stableTicks < j.scaleStableTicks || this.receipts.has(identity)) return null;
        const receipt = Object.freeze({
            roundGeneration: this.roundGeneration,
            itemId: item.itemId,
            itemGeneration: item.itemGeneration,
            skuId: item.skuId,
            measuredMass: item.motion.mass,
            configVersion: this.config.configVersion,
            scope: this.scope,
            weighTick: tick,
        });
        this.receipts.set(identity, receipt);
        this.reason = '称重核验通过（独立诊断，不计订单）';
        return receipt;
    }
}
/** Full-shape and identity prerequisites for the future packing integration, not a success shortcut. */
export function packingReason({ items, order, receipts, zone, doorAngle, held, config, roundGeneration }) {
    if (held) return '请先释放持有商品';
    if (!Number.isFinite(doorAngle)) return '底门实际角度尚未有效';
    if (Math.abs(doorAngle) > config.machine.packing.closedToleranceDegrees) return '底门尚未关闭';
    if (items.length !== order.skus.length) return '商品数量不符';
    if (
        items
            .map((i) => i.skuId)
            .sort()
            .join() !== [...order.skus].sort().join()
    )
        return '商品种类不符';
    for (const item of items) {
        if (
            !finiteOrderedBounds(item.bounds) ||
            !finiteOrderedBounds(zone) ||
            !containsXZ(item.bounds, zone, config.judgement.fullGeometryContainmentToleranceM) ||
            item.bounds.min[1] < zone.min[1] - 0.005 ||
            item.bounds.max[1] > zone.max[1] + 0.005
        )
            return '完整商品外形越出装箱仓';
        if (receipts.get(`${item.itemId}:${item.itemGeneration}`)?.scope !== 'formal')
            return '缺少当前实例的有效称重凭证';
        if (
            !receiptMatches(
                receipts.get(`${item.itemId}:${item.itemGeneration}`),
                item,
                config.configVersion,
                roundGeneration,
            )
        )
            return '缺少当前实例的有效称重凭证';
        if (
            item.held ||
            !item.motion.enabled ||
            item.motion.type !== 2 ||
            item.motion.massPending ||
            !item.supportedByDoorChain ||
            speed(item.motion.linearVelocity) > config.judgement.linearSpeedMax ||
            speed(item.motion.angularVelocity) > config.judgement.angularSpeedMax
        )
            return '商品尚未稳定受支承';
    }
    return Math.abs(items.reduce((s, i) => s + i.motion.mass, 0) - order.massKg) > config.judgement.orderMassToleranceKg
        ? '总质量不符'
        : null;
}
