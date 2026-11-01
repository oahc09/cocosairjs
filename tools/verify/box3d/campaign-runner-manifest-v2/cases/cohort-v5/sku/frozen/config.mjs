import { compoundBounds, rotate } from './stations.mjs';
const finiteVector = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite);
const requireValue = (ok, message) => {
    if (!ok) throw new Error(`EX09 configuration rejected: ${message}`);
};
/** Validate before creating any engine objects. Never scale geometry or change mass to make a config fit. */
export function validateWorkshopConfig(config, layouts) {
    requireValue(
        config.schemaVersion === 1 && typeof config.configVersion === 'string' && !!config.configVersion,
        'unsupported/missing version',
    );
    const demand = {},
        limit = config.machine.limits;
    for (const [skuId, sku] of Object.entries(config.skus)) {
        requireValue(
            Number.isFinite(sku.massKg) && sku.massKg >= limit.itemMassRange[0] && sku.massKg <= limit.itemMassRange[1],
            `${skuId} mass outside supported range`,
        );
        requireValue(Number.isInteger(sku.inventory) && sku.inventory > 0, `${skuId} inventory`);
        requireValue(
            Array.isArray(sku.shapes) && sku.shapes.length > 0 && sku.shapes.length <= limit.itemPrimitiveMax,
            `${skuId} primitive count`,
        );
        for (const shape of sku.shapes) {
            requireValue(finiteVector(shape.center, 3), `${skuId} shape center`);
            if (shape.type === 'box')
                requireValue(finiteVector(shape.size, 3) && shape.size.every((x) => x > 0), `${skuId} box dimensions`);
            else if (shape.type === 'capsule')
                requireValue(
                    shape.axis === 'Y' &&
                        Number.isFinite(shape.radius) &&
                        shape.radius > 0 &&
                        Number.isFinite(shape.cylinderHeight) &&
                        shape.cylinderHeight > 0,
                    `${skuId} capsule dimensions`,
                );
            else throw new Error(`EX09 configuration rejected: unsupported ${shape.type}`);
        }
        const bounds = compoundBounds(sku.shapes, {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
        });
        const extents = bounds.max.map((x, i) => x - bounds.min[i]);
        requireValue(
            extents.every((x) => x <= limit.itemAxisExtentMax + 1e-12),
            `${skuId} full extent exceeds machine capacity`,
        );
        requireValue(
            config.machine.receiver.planeY - config.machine.receiver.floorTopY >= Math.hypot(...extents) + 0.1,
            `${skuId} receiver full-crossing clearance`,
        );
        requireValue(finiteVector(sku.attachmentPoint, 3), `${skuId} attachment point`);
        demand[skuId] = 0;
    }
    const orderIds = new Set();
    for (const order of config.orders) {
        requireValue(typeof order.id === 'string' && !orderIds.has(order.id), 'duplicate order identity');
        orderIds.add(order.id);
        requireValue(
            Array.isArray(order.skus) && order.skus.length === 2,
            'orders require exactly two unique instances',
        );
        let mass = 0;
        for (const id of order.skus) {
            requireValue(id in config.skus, `unknown SKU ${id}`);
            demand[id]++;
            mass += config.skus[id].massKg;
        }
        requireValue(
            Number.isFinite(order.massKg) && Math.abs(mass - order.massKg) < 1e-9,
            `order ${order.id} mass mismatch`,
        );
    }
    for (const id of Object.keys(demand))
        requireValue(demand[id] <= config.skus[id].inventory, `insufficient ${id} inventory`);
    const inventory = Object.values(config.skus).reduce((sum, s) => sum + s.inventory, 0);
    requireValue(inventory <= limit.configuredInventoryMax, 'too many inventory bodies');
    const j = config.judgement;
    requireValue(j.fixedHz === 60 && j.solverSubSteps === 4, 'unsupported workshop fixed-clock contract');
    for (const key of [
        'roundTicks',
        'scaleStableTicks',
        'packingStableTicks',
        'shippingTimeoutTicks',
        'recoveryPenaltyTicks',
    ])
        requireValue(Number.isSafeInteger(j[key]) && j[key] > 0, `invalid ${key}`);
    for (const layout of layouts.layouts) {
        const ids = new Set(),
            counts = {};
        requireValue(layout.items.length === inventory, `${layout.id} inventory count`);
        for (const item of layout.items) {
            requireValue(
                item.skuId in config.skus && !ids.has(item.itemId),
                `${layout.id} invalid/duplicate item identity`,
            );
            ids.add(item.itemId);
            requireValue(
                finiteVector(item.position, 3) &&
                    Number.isFinite(item.yawDegrees) &&
                    Number.isSafeInteger(item.itemGeneration) &&
                    item.itemGeneration > 0,
                `${item.itemId} initial pose/generation`,
            );
            counts[item.skuId] = (counts[item.skuId] || 0) + 1;
            const half = (item.yawDegrees * Math.PI) / 360;
            const point = rotate(config.skus[item.skuId].attachmentPoint, {
                x: 0,
                y: Math.sin(half),
                z: 0,
                w: Math.cos(half),
            }).map((x, i) => x + item.position[i]);
            requireValue(
                point.every(
                    (x, i) =>
                        x >= config.machine.magnet.positionMin[i] - 1e-9 &&
                        x <= config.machine.magnet.positionMax[i] + 1e-9,
                ),
                `${item.itemId} unreachable attachment`,
            );
        }
        for (const id of Object.keys(config.skus))
            requireValue(counts[id] === config.skus[id].inventory, `${layout.id} ${id} stock count`);
    }
    return true;
}
