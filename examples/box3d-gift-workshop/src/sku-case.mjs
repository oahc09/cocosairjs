/** LIFE-A05 initialization only. No engine, live body, clock, receipt or ledger access. */
import { validateWorkshopConfig } from './config.mjs';
const requireCase = (ok) => {
    if (!ok) throw new Error('Invalid LIFE-A05 pre-scene case contract');
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const freeze = (value) => {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
};
export function resolveSkuCase({ config, layouts, document, layout, caseId, variantId }) {
    requireCase(caseId === 'LIFE-A05');
    const fixture = document?.fixtures?.find((entry) => entry.id === caseId);
    const setup = fixture?.setup;
    const variant = fixture?.variants?.find((entry) => entry.id === variantId);
    requireCase(
        document?.fixtureVersion === 'gift-workshop-abnormal-1' &&
            document.configVersion === config.configVersion &&
            setup?.phase === 'BEFORE_SCENE_CREATION_ONLY' &&
            setup.runtimeMutationAllowed === false &&
            setup.baseLayoutId === layout.id &&
            setup.effectiveConfigVersion === config.configVersion &&
            same(setup.itemPlacementOverrides, []) &&
            same(setup.parameterOverrides, []) &&
            same(setup.staticBoxes, []) &&
            variant?.orderId === 'O1' &&
            variant.expectedReason === 'SKU_MISMATCH',
    );
    validateWorkshopConfig(config, layouts);
    requireCase(config.skus.A.massKg === 0.35 && config.skus.B.massKg === 0.25 && config.skus.C.massKg === 0.6);
    const effective = structuredClone(config);
    if (variantId === 'default-wrong-pair') {
        requireCase(variant.configVersion === config.configVersion && same(variant.pair, ['A1', 'C1']));
    } else if (variantId === 'equal-mass-derived-theme') {
        requireCase(
            variant.phase === 'BEFORE_SCENE_CREATION_ONLY' &&
                variant.normalProfileEvidence === false &&
                variant.configVersion === `${config.configVersion}-equal-mass-1` &&
                same(variant.skuMassOverrides, { B: 0.35 }) &&
                same(variant.derivedOrderMassKg, { O1: 0.7, O2: 0.95, O3: 0.95 }) &&
                same(variant.pair, ['A1', 'A2']),
        );
        effective.configVersion = variant.configVersion;
        effective.themeId = `${config.themeId}-equal-mass-1`;
        effective.skus.B.massKg = variant.skuMassOverrides.B;
        for (const order of effective.orders) {
            const mass = order.skus.reduce((sum, sku) => sum + effective.skus[sku].massKg, 0);
            requireCase(Math.abs(mass - variant.derivedOrderMassKg[order.id]) < 1e-12);
            order.massKg = variant.derivedOrderMassKg[order.id];
        }
    } else requireCase(false);
    requireCase(
        layout.items.length === 12 && variant.pair.every((id) => layout.items.some((item) => item.itemId === id)),
    );
    validateWorkshopConfig(effective, layouts);
    return freeze({
        config: effective,
        selection: {
            version: 'ex09-sku-case-1',
            caseId,
            variantId,
            fixtureVersion: document.fixtureVersion,
            baseConfigVersion: config.configVersion,
            effectiveConfigVersion: effective.configVersion,
            phase: 'BEFORE_SCENE_CREATION_ONLY',
            status: 'SETUP_ONLY_NOT_QUALIFIED',
            normalProfileEvidence: false,
            layoutId: layout.id,
            original: structuredClone(fixture),
            selectedVariant: structuredClone(variant),
            evidenceBoundary:
                'No live mutation or seeded business state. Requires fresh physical weighing, explicit rejection, correction and terminal evidence; not an independent AG05 theme qualification.',
        },
    });
}
