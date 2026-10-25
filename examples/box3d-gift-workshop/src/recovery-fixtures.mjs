/** Explicit original abnormal setups, applied only during scene construction.
 * No business state, certificate, clock, or runtime body access exists here. */
const freeze = (x) => {
    if (x && typeof x === 'object') {
        Object.values(x).forEach(freeze);
        Object.freeze(x);
    }
    return x;
};
const vector = (x) => Array.isArray(x) && x.length === 3 && x.every(Number.isFinite);
export function selectRecoveryFixture(document, id, layout) {
    const correction = ['LIFE-A02-v2', 'LIFE-A15-v2'].includes(id);
    const originalId = correction ? id.slice(0, -3) : id;
    if (!['LIFE-A02', 'LIFE-A14', 'LIFE-A15'].includes(originalId))
        throw Error('Unsupported isolated recovery fixture');
    const f = document?.fixtures?.find((x) => x.id === originalId),
        s = f?.setup;
    if (
        document.fixtureVersion !== 'gift-workshop-abnormal-1' ||
        !s ||
        s.phase !== 'BEFORE_SCENE_CREATION_ONLY' ||
        s.runtimeMutationAllowed !== false ||
        s.parameterOverrides?.length !== 0 ||
        s.baseLayoutId !== layout.id
    )
        throw Error('Invalid recovery fixture setup boundary');
    if (layout.items.length !== 12 || new Set(layout.items.map((x) => x.itemId)).size !== 12)
        throw Error('Fixture requires twelve unique original items');
    const initial = structuredClone(layout),
        seen = new Set();
    for (const o of s.itemPlacementOverrides) {
        if (
            Object.keys(o).sort().join() !== 'itemId,position,yawDegrees' ||
            seen.has(o.itemId) ||
            !vector(o.position) ||
            !Number.isFinite(o.yawDegrees)
        )
            throw Error('Invalid fixture item override');
        const item = initial.items.find((x) => x.itemId === o.itemId);
        if (!item) throw Error('Fixture cannot add inventory');
        seen.add(o.itemId);
        item.position = [...o.position];
        item.yawDegrees = o.yawDegrees;
    }
    const ids = new Set();
    for (const b of s.staticBoxes) {
        if (
            !b.id ||
            ids.has(b.id) ||
            b.bodyType !== 'static' ||
            b.shape !== 'box' ||
            b.visible !== true ||
            !vector(b.center) ||
            !vector(b.size) ||
            b.size.some((v) => v <= 0)
        )
            throw Error('Invalid visible fixture solid');
        ids.add(b.id);
    }
    const targetCorrection = correction
        ? {
              version: `gift-workshop-${originalId.slice(5).toLowerCase()}-reachable-targets-2`,
              status: 'GEOMETRY_CANDIDATE_NOT_PLAYED',
              originalFixtureId: originalId,
              reason: 'Original public targets ask yaw0 while unchanged A1/B1 stock yaw270 is preserved by translation-only attachment. Correct target descriptions only; no runtime rotation or setup override.',
              publicPlacementTargets: structuredClone(f.publicPlacementTargets),
              ...(f.retryPlacementTargets ? { retryPlacementTargets: structuredClone(f.retryPlacementTargets) } : {}),
          }
        : null;
    if (targetCorrection) {
        if (layout.id !== 'REBUILD-LAYOUT-01') throw Error('Target correction requires original base layout');
        if (originalId === 'LIFE-A02' && s.itemPlacementOverrides.length)
            throw Error('A02-v2 must preserve original no-item-override setup');
        if (originalId === 'LIFE-A15') {
            const overrides = s.itemPlacementOverrides;
            if (
                overrides.length !== 1 ||
                overrides[0].itemId !== 'B4' ||
                overrides[0].yawDegrees !== 0 ||
                overrides[0].position.join(',') !== '2.02,0.68,0.325'
            )
                throw Error('A15-v2 must retain the original B4 obstruction initialization');
        }
        for (const targets of [targetCorrection.publicPlacementTargets, targetCorrection.retryPlacementTargets].filter(
            Boolean,
        )) {
            if (targets.length !== 2 || targets[0].itemId !== 'A1' || targets[1].itemId !== 'B1')
                throw Error('Target correction requires original A1/B1 target identities');
            for (const target of targets) {
                const item = initial.items.find((x) => x.itemId === target.itemId);
                if (item?.yawDegrees !== 270 || target.yawDegrees !== 0)
                    throw Error('Target correction/base yaw provenance changed');
                target.yawDegrees = 270;
            }
        }
    }
    return freeze({
        id,
        fixtureVersion: document.fixtureVersion,
        status: 'SETUP_ONLY_NOT_QUALIFIED',
        effectiveConfigVersion: correction
            ? `${s.effectiveConfigVersion}+reachable-targets-2`
            : s.effectiveConfigVersion,
        targetCorrection,
        baseLayout: structuredClone(layout),
        initialLayout: initial,
        staticBoxes: structuredClone(s.staticBoxes),
        original: structuredClone(f),
        evidenceBoundary:
            'Initialization is not a public input trace or a successful abnormal-case result; no receipts, ledger or clock are seeded.',
    });
}
